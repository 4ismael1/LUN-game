export interface Settings {
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  subtitles: boolean;
  invertY: boolean;
  quality: 'bajo' | 'medio' | 'alto';
  fov: number;
  brightness: number;
}

const KEY = 'ultima-noche-settings-v2';

const defaults: Settings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.85,
  sensitivity: 1.0,
  subtitles: true,
  invertY: false,
  quality: 'medio',
  fov: 72,
  brightness: 1.0,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...defaults };
}

export const settings: Settings = load();
const listeners: Array<(s: Settings) => void> = [];

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(settings));
}

export function onSettings(fn: (s: Settings) => void) {
  listeners.push(fn);
}

const SAVE_KEY = 'ultima-noche-progress-v1';
export interface Progress {
  endingsSeen: string[];
  bestTime?: number;
}
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { endingsSeen: [] };
}
export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
