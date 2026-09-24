import { settings } from './settings';

type KeyHandler = (code: string) => void;

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mouseClicked = false;
  rightClicked = false;
  wheel = 0;
  locked = false;
  enabled = true;
  private keyHandlers: KeyHandler[] = [];
  private lockHandlers: Array<(locked: boolean) => void> = [];

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'ControlLeft' || (e.ctrlKey && e.code !== 'KeyR')) e.preventDefault();
      if (e.code === 'Space' && this.locked) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        this.keyHandlers.forEach((h) => h(e.code));
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp browser spikes
      const dx = Math.max(-200, Math.min(200, e.movementX));
      const dy = Math.max(-200, Math.min(200, e.movementY));
      this.mouseDX += dx;
      this.mouseDY += dy;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      } else if (e.button === 2) this.rightClicked = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.keys.clear();
      this.lockHandlers.forEach((h) => h(this.locked));
    });
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
      this.lockHandlers.forEach((h) => h(false));
    });
  }

  requestLock() {
    try {
      const p = (this.el as any).requestPointerLock({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') p.catch(() => (this.el as any).requestPointerLock());
    } catch {
      (this.el as any).requestPointerLock();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onKey(h: KeyHandler) {
    this.keyHandlers.push(h);
  }
  onLockChange(h: (locked: boolean) => void) {
    this.lockHandlers.push(h);
  }

  down(code: string) {
    return this.enabled && this.keys.has(code);
  }
  hit(code: string) {
    return this.enabled && this.pressed.has(code);
  }

  consumeMouse(): [number, number] {
    const s = 0.0022 * settings.sensitivity;
    const r: [number, number] = [this.mouseDX * s, this.mouseDY * s * (settings.invertY ? -1 : 1)];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.rightClicked = false;
    this.wheel = 0;
  }
}
