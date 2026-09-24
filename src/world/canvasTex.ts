import * as THREE from 'three';

// Procedurally painted textures: papel picado, lotería cards, painted signs, tiles, posters…

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export type Symbol = 'luna' | 'sol' | 'gallo' | 'campana' | 'corazon' | 'estrella' | 'flor' | 'calavera' | 'paloma';

export function drawSymbol(g: CanvasRenderingContext2D, s: Symbol, cx: number, cy: number, r: number) {
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  switch (s) {
    case 'luna':
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.moveTo(r * 0.9, -r * 0.2);
      g.arc(r * 0.35, -r * 0.15, r * 0.8, 0, Math.PI * 2, true);
      break;
    case 'sol':
      g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.moveTo(Math.cos(a - 0.12) * r * 0.62, Math.sin(a - 0.12) * r * 0.62);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        g.lineTo(Math.cos(a + 0.12) * r * 0.62, Math.sin(a + 0.12) * r * 0.62);
      }
      break;
    case 'campana':
      g.moveTo(-r * 0.15, -r * 0.95);
      g.lineTo(r * 0.15, -r * 0.95);
      g.quadraticCurveTo(r * 0.55, -r * 0.7, r * 0.55, 0);
      g.quadraticCurveTo(r * 0.6, r * 0.5, r * 0.9, r * 0.6);
      g.lineTo(-r * 0.9, r * 0.6);
      g.quadraticCurveTo(-r * 0.6, r * 0.5, -r * 0.55, 0);
      g.quadraticCurveTo(-r * 0.55, -r * 0.7, -r * 0.15, -r * 0.95);
      g.moveTo(r * 0.2, r * 0.75);
      g.arc(0, r * 0.75, r * 0.2, 0, Math.PI * 2);
      break;
    case 'corazon':
      g.moveTo(0, r * 0.85);
      g.bezierCurveTo(-r * 1.2, 0, -r * 0.7, -r * 0.95, 0, -r * 0.4);
      g.bezierCurveTo(r * 0.7, -r * 0.95, r * 1.2, 0, 0, r * 0.85);
      break;
    case 'estrella':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.42;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'gallo':
      // stylized rooster: body, tail feathers, head, comb
      g.ellipse(0, r * 0.15, r * 0.5, r * 0.38, 0, 0, Math.PI * 2);
      g.moveTo(r * 0.45, -r * 0.35);
      g.arc(r * 0.35, -r * 0.35, r * 0.22, 0, Math.PI * 2);
      g.moveTo(r * 0.3, -r * 0.55);
      g.lineTo(r * 0.35, -r * 0.8);
      g.lineTo(r * 0.45, -r * 0.6);
      g.lineTo(r * 0.55, -r * 0.78);
      g.lineTo(r * 0.55, -r * 0.5);
      g.closePath();
      g.moveTo(r * 0.55, -r * 0.4);
      g.lineTo(r * 0.8, -r * 0.3);
      g.lineTo(r * 0.55, -r * 0.25);
      g.moveTo(-r * 0.4, 0);
      g.quadraticCurveTo(-r * 1.1, -r * 0.9, -r * 0.8, -r * 0.1);
      g.quadraticCurveTo(-r * 1.0, -r * 0.5, -r * 0.35, r * 0.2);
      g.moveTo(-r * 0.1, r * 0.5);
      g.rect(-r * 0.12, r * 0.45, r * 0.07, r * 0.45);
      g.rect(r * 0.12, r * 0.45, r * 0.07, r * 0.45);
      break;
    case 'flor':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(Math.cos(a) * r * 0.55 + r * 0.35, Math.sin(a) * r * 0.55);
        g.ellipse(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.35, r * 0.22, a, 0, Math.PI * 2);
      }
      g.moveTo(r * 0.25, 0);
      g.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      break;
    case 'calavera':
      g.arc(0, -r * 0.15, r * 0.7, 0, Math.PI * 2);
      g.rect(-r * 0.4, r * 0.35, r * 0.8, r * 0.4);
      break;
    case 'paloma':
      g.moveTo(-r, 0);
      g.quadraticCurveTo(-r * 0.2, -r * 0.3, r * 0.5, -r * 0.2);
      g.quadraticCurveTo(r * 0.8, -r * 0.35, r, -r * 0.1);
      g.quadraticCurveTo(r * 0.5, r * 0.1, r * 0.3, r * 0.1);
      g.quadraticCurveTo(0, r * 0.6, -r * 0.5, r * 0.3);
      g.closePath();
      g.moveTo(-r * 0.1, -r * 0.2);
      g.quadraticCurveTo(-r * 0.3, -r * 1, r * 0.3, -r * 0.9);
      g.quadraticCurveTo(r * 0.2, -r * 0.5, r * 0.1, -r * 0.2);
      break;
  }
  g.restore();
}

