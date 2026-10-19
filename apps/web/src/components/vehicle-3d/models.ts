// Araç tanıma sahnesinin modelleri: yalnız kutu ve silindirden, kodla (dosya yok). 1 birim = 1 metre; ön +x, üst +y.
// Araç = şasi + kabin (tipe göre) + kasa (kasa tipine göre). Ölçüler yaklaşıktır, amaç tanınmak.
import type { BodyType, VehicleType } from "@nakliye/shared";
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SphereGeometry, type BufferGeometry } from "three";

const C = {
  cab: "#f3680f",
  glass: "#16243a",
  chassis: "#262c36",
  tire: "#1b1f26",
  rim: "#9aa3b0",
  steel: "#8d97a5",
  tarp: "#3d6bb0",
  strap: "#23406e",
  curtain: "#2f8a62",
  pleat: "#1f6347",
  box: "#d9dee6",
  rib: "#b8c0cc",
  white: "#f6f8fb",
  stripe: "#2f6fd1",
  unit: "#4a5260",
  deck: "#9a6a3a",
  wall: "#7f8b9b",
  tub: "#d39a1c",
  gravel: "#8b7d6b",
  machine: "#f2b705",
  light: "#ffd27a",
  pallet: "#b5895a",
  goods: "#c9b48f",
  person: "#64748b",
} as const;

type Spec = {
  /** kabin boyu, yüksekliği (zeminden üstü), genişlik */
  cabLen: number;
  cabTop: number;
  width: number;
  wheelR: number;
  /** kasanın önü (x), boyu, taban yüksekliği, kasa yüksekliği */
  bodyX: number;
  bodyLen: number;
  deckY: number;
  bodyH: number;
  axles: number[];
};

const SPECS: Record<Exclude<VehicleType, "panelvan">, Spec> = {
  // Tırda kasa yarı römorkun üstünde; çekici dingilleri ilk ikisi, kalanlar dorse
  tir: { cabLen: 2.3, cabTop: 3.55, width: 2.5, wheelR: 0.52, bodyX: -2.7, bodyLen: 13.6, deckY: 1.3, bodyH: 2.65, axles: [-1.15, -3.85, -13.0, -14.32, -15.64] },
  kirkayak: { cabLen: 2.3, cabTop: 3.35, width: 2.5, wheelR: 0.52, bodyX: -2.55, bodyLen: 7.2, deckY: 1.35, bodyH: 2.5, axles: [-1.1, -2.9, -7.6, -8.95] },
  kamyon: { cabLen: 2.2, cabTop: 3.2, width: 2.45, wheelR: 0.48, bodyX: -2.4, bodyLen: 6.6, deckY: 1.2, bodyH: 2.4, axles: [-1.2, -6.9] },
  kamyonet: { cabLen: 1.75, cabTop: 2.55, width: 2.0, wheelR: 0.37, bodyX: -1.9, bodyLen: 4.2, deckY: 0.9, bodyH: 2.0, axles: [-0.95, -4.4] },
};

export interface BuiltVehicle {
  group: Group;
  /** gösterilen kasa (panelvanda yaygın olmayan kasa seçilirse kapalı gösterilir) */
  body: BodyType;
}

