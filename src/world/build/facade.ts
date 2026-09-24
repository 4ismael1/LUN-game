import * as THREE from 'three';
import { World } from '../world';
import { uvBox, uvPlane, rand } from '../geom';
import { signTexture } from '../canvasTex';

export type Facing = 'n' | 's' | 'e' | 'w';

export interface Opening {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  kind: 'window' | 'door' | 'shop' | 'balcony' | 'arch' | 'gap' | 'blank';
  lit?: boolean;
  shutter?: boolean;
  bars?: boolean;
  id?: string;
}

export interface FacadeOpts {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  facing: Facing;
  height: number;
  color: THREE.ColorRepresentation;
  depth?: number;
  chunk?: string;
  openings?: Opening[];
  auto?: { ground: 'house' | 'shop' | 'mixed'; upper: boolean; bay?: number };
  seed?: number;
  old?: boolean;
  roof?: boolean;
  cornice?: boolean;
  noCollider?: boolean;
  lamps?: number[];
  lampGroup?: string;
  base?: number;
  /** deterministic: no random shutters/plants/rooftop props (for mirrored loop bands) */
  plain?: boolean;
}

export const FACE_N: Record<Facing, THREE.Vector3> = {
  n: new THREE.Vector3(0, 0, -1),
  s: new THREE.Vector3(0, 0, 1),
  e: new THREE.Vector3(1, 0, 0),
  w: new THREE.Vector3(-1, 0, 0),
};

/** local frame: u along facade, v up, n outward. returns world point */
export function frame(o: { x0: number; z0: number; x1: number; z1: number; facing: Facing }) {
  let a = new THREE.Vector3(o.x0, 0, o.z0);
  let b = new THREE.Vector3(o.x1, 0, o.z1);
  const n = FACE_N[o.facing];
  // rotation so that local +z = n and local +x = u
  const ud = new THREE.Vector3(n.z, 0, -n.x);
  if (b.clone().sub(a).dot(ud) < 0) [a, b] = [b, a];
  const L = a.distanceTo(b);
  const u = b.clone().sub(a).normalize();
  const rotY = Math.atan2(n.x, n.z);
  const at = (uu: number, v: number, nn: number) => new THREE.Vector3(a.x + u.x * uu + n.x * nn, v, a.z + u.z * uu + n.z * nn);
  return { a, b, L, u, n, rotY, at };
}

