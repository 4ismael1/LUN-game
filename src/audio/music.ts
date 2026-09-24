import * as THREE from 'three';
import { AudioEngine, setPannerPos } from './audio';
import { InstName, midiToFreq, synthInstrument } from './synth';

type Ev = [number, number, number, number]; // bar(1-based), beat, midi, durBeats

// ---------- Compositions ----------
// "La canción de Lucía" — lullaby, D major (used in the waltz, the organillo and the ending)
export const LULLABY: Ev[] = [
  [1, 0, 69, 1], [1, 1, 66, 1], [1, 2, 67, 1],
  [2, 0, 62, 2], [2, 2, 64, 1],
  [3, 0, 66, 1], [3, 1, 67, 1], [3, 2, 69, 1],
  [4, 0, 69, 3],
  [5, 0, 71, 1], [5, 1, 69, 1], [5, 2, 67, 1],
  [6, 0, 66, 2], [6, 2, 64, 1],
  [7, 0, 62, 1], [7, 1, 64, 1], [7, 2, 66, 1],
  [8, 0, 64, 3],
  [9, 0, 69, 1], [9, 1, 66, 1], [9, 2, 67, 1],
  [10, 0, 62, 2], [10, 2, 64, 1],
  [11, 0, 66, 1], [11, 1, 64, 1], [11, 2, 61, 1],
  [12, 0, 62, 3],
];
const CODA: Ev[] = [
  [13, 0, 71, 1], [13, 1, 69, 1], [13, 2, 67, 1],
  [14, 0, 66, 3],
  [15, 0, 64, 1], [15, 1, 67, 1], [15, 2, 73, 1],
  [16, 0, 74, 3],
];
export const toMinor = (m: number) => {
  const pc = ((m % 12) + 12) % 12;
  if (pc === 6) return m - 1; // F# -> F
  if (pc === 11) return m - 1; // B -> Bb
  return m;
};

interface Chord { bass: number; tri: number[] }
const CH: Record<string, Chord> = {
  D: { bass: 38, tri: [57, 62, 66] },
  A: { bass: 45, tri: [57, 61, 64] },
  A7: { bass: 45, tri: [55, 61, 64] },
  G: { bass: 43, tri: [55, 59, 62] },
  Bm: { bass: 47, tri: [54, 59, 62] },
  Em: { bass: 40, tri: [55, 59, 64] },
  Am: { bass: 45, tri: [57, 60, 64] },
  Dm: { bass: 38, tri: [57, 62, 65] },
  E7: { bass: 40, tri: [56, 62, 64] },
  F: { bass: 41, tri: [57, 60, 65] },
};
const WALTZ_CHORDS = ['D', 'D', 'D', 'A', 'G', 'D', 'Bm', 'A7', 'D', 'Bm', 'A7', 'D', 'G', 'D', 'A7', 'D'];
const BOLERO_CHORDS = ['Am', 'Dm', 'E7', 'Am', 'F', 'Dm', 'E7', 'Am'];
const BOLERO_MEL: Ev[] = [
  [1, 0, 76, 1.5], [1, 1.5, 74, 0.5], [1, 2, 72, 1], [1, 3, 71, 0.5], [1, 3.5, 72, 0.5],
  [2, 0, 74, 2], [2, 2, 69, 1], [2, 3, 72, 1],
  [3, 0, 71, 1.5], [3, 1.5, 69, 0.5], [3, 2, 68, 1], [3, 3, 71, 1],
  [4, 0, 69, 3],
  [5, 0, 72, 1.5], [5, 1.5, 74, 0.5], [5, 2, 76, 1], [5, 3, 77, 1],
  [6, 0, 76, 1.5], [6, 1.5, 74, 0.5], [6, 2, 72, 1], [6, 3, 69, 1],
  [7, 0, 71, 1], [7, 1, 68, 1], [7, 2, 64, 1], [7, 3, 68, 1],
  [8, 0, 69, 3],
];

export type LayerName = 'plaza' | 'cantina' | 'horror' | 'explore' | 'danger' | 'chase' | 'final' | 'ghostband' | 'musician' | 'organillo';

interface Layer {
  name: LayerName;
  gain: GainNode;
  target: number;
  current: number;
  tc: number;
  nextTime: number;
  step: number;
  active: boolean;
  sources: AudioBufferSourceNode[];
  panner?: PannerNode;
  filter?: BiquadFilterNode;
}

