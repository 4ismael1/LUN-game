import * as THREE from 'three';
import { World } from '../world';
import { uvBox, uvCylinder, sagPoints, rand } from '../geom';
import { papelPicado, Symbol, flameTexture } from '../canvasTex';

export interface PlazaRefs {
  fountainWater: THREE.Mesh;
  fountainJets: THREE.Points;
  papel: { mesh: THREE.InstancedMesh; count: number; torn: Float32Array; base: THREE.Matrix4[] }[];
  clueBanners: THREE.Group;
  stringLights: THREE.InstancedMesh[];
  kioskLamp: string;
  monument: THREE.Object3D | null;
  monumentHead: THREE.Object3D | null;
  flowers: THREE.Group;
  deadFlowers: THREE.Group;
  treeFoliage: THREE.InstancedMesh | null;
  benches: THREE.Vector3[];
  stalls: Record<string, THREE.Vector3>;
  organillo: THREE.Group;
  candlesFountain: THREE.Group;
}

/** extra yaw so the bench model's seat faces the given direction */
export const BENCH_MODEL_YAW = 0;

const PAPEL_COLORS = ['#e0357a', '#f28c28', '#3fae5a', '#2f7fd0', '#f2cf3a', '#8a44b8', '#e8e2d8'];

/** foliage material with wind sway */
function foliageMaterial(w: World, tex: THREE.Texture | undefined, color: number) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex ?? null,
    color,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.75,
    transparent: false,
    emissive: 0x0c160c,
  });
  if (tex) mat.emissiveMap = tex;
  if (!tex) mat.color.set(0x2b4a2a);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = w.mats.uniforms.uTime;
    sh.uniforms.uWind = w.mats.uniforms.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.37 + ip.z * 0.21 + ip.y * 0.5;
        float s = sin(uTime * 1.7 + ph) * 0.5 + sin(uTime * 3.9 + ph * 1.7) * 0.25;
        transformed.x += s * uWind * 0.12 * (position.y + 0.5);
        transformed.z += cos(uTime * 1.3 + ph) * uWind * 0.08 * (position.y + 0.5);`,
      );
  };
  return mat;
}

export function buildPlaza(w: World): PlazaRefs {
  const m = w.mats;
  const r = rand(7);
  // ---------- base ground (streets) ----------
  const groundGeo = new THREE.PlaneGeometry(130, 130);
  const uv = groundGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 130, uv.getY(i) * 130);
  const ground = new THREE.Mesh(groundGeo, m.cobble);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-9, 0, -27);
  ground.receiveShadow = true;
  w.scene.add(ground);

  // sidewalks along building lines (banquetas)
  const sw = m.sidewalk;
  const walk = (x0: number, z0: number, x1: number, z1: number) => w.boxMM(x0, 0, z0, x1, 0.15, z1, sw, { col: true, cast: false });
  walk(-30, 28.2, -3, 30.2); // south
  walk(3, 28.2, 30, 30.2);
  walk(-30, -30.2, -24, -28.2); // north west part
  walk(-20, -30.2, -16, -28.2);
  walk(23, -30.2, 30, -28.2);
  walk(28.2, -30, 30.2, -12); // east
  walk(28.2, 12, 30.2, 16);
  walk(28.2, 22, 30.2, 30);

  // ---------- garden (jardín) ----------
  const G = 22;
  const paveMat = m.pbr('cantera', { repeat: 0.35, color: 0xc9ad98, rough: 0.8, key: 'gardenPave' });
  w.boxMM(-G, 0, -G, G, 0.15, G, paveMat, { col: true, cast: false });
  // curb
  for (const [x0, z0, x1, z1] of [[-G - 0.25, -G - 0.25, G + 0.25, -G], [-G - 0.25, G, G + 0.25, G + 0.25], [-G - 0.25, -G, -G, G], [G, -G, G + 0.25, G]])
    w.boxMM(x0, 0, z0, x1, 0.18, z1, m.canteraDark, { col: false, cast: false });

  // planting beds (L shapes per quadrant)
  const bedTop = 0.42;
  const bedMat = m.ground;
  const grassMat = m.grass;
  const bedRects: [number, number, number, number][] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      bedRects.push([10.2, 2.8, 19.2, 19.2].map((v, i) => (i % 2 === 0 ? v * sx : v * sz)) as any);
      bedRects.push([2.8, 10.2, 10.2, 19.2].map((v, i) => (i % 2 === 0 ? v * sx : v * sz)) as any);
    }
  for (const [ax, az, bx, bz] of bedRects) {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    w.boxMM(x0, 0.15, z0, x1, bedTop - 0.06, z1, bedMat, { col: false, cast: false });
    w.boxMM(x0 + 0.2, 0.15, z0 + 0.2, x1 - 0.2, bedTop - 0.02, z1 - 0.2, grassMat, { col: false, cast: false });
    // curb stones
    const c = m.canteraDark;
    w.boxMM(x0, 0.15, z0, x1, bedTop, z0 + 0.2, c, { cast: false });
    w.boxMM(x0, 0.15, z1 - 0.2, x1, bedTop, z1, c, { cast: false });
    w.boxMM(x0, 0.15, z0, x0 + 0.2, bedTop, z1, c, { cast: false });
    w.boxMM(x1 - 0.2, 0.15, z0, x1, bedTop, z1, c, { cast: false });
    w.col.add(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, bedTop, z1), { opaque: false });
  }
  // grass tufts / flowers in beds (instanced cross-quads)
  const flowers = new THREE.Group();
  w.scene.add(flowers);
  const deadFlowers = new THREE.Group();
  deadFlowers.visible = false;
  w.scene.add(deadFlowers);
  {
    const tuftGeo = new THREE.PlaneGeometry(0.5, 0.45);
    tuftGeo.translate(0, 0.22, 0);
    const flowerCanvas = document.createElement('canvas');
    flowerCanvas.width = flowerCanvas.height = 128;
    const g = flowerCanvas.getContext('2d')!;
    const drawFlowers = (dead: boolean) => {
      g.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 18; i++) {
        g.strokeStyle = dead ? '#4a3a22' : '#2f5a26';
        g.lineWidth = 3;
        const x = 10 + Math.random() * 108;
        g.beginPath();
        g.moveTo(x, 128);
        g.quadraticCurveTo(x + (Math.random() - 0.5) * 30, 80, x + (Math.random() - 0.5) * 20, 40 + Math.random() * 40);
        g.stroke();
      }
      for (let i = 0; i < 9; i++) {
        g.fillStyle = dead ? '#5a4030' : ['#d8325a', '#f0b020', '#f4f0e8', '#c43a8a', '#ff7a1a'][Math.floor(Math.random() * 5)];
        g.beginPath();
        g.arc(14 + Math.random() * 100, 30 + Math.random() * 50, dead ? 4 : 7, 0, Math.PI * 2);
        g.fill();
      }
    };
    drawFlowers(false);
    const ft = new THREE.CanvasTexture(flowerCanvas);
    ft.colorSpace = THREE.SRGBColorSpace;
    const fc2 = document.createElement('canvas');
    fc2.width = fc2.height = 128;
    const g2 = fc2.getContext('2d')!;
    drawFlowers(true);
    g2.drawImage(flowerCanvas, 0, 0);
    const ftDead = new THREE.CanvasTexture(fc2);
    ftDead.colorSpace = THREE.SRGBColorSpace;
    drawFlowers(false);
    ft.needsUpdate = true;
    const fm = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const fmDead = new THREE.MeshStandardMaterial({ map: ftDead, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const pts: THREE.Matrix4[] = [];
    for (const [ax, az, bx, bz] of bedRects) {
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
      const area = (x1 - x0) * (z1 - z0);
      for (let i = 0; i < area * 0.35; i++) {
        const x = x0 + 0.5 + r() * (x1 - x0 - 1), z = z0 + 0.5 + r() * (z1 - z0 - 1);
        for (let k = 0; k < 2; k++) {
          const mm = new THREE.Matrix4().compose(new THREE.Vector3(x, bedTop - 0.03, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * Math.PI / 2 + r()), new THREE.Vector3(1, 0.7 + r() * 0.6, 1));
          pts.push(mm);
        }
      }
    }
    const im = new THREE.InstancedMesh(tuftGeo, fm, pts.length);
    const imd = new THREE.InstancedMesh(tuftGeo, fmDead, pts.length);
    pts.forEach((p, i) => {
      im.setMatrixAt(i, p);
      imd.setMatrixAt(i, p);
    });
    im.receiveShadow = imd.receiveShadow = true;
    flowers.add(im);
    deadFlowers.add(imd);
  }

  // ---------- trees: Indian laurels with trimmed crowns ----------
  const treePos: THREE.Vector3[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      treePos.push(new THREE.Vector3(14.5 * sx, bedTop, 6.5 * sz));
      treePos.push(new THREE.Vector3(6.5 * sx, bedTop, 14.5 * sz));
      treePos.push(new THREE.Vector3(15.5 * sx, bedTop, 15.5 * sz));
    }
  let treeFoliage: THREE.InstancedMesh | null = null;
  {
    const leafTex = w.assets.tex('leaves/leaves.png');
    const leafMat = foliageMaterial(w, leafTex, 0x9fb890);
    const card = new THREE.PlaneGeometry(1.1, 1.1);
    const mats: THREE.Matrix4[] = [];
    for (const tp of treePos) {
      const h = 3.2 + r() * 0.6;
      const trunkGeo = uvCylinder(0.22, 0.34, h, 10);
      w.geo(trunkGeo, m.bark, { x: tp.x, y: tp.y + h / 2, z: tp.z }, r() * 6, 'plaza');
      // branches
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI * 2 + r();
        const bl = 1.6 + r() * 0.6;
        const bg = uvCylinder(0.07, 0.13, bl, 6);
        w.geo(bg, m.bark, { x: tp.x + Math.cos(a) * 0.5, y: tp.y + h - 0.2, z: tp.z + Math.sin(a) * 0.5 }, 0, 'plaza', true, undefined, new THREE.Euler(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7));
      }
      w.solid(tp.x, 0, tp.z, 0.6, 3, 0.6, { opaque: false });
      // crown: rounded box volume filled with leaf cards
      const cx = tp.x, cy = tp.y + h + 1.5, cz = tp.z;
      const rx = 3.0 + r() * 0.5, ry = 1.9 + r() * 0.3, rz = 3.0 + r() * 0.5;
      for (let i = 0; i < 230; i++) {
        // points near the surface of a superellipsoid
        const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1);
        const sgn = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 0.6);
        const shell = 0.75 + r() * 0.25;
        const px = cx + sgn(Math.sin(v) * Math.cos(u)) * rx * shell;
        const py = cy + sgn(Math.cos(v)) * ry * shell;
        const pz = cz + sgn(Math.sin(v) * Math.sin(u)) * rz * shell;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI));
        const s = 0.8 + r() * 0.6;
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(s, s, s)));
      }
    }
    treeFoliage = new THREE.InstancedMesh(card, leafMat, mats.length);
    mats.forEach((mm, i) => treeFoliage!.setMatrixAt(i, mm));
    treeFoliage.castShadow = true;
    treeFoliage.receiveShadow = true;
    treeFoliage.computeBoundingSphere();
    w.scene.add(treeFoliage);
    (treeFoliage as any).baseMatrices = mats;
  }

  // ---------- benches ----------
  const benches: THREE.Vector3[] = [];
  const benchT: { pos: THREE.Vector3; rotY: number }[] = [];
  const addBench = (x: number, z: number, rotY: number) => {
    benchT.push({ pos: new THREE.Vector3(x, 0.15, z), rotY });
    benches.push(new THREE.Vector3(x, 0.15, z));
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    w.solid(x, 0.15, z, 1.9 * c + 0.6 * s, 0.5, 1.9 * s + 0.6 * c, { opaque: false });
  };
  for (const s of [-1, 1]) {
    addBench(2.45, 13 * s, -Math.PI / 2);
    addBench(-2.45, 13 * s, Math.PI / 2);
    addBench(13 * s, 2.45, Math.PI);
    addBench(13 * s, -2.45, 0);
    addBench(21 * s, 9, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    addBench(21 * s, -9, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  // fix orientation: benches face the path (their local +z faces the sitter's front)
  const benchGroup = w.assets.instanced('bench', benchT.map((b) => ({ pos: b.pos, rotY: b.rotY + BENCH_MODEL_YAW })), { width: 1.9 });
  if (benchGroup) w.scene.add(benchGroup);
  else
    for (const b of benchT) {
      // procedural wrought-iron bench
      const iron = m.ironGreen;
      const wd = m.wood;
      const f = new THREE.Vector3(Math.sin(b.rotY), 0, Math.cos(b.rotY));
      for (let i = 0; i < 4; i++) {
        const off = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(-0.85 + i * 0.05 * 0);
        void off;
      }
      w.geo(uvBox(1.8, 0.05, 0.45), wd, { x: b.pos.x, y: b.pos.y + 0.45, z: b.pos.z }, b.rotY);
      w.geo(uvBox(1.8, 0.4, 0.05), wd, { x: b.pos.x - f.x * 0.22, y: b.pos.y + 0.75, z: b.pos.z - f.z * 0.22 }, b.rotY);
      for (const side of [-0.85, 0.85]) {
        const sx = -f.z * side, sz = f.x * side;
        w.geo(uvBox(0.06, 0.9, 0.5), iron, { x: b.pos.x + sx, y: b.pos.y + 0.45, z: b.pos.z + sz }, b.rotY);
      }
    }

  // ---------- kiosk ----------
  const organillo = new THREE.Group();
  buildKiosk(w, organillo);

  // ---------- fountain ----------
  const FZ = -14;
  const basinGeo = new THREE.LatheGeometry([new THREE.Vector2(2.3, 0), new THREE.Vector2(2.75, 0), new THREE.Vector2(2.8, 0.55), new THREE.Vector2(2.95, 0.62), new THREE.Vector2(2.95, 0.72), new THREE.Vector2(2.55, 0.72), new THREE.Vector2(2.5, 0.2)], 32);
  w.geo(basinGeo, m.cantera, { x: 0, y: 0.15, z: FZ });
  w.solid(0, 0.15, FZ, 5.2, 0.72, 5.2, { opaque: false });
  w.solid(0, 0.15, FZ, 4.4, 0.72, 5.9, { opaque: false });
  w.solid(0, 0.15, FZ, 5.9, 0.72, 4.4, { opaque: false });
  const pilaGeo = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.45, 0), new THREE.Vector2(0.3, 0.3), new THREE.Vector2(0.22, 1.2), new THREE.Vector2(1.1, 1.4), new THREE.Vector2(1.15, 1.55), new THREE.Vector2(0.2, 1.6), new THREE.Vector2(0.14, 2.2), new THREE.Vector2(0.35, 2.35), new THREE.Vector2(0.02, 2.6)], 24);
  w.geo(pilaGeo, m.cantera, { x: 0, y: 0.35, z: FZ });
  // talavera band on the basin
  w.geo(new THREE.CylinderGeometry(2.82, 2.82, 0.25, 32, 1, true), m.talavera, { x: 0, y: 0.5, z: FZ });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0c1c22, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.88 });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = w.mats.uniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <beginnormal_vertex>',
      `vec3 objectNormal = normalize(vec3(sin(position.x*6.0+uTime*2.0)*0.08 + sin(position.y*9.0-uTime*3.1)*0.05, cos(position.y*7.0+uTime*2.4)*0.08, 1.0));
       #ifdef USE_TANGENT
       vec3 objectTangent = vec3( tangent.xyz );
       #endif`,
    );
  };
  if (w.mats.envMap) {
    waterMat.envMap = w.mats.envMap;
    waterMat.envMapIntensity = 0.8;
  }
  const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(2.52, 32), waterMat);
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(0, 0.62, FZ);
  w.scene.add(fountainWater);
  // water jets (points)
  const jetN = 500;
  const jg = new THREE.BufferGeometry();
  const jp = new Float32Array(jetN * 3);
  const jv = new Float32Array(jetN * 4);
  for (let i = 0; i < jetN; i++) {
    const a = r() * Math.PI * 2;
    jv[i * 4] = Math.cos(a);
    jv[i * 4 + 1] = Math.sin(a);
    jv[i * 4 + 2] = r();
    jv[i * 4 + 3] = 0.6 + r() * 0.5;
  }
  jg.setAttribute('position', new THREE.BufferAttribute(jp, 3));
  const fountainJets = new THREE.Points(jg, new THREE.PointsMaterial({ color: 0xa8c8d8, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
  fountainJets.frustumCulled = false;
  w.scene.add(fountainJets);
  w.updaters.push((dt, t) => {
    if (!fountainJets.visible) return;
    for (let i = 0; i < jetN; i++) {
      const ph = (t * 0.7 * jv[i * 4 + 3] + jv[i * 4 + 2]) % 1;
      const rad = 0.15 + ph * 1.0;
      jp[i * 3] = jv[i * 4] * rad;
      jp[i * 3 + 1] = 2.95 + 0.25 * Math.sin(ph * Math.PI) - ph * ph * 2.0;
      jp[i * 3 + 2] = FZ + jv[i * 4 + 1] * rad;
      jp[i * 3] += 0;
    }
    jg.attributes.position.needsUpdate = true;
  });
  // floating candles in the fountain (climax)
  const candlesFountain = new THREE.Group();
  candlesFountain.visible = false;
  {
    const ft = flameTexture();
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, rr = 0.8 + r() * 1.5;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), m.flat(0xf2ead8, { key: 'wax' }));
      c.position.set(Math.cos(a) * rr, 0.68, FZ + Math.sin(a) * rr);
      candlesFountain.add(c);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(0.08, 0.16, 1);
      s.position.set(c.position.x, 0.8, c.position.z);
      candlesFountain.add(s);
    }
    w.scene.add(candlesFountain);
  }

  // ---------- monument (statue) ----------
  const MZ = 14;
  w.box(0, 0.15, MZ, 2.6, 0.5, 2.6, m.canteraDark, { col: true });
  w.box(0, 0.65, MZ, 1.7, 2.2, 1.7, m.cantera, { col: true });
  w.box(0, 2.85, MZ, 2.0, 0.3, 2.0, m.canteraDark, { col: true });
  let monument: THREE.Object3D | null = null;
  let monumentHead: THREE.Object3D | null = null;
  {
    const model = w.assets.has('npc_woman') ? 'npc_woman' : w.assets.has('npc_man') ? 'npc_man' : null;
    if (model) {
      const o = w.assets.instance(model, { height: 2.3, skinned: true });
      if (o) {
        o.position.set(0, 3.15, MZ);
        o.rotation.y = Math.PI;
        o.traverse((c) => {
          const mm = c as THREE.Mesh;
          if (mm.isMesh) {
            mm.material = m.bronze;
            mm.frustumCulled = false;
          }
          if ((c as THREE.Bone).isBone && /head/i.test(c.name) && !monumentHead) monumentHead = c;
        });
        w.scene.add(o);
        monument = o;
      }
    }
    if (!monument) {
      const ob = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4, 4), m.bronze);
      ob.position.set(0, 5.1, MZ);
      w.scene.add(ob);
      monument = ob;
    }
    // plaque
  }

  // ---------- garden lamps (faroles) ----------
  const lampSpots: [number, number][] = [];
  for (const s of [-1, 1]) {
    lampSpots.push([2.6, 9.6 * s], [-2.6, 9.6 * s], [9.6 * s, 2.6], [9.6 * s, -2.6]);
    lampSpots.push([2.6, 19.8 * s], [-2.6, 19.8 * s], [19.8 * s, 2.6], [19.8 * s, -2.6]);
    lampSpots.push([21 * s, 21], [21 * s, -21]);
  }
  lampSpots.forEach(([x, z], i) => farol(w, x, z, i, i % 5 === 3 ? 'faulty' : 'none'));

  // ---------- papel picado ----------
  const papel = buildPapelPicado(w, r);
  const clueBanners = buildClueBanners(w);
  const stringLights = buildStringLights(w, r);

  // ---------- stalls ----------
  const stalls: Record<string, THREE.Vector3> = {};
  stalls.tamales = stall(w, 11, 25.2, Math.PI, 'tamales', ['#c83a3a', '#f2e6d0']);
  stalls.elotes = stall(w, -11, 25.2, Math.PI, 'elotes', ['#2f8f4e', '#f2e6d0']);
  stalls.loteria = stall(w, 25.5, -6, -Math.PI / 2, 'loteria', ['#2f5fb0', '#f2cf3a']);
  stalls.juguetes = stall(w, 25.5, 6, -Math.PI / 2, 'juguetes', ['#e0357a', '#f2e6d0']);
  stalls.flores = stall(w, 10, -25.2, 0, 'flores', ['#f28c28', '#f2e6d0']);
  stalls.bunuelos = stall(w, -25.5, 12, Math.PI / 2, 'bunuelos', ['#8a44b8', '#f2e6d0']);

  return {
    fountainWater,
    fountainJets,
    papel,
    clueBanners,
    stringLights,
    kioskLamp: 'kioskLamp',
    monument,
    monumentHead,
    flowers,
    deadFlowers,
    treeFoliage,
    benches,
    stalls,
    organillo,
    candlesFountain,
  };
}

