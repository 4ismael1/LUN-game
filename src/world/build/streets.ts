import * as THREE from 'three';
import { World } from '../world';
import { uvBox } from '../geom';
import { facade, Facing, Opening, wallLantern } from './facade';
import { signTexture } from '../canvasTex';

export interface LoopStreet {
  name: string;
  mouth: THREE.Vector3;
  dir: THREE.Vector3; // outward
  right: THREE.Vector3;
  barrier: THREE.Group;
  barrierCols: import('../colliders').Collider[];
  fogWall: THREE.Mesh;
}

export const LOOP_D = 38;
export const STREET_LEN = 58;
export const STREET_HALF = 3;

function facingOf(v: THREE.Vector3): Facing {
  if (Math.abs(v.x) > Math.abs(v.z)) return v.x > 0 ? 'e' : 'w';
  return v.z > 0 ? 's' : 'n';
}

export function toLocal(st: LoopStreet, p: THREE.Vector3) {
  const d = p.clone().sub(st.mouth);
  return { s: d.dot(st.dir), x: d.dot(st.right) };
}
export function toWorld(st: LoopStreet, s: number, x: number, y: number) {
  return new THREE.Vector3(st.mouth.x + st.dir.x * s + st.right.x * x, y, st.mouth.z + st.dir.z * s + st.right.z * x);
}

const BAND_OPENINGS = (L: number): Opening[] => {
  // symmetric around the middle of the segment (the loop point)
  const c = L / 2;
  const ops: Opening[] = [];
  for (let k = -12; k <= 12; k += 3) {
    const u = c + k;
    if (k % 9 === 0) ops.push({ u0: u - 0.7, u1: u + 0.7, v0: 0.15, v1: 2.7, kind: 'door' });
    else ops.push({ u0: u - 0.6, u1: u + 0.6, v0: 1.0, v1: 2.6, kind: 'window', bars: true });
    if (Math.abs(k) === 3 || Math.abs(k) === 9) ops.push({ u0: u - 0.6, u1: u + 0.6, v0: 4.0, v1: 6.4, kind: 'balcony' });
    else ops.push({ u0: u - 0.55, u1: u + 0.55, v0: 4.3, v1: 6.2, kind: 'window' });
  }
  return ops;
};

