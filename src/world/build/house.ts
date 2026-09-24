import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { World, Door } from '../world';
import { uvBox } from '../geom';
import { holeWall, floorRect, makeDoor } from './helpers';
import { facade, wallLantern, lightPlant } from './facade';
import { chalkMark, makeCanvasTex, posterTexture } from '../canvasTex';

export interface HouseRefs {
  gateL: Door;
  gateR: Door;
  frontDoor: Door;
  corralDoor: Door;
  lucyDoor: Door;
  lucyWall: THREE.Group;
  lucyWallCollider: import('../colliders').Collider;
  lucyRoom: THREE.Group;
  wardrobe: THREE.Object3D;
  wardrobeCollider: import('../colliders').Collider;
  secretRoom: THREE.Group;
  familyPhoto: { mesh: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  mirror: Reflector | null;
  mirrorGhost: THREE.Object3D;
  radioPos: THREE.Vector3;
  cameraProp: THREE.Object3D;
  candleDrawing: THREE.Mesh;
  hallGhost: THREE.Object3D;
  ribbon: THREE.Object3D;
  letterPos: THREE.Vector3;
  noteKitchenPos: THREE.Vector3;
  newspaperPos: THREE.Vector3;
  graffiti1020: THREE.Vector3;
  catSpots: THREE.Vector3[];
  laundry: THREE.Mesh[];
  windowSounds: THREE.Vector3[];
  roofSighting: THREE.Vector3;
  wardrobeHide: THREE.Vector3;
  bedroomWardrobeHide: THREE.Vector3;
}

export function buildHouse(w: World): HouseRefs {
  const m = w.mats;
  const ch = 'house';
  const cc = 'callejon';
  // ================= CALLEJÓN =================
  const CX0 = -24, CX1 = -20, CZ0 = -80, CZ1 = -30.2;
  // floor: worn stone + central gutter
  w.boxMM(CX0, 0, CZ0, CX1, 0.05, CZ1, m.pbr('cobble', { repeat: 0.6, color: 0x8a8278, rough: 0.7, key: 'alleyCobble' }), { col: false, chunk: cc, cast: false });
  w.boxMM(-22.15, 0.05, CZ0, -21.85, 0.06, CZ1, m.concrete, { chunk: cc, cast: false });
  // east side (x=-20 facing west): walls of houses, corral door
  facade(w, { x0: -20, z0: -34, x1: -20, z1: -44, facing: 'w', height: 7.5, color: 0xb86a4a, old: true, depth: 5, seed: 500, chunk: cc, openings: [
    { u0: 2, u1: 3.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true, lit: true },
    { u0: 6, u1: 7.1, v0: 0.05, v1: 2.3, kind: 'door' },
    { u0: 3.5, u1: 4.6, v0: 4.2, v1: 6.2, kind: 'window', lit: false },
  ] });
  // corral wall with a low broken door (z -44..-52)
  holeWall(w, -19.8, -44, -19.8, -52, 0, 3.0, 0.4, [{ u0: 3.4, u1: 4.5, v0: 0, v1: 1.9 }], m.plasterOld(0xa89080), cc);
  facade(w, { x0: -20, z0: -52, x1: -20, z1: -80, facing: 'w', height: 7, color: 0x8aa0b8, old: true, depth: 5, seed: 501, chunk: cc, openings: [
    { u0: 3, u1: 4.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true },
    { u0: 9, u1: 10.1, v0: 0.05, v1: 2.3, kind: 'door' },
    { u0: 14, u1: 15.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true, lit: true },
    { u0: 20, u1: 21.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true },
    { u0: 5, u1: 6.1, v0: 4.1, v1: 6.0, kind: 'balcony' },
    { u0: 17, u1: 18.1, v0: 4.1, v1: 6.0, kind: 'window' },
  ] });
  // corral (small yard) z -52..-44, x -19.6..-15
  floorRect(w, -19.6, -52, -15, -44, 0.05, m.ground, cc, 0.05);
  w.boxMM(-15.2, 0, -52, -15, 3, -44, m.plasterOld(0xa89080), { col: true, chunk: cc });
  w.boxMM(-19.6, 0, -52.2, -15, 3, -52, m.plasterOld(0xa89080), { col: true, chunk: cc });
  w.boxMM(-19.6, 0, -44, -15, 3, -43.8, m.plasterOld(0xa89080), { col: true, chunk: cc });
  w.prop('bucket', -16, 0.05, -51, 0, 0.5, { col: [0.4, 0.5, 0.4] });
  w.prop('crate', -17.8, 0.05, -45, 0.3, 0.35, { col: [0.85, 0.35, 0.45] });
  w.prop('bicycle', -16.3, 0.05, -47, 0.2, 1.0, { col: [0.5, 1.0, 1.7] });
  w.prop('potted_plant_2', -18.8, 0.05, -51.2, 0, 0.8);
  const corralDoor = makeDoor(w, 'corral', new THREE.Vector3(-19.8, 0.05, -47.4), '-z', 1.1, 1.9, -1, m.plasterOld(0x6a5040), { thickness: 0.06 });
  // yellow ribbon (secret)
  const ribbon = new THREE.Group();
  {
    const rb = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), m.flat(0xf0c020, { rough: 0.6, key: 'ribbon' }));
    rb.scale.set(1.4, 0.8, 1);
    ribbon.add(rb);
    const tail = new THREE.Mesh(uvBox(0.03, 0.14, 0.005), m.flat(0xf0c020, { rough: 0.6, key: 'ribbon' }));
    tail.position.set(0.02, -0.08, 0);
    tail.rotation.z = 0.3;
    ribbon.add(tail);
    ribbon.position.set(-15.4, 1.05, -48.5);
    ribbon.rotation.y = Math.PI / 2;
    w.scene.add(ribbon);
    // on a nail on the wall
  }
  // west side: house z -34..-52 (x=-24 facing east)
  facade(w, { x0: -24, z0: -34.2, x1: -24, z1: -52, facing: 'e', height: 7.2, color: 0xd8c090, old: true, depth: 6, seed: 502, chunk: cc, openings: [
    { u0: 2, u1: 3.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true },
    { u0: 7, u1: 8.1, v0: 0.05, v1: 2.3, kind: 'door' },
    { u0: 12, u1: 13.1, v0: 1.0, v1: 2.4, kind: 'window', bars: true, lit: true },
    { u0: 5, u1: 6.1, v0: 4.1, v1: 6.0, kind: 'balcony' },
    { u0: 13, u1: 14.1, v0: 4.1, v1: 6.0, kind: 'window', lit: true },
  ] });
  // end wall (z=-80) with bougainvillea and a closed door
  facade(w, { x0: -24, z0: -80.2, x1: -20, z1: -80.2, facing: 's', height: 5, color: 0xc8a888, old: true, depth: 2, seed: 503, chunk: cc, openings: [{ u0: 1.4, u1: 2.6, v0: 0.05, v1: 2.3, kind: 'door' }] });
  // mouth gate (iron) at z=-31
  const gateL = makeDoor(w, 'gateL', new THREE.Vector3(-24, 0.02, -31.2), '+x', 2, 2.6, 1, m.iron, { bars: true, sound: 'iron', locked: true, lockedMsg: 'El portón del callejón está cerrado con cadena.' });
  const gateR = makeDoor(w, 'gateR', new THREE.Vector3(-20, 0.02, -31.2), '-x', 2, 2.6, -1, m.iron, { bars: true, sound: 'iron', locked: true, lockedMsg: 'El portón del callejón está cerrado con cadena.' });
  w.box(-24.1, 0, -31.2, 0.3, 3.0, 0.3, m.canteraDark, { col: true, chunk: cc });
  w.box(-19.9, 0, -31.2, 0.3, 3.0, 0.3, m.canteraDark, { col: true, chunk: cc });
  w.box(-22, 2.9, -31.2, 4.4, 0.3, 0.3, m.canteraDark, { chunk: cc });
  // pipes, cables, clotheslines
  for (const [x, z0, z1] of [[-23.85, -36, -50], [-20.15, -56, -78]]) {
    w.geo(new THREE.CylinderGeometry(0.05, 0.05, Math.abs(z1 - z0), 8), m.rust, { x, y: 2.9, z: (z0 + z1) / 2 }, 0, cc, true, undefined, new THREE.Euler(Math.PI / 2, 0, 0));
  }
  for (const z of [-40, -58, -70]) w.geo(new THREE.CylinderGeometry(0.04, 0.04, 6.5, 8), m.rust, { x: -23.85, y: 3.25, z }, 0, cc);
  const laundry: THREE.Mesh[] = [];
  const clothCols = ['#e8e0d0', '#b02a2a', '#2a4ab0', '#e8c030', '#3a7a3a', '#d8d0c0', '#8a2a6a'];
  for (const z of [-38, -46, -57, -66, -74]) {
    w.geo(new THREE.CylinderGeometry(0.006, 0.006, 4, 3), m.flat(0xcccccc, { key: 'line' }), { x: -22, y: 4.2, z }, 0, cc, false, undefined, new THREE.Euler(0, 0, Math.PI / 2));
    for (let i = 0; i < 4; i++) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75, 2, 3), m.flat(clothCols[(i + Math.abs(z)) % clothCols.length], { rough: 1, side: THREE.DoubleSide }));
      cl.geometry.translate(0, -0.37, 0);
      cl.position.set(-23.4 + i * 0.95, 4.18, z);
      cl.castShadow = true;
      w.group('callejon').add(cl);
      laundry.push(cl);
    }
  }
  w.updaters.push((dt, t) => {
    const wind = w.mats.uniforms.uWind.value;
    laundry.forEach((cl, i) => {
      cl.rotation.x = Math.sin(t * 1.8 + i * 1.3) * 0.25 * wind + 0.08 * wind;
    });
  });
  // electric cables
  const cablePts: number[] = [];
  for (let k = 0; k < 4; k++) {
    const z = -33 - k * 12;
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12, t1 = (i + 1) / 12;
      const y0 = 5.8 - Math.sin(t0 * Math.PI) * 0.5, y1 = 5.8 - Math.sin(t1 * Math.PI) * 0.5;
      cablePts.push(-24, y0, z + t0 * 6, -20, y1, z + t1 * 6 + 3);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  w.scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x111111 })));
  // trash bins, plants, bougainvillea
  w.prop('trash_bin', -23.4, 0.05, -41, Math.PI / 2, 0.9, { col: [0.6, 0.9, 0.9] });
  w.prop('trash_bin', -20.6, 0.05, -68, -Math.PI / 2, 0.9, { col: [0.6, 0.9, 0.9] });
  for (const [x, z] of [[-23.5, -54], [-20.5, -40.5], [-23.5, -77], [-20.5, -61], [-23.6, -48], [-23.5, -36.5], [-20.5, -72]] as [number, number][]) {
    lightPlant(w, x, 0.05, z, 0.7 + Math.random() * 0.4, cc);
    w.solid(x, 0, z, 0.4, 0.6, 0.4, { opaque: false });
  }
  vines(w, -20.1, -79.5, -20.1, -72, 5.5, 'w');
  vines(w, -23.9, -80, -20, -80, 5, 'n');
  vines(w, -23.9, -36, -23.9, -43, 4.5, 'e');
  // graffiti "1020" and hopscotch chalk
  const g1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: chalkMark('text', 'L ♥ 1020'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  g1.position.set(-20.05, 1.3, -56.5);
  g1.rotation.y = -Math.PI / 2;
  w.group('callejon').add(g1);
  const hop = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), new THREE.MeshStandardMaterial({ map: chalkMark('hopscotch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  hop.rotation.x = -Math.PI / 2;
  hop.position.set(-22, 0.07, -64);
  w.group('callejon').add(hop);
  // alley lamps (dim, one faulty)
  wallLantern(w, new THREE.Vector3(-20.05, 3.3, -45), -Math.PI / 2, cc, 'callejon');
  wallLantern(w, new THREE.Vector3(-23.95, 3.3, -66), Math.PI / 2, cc, 'callejon', 'faulty');
  // sounds from windows positions
  const windowSounds = [new THREE.Vector3(-19.8, 1.8, -36.6), new THREE.Vector3(-19.8, 1.8, -66.5), new THREE.Vector3(-24.2, 1.8, -46.5)];

  // ================= CASA ARRIAGA =================
  const X0 = -40, X1 = -24, Z0 = -76, Z1 = -52;
  const wallOld = m.plasterOld(0x9fb0c8);
  const wallIn = m.plasterOld(0xe0d4bc);
  const H = 3.8;
  // front facade on the callejón
  facade(w, { x0: X1, z0: Z1, x1: X1, z1: Z0, facing: 'e', height: 6.2, color: 0x7f98bf, old: true, depth: 0.5, noCollider: true, roof: false, seed: 510, chunk: cc, openings: [
    { u0: 9.1, u1: 10.5, v0: 0.05, v1: 2.9, kind: 'gap' },
    { u0: 4.5, u1: 5.7, v0: 1.0, v1: 2.5, kind: 'window', bars: true },
    { u0: 16.5, u1: 17.7, v0: 1.0, v1: 2.5, kind: 'window', bars: true },
    { u0: 20.5, u1: 21.7, v0: 1.0, v1: 2.5, kind: 'window', bars: true },
  ] });
  // house outer walls (other sides)
  holeWall(w, X0, Z0, X1, Z0, 0, 6.2, 0.4, [], wallOld, ch);
  holeWall(w, X0, Z1, X1, Z1, 0, 6.2, 0.4, [], wallOld, ch);
  holeWall(w, X0, Z0, X0, Z1, 0, 6.2, 0.4, [{ u0: 3.4, u1: 4.6, v0: 0, v1: 2.3 }], wallOld, ch);
  // collider for the facade (with door gap): facade wall at x=-24.25
  w.col.addBox(X1 - 0.25, 0, (Z1 + -61.1) / 2, 0.5, 6.2, Math.abs(Z1 - -61.1));
  w.col.addBox(X1 - 0.25, 0, (-62.5 + Z0) / 2, 0.5, 6.2, Math.abs(-62.5 - Z0));
  // floors
  const tiles = m.pbr('terracotta', { repeat: 0.8, color: 0xc8a080, key: 'houseTiles' });
  floorRect(w, X0, Z0, X1, Z1, 0.1, tiles, ch, 0.1);
  // patio floor (stone) open to sky
  floorRect(w, -35, -68, -28, -58, 0.12, m.pbr('stone_floor', { repeat: 0.5, color: 0xa89888, key: 'patioStone' }), ch, 0.12, false);
  // interior walls
  // zaguán north wall (z=-68) x -28..-24 and south wall (z=-58)
  holeWall(w, -28, -68, -24, -68, 0.1, H, 0.25, [], wallIn, ch);
  holeWall(w, -28, -58, -24, -58, 0.1, H, 0.25, [], wallIn, ch);
  // zaguán ↔ patio (x=-28), open archway
  holeWall(w, -28, -68, -28, -58, 0.1, H, 0.3, [{ u0: 3.2, u1: 6.8, v0: 0, v1: 2.8 }], wallIn, ch);
  // kitchen east wall x=-35 (z -68..-58) with door to patio
  holeWall(w, -35, -68, -35, -58, 0.1, H, 0.25, [{ u0: 4.4, u1: 5.6, v0: 0, v1: 2.3 }], wallIn, ch);
  // north rooms south wall z=-68 x -40..-28 (door to sala at x -32.1..-30.9, bedroom has no patio door)
  holeWall(w, -40, -68, -28, -68, 0.1, H, 0.25, [{ u0: 7.9, u1: 9.1, v0: 0, v1: 2.3 }], wallIn, ch);
  // sala/bedroom partition x=-35 (z -76..-68) with door
  holeWall(w, -35, -76, -35, -68, 0.1, H, 0.25, [{ u0: 3.4, u1: 4.6, v0: 0, v1: 2.3 }], wallIn, ch);
  // sala east part: zaguán north wall already; sala spans x -35..-24
  // south rooms north wall z=-58 x -40..-28: kitchen/lavadero wall + Lucía's room wall (special)
  holeWall(w, -40, -58, -35, -58, 0.1, H, 0.25, [], wallIn, ch);
  // Lucía's room wall (swap between solid and door)
  const lucyWall = new THREE.Group();
  w.scene.add(lucyWall);
  const lwMesh = new THREE.Mesh(uvBox(7, H, 0.25), wallIn);
  lwMesh.position.set(-31.5, 0.1 + H / 2, -58);
  lwMesh.castShadow = lwMesh.receiveShadow = true;
  lucyWall.add(lwMesh);
  // a painting and a pot on the solid version
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshStandardMaterial({ map: posterTexture('', [], { bg: '#6a8a5a', w: 128, h: 96 }), roughness: 0.8 }));
  paint.position.set(-31.5, 1.8, -58.14);
  paint.rotation.y = Math.PI;
  lucyWall.add(paint);
  const lucyWallCollider = w.col.addBox(-31.5, 0, -58, 7, H, 0.3);
  // door version (hidden until the event): wall pieces + hinged door
  const lucyDoorWall = new THREE.Group();
  lucyDoorWall.visible = false;
  w.scene.add(lucyDoorWall);
  {
    const a = new THREE.Mesh(uvBox(2.9, H, 0.25), wallIn);
    a.position.set(-33.55, 0.1 + H / 2, -58);
    const b = a.clone();
    b.position.x = -29.45;
    const top = new THREE.Mesh(uvBox(1.2, H - 2.3, 0.25), wallIn);
    top.position.set(-31.5, 0.1 + 2.3 + (H - 2.3) / 2, -58);
    lucyDoorWall.add(a, b, top);
  }
  const lucyDoor = makeDoor(w, 'lucy', new THREE.Vector3(-32.1, 0.1, -58), '+x', 1.2, 2.3, -1, m.pbr('wood_door', { color: 0xf0d8a0, repeat: 0.8, key: 'lucyDoor' }), { thickness: 0.06, parent: lucyDoorWall });
  lucyDoor.collider.enabled = false;
  lucyWall.userData.doorVersion = lucyDoorWall;
  const lucyDoorCols = [w.col.addBox(-33.55, 0, -58, 2.9, H, 0.3), w.col.addBox(-29.45, 0, -58, 2.9, H, 0.3)];
  lucyDoorCols.forEach((c) => (c.enabled = false));
  lucyWall.userData.doorCols = lucyDoorCols;
  // south rooms partitions
  holeWall(w, -35, -58, -35, -52, 0.1, H, 0.25, [], wallIn, ch);
  holeWall(w, -28, -58, -28, -52, 0.1, H, 0.25, [], wallIn, ch);
  // ceilings with wooden beams (vigas) — not over the patio
  const ceil = m.pbr('wood', { repeat: 0.7, color: 0x6a4a36, key: 'ceilWood' });
  w.boxMM(X0, H + 0.1, Z0, X1, H + 0.35, -68, ceil, { chunk: ch, col: true });
  w.boxMM(X0, H + 0.1, -58, X1, H + 0.35, Z1, ceil, { chunk: ch, col: true });
  w.boxMM(X0, H + 0.1, -68, -35, H + 0.35, -58, ceil, { chunk: ch, col: true });
  w.boxMM(-28, H + 0.1, -68, X1, H + 0.35, -58, ceil, { chunk: ch, col: true });
  for (let x = X0 + 0.6; x < X1; x += 0.9) {
    w.box(x, H - 0.1, -72, 0.15, 0.2, 8, m.woodDark, { chunk: ch, cast: false });
    w.box(x, H - 0.1, -55, 0.15, 0.2, 6, m.woodDark, { chunk: ch, cast: false });
  }
  // roof parapet around patio
  w.boxMM(-35.2, H + 0.35, -68.2, -27.8, H + 0.7, -67.9, m.plasterOld(0xc8b098), { chunk: ch });
  w.boxMM(-35.2, H + 0.35, -58.1, -27.8, H + 0.7, -57.8, m.plasterOld(0xc8b098), { chunk: ch });
  // front door
  const frontDoor = makeDoor(w, 'casa', new THREE.Vector3(-24.25, 0.1, -61.1), '-z', 1.4, 2.8, 1, m.pbr('wood_door', { color: 0x6a4a3a, repeat: 0.8, key: 'casaDoor' }), { thickness: 0.1, locked: true, lockedMsg: 'La puerta de la casa no cede.' });
  frontDoor.speed = 0.8;
  // interior doors
  makeDoor(w, 'cocina', new THREE.Vector3(-35, 0.1, -63.6), '+z', 1.2, 2.3, -1, m.woodDoor);
  makeDoor(w, 'sala', new THREE.Vector3(-32.1, 0.1, -68), '+x', 1.2, 2.3, 1, m.woodDoor);
  makeDoor(w, 'recamara', new THREE.Vector3(-35, 0.1, -72.6), '+z', 1.2, 2.3, -1, m.woodDoor);

  // ---- ZAGUÁN ----
  w.prop('potted_plant_1', -27.3, 0.1, -58.7, 0, 1.2, { col: [0.6, 1.2, 0.6] });
  // ---- PATIO ----
  const plantSpots: [number, number, number, number][] = [[-34.4, -67.4, 1, 1.1], [-28.6, -58.6, 2, 0.8], [-34.5, -63, 3, 0.3], [-33.8, -67.5, 3, 0.25], [-29.2, -67.5, 3, 0.28]];
  for (const [x, z, k, h] of plantSpots) w.prop('potted_plant_' + k, x, 0.12, z, Math.random() * 6, h, { col: k === 3 ? false : [0.6, h, 0.6] });
  for (const [x, z] of [[-34.4, -58.6], [-28.6, -67.4], [-30.2, -58.6], [-32.8, -58.6], [-34.4, -65.2]]) lightPlant(w, x, 0.12, z, 0.8 + Math.random() * 0.4, ch);
  // pila (stone wash basin)
  w.box(-34.2, 0.12, -61, 1.2, 0.9, 0.8, m.cantera, { col: true, chunk: ch });
  // lemon tree (small) in a planter
  w.box(-31.5, 0.12, -63, 1.4, 0.45, 1.4, m.canteraDark, { col: true, chunk: ch });
  {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.8, 8), m.bark);
    trunk.position.set(-31.5, 1.45, -63);
    w.group('house').add(trunk);
    const leafTex = w.assets.tex('leaves/cluster.png');
    const lm = new THREE.MeshStandardMaterial({ map: leafTex ?? null, color: leafTex ? 0xa8c890 : 0x2a4a2a, alphaTest: 0.45, side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), lm);
      c.position.set(-31.5 + (Math.random() - 0.5) * 1.6, 2.4 + (Math.random() - 0.5) * 1.0, -63 + (Math.random() - 0.5) * 1.6);
      c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      w.group('house').add(c);
    }
    for (let i = 0; i < 8; i++) {
      const lemon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m.flat(0xd8c030, { rough: 0.5, key: 'lemon' }));
      lemon.position.set(-31.5 + (Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 0.6, -63 + (Math.random() - 0.5) * 1.2);
      w.group('house').add(lemon);
    }
  }
  // clothesline across patio
  w.geo(new THREE.CylinderGeometry(0.006, 0.006, 7, 3), m.flat(0xcccccc, { key: 'line' }), { x: -31.5, y: 2.6, z: -60 }, 0, ch, false, undefined, new THREE.Euler(0, 0, Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), m.flat(['#f0e8d8', '#e8c030', '#e8e0f0'][i], { rough: 1, side: THREE.DoubleSide }));
    cl.geometry.translate(0, -0.35, 0);
    cl.position.set(-33.5 + i * 1.6, 2.58, -60);
    w.group('house').add(cl);
    laundry.push(cl);
  }
  w.lamp('patioMoon', new THREE.Vector3(-31.5, 3.2, -63), { color: 0x8aa0d0, intensity: 2.5, distance: 9, poolY: null, halo: false, group: 'house' });
  const roofSighting = new THREE.Vector3(-31.5, H + 0.7, -71.5);

  // ---- SALA (x -35..-24, z -76..-68) ----
  w.prop('sofa', -29.5, 0.1, -75.2, 0, 0.8, { col: [1.6, 0.8, 0.7] });
  w.prop('armchair', -33.6, 0.1, -73.8, Math.PI / 2, 1.0, { col: [0.8, 1, 0.8] });
  w.prop('table_wood', -29.5, 0.1, -73.4, 0, 0.5, { col: [1.1, 0.5, 0.7] });
  w.prop('tv_old', -25.0, 0.1, -72, -Math.PI / 2, 0.46, { col: [0.5, 0.5, 0.6] });
  w.box(-24.8, 0.1, -72, 0.6, 0.6, 1.2, m.woodDark, { col: true, chunk: ch });
  // TV raised on the cabinet
  // family photo on the side table (canvas)
  const famCanvas = document.createElement('canvas');
  famCanvas.width = 256;
  famCanvas.height = 192;
  drawFamilyPhoto(famCanvas, false);
  const famTex = new THREE.CanvasTexture(famCanvas);
  famTex.colorSpace = THREE.SRGBColorSpace;
  const famMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), new THREE.MeshStandardMaterial({ map: famTex, roughness: 0.4 }));
  famMesh.position.set(-26.5, 1.6, -75.78);
  w.group('house').add(famMesh);
  w.geo(uvBox(0.42, 0.33, 0.03), m.gold, { x: -26.5, y: 1.6, z: -75.81 }, 0, ch, false);
  // home altar with photos, veladoras and flowers (sala corner)
  w.box(-34.4, 0.1, -69, 1.0, 0.9, 0.6, m.woodDark, { col: true, chunk: ch });
  for (let i = 0; i < 3; i++) w.prop('candle_wood', -34.7 + i * 0.3, 1.0, -69.1, 0, 0.18);
  w.lamp('homeAltar', new THREE.Vector3(-34.4, 1.3, -69), { color: 0xff9a40, intensity: 2.2, distance: 6, flicker: 'candle', poolY: null, halo: false, group: 'house' });
  // newspaper on the table
  const newspaperPos = new THREE.Vector3(-29.5, 0.62, -73.4);
  const np = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshStandardMaterial({ map: posterTexture('EL HERALDO', ['Buscan a niña extraviada', 'durante el apagón', 'de la verbena'], { bg: '#e8e0cc', w: 256, h: 180 }), roughness: 0.9 }));
  np.rotation.x = -Math.PI / 2;
  np.position.copy(newspaperPos);
  np.rotation.z = 0.3;
  w.group('house').add(np);
  // mirror on the sala north wall... (z=-76 wall inner face at -75.8)
  let mirror: Reflector | null = null;
  const mirrorGhost = new THREE.Group();
  try {
    mirror = new Reflector(new THREE.PlaneGeometry(0.8, 1.3), { clipBias: 0.003, textureWidth: 512, textureHeight: 768, color: 0x8a8a88 });
    mirror.position.set(-31.2, 1.55, -75.78);
    w.group('house').add(mirror);
    (mirror as any).camera?.layers.enable(World.SPIRIT + 1);
  } catch {
    mirror = null;
  }
  w.geo(uvBox(0.95, 1.45, 0.04), m.woodDark, { x: -31.2, y: 1.55, z: -75.83 }, 0, ch, false);
  // ghost that exists only in the mirror (layer 3)
  mirrorGhost.position.set(-31.2, 0.1, -70.5);
  w.scene.add(mirrorGhost);
  // wall lamp
  const sl = new THREE.Vector3(-29.5, 3.2, -72);
  const sbulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m.lampOn);
  sbulb.position.copy(sl);
  w.group('bulbs').add(sbulb);
  w.lamp('sala', sl, { color: 0xffd6a0, intensity: 3.5, distance: 9, bulb: sbulb, poolY: null, group: 'house', flicker: 'faulty' });

  // ---- KITCHEN (x -40..-35, z -68..-58) ----
  w.box(-39.5, 0.1, -64, 0.8, 0.9, 3.4, m.pbr('concrete', { color: 0xe0c090, key: 'counter' }), { col: true, chunk: ch });
  // tiles backsplash (talavera)
  const ts = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), m.talavera);
  ts.position.set(-39.87, 1.4, -64);
  ts.rotation.y = Math.PI / 2;
  w.group('house').add(ts);
  // stove
  w.box(-39.5, 0.1, -60.6, 0.8, 0.9, 0.8, m.flat(0xe8e4dc, { metal: 0.3, rough: 0.3, key: 'enamel' }), { col: true, chunk: ch });
  w.prop('pot', -39.5, 1.0, -60.6, 0, 0.3);
  // fridge with a radio station sticker
  w.box(-39.5, 0.1, -66.8, 0.8, 1.7, 0.75, m.flat(0xe8e4dc, { metal: 0.3, rough: 0.3, key: 'enamel' }), { col: true, chunk: ch });
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshStandardMaterial({ map: makeCanvasTex(256, 176, (g) => {
    g.fillStyle = '#c8302a';
    g.fillRect(0, 0, 256, 176);
    g.fillStyle = '#f2e0b0';
    g.font = '30px "Alfa Slab One", Georgia';
    g.textAlign = 'center';
    g.fillText('RADIO', 128, 50);
    g.fillText('CANDELARIA', 128, 88);
    g.font = '48px "Alfa Slab One", Georgia';
    g.fillText('1260 AM', 128, 150);
  }), roughness: 0.6 }));
  sticker.position.set(-39.09, 1.3, -66.8);
  sticker.rotation.y = Math.PI / 2;
  w.group('house').add(sticker);
  // calendar Feb 2006
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshStandardMaterial({ map: posterTexture('FEBRERO', ['2006', '', 'Tortillería', 'La Güerita'], { bg: '#f0e6d0', w: 192, h: 280 }), roughness: 0.8 }));
  cal.position.set(-35.14, 1.7, -60.4);
  cal.rotation.y = -Math.PI / 2;
  w.group('house').add(cal);
  // table + chairs + radio + note
  w.prop('table_wood', -37.3, 0.1, -63.4, Math.PI / 2, 0.78, { col: [0.8, 0.8, 1.1] });
  w.prop('chair_wood', -37.3, 0.1, -62.4, Math.PI, 1.0, { col: [0.5, 0.9, 0.5] });
  w.prop('chair_wood', -36.3, 0.1, -63.8, -Math.PI / 2, 1.0, { col: [0.5, 0.9, 0.5] });
  const radioPos = new THREE.Vector3(-37.3, 0.9, -63.9);
  w.prop('radio_vintage', radioPos.x, radioPos.y, radioPos.z, Math.PI / 2, 0.26);
  const noteKitchenPos = new THREE.Vector3(-37.1, 0.9, -63.0);
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), m.flat(0xf0e8d0, { rough: 0.9, key: 'paper' }));
  note.rotation.x = -Math.PI / 2;
  note.position.copy(noteKitchenPos);
  w.group('house').add(note);
  const kl = new THREE.Vector3(-37.5, 3.2, -63);
  const kbulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m.lampOn);
  kbulb.position.copy(kl);
  w.group('bulbs').add(kbulb);
  w.lamp('cocina', kl, { color: 0xfff0d8, intensity: 3.5, distance: 8, bulb: kbulb, poolY: null, group: 'house' });

  // ---- BEDROOM (x -40..-35, z -76..-68) ----
  w.prop('bed', -38.8, 0.1, -70.2, 0, 1.0, { col: [0.95, 0.6, 2.0] });
  w.prop('bed', -36.3, 0.1, -73.8, Math.PI / 2, 1.0, { col: [2.0, 0.6, 0.95] });
  // mattresses + blankets
  w.box(-38.8, 0.45, -70.2, 0.85, 0.2, 1.9, m.flat(0x8a3a3a, { rough: 1, key: 'blanket1' }), { chunk: ch });
  w.box(-36.3, 0.45, -73.8, 1.9, 0.2, 0.85, m.flat(0x3a5a8a, { rough: 1, key: 'blanket2' }), { chunk: ch });
  const wardrobe = w.prop('wardrobe', -39.6, 0.1, -72, Math.PI / 2, 2.1) ?? new THREE.Group();
  const wardrobeCollider = w.col.addBox(-39.6, 0.1, -72, 0.7, 2.1, 2.0);
  // scratch marks on the floor in front of the wardrobe (hint)
  const scratch = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), new THREE.MeshBasicMaterial({ map: makeCanvasTex(128, 256, (g) => {
    g.clearRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(40,25,15,0.7)';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(10 + Math.random() * 20, 20 + i * 25);
      g.lineTo(110 + Math.random() * 10, 30 + i * 25 + Math.random() * 10);
      g.stroke();
    }
  }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  scratch.rotation.x = -Math.PI / 2;
  scratch.position.set(-38.7, 0.11, -72);
  w.group('house').add(scratch);
  const bl = new THREE.Vector3(-37.5, 3.2, -72);
  const bbulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m.lampOn);
  bbulb.position.copy(bl);
  w.group('bulbs').add(bbulb);
  w.lamp('recamara', bl, { color: 0xffd8a8, intensity: 2.5, distance: 7, bulb: bbulb, poolY: null, group: 'house', on: false });
  // posters of the 2000s (fictional band)
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), new THREE.MeshStandardMaterial({ map: posterTexture('LOS FAROLES', ['GIRA 2005', 'Feria Nacional'], { bg: '#1a1a2a', fg: '#e8c030', w: 256, h: 360 }), roughness: 0.8 }));
  post.position.set(-35.14, 1.8, -74.5);
  post.rotation.y = -Math.PI / 2;
  w.group('house').add(post);

  // ---- SECRET ROOM behind the wardrobe (x -43..-40, z -74..-70) ----
  const secretRoom = new THREE.Group();
  {
    floorRect(w, -43, -74, -40, -70, 0.1, m.wood, ch, 0.1);
    holeWall(w, -43, -74, -40, -74, 0, 2.6, 0.2, [], wallIn, ch);
    holeWall(w, -43, -70, -40, -70, 0, 2.6, 0.2, [], wallIn, ch);
    holeWall(w, -43, -74, -43, -70, 0, 2.6, 0.2, [], wallIn, ch);
    w.boxMM(-43.1, 2.6, -74.1, -39.8, 2.8, -69.9, ceil, { chunk: ch, col: true });
    w.prop('cardboard_box', -42.4, 0.1, -73.4, 0.2, 0.34);
    w.prop('cardboard_box', -42.3, 0.44, -73.3, 0.6, 0.3);
    w.prop('books', -42.5, 0.1, -71, 0.4, 0.2);
    w.prop('guitar', -40.5, 0.1, -73.6, 0.6, 1.0);
    w.prop('lantern', -41.5, 0.1, -70.5, 0, 0.3);
    w.lamp('secret', new THREE.Vector3(-41.5, 0.5, -70.5), { color: 0xff9a50, intensity: 1.8, distance: 4, flicker: 'candle', poolY: null, halo: true, group: 'secret', on: false });
    // the opening in the bedroom west wall (x=-40, z -72.6..-71.4) — cut: the bedroom west wall is the house outer wall
  }
  const letterPos = new THREE.Vector3(-42.2, 0.8, -71.8);
  const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), m.flat(0xf2ead8, { rough: 0.9, key: 'paper' }));
  letter.rotation.x = -Math.PI / 2;
  letter.position.set(-42.3, 0.46, -71.0);
  w.group('house').add(letter);

  // ---- LUCÍA'S ROOM (x -35..-28, z -58..-52), revealed by the radio ----
  const lucyRoom = new THREE.Group();
  lucyRoom.visible = false;
  w.scene.add(lucyRoom);
  {
    const warm = m.plaster(0xf0d8b0);
    const add = (mesh: THREE.Mesh) => {
      mesh.castShadow = mesh.receiveShadow = true;
      lucyRoom.add(mesh);
      return mesh;
    };
    const wl = add(new THREE.Mesh(uvBox(0.05, H, 6), warm));
    wl.position.set(-34.85, 0.1 + H / 2, -55);
    const wr = add(new THREE.Mesh(uvBox(0.05, H, 6), warm));
    wr.position.set(-28.15, 0.1 + H / 2, -55);
    const wb = add(new THREE.Mesh(uvBox(7, H, 0.05), warm));
    wb.position.set(-31.5, 0.1 + H / 2, -52.15);
    const bedObj = w.assets.instance('bed', { height: 1.0 });
    if (bedObj) {
      bedObj.position.set(-33.8, 0.1, -54);
      lucyRoom.add(bedObj);
    }
    const blanket = add(new THREE.Mesh(uvBox(0.85, 0.2, 1.9), m.flat(0xe8a0b8, { rough: 1, key: 'blanketL' })));
    blanket.position.set(-33.8, 0.55, -54);
    const desk = w.assets.instance('table_wood', { height: 0.75 });
    if (desk) {
      desk.position.set(-29.3, 0.1, -53.1);
      lucyRoom.add(desk);
    }
    // drawings on the walls (crayon)
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ map: crayonDrawing(i), roughness: 0.9 }));
      d.position.set(-33.8 + i * 0.75, 1.7 + (i % 2) * 0.35, -52.2);
      lucyRoom.add(d);
    }
    // teddy (simple) and backpack
    const bear = new THREE.Group();
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), m.flat(0x8a5a3a, { rough: 1, key: 'bear' }));
    bear.add(bb);
    const bh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m.flat(0x8a5a3a, { rough: 1, key: 'bear' }));
    bh.position.y = 0.2;
    bear.add(bh);
    bear.position.set(-33.4, 0.8, -53.3);
    lucyRoom.add(bear);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), m.lampOn);
    lamp.position.set(-29.0, 1.1, -52.9);
    lucyRoom.add(lamp);
  }
  w.lamp('lucyRoom', new THREE.Vector3(-30, 1.6, -53.5), { color: 0xffc890, intensity: 4, distance: 8, poolY: null, halo: false, group: 'lucy', on: false, flicker: 'candle', priority: 2 });
  // the camera on her desk
  const cameraProp = w.assets.instance('camera', { width: 0.22 }) ?? new THREE.Mesh(uvBox(0.2, 0.12, 0.1), m.flat(0x222222));
  cameraProp.position.set(-29.3, 0.86, -53.1);
  cameraProp.rotation.y = 0.4;
  lucyRoom.add(cameraProp);
  // candle drawing: blank paper to the eye, visible drawing in spirit layer
  const blank = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), m.flat(0xf2ead8, { rough: 0.9, key: 'paper' }));
  blank.position.set(-28.18, 1.6, -55.2);
  blank.rotation.y = -Math.PI / 2;
  lucyRoom.add(blank);
  const candleDrawing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: chalkMark('candles', '', CANDLE_SOLUTION), transparent: true, color: 0x503020, depthWrite: false }));
  candleDrawing.position.set(-28.2, 1.6, -55.2);
  candleDrawing.rotation.y = -Math.PI / 2;
  candleDrawing.layers.set(World.SPIRIT);
  w.scene.add(candleDrawing);
  // ghost in the hallway (spirit layer)
  const hallGhost = new THREE.Group();
  hallGhost.position.set(-26, 0.1, -66.5);
  w.scene.add(hallGhost);

  return {
    gateL,
    gateR,
    frontDoor,
    corralDoor,
    lucyDoor,
    lucyWall,
    lucyWallCollider,
    lucyRoom,
    wardrobe,
    wardrobeCollider,
    secretRoom,
    familyPhoto: { mesh: famMesh, canvas: famCanvas, tex: famTex },
    mirror,
    mirrorGhost,
    radioPos,
    cameraProp,
    candleDrawing,
    hallGhost,
    ribbon,
    letterPos,
    noteKitchenPos,
    newspaperPos,
    graffiti1020: new THREE.Vector3(-20.3, 1.3, -56.5),
    catSpots: [new THREE.Vector3(-22.5, 0.05, -35), new THREE.Vector3(-21.5, 0.05, -42), new THREE.Vector3(-20.3, 0.05, -47), new THREE.Vector3(-17.5, 0.05, -48.5)],
    laundry,
    windowSounds,
    roofSighting,
    wardrobeHide: new THREE.Vector3(-39.2, 0.1, -72),
    bedroomWardrobeHide: new THREE.Vector3(-38.6, 0.1, -72),
  };
}