export function farol(w: World, x: number, z: number, i: number, flicker: 'none' | 'faulty' = 'none', y = 0.15, group = 'garden', h = 3.6) {
  const m = w.mats;
  const iron = m.iron;
  // base
  w.geo(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8), iron, { x, y: y + 0.25, z });
  w.geo(new THREE.CylinderGeometry(0.06, 0.09, h - 0.5, 8), iron, { x, y: y + 0.5 + (h - 0.5) / 2, z });
  w.geo(new THREE.TorusGeometry(0.11, 0.025, 6, 12), iron, { x, y: y + 1.2, z }, 0, 'plaza', false, undefined, new THREE.Euler(Math.PI / 2, 0, 0));
  // lantern
  const ly = y + h + 0.25;
  w.geo(new THREE.CylinderGeometry(0.2, 0.13, 0.12, 6), iron, { x, y: ly - 0.28, z });
  const glassMat = m.get('farolGlass', () => new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffb050, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.2 }));
  const cage = new THREE.CylinderGeometry(0.22, 0.15, 0.5, 6, 1, true);
  w.geo(cage, m.get('farolCage', () => new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide, wireframe: true })), { x, y: ly, z }, 0, 'plaza', false);
  void glassMat;
  w.geo(new THREE.ConeGeometry(0.3, 0.28, 6), iron, { x, y: ly + 0.38, z });
  w.geo(new THREE.SphereGeometry(0.05, 6, 6), iron, { x, y: ly + 0.56, z });
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.44, 6), m.lampOn);
  bulb.position.set(x, ly, z);
  w.group('bulbs').add(bulb);
  w.solid(x, 0, z, 0.4, 3, 0.4, { opaque: false });
  return w.lamp('farol' + i, new THREE.Vector3(x, ly, z), { color: 0xffa650, intensity: 7, distance: 13, bulb, poolY: y, poolSize: 8, flicker, group });
}