export class Music {
  private buffers = new Map<string, AudioBuffer>();
  layers = new Map<LayerName, Layer>();
  danger = 0; // 0..1 proximity intensity
  private dangerNodes: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private droneNodes: { gain: GainNode; filter: BiquadFilterNode; oscs: OscillatorNode[] } | null = null;
  private horrorNext = 0;
  private exploreNext = 0;
  private ctx: AudioContext;
  melodyQueue: { time: number; midi: number }[] = [];
  onOrganilloNote?: (midi: number) => void;

  constructor(private a: AudioEngine) {
    this.ctx = a.ctx;
    const names: LayerName[] = ['plaza', 'cantina', 'horror', 'explore', 'danger', 'chase', 'final', 'ghostband', 'musician', 'organillo'];
    for (const n of names) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const layer: Layer = { name: n, gain: g, target: 0, current: 0, tc: 2, nextTime: 0, step: 0, active: false, sources: [] };
      if (n === 'cantina' || n === 'ghostband' || n === 'musician' || n === 'organillo') {
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = n === 'cantina' ? 3800 : 9000;
        const p = this.ctx.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'inverse';
        p.refDistance = n === 'organillo' ? 3 : 4;
        p.rolloffFactor = 1.1;
        g.connect(f).connect(p).connect(a.music);
        const send = this.ctx.createGain();
        send.gain.value = 0.4;
        p.connect(send).connect(a.reverbIn);
        layer.panner = p;
        layer.filter = f;
      } else {
        g.connect(a.music);
        const send = this.ctx.createGain();
        send.gain.value = n === 'horror' || n === 'explore' ? 0.8 : 0.3;
        g.connect(send).connect(a.reverbIn);
      }
      this.layers.set(n, layer);
    }
  }

  /** Pre-synthesize every note used by the compositions (called during loading). */
  async prewarm(progress?: (f: number) => void) {
    const need: [InstName, number][] = [];
    const add = (i: InstName, m: number) => {
      if (!need.some(([a, b]) => a === i && b === m)) need.push([i, m]);
    };
    for (const e of [...LULLABY, ...CODA]) {
      add('marimba', e[2]);
      add('musicbox', e[2] + 12);
      add('musicbox', toMinor(e[2]) + 12);
      add('guitar', e[2]);
      add('guitar', toMinor(e[2]));
    }
    for (const c of Object.values(CH)) {
      add('bass', c.bass);
      add('bass', c.bass + 7);
      c.tri.forEach((m) => add('guitar', m));
    }
    for (const e of BOLERO_MEL) add('guitar', e[2]);
    [62, 63, 57, 69, 74, 50].forEach((m) => add('bell', m));
    [66, 68, 73, 61].forEach((m) => add('musicbox', m + 12));
    add('tom', 40);
    add('tom', 47);
    add('tom', 52);
    add('metal', 62);
    add('metal', 75);
    add('shaker', 60);
    add('thump', 30);
    add('rim', 60);
    for (let i = 0; i < need.length; i++) {
      this.buf(need[i][0], need[i][1]);
      // small slices so the title keeps animating while this runs in the background
      if (i % 2 === 1) {
        progress?.(i / need.length);
        await new Promise((r) => setTimeout(r, 24));
      }
    }
    progress?.(1);
  }

  buf(inst: InstName, midi: number): AudioBuffer {
    const key = inst + midi;
    let b = this.buffers.get(key);
    if (!b) {
      const sr = this.ctx.sampleRate;
      const data = synthInstrument(sr, inst, midi);
      b = this.ctx.createBuffer(1, data.length, sr);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(key, b);
    }
    return b;
  }

  /** play a synthesized note into a node */
  note(inst: InstName, midi: number, time: number, vel: number, dest: AudioNode, opts: { rate?: number; layer?: Layer; lowpass?: number; detune?: number } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf(inst, midi);
    if (opts.rate) src.playbackRate.value = opts.rate;
    if (opts.detune) src.detune.value = opts.detune;
    const g = this.ctx.createGain();
    g.gain.value = vel;
    if (opts.lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lowpass;
      src.connect(f).connect(g);
    } else src.connect(g);
    g.connect(dest);
    src.start(Math.max(time, this.ctx.currentTime));
    if (opts.layer) {
      const L = opts.layer;
      L.sources.push(src);
      src.onended = () => {
        const i = L.sources.indexOf(src);
        if (i >= 0) L.sources.splice(i, 1);
      };
    }
    return src;
  }

  /** synthesized sustained voice (strings / soft trumpet) */
  voice(type: 'string' | 'trumpet' | 'pad', midi: number, time: number, dur: number, vol: number, dest: AudioNode, cutoff = 1400) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = type === 'trumpet' ? 2 : 0.7;
    const g = ctx.createGain();
    const atk = type === 'pad' ? 1.6 : type === 'string' ? 0.25 : 0.09;
    const rel = type === 'pad' ? 2.2 : 0.4;
    const t0 = Math.max(time, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + atk);
    g.gain.setValueAtTime(vol, t0 + Math.max(atk, dur));
    g.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(atk, dur) + rel);
    f.connect(g).connect(dest);
    const fr = midiToFreq(midi);
    const oscs: OscillatorNode[] = [];
    const dets = type === 'trumpet' ? [0] : [-7, 6];
    for (const d of dets) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = d;
      o.connect(f);
      oscs.push(o);
    }
    if (type !== 'pad') {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = type === 'trumpet' ? 5.2 : 5.8;
      const lg = ctx.createGain();
      lg.gain.value = type === 'trumpet' ? 7 : 5;
      lfo.connect(lg);
      oscs.forEach((o) => lg.connect(o.detune));
      lfo.start(t0 + 0.2);
      lfo.stop(t0 + dur + rel + 0.1);
    }
    oscs.forEach((o) => {
      o.start(t0);
      o.stop(t0 + Math.max(atk, dur) + rel + 0.1);
    });
  }

  set(name: LayerName, target: number, tc = 2.5) {
    const L = this.layers.get(name)!;
    L.target = target;
    L.tc = tc;
    if (target > 0 && !L.active) {
      L.active = true;
      L.nextTime = this.ctx.currentTime + 0.1;
      if (name === 'horror') this.startDrone();
      if (name === 'danger') this.startDanger();
    }
    L.gain.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
  }

  setPosition(name: LayerName, p: THREE.Vector3) {
    const L = this.layers.get(name)!;
    if (L.panner) setPannerPos(L.panner, p, true);
  }

  /** abrupt diegetic stop with a tape-slowdown effect */
  tapeStop(name: LayerName) {
    const L = this.layers.get(name)!;
    const t = this.ctx.currentTime;
    for (const s of L.sources) {
      s.playbackRate.cancelScheduledValues(t);
      s.playbackRate.setValueAtTime(s.playbackRate.value, t);
      s.playbackRate.linearRampToValueAtTime(0.25, t + 1.6);
    }
    if (L.filter) L.filter.frequency.setTargetAtTime(250, t, 0.5);
    L.gain.gain.setTargetAtTime(0, t + 0.4, 0.5);
    L.target = 0;
    L.active = false;
    setTimeout(() => {
      if (L.filter) L.filter.frequency.value = name === 'cantina' ? 3800 : 9000;
    }, 4000);
  }

  private startDrone() {
    if (this.droneNodes) return;
    const ctx = this.ctx;
    const L = this.layers.get('horror')!;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 3;
    filter.connect(gain).connect(L.gain);
    const oscs: OscillatorNode[] = [];
    const freqs = [36.7, 55.1, 73.6, 110.3];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      const og = ctx.createGain();
      og.gain.value = i < 2 ? 0.22 : 0.035;
      o.connect(og).connect(filter);
      o.start();
      oscs.push(o);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = ctx.createGain();
      lg.gain.value = i < 2 ? 0.06 : 0.02;
      lfo.connect(lg).connect(og.gain);
      lfo.start();
      oscs.push(lfo);
    });
    // breathy noise band
    const n = ctx.createBufferSource();
    n.buffer = this.a.noiseBuffer;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 6;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    n.connect(bp).connect(ng).connect(L.gain);
    n.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03;
    const lg = ctx.createGain();
    lg.gain.value = 400;
    lfo.connect(lg).connect(bp.frequency);
    lfo.start();
    const flfo = ctx.createOscillator();
    flfo.frequency.value = 0.02;
    const flg = ctx.createGain();
    flg.gain.value = 180;
    flfo.connect(flg).connect(filter.frequency);
    flfo.start();
    this.droneNodes = { gain, filter, oscs };
  }

  private startDanger() {
    if (this.dangerNodes) return;
    const ctx = this.ctx;
    const L = this.layers.get('danger')!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(L.gain);
    const osc: OscillatorNode[] = [];
    [146.83, 155.56, 73.4].forEach((f, i) => {
      for (const d of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.1 : 0.06;
        o.connect(og).connect(filter);
        // tremolo
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 7 + i;
        const lg = ctx.createGain();
        lg.gain.value = 0.03;
        lfo.connect(lg).connect(og.gain);
        lfo.start();
        o.start();
        osc.push(o, lfo);
      }
    });
    this.dangerNodes = { osc, gain, filter };
  }

  /** Queue the lullaby on the organillo (diegetic music box), returns duration */
  playOrganillo(pos: THREE.Vector3, minor = false, bars = 12, tempo = 88): number {
    const L = this.layers.get('organillo')!;
    this.setPosition('organillo', pos);
    L.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    L.gain.gain.setValueAtTime(1, this.ctx.currentTime);
    const spb = 60 / tempo;
    const t0 = this.ctx.currentTime + 0.2;
    for (const e of LULLABY) {
      if (e[0] > bars) continue;
      const m = (minor ? toMinor(e[2]) : e[2]) + 12;
      const t = t0 + ((e[0] - 1) * 3 + e[1]) * spb;
      this.note('musicbox', m, t, 0.55, L.gain, { detune: minor ? -20 + Math.random() * 10 : 0 });
    }
    return bars * 3 * spb + 2;
  }

  /** Play a single organillo key note */
  organilloKey(midi: number, pos: THREE.Vector3) {
    const L = this.layers.get('organillo')!;
    this.setPosition('organillo', pos);
    L.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    L.gain.gain.setValueAtTime(1, this.ctx.currentTime);
    this.note('musicbox', midi + 12, this.ctx.currentTime + 0.01, 0.6, L.gain);
  }

  bellNote(midi: number, pos: THREE.Vector3 | null, vol = 0.7, detune = 0) {
    const dest = this.a.sfx;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf('bell', midi);
    src.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.refDistance = 6;
      p.rolloffFactor = 0.8;
      setPannerPos(p, pos, true);
      g.connect(p).connect(dest);
      const s = this.ctx.createGain();
      s.gain.value = 0.6;
      p.connect(s).connect(this.a.reverbIn);
    } else {
      g.connect(dest);
      const s = this.ctx.createGain();
      s.gain.value = 0.6;
      g.connect(s).connect(this.a.reverbIn);
    }
    src.start();
  }

  update(dt: number) {
    const now = this.ctx.currentTime;
    const ahead = now + 0.25;
    for (const L of this.layers.values()) {
      L.current += (L.target - L.current) * Math.min(1, dt / Math.max(0.05, L.tc));
      if (!L.active) continue;
      if (L.target <= 0 && L.current < 0.005) {
        L.active = false;
        continue;
      }
      if (L.nextTime < now - 0.5) L.nextTime = now + 0.05;
      switch (L.name) {
        case 'plaza':
          this.schedWaltz(L, ahead, 92, false);
          break;
        case 'final':
          this.schedWaltz(L, ahead, 74, true);
          break;
        case 'musician':
          this.schedMusician(L, ahead);
          break;
        case 'cantina':
          this.schedBolero(L, ahead);
          break;
        case 'ghostband':
          this.schedGhostBand(L, ahead);
          break;
        case 'chase':
          this.schedChase(L, ahead);
          break;
        case 'horror':
          this.schedHorror(L, now);
          break;
        case 'explore':
          this.schedExplore(L, now);
          break;
        default:
          break;
      }
    }
    if (this.dangerNodes) {
      const d = this.danger;
      const t = now;
      this.dangerNodes.gain.gain.setTargetAtTime(Math.pow(d, 1.6) * 0.9, t, 0.6);
      this.dangerNodes.filter.frequency.setTargetAtTime(250 + d * d * 2200, t, 0.6);
      // heartbeat pulse, tempo increasing with danger
      const L = this.layers.get('danger')!;
      if (d > 0.08 && L.active) {
        if (L.nextTime < now + 0.2) {
          const bpm = 55 + d * 70;
          const iv = 60 / bpm;
          const tt = Math.max(L.nextTime, now + 0.02);
          this.note('thump', 30, tt, 0.5 * d + 0.1, L.gain);
          this.note('thump', 30, tt + 0.22, 0.3 * d + 0.05, L.gain);
          L.nextTime = tt + iv;
        }
      }
    }
  }

  private schedWaltz(L: Layer, ahead: number, bpm: number, final: boolean) {
    const spb = 60 / bpm;
    while (L.nextTime < ahead) {
      const t = L.nextTime;
      const bar = Math.floor(L.step / 3) % 16;
      const beat = L.step % 3;
      const ch = CH[WALTZ_CHORDS[bar]];
      const cycle = Math.floor(L.step / 48);
      const sw = (Math.random() - 0.5) * 0.012;
      if (beat === 0) {
        this.note('bass', ch.bass, t + sw, final ? 0.3 : 0.34, L.gain, { lowpass: 1200 });
        if (final) this.note('guitar', ch.tri[0] - 12 >= 40 ? ch.tri[0] - 12 : ch.tri[0], t, 0.28, L.gain);
        if (final && bar % 2 === 0) this.voice('pad', ch.tri[0], t, spb * 6, 0.03, L.gain, 900);
        if (final && bar % 2 === 0) this.voice('pad', ch.tri[2], t, spb * 6, 0.025, L.gain, 900);
      } else {
        const strum = final ? 0.03 : 0.014;
        ch.tri.forEach((m, i) => this.note('guitar', m, t + sw + i * strum, (final ? 0.14 : 0.16) * (beat === 1 ? 1 : 0.8), L.gain));
      }
      // melody
      const mb = bar + 1;
      const inMel = [...LULLABY, ...CODA].filter((e) => e[0] === mb && e[1] === beat);
      for (const e of inMel) {
        if (final) {
          this.note('musicbox', e[2] + 12, t + 0.005, 0.28, L.gain);
          if (cycle % 2 === 1) this.voice('string', e[2], t, e[3] * spb * 0.95, 0.035, L.gain, 1600);
        } else {
          // alternate between marimba and a soft muted trumpet on second pass
          if (cycle % 3 === 1 && mb <= 12) this.voice('trumpet', e[2], t, e[3] * spb * 0.9, 0.035, L.gain, 1300);
          else this.note('marimba', e[2], t + 0.005, 0.3, L.gain);
          if (e[3] >= 2 && cycle % 3 !== 1) this.note('marimba', e[2], t + spb, 0.14, L.gain);
        }
      }
      L.step++;
      L.nextTime += spb;
    }
  }

  private schedMusician(L: Layer, ahead: number) {
    // solo guitar playing the lullaby slowly, rubato, like someone rehearsing
    const bpm = 70;
    const spb = 60 / bpm;
    while (L.nextTime < ahead) {
      const t = L.nextTime;
      const bar = Math.floor(L.step / 3) % 16;
      const beat = L.step % 3;
      const ch = CH[WALTZ_CHORDS[bar]];
      const rub = (Math.random() - 0.5) * 0.04;
      if (beat === 0) this.note('guitar', ch.tri[0] - 12 >= 40 ? ch.tri[0] - 12 : ch.bass + 12, t + rub, 0.3, L.gain);
      else this.note('guitar', ch.tri[beat], t + rub, 0.14, L.gain);
      for (const e of [...LULLABY, ...CODA]) if (e[0] === bar + 1 && e[1] === beat) this.note('guitar', e[2] + 12 > 81 ? e[2] : e[2] + 12, t + rub + 0.01, 0.34, L.gain);
      L.step++;
      L.nextTime += spb * (bar === 15 && beat === 2 ? 2.5 : 1);
    }
  }

  private schedBolero(L: Layer, ahead: number) {
    const bpm = 76;
    const spe = 60 / bpm / 2; // seconds per eighth
    while (L.nextTime < ahead) {
      const t = L.nextTime;
      const bar = Math.floor(L.step / 8) % 8;
      const e8 = L.step % 8;
      const ch = CH[BOLERO_CHORDS[bar]];
      if (e8 === 0) this.note('bass', ch.bass, t, 0.4, L.gain, { lowpass: 900, layer: L });
      if (e8 === 4) this.note('bass', ch.bass + 7, t, 0.32, L.gain, { lowpass: 900, layer: L });
      const arp = [0, 1, 2, 1, 2, 1, 2, 1][e8];
      this.note('guitar', ch.tri[arp], t, e8 % 2 === 0 ? 0.16 : 0.12, L.gain, { layer: L });
      if (e8 % 2 === 1) this.note('shaker', 60, t, 0.06, L.gain, { layer: L });
      // requinto melody
      for (const m of BOLERO_MEL) {
        if (m[0] === bar + 1 && Math.abs(m[1] * 2 - e8) < 0.01) this.note('guitar', m[2], t + 0.004, 0.32, L.gain, { layer: L });
      }
      L.step++;
      L.nextTime += spe;
    }
  }

  private schedGhostBand(L: Layer, ahead: number) {
    // the 2006 verbena heard through time: waltz, detuned and slowed
    const bpm = 62;
    const spb = 60 / bpm;
    while (L.nextTime < ahead) {
      const t = L.nextTime;
      const bar = Math.floor(L.step / 3) % 16;
      const beat = L.step % 3;
      const ch = CH[WALTZ_CHORDS[bar]];
      const dt = -35 + Math.sin(L.step * 0.3) * 25;
      if (beat === 0) this.note('bass', ch.bass, t, 0.4, L.gain, { detune: dt, rate: 0.98 });
      else ch.tri.forEach((m, i) => this.note('guitar', toMinor(m), t + i * 0.02, 0.13, L.gain, { detune: dt }));
      for (const e of LULLABY) if (e[0] === bar + 1 && e[1] === beat) this.voice('trumpet', toMinor(e[2]), t, e[3] * spb * 0.9, 0.05, L.gain, 900);
      L.step++;
      L.nextTime += spb;
    }
  }

  private schedChase(L: Layer, ahead: number) {
    const bpm = 132;
    const s16 = 60 / bpm / 4;
    const tomLo = [0, 3, 6, 8, 11, 14];
    const tomHi = [10, 13];
    while (L.nextTime < ahead) {
      const t = L.nextTime;
      const st = L.step % 16;
      const bar = Math.floor(L.step / 16);
      if (tomLo.includes(st)) this.note('tom', 40, t, st === 0 ? 0.7 : 0.45, L.gain);
      if (tomHi.includes(st)) this.note('tom', 47, t, 0.35, L.gain);
      this.note('shaker', 60, t, st % 4 === 2 ? 0.12 : 0.05, L.gain);
      if ((st === 4 || st === 12) && bar % 2 === 1) this.note('metal', st === 4 ? 62 : 75, t, 0.18, L.gain, { detune: Math.random() * 40 });
      if (st % 2 === 0) {
        const m = bar % 4 === 3 ? 51 : 50;
        this.voice('string', st % 8 === 0 ? m : m + 12, t, s16 * 1.4, st % 8 === 0 ? 0.05 : 0.03, L.gain, 2200);
      }
      if (st === 0 && bar % 2 === 0) this.voice('string', 62, t, s16 * 30, 0.02, L.gain, 1800);
      if (st === 8 && bar % 4 === 2) this.voice('string', 63, t, s16 * 14, 0.025, L.gain, 2000);
      L.step++;
      L.nextTime += s16;
    }
  }

  private schedHorror(L: Layer, now: number) {
    if (now < this.horrorNext) return;
    this.horrorNext = now + 5 + Math.random() * 9;
    const r = Math.random();
    const t = now + 0.1;
    if (r < 0.45) {
      // processed guitar fragment from the lullaby, pitched down, backwards-feeling
      const start = Math.floor(Math.random() * 10);
      const frag = LULLABY.slice(start, start + 2 + Math.floor(Math.random() * 3));
      frag.forEach((e, i) => this.note('guitar', toMinor(e[2]), t + i * 1.1, 0.22, L.gain, { rate: 0.5, detune: -15 + Math.random() * 30, lowpass: 1500 }));
    } else if (r < 0.7) {
      this.note('bell', [50, 57, 62][Math.floor(Math.random() * 3)], t, 0.1, L.gain, { rate: 0.5, lowpass: 900 });
    } else if (r < 0.88) {
      this.voice('string', [62, 63, 69, 70][Math.floor(Math.random() * 4)], t, 6, 0.018, L.gain, 900);
    } else {
      this.note('metal', 75, t, 0.05, L.gain, { rate: 0.25 });
    }
  }

  private schedExplore(L: Layer, now: number) {
    if (now < this.exploreNext) return;
    this.exploreNext = now + 7 + Math.random() * 10;
    const start = Math.floor(Math.random() * (LULLABY.length - 3));
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const e = LULLABY[start + i];
      this.note('musicbox', toMinor(e[2]) + 12, now + 0.1 + i * 0.9, 0.12, L.gain, { detune: -10 + Math.random() * 20 });
    }
  }
}