/** which of the 7 candles must be lit (true) */
export const CANDLE_SOLUTION = [true, false, true, true, false, false, true];

export function drawFamilyPhoto(c: HTMLCanvasElement, julianGone: boolean, special = false) {
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, special ? '#3a2a4a' : '#8aa0b8');
  grd.addColorStop(1, special ? '#1a1018' : '#c8b898');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // kiosk silhouette (background)
  g.fillStyle = 'rgba(60,70,60,0.6)';
  g.fillRect(W * 0.1, H * 0.35, W * 0.8, H * 0.08);
  g.beginPath();
  g.moveTo(W * 0.1, H * 0.35);
  g.quadraticCurveTo(W * 0.5, H * 0.05, W * 0.9, H * 0.35);
  g.fill();
  const person = (x: number, h: number, col: string, gone = false) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, H - h - 8, h * 0.13, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - h * 0.14, H - h + h * 0.05, h * 0.28, h * 0.62);
    if (gone) {
      g.strokeStyle = '#1a1210';
      g.lineWidth = 5;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        g.moveTo(x - h * 0.2 + Math.random() * 8, H - h - 20 + Math.random() * 10);
        g.lineTo(x + h * 0.2 - Math.random() * 8, H - h * 0.3 + Math.random() * 20);
        g.stroke();
      }
    }
  };
  person(W * 0.28, H * 0.78, '#5a3a2a'); // mother
  person(W * 0.52, H * 0.66, '#2a3a5a', julianGone); // Julián (15)
  person(W * 0.72, H * 0.45, '#e8c030'); // Lucía (8), yellow dress
  // age / sepia overlay
  g.fillStyle = 'rgba(120,80,40,0.18)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f0e8d8';
  g.font = '14px "Caveat", cursive';
  g.fillText(special ? 'verbena · 1 feb 2006' : 'Candelaria 2005', 10, H - 8);
}