export function facade(w: World, o: FacadeOpts) {
  const m = w.mats;
  const f = frame(o);
  const chunk = o.chunk ?? 'plaza';
  const H = o.height;
  const T = 0.5;
  const r0 = rand(o.seed ?? Math.floor(o.x0 * 7 + o.z0 * 13 + 1000));
  const r = o.plain ? () => 0.99 : r0;
  const wallMat = o.old ? m.plasterOld(o.color) : m.plaster(o.color);
  const baseCol = new THREE.Color(o.color).multiplyScalar(0.55);
  const baseMat = o.old ? m.plasterOld(baseCol) : m.plaster(baseCol);
  const cant = m.cantera;
  let ops: Opening[] = o.openings ?? [];
  if (!o.openings && o.auto) {
    const bay = o.auto.bay ?? 3.6;
    const n = Math.max(1, Math.floor((f.L - 1) / bay));
    const pad = (f.L - n * bay) / 2;
    for (let i = 0; i < n; i++) {
      const c = pad + bay * (i + 0.5);
      const g = o.auto.ground;
      const shop = g === 'shop' || (g === 'mixed' && r() < 0.4);
      if (shop) ops.push({ u0: c - 1.3, u1: c + 1.3, v0: 0, v1: 2.9, kind: 'shop', shutter: r() < 0.7, lit: r() < 0.3 });
      else if (r() < 0.35) ops.push({ u0: c - 0.65, u1: c + 0.65, v0: 0, v1: 2.6, kind: 'door' });
      else ops.push({ u0: c - 0.6, u1: c + 0.6, v0: 0.9, v1: 2.6, kind: 'window', bars: true, lit: r() < 0.25 });
      if (o.auto.upper && H > 6) {
        const bal = r() < 0.55;
        ops.push(bal ? { u0: c - 0.6, u1: c + 0.6, v0: 3.9, v1: 6.4, kind: 'balcony', lit: r() < 0.3 } : { u0: c - 0.55, u1: c + 0.55, v0: 4.3, v1: 6.2, kind: 'window', lit: r() < 0.3 });
      }
    }
  }
  // ---- wall slabs with openings (strip slicing) ----
  const us = new Set<number>([0, f.L]);
  for (const op of ops) {
    us.add(Math.max(0, op.u0));
    us.add(Math.min(f.L, op.u1));
  }
  const ul = [...us].sort((x, y) => x - y);
  const base = o.base ?? 0;
  for (let i = 0; i < ul.length - 1; i++) {
    const ua = ul[i], ub = ul[i + 1];
    if (ub - ua < 0.001) continue;
    const mid = (ua + ub) / 2;
    const inStrip = ops.filter((op) => op.u0 <= mid && op.u1 >= mid).sort((x, y) => x.v0 - y.v0);
    let v = base;
    const spans: [number, number][] = [];
    for (const op of inStrip) {
      if (op.v0 > v) spans.push([v, op.v0]);
      v = Math.max(v, op.v1);
    }
    if (v < H) spans.push([v, H]);
    for (const [va, vb] of spans) {
      const p = f.at(mid, va, -T / 2);
      w.geo(uvBox(ub - ua, vb - va, T), wallMat, { x: p.x, y: va + (vb - va) / 2, z: p.z }, f.rotY, chunk);
    }
  }
  // zócalo band
  {
    const p = f.at(f.L / 2, base, 0.02);
    w.geo(uvBox(f.L, 0.85, 0.06), baseMat, { x: p.x, y: base + 0.425, z: p.z }, f.rotY, chunk);
  }
  // cornice + parapet
  if (o.cornice !== false) {
    const p = f.at(f.L / 2, 0, 0.12);
    w.geo(uvBox(f.L + 0.3, 0.35, 0.34), cant, { x: p.x, y: H - 0.55, z: p.z }, f.rotY, chunk);
    const p2 = f.at(f.L / 2, 0, 0.05);
    w.geo(uvBox(f.L + 0.1, 0.18, 0.2), cant, { x: p2.x, y: H - 0.85, z: p2.z }, f.rotY, chunk);
    // floor divider line
    if (H > 6) w.geo(uvBox(f.L, 0.22, 0.14), cant, { x: p2.x, y: 3.55, z: p2.z }, f.rotY, chunk);
  }
  // pilasters at ends
  for (const uu of [0.25, f.L - 0.25]) {
    const p = f.at(uu, 0, 0.06);
    w.geo(uvBox(0.5, H - 0.4, 0.14), cant, { x: p.x, y: (H - 0.4) / 2, z: p.z }, f.rotY, chunk);
  }
  // ---- openings ----
  for (const op of ops) buildOpening(w, f, op, chunk, r, o);
  // ---- roof & collider ----
  const depth = o.depth ?? 8;
  if (o.roof !== false) {
    const c = f.at(f.L / 2, 0, -depth / 2);
    const rs = Math.abs(f.u.x) > 0.5 ? [f.L, depth] : [depth, f.L];
    w.geo(uvBox(rs[0], 0.3, rs[1]), m.concrete, { x: c.x, y: H - 0.4, z: c.z }, 0, chunk, false);
    // rooftop details visible from the bell tower: tinacos, antennas
    if (r() < 0.7) {
      const tp = f.at(f.L * (0.3 + r() * 0.4), 0, -depth * (0.4 + r() * 0.3));
      const tank = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12);
      w.geo(tank, m.flat(0x141414, { rough: 0.6, key: 'tinaco' }), { x: tp.x, y: H + 0.55, z: tp.z }, 0, chunk);
    }
    if (r() < 0.4) {
      const tp = f.at(f.L * r(), 0, -depth * 0.6);
      w.geo(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), m.iron, { x: tp.x, y: H + 1.1, z: tp.z }, 0, chunk, false);
    }
  }
  if (!o.noCollider) {
    const c = f.at(f.L / 2, 0, -depth / 2);
    const rs = Math.abs(f.u.x) > 0.5 ? [f.L, depth] : [depth, f.L];
    w.solid(c.x, 0, c.z, rs[0], H, rs[1]);
  }
  // wall lanterns
  for (const lu of o.lamps ?? []) wallLantern(w, f.at(lu, 3.3, 0), f.rotY, chunk, o.lampGroup ?? 'facade');
  return f;
}

