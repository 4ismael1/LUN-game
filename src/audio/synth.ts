// Offline instrument synthesis: builds AudioBuffers for procedural music.
export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type InstName = 'guitar' | 'bass' | 'marimba' | 'bell' | 'musicbox' | 'tom' | 'metal' | 'shaker' | 'thump' | 'rim';

function env(i: number, sr: number, a: number, d: number) {
  const t = i / sr;
  return (t < a ? t / a : 1) * Math.exp(-(t) / d);
}

export function karplus(sr: number, freq: number, seconds: number, bright: number, decay: number, body = true): Float32Array {
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  const N = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(N);
  // pluck excitation: lowpassed noise, pick position comb
  let lp = 0;
  for (let i = 0; i < N; i++) {
    lp += ((Math.random() * 2 - 1) - lp) * bright;
    buf[i] = lp;
  }
  const pick = Math.floor(N * 0.18);
  for (let i = N - 1; i >= pick; i--) buf[i] -= buf[i - pick] * 0.6;
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % N];
    const v = (cur + nxt) * 0.5 * decay;
    buf[idx] = v;
    out[i] = cur;
    idx = (idx + 1) % N;
    prev = v;
  }
  void prev;
  if (body) {
    // simple body resonance: two resonant biquads (approx 110Hz, 220Hz) mixed
    const res = (f: number, q: number, g: number) => {
      const w = (2 * Math.PI * f) / sr;
      const alpha = Math.sin(w) / (2 * q);
      const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      const o = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const x = out[i];
        const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        o[i] = y * g;
      }
      return o;
    };
    const r1 = res(105, 4, 0.6);
    const r2 = res(240, 3, 0.4);
    for (let i = 0; i < len; i++) out[i] = out[i] * 0.85 + r1[i] + r2[i];
  }
  // fade tail
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  normalize(out, 0.6);
  return out;
}

function normalize(d: Float32Array, peak: number) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

function additive(sr: number, seconds: number, partials: [number, number, number][], attack = 0.002, click = 0): Float32Array {
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  for (const [f, a, dec] of partials) {
    const w = (2 * Math.PI * f) / sr;
    const ph = Math.random() * 6.28;
    for (let i = 0; i < len; i++) out[i] += Math.sin(w * i + ph) * a * env(i, sr, attack, dec);
  }
  if (click > 0) {
    let lp = 0;
    for (let i = 0; i < sr * 0.01; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * 0.3;
      out[i] += lp * click * (1 - i / (sr * 0.01));
    }
  }
  const fade = Math.floor(sr * 0.03);
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  normalize(out, 0.6);
  return out;
}

export function synthInstrument(sr: number, inst: InstName, midi: number): Float32Array {
  const f = midiToFreq(midi);
  switch (inst) {
    case 'guitar':
      return karplus(sr, f, 3.2, 0.55, 0.9965 + Math.min(0.0025, (60 - midi) * 0.00006));
    case 'bass':
      return karplus(sr, f, 2.4, 0.35, 0.995);
    case 'marimba':
      return additive(sr, 1.6, [
        [f, 1, 0.55],
        [f * 3.93, 0.28, 0.12],
        [f * 9.2, 0.06, 0.04],
        [f * 2, 0.05, 0.2],
      ], 0.001, 0.25);
    case 'bell':
      return additive(sr, 7, [
        [f * 0.5, 0.55, 4.5],
        [f, 0.8, 3.2],
        [f * 1.19, 0.5, 2.5],
        [f * 1.5, 0.35, 2.2],
        [f * 2.0, 0.45, 1.8],
        [f * 2.51, 0.22, 1.2],
        [f * 2.66, 0.18, 1.0],
        [f * 3.01, 0.12, 0.8],
        [f * 4.17, 0.08, 0.5],
        [f * 5.43, 0.05, 0.3],
      ], 0.001, 0.5);
    case 'musicbox':
      return additive(sr, 2.6, [
        [f, 1, 1.1],
        [f * 2, 0.12, 0.6],
        [f * 5.4, 0.22, 0.18],
        [f * 11.9, 0.07, 0.05],
      ], 0.0008, 0.15);
    case 'tom': {
      const len = Math.floor(sr * 0.7);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const fr = f * (1 + 1.5 * Math.exp(-t * 30));
        ph += (2 * Math.PI * fr) / sr;
        out[i] = Math.sin(ph) * Math.exp(-t * 6) + (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 60);
      }
      normalize(out, 0.7);
      return out;
    }
    case 'thump': {
      const len = Math.floor(sr * 0.5);
      const out = new Float32Array(len);
      let ph = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const fr = 48 * (1 + 0.8 * Math.exp(-t * 25));
        ph += (2 * Math.PI * fr) / sr;
        out[i] = Math.sin(ph) * Math.exp(-t * 9);
      }
      normalize(out, 0.8);
      return out;
    }
    case 'metal':
      return additive(sr, 1.5, [
        [f, 0.6, 0.5],
        [f * 1.47, 0.5, 0.4],
        [f * 2.09, 0.4, 0.3],
        [f * 2.56, 0.35, 0.25],
        [f * 3.43, 0.25, 0.2],
        [f * 4.87, 0.2, 0.12],
      ], 0.0005, 0.6);
    case 'shaker': {
      const len = Math.floor(sr * 0.12);
      const out = new Float32Array(len);
      let hp = 0, prev = 0;
      for (let i = 0; i < len; i++) {
        const n = Math.random() * 2 - 1;
        hp = 0.9 * (hp + n - prev);
        prev = n;
        const t = i / sr;
        out[i] = hp * (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 40));
      }
      normalize(out, 0.4);
      return out;
    }
    case 'rim': {
      const len = Math.floor(sr * 0.08);
      const out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        out[i] = (Math.sin(2 * Math.PI * 1700 * t) * 0.5 + (Math.random() * 2 - 1) * 0.5) * Math.exp(-t * 80);
      }
      normalize(out, 0.5);
      return out;
    }
  }
}
