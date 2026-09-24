import * as THREE from 'three';
import type { Game } from './game';
import { loteriaCard, Symbol, drawSymbol } from '../world/canvasTex';
import { SoundHandle } from '../audio/audio';

type CloseFn = (solved: boolean) => void;

/** Close-up puzzle overlays. The world keeps running underneath. */
export class Puzzles {
  private box = document.getElementById('puzzle-box')!;
  active: string | null = null;
  private onClose: CloseFn | null = null;
  private cleanup: (() => void) | null = null;
  private escapable = true;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private g: Game) {}

  canEscape() {
    return this.escapable;
  }

  private open(id: string, html: string, onClose: CloseFn, escapable = true) {
    this.active = id;
    this.onClose = onClose;
    this.escapable = escapable;
    this.box.innerHTML = html;
    this.g.overlay = 'puzzle';
    this.g.input.exitLock();
    this.g.ui.push('puzzle');
    const closeBtn = this.box.querySelector('[data-pz=close]');
    closeBtn?.addEventListener('click', () => this.close(false));
  }

  close(solved: boolean, silent = false) {
    if (!this.active) return;
    this.active = null;
    this.cleanup?.();
    this.cleanup = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.g.ui.pop();
    if (this.g.overlay === 'puzzle') this.g.overlay = null;
    const cb = this.onClose;
    this.onClose = null;
    if (!silent) {
      this.g.input.requestLock();
      cb?.(solved);
    }
  }

  private keys(fn: (e: KeyboardEvent) => void) {
    this.keyHandler = fn;
    window.addEventListener('keydown', fn);
  }

  // ------------------------------------------------------------- ORGANILLO
  organillo(onSolved: () => void) {
    const figures: [Symbol, string, number][] = [
      ['sol', 'El Sol', 62],
      ['estrella', 'La Estrella', 73],
      ['campana', 'La Campana', 66],
      ['corazon', 'El Corazón', 64],
      ['luna', 'La Luna', 69],
      ['gallo', 'El Gallo', 67],
    ];
    const answer = ['luna', 'campana', 'gallo', 'sol', 'corazon'];
    const html = `<h2>El organillo</h2><p class="pz-sub">Seis teclas de marfil, cada una con una figura pintada. Una tarjeta dice: «de la luna hasta el corazón».</p>
      <div class="pz-row" id="pz-keys"></div><div class="pz-seq" id="pz-seq"></div><div class="pz-feedback" id="pz-fb"></div>
      <div class="pz-actions"><button class="pz-btn" data-pz="reset">Empezar de nuevo</button><button class="pz-btn" data-pz="close">Dejarlo (Esc)</button></div>`;
    this.open('organillo', html, () => {});
    const row = this.box.querySelector('#pz-keys')!;
    const seqEl = this.box.querySelector('#pz-seq')!;
    const fb = this.box.querySelector('#pz-fb')!;
    let seq: string[] = [];
    let done = false;
    const kpos = new THREE.Vector3(0, 2.4, 0);
    const press = (i: number) => {
      if (done) return;
      const [sym, , midi] = figures[i];
      this.g.music.organilloKey(midi, kpos);
      this.g.sfx('switch_click', kpos, 0.25);
      const btn = row.children[i] as HTMLElement;
      btn.classList.add('hit');
      setTimeout(() => btn.classList.remove('hit'), 140);
      seq.push(sym);
      seqEl.textContent = '♪ '.repeat(seq.length);
      const ok = answer.slice(0, seq.length).every((s, k) => s === seq[k]);
      if (!ok) {
        fb.textContent = seq.length >= 3 ? 'La melodía se tuerce. No era así.' : '';
        if (seq.length >= 5 || seq.length >= 3) {
          setTimeout(() => {
            seq = [];
            seqEl.textContent = '';
          }, 700);
        }
        return;
      }
      if (seq.length === answer.length) {
        done = true;
        fb.textContent = 'La melodía… la conoces. Siempre la conociste.';
        setTimeout(() => {
          this.close(true);
          onSolved();
        }, 1400);
      }
    };
    figures.forEach(([sym, title], i) => {
      const b = document.createElement('button');
      b.className = 'pz-card';
      const c = loteriaCard(i + 1, title, sym);
      b.appendChild(c);
      b.addEventListener('click', () => press(i));
      row.appendChild(b);
    });
    this.box.querySelector('[data-pz=reset]')!.addEventListener('click', () => {
      seq = [];
      seqEl.textContent = '';
      fb.textContent = '';
    });
    this.keys((e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 6) press(n - 1);
    });
  }

  // ------------------------------------------------------------- RADIO
  radio(stations: { freq: number; name: string; play: () => { stop: () => void }; onTuned?: () => void }[], pos: THREE.Vector3) {
    const html = `<h2>Radio Philco</h2><p class="pz-sub">Gira el dial (arrastra, rueda del ratón o ← →). Busca entre la estática.</p>
      <canvas class="pz-canvas" id="pz-dial" width="720" height="220"></canvas>
      <div class="pz-feedback" id="pz-fb"></div>
      <div class="pz-actions"><button class="pz-btn" data-pz="close">Apagar (Esc)</button></div>`;
    let freq = 700;
    let staticH: SoundHandle | null = this.g.audio.play('loop_radio_static', { loop: true, volume: 0.5, ref: 1.5 }, pos);
    this.g.sfx('radio_click_on', pos, 0.7);
    let current: { stop: () => void } | null = null;
    let currentFreq = -1;
    let tunedTime = 0;
    const tunedFired = new Set<number>();
    this.open('radio', html, () => {});
    const cv = this.box.querySelector('#pz-dial') as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    const fb = this.box.querySelector('#pz-fb')!;
    const draw = () => {
      ctx.clearRect(0, 0, 720, 220);
      const grd = ctx.createLinearGradient(0, 0, 0, 220);
      grd.addColorStop(0, '#3a2a18');
      grd.addColorStop(1, '#1a120a');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 720, 220);
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(30, 40, 660, 110);
      ctx.fillStyle = '#2a1e10';
      ctx.font = '18px "Cormorant Garamond", Georgia';
      ctx.textAlign = 'center';
      for (let f = 540; f <= 1600; f += 10) {
        const x = 40 + ((f - 530) / 1080) * 640;
        const big = f % 100 === 0;
        ctx.fillRect(x, 140 - (big ? 26 : 12), big ? 2 : 1, big ? 26 : 12);
        if (big) ctx.fillText(String(f / 10), x, 80);
      }
      ctx.font = 'italic 16px "Cormorant Garamond", Georgia';
      ctx.fillText('AM · kc ×10', 360, 60);
      const x = 40 + ((freq - 530) / 1080) * 640;
      ctx.fillStyle = '#b02a1a';
      ctx.fillRect(x - 1.5, 44, 3, 102);
      ctx.fillStyle = '#e8c872';
      ctx.font = '26px "Special Elite", monospace';
      ctx.fillText(Math.round(freq) + ' kHz', 360, 190);
      // glow when tuned
      const near = stations.reduce((m, s) => Math.min(m, Math.abs(s.freq - freq)), 999);
      ctx.fillStyle = `rgba(255,190,90,${Math.max(0, 1 - near / 12) * 0.6})`;
      ctx.beginPath();
      ctx.arc(660, 190, 10, 0, Math.PI * 2);
      ctx.fill();
    };
    const update = () => {
      let best: (typeof stations)[number] | null = null;
      let bd = 999;
      for (const s of stations) {
        const d = Math.abs(s.freq - freq);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      const clarity = best ? Math.max(0, 1 - bd / 14) : 0;
      staticH?.setVolume(0.08 + (1 - clarity) * 0.5, 0.05);
      if (best && bd < 9) {
        if (currentFreq !== best.freq) {
          current?.stop();
          current = best.play();
          currentFreq = best.freq;
          tunedTime = 0;
          fb.textContent = best.name;
        }
      } else if (current) {
        current.stop();
        current = null;
        currentFreq = -1;
        fb.textContent = '';
      }
      draw();
    };
    const setF = (f: number) => {
      const nf = THREE.MathUtils.clamp(f, 530, 1610);
      if (Math.abs(nf - freq) > 3 && Math.random() < 0.3) this.g.sfx('radio_tune', pos, 0.08, { rate: 1.5 });
      freq = nf;
      update();
    };
    let dragging = false;
    const toF = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 720;
      return 530 + ((x - 40) / 640) * 1080;
    };
    cv.addEventListener('pointerdown', (e) => {
      dragging = true;
      cv.setPointerCapture(e.pointerId);
      setF(toF(e));
    });
    cv.addEventListener('pointermove', (e) => dragging && setF(toF(e)));
    cv.addEventListener('pointerup', () => (dragging = false));
    const wheel = (e: WheelEvent) => {
      setF(freq + Math.sign(e.deltaY) * 5);
    };
    cv.addEventListener('wheel', wheel, { passive: true });
    this.keys((e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') setF(freq - 5);
      if (e.key === 'ArrowRight' || e.key === 'd') setF(freq + 5);
    });
    const iv = window.setInterval(() => {
      if (currentFreq > 0) {
        tunedTime += 0.1;
        const st = stations.find((s) => s.freq === currentFreq);
        if (st?.onTuned && tunedTime > 1.2 && !tunedFired.has(st.freq)) {
          tunedFired.add(st.freq);
          st.onTuned();
        }
      }
    }, 100);
    this.cleanup = () => {
      clearInterval(iv);
      current?.stop();
      staticH?.stop(0.3);
      staticH = null;
      this.g.sfx('radio_click_on', pos, 0.5, { rate: 0.8 });
    };
    update();
  }

  // ------------------------------------------------------------- CLOCK
  clock(answer: [number, number], onSolved: () => void) {
    const html = `<h2>El reloj de Don Aurelio</h2><p class="pz-sub">Las manecillas giran con la llave. Un letrero: «El cajón abre a la hora en que todo se detuvo».</p>
      <canvas class="pz-canvas" id="pz-clock" width="360" height="360"></canvas>
      <div class="pz-actions">
        <button class="pz-btn" data-h="-1">− hora</button><button class="pz-btn" data-h="1">+ hora</button>
        <button class="pz-btn" data-m="-1">− min</button><button class="pz-btn" data-m="1">+ min</button>
        <button class="pz-btn" data-pz="set">Girar la llave</button><button class="pz-btn" data-pz="close">Dejarlo (Esc)</button>
      </div><div class="pz-feedback" id="pz-fb"></div>`;
    this.open('clock', html, () => {});
    let h = 3, m = 40;
    const cv = this.box.querySelector('#pz-clock') as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const fb = this.box.querySelector('#pz-fb')!;
    const draw = () => {
      c.clearRect(0, 0, 360, 360);
      c.fillStyle = '#3a1a0e';
      c.beginPath();
      c.arc(180, 180, 176, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ece2c8';
      c.beginPath();
      c.arc(180, 180, 160, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a1a10';
      c.font = '30px "Cormorant Garamond", Georgia';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        c.fillText(R[i], 180 + Math.cos(a) * 128, 180 + Math.sin(a) * 128);
      }
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        c.fillRect(180 + Math.cos(a) * 150 - 1, 180 + Math.sin(a) * 150 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4);
      }
      const ha = ((h % 12) / 12 + m / 720) * Math.PI * 2 - Math.PI / 2;
      const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = '#1a100a';
      c.lineCap = 'round';
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(180, 180);
      c.lineTo(180 + Math.cos(ha) * 80, 180 + Math.sin(ha) * 80);
      c.stroke();
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(180, 180);
      c.lineTo(180 + Math.cos(ma) * 120, 180 + Math.sin(ma) * 120);
      c.stroke();
      c.fillStyle = '#b08a4a';
      c.beginPath();
      c.arc(180, 180, 9, 0, Math.PI * 2);
      c.fill();
    };
    const tick = () => this.g.sfx('clock_tick', undefined, 0.2, { rate: 2 });
    this.box.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        h = (h + parseInt(b.dataset.h!, 10) + 12) % 12;
        tick();
        draw();
      }),
    );
    this.box.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        m = (m + parseInt(b.dataset.m!, 10) + 60) % 60;
        tick();
        draw();
      }),
    );
    // drag minute hand
    let drag = false;
    cv.addEventListener('pointerdown', (e) => {
      drag = true;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerup', () => (drag = false));
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 360 - 180;
      const y = ((e.clientY - r.top) / r.height) * 360 - 180;
      let a = Math.atan2(y, x) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const nm = Math.round((a / (Math.PI * 2)) * 60) % 60;
      if (m > 45 && nm < 15) h = (h + 1) % 12;
      if (m < 15 && nm > 45) h = (h + 11) % 12;
      if (nm !== m) tick();
      m = nm;
      draw();
    });
    this.box.querySelector('[data-pz=set]')!.addEventListener('click', () => {
      this.g.sfx('mechanism_ratchet', undefined, 0.5);
      if (h % 12 === answer[0] % 12 && m === answer[1]) {
        fb.textContent = 'Algo hace clic dentro del mostrador.';
        setTimeout(() => {
          this.close(true);
          onSolved();
        }, 900);
      } else fb.textContent = 'La llave gira… y vuelve sola a su lugar.';
    });
    this.keys((e) => {
      if (e.key === 'ArrowUp') m = (m + 1) % 60;
      if (e.key === 'ArrowDown') m = (m + 59) % 60;
      if (e.key === 'ArrowRight') h = (h + 1) % 12;
      if (e.key === 'ArrowLeft') h = (h + 11) % 12;
      draw();
    });
    draw();
  }

  // ------------------------------------------------------------- GEARS
  gears(available: { id: string; teeth: number }[], onSolved: (placed: string[]) => void) {
    const html = `<h2>El mecanismo del alba</h2><p class="pz-sub">El engrane motor tiene 12 dientes. Los ejes están fijos: los dientes deben encajar exactamente. Elige un engrane y luego un eje vacío.</p>
      <canvas class="pz-canvas" id="pz-gears" width="720" height="360"></canvas>
      <div class="pz-row" id="pz-avail"></div>
      <div class="pz-feedback" id="pz-fb"></div>
      <div class="pz-actions"><button class="pz-btn" data-pz="reset">Quitar engranes</button><button class="pz-btn" data-pz="close">Dejarlo (Esc)</button></div>`;
    this.open('gears', html, () => {});
    const cv = this.box.querySelector('#pz-gears') as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const fb = this.box.querySelector('#pz-fb')!;
    const availEl = this.box.querySelector('#pz-avail')!;
    const S = 4.5; // px per tooth-radius unit
    // radius proportional to teeth: r = teeth * S
    const axles = [
      { x: 150, y: 190, teeth: 12, fixed: true },
      { x: 150 + (12 + 18) * S, y: 190, teeth: 0, fixed: false },
      { x: 150 + (12 + 18) * S + (18 + 24) * S * 0.94, y: 190 - (18 + 24) * S * 0.34, teeth: 0, fixed: false },
    ];
    const placed: (string | null)[] = [null, null, null];
    let sel: string | null = null;
    let angle = 0;
    let spinning = false;
    const need = [12, 18, 24];
    const drawGear = (x: number, y: number, teeth: number, rot: number, col: string) => {
      const r = teeth * S;
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 ? r - 7 : r + 5;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.fillStyle = '#120c08';
      c.beginPath();
      c.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    const draw = () => {
      c.fillStyle = '#16100c';
      c.fillRect(0, 0, 720, 360);
      axles.forEach((a, i) => {
        const teeth = a.fixed ? a.teeth : placed[i] ? available.find((x) => x.id === placed[i])!.teeth : 0;
        if (teeth) {
          const ratio = 12 / teeth;
          const dir = i % 2 === 0 ? 1 : -1;
          drawGear(a.x, a.y, teeth, angle * ratio * dir + (i === 1 ? Math.PI / teeth : 0), a.fixed ? '#8a6a3a' : '#b08a4a');
        }
        c.fillStyle = '#e8d8b0';
        c.beginPath();
        c.arc(a.x, a.y, 7, 0, Math.PI * 2);
        c.fill();
        if (!a.fixed && !placed[i]) {
          c.strokeStyle = sel ? '#e3a13d' : 'rgba(232,216,176,0.35)';
          c.setLineDash([6, 6]);
          c.beginPath();
          c.arc(a.x, a.y, 30, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
        }
      });
      c.fillStyle = 'rgba(232,216,176,0.5)';
      c.font = 'italic 16px "Cormorant Garamond", Georgia';
      c.fillText('motor', axles[0].x - 20, axles[0].y + 110);
      c.fillText('eje 2', axles[1].x - 18, axles[1].y + 150);
      c.fillText('eje 3 · martillo', axles[2].x - 40, axles[2].y - 160 < 20 ? 20 : axles[2].y - 165);
    };
    const renderAvail = () => {
      availEl.innerHTML = '';
      for (const a of available) {
        if (placed.includes(a.id)) continue;
        const b = document.createElement('button');
        b.className = 'pz-btn';
        b.textContent = `${a.teeth} dientes`;
        if (sel === a.id) b.style.borderColor = '#e3a13d';
        b.addEventListener('click', () => {
          sel = a.id;
          renderAvail();
          draw();
        });
        availEl.appendChild(b);
      }
    };
    const check = () => {
      const t = placed.map((p, i) => (i === 0 ? 12 : p ? available.find((x) => x.id === p)!.teeth : 0));
      if (t[1] && t[1] !== need[1]) fb.textContent = 'Los dientes no alcanzan a morder, o se atoran. No encaja.';
      else if (t[2] && t[2] !== need[2]) fb.textContent = 'El último engrane queda flojo contra el martillo.';
      else if (t[1] === need[1] && t[2] === need[2]) {
        fb.textContent = 'Encajan. El mecanismo cruje… y se mueve.';
        spinning = true;
        this.g.sfx('gear_clank', undefined, 0.8);
        setTimeout(() => {
          this.close(true);
          onSolved(placed.filter(Boolean) as string[]);
        }, 1800);
      } else fb.textContent = '';
    };
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 720;
      const y = ((e.clientY - r.top) / r.height) * 360;
      axles.forEach((a, i) => {
        if (a.fixed) return;
        if (Math.hypot(x - a.x, y - a.y) < 60) {
          if (sel && !placed[i]) {
            placed[i] = sel;
            sel = null;
            this.g.sfx('gear_clank', undefined, 0.5, { rate: 1.3 });
            renderAvail();
            check();
          } else if (placed[i]) {
            placed[i] = null;
            renderAvail();
            fb.textContent = '';
          }
          draw();
        }
      });
    });
    this.box.querySelector('[data-pz=reset]')!.addEventListener('click', () => {
      placed[1] = placed[2] = null;
      sel = null;
      renderAvail();
      fb.textContent = '';
      draw();
    });
    let raf = 0;
    const anim = () => {
      raf = requestAnimationFrame(anim);
      if (spinning) angle += 0.03;
      draw();
    };
    anim();
    this.cleanup = () => cancelAnimationFrame(raf);
    renderAvail();
    draw();
  }

  // ------------------------------------------------------------- GENERATOR (cord pull timing)
  generator(onAttempt: (ok: boolean) => void, onSolved: () => void) {
    const html = `<h2>La planta de luz</h2><p class="pz-sub">Jala la cuerda cuando la marca pase por la zona clara. [E], [Espacio] o clic. Hace mucho ruido.</p>
      <canvas class="pz-canvas" id="pz-gen" width="600" height="90"></canvas>
      <div class="pz-seq" id="pz-seq"></div><div class="pz-feedback" id="pz-fb"></div>
      <div class="pz-actions"><button class="pz-btn" data-pz="close">Soltar (Esc)</button></div>`;
    this.open('generator', html, () => {});
    const cv = this.box.querySelector('#pz-gen') as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const fb = this.box.querySelector('#pz-fb')!;
    const seqEl = this.box.querySelector('#pz-seq')!;
    let t = 0;
    let hits = 0;
    let zone = 0.55 + Math.random() * 0.25;
    let cool = 0;
    const width = 0.12;
    const pull = () => {
      if (cool > 0) return;
      cool = 0.7;
      const x = (Math.sin(t) + 1) / 2;
      const ok = Math.abs(x - zone) < width / 2;
      onAttempt(ok);
      if (ok) {
        hits++;
        seqEl.textContent = '● '.repeat(hits) + '○ '.repeat(Math.max(0, 3 - hits));
        fb.textContent = hits < 3 ? 'El motor tose… casi.' : '¡Arrancó!';
        zone = 0.2 + Math.random() * 0.6;
        if (hits >= 3) {
          setTimeout(() => {
            this.close(true);
            onSolved();
          }, 600);
        }
      } else fb.textContent = 'La cuerda se regresa con un chasquido.';
    };
    seqEl.textContent = '○ ○ ○';
    cv.addEventListener('click', pull);
    this.keys((e) => {
      if (e.code === 'KeyE' || e.code === 'Space') {
        e.preventDefault();
        pull();
      }
    });
    let raf = 0;
    let last = performance.now();
    const anim = () => {
      raf = requestAnimationFrame(anim);
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      t += dt * (2.2 + hits * 0.6);
      cool -= dt;
      c.fillStyle = '#16100c';
      c.fillRect(0, 0, 600, 90);
      c.fillStyle = 'rgba(227,161,61,0.35)';
      c.fillRect(20 + (zone - width / 2) * 560, 20, width * 560, 50);
      c.strokeStyle = 'rgba(232,216,176,0.4)';
      c.strokeRect(20, 20, 560, 50);
      const x = (Math.sin(t) + 1) / 2;
      c.fillStyle = '#eadfc8';
      c.fillRect(20 + x * 560 - 3, 14, 6, 62);
    };
    anim();
    this.cleanup = () => cancelAnimationFrame(raf);
  }

  // ------------------------------------------------------------- PANEL
  panel(onTrip: () => void, onSolved: () => void) {
    const labels = ['ESCENARIO', 'KIOSCO', 'PORTALES', 'TEMPLO'];
    const html = `<h2>Tablero eléctrico</h2><p class="pz-sub">Cuatro pastillas viejas. Una etiqueta a plumón: «¡NO JUNTAR TODO! Se bota. — Chema».</p>
      <div class="pz-row" id="pz-sw"></div><div class="pz-feedback" id="pz-fb"></div>
      <div class="pz-actions"><button class="pz-btn" data-pz="close">Dejarlo (Esc)</button></div>`;
    this.open('panel', html, () => {});
    const row = this.box.querySelector('#pz-sw')!;
    const fb = this.box.querySelector('#pz-fb')!;
    const state = [true, false, false, false];
    const render = () => {
      row.innerHTML = '';
      labels.forEach((l, i) => {
        const b = document.createElement('button');
        b.className = 'pz-card';
        const cv = document.createElement('canvas');
        cv.width = 120;
        cv.height = 200;
        const c = cv.getContext('2d')!;
        c.fillStyle = '#2a2e2a';
        c.fillRect(0, 0, 120, 200);
        c.fillStyle = '#111';
        c.fillRect(35, 30, 50, 110);
        c.fillStyle = state[i] ? '#d8c890' : '#6a6a60';
        c.fillRect(40, state[i] ? 36 : 84, 40, 50);
        c.fillStyle = state[i] ? '#e3a13d' : '#3a3a34';
        c.beginPath();
        c.arc(60, 160, 8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#eadfc8';
        c.font = '15px "Alfa Slab One", Georgia';
        c.textAlign = 'center';
        c.fillText(l, 60, 192);
        b.appendChild(cv);
        b.addEventListener('click', () => {
          state[i] = !state[i];
          this.g.sfx('switch_click', undefined, 0.7);
          if (state.every((s) => s)) {
            fb.textContent = '¡Chispazo! Se botaron todas.';
            this.g.sfx('electric_spark', undefined, 0.9);
            state.fill(false);
            onTrip();
          } else if (!state[0] && state[1] && state[2] && state[3]) {
            fb.textContent = 'El zumbido cambia. Esta vez la luz aguanta.';
            setTimeout(() => {
              this.close(true);
              onSolved();
            }, 900);
          } else fb.textContent = state[0] ? 'Solo el escenario tiene corriente. Como aquella noche.' : '';
          render();
        });
        row.appendChild(b);
      });
    };
    render();
  }
}

export { drawSymbol };