export function buildVehicle(vehicle: VehicleType, body: BodyType): BuiltVehicle {
  const mats = new Map<string, MeshStandardMaterial>();
  const mat = (color: string) => {
    let m = mats.get(color);
    if (!m) mats.set(color, (m = new MeshStandardMaterial({ color, roughness: color === C.glass ? 0.2 : 0.6, metalness: color === C.rim || color === C.steel ? 0.4 : 0 })));
    return m;
  };
  const root = new Group();
  const add = (geo: BufferGeometry, color: string, x: number, y: number, z = 0, parent: Group = root) => {
    const m = new Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** Kutu: x0 = ön yüzü (x), boy arkaya doğru; y0 = alt yüz */
  const box = (x0: number, len: number, y0: number, h: number, w: number, color: string, z = 0, parent: Group = root) =>
    add(new BoxGeometry(len, h, w), color, x0 - len / 2, y0 + h / 2, z, parent);
  const wheels = (x: number, r: number, w: number, dual: boolean) => {
    for (const side of [1, -1]) {
      const tw = dual ? 0.55 : 0.32;
      const z = side * (w / 2 - tw / 2 + 0.05);
      add(new CylinderGeometry(r, r, tw, 20).rotateX(Math.PI / 2), C.tire, x, r, z);
      add(new CylinderGeometry(r * 0.55, r * 0.55, tw + 0.02, 16).rotateX(Math.PI / 2), C.rim, x, r, z);
    }
  };
  /** Öne bakan düz (cab-over) kabin: gövde, ön cam, yan cam, ızgara, farlar */
  const cab = (s: { len: number; top: number; base: number; w: number }) => {
    box(0, s.len, s.base, s.top - s.base, s.w, C.cab);
    const h = s.top - s.base;
    box(0.02, 0.04, s.base + h * 0.55, h * 0.33, s.w * 0.86, C.glass);
    for (const side of [1, -1]) box(-0.15, s.len * 0.42, s.base + h * 0.55, h * 0.3, 0.04, C.glass, side * (s.w / 2 + 0.005));
    box(0.03, 0.05, s.base + h * 0.12, h * 0.22, s.w * 0.55, C.chassis);
    for (const side of [1, -1]) box(0.03, 0.05, s.base + h * 0.1, 0.16, 0.34, C.light, side * (s.w / 2 - 0.3));
  };

  let shown = body;
  if (vehicle === "panelvan") {
    if (shown !== "kapali" && shown !== "frigo") shown = "kapali";
    const w = 2.0, base = 0.5, top = 2.55, r = 0.34;
    // Yan kesit: kısa kaput, eğik ön cam, uzun düz tavan; genişliğe doğru çekilir
    const prof = new Shape();
    prof.moveTo(0, base);
    for (const [x, y] of [[-5.5, base], [-5.5, top], [-1.65, top], [-0.95, 1.3], [0, 1.2]] as const) prof.lineTo(x, y);
    add(new ExtrudeGeometry(prof, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2), C.white, 0, 0, 0);
    const ws = add(new BoxGeometry(0.04, 1.42, w * 0.88), C.glass, -1.3, (1.3 + top) / 2, 0); // ön cam
    ws.rotation.z = Math.atan2(0.7, 1.25);
    for (const side of [1, -1]) box(-1.7, 0.75, base + 1.0, 0.7, 0.04, C.glass, side * (w / 2 + 0.005));
    box(0.01, 0.05, base + 0.1, 0.3, w * 0.6, C.chassis);
    for (const side of [1, -1]) box(0.02, 0.05, base + 0.45, 0.14, 0.3, C.light, side * (w / 2 - 0.28));
    box(-1.95, 0.04, base + 0.1, 1.75, 0.03, C.rib, w / 2 + 0.005); // sürgülü yan kapı çizgisi
    box(-5.5, 0.04, base + 0.1, 1.85, 0.03, C.rib, 0.0); // arka kapı ortası
    if (shown === "frigo") {
      box(-1.1, 0.9, top, 0.28, 1.1, C.unit);
      for (const side of [1, -1]) box(-1.3, 3.9, base + 1.1, 0.12, 0.02, C.stripe, side * (w / 2 + 0.01));
    }
    for (const x of [-0.75, -4.45]) wheels(x, r, w, false);
    person(w);
    return { group: root, body: shown };
  }

  const s = SPECS[vehicle];
  const semi = vehicle === "tir";
  // Şasi: tırda çekici şasisi + dorse şasisi; kamyonlarda tek
  const frameY = s.wheelR + 0.1;
  if (semi) {
    box(0.1, 5.0, frameY, 0.3, 1.0, C.chassis);
    box(-3.4, 0.9, frameY + 0.3, 0.12, 1.2, C.steel); // beşinci teker
  } else box(0.1, s.bodyLen - s.bodyX + 0.3, frameY, 0.3, 1.0, C.chassis);
  cab({ len: s.cabLen, top: s.cabTop, base: frameY + 0.15, w: s.width });
  // Kabin arkasında yakıt deposu ve egzoz
  for (const side of [1, -1]) box(-s.cabLen - 0.05, 0.8, frameY - 0.05, 0.5, 0.45, C.steel, side * (s.width / 2 - 0.3));
  box(-s.cabLen - 0.1, 0.12, frameY + 0.3, s.cabTop - frameY - 0.1, 0.12, C.chassis, s.width / 2 - 0.2);

  const x0 = s.bodyX, L = s.bodyLen, W = s.width, deck = s.deckY;
  const tY = deck + 0.18;
  const bodyMain = new Group();
  root.add(bodyMain);
  const deckPlate = (color: string = C.chassis, y = deck, len = L, x = x0) => box(x, len, y, 0.18, W, color);
  if (semi && shown !== "lowbed") {
    box(x0, L, deck - 0.35, 0.35, 1.1, C.chassis); // dorse kirişi
    for (const side of [1, -1]) box(x0 - 3.2, 0.12, s.wheelR * 0.3, deck - 0.35 - s.wheelR * 0.3, 0.12, C.steel, side * 0.7); // ayaklar
  }

  const sideLines = (from: number, to: number, step: number, y0: number, h: number, color: string, t = 0.06) => {
    for (let x = from; x > to; x -= step) for (const side of [1, -1]) box(x, t, y0, h, 0.02, color, side * (W / 2 + 0.01));
  };
  const pallets = (from: number, to: number, y0: number, rows = 2) => {
    for (let x = from; x > to + 1.0; x -= 1.25)
      for (const z of [-0.6, 0.6]) {
        box(x, 1.1, y0, 0.15, 1.0, C.pallet, z);
        box(x - 0.05, 1.0, y0 + 0.15, 0.55 * rows, 0.9, C.goods, z);
      }
  };

  switch (shown) {
    case "tenteli": {
      deckPlate();
      box(x0, L, tY, s.bodyH, W, C.tarp);
      box(x0 + 0.01, 0.04, tY, s.bodyH, W + 0.02, C.strap); // ön duvar
      sideLines(x0 - 0.6, x0 - L, 1.15, tY + 0.05, s.bodyH - 0.1, C.strap, 0.07); // spanzet kayışları
      for (const side of [1, -1]) box(x0, L, tY + 0.05, 0.06, 0.02, C.strap, side * (W / 2 + 0.012)); // alt halat
      box(x0 - 0.05, L - 0.1, tY + s.bodyH, 0.12, W - 0.2, C.tarp); // bombeli tavan
      break;
    }
    case "kayar_perde": {
      // Ön %55 perde kapalı; arka kısımda perde toplanmış, içerideki paletler görünür (yandan yükleme)
      deckPlate();
      const open = L * 0.45;
      box(x0, L, tY + s.bodyH - 0.15, 0.15, W, C.chassis); // tavan rayı
      box(x0, 0.08, tY, s.bodyH, W, C.curtain); // ön duvar
      box(x0 - L + 0.08, 0.08, tY, s.bodyH, W, C.box); // arka kapı
      box(x0, L, tY, s.bodyH - 0.15, 0.04, C.curtain, -(W / 2 - 0.02)); // karşı yan perde
      box(x0, L - open, tY, s.bodyH - 0.15, 0.04, C.curtain, W / 2 - 0.02);
      for (let x = x0 - 0.2; x > x0 - (L - open); x -= 0.32) box(x, 0.05, tY, s.bodyH - 0.15, 0.02, C.pleat, W / 2);
      box(x0 - (L - open), 0.3, tY, s.bodyH - 0.15, 0.12, C.pleat, W / 2 + 0.02); // toplanmış perde
      for (const x of [x0 - (L - open) - open * 0.5]) box(x, 0.08, tY, s.bodyH - 0.15, 0.08, C.steel, W / 2 - 0.04); // direk
      pallets(x0 - (L - open) - 0.4, x0 - L, tY);
      break;
    }
    case "kapali": {
      deckPlate();
      box(x0, L, tY, s.bodyH, W, C.box);
      sideLines(x0 - 0.4, x0 - L + 0.2, 0.55, tY + 0.08, s.bodyH - 0.16, C.rib, 0.05); // oluklu sac
      box(x0 - L - 0.01, 0.02, tY + 0.1, s.bodyH - 0.2, 0.04, C.rib); // arka kapı ortası
      for (const z of [-0.5, 0.5]) box(x0 - L - 0.01, 0.04, tY + 0.2, s.bodyH - 0.4, 0.05, C.steel, z); // kapı kolları
      break;
    }
    case "frigo": {
      deckPlate();
      box(x0, L, tY, s.bodyH + 0.1, W + 0.05, C.white); // kalın yalıtımlı duvar
      for (const side of [1, -1]) box(x0 - 0.3, L - 0.6, tY + s.bodyH * 0.25, 0.22, 0.02, C.stripe, side * (W / 2 + 0.04));
      // Önde soğutma ünitesi (kabin üstüne taşar)
      box(x0 + 0.42, 0.42, tY + s.bodyH * 0.35, s.bodyH * 0.55, W * 0.8, C.unit);
      for (let y = tY + s.bodyH * 0.42; y < tY + s.bodyH * 0.85; y += 0.16) box(x0 + 0.43, 0.02, y, 0.06, W * 0.7, C.steel);
      break;
    }
    case "acik": {
      deckPlate(C.deck);
      const wh = 0.6;
      for (const side of [1, -1]) box(x0, L, tY, wh, 0.06, C.wall, side * (W / 2 - 0.03)); // yan kapaklar
      box(x0 - L + 0.06, 0.06, tY, wh, W, C.wall); // arka kapak
      box(x0, 0.1, tY, 1.3, W, C.wall); // ön siper
      sideLines(x0 - 1.2, x0 - L + 0.5, 1.2, tY, wh, C.steel, 0.05);
      // Yük: bağlanmış kereste/boru demeti
      for (const [z, y] of [[-0.55, 0], [0, 0], [0.55, 0], [-0.28, 0.42], [0.28, 0.42]] as const)
        box(x0 - 0.4, L * 0.75, tY + y, 0.42, 0.5, C.goods, z);
      for (let x = x0 - 1.2; x > x0 - L * 0.75; x -= L * 0.25) box(x, 0.06, tY, 0.9, W - 0.1, C.strap);
      break;
    }
    case "damper": {
      deckPlate();
      // Kasa arka menteşeden ~12° kalkmış: devrilerek boşaltıldığı anlaşılsın
      const tubLen = semi ? L * 0.82 : L;
      const tx0 = semi ? x0 - (L - tubLen) : x0; // menteşe en arkada
      const tubH = semi ? 1.6 : 1.35;
      const hinge = new Group();
      hinge.position.set(tx0 - tubLen, tY, 0);
      hinge.rotation.z = 0.21;
      bodyMain.add(hinge);
      const hb = (x: number, len: number, y: number, h: number, w: number, color: string, z = 0) => box(x + tubLen, len, y, h, w, color, z, hinge);
      hb(0, tubLen, 0, 0.12, W, C.tub);
      for (const side of [1, -1]) hb(0, tubLen, 0, tubH, 0.08, C.tub, side * (W / 2 - 0.04));
      hb(0, 0.1, 0, tubH + 0.35, W, C.tub); // ön duvar + kabin koruyucu
      hb(-tubLen + 0.08, 0.08, 0, tubH, W, C.tub);
      hb(-0.1, tubLen - 0.2, 0.12, tubH * 0.7, W - 0.18, C.gravel); // çakıl
      for (let x = -0.9; x > -tubLen + 0.4; x -= 1.1) for (const side of [1, -1]) hb(x, 0.1, 0.1, tubH - 0.1, 0.03, C.chassis, side * (W / 2 + 0.005));
      // Hidrolik piston
      const p = add(new CylinderGeometry(0.11, 0.11, 1.0, 12), C.steel, tx0 - 0.35, tY + 0.35, 0, bodyMain);
      p.rotation.z = -0.25;
      break;
    }
    case "lowbed": {
      if (semi) {
        // Kuğu boynu (yüksek ön) → alçak taban → arkada dingiller; üstünde iş makinesi
        const low = s.wheelR * 0.85;
        box(x0, 2.6, deck - 0.1, 0.28, W, C.chassis);
        const slope = add(new BoxGeometry(1.0, 0.24, W), C.chassis, x0 - 2.95, (deck + low) / 2 + 0.05, 0);
        slope.rotation.z = 0.75;
        box(x0 - 3.3, 7.8, low - 0.25, 0.28, W, C.chassis);
        box(x0 - 11.1, 2.5, s.wheelR + 0.25, 0.3, W, C.chassis);
        for (const side of [1, -1]) box(x0 - 3.3, 7.8, low - 0.24, 0.1, 0.03, C.machine, side * (W / 2 + 0.01)); // ikaz şeridi
        for (const side of [1, -1]) box(x0 - 3.2, 0.12, s.wheelR * 0.3, deck - s.wheelR * 0.4, 0.12, C.steel, side * 0.7);
        machine(x0 - 4.0, low + 0.03);
      } else {
        // Kamyonda nadir: alçak platform + arka rampalar
        deckPlate(C.chassis, deck - 0.2);
        for (const side of [1, -1]) {
          const r = add(new BoxGeometry(1.4, 0.08, 0.5), C.steel, x0 - L - 0.55, deck * 0.5, side * (W / 2 - 0.4));
          r.rotation.z = 0.5;
        }
        machine(x0 - 0.6, deck - 0.02, 0.55);
      }
      break;
    }
  }

  // Dingiller: tırın çekici arka dingili, kamyonların arka dingilleri ikiz teker
  const axles = semi && shown === "lowbed" ? [s.axles[0]!, s.axles[1]!, x0 - 11.3, x0 - 12.5, x0 - 13.4] : s.axles;
  axles.forEach((x, i) => wheels(x, semi && shown === "lowbed" && i >= 2 ? 0.42 : s.wheelR, W, i > 0 && vehicle !== "kamyonet" && !(vehicle === "kirkayak" && i === 1)));
  person(W);
  return { group: root, body: shown };

  /** Ölçek için aracın önünde 1,75 m boyunda bir insan */
  function person(w: number) {
    const g = new Group();
    g.position.set(1.1, 0, w / 2 + 0.2);
    root.add(g);
    for (const z of [-0.11, 0.11]) add(new BoxGeometry(0.16, 0.85, 0.15), C.person, 0, 0.425, z, g);
    add(new BoxGeometry(0.26, 0.62, 0.44), C.person, 0, 1.16, 0, g);
    add(new SphereGeometry(0.12, 16, 12), C.person, 0, 1.6, 0, g);
  }

  /** Basit paletli ekskavatör: paletler, gövde, kabin, bom ve kova */
  function machine(front: number, y: number, k = 1) {
    const g = new Group();
    g.position.set(front, y, 0);
    g.scale.setScalar(k);
    root.add(g);
    const mb = (x: number, len: number, y0: number, h: number, w: number, color: string, z = 0) => box(x, len, y0, h, w, color, z, g);
    for (const z of [-0.85, 0.85]) mb(-0.3, 4.2, 0, 0.8, 0.6, C.tire, z);
    mb(-0.6, 3.6, 0.8, 1.0, 2.4, C.machine);
    mb(-0.6, 1.2, 1.8, 1.4, 1.0, C.machine, 0.6);
    mb(-0.62, 1.0, 2.1, 0.9, 0.04, C.glass, 1.11);
    const boom = add(new BoxGeometry(3.4, 0.4, 0.45), C.machine, -2.4, 2.9, -0.3, g);
    boom.rotation.z = -0.45;
    const arm = add(new BoxGeometry(2.4, 0.32, 0.38), C.machine, -4.6, 2.6, -0.3, g);
    arm.rotation.z = 0.9;
    mb(-4.5, 0.8, 1.0, 0.7, 1.0, C.chassis, -0.3);
  }
}

/** Gruptaki geometri ve malzemeleri serbest bırakır */
export function disposeVehicle(g: Group) {
  g.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshStandardMaterial).dispose();
    }
  });
}