function buildOpening(w: World, f: ReturnType<typeof frame>, op: Opening, chunk: string, r: () => number, o: FacadeOpts) {
  const m = w.mats;
  const cant = m.cantera;
  const wd = op.u1 - op.u0;
  const ht = op.v1 - op.v0;
  const cu = (op.u0 + op.u1) / 2;
  const frameW = 0.16;
  const deep = 0.3;
  if (op.kind === 'gap' || op.kind === 'blank') return;
  // reveal (inner sides of the opening)
  const rev = (uu: number) => {
    const p = f.at(uu, 0, -deep / 2);
    w.geo(uvBox(0.04, ht, deep), cant, { x: p.x, y: op.v0 + ht / 2, z: p.z }, f.rotY, chunk, false);
  };
  if (op.kind !== 'arch') {
    rev(op.u0 + 0.02);
    rev(op.u1 - 0.02);
    const top = f.at(cu, 0, -deep / 2);
    w.geo(uvBox(wd, 0.04, deep), cant, { x: top.x, y: op.v1 - 0.02, z: top.z }, f.rotY, chunk, false);
  }
  // cantera frame
  const fp = (uu: number, v: number, sw: number, sh: number, nn = 0.05) => {
    const p = f.at(uu, 0, nn);
    w.geo(uvBox(sw, sh, 0.12), cant, { x: p.x, y: v, z: p.z }, f.rotY, chunk);
  };
  fp(op.u0 - frameW / 2, op.v0 + ht / 2, frameW, ht + frameW);
  fp(op.u1 + frameW / 2, op.v0 + ht / 2, frameW, ht + frameW);
  fp(cu, op.v1 + frameW / 2, wd + frameW * 2, frameW + 0.04);
  if (op.kind === 'window') {
    fp(cu, op.v0 - 0.06, wd + 0.3, 0.12, 0.09); // sill
    // keystone / ornament
    fp(cu, op.v1 + 0.28, 0.3, 0.3, 0.08);
  }
  // recessed content
  const back = f.at(cu, 0, -deep);
  if (op.kind === 'window' || op.kind === 'balcony') {
    const glass = op.lit ? m.get('windowLit', () => new THREE.MeshStandardMaterial({ color: 0x3a2410, emissive: 0xffa850, emissiveIntensity: 0.8, roughness: 0.3 })) : m.glassDark;
    w.geo(new THREE.PlaneGeometry(wd, ht), glass, { x: back.x, y: op.v0 + ht / 2, z: back.z }, f.rotY, chunk, false);
    // mullions (wooden window frame)
    const mw = m.woodDark;
    const pm = f.at(cu, 0, -deep + 0.03);
    w.geo(uvBox(0.06, ht, 0.05), mw, { x: pm.x, y: op.v0 + ht / 2, z: pm.z }, f.rotY, chunk, false);
    w.geo(uvBox(wd, 0.06, 0.05), mw, { x: pm.x, y: op.v0 + ht * 0.62, z: pm.z }, f.rotY, chunk, false);
    // half-open wooden shutters (postigos) on some
    if (r() < 0.45) {
      const sp = f.at(op.u0 + wd * 0.25, 0, -deep + 0.1);
      w.geo(uvBox(wd * 0.5, ht * 0.98, 0.04), m.pbr('wood', { repeat: 1, color: ['#2f5d4a', '#6b2c24', '#2c3f66'][Math.floor(r() * 3)], key: 'shutter' + Math.floor(r() * 3) }), { x: sp.x, y: op.v0 + ht / 2, z: sp.z }, f.rotY + 0.5, chunk, false);
    }
    if (op.bars) ironBars(w, f, op, chunk);
  }
  if (op.kind === 'balcony') {
    // slab
    const sp = f.at(cu, 0, 0.35);
    w.geo(uvBox(wd + 0.8, 0.14, 0.75), cant, { x: sp.x, y: op.v0 - 0.07, z: sp.z }, f.rotY, chunk);
    // corbels
    for (const du of [-wd / 2 - 0.2, wd / 2 + 0.2]) {
      const cp = f.at(cu + du, 0, 0.25);
      w.geo(uvBox(0.14, 0.35, 0.5), cant, { x: cp.x, y: op.v0 - 0.3, z: cp.z }, f.rotY, chunk);
    }
    // iron railing
    const rw = wd + 0.7;
    const n = Math.floor(rw / 0.12);
    const bar = new THREE.CylinderGeometry(0.012, 0.012, 0.95, 4);
    for (let i = 0; i <= n; i++) {
      const bp = f.at(cu - rw / 2 + (i * rw) / n, 0, 0.68);
      w.geo(bar, m.iron, { x: bp.x, y: op.v0 + 0.47, z: bp.z }, 0, chunk, false);
    }
    const tp = f.at(cu, 0, 0.68);
    w.geo(uvBox(rw, 0.04, 0.05), m.iron, { x: tp.x, y: op.v0 + 0.95, z: tp.z }, f.rotY, chunk, false);
    w.geo(uvBox(rw, 0.03, 0.04), m.iron, { x: tp.x, y: op.v0 + 0.1, z: tp.z }, f.rotY, chunk, false);
    for (const side of [-1, 1]) {
      const s1 = f.at(cu + (side * rw) / 2, 0, 0.35);
      w.geo(uvBox(0.04, 0.95, 0.7), m.iron, { x: s1.x, y: op.v0 + 0.47, z: s1.z }, f.rotY, chunk, false);
    }
    // potted flowers on balcony
    if (r() < 0.7) {
      const pp = f.at(cu + (r() - 0.5) * wd * 0.8, 0, 0.35);
      lightPlant(w, pp.x, op.v0, pp.z, 0.5 + r() * 0.35, chunk, r);
    }
  }
  if (op.kind === 'door') {
    const dm = m.woodDoor;
    w.geo(uvBox(wd, ht, 0.08), dm, { x: back.x, y: op.v0 + ht / 2, z: back.z }, f.rotY, chunk, false);
    // panels
    const pp = f.at(cu, 0, -deep + 0.05);
    for (const dv of [0.3, 0.7]) w.geo(uvBox(wd * 0.8, ht * 0.28, 0.04), m.woodDark, { x: pp.x, y: op.v0 + ht * dv, z: pp.z }, f.rotY, chunk, false);
    // knocker
    const kp = f.at(cu + wd * 0.3, 0, -deep + 0.08);
    w.geo(new THREE.TorusGeometry(0.06, 0.012, 6, 12), m.bronze, { x: kp.x, y: op.v0 + 1.1, z: kp.z }, f.rotY, chunk, false);
    // transom arch fill
    fp(cu, op.v1 + 0.28, 0.32, 0.32, 0.08);
  }
  if (op.kind === 'shop') {
    if (op.shutter) {
      const sm = m.get('shutterMat', () => {
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 64;
        const g = c.getContext('2d')!;
        for (let y = 0; y < 64; y += 8) {
          const grd = g.createLinearGradient(0, y, 0, y + 8);
          grd.addColorStop(0, '#8a8c88');
          grd.addColorStop(0.5, '#5c5f5c');
          grd.addColorStop(1, '#3a3c3a');
          g.fillStyle = grd;
          g.fillRect(0, y, 64, 8);
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1, 6);
        return new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.5, color: 0xb0b0a8 });
      });
      w.geo(new THREE.PlaneGeometry(wd, ht), sm, { x: back.x, y: op.v0 + ht / 2, z: back.z }, f.rotY, chunk, false);
      // graffiti tag on some shutters
    } else {
      const glass = op.lit ? m.get('shopLit', () => new THREE.MeshStandardMaterial({ color: 0x2a2014, emissive: 0xffc890, emissiveIntensity: 0.55, roughness: 0.2 })) : m.glassDark;
      w.geo(new THREE.PlaneGeometry(wd, ht), glass, { x: back.x, y: op.v0 + ht / 2, z: back.z }, f.rotY, chunk, false);
    }
  }
  if (op.kind === 'arch') {
    // decorative arch surround (for portales / church windows)
    const p = f.at(cu, 0, 0.05);
    const shape = new THREE.Shape();
    const R = wd / 2 + 0.18;
    shape.absarc(0, 0, R, 0, Math.PI, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, wd / 2, Math.PI, 0, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 16 });
    g.translate(0, 0, -0.06);
    w.geo(g, cant, { x: p.x, y: op.v1 - wd / 2, z: p.z }, f.rotY, chunk);
  }
}

