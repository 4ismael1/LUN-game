import * as THREE from 'three';
import { World } from './world';

/**
 * Small ambient life that makes the square feel inhabited (three draw calls in total):
 *  - moths circling the lit lamps nearest to the camera
 *  - leaves and scraps of papel picado skittering along the ground in the wind
 *  - dust motes that only show inside the flashlight beam
 */
export class AmbientLife {
  private moths: THREE.Points;
  private mothPos: Float32Array;
  private mothSeed: Float32Array;
  private leaves: THREE.InstancedMesh;
  private leafState: { p: THREE.Vector3; v: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; life: number }[] = [];
  private dust: THREE.Points;
  private dustPos: Float32Array;
  private dustMat: THREE.PointsMaterial;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  /** 0..1 how much life is left (fewer moths and leaves as the night turns) */
  density = 1;

  constructor(private w: World) {
    // moths
    const MN = 48;
    this.mothPos = new Float32Array(MN * 3);
    this.mothSeed = new Float32Array(MN * 4);
    for (let i = 0; i < MN; i++) {
      this.mothSeed[i * 4] = Math.random() * 100;
      this.mothSeed[i * 4 + 1] = 0.35 + Math.random() * 0.6; // orbit radius
      this.mothSeed[i * 4 + 2] = 1.5 + Math.random() * 3; // speed
      this.mothSeed[i * 4 + 3] = Math.random(); // lamp slot
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.mothPos, 3));
    this.moths = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
    this.moths.frustumCulled = false;
    w.scene.add(this.moths);

    // leaves & paper scraps
    const LN = 36;
    const lg = new THREE.PlaneGeometry(0.09, 0.06);
    const lm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: false });
    this.leaves = new THREE.InstancedMesh(lg, lm, LN);
    this.leaves.frustumCulled = false;
    const cols = [0x6a5a2a, 0x7a6030, 0x4a4a22, 0xc2386e, 0xe3a13d, 0x3f9e62, 0x2f6fb8, 0x8a6a3a];
    for (let i = 0; i < LN; i++) {
      this.leaves.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      this.leafState.push({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 });
    }
    w.scene.add(this.leaves);

    // dust in the beam
    const DN = 160;
    this.dustPos = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 3;
      this.dustPos[i * 3 + 1] = (Math.random() - 0.5) * 2;
      this.dustPos[i * 3 + 2] = -0.6 - Math.random() * 4;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.012, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
  }

  /** the dust follows the camera (added as a child so it stays in view) */
  attach(camera: THREE.Camera) {
    camera.add(this.dust);
  }

  update(dt: number, t: number, cam: THREE.Vector3, flashlight: number, wind: number, indoor: boolean) {
    // ---- moths: pick the lit lamps nearest the camera
    const lamps = this.w.lights.lamps
      .filter((l) => ((l as any)._eff ?? 0) > 0.4 && l.pos.distanceToSquared(cam) < 30 * 30 && l.pos.y > 1.5)
      .sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam))
      .slice(0, 6);
    const MN = this.mothPos.length / 3;
    const active = Math.floor(MN * this.density);
    for (let i = 0; i < MN; i++) {
      const L = lamps.length && i < active ? lamps[Math.floor(this.mothSeed[i * 4 + 3] * lamps.length)] : null;
      if (!L) {
        this.mothPos[i * 3 + 1] = -50;
        continue;
      }
      const sd = this.mothSeed[i * 4], r = this.mothSeed[i * 4 + 1], sp = this.mothSeed[i * 4 + 2];
      const a = t * sp + sd;
      // erratic loops: two orbits and a jitter
      this.mothPos[i * 3] = L.pos.x + Math.cos(a) * r + Math.sin(a * 2.7 + sd) * 0.12;
      this.mothPos[i * 3 + 1] = L.pos.y - 0.05 + Math.sin(a * 1.9 + sd) * 0.25 + Math.sin(t * 23 + sd) * 0.02;
      this.mothPos[i * 3 + 2] = L.pos.z + Math.sin(a) * r + Math.cos(a * 3.1 + sd) * 0.12;
    }
    (this.moths.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // ---- leaves: respawn around the player upwind, tumble downwind along the ground
    const windDir = new THREE.Vector3(Math.cos(t * 0.05) * 0.8 + 0.4, 0, Math.sin(t * 0.07) * 0.6 + 0.5).normalize();
    const LN = this.leafState.length;
    for (let i = 0; i < LN; i++) {
      const L = this.leafState[i];
      L.life -= dt;
      const tooFar = L.p.distanceToSquared(cam) > 22 * 22;
      if ((L.life <= 0 || tooFar) && !indoor && i < LN * this.density) {
        const ang = Math.random() * Math.PI * 2, dist = 4 + Math.random() * 12;
        L.p.set(cam.x + Math.cos(ang) * dist - windDir.x * 6, 0.02, cam.z + Math.sin(ang) * dist - windDir.z * 6);
        const gy = this.w.col.groundAt(L.p.x, L.p.z, 0, 3, 0.1);
        L.p.y = gy + 0.02;
        L.life = 6 + Math.random() * 8;
        L.v.set(0, 0, 0);
        L.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        L.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      }
      // gusts lift them a little, then they settle
      const gust = Math.max(0, Math.sin(t * 0.9 + i * 1.7)) * wind;
      L.v.x += (windDir.x * 1.4 * gust - L.v.x) * Math.min(1, dt * 2);
      L.v.z += (windDir.z * 1.4 * gust - L.v.z) * Math.min(1, dt * 2);
      const lift = gust > 0.6 ? Math.sin(t * 5 + i) * 0.15 : 0;
      L.p.addScaledVector(L.v, dt);
      const gy = this.w.col.groundAt(L.p.x, L.p.z, 0, L.p.y + 0.5, 0.05);
      L.p.y += (gy + 0.015 + Math.max(0, lift) - L.p.y) * Math.min(1, dt * 6);
      const moving = L.v.lengthSq() > 0.02;
      if (moving) {
        L.rot.x += L.spin.x * dt * gust;
        L.rot.y += L.spin.y * dt * gust;
        L.rot.z += L.spin.z * dt * gust;
      } else {
        L.rot.x += (-Math.PI / 2 - L.rot.x) * Math.min(1, dt * 3); // lie flat when still
      }
      this.q.setFromEuler(L.rot);
      this.m4.compose(L.p, this.q, this.s);
      this.leaves.setMatrixAt(i, this.m4);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = false;

    // ---- dust: slow drift, only visible in the beam
    this.dustMat.opacity += (flashlight * 0.55 - this.dustMat.opacity) * Math.min(1, dt * 4);
    this.dust.visible = this.dustMat.opacity > 0.01;
    if (this.dust.visible) {
      const DN = this.dustPos.length / 3;
      for (let i = 0; i < DN; i++) {
        this.dustPos[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.03;
        this.dustPos[i * 3 + 1] += (Math.cos(t * 0.23 + i * 1.3) * 0.02 - 0.01) * dt;
        if (this.dustPos[i * 3 + 1] < -1) this.dustPos[i * 3 + 1] = 1;
      }
      (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