function buildKiosk(w: World, organillo: THREE.Group) {
  const m = w.mats;
  const R = 5.2;
  const PH = 1.3;
  // platform (octagonal prism)
  const plat = new THREE.CylinderGeometry(R, R, PH, 8, 1);
  plat.rotateY(Math.PI / 8);
  w.geo(plat, m.cantera, { x: 0, y: 0.15 + PH / 2, z: 0 });
  const top = new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.12, 8);
  top.rotateY(Math.PI / 8);
  w.geo(top, m.canteraDark, { x: 0, y: 0.15 + PH + 0.02, z: 0 });
  // floor tiles on top
  const floor = new THREE.CircleGeometry(R - 0.05, 8);
  floor.rotateX(-Math.PI / 2);
  floor.rotateY(Math.PI / 8);
  const fuv = floor.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * R, fuv.getY(i) * R);
  w.geo(floor, m.terracotta, { x: 0, y: 0.15 + PH + 0.085, z: 0 }, 0, 'plaza', false);
  const a = R * Math.cos(Math.PI / 8), s = R * Math.sin(Math.PI / 8);
  const topY = 0.15 + PH;
  w.col.addBox(0, 0, 0, a * 2, topY, s * 2, { opaque: false });
  w.col.addBox(0, 0, 0, s * 2, topY, a * 2, { opaque: false });
  w.col.addBox(0, 0, 0, (a + s), topY, (a + s), { opaque: false });
  // stairs north & south
  for (const dir of [-1, 1]) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const h = ((i + 1) / n) * PH;
      const zc = dir * (a + 1.6 - i * 0.32 - 0.16);
      w.box(0, 0.15, zc, 2.6, h, 0.34, m.cantera, { col: true, cast: false });
    }
    // side cheeks
    for (const sx of [-1.45, 1.45]) w.box(sx, 0.15, dir * (a + 0.55), 0.3, PH + 0.3, 2.3, m.canteraDark, { col: true });
  }
  // iron columns
  const colR = R - 0.35;
  const colH = 3.8;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(ang) * colR, z = Math.sin(ang) * colR;
    w.geo(new THREE.CylinderGeometry(0.1, 0.12, colH, 10), m.ironGreen, { x, y: topY + colH / 2, z });
    w.geo(new THREE.CylinderGeometry(0.22, 0.12, 0.3, 8), m.ironGreen, { x, y: topY + colH - 0.1, z });
    w.geo(new THREE.CylinderGeometry(0.18, 0.2, 0.25, 8), m.ironGreen, { x, y: topY + 0.12, z });
    w.solid(x, topY, z, 0.3, colH, 0.3, { opaque: false });
    // filigree brackets
    w.geo(new THREE.TorusGeometry(0.35, 0.02, 4, 16, Math.PI / 2), m.ironGreen, { x: x * 0.93, y: topY + colH - 0.45, z: z * 0.93 }, -ang + Math.PI / 2);
  }
  // railing between columns (not across stair openings at N/S)
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
    const mid = (a0 + a1) / 2;
    const isStair = Math.abs(Math.sin(mid)) > 0.95;
    if (isStair) continue;
    const p0 = new THREE.Vector3(Math.cos(a0) * colR, 0, Math.sin(a0) * colR);
    const p1 = new THREE.Vector3(Math.cos(a1) * colR, 0, Math.sin(a1) * colR);
    const len = p0.distanceTo(p1);
    const c = p0.clone().add(p1).multiplyScalar(0.5);
    const rot = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
    w.geo(uvBox(len, 0.05, 0.06), m.ironGreen, { x: c.x, y: topY + 0.95, z: c.z }, rot);
    w.geo(uvBox(len, 0.04, 0.05), m.ironGreen, { x: c.x, y: topY + 0.15, z: c.z }, rot);
    const nb = 10;
    for (let b = 1; b < nb; b++) {
      const bp = p0.clone().lerp(p1, b / nb);
      w.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), m.ironGreen, { x: bp.x, y: topY + 0.55, z: bp.z }, 0, 'plaza', false);
      if (b % 2 === 0) w.geo(new THREE.TorusGeometry(0.1, 0.01, 4, 10), m.ironGreen, { x: bp.x, y: topY + 0.55, z: bp.z }, rot, 'plaza', false);
    }
    // railing collider
    const cc = Math.abs(Math.cos(rot)), ss = Math.abs(Math.sin(rot));
    w.col.addBox(c.x, topY, c.z, len * cc + 0.15 * ss, 1.0, len * ss + 0.15 * cc, { opaque: false });
  }
  // frieze ring and roof
  const friezeY = topY + colH;
  const fr = new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.45, 8, 1, true);
  fr.rotateY(Math.PI / 8);
  w.geo(fr, m.ironGreen, { x: 0, y: friezeY + 0.1, z: 0 });
  const cornice = new THREE.CylinderGeometry(R + 0.35, R + 0.1, 0.2, 8);
  cornice.rotateY(Math.PI / 8);
  w.geo(cornice, m.ironGreen, { x: 0, y: friezeY + 0.42, z: 0 });
  const roofPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const rr = (R + 0.3) * (1 - t) * (0.8 + 0.2 * Math.cos(t * Math.PI * 0.5));
    const yy = Math.sin(t * Math.PI * 0.5) * 2.6 - t * t * 0.4;
    roofPts.push(new THREE.Vector2(Math.max(0.3, rr), yy));
  }
  const roof = new THREE.LatheGeometry(roofPts, 8);
  roof.rotateY(Math.PI / 8);
  const patina = m.pbr('metal_rust', { repeat: 0.5, color: 0x5f8f7c, rough: 0.6, metal: 0.5, key: 'patina' });
  w.geo(roof, patina, { x: 0, y: friezeY + 0.5, z: 0 });
  // underside ceiling (wood)
  const ceil = new THREE.CircleGeometry(R + 0.2, 8);
  ceil.rotateX(Math.PI / 2);
  ceil.rotateY(Math.PI / 8);
  const cuv = ceil.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * R, cuv.getY(i) * R);
  w.geo(ceil, m.woodDark, { x: 0, y: friezeY + 0.5, z: 0 }, 0, 'plaza', false);
  // lantern top (linternilla)
  const ltY = friezeY + 0.5 + 2.2;
  w.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 8, 1, true), patina, { x: 0, y: ltY + 0.35, z: 0 });
  w.geo(new THREE.ConeGeometry(0.65, 0.9, 8), patina, { x: 0, y: ltY + 1.15, z: 0 });
  w.geo(new THREE.SphereGeometry(0.1, 8, 8), m.gold, { x: 0, y: ltY + 1.7, z: 0 });
  // hanging central lamp
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), m.lampOn);
  bulb.position.set(0, friezeY - 0.2, 0);
  w.group('bulbs').add(bulb);
  w.geo(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), m.iron, { x: 0, y: friezeY + 0.15, z: 0 });
  w.lamp('kioskLamp', new THREE.Vector3(0, friezeY - 0.3, 0), { color: 0xffc27a, intensity: 10, distance: 16, bulb, poolY: null, group: 'kiosk', priority: 2 });
  // kiosk bulbs along the cornice
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), m.lampOn);
    b.position.set(Math.cos(ang) * (R + 0.3), friezeY + 0.3, Math.sin(ang) * (R + 0.3));
    w.group('kioskBulbs').add(b);
  }
  // ---- organillo (barrel organ / music box) in the kiosk center ----
  const og = organillo;
  og.position.set(0, topY + 0.09, 0);
  const wood = m.pbr('wood', { repeat: 2, color: 0x7a3a22, rough: 0.5, key: 'organWood' });
  const body = new THREE.Mesh(uvBox(0.9, 0.75, 0.55), wood);
  body.position.y = 0.95;
  og.add(body);
  const legs = new THREE.Mesh(uvBox(0.8, 0.6, 0.45), m.woodDark);
  legs.position.y = 0.3;
  og.add(legs);
  const wheelL = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16), m.iron);
  wheelL.position.set(-0.45, 0.22, 0);
  wheelL.rotation.y = Math.PI / 2;
  og.add(wheelL);
  const wheelR = wheelL.clone();
  wheelR.position.x = 0.45;
  og.add(wheelR);
  // gilded front panel with painted lotería figures
  const panelTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5a1a14';
    g.fillRect(0, 0, 512, 384);
    g.strokeStyle = '#c89a3a';
    g.lineWidth = 12;
    g.strokeRect(14, 14, 484, 356);
    g.fillStyle = '#c89a3a';
    g.font = '44px "Lobster", Georgia';
    g.textAlign = 'center';
    g.fillText('La Canción de Lucía', 256, 90);
    g.font = '26px "Cormorant Garamond", Georgia';
    g.fillText('Organillo · Hnos. Arriaga · 1958', 256, 140);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(96 + i * 80, 250, 26, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.63), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.5, metalness: 0.2 }));
  panel.position.set(0, 0.95, 0.281);
  og.add(panel);
  // crank
  const crank = new THREE.Group();
  const arm = new THREE.Mesh(uvBox(0.04, 0.25, 0.04), m.iron);
  arm.position.y = 0.12;
  crank.add(arm);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6), m.woodDark);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.06, 0.24, 0);
  crank.add(handle);
  crank.position.set(0.47, 1.0, 0);
  crank.rotation.y = Math.PI / 2;
  og.add(crank);
  og.userData.crank = crank;
  // keys on top (6)
  const keys: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const k = new THREE.Mesh(uvBox(0.1, 0.04, 0.2), m.flat(0xe8dcc0, { rough: 0.4, key: 'ivory' }));
    k.position.set(-0.3 + i * 0.12, 1.34, 0.08);
    og.add(k);
    keys.push(k);
  }
  og.userData.keys = keys;
  og.traverse((c) => ((c as THREE.Mesh).castShadow = true));
  og.visible = false;
  w.scene.add(og);
  w.solid(0, topY, 0, 0.95, 1.4, 0.6, { opaque: false });
}

