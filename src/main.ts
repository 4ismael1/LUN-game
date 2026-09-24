import { Game } from './game/game';

const app = document.getElementById('app')!;
const game = new Game(app);
(window as any).__game = game;
// QA helper: ?autolock simulates pointer lock (for automated browsers without pointer-lock support)
if (location.search.includes('autolock')) {
  game.input.requestLock = () => {
    game.input.locked = true;
    game.ui.lockHint(false);
  };
  game.input.exitLock = () => {
    game.input.locked = false;
  };
  const G: any = game;
  (window as any).T = {
    g: game,
    tp(x: number, y: number, z: number, yaw = 0, pitch = 0) {
      const v = game.player.pos.clone().set(x, y, z);
      game.player.teleport(v, yaw, pitch);
    },
    use(id: string) {
      const it = game.world.interactables.find((i) => i.id === id);
      if (!it) return 'noid';
      if (!it.enabled()) return 'disabled';
      it.onUse();
      return 'used';
    },
    its() {
      const p = game.engine.camera.position;
      return game.world.interactables.filter((i) => i.pos.distanceTo(p) < 4 && i.enabled()).map((i) => i.id);
    },
    st() {
      return { state: game.state, stage: G.story.stage, zone: game.zoneName, pos: game.player.pos.toArray().map((v) => +v.toFixed(2)), obj: document.getElementById('obj-text')!.textContent, subs: document.getElementById('subs')!.textContent, ent: game.entity.state, entPos: game.entity.pos.toArray().map((v) => +v.toFixed(1)) };
    },
    wait: (s: number) => new Promise((r) => setTimeout(r, s * 1000)),
    key(code: string, key = '') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key }));
    },
    jump(stage: number, flags: Record<string, any>, pos: [number, number, number], yaw = 0, inv: string[] = []) {
      const S = G.story;
      S.checkpoint = { stage, flags: Object.assign({ midnightStarted: true, guardLight: true }, flags), inventory: ['telefono', 'linterna', 'cerillos', ...inv], docs: [], film: inv.includes('camara') ? 10 : 0, battery: 1, spares: 2, hasFlashlight: true, hasCamera: inv.includes('camara'), pos, yaw, playTime: 0, deaths: 0, photos: [], candles: [false, false, false, false, false, false, false] };
      game.retry();
    },
    async fps(sec = 2) {
      let n = 0;
      const t0 = performance.now();
      await new Promise<void>((res) => {
        const f = () => {
          n++;
          if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      return n / sec;
    },
  };
}

// browsers keep audio suspended until the first user gesture
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => game.audio.resume(), { capture: true });

async function boot() {
  try {
    await game.load();
  } catch (e) {
    console.error(e);
    game.ui.setLoading(1, 'Error al cargar: ' + (e as Error).message);
    return;
  }
  game.start();
  game.toTitle();
  game.ui.finishLoading();
  game.loadRest();
}
boot();
