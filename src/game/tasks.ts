export const CANCEL = { cancelled: true };

/** Tiny coroutine scheduler driven by game time (pauses with the game). */
export class Tasks {
  time = 0;
  gen = 0;
  private waits: { at: number; resolve: () => void; gen: number }[] = [];
  private conds: { pred: () => boolean; resolve: () => void; gen: number; timeoutAt: number }[] = [];

  update(dt: number) {
    this.time += dt;
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      if (w.gen !== this.gen) {
        this.waits.splice(i, 1);
        continue;
      }
      if (this.time >= w.at) {
        this.waits.splice(i, 1);
        w.resolve();
      }
    }
    for (let i = this.conds.length - 1; i >= 0; i--) {
      const c = this.conds[i];
      if (c.gen !== this.gen) {
        this.conds.splice(i, 1);
        continue;
      }
      let ok = false;
      try {
        ok = c.pred();
      } catch {
        ok = false;
      }
      if (ok || this.time >= c.timeoutAt) {
        this.conds.splice(i, 1);
        c.resolve();
      }
    }
  }

  /** cancel all pending scripts (they will never resume) */
  reset() {
    this.gen++;
    this.waits = [];
    this.conds = [];
  }

  wait(s: number): Promise<void> {
    const gen = this.gen;
    return new Promise((resolve) => this.waits.push({ at: this.time + s, resolve, gen }));
  }

  until(pred: () => boolean, timeout = Infinity): Promise<void> {
    const gen = this.gen;
    return new Promise((resolve) => this.conds.push({ pred, resolve, gen, timeoutAt: this.time + timeout }));
  }

  /** run an async script; errors are logged, cancellation is silent */
  run(fn: () => Promise<void>) {
    fn().catch((e) => {
      if (e !== CANCEL) console.error('[script]', e);
    });
  }

  /** throw if the scripts generation changed since `gen` */
  check(gen: number) {
    if (gen !== this.gen) throw CANCEL;
  }

  get alive() {
    return this.gen;
  }
}