function ironBars(w: World, f: ReturnType<typeof frame>, op: Opening, chunk: string) {
  const wd = op.u1 - op.u0;
  const ht = op.v1 - op.v0;
  const n = Math.max(3, Math.floor(wd / 0.13));
  const bar = new THREE.CylinderGeometry(0.011, 0.011, ht + 0.1, 4);
  for (let i = 1; i < n; i++) {
    const p = f.at(op.u0 + (i * wd) / n, 0, 0.1);
    w.geo(bar, w.mats.iron, { x: p.x, y: op.v0 + ht / 2, z: p.z }, 0, chunk, false);
  }
  for (const dv of [0.1, ht * 0.5, ht - 0.05]) {
    const p = f.at(op.u0 + wd / 2, 0, 0.1);
    w.geo(uvBox(wd, 0.025, 0.025), w.mats.iron, { x: p.x, y: op.v0 + dv, z: p.z }, f.rotY, chunk, false);
  }
  // little curls at top (herrería)
  const t = new THREE.TorusGeometry(0.05, 0.008, 4, 10, Math.PI);
  for (let i = 0; i < n; i += 2) {
    const p = f.at(op.u0 + ((i + 0.5) * wd) / n, 0, 0.1);
    w.geo(t, w.mats.iron, { x: p.x, y: op.v1 - 0.12, z: p.z }, f.rotY, chunk, false);
  }
}

