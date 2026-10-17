// Tanıtım sayfasının 3B sahnesi (three.js). Ayrı parça olarak, sayfa açıldıktan sonra yüklenir (hero-map-canvas.tsx).
// Kalın Türkiye zemini (Natural Earth kıyısı), 973 ilçe noktası, OSRM'den gerçek karayolu güzergâhlarında gidip gelen tırlar
// ve canlı ilan teyidi (F1): yeşil = teyitli ilan, sarı = teyit bekliyor, gri = teyit gelmedi, listeden düştü.
import {
  Box3,
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShadowMaterial,
  SphereGeometry,
  Spherical,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS, project, type HeroMapData } from "./projection";

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  /** Etiket ve bilgi kutusunun ekleneceği kap (tuvalin üstünde, aynı boyutta) */
  host: HTMLElement;
  data: HeroMapData;
  reducedMotion: boolean;
  /** "drag": fareyle döndürme + üstüne gelince bilgi; "tap": dokunmatik, sayfa kaydırması engellenmez */
  input: "drag" | "tap";
  onNavigate: (path: string) => void;
  onReady: () => void;
  onError: () => void;
}

export interface HeroScene {
  setActive(active: boolean): void;
  /** Tema değişti: zemin, yol ve ışık renkleri globals.css'teki --map-* değişkenlerinden yeniden okunur */
  applyTheme(): void;
  dispose(): void;
}

const DEPTH = 0.3;
const BEVEL = 0.03;
const SURFACE = DEPTH + BEVEL;
/** Her zaman etiketi görünen iller (kalabalık kümelerde biri yeter) */
const LABELED = ["istanbul", "ankara", "izmir", "konya", "mersin"];
const PIN_COUNT = 18;

const easeOutBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function createScene(o: SceneOptions): HeroScene {
  const { canvas, host, data } = o;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const at = (lon: number, lat: number, h = 0) => {
    const [x, y] = project(lon, lat);
    return new Vector3(x, SURFACE + h, -y);
  };

  // Işık: gökyüzü/zemin dolgu + gölge veren güneş
  const fill = new HemisphereLight("#ffffff", "#b9c6da", 2.2);
  scene.add(fill);
  const sun = new DirectionalLight("#ffffff", 1.6);
  sun.position.set(-3, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0008;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 25 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // Zemin: Türkiye, kalınlığı olan bir levha; altında yumuşak gölge (havada duruyor gibi)
  const shapes = data.outline.map((ring) => new Shape(ring.map(([lon, lat]) => new Vector2(...project(lon, lat)))));
  const landGeo = new ExtrudeGeometry(shapes, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 1 });
  landGeo.rotateX(-Math.PI / 2);
  const landTop = new MeshStandardMaterial({ color: "#f5f7fb", roughness: 0.95 });
  const landSide = new MeshStandardMaterial({ color: COLORS.primary, roughness: 0.6 });
  const land = new Mesh(landGeo, [landTop, landSide]);
  land.castShadow = true;
  land.receiveShadow = true;
  scene.add(land);
  const bounds = new Box3().setFromObject(land);
  const center = bounds.getCenter(new Vector3());

  const groundMat = new ShadowMaterial({ opacity: 0.14 });
  const ground = new Mesh(new PlaneGeometry(60, 60), groundMat);
  ground.rotateX(-Math.PI / 2);
  ground.position.y = -BEVEL - 0.35;
  ground.receiveShadow = true;
  scene.add(ground);

  // 973 ilçe noktası (tek çizim çağrısı)
  const dotGeo = new CircleGeometry(0.02, 10).rotateX(-Math.PI / 2);
  const dotMat = new MeshBasicMaterial({ color: "#b4c1d4" });
  const dots = new InstancedMesh(dotGeo, dotMat, data.districts.length);
  const m = new Matrix4();
  data.districts.forEach(([lon, lat], i) => dots.setMatrixAt(i, m.makeTranslation(at(lon, lat, 0.002))));
  dots.instanceMatrix.needsUpdate = true;
  scene.add(dots);

  // Güzergâh illeri
  const hubGeo = new CircleGeometry(0.07, 24).rotateX(-Math.PI / 2);
  const hubMat = new MeshBasicMaterial({ color: COLORS.primary });
  const haloGeo = new RingGeometry(0.095, 0.125, 32).rotateX(-Math.PI / 2);
  const haloMat = new MeshBasicMaterial({ color: COLORS.primary, transparent: true, opacity: 0.18 });
  const hubs = new Map(data.hubs.map((h) => [h.slug, { ...h, pos: at(h.lon, h.lat, 0.004) }]));
  const hubMeshes: Mesh[] = [];
  for (const h of hubs.values()) {
    const dot = new Mesh(hubGeo, hubMat);
    dot.position.copy(h.pos);
    dot.userData = { hub: h.slug };
    const halo = new Mesh(haloGeo, haloMat);
    halo.position.copy(h.pos);
    scene.add(dot, halo);
    hubMeshes.push(dot);
  }

  // Yollar: gerçek karayolu geometrisi üzerinde ince tüp; görünmez kalın tüp fareyle seçmek için
  const roadMat = new MeshBasicMaterial({ color: COLORS.primary, transparent: true, opacity: 0.5 });
  const roadHot = new MeshBasicMaterial({ color: COLORS.accent });
  const pickMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const roads = data.routes.map((r) => {
    const curve = new CatmullRomCurve3(r.points.map(([lon, lat]) => at(lon, lat, 0.008)), false, "centripetal");
    const line = new Mesh(new TubeGeometry(curve, r.points.length * 6, 0.017, 6, false), roadMat);
    const pick = new Mesh(new TubeGeometry(curve, r.points.length * 2, 0.12, 4, false), pickMat);
    pick.userData = { route: r };
    scene.add(line, pick);
    return { ...r, curve, line, pick, length: curve.getLength() };
  });

  // Tırlar: dorse + turuncu çekici + tekerlekler
  const truckParts = {
    trailer: new BoxGeometry(0.17, 0.065, 0.062),
    cab: new BoxGeometry(0.055, 0.058, 0.06),
    glass: new BoxGeometry(0.012, 0.024, 0.052),
    wheel: new BoxGeometry(0.03, 0.03, 0.07),
  };
  const truckMats = {
    trailer: new MeshStandardMaterial({ color: COLORS.primary, roughness: 0.5 }),
    cab: new MeshStandardMaterial({ color: COLORS.accent, roughness: 0.45 }),
    glass: new MeshStandardMaterial({ color: "#0b1830", roughness: 0.2 }),
    wheel: new MeshStandardMaterial({ color: "#1f2937", roughness: 0.8 }),
  };
  const makeTruck = () => {
    const g = new Group();
    const part = (geo: BoxGeometry, mat: MeshStandardMaterial, x: number, y: number) => {
      const p = new Mesh(geo, mat);
      p.position.set(x, y, 0);
      p.castShadow = true;
      g.add(p);
    };
    part(truckParts.trailer, truckMats.trailer, -0.035, 0.058);
    part(truckParts.cab, truckMats.cab, 0.085, 0.05);
    part(truckParts.glass, truckMats.glass, 0.11, 0.06);
    for (const x of [-0.095, -0.06, 0.085]) part(truckParts.wheel, truckMats.wheel, x, 0.016);
    g.scale.setScalar(1.7);
    scene.add(g);
    return g;
  };
  const trucks = roads.map((road, i) => ({ road, mesh: makeTruck(), t: (i * 0.37) % 1, dir: i % 2 ? -1 : 1, speed: 0.32 + (i % 3) * 0.06, wait: 0 }));

  // Halka darbeleri (ilan teyidi ve teslim)
  const ringGeo = new RingGeometry(0.035, 0.05, 32).rotateX(-Math.PI / 2);
  const pulses: { mesh: Mesh; age: number; dur: number; max: number }[] = [];
  const pulse = (pos: Vector3, color: string, max = 4, dur = 1.3) => {
    const mesh = new Mesh(ringGeo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    mesh.position.copy(pos).setY(SURFACE + 0.006);
    scene.add(mesh);
    pulses.push({ mesh, age: 0, dur, max });
  };

  // İlan iğneleri: yeşil teyitli → (çoğu) araç bulur, turuncu parlayıp kapanır; (bazısı) sarı teyit bekliyor → gri, batar
  const stickGeo = new CylinderGeometry(0.006, 0.006, 0.12, 6);
  const headGeo = new SphereGeometry(0.032, 16, 12);
  type Pin = { g: Group; mat: MeshStandardMaterial; base: Vector3; age: number; life: number; fate: "taken" | "expire"; nextPulse: number };
  const pins: Pin[] = [];
  const used = new Set<number>();
  const spawn = (pin: Pin, age = 0) => {
    let i: number;
    do i = Math.floor(Math.random() * data.districts.length);
    while (used.has(i));
    used.add(i);
    pin.g.userData.district = i;
    const [lon, lat] = data.districts[i]!;
    pin.base = at(lon, lat);
    pin.g.position.copy(pin.base);
    pin.age = age;
    pin.life = 4 + Math.random() * 4.5;
    pin.fate = Math.random() < 0.3 ? "expire" : "taken";
    pin.nextPulse = 0.4;
    pin.mat.color.set(COLORS.confirmed);
    pin.g.scale.setScalar(1.6);
    pin.g.visible = true;
  };
  for (let k = 0; k < PIN_COUNT; k++) {
    const mat = new MeshStandardMaterial({ color: COLORS.confirmed, roughness: 0.35 });
    const g = new Group();
    const stick = new Mesh(stickGeo, mat);
    stick.position.y = 0.06;
    const head = new Mesh(headGeo, mat);
    head.position.y = 0.13;
    stick.castShadow = head.castShadow = true;
    g.add(stick, head);
    scene.add(g);
    const pin: Pin = { g, mat, base: new Vector3(), age: 0, life: 1, fate: "taken", nextPulse: 0 };
    pins.push(pin);
    spawn(pin, o.reducedMotion ? 1 : -k * 0.45); // sırayla belirsinler
  }
  // Hareket azaltılmışsa durağan bir an: çoğu teyitli, birkaçı sarı ve gri
  if (o.reducedMotion) {
    pins.slice(0, 3).forEach((p) => p.mat.color.set(COLORS.pending));
    pins.slice(3, 5).forEach((p) => p.mat.color.set(COLORS.expired));
  }

  const updatePin = (p: Pin, dt: number) => {
    p.age += dt;
    const free = () => {
      used.delete(p.g.userData.district as number);
      spawn(p);
    };
    if (p.age < 0) return void (p.g.visible = false);
    p.g.visible = true;
    let s = easeOutBack(clamp01(p.age / 0.35));
    let sink = 0;
    if (p.age < p.life) {
      if (p.age >= p.nextPulse) {
        pulse(p.base, COLORS.confirmed); // "hâlâ geçerli" cevabı
        p.nextPulse += 2.4;
      }
    } else if (p.fate === "taken") {
      const e = (p.age - p.life) / 0.45;
      p.mat.color.set(COLORS.accent);
      if (p.nextPulse !== Infinity) {
        pulse(p.base, COLORS.accent, 3, 0.8); // araç bulundu, ilan kapandı
        p.nextPulse = Infinity;
      }
      s = e < 0.3 ? 1 + e : Math.max(0, 1.3 * (1 - (e - 0.3) / 0.7));
      if (e >= 1) return free();
    } else {
      const e = p.age - p.life;
      p.mat.color.set(e < 1.8 ? COLORS.pending : COLORS.expired);
      if (e > 2.4) {
        const k = (e - 2.4) / 0.9;
        sink = -0.2 * k;
        s = 1 - k;
        if (k >= 1) return free();
      }
    }
    p.g.scale.setScalar(Math.max(0.0001, s) * 1.6);
    p.g.position.set(p.base.x, p.base.y + sink, p.base.z);
  };

  // Kamera: güneybatıdan, haritayı sığdıracak uzaklıkta
  const target = center.clone().setY(SURFACE * 0.5);
  const sph = new Spherical(1, 0.72, -0.12);
  // Sığdırma: kıyı noktaları (üst ve alt yüz) ekrana düşürülür, hepsinin kenar payı içinde kaldığı en yakın uzaklık aranır
  const probe = data.outline.flat().filter((_, i) => i % 2 === 0).flatMap(([lon, lat]) => [at(lon, lat), at(lon, lat, -SURFACE - BEVEL)]);
  const pv = new Vector3();
  const place = (radius: number) => {
    sph.radius = radius;
    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  };
  const fit = () => {
    let [lo, hi] = [1, 80];
    for (let k = 0; k < 20; k++) {
      place((lo + hi) / 2);
      const inside = probe.every((p) => {
        pv.copy(p).project(camera);
        return Math.abs(pv.x) <= 0.95 && Math.abs(pv.y) <= 0.84;
      });
      if (inside) hi = sph.radius;
      else lo = sph.radius;
    }
    place(hi);
  };

  const controls = o.input === "drag" ? new OrbitControls(camera, canvas) : null;
  let lastInteraction = -Infinity;
  if (controls) {
    Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.45 });
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = 1.12;
    controls.minAzimuthAngle = -0.75;
    controls.maxAzimuthAngle = 0.45;
    controls.target.copy(target);
    controls.addEventListener("start", () => (lastInteraction = Infinity));
    controls.addEventListener("end", () => (lastInteraction = performance.now()));
    controls.addEventListener("change", () => o.reducedMotion && render());
  }

  // Etiketler (her zaman görünen birkaç il) ve bilgi kutusu: tuvalin üstünde HTML
  const labels = LABELED.flatMap((slug) => {
    const h = hubs.get(slug);
    if (!h) return [];
    const el = document.createElement("span");
    el.textContent = h.name;
    el.className =
      "pointer-events-none absolute top-0 left-0 hidden rounded-md bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold text-[#17325b] shadow-sm sm:block dark:bg-slate-900/85 dark:text-slate-100";
    host.appendChild(el);
    return [{ el, pos: h.pos }];
  });
  const tip = document.createElement("div");
  tip.className = "pointer-events-none absolute top-0 left-0 hidden max-w-56 rounded-lg bg-[#17325b] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-slate-700";
  host.appendChild(tip);

  const v = new Vector3();
  const placeLabels = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labels) {
      v.copy(l.pos).project(camera);
      l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -150%)`;
    }
  };

  // Fareyle seçme: yol (tıklayınca güzergâh sayfası) ya da il
  const ray = new Raycaster();
  const ndc = new Vector2();
  let hot: (typeof roads)[number] | null = null;
  const pickables = [...hubMeshes, ...roads.map((r) => r.pick)];
  const hit = (ev: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables, false)[0]?.object.userData as { hub?: string; route?: HeroMapData["routes"][number] } | undefined;
  };
  const name = (slug: string) => hubs.get(slug)?.name ?? slug;
  const showTip = (text: string | null, ev?: PointerEvent | MouseEvent) => {
    if (!text || !ev) return void tip.classList.add("hidden");
    const r = canvas.getBoundingClientRect();
    tip.textContent = text;
    tip.classList.remove("hidden");
    tip.style.transform = `translate(${Math.min(ev.clientX - r.left + 14, r.width - 230)}px, ${ev.clientY - r.top + 14}px)`;
  };
  const setHot = (road: (typeof roads)[number] | null) => {
    if (hot === road) return;
    if (hot) hot.line.material = roadMat;
    hot = road;
    if (hot) hot.line.material = roadHot;
    canvas.style.cursor = hot ? "pointer" : "";
    if (o.reducedMotion) render();
  };
  const describe = (u: ReturnType<typeof hit>) =>
    u?.route ? `${name(u.route.from)} → ${name(u.route.to)} · ${u.route.km} km karayolu. Güzergâh sayfası için tıklayın.` : u?.hub ? name(u.hub) : null;
  let down: { x: number; y: number } | null = null;
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse") return;
    const u = hit(ev);
    setHot(u?.route ? (roads.find((r) => r.pick.userData.route === u.route) ?? null) : null);
    showTip(describe(u), ev);
  };
  const onLeave = () => {
    setHot(null);
    showTip(null);
  };
  const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
  const onClick = (ev: MouseEvent) => {
    if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return; // sürükleme, tıklama değil
    const u = hit(ev);
    if (u?.route) o.onNavigate(`/nakliye/${u.route.from}-${u.route.to}`);
    else if (o.input === "tap") showTip(describe(u), ev);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("click", onClick);

  // Boyut
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    controls?.update();
    // Uçtan uca test için: ilk güzergâhın orta noktası (px; hareket azaltılmışken kamera sabit, nokta kaymaz)
    pv.copy(roads[0]!.curve.getPointAt(0.5)).project(camera);
    host.dataset.routeHint = `${Math.round(((pv.x + 1) / 2) * w)},${Math.round(((1 - pv.y) / 2) * h)}`;
    if (o.reducedMotion) render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const render = () => {
    renderer.render(scene, camera);
    placeLabels();
  };

  const applyTheme = () => {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    landTop.color.set(get("--map-land", "#f5f7fb"));
    landSide.color.set(get("--map-side", COLORS.primary));
    dotMat.color.set(get("--map-dot", "#b4c1d4"));
    fill.groundColor.set(get("--map-fill-light", "#b9c6da"));
    groundMat.opacity = Number(get("--map-shadow", "0.14"));
    const line = get("--map-line", COLORS.primary);
    for (const mat of [hubMat, haloMat, roadMat, truckMats.trailer]) mat.color.set(line);
    if (o.reducedMotion) render();
  };
  applyTheme();

  // Hareket
  const tmp = new Vector3();
  const tan = new Vector3();
  const placeTruck = (tr: (typeof trucks)[number]) => {
    tr.road.curve.getPointAt(tr.t, tmp);
    tr.road.curve.getTangentAt(tr.t, tan).multiplyScalar(tr.dir);
    tr.mesh.position.copy(tmp).setY(SURFACE + 0.004);
    tr.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
  };
  trucks.forEach(placeTruck);
  // İlk karede sırası gelmemiş iğneler görünmesin
  if (!o.reducedMotion) for (const p of pins) updatePin(p, 0);

  let last = performance.now();
  let clock = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    for (const tr of trucks) {
      if (tr.wait > 0) tr.wait -= dt;
      else {
        tr.t += (tr.dir * tr.speed * dt) / tr.road.length;
        if (tr.t >= 1 || tr.t <= 0) {
          tr.t = clamp01(tr.t);
          const h = hubs.get(tr.t === 1 ? tr.road.to : tr.road.from);
          if (h) pulse(h.pos, COLORS.accent, 3, 1); // teslim
          tr.dir = -tr.dir;
          tr.wait = 0.9;
        }
      }
      placeTruck(tr);
    }
    for (const p of pins) updatePin(p, dt);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i]!;
      q.age += dt;
      const e = q.age / q.dur;
      q.mesh.scale.setScalar(1 + (q.max - 1) * e);
      (q.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1 - e);
      if (e >= 1) {
        scene.remove(q.mesh);
        (q.mesh.material as Material).dispose();
        pulses.splice(i, 1);
      }
    }
    // Kimse sürüklemiyorsa kamera yavaşça salınır
    if (now - lastInteraction > 4000) {
      tmp.copy(camera.position).sub(target);
      const s = new Spherical().setFromVector3(tmp);
      s.theta += (-0.18 + 0.22 * Math.sin(clock * 0.18) - s.theta) * 0.02;
      camera.position.setFromSpherical(s).add(target);
      camera.lookAt(target);
    }
    controls?.update();
    render();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    o.onError();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();
  render();
  o.onReady();

  let active = false;
  return {
    applyTheme,
    setActive(next) {
      if (o.reducedMotion || next === active) return;
      active = next;
      last = performance.now();
      renderer.setAnimationLoop(active ? tick : null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      controls?.dispose();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("webglcontextlost", onLost);
      labels.forEach((l) => l.el.remove());
      tip.remove();
      scene.traverse((obj) => {
        if (obj instanceof Mesh || obj instanceof InstancedMesh) {
          obj.geometry.dispose();
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((mat: Material) => mat.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
