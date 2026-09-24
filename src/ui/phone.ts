import { AudioEngine } from '../audio/audio';

const $ = (id: string) => document.getElementById(id)!;
const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/**
 * Julián's phone, raised into view from the bottom-right: incoming calls ring and vibrate
 * until answered with E, messages arrive as a chat thread.
 */
export class Phone {
  ringing = false;
  busy = false;
  private el = $('phone');
  private screen = this.el.querySelector('.ph-screen') as HTMLElement;
  private hideT = 0;
  private ringT = 0;
  private answerResolve: (() => void) | null = null;

  constructor(private a: AudioEngine) {}

  time(text: string) {
    (this.el.querySelector('.ph-time') as HTMLElement).textContent = text.replace(/\s*[ap]\.\s?m\./, '');
  }

  signal(on: boolean) {
    this.el.classList.toggle('nosignal', !on);
  }

  private show(dur = 0) {
    clearTimeout(this.hideT);
    this.el.classList.add('show');
    document.body.classList.add('phone-up');
    if (dur > 0) this.hideT = window.setTimeout(() => this.hide(), dur * 1000);
  }

  hide() {
    clearTimeout(this.hideT);
    this.el.classList.remove('show', 'ring');
    document.body.classList.remove('phone-up');
  }

  /** a text message: the phone comes up, buzzes and shows the thread */
  message(from: string, text: string, opts: { bad?: boolean; dur?: number } = {}) {
    if (this.busy) return;
    this.screen.innerHTML = `<div class="ph-thread"><div class="ph-from">${esc(from)}</div><div class="ph-msg${opts.bad ? ' bad' : ''}">${text}</div></div>`;
    this.buzz(2);
    this.show(opts.dur ?? 6);
  }

  /** incoming call; resolves when the player answers (E) */
  ring(from: string, status = 'Llamada entrante'): Promise<void> {
    this.busy = true;
    this.ringing = true;
    const initial = from.trim().charAt(0).toUpperCase() || '?';
    this.screen.innerHTML = `<div class="ph-call"><div class="ph-avatar">${esc(initial)}</div><div class="ph-name">${esc(from)}</div><div class="ph-status">${esc(status)}</div><div class="ph-answer"><b>E</b>contestar</div></div>`;
    this.show();
    this.el.classList.add('ring');
    const loop = () => {
      if (!this.ringing) return;
      this.ringTone();
      this.buzz(2);
      this.ringT = window.setTimeout(loop, 2300);
    };
    loop();
    return new Promise((r) => (this.answerResolve = r));
  }

  answer() {
    if (!this.ringing) return;
    this.ringing = false;
    clearTimeout(this.ringT);
    this.el.classList.remove('ring');
    this.a.play('switch_click', { bus: 'ui', volume: 0.5 });
    const st = this.screen.querySelector('.ph-status');
    if (st) st.textContent = 'En llamada';
    this.screen.querySelector('.ph-answer')?.remove();
    const r = this.answerResolve;
    this.answerResolve = null;
    r?.();
  }

  /** end the call: short "call ended", then the phone goes down */
  endCall(text = 'Llamada terminada') {
    const st = this.screen.querySelector('.ph-status');
    if (st) st.textContent = text;
    this.busy = false;
    this.show(1.6);
  }

  /** stop everything (game over, quit to menu) */
  reset() {
    this.ringing = false;
    this.busy = false;
    clearTimeout(this.ringT);
    this.answerResolve = null;
    this.hide();
  }

  // ------------------------------------------------------------- sounds (synthesized)
  private ringTone() {
    const ctx = this.a.ctx;
    const t0 = ctx.currentTime + 0.02;
    // an old cheap handset: two short warbling bursts
    for (let b = 0; b < 2; b++) {
      const t = t0 + b * 0.42;
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o.type = o2.type = 'square';
      o.frequency.value = 1320;
      o2.frequency.value = 1100;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      g.gain.setValueAtTime(0.06, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      lfo.connect(lg).connect(mix.gain);
      o.connect(mix);
      o2.connect(mix);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3500;
      mix.connect(lp).connect(g).connect(this.a.sfx);
      [o, o2, lfo].forEach((n) => {
        n.start(t);
        n.stop(t + 0.36);
      });
    }
  }

  private buzz(n: number) {
    const ctx = this.a.ctx;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.05 + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 120 + Math.random() * 10;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.setValueAtTime(0.25, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(lp).connect(g).connect(this.a.sfx);
      o.start(t);
      o.stop(t + 0.26);
    }
  }
}
