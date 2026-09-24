import { settings, saveSettings } from '../core/settings';

const $ = (id: string) => document.getElementById(id)!;

export type ScreenName = 'loading' | 'title' | 'controls' | 'settings' | 'credits' | 'pause' | 'inventory' | 'reader' | 'puzzle' | 'gameover' | 'ending';

export class UI {
  private stack: ScreenName[] = [];
  onAction: (act: string, src: HTMLElement) => void = () => {};
  private subTimer = 0;
  private hintTimer = 0;
  private toastTimer = 0;
  private subQueue: { who: string; text: string; dur: number; thought: boolean; resolve: () => void; voice: string; color: string }[] = [];
  subActive = false;
  subIsDialogue = false;
  private subResolve: (() => void) | null = null;
  private cardTimer = 0;
  hudVisible = false;
  uiSound: (kind: 'hover' | 'click' | 'back') => void = () => {};

  constructor() {
    document.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.act!;
        this.uiSound(act === 'back' || act === 'close-inv' ? 'back' : 'click');
        this.onAction(act, b);
      });
      b.addEventListener('mouseenter', () => this.uiSound('hover'));
    });
    this.bindSettings();
  }

  bindSettings() {
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-set]').forEach((el) => {
      const key = el.dataset.set as keyof typeof settings;
      const cur = settings[key] as any;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!cur;
      else el.value = String(cur);
      el.addEventListener('input', () => {
        let v: any;
        if (el instanceof HTMLInputElement && el.type === 'checkbox') v = el.checked;
        else if (el instanceof HTMLInputElement) v = parseFloat(el.value);
        else v = el.value;
        (settings as any)[key] = v;
        saveSettings();
      });
    });
  }

  show(s: ScreenName) {
    $(s).classList.add('show');
  }
  hide(s: ScreenName) {
    $(s).classList.remove('show');
  }
  isShown(s: ScreenName) {
    return $(s).classList.contains('show');
  }
  /** open a sub-screen remembering where to return */
  push(s: ScreenName) {
    if (this.stack.length) this.hide(this.stack[this.stack.length - 1]);
    this.stack.push(s);
    this.show(s);
  }
  pop() {
    const s = this.stack.pop();
    if (s) this.hide(s);
    const prev = this.stack[this.stack.length - 1];
    if (prev) this.show(prev);
    return prev;
  }
  clearStack() {
    for (const s of this.stack) this.hide(s);
    this.stack = [];
  }
  top() {
    return this.stack[this.stack.length - 1];
  }

  private loadShown = 0;
  private tipTimer = 0;
  setLoading(f: number, label: string) {
    // never go backwards, and never claim 100% before we're done
    this.loadShown = Math.max(this.loadShown, Math.min(f, label === 'Listo' ? 1 : 0.99));
    const pct = Math.round(this.loadShown * 100);
    ($('load-fill') as HTMLElement).style.width = pct + '%';
    $('load-pct').textContent = pct + '%';
    $('load-label').textContent = label;
    if (!this.tipTimer) {
      const tips = [
        'Se recomienda usar audífonos.',
        'Lo que puedes usar tiene un punto encima. Apúntale y pulsa <kbd>E</kbd>.',
        'Los diálogos se adelantan con <kbd>E</kbd>, <kbd>Espacio</kbd> o clic.',
        'Correr y la linterna hacen que te encuentren antes.',
        'El juego guarda solo en cada punto de control.',
      ];
      let i = 0;
      const tip = $('load-tip');
      this.tipTimer = window.setInterval(() => {
        if (!this.isShown('loading')) return clearInterval(this.tipTimer);
        i = (i + 1) % tips.length;
        tip.style.opacity = '0';
        setTimeout(() => {
          tip.innerHTML = tips[i];
          tip.style.opacity = '1';
        }, 400);
      }, 4200);
    }
  }

  /** fade the loading screen away instead of cutting to the menu */
  finishLoading() {
    const el = $('loading');
    el.classList.add('out');
    setTimeout(() => {
      this.hide('loading');
      el.classList.remove('out');
    }, 650);
  }

  setHud(v: boolean) {
    this.hudVisible = v;
    $('hud').classList.toggle('hidden', !v);
  }

  objective(text: string | null, announce = true) {
    const o = $('objective');
    if (!text) {
      o.classList.remove('show');
      return;
    }
    o.classList.remove('show');
    setTimeout(() => {
      $('obj-text').textContent = text;
      o.classList.add('show');
    }, 350);
    if (announce) {
      const b = $('obj-banner');
      (b.querySelector('.ob-text') as HTMLElement).textContent = text;
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
    }
  }

  /** line under the objective: distance while travelling, the action once there */
  objectiveDistance(text: string | null) {
    const el = $('obj-dist');
    const t = text ?? '';
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('act', !!t && !/^\d+ m$/.test(t));
  }

  /** screen-space marker for the current objective; edge = clamped to the screen border */
  waypoint(x: number, y: number, show: boolean, edge = false, label = '') {
    const w = $('waypoint');
    w.classList.toggle('show', show);
    if (!show) return;
    w.classList.toggle('edge', edge);
    w.style.transform = `translate(${x}px, ${y}px)`;
    const sp = w.querySelector('span') as HTMLElement;
    if (sp.textContent !== label) sp.textContent = label;
  }

  clock(text: string, dim = false) {
    const c = $('clock');
    c.textContent = text;
    c.style.opacity = dim ? '0.35' : '1';
    const pt = document.querySelector('#phone .ph-time');
    if (pt) pt.textContent = text.replace(/\s*[ap]\.\s?m\./, '');
  }

  prompt(html: string | null) {
    const p = $('prompt');
    if (!html) {
      p.classList.remove('show');
      $('crosshair').classList.remove('active');
      return;
    }
    if (p.innerHTML !== html) p.innerHTML = html;
    p.classList.add('show');
    $('crosshair').classList.add('active');
  }

  hold(f: number | null) {
    const h = $('hold');
    if (f === null) {
      h.classList.remove('show');
      return;
    }
    h.classList.add('show');
    ($('hold').firstElementChild as HTMLElement).style.width = Math.round(f * 100) + '%';
  }

  hint(html: string, dur = 5) {
    const h = $('hint');
    h.innerHTML = html;
    h.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => h.classList.remove('show'), dur * 1000);
  }
  clearHint() {
    $('hint').classList.remove('show');
  }

  toast(title: string, text: string, dur = 3.5) {
    const t = $('toast');
    t.innerHTML = `<small>${title}</small>${text}`;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), dur * 1000);
  }

  battery(level: number | null) {
    const b = $('battery');
    if (level === null) {
      b.classList.remove('show');
      return;
    }
    b.classList.add('show');
    b.classList.toggle('low', level < 0.2);
    (b.firstElementChild as HTMLElement).style.width = Math.max(0, level * 90) + '%';
  }

  film(n: number | null) {
    $('film').textContent = n === null ? '' : `película: ${n}`;
    $('vf-count').textContent = n === null ? '' : String(n);
  }

  stamina(f: number) {
    const s = $('stamina');
    s.classList.toggle('show', f < 0.98);
    (s.firstElementChild as HTMLElement).style.width = Math.round(f * 100) + '%';
  }

  /** per-character "voice" blip (set by the game); key = voice profile */
  onBlip: (voice: string, ch: string) => void = () => {};

  /**
   * Queue a line. Spoken lines (who set, not thought) show in the dialogue box with a
   * typewriter reveal and blips; thoughts are a quiet italic subtitle.
   * Resolves when the line is finished (auto-advance or E).
   */
  sub(who: string, text: string, dur: number, thought = false, voice = '', color = ''): Promise<void> {
    return new Promise((resolve) => {
      const item = { who, text, dur, thought, resolve, voice, color };
      if (who && !thought) {
        // spoken dialogue jumps ahead of queued inner thoughts and cuts the current one
        const firstThought = this.subQueue.findIndex((q) => q.thought);
        if (firstThought >= 0) this.subQueue.splice(firstThought, 0, item);
        else this.subQueue.push(item);
        if (this.subActive && !this.subIsDialogue && this.subResolve) {
          this.subQueue.splice(this.subQueue.indexOf(item), 1);
          this.subQueue.unshift(item);
          this.subResolve();
        }
      } else this.subQueue.push(item);
      if (!this.subActive) this.nextSub();
    });
  }
  private typing: (() => void) | null = null;
  private holdThoughts = false;
  /** during a conversation or call, inner thoughts wait until it's over */
  setHoldThoughts(v: boolean) {
    if (this.holdThoughts === v) return;
    this.holdThoughts = v;
    if (!v && !this.subActive && this.subQueue.length) this.nextSub();
  }
  private nextSub() {
    const s = $('subs');
    const box = $('dlg');
    let idx = 0;
    if (this.holdThoughts) {
      idx = this.subQueue.findIndex((q) => !q.thought);
      if (idx < 0) {
        this.subActive = false;
        s.classList.remove('show');
        box.classList.remove('show', 'done');
        return;
      }
    }
    const n = this.subQueue.splice(idx, 1)[0];
    if (!n) {
      this.subActive = false;
      s.classList.remove('show');
      box.classList.remove('show', 'done');
      return;
    }
    this.subActive = true;
    this.subIsDialogue = !!n.who && !n.thought;
    clearTimeout(this.subTimer);
    let done = false;
    let typeT = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(this.subTimer);
      clearTimeout(typeT);
      this.typing = null;
      this.subResolve = null;
      s.classList.remove('show');
      // keep the box up between consecutive lines so it doesn't blink
      const nextIsDialogue = this.subQueue[0] && this.subQueue[0].who && !this.subQueue[0].thought;
      if (!nextIsDialogue) box.classList.remove('show');
      box.classList.remove('done');
      n.resolve();
      window.setTimeout(() => this.nextSub(), nextIsDialogue ? 60 : 140);
    };
    this.subResolve = finish;
    if (this.subIsDialogue) {
      const name = box.querySelector('.dlg-name') as HTMLElement;
      const txt = box.querySelector('.dlg-text') as HTMLElement;
      name.textContent = n.who;
      box.style.setProperty('--spk', n.color || '#e0a040');
      txt.textContent = '';
      box.classList.remove('done');
      box.classList.add('show');
      const chars = [...n.text];
      let i = 0;
      const hold = Math.max(1.3, 0.9 + n.text.length * 0.02);
      const complete = () => {
        clearTimeout(typeT);
        txt.textContent = n.text;
        this.typing = null;
        box.classList.add('done');
        this.subTimer = window.setTimeout(finish, Math.max(hold, n.dur * 0.35) * 1000);
      };
      const step = () => {
        if (done) return;
        if (i >= chars.length) return complete();
        const ch = chars[i++];
        txt.textContent += ch;
        if (/[a-záéíóúñü]/i.test(ch) && i % 2 === 1) this.onBlip(n.voice, ch);
        const pause = /[.!?…]/.test(ch) ? 260 : /[,;:—]/.test(ch) ? 120 : 24;
        typeT = window.setTimeout(step, pause);
      };
      this.typing = complete;
      step();
    } else {
      if (settings.subtitles || n.thought) {
        s.textContent = n.text;
        s.classList.toggle('thought', n.thought);
        s.classList.add('show');
      }
      this.subTimer = window.setTimeout(finish, n.dur * 1000);
    }
  }
  /** E on a line: first completes the typewriter, then advances */
  skipSub(): boolean {
    if (!this.subActive || !this.subResolve) return false;
    if (this.typing) {
      this.typing();
      return true;
    }
    this.subResolve();
    return true;
  }

  letterbox(on: boolean) {
    $('letterbox').classList.toggle('on', on);
    document.body.classList.toggle('cine', on);
  }

  itemCard(icon: HTMLCanvasElement, title: string, memory = false) {
    const c = $('itemcard');
    const cv = c.querySelector('canvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, 64, 64);
    g.drawImage(icon, 0, 0);
    (c.querySelector('.nm') as HTMLElement).innerHTML = `<small>${memory ? 'RECUERDO' : 'OBTENIDO'}</small>${title}`;
    c.classList.remove('show');
    void c.offsetWidth; // restart the animation
    c.classList.add('show');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => c.classList.remove('show'), 2700);
  }
  clearSubs() {
    this.subQueue.forEach((q) => q.resolve());
    this.subQueue = [];
    clearTimeout(this.subTimer);
    this.typing = null;
    this.subActive = false;
    $('subs').classList.remove('show');
    $('dlg').classList.remove('show', 'done');
    this.letterbox(false);
  }

  fade(to: number, secs = 1.2) {
    const f = $('fade');
    f.style.transition = `opacity ${secs}s`;
    f.style.opacity = String(to);
  }
  flash(strength = 1, secs = 0.6) {
    const f = $('flash');
    f.style.transition = 'none';
    f.style.opacity = String(strength);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        f.style.transition = `opacity ${secs}s`;
        f.style.opacity = '0';
      }),
    );
  }

  viewfinder(on: boolean) {
    $('viewfinder').classList.toggle('hidden', !on);
  }
  hideView(kind: string | null) {
    const h = $('hideview');
    h.classList.toggle('hidden', !kind);
    h.className = kind ? (kind === 'confessional' ? 'confessional' : '') : 'hidden';
  }
  lockHint(on: boolean) {
    $('lockhint').classList.toggle('hidden', !on);
  }

  reader(html: string, cls = '') {
    const p = $('reader-paper');
    p.className = 'paper ' + cls;
    p.innerHTML = html;
    this.push('reader');
  }

  el(id: string) {
    return $(id);
  }
}
