import * as THREE from 'three';
import { CollisionWorld } from '../world/colliders';

/** 2D walkability grid + A* for the entity (ground level only). */
export class NavGrid {
  cell = 0.5;
  w: number;
  h: number;
  walk: Uint8Array;
  private g: Float32Array;
  private f: Float32Array;
  private parent: Int32Array;
  private closed: Uint8Array;
  private open: number[] = [];
  private stamp: Uint32Array;
  private curStamp = 1;

  constructor(private col: CollisionWorld, public minX: number, public minZ: number, maxX: number, maxZ: number) {
    this.w = Math.ceil((maxX - minX) / this.cell);
    this.h = Math.ceil((maxZ - minZ) / this.cell);
    const n = this.w * this.h;
    this.walk = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.stamp = new Uint32Array(n);
  }

  build(extraBlock?: (x: number, z: number) => boolean) {
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const x = this.minX + (i + 0.5) * this.cell;
        const z = this.minZ + (j + 0.5) * this.cell;
        let ok = !this.col.solidAt(x, z, 0.35, 1.9, 0.3);
        if (ok && extraBlock && extraBlock(x, z)) ok = false;
        this.walk[j * this.w + i] = ok ? 1 : 0;
      }
  }

  idx(x: number, z: number) {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  center(k: number, out = new THREE.Vector3()) {
    const i = k % this.w, j = Math.floor(k / this.w);
    return out.set(this.minX + (i + 0.5) * this.cell, 0, this.minZ + (j + 0.5) * this.cell);
  }
  walkable(x: number, z: number) {
    const k = this.idx(x, z);
    return k >= 0 && this.walk[k] === 1;
  }
  nearestWalkable(x: number, z: number, maxR = 6): number {
    const k = this.idx(x, z);
    if (k >= 0 && this.walk[k]) return k;
    const ci = Math.floor((x - this.minX) / this.cell), cj = Math.floor((z - this.minZ) / this.cell);
    const R = Math.ceil(maxR / this.cell);
    for (let r = 1; r <= R; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const kk = j * this.w + i;
          if (this.walk[kk]) return kk;
        }
    return -1;
  }

  /** straight walkable line check on the grid */
  lineClear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3, maxIter = 12000): THREE.Vector3[] | null {
    const s = this.nearestWalkable(from.x, from.z, 3);
    const t = this.nearestWalkable(to.x, to.z, 5);
    if (s < 0 || t < 0) return null;
    if (s === t) return [this.center(t)];
    this.curStamp++;
    const st = this.curStamp;
    const W = this.w;
    const tx = t % W, tz = Math.floor(t / W);
    const hfun = (k: number) => {
      const dx = Math.abs((k % W) - tx), dz = Math.abs(Math.floor(k / W) - tz);
      return (dx + dz + (1.4142 - 2) * Math.min(dx, dz));
    };
    const open = this.open;
    open.length = 0;
    const push = (k: number) => {
      open.push(k);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.f[open[p]] <= this.f[open[i]]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < open.length && this.f[open[l]] < this.f[open[m]]) m = l;
          if (r < open.length && this.f[open[r]] < this.f[open[m]]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const init = (k: number) => {
      if (this.stamp[k] !== st) {
        this.stamp[k] = st;
        this.g[k] = Infinity;
        this.closed[k] = 0;
        this.parent[k] = -1;
      }
    };
    init(s);
    this.g[s] = 0;
    this.f[s] = hfun(s);
    push(s);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let iter = 0;
    let found = false;
    while (open.length && iter++ < maxIter) {
      const k = pop();
      if (k === t) {
        found = true;
        break;
      }
      if (this.closed[k]) continue;
      this.closed[k] = 1;
      const ki = k % W, kj = Math.floor(k / W);
      for (const [di, dj, c] of dirs) {
        const i = ki + di, j = kj + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.h) continue;
        const nk = j * W + i;
        if (!this.walk[nk]) continue;
        if (di !== 0 && dj !== 0 && (!this.walk[kj * W + i] || !this.walk[j * W + ki])) continue;
        init(nk);
        if (this.closed[nk]) continue;
        const ng = this.g[k] + c;
        if (ng < this.g[nk]) {
          this.g[nk] = ng;
          this.f[nk] = ng + hfun(nk);
          this.parent[nk] = k;
          push(nk);
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    let k = t;
    while (k !== -1 && k !== s) {
      cells.push(k);
      k = this.parent[k];
    }
    cells.reverse();
    // string pulling
    const pts = cells.map((c) => this.center(c));
    const out: THREE.Vector3[] = [];
    let anchor = from.clone();
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 30);
      while (j > i && !this.lineClear(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }
}
