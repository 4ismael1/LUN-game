import * as THREE from 'three';
import { World } from '../world';
import { rand } from '../geom';
import { LoopStreet, STREET_LEN } from './streets';

/**
 * Neighbourhood filler: every patch of ground outside the playable areas gets a block of
 * houses, so gaps between buildings and the ends of alleys show more town instead of an
 * empty plane, and nothing leads out of the map.
 */

type Rect = [number, number, number, number]; // x0, z0, x1, z1

/** playable spaces (walkable or enterable) — the filler never goes inside these */
const PLAYABLE: Rect[] = [
  [-34, -36, 50, 30.5], // plaza, garden, ring streets, atrium
  [-6.5, -86, 6.5, -37.5], // church
  [8, -58, 12.5, -50], // sacristy
  [-14.5, -42.5, -6.5, -36], // tower
  [-42, -30, -30, 30], // arcade + shops
  [-66, -26, -42, 8], // market + clock shop
  [-24, -80, -20, -31], // alley
  [-19.8, -52, -15, -44], // corral
  [-43, -76, -24, -52], // house + patio
  [30, -12, 52, 12], // stage square
];

function facadeTexture(seed: number, lit: boolean) {
  // 3 bays x 3 floors of 4 m x 3.2 m; tiles every 12 m x 9.6 m
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 307;
  const x = c.getContext('2d')!;
  const r = rand(seed);
  const bw = 128, fh = 102;
  if (!lit) {
    // albedo: aged plaster (tinted by the material colour), dark recessed windows
    x.fillStyle = '#d8d0c4';
    x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${60 + r() * 40},${50 + r() * 30},${40 + r() * 20},${0.04 + r() * 0.06})`;
      x.fillRect(r() * c.width, r() * c.height, 2 + r() * 14, 2 + r() * 10);
    }
    // grime from the top and a darker base
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, 'rgba(40,30,25,0.25)');
    g.addColorStop(0.15, 'rgba(40,30,25,0)');
    g.addColorStop(0.85, 'rgba(40,30,25,0)');
    g.addColorStop(1, 'rgba(30,22,18,0.35)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
  } else {
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
  }
  for (let f = 0; f < 3; f++)
    for (let b = 0; b < 3; b++) {
      const ground = f === 2; // canvas y grows downwards: last row is the ground floor
      const door = ground && r() < 0.35;
      const w = door ? 42 : 38, h = door ? 78 : 52;
      const cx = b * bw + bw / 2, top = f * fh + (door ? fh - h - 2 : 22);
      const glow = r() < 0.12;
      if (!lit) {
        x.fillStyle = '#8a7a68';
        x.fillRect(cx - w / 2 - 5, top - 5, w + 10, h + 10); // cantera frame
        x.fillStyle = glow ? '#3a2a18' : '#15120f';
        x.fillRect(cx - w / 2, top, w, h);
        if (!door) {
          x.fillStyle = 'rgba(20,16,12,0.9)';
          for (let k = 1; k < 5; k++) x.fillRect(cx - w / 2 + (k * w) / 5 - 1, top, 2, h); // bars
        }
      } else if (glow && !door) {
        x.fillStyle = r() < 0.5 ? '#ffb45a' : '#d89040';
        x.fillRect(cx - w / 2, top, w, h);
        x.fillStyle = 'rgba(0,0,0,0.85)';
        for (let k = 1; k < 5; k++) x.fillRect(cx - w / 2 + (k * w) / 5 - 1, top, 2, h);
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 12, 1 / 9.6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildFiller(w: World, streets: LoopStreet[]) {
  const playable: Rect[] = [...PLAYABLE];
  for (const st of streets) {
    // street corridor plus the facades on both sides
    const a = st.mouth.clone().addScaledVector(st.right, -8.5);
    const b = st.mouth.clone().addScaledVector(st.dir, STREET_LEN + 1).addScaledVector(st.right, 8.5);
    playable.push([Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)]);
  }
  const X0 = -104, Z0 = -118, X1 = 84, Z1 = 64;
  const C = 0.5;
  const nx = Math.round((X1 - X0) / C), nz = Math.round((Z1 - Z0) / C);
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = X0 + (i + 0.5) * C, z = Z0 + (j + 0.5) * C;
      let ok = true;
      // keep a 1.2 m margin around every playable space: doorways and the seams between
      // adjacent spaces (church door, tower, corral…) must never be walled in
      const M = 1.2;
      for (const [a, b, c, d] of playable)
        if (x > a - M && x < c + M && z > b - M && z < d + M) {
          ok = false;
          break;
        }
      if (ok && w.col.solidAt(x, z, 0.5, 2.5, 0.05)) ok = false;
      if (ok) for (const dr of w.doors) if (Math.hypot(x - dr.hingePos.x, z - dr.hingePos.z) < 2.5) ok = false;
      free[j * nx + i] = ok ? 1 : 0;
    }
  // greedy rectangles, at most ~12 m per side so the skyline varies
  const MAX = Math.round(12 / C);
  const r = rand(4242);
  const colors = [0xc9a46e, 0xb86a4c, 0x6f84a8, 0xcfb060, 0xb47a8a, 0xd8ccb4, 0x7f9474, 0xa85848];
  const mats = colors.map((col, k) => {
    const m = new THREE.MeshStandardMaterial({ color: col, map: facadeTexture(50 + k, false), roughness: 0.95 });
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = facadeTexture(50 + k, true);
    m.emissiveIntensity = 0.55;
    return m;
  });
  const roofMats = [w.mats.pbr('roof_tiles', { repeat: 0.4, color: 0x9a5a44, rough: 0.9 }), w.mats.pbr('concrete', { repeat: 0.3, color: 0x6a6660, rough: 1 })];
  let count = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!free[j * nx + i]) continue;
      let wi = 0;
      while (i + wi < nx && wi < MAX && free[j * nx + i + wi]) wi++;
      let hj = 1;
      grow: while (j + hj < nz && hj < MAX) {
        for (let k = 0; k < wi; k++) if (!free[(j + hj) * nx + i + k]) break grow;
        hj++;
      }
      for (let jj = 0; jj < hj; jj++) for (let k = 0; k < wi; k++) free[(j + jj) * nx + i + k] = 0;
      const sx = wi * C, sz = hj * C;
      if (sx < 0.49 || sz < 0.49) continue;
      const cx = X0 + (i + wi / 2) * C, cz = Z0 + (j + hj / 2) * C;
      const h = 6.4 + Math.floor(r() * 3) * 3.2 * (r() < 0.6 ? 0.5 : 1);
      w.box(cx, 0, cz, sx, h, sz, mats[Math.floor(r() * mats.length)], { col: true, chunk: 'filler', cast: false });
      // roof slab + parapet lip so the top never shows the facade pattern
      w.box(cx, h, cz, sx + 0.3, 0.35, sz + 0.3, roofMats[r() < 0.55 ? 0 : 1], { chunk: 'filler', cast: false });
      count++;
    }
  return count;
}
