import * as THREE from 'three';
import { AudioEngine, setPannerPos } from './audio';

// Formant "babble" synthesizer: gives dialogue lines an audible, language-like
// murmur without recorded voice acting. Unvoiced mode produces whispers.
const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1200, 2500],
  e: [450, 1900, 2550],
  i: [300, 2300, 3000],
  o: [480, 850, 2400],
  u: [330, 800, 2300],
};

export interface VoiceProfile {
  pitch: number; // Hz
  rate?: number; // syllables per second
  whisper?: boolean;
  radio?: boolean;
  volume?: number;
  ghost?: boolean;
}

export const VOICES: Record<string, VoiceProfile> = {
  julian: { pitch: 118, rate: 6.5, volume: 0.22 },
  beto: { pitch: 102, rate: 6, volume: 0.3 },
  chayo: { pitch: 205, rate: 5.2, volume: 0.26 },
  chuy: { pitch: 128, rate: 6.8, volume: 0.28 },
  chema: { pitch: 96, rate: 5.8, volume: 0.3 },
  panadero: { pitch: 112, rate: 7, volume: 0.25 },
  lupe: { pitch: 215, rate: 7.2, volume: 0.25 },
  vecino: { pitch: 125, rate: 6.5, volume: 0.22 },
  vecina: { pitch: 220, rate: 6.5, volume: 0.22 },
  refugio: { pitch: 92, rate: 4.2, volume: 0.35, whisper: true },
  refugioReal: { pitch: 98, rate: 4.8, volume: 0.3 },
  madre: { pitch: 210, rate: 4.5, volume: 0.3, ghost: true },
  lucia: { pitch: 300, rate: 6, volume: 0.25, ghost: true },
  radio: { pitch: 140, rate: 7.5, volume: 0.25, radio: true },
  radioMadre: { pitch: 210, rate: 4.6, volume: 0.3, radio: true },
  radioLucia: { pitch: 300, rate: 5, volume: 0.26, radio: true },
  whisper: { pitch: 150, rate: 5, volume: 0.35, whisper: true },
  desvelada: { pitch: 160, rate: 3.5, volume: 0.35, whisper: true, ghost: true },
};

export class VoiceSynth {
  constructor(private a: AudioEngine) {}

  /** Speak text as babble; returns duration in seconds. */
  speak(text: string, prof: VoiceProfile, pos?: THREE.Vector3): number {
    const ctx = this.a.ctx;
    const rate = prof.rate ?? 6;
    const words = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zñ .,;!?¿¡…-]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    const out = ctx.createGain();
    out.gain.value = prof.volume ?? 0.25;
    let dest: AudioNode = out;
    let last: AudioNode = out;
    if (prof.radio) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 420;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const sh = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = i / 128 - 1;
        curve[i] = Math.tanh(x * 3);
      }
      sh.curve = curve;
      out.connect(hp).connect(lp).connect(sh);
      last = sh;
    }
    let final: AudioNode;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.refDistance = 2.5;
      p.rolloffFactor = 1.3;
      setPannerPos(p, pos, true);
      last.connect(p);
      final = p;
      p.connect(this.a.sfx);
    } else {
      last.connect(this.a.sfx);
      final = last;
    }
    const send = ctx.createGain();
    send.gain.value = prof.ghost ? 0.9 : 0.25;
    final.connect(send).connect(this.a.reverbIn);

    let t = ctx.currentTime + 0.05;
    const syl = 1 / rate;
    const f0 = prof.pitch;
    let count = 0;
    const MAX = 60;
    for (const w of words) {
      const vowels = w.match(/[aeiou]/g) || ['a'];
      const nSyl = Math.min(vowels.length, 5);
      for (let s = 0; s < nSyl && count < MAX; s++, count++) {
        const v = VOWELS[vowels[s]] || VOWELS.a;
        const d = syl * (0.75 + Math.random() * 0.5);
        const intonation = 1 + 0.12 * Math.sin(count * 0.9) - (s === nSyl - 1 ? 0.05 : 0);
        this.syllable(t, d, f0 * intonation, v, !!prof.whisper, out);
        t += d;
      }
      const last = w[w.length - 1];
      t += /[.,;!?…]/.test(last) ? syl * 2.2 : syl * 0.35;
    }
    void dest;
    const total = t - ctx.currentTime;
    setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        /* ignore */
      }
    }, (total + 3) * 1000);
    return total;
  }

  private syllable(t: number, d: number, f0: number, v: [number, number, number], whisper: boolean, out: AudioNode) {
    const ctx = this.a.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + d * 0.25);
    g.gain.exponentialRampToValueAtTime(0.35, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let src: AudioScheduledSourceNode;
    if (whisper) {
      const n = ctx.createBufferSource();
      n.buffer = this.a.noiseBuffer;
      src = n;
      n.start(t, Math.random());
    } else {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * (1 + (Math.random() - 0.5) * 0.06), t);
      o.frequency.linearRampToValueAtTime(f0 * (0.94 + Math.random() * 0.08), t + d);
      src = o;
      o.start(t);
    }
    const mix = ctx.createGain();
    mix.gain.value = whisper ? 0.5 : 0.18;
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = v[i] * (whisper ? 1.1 : 1);
      bp.Q.value = whisper ? 8 : 10 - i * 2;
      const fg = ctx.createGain();
      fg.gain.value = [1, 0.55, 0.25][i];
      src.connect(bp).connect(fg).connect(mix);
    }
    mix.connect(g).connect(out);
    src.stop(t + d + 0.02);
  }
}