function buildPapelPicado(w: World, r: () => number) {
  const out: PlazaRefs['papel'] = [];
  const syms: Symbol[] = ['flor', 'paloma', 'estrella', 'flor', 'sol', 'paloma', 'flor'];
  const kR = 5.4;
  const kY = 0.15 + 1.3 + 3.8 + 0.3;
  // strings: from kiosk cornice to garden lamps/trees area and across ring street to facades
  const lines: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p0 = new THREE.Vector3(Math.cos(a) * kR, kY, Math.sin(a) * kR);
    const p1 = new THREE.Vector3(Math.cos(a) * 20.5, 4.3, Math.sin(a) * 20.5);
    lines.push([p0, p1]);
  }
  // across the ring street: garden edge to facades
  const across: [number, number, number, number][] = [
    [-18, 22, -18, 29.8], [-6, 22, -6, 29.8], [6, 22, 6, 29.8], [18, 22, 18, 29.8],
    [-18, -22, -18, -29.8], [18, -22, 18, -29.8], [-7, -22, -7, -29.8], [7, -22, 7, -29.8],
    [-22, -16, -30, -16], [-22, -4, -30, -4], [-22, 8, -30, 8], [-22, 20, -30, 20],
    [22, -20, 29.8, -20], [22, 20, 29.8, 20],
    [30, -10, 30, 10], [36, -11.5, 36, 11.5], [42, -11.5, 42, 11.5],
  ];
  for (const [ax, az, bx, bz] of across) lines.push([new THREE.Vector3(ax, 4.8, az), new THREE.Vector3(bx, 5.6, bz)]);
  const geo = new THREE.PlaneGeometry(0.36, 0.46);
  geo.translate(0, -0.23, 0);
  const perColor: THREE.Matrix4[][] = PAPEL_COLORS.map(() => []);
  const cordPts: number[] = [];
  let ci = 0;
  for (const [a, b] of lines) {
    const len = a.distanceTo(b);
    const n = Math.floor(len / 0.5);
    const pts = sagPoints(a, b, 0.5 + len * 0.02, n);
    const dir = b.clone().sub(a).setY(0).normalize();
    const rotY = Math.atan2(-dir.z, dir.x);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      perColor[ci % PAPEL_COLORS.length].push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
      ci++;
    }
    for (let i = 0; i < pts.length - 1; i++) cordPts.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  }
  const cordGeo = new THREE.BufferGeometry();
  cordGeo.setAttribute('position', new THREE.Float32BufferAttribute(cordPts, 3));
  const cords = new THREE.LineSegments(cordGeo, new THREE.LineBasicMaterial({ color: 0x2a2620 }));
  w.scene.add(cords);
  PAPEL_COLORS.forEach((col, idx) => {
    const tex = papelPicado(col, syms[idx % syms.length], 0, idx + 3);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: new THREE.Color(col), emissiveIntensity: 0.05 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = w.mats.uniforms.uTime;
      sh.uniforms.uWind = w.mats.uniforms.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         float ph = ip.x * 1.3 + ip.z * 0.7;
         float sw = (sin(uTime * 2.3 + ph) * 0.6 + sin(uTime * 5.7 + ph * 2.1) * 0.25) * uWind;
         float d = -position.y; // 0 at top edge
         transformed.z += sin(sw) * d * 1.2;
         transformed.y += (1.0 - cos(sw)) * d * 0.5;`,
      );
    };
    const mats = perColor[idx];
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    w.scene.add(im);
    out.push({ mesh: im, count: mats.length, torn: new Float32Array(mats.length).map(() => r()), base: mats });
  });
  (out as any).cords = cords;
  return out;
}

/** 5 special banners carrying the organillo clue (visible after midnight) */
export const CLUE_ORDER: Symbol[] = ['luna', 'campana', 'gallo', 'sol', 'corazon'];
function buildClueBanners(w: World): THREE.Group {
  const g = new THREE.Group();
  g.visible = false;
  // positions scattered around the plaza, each hanging where it can be noticed
  const spots: [number, number, number, number][] = [
    [-9.6, 4.8, 9.6, 0.7], // near SW garden lamps
    [16, 5.0, -24.5, 0.1], // across north street near atrium
    [26, 5.2, 14, 1.57], // east ring near stalls
    [-26, 5.2, -10, 1.57], // west, in front of portales
    [9.6, 4.6, -9.6, 2.3], // NE garden
  ];
  const colors = ['#e8e2d8', '#2f7fd0', '#f28c28', '#f2cf3a', '#e0357a'];
  // shuffle positions per symbol (fixed mapping, positions distinct)
  CLUE_ORDER.forEach((s, i) => {
    const [x, y, z, rot] = spots[i];
    const tex = papelPicado(colors[i], s, i + 1, 40 + i);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, emissive: new THREE.Color(colors[i]), emissiveIntensity: 0.18 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), mat);
    mesh.geometry.translate(0, -0.62, 0);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.userData.symbol = s;
    g.add(mesh);
    // cord
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), w.mats.iron);
    cord.rotation.z = Math.PI / 2;
    cord.rotation.y = rot;
    cord.position.set(x, y + 0.02, z);
    g.add(cord);
  });
  w.updaters.push((dt, t) => {
    if (!g.visible) return;
    g.children.forEach((c, i) => {
      if ((c as THREE.Mesh).geometry.type === 'PlaneGeometry') c.rotation.x = Math.sin(t * 1.7 + i) * 0.18 * w.mats.uniforms.uWind.value;
    });
  });
  w.scene.add(g);
  return g;
}

function buildStringLights(w: World, r: () => number): THREE.InstancedMesh[] {
  const lines: [THREE.Vector3, THREE.Vector3][] = [];
  // plazuela del escenario + ring street
  for (let i = 0; i < 5; i++) lines.push([new THREE.Vector3(30.5, 6.2, -11 + i * 5.5), new THREE.Vector3(49.5, 7.2, -11 + i * 5.5)]);
  lines.push([new THREE.Vector3(-22, 5.5, 22), new THREE.Vector3(22, 5.5, 22)]);
  lines.push([new THREE.Vector3(-22, 5.5, -22), new THREE.Vector3(22, 5.5, -22)]);
  lines.push([new THREE.Vector3(-22, 5.5, -22), new THREE.Vector3(-22, 5.5, 22)]);
  lines.push([new THREE.Vector3(22, 5.5, -22), new THREE.Vector3(22, 5.5, 22)]);
  const geo = new THREE.SphereGeometry(0.07, 6, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const mats: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const palette = [0xffd080, 0xff6a6a, 0x7ad0ff, 0x9aff8a, 0xffe36a];
  for (const [a, b] of lines) {
    const n = Math.floor(a.distanceTo(b) / 0.8);
    const pts = sagPoints(a, b, 0.7, n);
    pts.forEach((p, i) => {
      mats.push(new THREE.Matrix4().makeTranslation(p.x, p.y - 0.08, p.z));
      colors.push(new THREE.Color(palette[i % palette.length]).multiplyScalar(1.6));
    });
  }
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => {
    im.setMatrixAt(i, mm);
    im.setColorAt(i, colors[i]);
  });
  (im as any).baseColors = colors;
  im.computeBoundingSphere();
  w.scene.add(im);
  const cordPts: number[] = [];
  for (const [a, b] of lines) {
    const pts = sagPoints(a, b, 0.7, 20);
    for (let i = 0; i < pts.length - 1; i++) cordPts.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cordPts, 3));
  w.scene.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  void r;
  return [im];
}

function stall(w: World, x: number, z: number, rotY: number, kind: string, colors: string[]): THREE.Vector3 {
  const m = w.mats;
  const W = 3.0, D = 2.0, H = 2.4;
  const f = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  const rgt = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
  const at = (u: number, v: number, n: number) => new THREE.Vector3(x + rgt.x * u + f.x * n, v, z + rgt.z * u + f.z * n);
  for (const u of [-W / 2, W / 2])
    for (const n of [-D / 2, D / 2]) {
      const p = at(u, 0, n);
      w.geo(new THREE.CylinderGeometry(0.025, 0.025, H + (n < 0 ? 0.3 : 0), 5), m.iron, { x: p.x, y: (H + (n < 0 ? 0.3 : 0)) / 2, z: p.z }, 0, 'plaza', false);
    }
  // tarp roof (sloped)
  const tarp = new THREE.PlaneGeometry(W + 0.4, D + 0.5, 6, 3);
  const pos = tarp.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    pos.setZ(i, -Math.cos((px / (W + 0.4)) * Math.PI) * 0.05 - Math.sin(((py + (D + 0.5) / 2) / (D + 0.5)) * Math.PI) * 0.12);
  }
  tarp.computeVertexNormals();
  const tp = at(0, H + 0.15, 0);
  w.geo(tarp, m.lona(colors.concat(colors).concat(colors)), tp, rotY, 'plaza', true, undefined, new THREE.Euler(-Math.PI / 2 + 0.15, rotY, 0, 'YXZ'));
  // counter
  const cp = at(0, 0, D / 2 - 0.35);
  w.geo(uvBox(W - 0.1, 0.9, 0.6), m.wood, { x: cp.x, y: 0.45, z: cp.z }, rotY);
  w.geo(uvBox(W, 0.05, 0.7), m.woodDark, { x: cp.x, y: 0.92, z: cp.z }, rotY);
  const cc = Math.abs(Math.cos(rotY)), ss = Math.abs(Math.sin(rotY));
  w.solid(cp.x, 0, cp.z, W * cc + 0.6 * ss, 1.0, W * ss + 0.6 * cc, { opaque: false });
  // bare bulb
  const bp = at(0, H - 0.1, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.lampOn);
  bulb.position.copy(bp);
  w.group('bulbs').add(bulb);
  w.lamp('stall_' + kind, bp, { color: 0xffd9a0, intensity: 4, distance: 8, bulb, poolY: 0.01, poolSize: 5, group: 'stalls' });
  // goods
  const top = at(0, 0.95, D / 2 - 0.35);
  const signTxt: Record<string, string> = {
    tamales: 'TAMALES · ATOLE',
    elotes: 'ELOTES Y ESQUITES',
    loteria: '¡LOTERÍA!',
    juguetes: 'JUGUETES · PIÑATAS',
    flores: 'FLORES LA CANDELARIA',
    bunuelos: 'BUÑUELOS · PONCHE',
  };
  // sign board hanging at front
  const sp = at(0, H - 0.25, D / 2 + 0.22);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, 0.42), new THREE.MeshStandardMaterial({ map: signTex(signTxt[kind] ?? kind.toUpperCase(), colors[0]), roughness: 0.8 }));
  sm.position.copy(sp);
  sm.rotation.y = rotY;
  w.group('signs').add(sm);
  if (kind === 'tamales' || kind === 'elotes' || kind === 'bunuelos') {
    // olla tamalera (aluminium steamer) + thermos
    w.geo(new THREE.CylinderGeometry(0.32, 0.3, 0.6, 16), m.flat(0x9a9a9a, { metal: 0.9, rough: 0.35, key: 'alu' }), { x: top.x - rgt.x * 0.6, y: 0.95 + 0.3, z: top.z - rgt.z * 0.6 });
    w.geo(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 16), m.flat(0x8a8a8a, { metal: 0.9, rough: 0.3, key: 'alu2' }), { x: top.x - rgt.x * 0.6, y: 1.58, z: top.z - rgt.z * 0.6 });
    w.geo(new THREE.CylinderGeometry(0.16, 0.16, 0.45, 12), m.flat(0xb03a2a, { rough: 0.5, key: 'thermos' }), { x: top.x + rgt.x * 0.4, y: 1.18, z: top.z + rgt.z * 0.4 });
    // clay cups
    for (let i = 0; i < 5; i++) w.geo(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 8), m.terracotta, { x: top.x + rgt.x * (0.8 + (i % 3) * 0.12), y: 1.0, z: top.z + rgt.z * (0.8 + (i % 3) * 0.12) + f.z * (i > 2 ? 0.12 : 0) });
  }
  if (kind === 'loteria') {
    const boardTex = loteriaBoardTex();
    for (let i = 0; i < 4; i++) {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 }));
      const bpp = at(-1 + i * 0.66, 0.97, D / 2 - 0.35);
      bm.position.copy(bpp);
      bm.rotation.set(-Math.PI / 2, 0, rotY, 'YXZ');
      bm.rotation.order = 'YXZ';
      bm.rotation.y = rotY;
      bm.rotation.x = -Math.PI / 2;
      w.group('signs').add(bm);
    }
  }
  if (kind === 'juguetes') {
    // piñatas hanging
    for (let i = 0; i < 3; i++) {
      const pp = at(-1 + i, H - 0.55, 0.3);
      pinata(w, pp, ['#e0357a', '#f2cf3a', '#3fae5a'][i]);
    }
  }
  if (kind === 'flores') {
    for (let i = 0; i < 5; i++) {
      const bp2 = at(-1.2 + i * 0.6, 0, D / 2 + 0.3);
      w.geo(new THREE.CylinderGeometry(0.18, 0.15, 0.4, 10), m.flat(0x3a5f8a, { metal: 0.3, rough: 0.5, key: 'bucket' }), { x: bp2.x, y: 0.2, z: bp2.z });
      for (let k = 0; k < 7; k++) {
        const fp = new THREE.Vector3(bp2.x + (Math.random() - 0.5) * 0.25, 0.55 + Math.random() * 0.25, bp2.z + (Math.random() - 0.5) * 0.25);
        w.geo(new THREE.SphereGeometry(0.06, 6, 5), m.flat(['#f4f0e8', '#d8325a', '#f0b020', '#c43a8a'][i % 4], { rough: 0.8 }), fp);
      }
    }
  }
  return at(0, 0, D / 2 + 0.8);
}

function signTex(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2e6d0';
  g.fillRect(0, 0, 512, 72);
  g.fillStyle = color;
  g.font = '44px "Alfa Slab One", Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loteriaBoardTex() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 352;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8dcc0';
  g.fillRect(0, 0, 256, 352);
  const syms: Symbol[] = ['sol', 'luna', 'gallo', 'campana', 'corazon', 'estrella', 'flor', 'paloma', 'sol', 'calavera', 'corazon', 'luna', 'gallo', 'estrella', 'campana', 'flor'];
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 62 + 6, y = Math.floor(i / 4) * 86 + 6;
    g.fillStyle = '#f6efdc';
    g.fillRect(x, y, 58, 82);
    g.strokeStyle = '#2a2018';
    g.strokeRect(x, y, 58, 82);
    g.fillStyle = ['#9c2a2a', '#2a4a9c', '#2a7a3a', '#9c7a2a'][i % 4];
    const cx = x + 29, cy = y + 38;
    g.save();
    g.beginPath();
    const draw = (window as any).__drawSymbol;
    if (draw) draw(g, syms[i], cx, cy, 20);
    g.fill('evenodd');
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function pinata(w: World, p: THREE.Vector3, color: string) {
  const m = w.mats;
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m.flat(color, { rough: 0.9 }));
  g.add(core);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0]];
  dirs.forEach((d, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 8), m.flat(['#f2cf3a', '#e0357a', '#2f7fd0', '#3fae5a', '#f28c28'][i % 5], { rough: 0.9 }));
    const v = new THREE.Vector3(...(d as [number, number, number])).normalize();
    cone.position.copy(v.clone().multiplyScalar(0.3));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
    g.add(cone);
  });
  g.position.copy(p);
  w.group('props').add(g);
  const phase = Math.random() * 10;
  w.updaters.push((dt, t) => {
    g.rotation.y = Math.sin(t * 0.6 + phase) * 0.4;
    g.rotation.z = Math.sin(t * 1.3 + phase) * 0.06 * w.mats.uniforms.uWind.value;
  });
  return g;
}
