import * as THREE from 'three';

export type Flicker = 'none' | 'candle' | 'faulty' | 'neon' | 'dying';

export interface LampSource {
  id: string;
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  on: boolean;
  flicker: Flicker;
  group?: string;
  /** meshes to toggle emissive */
  emissives: THREE.Mesh[];
  pools: THREE.Object3D[];
  /** current brightness factor 0..1 (for fades / flicker) */
  level: number;
  targetLevel: number;
  phase: number;
  priority: number;
  zone?: string;
}

/**
 * Many lamp sources, few real lights: each frame the pool of PointLights is
 * assigned to the most relevant lamps near the camera.
 */
export class LightManager {
  lamps: LampSource[] = [];
  pool: THREE.PointLight[] = [];
  private assign: (LampSource | null)[] = [];
  onMat: THREE.MeshStandardMaterial;
  offMat: THREE.MeshStandardMaterial;
  globalLevel = 1; // blackout control
  groupLevels = new Map<string, number>();

  constructor(private scene: THREE.Scene, poolSize: number, onMat: THREE.MeshStandardMaterial, offMat: THREE.MeshStandardMaterial) {
    this.onMat = onMat;
    this.offMat = offMat;
    for (let i = 0; i < poolSize; i++) {
      const l = new THREE.PointLight(0xffc080, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.pool.push(l);
      this.assign.push(null);
    }
  }

  add(id: string, pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, distance: number, opts: { flicker?: Flicker; group?: string; emissives?: THREE.Mesh[]; pools?: THREE.Object3D[]; on?: boolean; priority?: number; zone?: string } = {}): LampSource {
    const l: LampSource = {
      id,
      pos: pos.clone(),
      color: new THREE.Color(color),
      intensity,
      distance,
      on: opts.on ?? true,
      flicker: opts.flicker ?? 'none',
      group: opts.group,
      emissives: opts.emissives ?? [],
      pools: opts.pools ?? [],
      level: opts.on === false ? 0 : 1,
      targetLevel: opts.on === false ? 0 : 1,
      phase: Math.random() * 100,
      priority: opts.priority ?? 1,
      zone: opts.zone,
    };
    this.lamps.push(l);
    return l;
  }

  get(id: string) {
    return this.lamps.find((l) => l.id === id);
  }

  setOn(l: LampSource, on: boolean) {
    l.on = on;
    l.targetLevel = on ? 1 : 0;
  }

  setGroup(group: string, on: boolean, flicker?: Flicker) {
    for (const l of this.lamps)
      if (l.group === group) {
        this.setOn(l, on);
        if (flicker) l.flicker = flicker;
      }
  }

  setGroupLevel(group: string, level: number) {
    this.groupLevels.set(group, level);
  }

  private tmp = new THREE.Vector3();

  update(dt: number, time: number, cam: THREE.Camera) {
    cam.getWorldPosition(this.tmp);
    const cp = this.tmp;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    for (const l of this.lamps) {
      l.level += (l.targetLevel - l.level) * Math.min(1, dt * 6);
      let f = 1;
      const t = time + l.phase;
      switch (l.flicker) {
        case 'candle':
          f = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 27.3 + 1.3) * Math.sin(t * 5.1);
          break;
        case 'faulty': {
          const n = Math.sin(t * 3.1) * Math.sin(t * 7.7) * Math.sin(t * 0.9);
          f = n > 0.55 ? 0.05 : n > 0.4 ? 0.5 : 1;
          break;
        }
        case 'neon':
          f = 0.95 + 0.05 * Math.sin(t * 120);
          break;
        case 'dying':
          f = Math.sin(t * 1.3) > 0.7 ? (Math.random() < 0.5 ? 0.1 : 0.7) : 0.55;
          break;
      }
      const gl = l.group ? this.groupLevels.get(l.group) ?? 1 : 1;
      const eff = l.level * f * this.globalLevel * gl;
      (l as any)._eff = eff;
      const lit = eff > 0.25;
      for (const m of l.emissives) {
        const want = lit ? this.onMat : this.offMat;
        if (m.material !== want && !(m.userData.customLamp)) m.material = want;
        if (m.userData.customLamp) {
          const mm = m.material as THREE.MeshStandardMaterial;
          mm.emissiveIntensity = (m.userData.baseEmissive ?? 2) * eff;
        }
      }
      const far = l.pos.distanceToSquared(cp) > 55 * 55;
      for (const p of l.pools) {
        p.visible = eff > 0.05 && !far;
        const mat = (p as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat && mat.opacity !== undefined) mat.opacity = Math.min(1, eff) * (p.userData.baseOpacity ?? 0.5);
      }
      const d = l.pos.distanceTo(cp);
      const toL = this.tmp2.copy(l.pos).sub(cp).normalize();
      const facing = toL.dot(fwd);
      (l as any)._score = eff <= 0.02 ? Infinity : d * (facing > -0.2 ? 1 : 1.6) / l.priority;
    }
    // choose best lamps
    const sorted = this.lamps.filter((l) => (l as any)._score < 60).sort((a, b) => (a as any)._score - (b as any)._score);
    const chosen = sorted.slice(0, this.pool.length);
    // keep previously assigned lights stable
    const newAssign: (LampSource | null)[] = new Array(this.pool.length).fill(null);
    const remaining = new Set(chosen);
    for (let i = 0; i < this.pool.length; i++) {
      const a = this.assign[i];
      if (a && remaining.has(a)) {
        newAssign[i] = a;
        remaining.delete(a);
      }
    }
    const rest = [...remaining];
    for (let i = 0; i < this.pool.length; i++) if (!newAssign[i]) newAssign[i] = rest.shift() ?? null;
    for (let i = 0; i < this.pool.length; i++) {
      const L = this.pool[i];
      const a = newAssign[i];
      if (a !== this.assign[i]) {
        // fade in new assignment to avoid pops
        L.userData.fade = 0;
      }
      this.assign[i] = a;
      if (!a) {
        L.intensity = 0;
        continue;
      }
      L.userData.fade = Math.min(1, (L.userData.fade ?? 1) + dt * 3);
      L.position.copy(a.pos);
      L.color.copy(a.color);
      L.distance = a.distance;
      // soften far lights so the pool edge is invisible
      const d = a.pos.distanceTo(cp);
      const farFade = 1 - THREE.MathUtils.smoothstep(d, 38, 58);
      L.intensity = a.intensity * (a as any)._eff * L.userData.fade * farFade;
    }
  }
  private tmp2 = new THREE.Vector3();
}
