import * as THREE from 'three';
import { World, Door } from '../world';
import { uvBox } from '../geom';
import { holeWall, floorRect, makeDoor } from './helpers';
import { facade, sign, frame, wallLantern } from './facade';
import { clockFace, chalkMark, makeCanvasTex } from '../canvasTex';
import { pinata } from './plaza';

export interface MarketRefs {
  shutterPanaderia: THREE.Mesh;
  cantinaLamp: string;
  cantinaTV: THREE.Mesh;
  almacenDoor: Door;
  relojDoor: Door;
  marketGate: THREE.Object3D;
  clocks: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; h: number; m: number; speed: number }[];
  masterClock: { pos: THREE.Vector3; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; pendulum: THREE.Object3D };
  drawer: THREE.Object3D;
  chalkArrows: THREE.Mesh[];
  batteries: THREE.Vector3[];
  signs: Record<string, { mesh: THREE.Mesh; alt: string }>;
  lockers: THREE.Vector3[];
  arcadeLamps: string[];
  cantinaPos: THREE.Vector3;
}

export function buildMarket(w: World): MarketRefs {
  const m = w.mats;
  const ch = 'market';
  const signs: MarketRefs['signs'] = {};
  const X = -30; // arcade outer line
  const XS = -34; // shop fronts
  const XB = -42; // shops back / market hall front
  const Z0 = -30, Z1 = 30;
  const archZ0 = -26, archZ1 = 26;
  const cant = m.cantera;
  const plaster = m.plaster(0xd9a860);
  // ---- arcade floor ----
  w.boxMM(XS, 0, archZ0, X, 0.15, archZ1, m.pbr('stone_floor', { repeat: 0.5, color: 0xb8a898, rough: 0.7, key: 'arcadeFloor' }), { col: true, chunk: ch, cast: false });
  // arcade ceiling (wooden beams)
  w.boxMM(XS, 4.6, archZ0, X, 4.8, archZ1, m.woodDark, { chunk: ch });
  for (let z = archZ0; z <= archZ1; z += 1.3) w.box((XS + X) / 2, 4.45, z, 4, 0.15, 0.14, m.woodDark, { chunk: ch, cast: false });
  // piers + arches along x=-30.4
  const nArch = 13;
  const bay = (archZ1 - archZ0) / nArch;
  for (let i = 0; i <= nArch; i++) {
    const z = archZ0 + i * bay;
    w.box(X - 0.4, 0, z, 0.8, 4.8, 0.8, cant, { col: true, chunk: ch });
    w.box(X - 0.4, 0, z, 1.0, 0.5, 1.0, m.canteraDark, { chunk: ch });
    w.box(X - 0.4, 3.0, z, 1.0, 0.3, 1.0, m.canteraDark, { chunk: ch });
  }
  for (let i = 0; i < nArch; i++) {
    const zc = archZ0 + (i + 0.5) * bay;
    const sh = new THREE.Shape();
    const span = bay - 0.8;
    const rr = span / 2;
    sh.moveTo(-bay / 2, 0);
    sh.lineTo(bay / 2, 0);
    sh.lineTo(bay / 2, rr + 0.9);
    sh.lineTo(-bay / 2, rr + 0.9);
    sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-rr, 0);
    hole.absarc(0, 0, rr, Math.PI, 0, true);
    hole.lineTo(-rr, 0);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false, curveSegments: 14 });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.6, uv.getY(k) * 0.6);
    g.translate(0, 0, -0.4);
    w.geo(g, cant, { x: X - 0.4, y: 3.3, z: zc }, Math.PI / 2, ch);
    // hanging lantern in each arch
    if (i % 2 === 0) {
      const lp = new THREE.Vector3((XS + X) / 2 + 0.6, 3.6, zc);
      w.geo(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4), m.iron, { x: lp.x, y: 4.1, z: lp.z }, 0, ch, false);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.34, 6), m.lampOn);
      bulb.position.copy(lp);
      w.group('bulbs').add(bulb);
      w.geo(new THREE.ConeGeometry(0.22, 0.16, 6), m.iron, { x: lp.x, y: lp.y + 0.26, z: lp.z }, 0, ch, false);
      w.lamp('arcade' + i, lp, { color: 0xffa650, intensity: 5, distance: 10, bulb, poolY: 0.15, poolSize: 6, group: 'arcade', flicker: i === 6 ? 'faulty' : 'none' });
    }
  }
  // corner blocks (solid ends of the building)
  w.boxMM(-46, 0, Z0, X, 10, archZ0 - 0.4, plaster, { col: true, chunk: ch });
  w.boxMM(-46, 0, archZ1 + 0.4, X, 10, Z1, plaster, { col: true, chunk: ch });
  // upper floor facade above the arcade
  facade(w, { x0: X, z0: archZ0, x1: X, z1: archZ1, facing: 'e', height: 10, base: 4.8, color: 0xd9a860, depth: 0.6, noCollider: true, roof: false, seed: 400, chunk: ch,
    openings: Array.from({ length: nArch }, (_, i) => {
      const c = (i + 0.5) * bay;
      return i % 3 === 1 ? { u0: c - 0.6, u1: c + 0.6, v0: 5.6, v1: 8.3, kind: 'balcony' as const, lit: i === 4 } : { u0: c - 0.55, u1: c + 0.55, v0: 5.9, v1: 8.0, kind: 'window' as const, lit: i === 9 };
    }) });
  // roof over the whole portales building
  w.boxMM(XB, 9.6, Z0, X, 9.9, Z1, m.concrete, { chunk: ch });

  // ---- shop fronts along x = -34 (facing +x into the arcade) ----
  interface Shop { z0: number; z1: number; name: string; kind: 'closed' | 'glass' | 'open' | 'door' | 'passage'; color?: string; fg?: string; alt?: string }
  const shops: Shop[] = [
    { z0: -26, z1: -22, name: 'ALMACÉN', kind: 'door', color: '#3a2a1a', fg: '#d8c8a0' },
    { z0: -22, z1: -18, name: 'ABARROTES LA CANDELARIA', kind: 'open', color: '#b03a2a', fg: '#f2e6c0', alt: 'ABARROTES LUCÍA' },
    { z0: -18, z1: -14, name: 'PANADERÍA LA ESPIGA', kind: 'glass', color: '#e8c872', fg: '#5a2a14', alt: 'PANADERÍA EL OLVIDO' },
    { z0: -14, z1: -10, name: 'FARMACIA DEL CARMEN', kind: 'closed', color: '#2a6a4a', fg: '#f2f0e0' },
    { z0: -10, z1: -6, name: 'MERCADO DE LA CANDELARIA', kind: 'passage', color: '#1c3a6a', fg: '#f2cf3a' },
    { z0: -6, z1: 2, name: 'CANTINA EL ÚLTIMO TRAGO', kind: 'open', color: '#1a1a1a', fg: '#e84a4a', alt: 'CANTINA EL ÚLTIMO ADIÓS' },
    { z0: 2, z1: 6, name: 'CENADURÍA DOÑA LUPE', kind: 'open', color: '#e0357a', fg: '#fff4d8', alt: 'CENADURÍA · NADIE' },
    { z0: 6, z1: 10, name: 'ARTESANÍAS LOS ARCOS', kind: 'glass', color: '#2f5fb0', fg: '#f2cf3a' },
    { z0: 10, z1: 14, name: 'PAPELERÍA', kind: 'closed', color: '#e8e2d0', fg: '#2a2a2a' },
    { z0: 14, z1: 18, name: 'ZAPATERÍA EL CAMINANTE', kind: 'closed', color: '#6a3a2a', fg: '#f2e6c0' },
    { z0: 18, z1: 26, name: 'HOTEL LOS PORTALES', kind: 'door', color: '#101820', fg: '#d8e0ec' },
  ];
  const holes = shops.map((s) => {
    const wd = s.kind === 'door' ? 1.3 : s.kind === 'passage' ? 3.0 : s.z1 - s.z0 - 1.2;
    const c = (s.z0 + s.z1) / 2 - Z0;
    return { u0: c - wd / 2 + 0, u1: c + wd / 2, v0: 0.15, v1: s.kind === 'passage' ? 3.6 : 3.0 };
  });
  // wall from z=-30 to 30 at x = XS; holes u measured from z=-30
  holeWall(w, XS - 0.25, Z0, XS - 0.25, Z1, 0, 4.6, 0.5, holes, plaster, ch);
  // back wall of shops (x = XB), with holes for the passage and almacén back door
  holeWall(w, XB, Z0, XB, Z1, 0, 9.6, 0.5, [{ u0: 20, u1: 24, v0: 0, v1: 3.6 }, { u0: 5.4, u1: 6.6, v0: 0, v1: 2.4 }], plaster, ch);
  // shop partitions
  for (const s of shops) w.boxMM(XB, 0, s.z0 - 0.1, XS - 0.5, 4.6, s.z0 + 0.1, plaster, { col: true, chunk: ch });
  w.boxMM(XB, 0, 25.9, XS - 0.5, 4.6, 26.1, plaster, { col: true, chunk: ch });
  // shop ceilings
  w.boxMM(XB, 4.6, archZ0, XS, 4.9, archZ1, m.plaster(0xe8dcc0), { chunk: ch, col: true });
  const fr = frame({ x0: XS, z0: Z0, x1: XS, z1: Z1, facing: 'e' });
  let shutterPanaderia!: THREE.Mesh;
  let cantinaTV!: THREE.Mesh;
  const batteries: THREE.Vector3[] = [];
  for (const s of shops) {
    const cz = (s.z0 + s.z1) / 2;
    const u = Z1 - cz; // facing east: u runs toward -z
    const wd = s.z1 - s.z0;
    const sg = sign(w, fr, u, 3.6, Math.min(3.6, wd - 0.4), 0.55, s.name, { bg: s.color, fg: s.fg, border: s.fg }, ch);
    signs[s.name] = { mesh: sg, alt: s.alt ?? s.name };
    // floor inside
    if (s.kind !== 'closed') floorRect(w, XB, s.z0, XS, s.z1, 0.15, s.kind === 'open' ? m.terracotta : m.stoneFloor, ch, 0.15);
    const holeW = s.kind === 'door' ? 1.3 : s.kind === 'passage' ? 3.0 : wd - 1.2;
    if (s.kind === 'closed') {
      // metal shutter down
      const sh = shutterMesh(w, holeW, 2.85);
      sh.position.set(XS - 0.1, 0.15 + 2.85 / 2, cz);
      sh.rotation.y = Math.PI / 2;
      w.group('market').add(sh);
      w.solid(XS - 0.1, 0, cz, 0.2, 3, holeW);
      // graffiti on some shutters
    } else if (s.kind === 'glass') {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(holeW, 2.85), m.get('shopGlass', () => new THREE.MeshStandardMaterial({ color: 0x1a2a30, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3 })));
      glass.position.set(XS - 0.2, 0.15 + 1.42, cz);
      glass.rotation.y = Math.PI / 2;
      w.group('market').add(glass);
      w.solid(XS - 0.2, 0, cz, 0.15, 3, holeW);
      if (s.name.startsWith('PANADER')) {
        // shelves with pan dulce (conchas)
        for (let k = 0; k < 3; k++) {
          w.box(XB + 1.2, 0.15 + 0.6 + k * 0.55, cz, 1.2, 0.05, wd - 0.8, m.wood, { chunk: ch });
          for (let j = 0; j < 7; j++) {
            const concha = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.flat(['#f0d8a8', '#8a5a3a', '#f2c0c8'][j % 3], { rough: 0.9 }));
            concha.position.set(XB + 1.0 + (j % 2) * 0.3, 0.15 + 0.66 + k * 0.55, s.z0 + 0.6 + j * 0.42);
            concha.scale.y = 0.6;
            w.group('market').add(concha);
          }
        }
        // shutter comes down at 11:50 (animated by story)
        shutterPanaderia = shutterMesh(w, holeW, 2.85);
        shutterPanaderia.position.set(XS - 0.05, 0.15 + 2.85 / 2 + 2.6, cz);
        shutterPanaderia.rotation.y = Math.PI / 2;
        shutterPanaderia.scale.y = 0.08;
        w.group('market').add(shutterPanaderia);
        const lp = new THREE.Vector3(XB + 3.5, 3.9, cz);
        w.lamp('panaderia', lp, { color: 0xfff0d0, intensity: 5, distance: 8, poolY: null, halo: false, group: 'shops' });
      } else {
        // artesanías: alebrijes / masks / talavera plates on shelves
        for (let k = 0; k < 3; k++) {
          w.box(XB + 0.5, 0.15 + 0.8 + k * 0.7, cz, 0.6, 0.05, wd - 0.6, m.wood, { chunk: ch });
          for (let j = 0; j < 5; j++) {
            const col = ['#e0357a', '#3fae5a', '#2f7fd0', '#f28c28', '#f2cf3a'][(j + k) % 5];
            const o = new THREE.Mesh(k === 1 ? new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16) : new THREE.DodecahedronGeometry(0.12, 0), k === 1 ? m.talavera : m.flat(col, { rough: 0.5 }));
            o.position.set(XB + 0.5, 0.15 + (k === 1 ? 1.62 : 0.95 + k * 0.7), s.z0 + 0.6 + j * 0.7);
            if (k === 1) o.rotation.z = Math.PI / 2;
            w.group('market').add(o);
          }
        }
        // lucha libre masks on the wall
        for (let j = 0; j < 4; j++) {
          const mk = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI), luchaMask(w, j));
          mk.position.set(XB + 0.28, 3.1, s.z0 + 0.8 + j * 0.8);
          mk.rotation.y = Math.PI / 2;
          w.group('market').add(mk);
        }
        w.lamp('artesanias', new THREE.Vector3(XB + 3, 3.9, cz), { color: 0xffe0b0, intensity: 4, distance: 7, poolY: null, halo: false, group: 'shops' });
      }
    } else if (s.kind === 'open') {
      if (s.name.startsWith('CANTINA')) {
        // bar counter, bottles, stools, jukebox/radio, TV
        w.box(XB + 2.2, 0.15, cz, 0.8, 1.1, wd - 2, m.woodDark, { col: true, chunk: ch });
        w.box(XB + 2.2, 1.25, cz, 1.0, 0.06, wd - 1.8, m.wood, { chunk: ch });
        for (let k = 0; k < 2; k++) w.box(XB + 0.35, 1.3 + k * 0.5, cz, 0.4, 0.04, wd - 1.5, m.wood, { chunk: ch });
        const bt = w.assets.instanced('bottle', Array.from({ length: 14 }, (_, i) => ({ pos: new THREE.Vector3(XB + 0.35, 1.34 + (i % 2) * 0.5, s.z0 + 1 + (i >> 1) * 0.85), rotY: i })), { height: 0.3 });
        if (bt) w.group('market').add(bt);
        for (let k = 0; k < 4; k++) w.prop('stool', XB + 3.2, 0.15, s.z0 + 1.6 + k * 1.5, 0, 0.75, { col: [0.4, 0.7, 0.4] });
        for (let k = 0; k < 2; k++) {
          w.prop('table_wood', XB + 6.0, 0.15, s.z0 + 2 + k * 3.6, Math.PI / 2, 0.78, { col: [1.1, 0.8, 0.8] });
          w.prop('chair_wood', XB + 6.8, 0.15, s.z0 + 2 + k * 3.6, -Math.PI / 2, 1.0, { col: [0.5, 0.9, 0.5] });
        }
        const tv = w.prop('tv_old', XB + 0.5, 2.6, s.z1 - 1, Math.PI / 2, 0.5);
        void tv;
        cantinaTV = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: 0x223040 }));
        cantinaTV.position.set(XB + 0.82, 2.86, s.z1 - 1);
        cantinaTV.rotation.y = Math.PI / 2;
        w.group('market').add(cantinaTV);
        w.prop('radio_vintage', XB + 2.2, 1.28, s.z1 - 1.4, Math.PI / 2, 0.25);
        // hanging bulbs / neon beer-like sign (generic)
        const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: neonTex('EL ÚLTIMO TRAGO'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        neon.position.set(XB + 0.3, 3.7, cz);
        neon.rotation.y = Math.PI / 2;
        w.group('market').add(neon);
        (neon as any).isNeon = true;
        w.lamp('cantina', new THREE.Vector3(XB + 4, 3.8, cz), { color: 0xff6a4a, intensity: 5, distance: 10, poolY: null, halo: false, group: 'cantina', flicker: 'neon' });
        w.lamp('cantina2', new THREE.Vector3(XB + 2.2, 3.4, cz + 2), { color: 0xffc080, intensity: 3, distance: 7, poolY: null, halo: false, group: 'cantina' });
        w.updaters.push((dt, t) => {
          (neon.material as THREE.MeshBasicMaterial).opacity = w.lights.get('cantina')!.level > 0.5 ? 0.85 + Math.sin(t * 40) * 0.05 : 0.0;
        });
      } else if (s.name.startsWith('ABARROTES')) {
        w.prop('shelf', XB + 0.4, 0.15, cz - 0.5, Math.PI / 2, 2.0, { col: [0.6, 2, 1.4] });
        w.prop('shelf', XB + 0.4, 0.15, cz + 1.0, Math.PI / 2, 2.0, { col: [0.6, 2, 1.4] });
        w.box(XB + 4.5, 0.15, cz, 0.7, 1.0, wd - 1.6, m.wood, { col: true, chunk: ch });
        w.prop('cardboard_box', XB + 6.5, 0.15, s.z0 + 0.6, 0.3, 0.34);
        w.prop('fruit_crate_1', XB + 5.8, 0.15, s.z1 - 0.6, 0, 0.25);
        w.prop('fruit_crate_2', XB + 5.2, 0.15, s.z1 - 0.6, 0.3, 0.26);
        batteries.push(new THREE.Vector3(XB + 4.5, 1.2, cz + 0.8));
        w.lamp('abarrotes', new THREE.Vector3(XB + 4, 3.9, cz), { color: 0xe8f0ff, intensity: 4, distance: 8, poolY: null, halo: false, group: 'shops', flicker: 'neon' });
      } else {
        // cenaduría: comal, pots, tables with oilcloth
        w.box(XB + 1.0, 0.15, cz, 1.4, 0.95, wd - 0.8, m.pbr('concrete', { color: 0xc86a4a, key: 'fonda' }), { col: true, chunk: ch });
        w.prop('pot', XB + 0.8, 1.1, cz - 0.6, 0, 0.3);
        w.prop('pot', XB + 1.2, 1.1, cz + 0.6, 1, 0.26);
        w.prop('clay_pot', XB + 0.8, 1.1, cz + 1.3, 0, 0.25);
        w.prop('table_wood', XB + 5, 0.15, cz, 0, 0.78, { col: [1.1, 0.8, 0.8] });
        w.prop('plastic_chair', XB + 5, 0.15, cz - 0.8, 0, 0.88, { col: [0.5, 0.8, 0.5] });
        w.prop('plastic_chair', XB + 5, 0.15, cz + 0.8, Math.PI, 0.88, { col: [0.5, 0.8, 0.5] });
        const oil = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.85), new THREE.MeshStandardMaterial({ map: makeCanvasTex(128, 128, (g) => {
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            g.fillStyle = (x + y) % 2 ? '#e8e0d0' : '#c83a3a';
            g.fillRect(x * 16, y * 16, 16, 16);
          }
        }), roughness: 0.4 }));
        oil.rotation.x = -Math.PI / 2;
        oil.position.set(XB + 5, 0.95, cz);
        w.group('market').add(oil);
        w.lamp('fonda', new THREE.Vector3(XB + 3, 3.9, cz), { color: 0xffd090, intensity: 4, distance: 8, poolY: null, halo: false, group: 'shops' });
      }
    } else if (s.kind === 'door') {
      // closed wooden door (hotel) or almacén door (interactive)
      if (s.name === 'HOTEL LOS PORTALES') {
        const d = new THREE.Mesh(uvBox(1.3, 2.85, 0.1), m.woodDoor);
        d.position.set(XS - 0.2, 0.15 + 1.42, cz);
        d.rotation.y = Math.PI / 2;
        w.group('market').add(d);
        w.solid(XS - 0.2, 0, cz, 0.15, 3, 1.3);
      }
    }
  }
  // almacén (storage) interior: boxes, barrels; front door (from arcade), back door (to market)
  const almZ = -24;
  floorRect(w, XB, -26, XS, -22, 0.15, m.concrete, ch, 0.15);
  w.prop('barrel', XB + 1, 0.15, -25.2, 0, 0.87, { col: [0.75, 0.9, 0.75] });
  w.prop('barrel', XB + 1.9, 0.15, -25.3, 1, 0.87, { col: [0.75, 0.9, 0.75] });
  w.prop('crate', XB + 5.5, 0.15, -25.4, 0, 0.35, { col: [0.85, 0.35, 0.45] });
  w.prop('cardboard_box', XB + 6, 0.5, -25.4, 0.4, 0.34);
  w.prop('broom', XB + 7.5, 0.15, -22.4, 0, 1.45);
  const almacenDoor = makeDoor(w, 'almacenFront', new THREE.Vector3(XS - 0.25, 0.15, -23.35), '-z', 1.3, 2.8, 1, m.woodDoor, { locked: true, lockedMsg: 'El almacén está cerrado por dentro.' });
  const relojBack = makeDoor(w, 'almacenBack', new THREE.Vector3(XB, 0.15, -23.4), '-z', 1.2, 2.3, -1, m.woodDoor, { locked: true, lockedMsg: 'Tiene un cerrojo del otro lado.' });
  relojBack.lockedMsg = 'Está atrancada del otro lado.';
  (almacenDoor as any).back = relojBack;
  w.lamp('almacen', new THREE.Vector3(XB + 4, 3.8, almZ), { color: 0xffe0b0, intensity: 2.5, distance: 7, poolY: null, halo: false, group: 'shops', flicker: 'faulty' });
  // passage to the market
  floorRect(w, XB, -10, XS, -6, 0.15, m.stoneFloor, ch, 0.15);
  // market iron gate (open)
  const marketGate = new THREE.Group();
  w.lamp('passage', new THREE.Vector3(XB + 4, 3.9, -8), { color: 0xffc080, intensity: 4, distance: 9, group: 'market', poolY: 0.15, poolSize: 5 });

  // ---------------- MARKET HALL ----------------
  const MX0 = -66, MX1 = XB, MZ0 = -26, MZ1 = 8;
  floorRect(w, MX0, MZ0, MX1, MZ1, 0.15, m.pbr('concrete', { repeat: 0.35, color: 0x9a9088, key: 'marketFloor' }), ch, 0.15);
  const hallWall = m.plaster(0xb8b0a0);
  holeWall(w, MX0, MZ0, MX1, MZ0, 0, 7.5, 0.5, [], hallWall, ch);
  holeWall(w, MX0, MZ1, MX1, MZ1, 0, 7.5, 0.5, [], hallWall, ch);
  holeWall(w, MX0, MZ0, MX0, MZ1, 0, 7.5, 0.5, [], hallWall, ch);
  // roof with broken skylight strips
  w.boxMM(MX0, 7.5, MZ0, MX1, 7.8, -14, m.rust, { chunk: ch, col: true });
  w.boxMM(MX0, 7.5, -12, MX1, 7.8, -2, m.rust, { chunk: ch, col: true });
  w.boxMM(MX0, 7.5, 0, MX1, 7.8, MZ1, m.rust, { chunk: ch, col: true });
  for (const z of [-14, -12, -2, 0]) w.box((MX0 + MX1) / 2, 7.2, z, MX1 - MX0, 0.3, 0.2, m.iron, { chunk: ch });
  // columns
  for (let x = -62; x <= -46; x += 6) for (let z = -22; z <= 6; z += 7) {
    w.box(x, 0.15, z, 0.3, 7.3, 0.3, m.ironGreen, { chunk: ch, col: true, opaque: false });
  }
  // market lamps (hanging), all go dark during the blackout section
  for (const [x, z] of [[-45, -8], [-51, -8], [-57, -8], [-45, -22], [-51, -15], [-57, -22], [-45, 3], [-57, 3]]) {
    const lp = new THREE.Vector3(x, 5.2, z);
    w.geo(new THREE.CylinderGeometry(0.008, 0.008, 2.2, 4), m.iron, { x, y: 6.4, z }, 0, ch, false);
    w.geo(new THREE.ConeGeometry(0.35, 0.25, 12, 1, true), m.flat(0x2a4a3a, { metal: 0.5, side: THREE.DoubleSide, key: 'lampShade' }), { x, y: 5.35, z }, 0, ch, false);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), m.lampOn);
    bulb.position.copy(lp);
    w.group('bulbs').add(bulb);
    w.lamp('mk' + x + '_' + z, lp, { color: 0xffd8a0, intensity: 5, distance: 11, bulb, poolY: 0.16, poolSize: 7, group: 'marketHall', halo: true });
  }
  // moon shafts through skylights (fake volumetric)
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0x6a86b8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const z of [-13, -1]) for (let x = -63; x < -44; x += 5) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7.5), shaftMat);
    sh.position.set(x, 3.8, z + 0.4);
    sh.rotation.set(0, 0.3, 0.18);
    w.group('market').add(sh);
  }

  // stall blocks
  const blocks: [number, number, number, number, string][] = [];
  const xi: [number, number][] = [[-54.9, -51.1], [-48.9, -45.1]];
  const zi: [number, number][] = [[-20.9, -16.1], [-13.9, -9.1], [-6.9, -2.1], [0.1, 6.5]];
  const kinds = ['frutas', 'pinatas', 'ropa', 'juguetes', 'cocina', 'flores', 'mascaras', 'dulces'];
  let ki = 0;
  for (const [x0, x1] of xi) for (const [z0, z1] of zi) blocks.push([x0, z0, x1, z1, kinds[ki++ % kinds.length]]);
  // west column stalls x∈[-63.9,-57.1]
  blocks.push([-63.9, -13.9, -57.1, -9.1, 'ropa']);
  blocks.push([-63.9, -6.9, -57.1, -2.1, 'cocina']);
  blocks.push([-63.9, 0.1, -57.1, 6.5, 'frutas']);
  const lockers: THREE.Vector3[] = [];
  for (const [x0, z0, x1, z1, kind] of blocks) marketStall(w, x0, z0, x1, z1, kind, ch);
  // blockages that shape the path (fallen tarps, crates)
  const blockers: [number, number, number, number][] = [
    [-47.2, -9.1, -45.1, -6.9], // main aisle west of x=-44
    [-45.1, -18.9, -42.9, -17.6], // x=-44 aisle north part
    [-53.2, -16.1, -51.1, -13.9], // z=-15 aisle west part
    [-57.1, -20.4, -54.9, -16.4], // x=-56 aisle north
    [-57.1, -12.6, -54.9, -10.2], // x=-56 aisle middle
    [-51.1, -2.1, -48.9, 0.1], // x=-50 south crossing
  ];
  for (const [x0, z0, x1, z1] of blockers) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    w.prop('crate', cx - 0.3, 0.15, cz - 0.2, 0.3, 0.35);
    w.prop('crate', cx + 0.3, 0.15, cz + 0.3, 1.2, 0.35);
    w.prop('crate', cx, 0.5, cz, 0.7, 0.35);
    w.prop('barrel', cx + 0.5, 0.15, cz - 0.6, 0, 0.87);
    // fallen tarp
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.4, 1.8, 4, 4), m.lona(['#2f5fb0', '#e8e2d0', '#2f5fb0', '#e8e2d0']));
    const pos = tarp.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.random() * 0.2);
    tarp.geometry.computeVertexNormals();
    tarp.position.set(cx, 1.0, cz);
    tarp.rotation.set(-1.1, Math.random() * 0.4, 0);
    w.group('market').add(tarp);
    w.col.addBox(cx, 0, cz, x1 - x0 + 0.2, 2.0, z1 - z0 + 0.2);
  }
  // lockers (hide spots) along the south wall
  for (const x of [-60, -48]) {
    const lz = MZ1 - 0.45;
    w.box(x, 0.15, lz, 0.9, 2.1, 0.6, m.pbr('metal_rust', { color: 0x5a7a6a, repeat: 1, key: 'locker' }), { col: true, chunk: ch });
    const dmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.0), m.flat(0x3a4a42, { metal: 0.6, rough: 0.5, key: 'lockerDoor' }));
    dmesh.position.set(x, 1.15, lz - 0.31);
    dmesh.rotation.y = Math.PI;
    w.group('market').add(dmesh);
    lockers.push(new THREE.Vector3(x, 0.15, lz - 0.9));
  }
  batteries.push(new THREE.Vector3(-47, 1.1, -3.2), new THREE.Vector3(-62, 1.1, -4.5));

  // chalk arrows (spirit layer: only visible in photographs)
  const chalkArrows: THREE.Mesh[] = [];
  const arrowTex = chalkMark('arrow');
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  // [x, y, z, rotY] on floor (rot = direction of travel)
  const arrows: [number, number, number][] = [
    [-43.2, -8, Math.PI], // at the entry, go west → first turn north at x=-44
    [-44, -10.5, Math.PI / 2], // go north along x=-44
    [-44, -14.5, Math.PI], // turn west on z=-15
    [-48, -15, Math.PI], //
    [-50, -17, Math.PI / 2], // north along x=-50
    [-50, -21, Math.PI], // west on z=-22
    [-55, -22, Math.PI],
  ];
  for (const [x, z, rot] of arrows) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), arrowMat);
    a.rotation.set(-Math.PI / 2, 0, rot);
    a.position.set(x, 0.17, z);
    a.layers.set(World.SPIRIT);
    w.scene.add(a);
    chalkArrows.push(a);
  }

  // ---------------- RELOJERÍA ----------------
  const RX0 = MX0, RX1 = -58, RZ0 = MZ0, RZ1 = -18.5;
  holeWall(w, RX1, RZ0, RX1, RZ1, 0, 3.6, 0.3, [{ u0: 3.3, u1: 4.5, v0: 0.15, v1: 2.6 }, { u0: 0.6, u1: 2.6, v0: 1.0, v1: 2.3 }], m.plaster(0x6a3a2a), ch);
  holeWall(w, RX0, RZ1, RX1, RZ1, 0, 3.6, 0.3, [{ u0: 2, u1: 6, v0: 1.0, v1: 2.3 }], m.plaster(0x6a3a2a), ch);
  w.boxMM(RX0, 3.6, RZ0, RX1 + 0.15, 3.8, RZ1 + 0.15, m.woodDark, { chunk: ch, col: true });
  // shop window glass
  for (const [gx, gz, ry, gw] of [[RX1, RZ0 + 1.6, Math.PI / 2, 2], [RX0 + 4, RZ1, 0, 4]] as [number, number, number, number][]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(gw, 1.3), m.get('shopGlass', () => new THREE.MeshStandardMaterial({ color: 0x1a2a30, transparent: true, opacity: 0.35 })));
    gl.position.set(gx, 1.65, gz);
    gl.rotation.y = ry;
    w.group('market').add(gl);
  }
  // sign
  const rsg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshStandardMaterial({ map: makeCanvasTex(512, 80, (g) => {
    g.fillStyle = '#1a1410';
    g.fillRect(0, 0, 512, 80);
    g.fillStyle = '#d8b060';
    g.font = '40px "Lobster", Georgia';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Relojería Don Aurelio', 256, 42);
  }), roughness: 0.7 }));
  rsg.position.set(RX1 + 0.17, 3.1, (RZ0 + RZ1) / 2);
  rsg.rotation.y = Math.PI / 2;
  w.group('market').add(rsg);
  const relojDoor = makeDoor(w, 'relojeria', new THREE.Vector3(RX1, 0.15, RZ0 + 3.3), '+z', 1.2, 2.45, 1, m.woodDoor, { thickness: 0.06 });
  // counter
  w.box(RX1 - 2.2, 0.15, RZ0 + 2.2, 0.6, 1.0, 3.6, m.woodDark, { col: true, chunk: ch });
  // wall of clocks (inside west wall) with impossible times
  const clocks: MarketRefs['clocks'] = [];
  for (let i = 0; i < 14; i++) {
    const cvs = clockFace(Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), i % 2 === 0);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const r = 0.18 + (i % 3) * 0.06;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    mesh.position.set(RX0 + 0.28, 1.4 + (i % 4) * 0.55, RZ0 + 0.9 + Math.floor(i / 4) * 1.4 + (i % 2) * 0.3);
    mesh.rotation.y = Math.PI / 2;
    w.group('market').add(mesh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 20), m.woodDark);
    rim.position.copy(mesh.position);
    rim.rotation.y = Math.PI / 2;
    w.group('market').add(rim);
    clocks.push({ mesh, canvas: cvs, tex, h: Math.random() * 12, m: Math.random() * 60, speed: (Math.random() - 0.5) * 40 });
  }
  // master grandfather clock (puzzle)
  const mcPos = new THREE.Vector3(RX0 + 3.2, 0.15, RZ0 + 0.5);
  {
    const wd = m.pbr('wood', { repeat: 1.2, color: 0x5a2a18, rough: 0.5, key: 'clockWood' });
    w.box(mcPos.x, 0.15, mcPos.z, 0.8, 2.3, 0.45, wd, { col: true, chunk: ch });
    w.box(mcPos.x, 2.45, mcPos.z, 0.9, 0.12, 0.5, wd, { chunk: ch });
    w.geo(new THREE.ConeGeometry(0.5, 0.35, 4), wd, { x: mcPos.x, y: 2.75, z: mcPos.z }, Math.PI / 4, ch);
  }
  const mcCanvas = clockFace(3, 40);
  const mcTex = new THREE.CanvasTexture(mcCanvas);
  mcTex.colorSpace = THREE.SRGBColorSpace;
  const mcFace = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshStandardMaterial({ map: mcTex, roughness: 0.5, emissive: 0xfff0d0, emissiveMap: mcTex, emissiveIntensity: 0.08 }));
  mcFace.position.set(mcPos.x, 2.0, mcPos.z + 0.235);
  w.group('market').add(mcFace);
  const pendulum = new THREE.Group();
  const pRod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4), m.gold);
  pRod.position.y = -0.45;
  pendulum.add(pRod);
  const pBob = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), m.gold);
  pBob.rotation.x = Math.PI / 2;
  pBob.position.y = -0.9;
  pendulum.add(pBob);
  pendulum.position.set(mcPos.x, 1.65, mcPos.z + 0.24);
  w.group('market').add(pendulum);
  const pWin = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.1), m.get('shopGlass', () => new THREE.MeshStandardMaterial({ color: 0x1a2a30, transparent: true, opacity: 0.35 })));
  pWin.position.set(mcPos.x, 1.2, mcPos.z + 0.25);
  w.group('market').add(pWin);
  // drawer under the counter
  const drawer = new THREE.Mesh(uvBox(0.5, 0.18, 0.6), m.wood);
  drawer.position.set(RX1 - 2.55, 0.85, RZ0 + 2.2);
  w.group('market').add(drawer);
  // watchmaker's lamp
  const rl = new THREE.Vector3(RX1 - 2.2, 1.6, RZ0 + 1.4);
  const rb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.lampOn);
  rb.position.copy(rl);
  w.group('bulbs').add(rb);
  w.lamp('relojLamp', rl, { color: 0xffc070, intensity: 2.5, distance: 6, bulb: rb, poolY: null, group: 'reloj', flicker: 'candle', on: false });
  w.updaters.push((dt, t) => {
    pendulum.rotation.z = Math.sin(t * 2.2) * 0.18;
  });

  return {
    shutterPanaderia,
    cantinaLamp: 'cantina',
    cantinaTV,
    almacenDoor,
    relojDoor,
    marketGate,
    clocks,
    masterClock: { pos: new THREE.Vector3(mcPos.x, 1.8, mcPos.z + 0.4), canvas: mcCanvas, tex: mcTex, pendulum },
    drawer,
    chalkArrows,
    batteries,
    signs,
    lockers,
    arcadeLamps: [],
    cantinaPos: new THREE.Vector3(XB + 2.5, 1.5, 0),
  };
}