export function buildStreets(w: World): LoopStreet[] {
  const defs: [string, THREE.Vector3, THREE.Vector3, number][] = [
    ['Calle Nieto', new THREE.Vector3(0, 0, 30.2), new THREE.Vector3(0, 0, 1), 0xd8b890],
    ['Calle Tepetate', new THREE.Vector3(30.2, 0, 19), new THREE.Vector3(1, 0, 0), 0xc89070],
    ['Calle de la Luz', new THREE.Vector3(20, 0, -30.2), new THREE.Vector3(0, 0, -1), 0xa8b8a0],
  ];
  const out: LoopStreet[] = [];
  const palette = [0xd09a55, 0xb45a3c, 0x4a6aa8, 0xdcae4a, 0xc86a8a, 0xeadcc0, 0x6d8a66];
  defs.forEach(([name, mouth, dir, bandColor], si) => {
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const ch = 'street' + si;
    const at = (s: number, x: number) => new THREE.Vector3(mouth.x + dir.x * s + right.x * x, 0, mouth.z + dir.z * s + right.z * x);
    // ground: cobble roadway and raised sidewalks
    const mid = at(STREET_LEN / 2, 0);
    const alongX = Math.abs(dir.x) > 0.5;
    const len = STREET_LEN;
    const sz = alongX ? [len, 2 * STREET_HALF] : [2 * STREET_HALF, len];
    w.box(mid.x, -0.02, mid.z, sz[0], 0.03, sz[1], w.mats.cobble, { chunk: ch, cast: false });
    for (const side of [-1, 1]) {
      const c = at(STREET_LEN / 2, side * (STREET_HALF - 0.6));
      const s2 = alongX ? [len, 1.2] : [1.2, len];
      w.box(c.x, 0, c.z, s2[0], 0.15, s2[1], w.mats.sidewalk, { col: true, chunk: ch, cast: false });
    }
    // facades: segments before the band are random; the band [30,46] is mirrored and symmetric
    const segs: [number, number, boolean][] = [[1, 8, false], [8, 15, false], [15, 22, false], [22, 54, true], [54, STREET_LEN, false]];
    for (const side of [-1, 1]) {
      const inward = right.clone().multiplyScalar(-side);
      const facing = facingOf(inward);
      for (const [s0, s1, band] of segs) {
        const p0 = at(s0, side * STREET_HALF);
        const p1 = at(s1, side * STREET_HALF);
        const L = s1 - s0;
        const color = band ? bandColor : palette[(si * 7 + s0 + (side > 0 ? 3 : 0)) % palette.length];
        facade(w, {
          x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z, facing, height: band ? 8.6 : 7.5 + ((s0 * 13 + si) % 3), color, depth: 5, chunk: ch,
          seed: 700 + si * 50 + s0 + (side > 0 ? 7 : 0), base: 0.15,
          openings: band ? BAND_OPENINGS(L) : undefined,
          auto: band ? undefined : { ground: 'mixed', upper: true, bay: 3.4 },
          plain: band,
          roof: true,
        });
      }
      // symmetric lanterns in band
      for (const s of [22.5, 30, LOOP_D, 46, 53.5]) {
        const p = at(s, side * (STREET_HALF - 0.05));
        p.y = 3.3;
        const ry = Math.atan2(inward.x, inward.z);
        wallLantern(w, p, ry, ch, 'street');
      }
      const p = at(12, side * (STREET_HALF - 0.05));
      p.y = 3.3;
      wallLantern(w, p, Math.atan2(inward.x, inward.z), ch, 'street', side > 0 ? 'faulty' : 'none');
    }
    // end wall far away (hidden by fog)
    const endC = at(STREET_LEN, 0);
    const es = alongX ? [0.5, 2 * STREET_HALF + 1] : [2 * STREET_HALF + 1, 0.5];
    w.box(endC.x, 0, endC.z, es[0], 9, es[1], w.mats.plaster(0x4a4a50), { col: true, chunk: ch });
    // street name plaque at the mouth (cantera plaque on the corner)
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), new THREE.MeshStandardMaterial({ map: signTexture(name.toUpperCase(), { w: 512, h: 150, bg: '#e8e0cc', fg: '#2a2018', font: '"Cormorant Garamond", Georgia', aged: 0.6 }), roughness: 0.8 }));
    const pp = at(1.2, STREET_HALF - 0.02);
    plq.position.set(pp.x, 3.0, pp.z);
    plq.rotation.y = Math.atan2(-right.x, -right.z);
    w.group('signs').add(plq);
    // prologue barriers (vallas) at s=9
    const barrier = new THREE.Group();
    const barrierCols: import('../colliders').Collider[] = [];
    const vm = w.mats.flat(0x9a9a9a, { metal: 0.8, rough: 0.4, key: 'valla' });
    for (let k = -1; k <= 1; k++) {
      const c = at(9, k * 1.9);
      const valla = new THREE.Group();
      const top = new THREE.Mesh(uvBox(1.9, 0.05, 0.05), vm);
      top.position.y = 1.1;
      valla.add(top);
      const bot = top.clone();
      bot.position.y = 0.25;
      valla.add(bot);
      for (let b = 0; b <= 8; b++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 4), vm);
        bar.position.set(-0.95 + b * 0.2375, 0.67, 0);
        valla.add(bar);
      }
      for (const fx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(uvBox(0.04, 1.1, 0.5), vm);
        leg.position.set(fx, 0.55, 0);
        valla.add(leg);
      }
      valla.position.copy(c);
      valla.rotation.y = Math.atan2(right.x, right.z) - Math.PI / 2;
      barrier.add(valla);
    }
    const bs = at(9, 0);
    const bsz = alongX ? [0.4, 2 * STREET_HALF] : [2 * STREET_HALF, 0.4];
    barrierCols.push(w.col.addBox(bs.x, 0, bs.z, bsz[0], 1.2, bsz[1], { opaque: false }));
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('CERRADO · VERBENA', { w: 512, h: 180, bg: '#f2cf3a', fg: '#1a1a1a' }), roughness: 0.8, side: THREE.DoubleSide }));
    signM.position.set(bs.x, 1.45, bs.z);
    signM.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    barrier.add(signM);
    w.scene.add(barrier);
    // fog wall: a soft dark gradient plane across the street beyond the band (never reached)
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.85, depthWrite: false });
    const fogWall = new THREE.Mesh(new THREE.PlaneGeometry(2 * STREET_HALF + 1, 10), fogMat);
    const fw = at(52, 0);
    fogWall.position.set(fw.x, 5, fw.z);
    fogWall.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    fogWall.visible = false;
    w.scene.add(fogWall);
    out.push({ name, mouth, dir, right, barrier, barrierCols, fogWall });
    w.zone('street:' + si, Math.min(at(0.5, -3).x, at(STREET_LEN, 3).x), Math.min(at(0.5, -3).z, at(STREET_LEN, 3).z), Math.max(at(0.5, -3).x, at(STREET_LEN, 3).x), Math.max(at(0.5, -3).z, at(STREET_LEN, 3).z), { priority: 3, reverb: [0.25, 0.1, 0], footstep: 'stone' });
  });
  return out;
}
