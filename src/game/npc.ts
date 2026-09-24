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
  }
}
