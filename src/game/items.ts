// Inventory item catalogue with procedurally drawn icons.
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  memory?: boolean;
  draw: (g: CanvasRenderingContext2D) => void;
}

const ink = '#eadfc8';

function stroke(g: CanvasRenderingContext2D, w = 3, c = ink) {
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}

export const ITEMS: Record<string, ItemDef> = {
  telefono: {
    id: 'telefono', name: 'Teléfono', desc: 'Sin señal. La pantalla se quedó en 12:00.',
    draw: (g) => { stroke(g); g.strokeRect(22, 10, 20, 44); g.beginPath(); g.arc(32, 48, 2, 0, 7); g.stroke(); },
  },
  linterna: {
    id: 'linterna', name: 'Linterna', desc: 'Tu linterna de siempre, la del trabajo. [F] para encenderla o apagarla. Las pilas se gastan.',
    draw: (g) => { stroke(g); g.strokeRect(12, 26, 26, 12); g.beginPath(); g.moveTo(38, 24); g.lineTo(50, 18); g.lineTo(50, 46); g.lineTo(38, 40); g.closePath(); g.stroke(); g.fillStyle = '#e3a13d'; g.fillRect(51, 22, 3, 20); },
  },
  pilas: {
    id: 'pilas', name: 'Pilas', desc: 'Pilas de repuesto. Se usan solas cuando la linterna se apaga.',
    draw: (g) => { stroke(g); g.strokeRect(18, 16, 12, 34); g.strokeRect(34, 16, 12, 34); g.fillStyle = ink; g.fillRect(21, 12, 6, 4); g.fillRect(37, 12, 6, 4); },
  },
  tamal: {
    id: 'tamal', name: 'Tamal de rajas', desc: 'Envuelto en hoja de maíz, todavía caliente. Regalo de Don Beto. (Tab → clic para comerlo: recupera el aliento.)',
    draw: (g) => { g.fillStyle = '#c8b070'; g.beginPath(); g.moveTo(14, 40); g.quadraticCurveTo(32, 14, 52, 26); g.quadraticCurveTo(40, 48, 14, 40); g.fill(); g.strokeStyle = '#8a7040'; g.lineWidth = 2; g.beginPath(); g.moveTo(18, 38); g.lineTo(48, 28); g.stroke(); },
  },
  cerillos: {
    id: 'cerillos', name: 'Cerillos', desc: '«Cerillos La Central». Don Beto te los dio «pa\' que te alumbres».',
    draw: (g) => { stroke(g); g.strokeRect(14, 22, 36, 22); g.fillStyle = '#c2386e'; g.fillRect(16, 24, 32, 6); stroke(g, 2); g.beginPath(); g.moveTo(40, 18); g.lineTo(52, 6); g.stroke(); g.fillStyle = '#e3a13d'; g.beginPath(); g.arc(52, 6, 3, 0, 7); g.fill(); },
  },
  camara: {
    id: 'camara', name: 'Cámara instantánea', desc: 'La cámara de papá. «Ve lo que los ojos ya no». [Q] para levantarla, clic para fotografiar.',
    draw: (g) => { stroke(g); g.strokeRect(10, 20, 44, 30); g.beginPath(); g.arc(32, 35, 9, 0, 7); g.stroke(); g.strokeRect(40, 14, 10, 6); },
  },
  engrane_chico: {
    id: 'engrane_chico', name: 'Engrane mediano', desc: 'Un engrane de bronce de 18 dientes. Etiqueta: «Torre — eje 2».',
    draw: (g) => gear(g, 16, 18),
  },
  engrane_grande: {
    id: 'engrane_grande', name: 'Engrane grande', desc: 'Un engrane de 24 dientes, pesado y frío.',
    draw: (g) => gear(g, 22, 24),
  },
  engrane_enorme: {
    id: 'engrane_enorme', name: 'Engrane enorme', desc: 'Demasiado grande para cualquier reloj de bolsillo. 30 dientes.',
    draw: (g) => gear(g, 27, 30),
  },
  liston: {
    id: 'liston', name: 'Listón amarillo', desc: 'El listón que Lucía llevaba en el pelo aquella noche. El gato te trajo hasta aquí.', memory: true,
    draw: (g) => { stroke(g, 4, '#f0c020'); g.beginPath(); g.ellipse(24, 26, 10, 7, -0.4, 0, 7); g.ellipse(40, 26, 10, 7, 0.4, 0, 7); g.moveTo(30, 28); g.lineTo(22, 52); g.moveTo(34, 28); g.lineTo(42, 52); g.stroke(); },
  },
  carta: {
    id: 'carta', name: 'Carta sin enviar', desc: 'Tu letra. Tu nombre. Nunca la mandaste.', memory: true,
    draw: (g) => { stroke(g); g.strokeRect(12, 16, 40, 30); g.beginPath(); g.moveTo(12, 16); g.lineTo(32, 34); g.lineTo(52, 16); g.stroke(); },
  },
  foto_verbena: {
    id: 'foto_verbena', name: 'Fotografía de la verbena', desc: 'Tú y Lucía en el kiosco, la noche del 1 de febrero de 2006. Ella sonríe. Tú miras hacia la cantina.', memory: true,
    draw: (g) => { g.fillStyle = '#efe8d8'; g.fillRect(14, 10, 36, 44); g.fillStyle = '#3a2a4a'; g.fillRect(18, 14, 28, 28); g.fillStyle = '#e8c030'; g.beginPath(); g.arc(38, 34, 4, 0, 7); g.fill(); },
  },
  cassette: {
    id: 'cassette', name: 'Cassette «Prueba de sonido»', desc: 'Una grabación de la prueba de sonido de 2006. La voz de una niña pide una canción para su hermano.', memory: true,
    draw: (g) => { stroke(g); g.strokeRect(10, 18, 44, 28); g.beginPath(); g.arc(24, 32, 5, 0, 7); g.arc(40, 32, 5, 0, 7); g.stroke(); },
  },
  cancion: {
    id: 'cancion', name: 'La canción de Lucía', desc: 'En el 1020 de la radio, entre la estática, ella todavía la canta.', memory: true,
    draw: (g) => { stroke(g); g.beginPath(); g.moveTo(22, 44); g.lineTo(22, 16); g.lineTo(44, 12); g.lineTo(44, 40); g.stroke(); g.beginPath(); g.ellipse(18, 44, 6, 4, 0, 0, 7); g.ellipse(40, 40, 6, 4, 0, 0, 7); g.fill(); },
  },
};

function gear(g: CanvasRenderingContext2D, r: number, teeth: number) {
  g.fillStyle = '#b08a4a';
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.8 : r;
    g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#0b0908';
  g.beginPath();
  g.arc(32, 32, r * 0.25, 0, 7);
  g.fill();
}

export function itemIcon(id: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  ITEMS[id]?.draw(g);
  return c;
}

export const MEMORY_IDS = ['foto_verbena', 'cancion', 'carta', 'liston', 'cassette'];
