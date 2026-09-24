import * as THREE from 'three';
import { World, Door } from '../world';
import { uvBox, uvCylinder, uvPlane } from '../geom';
import { holeWall, floorRect, makeDoor } from './helpers';
import { clockFace, flameTexture, makeCanvasTex, talavera } from '../canvasTex';
import { farol } from './plaza';

export interface ChurchRefs {
  mainDoorL: Door;
  mainDoorR: Door;
  towerDoor: Door;
  sacristyDoor: Door;
  candelabrum: { group: THREE.Group; candles: { flame: THREE.Sprite; lit: boolean; pos: THREE.Vector3 }[] };
  votives: THREE.Group;
  altarGroup: THREE.Group;
  extGroup: THREE.Group;
  backWallGroup: THREE.Group;
  backCollider: THREE.Vector3[];
  extColliders: import('../colliders').Collider[];
  backColliders: import('../colliders').Collider[];
  bells: { name: string; mesh: THREE.Object3D; pos: THREE.Vector3; midi: number }[];
  mechanism: THREE.Group;
  gearSlots: THREE.Object3D[];
  brokenRail: THREE.Vector3;
  towerWindow: THREE.Vector3;
  facadeClock: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture };
  confessional: THREE.Vector3;
  lucyShoe: THREE.Object3D;
  belfryY: number;
}

export const BELFRY_Y = 18;

