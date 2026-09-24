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
  game.ui.hide('loading');
  game.toTitle();
}
boot();
