// Araç tanıma sahnesi (three.js): tek araç, yumuşak gölge, hafif yandan bakış. Ayrı parça olarak sonradan yüklenir (vehicle-viewer.tsx).
import type { BodyType, VehicleType } from "@nakliye/shared";
import { Box3, DirectionalLight, HemisphereLight, Mesh, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, Spherical, Vector3, WebGLRenderer, type Group } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildVehicle, disposeVehicle } from "./models";

export interface VehicleScene {
  show(vehicle: VehicleType, body: BodyType): void;
  setActive(active: boolean): void;
  applyTheme(): void;
  dispose(): void;
}

/** Kamera açısı: önden-yandan; yan görünüm tanımak için en net olanı, hafif dönük olması 3B'yi belli eder */
const HOME = { phi: 1.22, theta: 0.62 };

export function createVehicleScene(o: { canvas: HTMLCanvasElement; host: HTMLElement; reducedMotion: boolean; drag: boolean; onError: () => void }): VehicleScene {
  const { canvas, host } = o;
  // preserveDrawingBuffer: mobil resimleri çıkaran betik (scripts/render-vehicles.mjs) tuvali okur
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.5, 200);
  const fill = new HemisphereLight("#ffffff", "#b9c6da", 2.3);
  const sun = new DirectionalLight("#ffffff", 1.7);
  sun.position.set(6, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 40 });
  scene.add(fill, sun);
  const groundMat = new ShadowMaterial({ opacity: 0.16 });
  const ground = new Mesh(new PlaneGeometry(80, 80).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const target = new Vector3();
  const sph = new Spherical(20, HOME.phi, HOME.theta);
  let current: Group | null = null;
  let radius = 6;

  const fit = () => {
    // Aracı çevreleyen küre ekrana sığacak uzaklık (dar ekranda yatay görüş açısı belirler)
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    sph.radius = (radius * 0.8) / Math.sin(Math.min(vFov, hFov) / 2);
    camera.position.setFromSpherical(sph).add(target);
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.minDistance = controls.maxDistance = sph.radius;
    }
  };

  const controls = o.drag ? new OrbitControls(camera, canvas) : null;
  let lastInteraction = -Infinity;
  if (controls) {
    Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.6 });
    controls.minPolarAngle = 0.7;
    controls.maxPolarAngle = 1.45;
    canvas.style.touchAction = "pan-y"; // OrbitControls "none" yapar; telefonda dikey kaydırma sayfaya kalsın, yatay sürükleme döndürsün
    controls.addEventListener("start", () => (lastInteraction = Infinity));
    controls.addEventListener("end", () => (lastInteraction = performance.now()));
    controls.addEventListener("change", () => o.reducedMotion && render());
  }

  const render = () => renderer.render(scene, camera);

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
    render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let clock = 0;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    // Kimse sürüklemiyorsa araç önünde hafifçe salınır (tam tur değil: yan görünümden uzaklaşmasın)
    if (now - lastInteraction > 3500) {
      const s = new Spherical().setFromVector3(camera.position.clone().sub(target));
      s.theta += (HOME.theta + 0.35 * Math.sin(clock * 0.35) - s.theta) * 0.03;
      s.phi += (HOME.phi - s.phi) * 0.03;
      camera.position.setFromSpherical(s).add(target);
      camera.lookAt(target);
    }
    controls?.update();
    render();
  };

  const applyTheme = () => {
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    fill.groundColor.set(get("--map-fill-light", "#b9c6da"));
    groundMat.opacity = Number(get("--map-shadow", "0.14")) + 0.04;
    render();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    o.onError();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  let active = false;
  applyTheme();
  return {
    show(vehicle, body) {
      if (current) {
        scene.remove(current);
        disposeVehicle(current);
      }
      current = buildVehicle(vehicle, body).group;
      const b = new Box3().setFromObject(current);
      const c = b.getCenter(new Vector3());
      current.position.x -= c.x; // ortala
      current.position.z -= c.z;
      scene.add(current);
      target.set(0, (b.max.y - b.min.y) * 0.42, 0);
      radius = b.getSize(new Vector3()).length() / 2;
      sun.shadow.camera.left = -radius - 2;
      sun.shadow.camera.right = radius + 2;
      sun.shadow.camera.updateProjectionMatrix();
      sph.phi = HOME.phi;
      sph.theta = HOME.theta;
      resize();
    },
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
      canvas.removeEventListener("webglcontextlost", onLost);
      if (current) disposeVehicle(current);
      ground.geometry.dispose();
      groundMat.dispose();
      renderer.dispose();
    },
  };
}
