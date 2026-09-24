import * as THREE from 'three';
import { World } from '../world';
import { facade, sign, frame, Opening } from './facade';
import { clockFace } from '../canvasTex';

export interface TownRefs {
  presidenciaClock: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  windowSilhouettes: THREE.Mesh[];
  signs: Record<string, { mesh: THREE.Mesh; alt: string; opts: any }>;
}

const COLORS = {
  ocre: 0xd09a55,
  terracota: 0xb45a3c,
  añil: 0x4a6aa8,
  mostaza: 0xdcae4a,
  rosa: 0xc86a8a,
  crema: 0xeadcc0,
  verde: 0x6d8a66,
  blanco: 0xefe8da,
  vino: 0x8a3a3a,
};

export function buildTown(w: World): TownRefs {
  const signs: TownRefs['signs'] = {};
  const sil: THREE.Mesh[] = [];
  // ---------------- SOUTH SIDE (z = 30, facing north) ----------------
  const south: [number, number, number, number, string | null, string | null][] = [
    [-30, -21, 9.2, COLORS.terracota, 'TORTILLERÍA LA GÜERITA', null],
    [-21, -12, 8.4, COLORS.crema, 'BOTICA SAN RAFAEL', null],
    [-12, -3, 9.6, COLORS.añil, null, null],
    [3, 12, 8.6, COLORS.mostaza, 'NEVERÍA LOS FAROLES', null],
    [12, 21, 9.4, COLORS.rosa, null, null],
    [21, 30, 8.2, COLORS.ocre, 'MERCERÍA "EL CARRETE"', null],
  ];
  south.forEach(([x0, x1, h, col, txt], i) => {
    const f = facade(w, { x0, z0: 30.2, x1, z1: 30.2, facing: 'n', height: h, color: col, auto: { ground: i % 2 ? 'house' : 'shop', upper: true, bay: 3.2 }, depth: 10, seed: 100 + i, lamps: [(x1 - x0) / 2], lampGroup: 'facade', base: 0.15 });
    if (txt) signs['s' + i] = { mesh: sign(w, f, f.L / 2, 3.15, 5.2, 0.55, txt, { bg: '#1c1a17', fg: '#e8c872' }), alt: txt, opts: {} };
  });

  // ---------------- NORTH SIDE pieces ----------------
  facade(w, { x0: -30, z0: -30.2, x1: -24, z1: -30.2, facing: 's', height: 8.8, color: COLORS.verde, auto: { ground: 'house', upper: true, bay: 3 }, depth: 4, seed: 200 });
  // block east of the callejón, west of the atrium
  facade(w, { x0: -20, z0: -30.2, x1: -16, z1: -30.2, facing: 's', height: 9.2, color: COLORS.ocre, openings: [{ u0: 1.4, u1: 2.6, v0: 4.2, v1: 6.4, kind: 'balcony' }, { u0: 1.4, u1: 2.6, v0: 0.9, v1: 2.6, kind: 'window', bars: true }], depth: 4, seed: 201, base: 0.15 });
  facade(w, { x0: 23, z0: -30.2, x1: 30, z1: -30.2, facing: 's', height: 8.4, color: COLORS.rosa, auto: { ground: 'shop', upper: true, bay: 3.4 }, depth: 4, seed: 202, base: 0.15 });

  // ---------------- EAST: Block A (Casa de la Cultura with clock) ----------------
  const fa = facade(w, {
    x0: 30.2, z0: -30, x1: 30.2, z1: -12, facing: 'w', height: 10.5, color: COLORS.crema, depth: 20, seed: 300, base: 0.15,
    openings: [
      { u0: 1.5, u1: 2.7, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 4.5, u1: 5.7, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 7.9, u1: 10.1, v0: 0.15, v1: 3.4, kind: 'door' },
      { u0: 12.3, u1: 13.5, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 15.3, u1: 16.5, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 1.5, u1: 2.7, v0: 4.3, v1: 7.0, kind: 'balcony' },
      { u0: 4.5, u1: 5.7, v0: 4.3, v1: 7.0, kind: 'balcony', lit: true },
      { u0: 8.2, u1: 9.8, v0: 4.3, v1: 7.2, kind: 'balcony' },
      { u0: 12.3, u1: 13.5, v0: 4.3, v1: 7.0, kind: 'balcony', lit: true },
      { u0: 15.3, u1: 16.5, v0: 4.3, v1: 7.0, kind: 'balcony' },
    ],
    lamps: [6.8, 11.2],
  });
  signs.cultura = { mesh: sign(w, fa, 9, 3.85, 6, 0.5, 'CASA DE LA CULTURA', { bg: '#2a2622', fg: '#e8dcc0', font: '"Cormorant Garamond", Georgia' }), alt: 'CASA DE LA CULTURA', opts: {} };
  // clock on the parapet (espadaña)
  {
    const p = fa.at(9, 11.3, 0.05);
    w.geo(new THREE.BoxGeometry(3.2, 2.2, 0.5), w.mats.cantera, { x: p.x - 0.2, y: 11.2, z: p.z }, fa.rotY);
    const tri = new THREE.ConeGeometry(1.9, 0.8, 3);
    w.geo(tri, w.mats.cantera, { x: p.x - 0.2, y: 12.6, z: p.z }, fa.rotY, 'plaza', true, undefined, new THREE.Euler(0, fa.rotY + Math.PI / 2, Math.PI / 2 * 0));
  }
  const pc = clockFace(11, 40);
  const ptex = new THREE.CanvasTexture(pc);
  ptex.colorSpace = THREE.SRGBColorSpace;
  const pmesh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshStandardMaterial({ map: ptex, emissive: 0xfff0c0, emissiveMap: ptex, emissiveIntensity: 0.35, roughness: 0.6 }));
  const cp = fa.at(9, 11.2, 0.28);
  pmesh.position.copy(cp);
  pmesh.rotation.y = fa.rotY;
  w.group('signs').add(pmesh);
  // plazuela north side (z=-12, facing south)
  facade(w, { x0: 30, z0: -12.2, x1: 50, z1: -12.2, facing: 's', height: 10.5, color: COLORS.crema, depth: 1, seed: 301, noCollider: true, roof: false, base: 0,
    openings: [
      { u0: 3, u1: 4.2, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 8, u1: 9.2, v0: 0.9, v1: 2.8, kind: 'window', bars: true },
      { u0: 13, u1: 14.2, v0: 0, v1: 2.6, kind: 'door' },
      { u0: 3, u1: 4.2, v0: 4.3, v1: 7, kind: 'balcony' },
      { u0: 8, u1: 9.2, v0: 4.3, v1: 7, kind: 'window' },
      { u0: 13, u1: 14.2, v0: 4.3, v1: 7, kind: 'balcony' },
      { u0: 17, u1: 18.2, v0: 4.3, v1: 7, kind: 'window', lit: true },
    ], lamps: [6, 16] });
  // behind stage (x=50 facing west)
  facade(w, { x0: 50.2, z0: -12, x1: 50.2, z1: 12, facing: 'w', height: 9, color: COLORS.vino, depth: 6, seed: 302, openings: [
    { u0: 3, u1: 4.2, v0: 4.3, v1: 7, kind: 'window' },
    { u0: 19.8, u1: 21, v0: 4.3, v1: 7, kind: 'window' },
    { u0: 20, u1: 21.2, v0: 0, v1: 2.6, kind: 'door' },
  ] });
  // plazuela south (z=12 facing north) — Block B
  const fb = facade(w, { x0: 30, z0: 12.2, x1: 50, z1: 12.2, facing: 'n', height: 8.6, color: COLORS.mostaza, depth: 3.6, seed: 303, auto: { ground: 'mixed', upper: true, bay: 3.6 }, lamps: [5, 15], base: 0 });
  void fb;
  // Block B corner on ring (x=30, z 12..16)
  facade(w, { x0: 30.2, z0: 12, x1: 30.2, z1: 16, facing: 'w', height: 8.6, color: COLORS.mostaza, depth: 1, seed: 304, openings: [{ u0: 1.4, u1: 2.6, v0: 4.3, v1: 6.6, kind: 'balcony' }, { u0: 1.4, u1: 2.6, v0: 0.9, v1: 2.6, kind: 'window', bars: true }], noCollider: true, roof: false, base: 0.15 });
  // Block C (x=30 facing west, z 22..30)
  const fc = facade(w, { x0: 30.2, z0: 22, x1: 30.2, z1: 30, facing: 'w', height: 9.4, color: COLORS.añil, depth: 8, seed: 305, auto: { ground: 'shop', upper: true, bay: 3.8 }, lamps: [4], base: 0.15 });
  signs.hotel = { mesh: sign(w, fc, 4, 3.2, 4.4, 0.5, 'HOTEL SAN ROQUE', { bg: '#101820', fg: '#d8e0ec', font: '"Cormorant Garamond", Georgia' }), alt: 'HOTEL SAN ROQUE', opts: {} };

  // silhouettes in windows (spirit presences) — planes behind lit windows, hidden by default
  const silMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92 });
  const silGeo = new THREE.PlaneGeometry(0.7, 1.5);
  const silSpots: [THREE.Vector3, number][] = [
    [fa.at(5.1, 5.4, -0.25), fa.rotY],
    [fa.at(12.9, 5.4, -0.25), fa.rotY],
    [frame({ x0: 21, z0: 30.2, x1: 12, z1: 30.2, facing: 'n' }).at(4.5, 5.2, -0.28), Math.PI],
  ];
  for (const [p, ry] of silSpots) {
    const s = new THREE.Mesh(silGeo, silMat);
    s.position.copy(p);
    s.rotation.y = ry;
    s.visible = false;
    w.scene.add(s);
    sil.push(s);
  }
  return { presidenciaClock: { canvas: pc, tex: ptex }, windowSilhouettes: sil, signs };
}

export function setClock(ref: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }, h: number, m: number) {
  clockFace(h, m, true, ref.canvas);
  ref.tex.needsUpdate = true;
}

export type { Opening };
