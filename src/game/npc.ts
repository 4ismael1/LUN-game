import * as THREE from 'three';
import { World } from '../world/world';
import { Collider } from '../world/colliders';

export interface NPCDef {
  id: string;
  name: string;
  model: string;
  height: number;
  pos: THREE.Vector3;
  yaw: number;
  anim: string;
  voice: string;
  path?: THREE.Vector3[];
  speed?: number;
  tint?: number;
  lines?: string[][];
  prop?: string;
  oneWay?: boolean;
  noWait?: boolean;
  outfit?: Record<string, number>;
}

export class NPC {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer | null = null;
  actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;
  pos: THREE.Vector3;
  yaw: number;
  pathIdx = 0;
  talkIdx = 0;
  talking = false;
  waitTime = 0;
  collider: Collider;
  visible = true;
  baseAnim: string;
  lookAtPlayer = 0;
  busy = false;
  // procedural life: head that follows you, breathing, glances, nods
  private headBone: THREE.Bone | null = null;
  private neckBone: THREE.Bone | null = null;
  private torsoBone: THREE.Bone | null = null;
  private lookW = 0;
  private phase = Math.random() * 10;
  private greeted = false;

  constructor(public def: NPCDef, private w: World) {
    this.pos = def.pos.clone();
    this.yaw = def.yaw;
    this.baseAnim = def.anim;
    const o = w.assets.instance(def.model, { height: def.height, skinned: true });
    this.obj = o ?? new THREE.Group();
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.yaw;
    // per-character outfit: recolor materials by name (Shirt, Pants, Dress, Hair, Skin…)
    this.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      const col = def.outfit?.[mat.name];
      if (col !== undefined) mat.color.set(col);
      else if (def.tint !== undefined && !/skin|eye|hair/i.test(mat.name)) mat.color.multiply(new THREE.Color(def.tint));
      mat.roughness = 0.85;
      m.material = mat;
    });
    this.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    w.scene.add(this.obj);
    const gltf = w.assets.models.get(def.model);
    if (gltf && gltf.animations.length && o) {
      const inner = o.children[0];
      this.mixer = new THREE.AnimationMixer(inner);
      for (const clip of gltf.animations) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
    }
    this.play(def.anim, 0);
    // desync idles so NPCs don't move in lockstep
    if (this.current) this.current.time = Math.random() * this.current.getClip().duration;
    this.obj.traverse((b) => {
      if (!(b as THREE.Bone).isBone) return;
      if (b.name === 'Head') this.headBone = b as THREE.Bone;
      else if (b.name === 'Neck') this.neckBone = b as THREE.Bone;
      else if (b.name === 'Torso') this.torsoBone = b as THREE.Bone;
    });
    this.collider = w.col.add(new THREE.Vector3(), new THREE.Vector3(), { dynamic: true, opaque: false, tag: 'npc' });
    this.updateCollider();
  }

  findAction(name: string): THREE.AnimationAction | null {
    const n = name.toLowerCase();
    if (this.actions.has(n)) return this.actions.get(n)!;
    for (const [k, a] of this.actions) if (k.includes(n)) return a;
    if (n !== 'idle') return this.findAction('idle');
    return this.actions.values().next().value ?? null;
  }

  play(name: string, fade = 0.35) {
    const a = this.findAction(name);
    if (!a || a === this.current) return;
    a.reset().fadeIn(fade).play();
    if (/death/i.test(name)) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  updateCollider() {
    const r = 0.3;
    this.collider.min.set(this.pos.x - r, this.pos.y, this.pos.z - r);
    this.collider.max.set(this.pos.x + r, this.pos.y + 1.7, this.pos.z + r);
    this.collider.enabled = this.visible;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.obj.visible = v;
    this.updateCollider();
  }

  update(dt: number, playerPos: THREE.Vector3) {
    if (!this.visible) return;
    this.mixer?.update(dt);
    const path = this.def.path;
    let moving = false;
    if (path && path.length && !this.talking && !this.busy) {
      if (this.waitTime > 0) {
        this.waitTime -= dt;
        this.play('idle');
      } else {
        const target = path[this.pathIdx % path.length];
        const to = target.clone().sub(this.pos).setY(0);
        const d = to.length();
        if (d < 0.3) {
          this.pathIdx++;
          this.waitTime = this.def.noWait ? 0 : 2 + Math.random() * 4;
          if (this.def.oneWay && this.pathIdx >= path.length) {
            this.setVisible(false);
            return;
          }
        } else {
          moving = true;
          to.normalize();
          const sp = this.def.speed ?? 1.1;
          this.pos.addScaledVector(to, Math.min(d, sp * dt));
          const ty = Math.atan2(to.x, to.z);
          let dy = ty - this.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          this.yaw += dy * Math.min(1, dt * 4);
          this.play(sp > 2 ? 'run' : 'walk');
          // match the step cycle to the actual speed so feet don't slide
          if (this.current) this.current.timeScale = THREE.MathUtils.clamp(sp / (sp > 2 ? 3.2 : 1.25), 0.55, 1.4);
          // avoid walking into the player
          if (this.pos.distanceTo(playerPos) < 0.9) this.pos.addScaledVector(to, -Math.min(d, sp * dt));
        }
      }
    }
    // never "walk in place": idle whenever we are not actually moving
    if (!moving && this.current && /walk|run/i.test(this.current.getClip().name)) this.play(/walk|run/i.test(this.baseAnim) ? 'idle' : this.baseAnim);
    if (this.talking || this.lookAtPlayer > 0) {
      this.lookAtPlayer = Math.max(0, this.lookAtPlayer - dt);
      const ty = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      let dy = ty - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      if (this.baseAnim !== 'sitting') this.yaw += dy * Math.min(1, dt * 3);
    }
    // stay glued to the floor (sidewalks, garden, shop floors…)
    const gy = this.w.col.groundAt(this.pos.x, this.pos.z, 0.15, this.pos.y + 0.3, 0.45);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    // tiny idle body sway so they don't look frozen
    const sway = this.current && /idle/i.test(this.current.getClip().name) ? Math.sin(performance.now() * 0.0006 + this.pos.x) * 0.05 : 0;
    this.obj.position.copy(this.pos);
    this.obj.rotation.y = this.yaw + sway;
    this.updateCollider();
    this.proceduralLife(dt, playerPos, moving);
  }

  private static _v = new THREE.Vector3();
  private static _id = new THREE.Quaternion();
  private static _up = new THREE.Vector3(0, 1, 0);
  /** per bone: the pose before our tweak and the pose after it (to detect frames the mixer didn't touch) */
  private saved = new Map<THREE.Bone, { pre: THREE.Quaternion; post: THREE.Quaternion }>();
  private smoothYaw = 0;
  private smoothPitch = 0;

  /** undo last frame's tweak on bones the current clip doesn't animate, so nothing accumulates */
  private restore(bone: THREE.Bone | null) {
    if (!bone) return;
    const s = this.saved.get(bone);
    if (s && bone.quaternion.equals(s.post)) bone.quaternion.copy(s.pre);
  }
  private remember(bone: THREE.Bone, pre: THREE.Quaternion) {
    let s = this.saved.get(bone);
    if (!s) this.saved.set(bone, (s = { pre: new THREE.Quaternion(), post: new THREE.Quaternion() }));
    s.pre.copy(pre);
    s.post.copy(bone.quaternion);
  }

  /**
   * Makes the block people feel alive without new animations: a slow breath, and the head
   * turning (gently, within a natural range) towards you when you're close or talking.
   */
  private proceduralLife(dt: number, playerPos: THREE.Vector3, moving: boolean) {
    const head = this.headBone;
    if (!head || this.obj.visible === false) return;
    this.restore(this.torsoBone);
    this.restore(this.neckBone);
    this.restore(head);
    const t = performance.now() / 1000 + this.phase;
    // breathing: a slow chest rise
    if (this.torsoBone) {
      const pre = this.torsoBone.quaternion.clone();
      this.torsoBone.rotateX(Math.sin(t * 1.7) * 0.012);
      this.remember(this.torsoBone, pre);
    }
    const toP = NPC._v.set(playerPos.x - this.pos.x, 0, playerPos.z - this.pos.z);
    const dist = toP.length();
    let rel = Math.atan2(toP.x, toP.z) - this.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const interested = this.talking || (dist < 5 && Math.abs(rel) < 1.4 && !moving);
    this.lookW += ((interested ? 1 : 0) - this.lookW) * Math.min(1, dt * 2.5);
    const wantYaw = THREE.MathUtils.clamp(rel, -0.9, 0.9) * this.lookW;
    const dy = playerPos.y + 1.6 - (this.pos.y + 1.5);
    const wantPitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.max(0.8, dist)), -0.25, 0.25) * this.lookW + (this.talking ? Math.sin(t * 5.5) * 0.03 : 0);
    // critically damped: no snapping, no jitter
    this.smoothYaw += (wantYaw - this.smoothYaw) * Math.min(1, dt * 5);
    this.smoothPitch += (wantPitch - this.smoothPitch) * Math.min(1, dt * 5);
    if (Math.abs(this.smoothYaw) < 0.002 && Math.abs(this.smoothPitch) < 0.002) return;
    this.obj.updateMatrixWorld(true);
    // turn = yaw around world up, pitch around the body's right axis
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const delta = new THREE.Quaternion().setFromAxisAngle(NPC._up, this.smoothYaw).multiply(new THREE.Quaternion().setFromAxisAngle(right, this.smoothPitch));
    const aim = (bone: THREE.Bone | null, amount: number) => {
      if (!bone || !bone.parent) return;
      const pre = bone.quaternion.clone();
      const wq = bone.getWorldQuaternion(new THREE.Quaternion());
      const target = NPC._id.clone().slerp(delta, amount).multiply(wq);
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      bone.quaternion.copy(pq.multiply(target));
      bone.updateMatrixWorld(true);
      this.remember(bone, pre);
    };
    aim(this.neckBone, 0.35);
    aim(head, 0.65);
  }

  /** a small greeting when a conversation starts (wave if the rig has it) */
  greet() {
    if (this.greeted) return;
    this.greeted = true;
    if (this.actions.has('wave')) {
      const prev = this.baseAnim;
      this.play('wave', 0.25);
      setTimeout(() => {
        if (this.current === this.actions.get('wave')) this.play(prev, 0.4);
      }, 1600);
    }
  }
}
