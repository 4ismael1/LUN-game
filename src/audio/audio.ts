import * as THREE from 'three';
import { settings, onSettings } from '../core/settings';

export interface SoundHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  filter?: BiquadFilterNode;
  stop(fade?: number): void;
  setVolume(v: number, t?: number): void;
  setPosition(p: THREE.Vector3): void;
  playing: boolean;
}

export interface PlayOpts {
  volume?: number;
  rate?: number;
  loop?: boolean;
  bus?: 'sfx' | 'amb' | 'music' | 'ui';
  ref?: number;
  rolloff?: number;
  maxDistance?: number;
  lowpass?: number;
  offset?: number;
  reverb?: number;
  delay?: number;
  fadeIn?: number;
}

function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, bright = 1): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * (0.2 + 0.7 * bright * (1 - t));
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
    }
  }
  return buf;
}

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  amb: GainNode;
  ui: GainNode;
  reverbIn: GainNode;
  private convolvers: { conv: ConvolverNode; gain: GainNode }[] = [];
  private reverbLevels = [0, 0, 0];
  duckGain: GainNode;
  buffers = new Map<string, AudioBuffer>();
  listenerPos = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  noiseBuffer: AudioBuffer;
  lowpassMaster: BiquadFilterNode;

  constructor() {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.lowpassMaster = ctx.createBiquadFilter();
    this.lowpassMaster.type = 'lowpass';
    this.lowpassMaster.frequency.value = 20000;
    this.master.connect(this.lowpassMaster).connect(comp).connect(ctx.destination);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.duckGain);
    this.amb = ctx.createGain();
    this.amb.connect(this.duckGain);
    this.ui = ctx.createGain();
    this.ui.connect(this.master);
    this.reverbIn = ctx.createGain();
    // three reverbs: small room, medium hall, huge church
    const specs: [number, number, number][] = [
      [0.9, 3.2, 0.9],
      [2.2, 2.6, 0.6],
      [5.0, 2.2, 0.45],
    ];
    for (const [s, d, b] of specs) {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, s, d, b);
      const g = ctx.createGain();
      g.gain.value = 0;
      this.reverbIn.connect(conv);
      conv.connect(g).connect(this.master);
      this.convolvers.push({ conv, gain: g });
    }
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applySettings();
    onSettings(() => this.applySettings());
    // listener defaults
    const l = ctx.listener as any;
    if (l.positionX) {
      l.positionX.value = 0;
      l.positionY.value = 1.6;
      l.positionZ.value = 0;
    }
  }

  applySettings() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.music.gain.setTargetAtTime(settings.music * 0.9, t, 0.05);
    this.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(settings.sfx * 0.9, t, 0.05);
    this.ui.gain.setTargetAtTime(Math.min(1, settings.sfx * 0.8 + 0.1), t, 0.05);
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  async load(name: string, url: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error('audio 404 ' + url);
    const arr = await res.arrayBuffer();
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      this.ctx.decodeAudioData(arr, resolve, reject);
    });
    this.buffers.set(name, buf);
  }

  has(name: string) {
    return this.buffers.has(name);
  }

  /** reverb mix per bank: [room, hall, church] */
  setReverb(room: number, hall: number, church: number, tc = 0.8) {
    const t = this.ctx.currentTime;
    const v = [room, hall, church];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(this.reverbLevels[i] - v[i]) > 0.001) {
        this.convolvers[i].gain.gain.setTargetAtTime(v[i], t, tc);
        this.reverbLevels[i] = v[i];
      }
    }
  }

  setMuffle(freq: number, tc = 0.3) {
    this.lowpassMaster.frequency.setTargetAtTime(freq, this.ctx.currentTime, tc);
  }

  duck(level: number, tc = 0.5) {
    this.duckGain.gain.setTargetAtTime(level, this.ctx.currentTime, tc);
  }

  updateListener(cam: THREE.Camera) {
    const l = this.ctx.listener as any;
    cam.getWorldPosition(this.listenerPos);
    cam.getWorldDirection(this.tmpF);
    this.tmpU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const p = this.listenerPos;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(this.tmpF.x, t, 0.02);
      l.forwardY.setTargetAtTime(this.tmpF.y, t, 0.02);
      l.forwardZ.setTargetAtTime(this.tmpF.z, t, 0.02);
      l.upX.setTargetAtTime(this.tmpU.x, t, 0.02);
      l.upY.setTargetAtTime(this.tmpU.y, t, 0.02);
      l.upZ.setTargetAtTime(this.tmpU.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(this.tmpF.x, this.tmpF.y, this.tmpF.z, this.tmpU.x, this.tmpU.y, this.tmpU.z);
    }
  }

  private busOf(o: PlayOpts): AudioNode {
    switch (o.bus) {
      case 'amb':
        return this.amb;
      case 'music':
        return this.music;
      case 'ui':
        return this.ui;
      default:
        return this.sfx;
    }
  }

  play(name: string, o: PlayOpts = {}, pos?: THREE.Vector3): SoundHandle | null {
    const buf = this.buffers.get(name);
    if (!buf) return null;
    return this.playBuffer(buf, o, pos);
  }

  playBuffer(buf: AudioBuffer, o: PlayOpts = {}, pos?: THREE.Vector3): SoundHandle {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!o.loop;
    src.playbackRate.value = o.rate ?? 1;
    const gain = ctx.createGain();
    const vol = o.volume ?? 1;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    if (o.fadeIn) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + o.fadeIn);
    } else gain.gain.value = vol;
    let node: AudioNode = src;
    let filter: BiquadFilterNode | undefined;
    if (o.lowpass) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = o.lowpass;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    let panner: PannerNode | undefined;
    if (pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = o.ref ?? 2;
      panner.rolloffFactor = o.rolloff ?? 1.2;
      panner.maxDistance = o.maxDistance ?? 200;
      setPannerPos(panner, pos, true);
      gain.connect(panner);
      panner.connect(this.busOf(o));
    } else gain.connect(this.busOf(o));
    const rv = o.reverb ?? (pos ? 0.35 : 0.15);
    if (rv > 0) {
      const send = ctx.createGain();
      send.gain.value = rv;
      (panner ?? gain).connect(send);
      send.connect(this.reverbIn);
    }
    const dur = buf.duration;
    const off = o.offset !== undefined ? o.offset : o.loop ? Math.random() * dur : 0;
    src.start(t0, off % dur);
    const h: SoundHandle = {
      source: src,
      gain,
      panner,
      filter,
      playing: true,
      stop: (fade = 0.05) => {
        if (!h.playing) return;
        h.playing = false;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0.0001, t + fade);
        try {
          src.stop(t + fade + 0.02);
        } catch {
          /* already stopped */
        }
      },
      setVolume: (v: number, tc = 0.1) => {
        gain.gain.setTargetAtTime(v, ctx.currentTime, tc);
      },
      setPosition: (p: THREE.Vector3) => {
        if (panner) setPannerPos(panner, p);
      },
    };
    src.onended = () => {
      h.playing = false;
    };
    return h;
  }

  /** Short synthesized tone for UI / puzzles */
  tone(freq: number, dur = 0.3, type: OscillatorType = 'sine', vol = 0.2, bus: 'ui' | 'sfx' = 'ui', pos?: THREE.Vector3) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      setPannerPos(p, pos, true);
      g.connect(p).connect(bus === 'ui' ? this.ui : this.sfx);
    } else g.connect(bus === 'ui' ? this.ui : this.sfx);
    const s = ctx.createGain();
    s.gain.value = 0.3;
    g.connect(s).connect(this.reverbIn);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur: number, freq: number, q: number, vol: number, pos?: THREE.Vector3) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      setPannerPos(p, pos, true);
      g.connect(p).connect(this.sfx);
    } else g.connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}

export function setPannerPos(p: PannerNode, v: THREE.Vector3, immediate = false) {
  const anyP = p as any;
  if (anyP.positionX && immediate) {
    anyP.positionX.value = v.x;
    anyP.positionY.value = v.y;
    anyP.positionZ.value = v.z;
  } else if (anyP.positionX) {
    const t = p.context.currentTime;
    anyP.positionX.setTargetAtTime(v.x, t, 0.02);
    anyP.positionY.setTargetAtTime(v.y, t, 0.02);
    anyP.positionZ.setTargetAtTime(v.z, t, 0.02);
  } else p.setPosition(v.x, v.y, v.z);
}