function shutterMesh(w: World, width: number, height: number) {
  const mat = w.mats.get('shutterMat', () => new THREE.MeshStandardMaterial({ color: 0x888880 })) as THREE.MeshStandardMaterial;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return mesh;
}

function neonTex(text: string) {
  return makeCanvasTex(512, 160, (g) => {
    g.clearRect(0, 0, 512, 160);
    g.font = '64px "Lobster", Georgia';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3a3a';
    g.shadowBlur = 24;
    g.fillStyle = '#ffd0c0';
    g.fillText(text, 256, 80);
  });
}

function luchaMask(w: World, i: number) {
  return w.mats.get('mask' + i, () => {
    const t = makeCanvasTex(128, 128, (g) => {
      const base = ['#b02a2a', '#2a4ab0', '#e8e0d0', '#1a1a1a'][i];
      const acc = ['#f2cf3a', '#e8e0d0', '#b02a2a', '#d8b060'][i];
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = acc;
      g.beginPath();
      g.ellipse(40, 60, 18, 12, -0.3, 0, Math.PI * 2);
      g.ellipse(88, 60, 18, 12, 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(40, 60, 10, 6, -0.3, 0, Math.PI * 2);
      g.ellipse(88, 60, 10, 6, 0.3, 0, Math.PI * 2);
      g.ellipse(64, 98, 14, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = acc;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(64, 0);
      g.lineTo(64, 40);
      g.stroke();
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, side: THREE.DoubleSide });
  });
}

function marketStall(w: World, x0: number, z0: number, x1: number, z1: number, kind: string, ch: string) {
  const m = w.mats;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const W = x1 - x0, D = z1 - z0;
  // counter perimeter (low walls) + back partition
  const wd = m.pbr('wood', { repeat: 0.8, color: 0x8a6048, key: 'stallWood' });
  w.boxMM(x0, 0.15, z0, x1, 1.05, z0 + 0.5, wd, { col: true, chunk: ch });
  w.boxMM(x0, 0.15, z1 - 0.5, x1, 1.05, z1, wd, { col: true, chunk: ch });
  w.boxMM(x0, 0.15, z0 + 0.5, x0 + 0.5, 1.05, z1 - 0.5, wd, { col: true, chunk: ch });
  w.boxMM(x1 - 0.5, 0.15, z0 + 0.5, x1, 1.05, z1 - 0.5, wd, { col: true, chunk: ch });
  // central partition tall with metal sheet (blocks vision)
  w.boxMM(cx - 0.05, 0.15, z0 + 0.5, cx + 0.05, 2.6, z1 - 0.5, m.rust, { col: true, chunk: ch });
  w.col.addBox(cx, 0.15, cz, W - 1, 2.4, D - 1);
  // posts + tarp roof
  for (const [px, pz] of [[x0 + 0.1, z0 + 0.1], [x1 - 0.1, z0 + 0.1], [x0 + 0.1, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) w.geo(new THREE.CylinderGeometry(0.03, 0.03, 2.8, 5), m.iron, { x: px, y: 1.55, z: pz }, 0, ch, false);
  const colors: Record<string, string[]> = {
    frutas: ['#3fae5a', '#e8e2d0'],
    pinatas: ['#e0357a', '#f2cf3a'],
    ropa: ['#2f5fb0', '#e8e2d0'],
    juguetes: ['#f28c28', '#e8e2d0'],
    cocina: ['#c83a3a', '#e8e2d0'],
    flores: ['#8a44b8', '#e8e2d0'],
    mascaras: ['#1a1a1a', '#b02a2a'],
    dulces: ['#f2cf3a', '#e0357a'],
  };
  const tarp = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, D + 0.3, 4, 4), m.lona([...colors[kind], ...colors[kind], ...colors[kind]]));
  const pos = tarp.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -0.15 * Math.sin(((pos.getX(i) / (W + 0.3)) + 0.5) * Math.PI));
  tarp.geometry.computeVertexNormals();
  tarp.rotation.x = -Math.PI / 2;
  tarp.position.set(cx, 2.95, cz);
  w.group('market').add(tarp);
  // goods on the counters
  const top = 1.08;
  if (kind === 'frutas') {
    for (let i = 0; i < 4; i++) w.prop(i % 2 ? 'fruit_crate_1' : 'fruit_crate_2', x0 + 0.6 + i * ((W - 1.2) / 3), top, z0 + 0.25, i, 0.25);
  } else if (kind === 'pinatas') {
    for (let i = 0; i < 3; i++) pinata(w, new THREE.Vector3(x0 + 0.8 + i * ((W - 1.6) / 2), 2.3, z0 + 0.3), ['#e0357a', '#f2cf3a', '#3fae5a'][i]);
    for (let i = 0; i < 3; i++) pinata(w, new THREE.Vector3(x0 + 0.8 + i * ((W - 1.6) / 2), 2.3, z1 - 0.3), ['#2f7fd0', '#f28c28', '#8a44b8'][i]);
  } else if (kind === 'ropa') {
    // hanging clothes (planes)
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), m.flat(['#b02a2a', '#e8e0d0', '#2a4ab0', '#3a7a3a', '#d8a030', '#6a2a8a'][i], { rough: 1, side: THREE.DoubleSide }));
      cl.position.set(x0 + 0.5 + i * ((W - 1) / 5), 2.1, z0 + 0.2);
      w.group('market').add(cl);
      const ph = Math.random() * 6;
      w.updaters.push((dt, t) => {
        cl.rotation.x = Math.sin(t * 1.1 + ph) * 0.08;
      });
    }
  } else if (kind === 'cocina') {
    w.prop('pot', cx - 0.8, top, z0 + 0.25, 0, 0.25);
    w.prop('pot', cx + 0.8, top, z0 + 0.25, 1, 0.22);
    w.prop('clay_pot', cx, top, z1 - 0.25, 0, 0.22);
    w.prop('bucket', x1 - 0.3, 0.15, cz, 0, 0.5);
  } else if (kind === 'flores') {
    for (let i = 0; i < 4; i++) {
      w.prop('vase', x0 + 0.6 + i * ((W - 1.2) / 3), top, z0 + 0.25, i, 0.35);
    }
  } else if (kind === 'mascaras') {
    for (let i = 0; i < 5; i++) {
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10, 0, Math.PI), luchaMask(w, i % 4));
      mk.position.set(x0 + 0.5 + i * ((W - 1) / 4), 1.8, z0 + 0.2);
      mk.rotation.y = Math.PI;
      w.group('market').add(mk);
    }
  } else if (kind === 'juguetes') {
    for (let i = 0; i < 5; i++) {
      const toy = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), m.flat(['#e0357a', '#3fae5a', '#2f7fd0', '#f28c28', '#f2cf3a'][i], { rough: 0.5 }));
      toy.position.set(x0 + 0.5 + i * ((W - 1) / 4), top + 0.1, z0 + 0.25);
      w.group('market').add(toy);
    }
    w.prop('ukulele', cx, top, z1 - 0.25, 0.4, 0.5);
  } else if (kind === 'dulces') {
    for (let i = 0; i < 6; i++) w.prop('clay_pot', x0 + 0.5 + i * ((W - 1) / 5), top, z0 + 0.25, i, 0.2);
  }
}

export { wallLantern };
