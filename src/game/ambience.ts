import * as THREE from 'three';
import { AudioEngine, SoundHandle } from '../audio/audio';

interface Loop {
  name: string;
  handle: SoundHandle | null;
  target: number;
  base: number;
  pos?: THREE.Vector3;
  indoorMuffle: boolean;
  ref?: number;
}

/** Continuous layered ambience + scheduled one-shots, driven by game state. */
export class Ambience {
  loops = new Map<string, Loop>();
  private timers = new Map<string, number>();
  indoor = false;
  enabled = false;
  profile: 'prologue' | 'night' | 'storm' | 'climax' | 'dawn' | 'silent' = 'prologue';
  randomPositions: () => THREE.Vector3 = () => new THREE.Vector3();
  listener = new THREE.Vector3();

  constructor(private a: AudioEngine) {}

  loop(name: string, file: string, opts: { pos?: THREE.Vector3; ref?: number; indoorMuffle?: boolean; base?: number } = {}) {
    this.loops.set(name, { name: file, handle: null, target: 0, base: opts.base ?? 1, pos: opts.pos, indoorMuffle: opts.indoorMuffle ?? true, ref: opts.ref });
  }

  set(name: string, v: number) {
    const l = this.loops.get(name);
    if (l) l.target = v;
  }

  stopAll() {
    for (const l of this.loops.values()) {
      l.handle?.stop(0.5);
      l.handle = null;
      l.target = 0;
    }
  }

  update(dt: number) {
    const now = this.a.ctx.currentTime;
    for (const l of this.loops.values()) {
      const want = l.target * l.base;
      if (want > 0.001 && !l.handle) {
        l.handle = this.a.play(l.name, { loop: true, bus: 'amb', volume: 0.0001, lowpass: 20000, ref: l.ref ?? 3, rolloff: 1.1, reverb: l.pos ? 0.2 : 0.05 }, l.pos);
      }
      if (l.handle) {
        const muffled = this.indoor && l.indoorMuffle;
        l.handle.setVolume(want * (muffled ? 0.35 : 1), 0.6);
        l.handle.filter?.frequency.setTargetAtTime(muffled ? 700 : 18000, now, 0.4);
        if (want <= 0.001 && (l.handle.gain.gain.value < 0.002)) {
          l.handle.stop(0.2);
          l.handle = null;
        }
      }
    }
    if (!this.enabled) return;
    this.oneShots(dt);
  }

  private every(key: string, min: number, max: number, dt: number, fn: () => void) {
    let t = this.timers.get(key);
    if (t === undefined) t = min + Math.random() * (max - min);
    t -= dt;
    if (t <= 0) {
      fn();
      t = min + Math.random() * (max - min);
    }
    this.timers.set(key, t);
  }

  private far(dist: number) {
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(this.listener.x + Math.cos(a) * dist, 2 + Math.random() * 4, this.listener.z + Math.sin(a) * dist);
  }

  private oneShots(dt: number) {
    const p = this.profile;
    if (p === 'silent') return;
    const inMul = this.indoor ? 0.4 : 1;
    const lp = this.indoor ? 900 : undefined;
    if (p === 'prologue') {
      this.every('car', 14, 30, dt, () => this.a.play(Math.random() < 0.7 ? 'car_pass' : 'bus_pass', { volume: 0.25 * inMul, lowpass: lp ?? 2500, ref: 10 }, this.far(45)));
      this.every('moto', 40, 80, dt, () => this.a.play('motorbike_far', { volume: 0.18 * inMul, lowpass: 2500, ref: 10 }, this.far(60)));
      this.every('horn', 50, 110, dt, () => this.a.play('car_horn_far', { volume: 0.12 * inMul, lowpass: 2000, ref: 10 }, this.far(70)));
      this.every('dogP', 25, 50, dt, () => this.a.play(Math.random() < 0.5 ? 'dog_bark_1' : 'dog_bark_2', { volume: 0.25 * inMul, lowpass: lp ?? 4000, ref: 8 }, this.far(40)));
      this.every('plates', 18, 35, dt, () => this.a.play('plates_clatter', { volume: 0.18 * inMul, ref: 4 }, new THREE.Vector3(-38, 1.5, 3)));
      this.every('owlP', 60, 120, dt, () => this.a.play('owl_hoot', { volume: 0.2 * inMul, ref: 8 }, this.far(35)));
    } else {
      const storm = p === 'storm' || p === 'climax';
      this.every('dog', storm ? 18 : 22, 45, dt, () => this.a.play(Math.random() < 0.3 ? 'dog_howl' : Math.random() < 0.5 ? 'dog_bark_1' : 'dog_bark_2', { volume: 0.3 * inMul, lowpass: lp ?? 3500, ref: 8 }, this.far(35 + Math.random() * 20)));
      this.every('owl', 45, 100, dt, () => this.a.play('owl_hoot', { volume: 0.22 * inMul, ref: 8 }, this.far(30)));
      this.every('creak', 12, 30, dt, () => this.a.play(Math.random() < 0.5 ? 'wood_creak_1' : Math.random() < 0.5 ? 'wood_creak_2' : 'metal_creak', { volume: 0.35 * inMul, ref: 3 }, this.far(8 + Math.random() * 10)));
      this.every('bellfar', 50, 110, dt, () => this.a.play('bell_church_far', { volume: 0.22, lowpass: 1800, ref: 20, rate: 0.9 + Math.random() * 0.1 }, new THREE.Vector3(-11, 22, -39)));
      this.every('whisper', 35, 80, dt, () => this.a.play('whisper_' + (1 + Math.floor(Math.random() * 3)), { volume: 0.28, ref: 2, rolloff: 1.5 }, this.far(3 + Math.random() * 3)));
      this.every('slam', 40, 90, dt, () => this.a.play(Math.random() < 0.5 ? 'door_slam' : 'slam_wood', { volume: 0.35 * inMul, ref: 5 }, this.far(18 + Math.random() * 12)));
      this.every('spark', 30, 70, dt, () => this.a.play('electric_spark', { volume: 0.25 * inMul, ref: 4 }, this.randomPositions()));
      if (storm) this.every('thunder', 22, 45, dt, () => this.onThunder?.());
    }
  }

  onThunder?: () => void;
}