function crayonDrawing(i: number) {
  return makeCanvasTex(160, 120, (g) => {
    g.fillStyle = '#f4efe2';
    g.fillRect(0, 0, 160, 120);
    g.lineWidth = 4;
    g.lineCap = 'round';
    const cols = ['#e03030', '#3060d0', '#30a040', '#e0a020', '#8030a0'];
    g.strokeStyle = cols[i % 5];
    if (i === 0) {
      // kiosk
      g.beginPath();
      g.moveTo(30, 90);
      g.lineTo(130, 90);
      g.moveTo(40, 90);
      g.lineTo(40, 50);
      g.moveTo(120, 90);
      g.lineTo(120, 50);
      g.moveTo(30, 50);
      g.quadraticCurveTo(80, 10, 130, 50);
      g.stroke();
    } else if (i === 1) {
      // two kids holding hands
      for (const [x, s] of [[55, 1.2], [100, 0.8]]) {
        g.beginPath();
        g.arc(x, 40, 10 * s, 0, Math.PI * 2);
        g.moveTo(x, 50);
        g.lineTo(x, 85);
        g.moveTo(x - 12, 100);
        g.lineTo(x, 85);
        g.lineTo(x + 12, 100);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(55, 65);
      g.lineTo(100, 65);
      g.stroke();
    } else if (i === 2) {
      // bell tower
      g.strokeRect(60, 20, 40, 80);
      g.beginPath();
      g.arc(80, 45, 10, Math.PI, 0);
      g.stroke();
    } else if (i === 3) {
      // sun + papel picado
      g.beginPath();
      g.arc(40, 35, 15, 0, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 5; k++) g.strokeRect(70 + k * 16, 20, 12, 16);
    } else {
      g.font = '22px "Caveat", cursive';
      g.fillStyle = '#3060d0';
      g.fillText('Julián + Lucía', 20, 65);
    }
  });
}

function vines(w: World, x0: number, z0: number, x1: number, z1: number, h: number, facing: 'n' | 's' | 'e' | 'w') {
  const tex = w.assets.tex('vines/cluster.png');
  const mat = w.mats.get('vineMat', () => new THREE.MeshStandardMaterial({ map: tex ?? null, color: tex ? 0xb0c898 : 0x2a4a2a, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }));
  const flowerMat = w.mats.get('bougMat', () => new THREE.MeshStandardMaterial({ color: 0xc8286a, roughness: 0.8, emissive: 0x3a0818, emissiveIntensity: 0.2 }));
  const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[facing];
  const len = Math.hypot(x1 - x0, z1 - z0);
  const cnt = Math.floor(len * h * 2.2);
  const geo = new THREE.PlaneGeometry(0.8, 0.8);
  const im = new THREE.InstancedMesh(geo, mat, cnt);
  const fg = new THREE.SphereGeometry(0.05, 5, 4);
  const fim = new THREE.InstancedMesh(fg, flowerMat, cnt * 2);
  const q = new THREE.Quaternion();
  let fi = 0;
  for (let i = 0; i < cnt; i++) {
    const t = Math.random();
    const y = Math.pow(Math.random(), 0.6) * h;
    const x = x0 + (x1 - x0) * t + n[0] * (0.1 + Math.random() * 0.2);
    const z = z0 + (z1 - z0) * t + n[1] * (0.1 + Math.random() * 0.2);
    q.setFromEuler(new THREE.Euler(Math.random() - 0.5, Math.atan2(n[0], n[1]) + (Math.random() - 0.5), Math.random() * 3));
    im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    for (let k = 0; k < 2; k++) {
      fim.setMatrixAt(fi++, new THREE.Matrix4().makeTranslation(x + (Math.random() - 0.5) * 0.5 + n[0] * 0.15, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5 + n[1] * 0.15));
    }
  }
  im.computeBoundingSphere();
  fim.computeBoundingSphere();
  w.scene.add(im, fim);
}
