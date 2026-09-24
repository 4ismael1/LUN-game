import * as THREE from 'three';
import { World } from '../world';
import { uvBox } from '../geom';
import { makeCanvasTex } from '../canvasTex';

export interface StageRefs {
  generator: THREE.Vector3;
  panel: THREE.Vector3;
  panelSwitches: THREE.Mesh[];
  console: THREE.Vector3;
  micPos: THREE.Vector3;
  ghostBand: THREE.Group;
  underStage: THREE.Vector3;
  underStageExit: THREE.Vector3;
  parLights: THREE.Mesh[];
  musicianSpot: THREE.Vector3;
  banner: THREE.Mesh;
  generatorMesh: THREE.Group;
}

export function buildStage(w: World): StageRefs {
  const m = w.mats;
  const ch = 'stage';
  const SX0 = 42, SX1 = 49, SZ0 = -7, SZ1 = 7, SH = 1.2;
  // platform
  const planks = m.pbr('wood', { repeat: 0.7, color: 0x6a5040, key: 'stagePlanks' });
  w.boxMM(SX0, 0, SZ0, SX1, SH, SZ1, planks, { col: true, chunk: ch });
  // black skirt
  const skirt = m.flat(0x0c0c0e, { rough: 1, key: 'skirt' });
  w.boxMM(SX0 - 0.02, 0, SZ0, SX0, SH - 0.05, SZ1, skirt, { chunk: ch });
  // stairs (front-left)
  for (let i = 0; i < 5; i++) w.box(SX0 - 0.3 - i * 0.3, 0, 5.8, 0.3, SH - i * 0.24, 1.6, m.woodDark, { col: true, chunk: ch, opaque: false });
  // truss
  const truss = m.flat(0x9a9a9a, { metal: 0.9, rough: 0.35, key: 'truss' });
  for (const z of [SZ0 + 0.2, SZ1 - 0.2]) for (const x of [SX0 + 0.2, SX1 - 0.2]) w.box(x, SH, z, 0.25, 5.5, 0.25, truss, { col: true, chunk: ch });
  w.boxMM(SX0, SH + 5.5, SZ0 + 0.1, SX0 + 0.3, SH + 5.8, SZ1 - 0.1, truss, { chunk: ch });
  w.boxMM(SX1 - 0.3, SH + 5.5, SZ0 + 0.1, SX1, SH + 5.8, SZ1 - 0.1, truss, { chunk: ch });
  w.boxMM(SX0, SH + 5.5, SZ0 + 0.1, SX1, SH + 5.8, SZ0 + 0.4, truss, { chunk: ch });
  w.boxMM(SX0, SH + 5.5, SZ1 - 0.4, SX1, SH + 5.8, SZ1 - 0.1, truss, { chunk: ch });
  // par cans on the front truss
  const parLights: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const z = SZ0 + 1.2 + i * 2.3;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.35, 10), m.flat(0x111111, { metal: 0.6, key: 'parcan' }));
    can.position.set(SX0 + 0.15, SH + 5.2, z);
    can.rotation.z = -0.9;
    w.group('stage').add(can);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: [0xff3a6a, 0xffc040, 0x40a0ff][i % 3], toneMapped: false }));
    lens.position.set(SX0 - 0.02, SH + 5.08, z);
    lens.rotation.y = -Math.PI / 2;
    lens.rotation.x = 0;
    lens.visible = false;
    w.group('stage').add(lens);
    parLights.push(lens);
  }
  w.lamp('stageWash', new THREE.Vector3(SX0 - 2, SH + 5, 0), { color: 0xff8aa0, intensity: 8, distance: 16, poolY: null, halo: false, group: 'stageLights', on: false, priority: 1.5 });
  // backdrop banner
  const bannerTex = makeCanvasTex(1024, 384, (g) => {
    const grd = g.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#8a1a3a');
    grd.addColorStop(0.5, '#c8285a');
    grd.addColorStop(1, '#8a1a3a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 384);
    // papel picado border
    const cols = ['#f2cf3a', '#3fae5a', '#2f7fd0', '#f28c28', '#e8e2d8'];
    for (let i = 0; i < 16; i++) {
      g.fillStyle = cols[i % 5];
      g.fillRect(i * 64 + 4, 0, 56, 44);
      g.fillStyle = '#8a1a3a';
      g.beginPath();
      g.arc(i * 64 + 32, 22, 10, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fff4d8';
    g.textAlign = 'center';
    g.font = '96px "Lobster", Georgia';
    g.fillText('Gran Verbena', 512, 170);
    g.font = '52px "Alfa Slab One", Georgia';
    g.fillText('DE LA CANDELARIA', 512, 245);
    g.font = '34px "Cormorant Garamond", Georgia';
    g.fillText('Presentando a: Los Faroles de Aguascalientes · Sonido "El Relámpago"', 512, 310);
    g.fillText('1° de febrero · 9 de la noche · Entrada libre', 512, 352);
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.7), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.05 }));
  banner.position.set(SX1 - 0.4, SH + 3.4, 0);
  banner.rotation.y = -Math.PI / 2;
  w.group('stage').add(banner);
  // speakers
  for (const z of [SZ0 + 0.6, SZ1 - 0.6]) {
    w.prop('speaker', SX0 + 0.5, SH, z, -Math.PI / 2, 0.9, { col: [0.7, 0.9, 0.7] });
    w.prop('speaker', SX0 + 0.5, SH + 0.9, z, -Math.PI / 2, 0.9);
    w.prop('speaker', SX0 - 1.2, 0, z + (z < 0 ? -0.6 : 0.6), -Math.PI / 2, 1.3, { col: [0.8, 1.3, 0.8] });
  }
  // drum kit, guitar, mics
  w.prop('drum', SX1 - 2.2, SH, 0, -Math.PI / 2, 1.2);
  w.prop('guitar', SX0 + 2.2, SH, -2.5, -Math.PI / 2 + 0.3, 1.0);
  const micPos = new THREE.Vector3(SX0 + 1.3, SH, 0);
  for (const z of [-2, 0, 2]) w.prop('mic_stand', SX0 + 1.3, SH, z, -Math.PI / 2, 1.5);
  // cables on the floor (curvy lines)
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
  const cables: [THREE.Vector3[], number][] = [
    [[new THREE.Vector3(SX0 + 1.3, SH + 0.02, 0), new THREE.Vector3(SX0 + 2, SH + 0.02, 1), new THREE.Vector3(SX0 + 0.4, SH + 0.02, 4), new THREE.Vector3(SX0 - 0.5, 0.03, 6), new THREE.Vector3(36, 0.03, 3), new THREE.Vector3(34, 0.03, 0)], 0.02],
    [[new THREE.Vector3(38.5, 0.03, -10), new THREE.Vector3(40, 0.03, -8), new THREE.Vector3(41.8, 0.03, -6.5), new THREE.Vector3(42, 0.6, -6.9)], 0.035],
    [[new THREE.Vector3(33, 1.0, -11.8), new THREE.Vector3(33.5, 0.03, -10.5), new THREE.Vector3(36, 0.03, -9.5), new THREE.Vector3(38.5, 0.03, -10)], 0.035],
  ];
  for (const [pts, r] of cables) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 5, false), cableMat);
    tube.receiveShadow = true;
    w.group('stage').add(tube);
  }
  // FOH mixing table with the cassette deck
  const consolePos = new THREE.Vector3(34, 0, 0);
  w.box(34, 0, 0, 1.0, 0.8, 1.8, m.woodDark, { col: true, chunk: ch });
  const desk = new THREE.Mesh(uvBox(0.8, 0.12, 1.4), m.flat(0x1a1a1c, { metal: 0.3, rough: 0.5, key: 'mixer' }));
  desk.position.set(34, 0.86, 0);
  desk.rotation.z = 0.12;
  w.group('stage').add(desk);
  const knobs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), m.flat(0xd8d8d8, { key: 'knob' }), 48);
  for (let i = 0; i < 48; i++) knobs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(33.78 + (i % 6) * 0.08, 0.93 - (i % 6) * 0.01, -0.6 + Math.floor(i / 6) * 0.16));
  w.group('stage').add(knobs);
  const deck = new THREE.Mesh(uvBox(0.3, 0.1, 0.4), m.flat(0x2a2a2a, { metal: 0.5, key: 'deck' }));
  deck.position.set(34.1, 0.86, 0.75);
  w.group('stage').add(deck);
  // generator (planta de luz)
  const gen = new THREE.Group();
  const genBody = new THREE.Mesh(uvBox(1.4, 0.9, 0.8), m.flat(0xd8a020, { metal: 0.3, rough: 0.5, key: 'genYellow' }));
  genBody.position.y = 0.6;
  gen.add(genBody);
  const genFrame = new THREE.Mesh(uvBox(1.5, 0.06, 0.9), m.iron);
  genFrame.position.y = 1.08;
  gen.add(genFrame);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12), m.flat(0x2a2a2a, { metal: 0.6, key: 'engine' }));
  eng.rotation.z = Math.PI / 2;
  eng.position.set(0.2, 0.55, 0.45);
  gen.add(eng);
  for (const [x, z] of [[-0.55, 0.42], [0.55, 0.42], [-0.55, -0.42], [0.55, -0.42]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12), m.flat(0x111111, { key: 'tire' }));
    wh.rotation.x = Math.PI / 2;
    wh.position.set(x, 0.15, z);
    gen.add(wh);
  }
  const pull = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), m.flat(0x111111, { key: 'tire' }));
  pull.position.set(-0.4, 0.8, 0.43);
  gen.add(pull);
  gen.position.set(38.5, 0, -10);
  gen.traverse((c) => ((c as THREE.Mesh).castShadow = true));
  w.scene.add(gen);
  w.solid(38.5, 0, -10, 1.6, 1.2, 1.0);
  // electrical panel on the wall of the Casa de la Cultura (z=-12)
  const panelPos = new THREE.Vector3(33, 1.4, -11.8);
  w.box(33, 0.9, -11.85, 1.1, 1.3, 0.25, m.flat(0x6a7a70, { metal: 0.6, rough: 0.5, key: 'panelBox' }), { col: true, chunk: ch });
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshStandardMaterial({ map: makeCanvasTex(256, 100, (g) => {
    g.fillStyle = '#f2cf3a';
    g.fillRect(0, 0, 256, 100);
    g.fillStyle = '#111';
    g.font = 'bold 34px "Alfa Slab One", Georgia';
    g.textAlign = 'center';
    g.fillText('¡PELIGRO!', 128, 45);
    g.font = '22px "Cormorant Garamond", Georgia';
    g.fillText('ALTO VOLTAJE', 128, 80);
  }) }));
  warn.position.set(33, 2.0, -11.71);
  w.group('stage').add(warn);
  const panelSwitches: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const sw = new THREE.Mesh(uvBox(0.12, 0.2, 0.06), m.flat(0x1a1a1a, { key: 'switch' }));
    sw.position.set(32.64 + i * 0.24, 1.35, -11.7);
    w.group('stage').add(sw);
    panelSwitches.push(sw);
  }
  // plastic chairs & tables for the audience
  const chairs: { pos: THREE.Vector3; rotY: number }[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
    if (Math.random() < 0.12) continue;
    chairs.push({ pos: new THREE.Vector3(33.5 + r * 1.6, 0, -6.3 + c * 1.6 + (r % 2) * 0.2), rotY: -Math.PI / 2 + (Math.random() - 0.5) * 0.4 });
  }
  const chairGroup = w.assets.instanced('plastic_chair', chairs, { height: 0.88 });
  if (chairGroup) w.group('stage').add(chairGroup);
  for (const c of chairs) w.solid(c.pos.x, 0, c.pos.z, 0.5, 0.8, 0.5, { opaque: false });
  // two folding tables with tablecloths
  for (const z of [-9.5, 9.5]) {
    w.box(40, 0, z, 2.2, 0.75, 0.9, m.flat(0xe8e2d0, { rough: 0.9, key: 'tablecloth' }), { col: true, chunk: ch });
    w.prop('clay_pot', 39.5, 0.75, z, 0, 0.22);
    w.prop('mug', 40.4, 0.75, z + 0.1, 0.5, 0.09);
  }
  // ghost band (appears in events and the climax)
  const ghostBand = new THREE.Group();
  ghostBand.visible = false;
  w.scene.add(ghostBand);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9ab0d0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const models = ['npc_man', 'npc_man2', 'npc_woman', 'npc_old'];
  [[SX0 + 1.3, -2], [SX0 + 1.3, 0.2], [SX0 + 1.3, 2], [SX1 - 2.2, 1.4]].forEach(([x, z], i) => {
    const o = w.assets.instance(models[i], { height: 1.75, skinned: true });
    if (!o) return;
    o.position.set(x + 0.5, SH, z);
    o.rotation.y = -Math.PI / 2;
    o.traverse((c) => {
      const mm = c as THREE.Mesh;
      if (mm.isMesh) {
        mm.material = ghostMat;
        mm.castShadow = false;
        mm.frustumCulled = false;
      }
    });
    ghostBand.add(o);
  });
  (ghostBand as any).ghostMat = ghostMat;
  return {
    generator: new THREE.Vector3(38.5, 1.0, -9.4),
    panel: panelPos,
    panelSwitches,
    console: new THREE.Vector3(34, 1.0, 0.75),
    micPos,
    ghostBand,
    underStage: new THREE.Vector3(45, 0.4, SZ0 - 0.2),
    underStageExit: new THREE.Vector3(45, 0, SZ0 - 1.2),
    parLights,
    musicianSpot: new THREE.Vector3(SX0 + 1.6, SH, -1.0),
    banner,
    generatorMesh: gen,
  };
}