/** Wall bracket lantern (arbotante) */
export function wallLantern(w: World, p: THREE.Vector3, rotY: number, chunk: string, group: string, flick: 'none' | 'faulty' = 'none') {
  const m = w.mats;
  const n = new THREE.Vector3(Math.sin(rotY + Math.PI / 2) * 0, 0, 0);
  void n;
  const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)); // local +z in world
  const arm = p.clone().addScaledVector(out, 0.35);
  w.geo(uvBox(0.05, 0.05, 0.7), m.iron, { x: p.x + out.x * 0.35, y: p.y + 0.35, z: p.z + out.z * 0.35 }, rotY, chunk, false);
  w.geo(new THREE.TorusGeometry(0.18, 0.015, 4, 12, Math.PI / 2), m.iron, { x: p.x + out.x * 0.1, y: p.y + 0.2, z: p.z + out.z * 0.1 }, rotY + Math.PI / 2, chunk, false);
  const lanternPos = arm.clone().addScaledVector(out, 0.3);
  lanternPos.y += 0.05;
  // lantern cage
  const cage = new THREE.CylinderGeometry(0.16, 0.1, 0.4, 6, 1, true);
  w.geo(cage, m.get('lanternGlass', () => new THREE.MeshStandardMaterial({ color: 0x1b1a16, metalness: 0.6, roughness: 0.4, wireframe: false, side: THREE.DoubleSide })), { x: lanternPos.x, y: lanternPos.y, z: lanternPos.z }, 0, chunk, false);
  w.geo(new THREE.ConeGeometry(0.22, 0.2, 6), m.iron, { x: lanternPos.x, y: lanternPos.y + 0.3, z: lanternPos.z }, 0, chunk, false);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.lampOn);
  bulb.position.copy(lanternPos);
  w.group('bulbs').add(bulb);
  return w.lamp('wl' + Math.round(p.x * 10) + '_' + Math.round(p.z * 10), lanternPos, { color: 0xffa24a, intensity: 5, distance: 11, bulb, poolY: 0.01, poolSize: 6, group, flicker: flick });
}

/** Painted sign plane on a facade */
export function sign(w: World, f: ReturnType<typeof frame>, u: number, v: number, width: number, height: number, text: string, opts: Parameters<typeof signTexture>[1] = {}, chunk = 'plaza'): THREE.Mesh {
  const tex = signTexture(text, { w: 1024, h: Math.round((1024 * height) / width), ...opts });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06 });
  const mesh = new THREE.Mesh(uvPlane(width, height, 1 / width, 1 / height), mat);
  const p = f.at(u, v, 0.09);
  mesh.position.copy(p);
  mesh.rotation.y = f.rotY;
  w.group('signs').add(mesh);
  mesh.userData.chunk = chunk;
  return mesh;
}

/** cheap batched potted plant: clay pot + crossed leaf cards (+ optional bougainvillea dots) */
export function lightPlant(w: World, x: number, y: number, z: number, h: number, chunk: string, r: () => number = Math.random) {
  const m = w.mats;
  const pot = new THREE.CylinderGeometry(0.16, 0.11, 0.26, 8);
  w.geo(pot, m.terracotta, { x, y: y + 0.13, z }, 0, chunk, false);
  const tex = w.assets.tex('leaves/cluster.png');
  const leafMat = m.get('plantLeaf', () => new THREE.MeshStandardMaterial({ map: tex ?? null, color: tex ? 0xa8c098 : 0x2f5a2a, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }));
  const card = new THREE.PlaneGeometry(h, h);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI + r() * 0.4;
    w.geo(card, leafMat, { x, y: y + 0.25 + h * 0.42, z }, a, chunk, false);
  }
  if (r() < 0.5) {
    const fm = m.get('geranium', () => new THREE.MeshStandardMaterial({ color: 0xd8284a, roughness: 0.8, emissive: 0x300810, emissiveIntensity: 0.3 }));
    const s = new THREE.SphereGeometry(0.035, 5, 4);
    for (let i = 0; i < 6; i++) w.geo(s, fm, { x: x + (r() - 0.5) * h * 0.6, y: y + 0.35 + r() * h * 0.6, z: z + (r() - 0.5) * h * 0.6 }, 0, chunk, false);
  }
}
