import * as THREE from 'three';
import { World, Door } from '../world';
import { uvBox } from '../geom';

export interface Hole {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * Axis-aligned wall from (x0,z0) to (x1,z1) (must share x or z), centered on the line,
 * between heights y0..y1 with rectangular holes (u measured from the first point).
 */
export function holeWall(w: World, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, t: number, holes: Hole[], mat: THREE.Material, chunk: string, col = true, opaque = true) {
  const alongX = Math.abs(z1 - z0) < 1e-6;
  const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const sx = alongX ? Math.sign(x1 - x0) || 1 : 0;
  const sz = alongX ? 0 : Math.sign(z1 - z0) || 1;
  const us = new Set<number>([0, L]);
  for (const h of holes) {
    us.add(Math.max(0, Math.min(L, h.u0)));
    us.add(Math.max(0, Math.min(L, h.u1)));
  }
  const ul = [...us].sort((a, b) => a - b);
  const H = y1 - y0;
  for (let i = 0; i < ul.length - 1; i++) {
    const ua = ul[i], ub = ul[i + 1];
    if (ub - ua < 1e-4) continue;
    const mid = (ua + ub) / 2;
    const inS = holes.filter((h) => h.u0 <= mid && h.u1 >= mid).sort((a, b) => a.v0 - b.v0);
    let v = 0;
    const spans: [number, number][] = [];
    for (const h of inS) {
      if (h.v0 > v) spans.push([v, h.v0]);
      v = Math.max(v, h.v1);
    }
    if (v < H) spans.push([v, H]);
    const cx = x0 + sx * mid;
    const cz = z0 + sz * mid;
    const len = ub - ua;
    for (const [va, vb] of spans) {
      const w_ = alongX ? len : t;
      const d_ = alongX ? t : len;
      w.box(cx, y0 + va, cz, w_, vb - va, d_, mat, { col, chunk, opaque });
    }
  }
}

export function floorRect(w: World, x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material, chunk: string, thick = 0.2, col = true) {
  return w.boxMM(Math.min(x0, x1), y - thick, Math.min(z0, z1), Math.max(x0, x1), y, Math.max(z0, z1), mat, { col, chunk, cast: false });
}

export function ceilingRect(w: World, x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material, chunk: string, thick = 0.25) {
  return w.boxMM(Math.min(x0, x1), y, Math.min(z0, z1), Math.max(x0, x1), y + thick, Math.max(z0, z1), mat, { col: true, chunk, cast: true });
}

/**
 * Create a hinged door. The door panel extends from the hinge along `dir` ('+x','-x','+z','-z').
 * openSign: +1 or -1 swing direction.
 */
export function makeDoor(
  w: World,
  id: string,
  hinge: THREE.Vector3,
  dir: '+x' | '-x' | '+z' | '-z',
  width: number,
  height: number,
  openSign: 1 | -1,
  mat: THREE.Material,
  opts: { thickness?: number; locked?: boolean; lockedMsg?: string; sound?: 'wood' | 'iron' | 'shutter'; knob?: boolean; bars?: boolean; label?: string; parent?: THREE.Object3D } = {},
): Door {
  const pivot = new THREE.Group();
  pivot.position.copy(hinge);
  const base = dir === '+x' ? 0 : dir === '-x' ? Math.PI : dir === '+z' ? -Math.PI / 2 : Math.PI / 2;
  pivot.userData.baseRot = base;
  pivot.rotation.y = base;
  const th = opts.thickness ?? 0.08;
  if (opts.bars) {
    // iron gate: frame + bars
    const iron = w.mats.iron;
    const fr = new THREE.Mesh(uvBox(width, 0.06, 0.05), iron);
    fr.position.set(width / 2, height - 0.03, 0);
    pivot.add(fr);
    const fr2 = fr.clone();
    fr2.position.y = 0.1;
    pivot.add(fr2);
    const fr3 = fr.clone();
    fr3.position.y = height * 0.5;
    pivot.add(fr3);
    const n = Math.floor(width / 0.12);
    for (let i = 0; i <= n; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, height, 4), iron);
      b.position.set((i / n) * width, height / 2, 0);
      pivot.add(b);
    }
    for (let i = 0; i < n; i += 2) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 4, 10), iron);
      c.position.set(((i + 1) / n) * width, height * 0.75, 0);
      pivot.add(c);
    }
  } else {
    const panel = new THREE.Mesh(uvBox(width, height, th), mat);
    panel.position.set(width / 2, height / 2, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    pivot.add(panel);
    // decorative raised panels
    const pm = w.mats.woodDark;
    for (const fy of [0.28, 0.7]) {
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(uvBox(width * 0.7, height * 0.3, 0.03), pm);
        p.position.set(width / 2, height * fy, side * (th / 2 + 0.012));
        pivot.add(p);
      }
    }
    if (opts.knob !== false) {
      for (const side of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), w.mats.bronze);
        k.position.set(width - 0.1, 1.0, side * (th / 2 + 0.04));
        pivot.add(k);
      }
    }
  }
  (opts.parent ?? w.group('doors')).add(pivot);
  const axis = dir === '+x' || dir === '-x' ? 'x' : 'z';
  const door = new Door(id, pivot, width, height, (Math.PI / 2) * 0.92 * openSign, axis, hinge.clone(), w.col, th);
  door.locked = !!opts.locked;
  if (opts.lockedMsg) door.lockedMsg = opts.lockedMsg;
  door.sound = opts.sound ?? (opts.bars ? 'iron' : 'wood');
  w.doors.push(door);
  return door;
}

export function doorCenter(d: Door): THREE.Vector3 {
  const base = d.pivot.userData.baseRot ?? 0;
  return new THREE.Vector3(d.hingePos.x + Math.cos(base) * d.width * 0.5, d.hingePos.y + 1.1, d.hingePos.z - Math.sin(base) * d.width * 0.5);
}