/** Papel picado sheet: returns texture with alpha cut-outs. */
export function papelPicado(color: string, symbol: Symbol, dots = 0, seed = 1): THREE.CanvasTexture {
  const [c, g] = canvas(256, 320);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 320);
  // subtle paper fiber
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 320, 2, 2);
  }
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  // border pattern
  for (let x = 12; x < 256; x += 22) {
    g.beginPath();
    g.moveTo(x, 300);
    g.lineTo(x + 8, 314);
    g.lineTo(x + 16, 300);
    g.fill();
    g.fillRect(x + 2, 22, 8, 8);
  }
  // zigzag bottom edge
  g.beginPath();
  g.moveTo(0, 320);
  for (let x = 0; x <= 256; x += 16) g.lineTo(x + 8, 306 + ((x / 16) % 2) * 0);
  for (let x = 0; x <= 256; x += 16) {
    g.moveTo(x, 320);
    g.lineTo(x + 8, 308);
    g.lineTo(x + 16, 320);
  }
  g.fill();
  // lattice field
  const rng = (() => {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  })();
  for (let y = 44; y < 290; y += 18) {
    for (let x = 16; x < 240; x += 18) {
      const d = Math.hypot(x - 128, y - 160);
      if (d < 88) continue;
      g.beginPath();
      if (rng() < 0.5) g.arc(x, y, 4, 0, Math.PI * 2);
      else {
        g.moveTo(x, y - 6);
        g.lineTo(x + 5, y);
        g.lineTo(x, y + 6);
        g.lineTo(x - 5, y);
      }
      g.fill();
    }
  }
  // central ring with symbol as the remaining paper (cut the ring, keep symbol)
  g.beginPath();
  g.arc(128, 160, 80, 0, Math.PI * 2);
  g.arc(128, 160, 68, 0, Math.PI * 2, true);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(128, 160, 62, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = color;
  drawSymbol(g, symbol, 128, 158, 46);
  g.fill('evenodd');
  // number dots cut into the lower border (the order clue)
  if (dots > 0) {
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < dots; i++) {
      g.beginPath();
      g.arc(128 + (i - (dots - 1) / 2) * 20, 262, 6.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  // hanging fold at top
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 256, 10);
  const t = tex(c);
  return t;
}

/** Lotería card image */
export function loteriaCard(n: number, title: string, symbol: Symbol, bg = '#f1e6c8', fg = '#9c2a2a'): HTMLCanvasElement {
  const [c, g] = canvas(200, 300);
  g.fillStyle = '#1a1612';
  g.fillRect(0, 0, 200, 300);
  g.fillStyle = bg;
  g.fillRect(8, 8, 184, 284);
  g.strokeStyle = '#2a2018';
  g.lineWidth = 3;
  g.strokeRect(14, 14, 172, 272);
  g.fillStyle = '#2a2018';
  g.font = 'bold 26px "Alfa Slab One", Georgia, serif';
  g.textAlign = 'left';
  g.fillText(String(n), 22, 44);
  g.fillStyle = fg;
  drawSymbol(g, symbol, 100, 140, 62);
  g.fill('evenodd');
  g.fillStyle = '#2a2018';
  g.font = '26px "Lobster", Georgia, serif';
  g.textAlign = 'center';
  g.fillText(title, 100, 268);
  return c;
}

export function signTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; sub?: string; border?: string; aged?: number } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 1024;
  const h = opts.h ?? 256;
  const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg ?? '#1f3b2c';
  g.fillRect(0, 0, w, h);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = h * 0.05;
    g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  }
  g.fillStyle = opts.fg ?? '#e8c872';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * (opts.sub ? 0.46 : 0.58);
  g.font = `${size}px ${opts.font ?? '"Alfa Slab One", Georgia, serif'}`;
  while (g.measureText(text).width > w * 0.9 && size > 10) {
    size -= 4;
    g.font = `${size}px ${opts.font ?? '"Alfa Slab One", Georgia, serif'}`;
  }
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowOffsetY = h * 0.02;
  g.fillText(text, w / 2, opts.sub ? h * 0.4 : h * 0.52);
  if (opts.sub) {
    g.font = `${h * 0.2}px "Cormorant Garamond", Georgia, serif`;
    g.fillText(opts.sub, w / 2, h * 0.78);
  }
  g.shadowColor = 'transparent';
  // aging: scratches and fade
  const aged = opts.aged ?? 0.5;
  for (let i = 0; i < 900 * aged; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,240,210'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 6, 1 + Math.random() * 2);
  }
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(40,20,0,${0.3 * aged})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  return tex(c);
}