export function buildChurch(w: World): ChurchRefs {
  const m = w.mats;
  const ch = 'church';
  const cant = m.cantera;
  const plasterOut = m.plaster(0xd8b890);
  const plasterIn = m.plaster(0xece4d4);
  const flameTex = flameTexture();

  // ---------------- ATRIUM ----------------
  const atriumMat = m.pbr('cantera', { repeat: 0.45, color: 0xc4a490, rough: 0.8, key: 'atriumPave' });
  w.boxMM(-16, 0, -36, 16, 0.3, -30.6, atriumMat, { col: true, cast: false });
  // steps at gate
  w.boxMM(-3, 0, -30.6, 3, 0.15, -30.1, m.canteraDark, { col: true, cast: false });
  // atrium walls
  const wallH = 1.0;
  w.boxMM(-16, 0, -30.9, -3, wallH + 0.3, -30.5, cant, { col: true });
  w.boxMM(3, 0, -30.9, 16, wallH + 0.3, -30.5, cant, { col: true });
  w.boxMM(-16.4, 0, -36, -16, wallH + 0.3, -30.5, cant, { col: true });
  w.boxMM(16, 0, -36, 16.4, wallH + 0.3, -30.5, cant, { col: true });
  for (const x of [-16, -9.5, -3, 3, 9.5, 16]) {
    w.box(x, 0, -30.7, 0.6, 1.8, 0.6, m.canteraDark, { col: true });
    w.geo(new THREE.SphereGeometry(0.25, 10, 8), cant, { x, y: 2.05, z: -30.7 });
    w.geo(new THREE.ConeGeometry(0.12, 0.5, 8), cant, { x, y: 2.5, z: -30.7 });
  }
  // atrium iron gate (open, decorative)
  // atrium lamps
  farol(w, -12, -33, 101, 'none', 0.3, 'atrium', 3.4);
  farol(w, 12, -33, 102, 'faulty', 0.3, 'atrium', 3.4);

  // ---------------- NAVE SHELL ----------------
  const X0 = -8, X1 = 8, ZF = -36, ZB = -66;
  const WH = 16;
  // facade wall (front) z -37.5..-36 with main door hole and oculus
  const frontHoles = [{ u0: 6.5, u1: 9.5, v0: 0, v1: 5.4 }, { u0: 7.1, u1: 8.9, v0: 9.4, v1: 11.2 }];
  holeWall(w, X0, -36.75, X1, -36.75, 0, WH + 3, 1.5, frontHoles, cant, ch);
  // espadaña (tall frontispiece top) — curved crown
  {
    const sh = new THREE.Shape();
    sh.moveTo(-6, 0);
    sh.lineTo(6, 0);
    sh.lineTo(6, 1.2);
    sh.quadraticCurveTo(4.5, 1.4, 3.6, 2.4);
    sh.quadraticCurveTo(2, 4.4, 0, 4.6);
    sh.quadraticCurveTo(-2, 4.4, -3.6, 2.4);
    sh.quadraticCurveTo(-4.5, 1.4, -6, 1.2);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 12 });
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.6);
    w.geo(g, cant, { x: 0, y: WH + 3, z: -37.2 }, 0, ch);
    w.geo(new THREE.SphereGeometry(0.3, 10, 8), cant, { x: 0, y: WH + 7.9, z: -36.6 }, 0, ch);
    // wrought iron cross
    w.geo(uvBox(0.1, 1.6, 0.1), m.iron, { x: 0, y: WH + 8.9, z: -36.6 }, 0, ch);
    w.geo(uvBox(0.9, 0.1, 0.1), m.iron, { x: 0, y: WH + 9.2, z: -36.6 }, 0, ch);
  }
  // facade decoration: pilasters, cornices, portal frame, niche
  for (const x of [-7.4, -3.4, 3.4, 7.4]) {
    w.box(x, 0, -35.85, 0.8, WH + 2.6, 0.3, m.canteraDark, { chunk: ch });
    w.box(x, 0, -35.75, 1.0, 0.8, 0.5, m.canteraDark, { chunk: ch });
  }
  for (const y of [6.4, 12.6, WH + 2.6]) w.box(0, y, -35.8, 16.6, 0.4, 0.5, m.canteraDark, { chunk: ch });
  // portal arch frame
  {
    const sh = new THREE.Shape();
    sh.moveTo(-2.2, 0);
    sh.lineTo(-2.2, 4.2);
    sh.absarc(0, 4.2, 2.2, Math.PI, 0, true);
    sh.lineTo(2.2, 0);
    sh.lineTo(1.5, 0);
    sh.lineTo(1.5, 4.2);
    sh.absarc(0, 4.2, 1.5, 0, Math.PI, false);
    sh.lineTo(-1.5, 0);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false, curveSegments: 16 });
    w.geo(g, m.canteraDark, { x: 0, y: 0, z: -36.05 }, 0, ch);
    // salomonic-ish columns flanking the portal
    for (const x of [-2.7, 2.7]) {
      const col = new THREE.CylinderGeometry(0.22, 0.24, 5.6, 12, 12);
      const p = col.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const rr = 1 + 0.12 * Math.sin(a * 2 + y * 3.2);
        p.setX(i, p.getX(i) * rr);
        p.setZ(i, p.getZ(i) * rr);
      }
      col.computeVertexNormals();
      w.geo(col, cant, { x, y: 2.8, z: -35.6 }, 0, ch);
    }
    // niche above portal with flower vase
    w.box(0, 7.0, -35.9, 1.6, 2.6, 0.3, m.canteraDark, { chunk: ch });
    w.box(0, 7.2, -36.02, 1.1, 2.1, 0.12, m.glassDark, { chunk: ch });
  }
  // stopped facade clock at 12:13
  const fcCanvas = clockFace(12, 13);
  const fcTex = new THREE.CanvasTexture(fcCanvas);
  fcTex.colorSpace = THREE.SRGBColorSpace;
  const fcMesh = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshStandardMaterial({ map: fcTex, roughness: 0.7, emissive: 0xffe8b0, emissiveMap: fcTex, emissiveIntensity: 0.12 }));
  fcMesh.position.set(0, WH + 4.7, -36.55);
  fcMesh.rotation.y = Math.PI;
  fcMesh.rotation.y = 0;
  w.group('signs').add(fcMesh);
  w.geo(new THREE.TorusGeometry(1.15, 0.1, 8, 32), m.canteraDark, { x: 0, y: WH + 4.7, z: -36.6 }, 0, ch);
  // oculus window (coro)
  const ocMat = m.get('stainedGlass', () => {
    const t = makeCanvasTex(256, 256, (g) => {
      const cols = ['#1d3f8a', '#b03030', '#d8a032', '#2a7a4a', '#6a2a8a'];
      for (let i = 0; i < 12; i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.moveTo(128, 128);
        g.arc(128, 128, 128, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#111';
      g.lineWidth = 6;
      for (let r = 30; r < 128; r += 32) {
        g.beginPath();
        g.arc(128, 128, r, 0, Math.PI * 2);
        g.stroke();
      }
    });
    return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  });
  const oc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), ocMat);
  oc.position.set(0, 10.3, -36.8);
  w.group('church').add(oc);
  w.geo(new THREE.TorusGeometry(1.0, 0.15, 8, 24), m.canteraDark, { x: 0, y: 10.3, z: -35.95 }, 0, ch);

  // side walls with high windows; west wall has tower door, east wall sacristy door
  const winHoles = (zs: number[]) => zs.map((z) => ({ u0: z - 0.7, u1: z + 0.7, v0: 8.2, v1: 11.4 }));
  // west wall: runs from z=-37.5 to -64.5 (u measured from -37.5 going -z)
  const westHoles = [{ u0: 1.3, u1: 2.5, v0: 0, v1: 2.5 }, ...winHoles([8, 14, 20])];
  holeWall(w, -7.25, -37.5, -7.25, -64.5, 0, WH, 1.5, westHoles, plasterOut, ch);
  const eastHoles = [{ u0: 16.8, u1: 18.2, v0: 0, v1: 2.6 }, ...winHoles([8, 14, 20])];
  holeWall(w, 7.25, -37.5, 7.25, -64.5, 0, WH, 1.5, eastHoles, plasterOut, ch);
  // interior plaster lining (thin boxes inside) for a brighter interior color
  w.boxMM(-6.52, 0, -64.5, -6.5, WH, -37.5, plasterIn, { chunk: ch, cast: false });
  void plasterIn;
  // back wall (movable: hidden when the nave "grows")
  const backWallGroup = new THREE.Group();
  backWallGroup.name = 'churchBack';
  w.scene.add(backWallGroup);
  const backColliders = [w.col.addBox(0, 0, -65.25, 16, WH, 1.5)];
  {
    const g = new THREE.Mesh(uvBox(16, WH, 1.5), plasterOut);
    g.position.set(0, WH / 2, -65.25);
    g.castShadow = g.receiveShadow = true;
    backWallGroup.add(g);
  }
  // window glass (moonlit, cold)
  const winGlass = m.get('churchWin', () => new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x5a7ab0, emissiveIntensity: 0.35, roughness: 0.2 }));
  for (const side of [-1, 1])
    for (const z of [8, 14, 20]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), winGlass);
      pl.position.set(side * 7.25, 9.8, -37.5 - z);
      pl.rotation.y = side * -Math.PI / 2;
      w.group('church').add(pl);
      const pl2 = pl.clone();
      pl2.rotation.y += Math.PI;
      w.group('church').add(pl2);
    }
  // roof
  w.boxMM(-8.2, WH, -66.2, 8.2, WH + 0.5, -36, m.concrete, { chunk: ch });
  // interior barrel vault (half cylinder seen from inside)
  const vault = new THREE.CylinderGeometry(6.5, 6.5, 27, 24, 1, true, -Math.PI / 2, Math.PI);
  vault.rotateX(Math.PI / 2);
  const vuv = vault.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < vuv.count; i++) vuv.setXY(i, vuv.getX(i) * 20, vuv.getY(i) * 27);
  const vaultMat = m.pbr('plaster', { repeat: 0.3, color: 0xe8dcc8, side: THREE.BackSide, key: 'vaultIn' });
  w.geo(vault, vaultMat, { x: 0, y: 9.3, z: -51 }, 0, ch, false);
  // vault ribs (arcos fajones)
  for (let z = -40; z >= -62; z -= 5.5) {
    const rib = new THREE.TorusGeometry(6.4, 0.18, 6, 24, Math.PI);
    w.geo(rib, cant, { x: 0, y: 9.3, z }, 0, ch, false);
    for (const x of [-6.3, 6.3]) w.box(x, 0, z, 0.5, 9.3, 0.5, cant, { chunk: ch, col: true });
  }
  // dome with azulejos (exterior) over the presbytery
  {
    const drum = uvCylinder(4.6, 4.6, 2.4, 24);
    w.geo(drum, plasterOut, { x: 0, y: WH + 1.7, z: -59 }, 0, ch);
    const domeTex = talavera(2, '#1d3f8a', '#e0b030');
    domeTex.repeat.set(6, 3);
    const domeMat = new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.25, metalness: 0.1, color: 0xf0e0b0 });
    if (m.envMap) {
      domeMat.envMap = m.envMap;
      domeMat.envMapIntensity = 0.6;
    }
    const dome = new THREE.SphereGeometry(4.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    w.geo(dome, domeMat, { x: 0, y: WH + 2.9, z: -59 }, 0, ch);
    w.geo(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12), cant, { x: 0, y: WH + 8.2, z: -59 }, 0, ch);
    w.geo(new THREE.ConeGeometry(0.85, 1.0, 12), domeMat, { x: 0, y: WH + 9.4, z: -59 }, 0, ch);
    w.geo(uvBox(0.1, 1.4, 0.1), m.iron, { x: 0, y: WH + 10.5, z: -59 }, 0, ch);
    w.geo(uvBox(0.7, 0.1, 0.1), m.iron, { x: 0, y: WH + 10.7, z: -59 }, 0, ch);
  }

  // ---------------- INTERIOR ----------------
  floorRect(w, -6.5, -37.5, 6.5, -64.5, 0.05, m.stoneFloor, ch, 0.1);
  // presbytery (raised)
  const altarGroup = new THREE.Group();
  altarGroup.name = 'altar';
  w.scene.add(altarGroup);
  const presbZ0 = -58;
  // steps
  const stepMat = m.cantera;
  const presCols: import('../colliders').Collider[] = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(uvBox(13, 0.2 * (i + 1), 0.4), stepMat);
    mesh.position.set(0, 0.05 + (0.2 * (i + 1)) / 2, presbZ0 - 0.2 - i * 0.4);
    mesh.receiveShadow = true;
    altarGroup.add(mesh);
    presCols.push(w.col.addBox(0, 0, presbZ0 - 0.2 - i * 0.4, 13, 0.05 + 0.2 * (i + 1), 0.4, { opaque: false }));
  }
  const presFloor = new THREE.Mesh(uvBox(13, 0.65, 5.3), m.stoneFloor);
  presFloor.position.set(0, 0.325, presbZ0 - 1.2 - 2.65);
  presFloor.receiveShadow = true;
  altarGroup.add(presFloor);
  presCols.push(w.col.addBox(0, 0, presbZ0 - 1.2 - 2.65, 13, 0.65, 5.3, { opaque: false }));
  // altar table
  const altar = new THREE.Mesh(uvBox(3, 1.0, 1.1), cant);
  altar.position.set(0, 0.65 + 0.5, -62);
  altar.castShadow = true;
  altarGroup.add(altar);
  const cloth = new THREE.Mesh(uvBox(3.1, 0.03, 1.2), m.flat(0xefe8d8, { rough: 0.9, key: 'altarCloth' }));
  cloth.position.set(0, 1.66, -62);
  altarGroup.add(cloth);
  const clothF = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.5), m.flat(0xefe8d8, { rough: 0.9, key: 'altarCloth' }));
  clothF.position.set(0, 1.42, -61.39);
  altarGroup.add(clothF);
  presCols.push(w.col.addBox(0, 0.65, -62, 3, 1.1, 1.1));
  // retablo (gilded altarpiece) on the back wall
  const retablo = new THREE.Group();
  retablo.position.set(0, 0.65, -64.35);
  const gold = m.gold;
  const panels = makeCanvasTex(512, 512, (g) => {
    // warm painted panel: sunburst, lilies and doves (non-figurative)
    const grd = g.createRadialGradient(256, 200, 20, 256, 256, 360);
    grd.addColorStop(0, '#f2d890');
    grd.addColorStop(0.5, '#8a4a2a');
    grd.addColorStop(1, '#2a140a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,230,160,0.8)';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.lineWidth = i % 2 ? 2 : 5;
      g.beginPath();
      g.moveTo(256 + Math.cos(a) * 60, 200 + Math.sin(a) * 60);
      g.lineTo(256 + Math.cos(a) * 240, 200 + Math.sin(a) * 240);
      g.stroke();
    }
    g.fillStyle = '#f8f0dc';
    for (const [x, y] of [[150, 400], [362, 400]]) {
      g.beginPath();
      g.ellipse(x, y, 30, 60, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  const panelMat = new THREE.MeshStandardMaterial({ map: panels, roughness: 0.6, emissive: 0xffffff, emissiveMap: panels, emissiveIntensity: 0.05 });
  for (let cx = -1; cx <= 1; cx++)
    for (let ry = 0; ry < 2; ry++) {
      const pw = cx === 0 ? 2.2 : 1.7;
      const ph = ry === 0 ? 3.0 : 2.4;
      const px = cx * 2.3;
      const py = 2.0 + ry * 3.4 + ph / 2 - 1.0;
      const pnl = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), panelMat);
      pnl.position.set(px, py, 0.2);
      retablo.add(pnl);
      const frameG = new THREE.Mesh(uvBox(pw + 0.3, ph + 0.3, 0.2), gold);
      frameG.position.set(px, py, 0.08);
      retablo.add(frameG);
    }
  for (const x of [-3.4, -1.15, 1.15, 3.4]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 7.2, 10), gold);
    col.position.set(x, 4.2, 0.35);
    retablo.add(col);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.2, 8, 20, Math.PI), gold);
  crown.position.set(0, 8.1, 0.3);
  retablo.add(crown);
  const retBase = new THREE.Mesh(uvBox(8, 1.2, 0.5), gold);
  retBase.position.set(0, 0.6, 0.1);
  retablo.add(retBase);
  retablo.traverse((c) => ((c as THREE.Mesh).castShadow = false));
  altarGroup.add(retablo);
  // altar candles + flower vases
  const altarLamp = new THREE.Vector3(0, 2.1, -62);
  for (const x of [-1.2, -0.6, 0.6, 1.2]) {
    const c = w.assets.instance('candle', { height: 0.5 });
    if (c) {
      c.position.set(x, 1.67, -62.2);
      altarGroup.add(c);
    }
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.scale.set(0.07, 0.14, 1);
    fl.position.set(x, 2.25, -62.2);
    altarGroup.add(fl);
  }
  for (const x of [-4.8, 4.8]) {
    const v = w.assets.instance('vase', { height: 0.7 });
    if (v) {
      v.position.set(x, 0.65, -62.8);
      altarGroup.add(v);
    }
    // white lilies (alcatraces)
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6, 1, true), m.flat(0xf6f2e6, { rough: 0.8, side: THREE.DoubleSide, key: 'lily' }));
      s.position.set(x + (Math.random() - 0.5) * 0.3, 1.5 + Math.random() * 0.3, -62.8 + (Math.random() - 0.5) * 0.3);
      s.rotation.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      altarGroup.add(s);
    }
  }
  w.lamp('altarCandles', altarLamp, { color: 0xff9a40, intensity: 6, distance: 12, flicker: 'candle', poolY: null, halo: false, group: 'church', parent: altarGroup, priority: 2 });

  // ---- candelabrum (7 candles) for the puzzle ----
  const cand = new THREE.Group();
  cand.position.set(0, 0.65, -59.6);
  const candles: ChurchRefs['candelabrum']['candles'] = [];
  {
    const iron = m.iron;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.3, 8), iron);
    stem.position.y = 0.65;
    cand.add(stem);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.12, 12), iron);
    foot.position.y = 0.06;
    cand.add(foot);
    const arcG = new THREE.TorusGeometry(0.9, 0.03, 6, 24, Math.PI);
    const arc = new THREE.Mesh(arcG, iron);
    arc.rotation.z = Math.PI;
    arc.position.y = 1.55;
    cand.add(arc);
    const xs = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9];
    xs.forEach((x, i) => {
      const y = 1.55 - Math.sqrt(Math.max(0, 0.81 - x * x)) + (i === 3 ? 0.9 : 0);
      const yy = i === 3 ? 1.55 : y;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 8), m.gold);
      cup.position.set(x, yy + 0.02, 0);
      cand.add(cup);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), m.flat(0xf2ead8, { rough: 0.6, key: 'wax' }));
      wax.position.set(x, yy + 0.2, 0);
      cand.add(wax);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.scale.set(0.07, 0.15, 1);
      fl.position.set(x, yy + 0.42, 0);
      fl.visible = false;
      cand.add(fl);
      candles.push({ flame: fl, lit: false, pos: new THREE.Vector3(x, yy + 0.42 + 0.65, -59.6) });
    });
    const vbar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), iron);
    vbar.position.set(0, 1.1, 0);
    cand.add(vbar);
  }
  altarGroup.add(cand);
  w.col.addBox(0, 0.65, -59.6, 2.0, 1.8, 0.3, { opaque: false });

  // ---- pews ----
  const pewMat = m.woodDark;
  for (let row = 0; row < 9; row++) {
    const z = -43 - row * 1.45;
    for (const x of [-3.3, 3.3]) {
      w.box(x, 0.05, z, 4.4, 0.08, 0.45, pewMat, { chunk: ch });
      w.box(x, 0.05, z - 0.22, 4.4, 1.0, 0.06, pewMat, { chunk: ch });
      w.box(x, 0.05, z + 0.25, 4.4, 0.22, 0.12, pewMat, { chunk: ch }); // kneeler
      for (const ex of [-2.2, 2.2]) w.box(x + ex, 0.05, z, 0.08, 1.0, 0.6, pewMat, { chunk: ch });
      w.box(x, 0.05, z, 4.4, 0.45, 0.06, pewMat, { chunk: ch });
      w.solid(x, 0, z, 4.5, 0.95, 0.6, { opaque: false });
    }
  }
  // votive candle rack (veladoras) near the entrance
  const votives = new THREE.Group();
  {
    const rackZ = -40.5, rackX = 5.3;
    w.box(rackX, 0.05, rackZ, 0.8, 1.0, 1.8, m.iron, { chunk: ch, col: true });
    for (let i = 0; i < 18; i++) {
      const vx = rackX + ((i % 3) - 1) * 0.22;
      const vz = rackZ - 0.75 + Math.floor(i / 3) * 0.3;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), m.flat(['#b02a2a', '#d0a030', '#e8e0d0'][i % 3], { transparent: true, opacity: 0.8, emissive: ['#b02a2a', '#d0a030', '#e8e0d0'][i % 3], emissiveIntensity: 0.4, key: 'votive' + (i % 3) }));
      glass.position.set(vx, 1.11, vz);
      votives.add(glass);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.scale.set(0.04, 0.08, 1);
      fl.position.set(vx, 1.2, vz);
      votives.add(fl);
    }
    w.scene.add(votives);
    w.lamp('votives', new THREE.Vector3(rackX, 1.4, rackZ), { color: 0xff8a3a, intensity: 3.5, distance: 7, flicker: 'candle', poolY: null, halo: false, group: 'church' });
  }
  // holy water fonts and side altars
  for (const x of [-4.8, 4.8]) {
    w.geo(new THREE.CylinderGeometry(0.35, 0.12, 0.9, 12), cant, { x, y: 0.5, z: -38.6 }, 0, ch);
    w.solid(x, 0, -38.6, 0.7, 1, 0.7, { opaque: false });
  }
  // side altar (west) with flowers & candles
  w.box(-5.9, 0.05, -52, 1.0, 1.1, 2.0, cant, { chunk: ch, col: true });
  for (let i = 0; i < 5; i++) {
    const c = w.assets.instance('candle_wood', { height: 0.22 });
    if (c) {
      c.position.set(-5.7, 1.15, -52.8 + i * 0.4);
      w.scene.add(c);
    }
  }
  w.lamp('sideAltar', new THREE.Vector3(-5.6, 1.6, -52), { color: 0xff9040, intensity: 2.5, distance: 6, flicker: 'candle', poolY: null, halo: false, group: 'church' });
  // chandelier (off)
  for (const z of [-45, -53]) {
    w.geo(new THREE.CylinderGeometry(0.01, 0.01, 4, 4), m.iron, { x: 0, y: 13, z }, 0, ch, false);
    w.geo(new THREE.TorusGeometry(0.8, 0.04, 6, 20), m.gold, { x: 0, y: 10.9, z }, 0, ch, false, undefined, new THREE.Euler(Math.PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      w.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), m.flat(0xf2ead8, { key: 'wax' }), { x: Math.cos(a) * 0.8, y: 11.05, z: z + Math.sin(a) * 0.8 }, 0, ch, false);
    }
  }
  // ---- confessional (east wall) ----
  const confZ = -47.5;
  {
    const wd = m.woodDark;
    const bx = 5.75;
    w.box(bx, 0.05, confZ, 1.4, 2.6, 3.4, wd, { chunk: ch });
    w.box(bx - 0.05, 2.65, confZ, 1.5, 0.3, 3.6, wd, { chunk: ch });
    // cut-in look: dark openings for penitent sides
    for (const dz of [-1.1, 1.1]) {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.9), m.flat(0x050403, { key: 'voidDark' }));
      hole.position.set(bx - 0.71, 1.1, confZ + dz);
      hole.rotation.y = -Math.PI / 2;
      w.group('church').add(hole);
      // curtain
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7, 6, 1), m.flat(0x5a1414, { rough: 0.95, side: THREE.DoubleSide, key: 'curtain' }));
      cur.position.set(bx - 0.74, 1.3, confZ + dz);
      cur.rotation.y = -Math.PI / 2;
      w.group('church').add(cur);
      const ph = Math.random() * 10;
      w.updaters.push((dt, t) => {
        cur.rotation.z = Math.sin(t * 0.8 + ph) * 0.015;
      });
    }
    // priest door center
    const pd = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.1), m.woodDoor);
    pd.position.set(bx - 0.71, 1.1, confZ);
    pd.rotation.y = -Math.PI / 2;
    w.group('church').add(pd);
    // cross on top
    w.geo(uvBox(0.06, 0.5, 0.06), m.gold, { x: bx - 0.3, y: 3.2, z: confZ }, 0, ch);
    w.geo(uvBox(0.06, 0.06, 0.3), m.gold, { x: bx - 0.3, y: 3.3, z: confZ }, 0, ch);
    w.solid(bx + 0.2, 0, confZ, 1.0, 2.6, 3.4);
  }
  // ---- doors ----
  const doorMat = m.woodDoor;
  const mainDoorL = makeDoor(w, 'churchL', new THREE.Vector3(-1.5, 0.3, -36.3), '+x', 1.5, 5.2, 1, doorMat, { thickness: 0.14, sound: 'wood' });
  const mainDoorR = makeDoor(w, 'churchR', new THREE.Vector3(1.5, 0.3, -36.3), '-x', 1.5, 5.2, -1, doorMat, { thickness: 0.14, sound: 'wood' });
  mainDoorL.speed = mainDoorR.speed = 1.2;
  // tower door (west wall, z -38.8..-40)
  const towerDoor = makeDoor(w, 'tower', new THREE.Vector3(-7.25, 0.05, -38.8), '-z', 1.2, 2.45, 1, m.rust, { thickness: 0.08, sound: 'iron', locked: true, lockedMsg: 'La puerta de la torre está sellada. Una placa: «Clausurada desde el 2 de febrero de 2006».' });
  // sacristy door (east wall)
  const sacristyDoor = makeDoor(w, 'sacristy', new THREE.Vector3(7.25, 0.05, -54.3), '-z', 1.4, 2.55, -1, doorMat, { thickness: 0.08 });

  // ---------------- SACRISTY ----------------
  {
    const sc = 'church';
    const sx0 = 8, sx1 = 12.5, sz0 = -58, sz1 = -50;
    floorRect(w, sx0, sz0, sx1, sz1, 0.05, m.terracotta, sc, 0.1);
    holeWall(w, sx1, sz1, sx1, sz0, 0, 4.2, 0.4, [{ u0: 3.2, u1: 4.4, v0: 1.4, v1: 2.8 }], m.plaster(0xd8b890), sc);
    holeWall(w, sx0, sz1 - 0.0, sx1 + 0.2, sz1 - 0.0, 0, 4.2, 0.4, [], m.plaster(0xd8b890), sc);
    holeWall(w, sx0, sz0, sx1 + 0.2, sz0, 0, 4.2, 0.4, [], m.plaster(0xd8b890), sc);
    w.boxMM(sx0, 4.2, sz0, sx1 + 0.2, 4.5, sz1, m.concrete, { col: true, chunk: sc });
    const wd = w.prop('wardrobe', 12.0, 0.05, -56.5, -Math.PI / 2, 2.2, { col: [0.7, 2.2, 2.0] });
    void wd;
    w.prop('table_wood', 10.2, 0.05, -52.2, 0, 0.8, { col: [1.2, 0.8, 0.8] });
    w.prop('chair_wood', 10.2, 0.05, -53.1, 0, 1.05, { col: [0.5, 0.9, 0.5] });
    w.prop('books', 10.5, 0.85, -52.1, 0.2, 0.2);
    const lp = new THREE.Vector3(10, 3.6, -54);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m.lampOn);
    bulb.position.copy(lp);
    w.group('bulbs').add(bulb);
    w.lamp('sacristy', lp, { color: 0xffd0a0, intensity: 3, distance: 8, flicker: 'faulty', bulb, poolY: null, group: 'church' });
    const winP = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), winGlass);
    winP.position.set(12.28, 2.1, -53.8);
    winP.rotation.y = -Math.PI / 2;
    w.group('church').add(winP);
  }

  // ---------------- TOWER ----------------
  const TX0 = -14.5, TX1 = -8, TZ0 = -42.5, TZ1 = -36;
  const tw = 0.8;
  const TH = BELFRY_Y;
  const towerMat = m.pbr('cantera', { repeat: 0.5, color: 0xd8b09a, key: 'towerStone' });
  // walls with a window facing the plaza (south) at mid height and the door hole on the east (toward nave)
  const midWinH = { u0: 2.6, u1: 3.9, v0: 8.6, v1: 10.4 };
  holeWall(w, TX0, TZ1 - tw / 2, TX1, TZ1 - tw / 2, 0, TH, tw, [midWinH], towerMat, ch);
  holeWall(w, TX0, TZ0 + tw / 2, TX1, TZ0 + tw / 2, 0, TH, tw, [], towerMat, ch);
  holeWall(w, TX0 + tw / 2, TZ0, TX0 + tw / 2, TZ1, 0, TH, tw, [{ u0: 2.6, u1: 3.9, v0: 13, v1: 14.6 }], towerMat, ch);
  // east wall of tower (shared with nave west wall, door passage)
  holeWall(w, TX1 - tw / 2, TZ1, TX1 - tw / 2, TZ0, 0, TH, tw, [{ u0: 2.8, u1: 4.0, v0: 0, v1: 2.5 }], towerMat, ch);
  // passage floor between tower & nave
  floorRect(w, -8.8, -40.1, -6.5, -38.7, 0.05, m.stoneFloor, ch, 0.1);
  floorRect(w, TX0 + tw, TZ0 + tw, TX1 - tw, TZ1 - tw, 0.05, m.stoneFloor, ch, 0.1);
  // square spiral stairs
  const ix0 = TX0 + tw, ix1 = TX1 - tw, iz0 = TZ0 + tw, iz1 = TZ1 - tw; // interior
  const sw = 1.0;
  const rise = 0.2, run = 0.3;
  let y = 0.05;
  // corners in CCW order starting at SE-inner (near the door on the east side)
  const corners: [number, number][] = [
    [ix1 - sw / 2, iz1 - sw / 2], // SE
    [ix0 + sw / 2, iz1 - sw / 2], // SW
    [ix0 + sw / 2, iz0 + sw / 2], // NW
    [ix1 - sw / 2, iz0 + sw / 2], // NE
  ];
  const stairMat = m.pbr('wood', { repeat: 0.6, color: 0x7a5a44, key: 'stairWood' });
  let ci = 0;
  let flights = 0;
  // first: landing at SE corner is ground
  while (y < TH - 0.1 && flights < 12) {
    const a = corners[ci % 4], b = corners[(ci + 1) % 4];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const nSteps = Math.floor((len - sw) / run);
    for (let s = 0; s < nSteps && y < TH - 0.05; s++) {
      y += rise;
      const d = sw / 2 + (s + 0.5) * run;
      const cx = a[0] + ux * d, cz = a[1] + uz * d;
      const wdx = Math.abs(ux) > 0.5 ? run : sw;
      const wdz = Math.abs(ux) > 0.5 ? sw : run;
      w.box(cx, y - 0.2, cz, wdx, 0.2, wdz, stairMat, { col: true, chunk: ch, opaque: false });
      // railing on the inner side
      const inX = cx - uz * 0 + (Math.abs(ux) > 0.5 ? 0 : 0);
      void inX;
    }
    // landing at b
    y += rise;
    w.box(b[0], y - 0.2, b[1], sw, 0.2, sw, stairMat, { col: true, chunk: ch, opaque: false });
    // inner railing collider for this flight (the void is the inner square)
    const midx = (a[0] + b[0]) / 2, midz = (a[1] + b[1]) / 2;
    const cxv = (ix0 + ix1) / 2, czv = (iz0 + iz1) / 2;
    const offx = Math.sign(cxv - midx) * (Math.abs(ux) > 0.5 ? 0 : sw / 2 + 0.05);
    const offz = Math.sign(czv - midz) * (Math.abs(uz) > 0.5 ? 0 : sw / 2 + 0.05);
    const rl = len - sw;
    const rx = Math.abs(ux) > 0.5 ? rl : 0.08;
    const rz = Math.abs(uz) > 0.5 ? rl : 0.08;
    const baseY = y - rise * (nSteps + 1);
    w.col.addBox(midx + offx, baseY - 0.2, midz + offz, rx, rise * (nSteps + 1) + 1.1, rz, { opaque: false });
    const rail = new THREE.Mesh(uvBox(rx || 0.05, 0.05, rz || 0.05), stairMat);
    rail.position.set(midx + offx, (baseY + y) / 2 + 0.9, midz + offz);
    const slope = Math.atan2(rise * (nSteps + 1), rl);
    if (Math.abs(ux) > 0.5) rail.rotation.z = slope * Math.sign(ux);
    else rail.rotation.x = -slope * Math.sign(uz);
    w.group('church').add(rail);
    ci++;
    flights++;
  }
  const topLandingCorner = corners[ci % 4];
  // belfry floor with a hatch where stairs arrive
  const hx = topLandingCorner[0], hz = topLandingCorner[1];
  const fl = [
    [TX0, TZ0, TX1, TZ1],
  ];
  void fl;
  // floor made of 4 slabs around the hatch cell
  const bf = BELFRY_Y;
  const planks = m.pbr('wood', { repeat: 0.6, color: 0x8a6a50, key: 'belfryFloor' });
  const hxa = hx - sw / 2 - 0.05, hxb = hx + sw / 2 + 0.05, hza = hz - sw / 2 - 0.05, hzb = hz + sw / 2 + 0.05;
  w.boxMM(TX0, bf - 0.25, TZ0, TX1, bf, hza, planks, { col: true, chunk: ch });
  w.boxMM(TX0, bf - 0.25, hzb, TX1, bf, TZ1, planks, { col: true, chunk: ch });
  w.boxMM(TX0, bf - 0.25, hza, hxa, bf, hzb, planks, { col: true, chunk: ch });
  w.boxMM(hxb, bf - 0.25, hza, TX1, bf, hzb, planks, { col: true, chunk: ch });
  // belfry: 4 corner piers + arches, roof, cupola
  const BH = 6;
  for (const [px, pz] of [[TX0 + 0.6, TZ0 + 0.6], [TX1 - 0.6, TZ0 + 0.6], [TX0 + 0.6, TZ1 - 0.6], [TX1 - 0.6, TZ1 - 0.6]]) {
    w.box(px, bf, pz, 1.2, BH, 1.2, towerMat, { col: true, chunk: ch });
  }
  // lintels above arches
  w.boxMM(TX0, bf + BH - 1.2, TZ0, TX1, bf + BH, TZ0 + 1.2, towerMat, { chunk: ch });
  w.boxMM(TX0, bf + BH - 1.2, TZ1 - 1.2, TX1, bf + BH, TZ1, towerMat, { chunk: ch });
  w.boxMM(TX0, bf + BH - 1.2, TZ0, TX0 + 1.2, bf + BH, TZ1, towerMat, { chunk: ch });
  w.boxMM(TX1 - 1.2, bf + BH - 1.2, TZ0, TX1, bf + BH, TZ1, towerMat, { chunk: ch });
  // arch shapes (decorative) on each side
  const archG = (len: number) => {
    const sh = new THREE.Shape();
    const r = (len - 2.4) / 2;
    sh.moveTo(-len / 2, 0);
    sh.lineTo(len / 2, 0);
    sh.lineTo(len / 2, 1.3);
    sh.lineTo(r, 1.3);
    sh.absarc(0, 1.3 - r * 0 - 0.0, r, 0, Math.PI, false);
    sh.lineTo(-len / 2, 1.3);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: false, curveSegments: 12 });
  };
  void archG;
  // balustrades (low walls) in the openings — except the broken south one
  const balH = 1.0;
  const cx = (TX0 + TX1) / 2, cz = (TZ0 + TZ1) / 2;
  w.boxMM(TX0 + 1.2, bf, TZ0, TX1 - 1.2, bf + balH, TZ0 + 0.35, towerMat, { col: true, chunk: ch }); // north
  w.boxMM(TX0, bf, TZ0 + 1.2, TX0 + 0.35, bf + balH, TZ1 - 1.2, towerMat, { col: true, chunk: ch }); // west
  w.boxMM(TX1 - 0.35, bf, TZ0 + 1.2, TX1, bf + balH, TZ1 - 1.2, towerMat, { col: true, chunk: ch }); // east
  // south: broken balustrade (two stubs + invisible safety collider)
  w.boxMM(TX0 + 1.2, bf, TZ1 - 0.35, TX0 + 2.1, bf + balH, TZ1, towerMat, { col: true, chunk: ch });
  w.boxMM(TX1 - 2.0, bf, TZ1 - 0.35, TX1 - 1.2, bf + 0.45, TZ1, towerMat, { col: true, chunk: ch });
  w.col.addBox(cx, bf, TZ1 - 0.15, TX1 - TX0 - 2.4, 1.1, 0.3, { opaque: false });
  const brokenRail = new THREE.Vector3(cx, bf + 0.1, TZ1 - 0.4);
  // rubble
  for (let i = 0; i < 6; i++) w.geo(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.1, 0), towerMat, { x: cx + (Math.random() - 0.5) * 1.5, y: bf + 0.08, z: TZ1 - 0.7 - Math.random() * 0.5 }, Math.random() * 3, ch);
  // Lucía's little yellow shoe near the broken rail
  const shoe = new THREE.Group();
  const sole = new THREE.Mesh(uvBox(0.08, 0.03, 0.17), m.flat(0x3a2a1a, { key: 'sole' }));
  shoe.add(sole);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.flat(0xe8c030, { rough: 0.6, key: 'shoeY' }));
  upper.scale.set(0.75, 0.8, 1.4);
  upper.position.y = 0.015;
  shoe.add(upper);
  shoe.position.set(cx + 0.5, bf + 0.02, TZ1 - 0.6);
  shoe.rotation.y = 0.7;
  w.scene.add(shoe);
  // roof + cupola
  w.boxMM(TX0 - 0.2, bf + BH, TZ0 - 0.2, TX1 + 0.2, bf + BH + 0.4, TZ1 + 0.2, towerMat, { chunk: ch });
  const cup = new THREE.SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const tileMat = new THREE.MeshStandardMaterial({ map: (() => { const t = talavera(3, '#1d3f8a', '#e0b030'); t.repeat.set(4, 2); return t; })(), roughness: 0.3 });
  w.geo(cup, tileMat, { x: cx, y: bf + BH + 0.4, z: cz }, 0, ch);
  w.geo(uvBox(0.1, 1.6, 0.1), m.iron, { x: cx, y: bf + BH + 3.4, z: cz }, 0, ch);
  w.geo(uvBox(0.8, 0.1, 0.1), m.iron, { x: cx, y: bf + BH + 3.7, z: cz }, 0, ch);
  // bell-tower ceiling (inside)
  w.boxMM(TX0 + 0.2, bf + BH - 0.3, TZ0 + 0.2, TX1 - 0.2, bf + BH - 0.2, TZ1 - 0.2, planks, { chunk: ch });
  // pinnacles at the corners
  for (const [px, pz] of [[TX0, TZ0], [TX1, TZ0], [TX0, TZ1], [TX1, TZ1]]) {
    w.geo(new THREE.ConeGeometry(0.28, 1.4, 8), towerMat, { x: px, y: bf + BH + 1.1, z: pz }, 0, ch);
  }
  // tower exterior cornices
  for (const yy of [6, 12, bf - 0.3]) w.boxMM(TX0 - 0.15, yy, TZ0 - 0.15, TX1 + 0.15, yy + 0.35, TZ1 + 0.15, m.canteraDark, { chunk: ch });

  // bells: Dolores (S, plaza side), Soledad (W), Esperanza (N), Luz (E)
  const bells: ChurchRefs['bells'] = [];
  const bellDefs: [string, number, number, number, number][] = [
    ['Dolores', cx, TZ1 - 0.9, 1.05, 50],
    ['Soledad', TX0 + 0.9, cz, 0.85, 55],
    ['Esperanza', cx, TZ0 + 0.9, 0.75, 57],
    ['Luz', TX1 - 0.9, cz, 0.6, 62],
  ];
  for (const [name, bx, bz, size, midi] of bellDefs) {
    const g = new THREE.Group();
    const bellObj = w.assets.instance('church_bell', { height: size }) ?? (() => {
      const lathe = new THREE.LatheGeometry([new THREE.Vector2(0.05, size), new THREE.Vector2(size * 0.3, size * 0.95), new THREE.Vector2(size * 0.35, size * 0.6), new THREE.Vector2(size * 0.42, size * 0.2), new THREE.Vector2(size * 0.55, 0), new THREE.Vector2(size * 0.5, 0.02)], 20);
      return new THREE.Mesh(lathe, m.bronze);
    })();
    bellObj.traverse((c) => {
      const mm = c as THREE.Mesh;
      if (mm.isMesh) mm.material = m.bronze;
    });
    bellObj.position.y = -size;
    g.add(bellObj);
    // yoke
    const yoke = new THREE.Mesh(uvBox(size * 1.4, 0.18, 0.2), m.woodDark);
    yoke.position.y = 0.05;
    g.add(yoke);
    g.position.set(bx, bf + BH - 1.35, bz);
    w.scene.add(g);
    g.userData.name = name;
    // hanging rope
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, BH - 1.8, 5), m.flat(0x8a6a40, { rough: 1, key: 'rope' }));
    rope.position.set(bx + (bx === cx ? 0.35 : 0), bf + (BH - 1.8) / 2, bz + (bz === cz ? 0.35 : 0));
    w.scene.add(rope);
    bells.push({ name, mesh: g, pos: new THREE.Vector3(bx, bf + 1.2, bz), midi });
  }
  // clock mechanism in the middle of the belfry
  const mechanism = new THREE.Group();
  mechanism.position.set(cx, bf, cz - 0.2);
  {
    const frameMat = m.rust;
    const base = new THREE.Mesh(uvBox(1.6, 0.9, 0.8), m.woodDark);
    base.position.y = 0.45;
    mechanism.add(base);
    for (const sx of [-0.7, 0.7]) {
      const post = new THREE.Mesh(uvBox(0.08, 0.9, 0.08), frameMat);
      post.position.set(sx, 1.35, 0);
      mechanism.add(post);
    }
    const bar = new THREE.Mesh(uvBox(1.5, 0.08, 0.08), frameMat);
    bar.position.set(0, 1.8, 0);
    mechanism.add(bar);
  }
  const gearSlots: THREE.Object3D[] = [];
  const slotX = [-0.45, 0.02, 0.55];
  slotX.forEach((sx, i) => {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8), m.iron);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(sx, 1.3, 0.45);
    mechanism.add(axle);
    const slot = new THREE.Group();
    slot.position.set(sx, 1.3, 0.5);
    mechanism.add(slot);
    gearSlots.push(slot);
    if (i === 0) {
      // the driver gear that is still there (small)
      const gg = makeGear(w, 0.18, 12);
      slot.add(gg);
    }
  });
  const crank = new THREE.Mesh(uvBox(0.05, 0.3, 0.05), m.iron);
  crank.position.set(-0.85, 1.1, 0.3);
  mechanism.add(crank);
  mechanism.userData.crank = crank;
  w.scene.add(mechanism);
  w.col.addBox(cx, bf, cz - 0.2, 1.7, 1.9, 0.9, { opaque: false });
  // lamp in belfry (moonlight is main); a dim bulb
  w.lamp('belfry', new THREE.Vector3(cx, bf + 3.8, cz), { color: 0x9ab0d0, intensity: 1.5, distance: 7, poolY: null, halo: false, group: 'tower' });
  // lamps in the tower shaft (a couple of dim bulbs)
  for (const yy of [4, 11]) {
    const lp = new THREE.Vector3(TX0 + 1.2, yy, TZ0 + 1.2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.lampOn);
    bulb.position.copy(lp);
    w.group('bulbs').add(bulb);
    w.lamp('towerBulb' + yy, lp, { color: 0xffc890, intensity: 2.2, distance: 7, flicker: 'faulty', bulb, poolY: null, halo: true, group: 'tower' });
  }
  // tower window glass? open window (no glass). mark position
  const towerWindow = new THREE.Vector3(TX0 + 3.25, 9.6, TZ1 - 0.2);

  // ---------------- NAVE EXTENSION ("bigger inside") ----------------
  const extGroup = new THREE.Group();
  extGroup.name = 'churchExt';
  extGroup.visible = false;
  w.scene.add(extGroup);
  const extColliders: import('../colliders').Collider[] = [];
  {
    const EZ = -84.5;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, yy: number, z: number) => {
      const mm = new THREE.Mesh(geo, mat);
      mm.position.set(x, yy, z);
      mm.receiveShadow = true;
      extGroup.add(mm);
      return mm;
    };
    const len = -64.5 - EZ;
    add(uvBox(1.5, WH, len + 1.5), plasterOut, -7.25, WH / 2, -64.5 - len / 2);
    add(uvBox(1.5, WH, len + 1.5), plasterOut, 7.25, WH / 2, -64.5 - len / 2);
    add(uvBox(16, WH, 1.5), plasterOut, 0, WH / 2, EZ - 0.75);
    add(uvBox(13, 0.1, len), m.stoneFloor, 0, 0, -64.5 - len / 2);
    const v2 = new THREE.CylinderGeometry(6.5, 6.5, len, 24, 1, true, -Math.PI / 2, Math.PI);
    v2.rotateX(Math.PI / 2);
    add(v2, vaultMat, 0, 9.3, -64.5 - len / 2);
    for (let z = -67; z >= EZ + 2; z -= 5.5) {
      add(new THREE.TorusGeometry(6.4, 0.18, 6, 24, Math.PI), cant, 0, 9.3, z);
      for (const x of [-6.3, 6.3]) add(uvBox(0.5, 9.3, 0.5), cant, x, 4.65, z);
    }
    for (let row = 0; row < 11; row++) {
      const z = -60 - row * 1.45;
      if (z < EZ + 8) break;
      for (const x of [-3.3, 3.3]) {
        add(uvBox(4.4, 0.08, 0.45), pewMat, x, 0.49, z);
        add(uvBox(4.4, 1.0, 0.06), pewMat, x, 0.55, z - 0.22);
      }
    }
    extColliders.push(w.col.addBox(-7.25, 0, -64.5 - len / 2, 1.5, WH, len + 1.5), w.col.addBox(7.25, 0, -64.5 - len / 2, 1.5, WH, len + 1.5), w.col.addBox(0, 0, EZ - 0.75, 16, WH, 1.5));
    extColliders.forEach((c) => (c.enabled = false));
  }

  // interior ambient: moonlight shafts through windows (subtle dust planes)
  // light for nave (cool fill)
  w.lamp('naveFill', new THREE.Vector3(0, 9, -48), { color: 0x6a80b0, intensity: 3, distance: 20, poolY: null, halo: false, group: 'churchFill', priority: 1.5 });

  return {
    mainDoorL,
    mainDoorR,
    towerDoor,
    sacristyDoor,
    candelabrum: { group: cand, candles },
    votives,
    altarGroup,
    extGroup,
    backWallGroup,
    backCollider: [],
    extColliders,
    backColliders: [...backColliders],
    bells,
    mechanism,
    gearSlots,
    brokenRail,
    towerWindow,
    facadeClock: { canvas: fcCanvas, tex: fcTex },
    confessional: new THREE.Vector3(5.0, 0, confZ + 1.1),
    lucyShoe: shoe,
    belfryY: BELFRY_Y,
  };
}

export function makeGear(w: World, radius: number, teeth: number, color = 0x8a6a3a): THREE.Mesh {
  const sh = new THREE.Shape();
  const inner = radius * 0.82;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : inner;
    if (i === 0) sh.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else sh.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    sh.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.18, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false });
  g.translate(0, 0, -0.02);
  const mesh = new THREE.Mesh(g, w.mats.flat(color, { metal: 0.85, rough: 0.35, key: 'gear' + color }));
  mesh.castShadow = true;
  return mesh;
}

export { uvPlane };
