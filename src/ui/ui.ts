import { settings, saveSettings } from '../core/settings';

const $ = (id: string) => document.getElementById(id)!;

export type ScreenName = 'loading' | 'title' | 'controls' | 'settings' | 'credits' | 'pause' | 'inventory' | 'reader' | 'puzzle' | 'gameover' | 'ending';

export class UI {
  private stack: ScreenName[] = [];
  onAction: (act: string, src: HTMLElement) => void = () => {};
  private subTimer = 0;
  private hintTimer = 0;
  private toastTimer = 0;
  private subQueue: { who: string; text: string; dur: number; thought: boolean; resolve: () => void }[] = [];
  private subActive = false;
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

  setLoading(f: number, label: string) {
    ($('load-fill') as HTMLElement).style.width = Math.round(f * 100) + '%';
    $('load-label').textContent = label;
  }

  setHud(v: boolean) {
    this.hudVisible = v;
    $('hud').classList.toggle('hidden', !v);
  }

  objective(text: string | null) {
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
  }

  clock(text: string, dim = false) {
    const c = $('clock');
    c.textContent = text;
    c.style.opacity = dim ? '0.35' : '1';
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

  /** queue a subtitle line; resolves when it has finished */
  sub(who: string, text: string, dur: number, thought = false): Promise<void> {
    return new Promise((resolve) => {
      this.subQueue.push({ who, text, dur, thought, resolve });
      if (!this.subActive) this.nextSub();
    });
  }
  private nextSub() {
    const s = $('subs');
    const n = this.subQueue.shift();
    if (!n) {
      this.subActive = false;
      s.classList.remove('show');
      return;
    }
    this.subActive = true;
    if (settings.subtitles || n.thought) {
      s.innerHTML = (n.who ? `<span class="who">${n.who}</span>` : '') + n.text;
      s.classList.toggle('thought', n.thought);
      s.classList.add('show');
    }
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => {
      s.classList.remove('show');
      n.resolve();
      window.setTimeout(() => this.nextSub(), 180);
    }, n.dur * 1000);
  }
  clearSubs() {
    this.subQueue.forEach((q) => q.resolve());
    this.subQueue = [];
    clearTimeout(this.subTimer);
    this.subActive = false;
    $('subs').classList.remove('show');
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