/** Talavera-like tile pattern */
export function talavera(seed = 1, blue = '#1d3f8a', accent = '#d8a032'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const s = 128;
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const ox = tx * s, oy = ty * s;
      g.fillStyle = '#efe9da';
      g.fillRect(ox, oy, s, s);
      g.strokeStyle = blue;
      g.fillStyle = blue;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(ox + s / 2, oy + s / 2, s * 0.3, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + seed;
        g.beginPath();
        g.ellipse(ox + s / 2 + Math.cos(a) * s * 0.3, oy + s / 2 + Math.sin(a) * s * 0.3, 9, 4, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = accent;
      g.beginPath();
      g.arc(ox + s / 2, oy + s / 2, s * 0.12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = blue;
      for (const [cx, cy] of [[0, 0], [s, 0], [0, s], [s, s]]) {
        g.beginPath();
        g.arc(ox + cx, oy + cy, s * 0.18, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 2;
      g.strokeRect(ox, oy, s, s);
    }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** striped awning / lona */
export function stripes(colors: string[], w = 256): THREE.CanvasTexture {
  const [c, g] = canvas(w, 64);
  const sw = w / colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(i * sw, 0, sw, 64);
  });
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * w, Math.random() * 64, 3, 3);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** radial light pool for fake lamp light on the ground */
export function lightPool(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

export function glowSprite(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,240,200,0.8)');
  grd.addColorStop(0.5, 'rgba(255,200,120,0.18)');
  grd.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function flameTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const grd = g.createRadialGradient(32, 90, 2, 32, 80, 40);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  grd.addColorStop(0.7, 'rgba(255,110,20,0.35)');
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 4);
  g.quadraticCurveTo(58, 70, 44, 110);
  g.quadraticCurveTo(32, 124, 20, 110);
  g.quadraticCurveTo(6, 70, 32, 4);
  g.fill();
  return tex(c, false);
}

/** generic paper document / poster */
export function posterTexture(title: string, lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; photo?: boolean; font?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 384, h = opts.h ?? 512;
  const [c, g] = canvas(w, h);
  g.fillStyle = opts.bg ?? '#e9dfc4';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(90,60,20,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  g.fillStyle = opts.fg ?? '#2a1d12';
  g.textAlign = 'center';
  g.font = `${w * 0.11}px ${opts.font ?? '"Alfa Slab One", Georgia'}`;
  g.fillText(title, w / 2, h * 0.14);
  let y = h * 0.24;
  if (opts.photo) {
    g.fillStyle = '#444';
    g.fillRect(w * 0.25, y, w * 0.5, h * 0.32);
    g.fillStyle = '#777';
    g.beginPath();
    g.arc(w / 2, y + h * 0.12, w * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w * 0.36, y + h * 0.2, w * 0.28, h * 0.12);
    y += h * 0.38;
  }
  g.fillStyle = opts.fg ?? '#2a1d12';
  g.font = `${w * 0.06}px "Cormorant Garamond", Georgia`;
  for (const l of lines) {
    g.fillText(l, w / 2, y);
    y += w * 0.075;
  }
  return tex(c);
}

/** clock face texture showing a time */
export function clockFace(h: number, m: number, roman = true, canvasIn?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvasIn ?? document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#e8e0c8';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2018';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = '#2a2018';
  g.font = '28px "Cormorant Garamond", Georgia';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(roman ? R[i] : String(i === 0 ? 12 : i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
  }
  const ha = ((h % 12) / 12 + m / 720) * Math.PI * 2 - Math.PI / 2;
  const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
  g.lineCap = 'round';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(ha) * 55, 128 + Math.sin(ha) * 55);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128 + Math.cos(ma) * 85, 128 + Math.sin(ma) * 85);
  g.stroke();
  g.beginPath();
  g.arc(128, 128, 8, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function chalkMark(kind: 'arrow' | 'candles' | 'hopscotch' | 'text', text = '', pattern: boolean[] = []): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,245,200,0.95)';
  g.fillStyle = 'rgba(255,245,200,0.95)';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const wob = () => (Math.random() - 0.5) * 6;
  if (kind === 'arrow') {
    g.beginPath();
    g.moveTo(80 + wob(), 256 + wob());
    g.lineTo(400 + wob(), 256 + wob());
    g.moveTo(300 + wob(), 160 + wob());
    g.lineTo(420, 256);
    g.lineTo(300 + wob(), 352 + wob());
    g.stroke();
    // small flower signature
    g.lineWidth = 6;
    g.beginPath();
    g.arc(110, 380, 18, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'candles') {
    // candelabrum with 7 candles; lit ones get flames
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(256, 470);
    g.lineTo(256, 300);
    g.moveTo(170, 470);
    g.lineTo(342, 470);
    g.stroke();
    const xs = [66, 130, 193, 256, 319, 382, 446];
    const ys = [300, 260, 230, 200, 230, 260, 300];
    g.beginPath();
    g.moveTo(66, 330);
    g.quadraticCurveTo(256, 390, 446, 330);
    g.stroke();
    xs.forEach((x, i) => {
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(x, 340 - (300 - ys[i]) * 0.2);
      g.lineTo(x, ys[i]);
      g.stroke();
      g.strokeRect(x - 12, ys[i] - 60, 24, 60);
      if (pattern[i]) {
        g.beginPath();
        g.moveTo(x, ys[i] - 115);
        g.quadraticCurveTo(x + 22, ys[i] - 80, x, ys[i] - 66);
        g.quadraticCurveTo(x - 22, ys[i] - 80, x, ys[i] - 115);
        g.fill();
      }
    });
    g.font = '40px "Caveat", cursive';
    g.textAlign = 'center';
    g.fillText('las velitas de la iglesia', 256, 60);
  } else if (kind === 'text') {
    g.font = '64px "Caveat", cursive';
    g.textAlign = 'center';
    const parts = text.split('\n');
    parts.forEach((p, i) => g.fillText(p, 256, 256 + (i - (parts.length - 1) / 2) * 70));
  } else {
    for (let i = 0; i < 5; i++) g.strokeRect(196, 420 - i * 80, 120, 70);
  }
  const t = tex(c);
  return t;
}

export function makeCanvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return tex(c, srgb);
}
