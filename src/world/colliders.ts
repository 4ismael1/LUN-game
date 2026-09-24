import * as THREE from 'three';

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  enabled: boolean;
  /** blocks line of sight */
  opaque: boolean;
  tag?: string;
  id: number;
}

const CELL = 4;

export class CollisionWorld {
  boxes: Collider[] = [];
  private grid = new Map<string, Collider[]>();
  private dynamic: Collider[] = [];
  private nextId = 1;
  private qset = new Set<Collider>();
  private qarr: Collider[] = [];

  add(min: THREE.Vector3, max: THREE.Vector3, opts: { opaque?: boolean; tag?: string; dynamic?: boolean } = {}): Collider {
    const c: Collider = { min: min.clone(), max: max.clone(), enabled: true, opaque: opts.opaque ?? true, tag: opts.tag, id: this.nextId++ };
    this.boxes.push(c);
    if (opts.dynamic) this.dynamic.push(c);
    else this.insert(c);
    return c;
  }

  /** axis-aligned box from center-bottom + size */
  addBox(cx: number, y0: number, cz: number, w: number, h: number, d: number, opts: { opaque?: boolean; tag?: string; dynamic?: boolean; rotY?: number } = {}) {
    if (opts.rotY) {
      const c = Math.abs(Math.cos(opts.rotY));
      const s = Math.abs(Math.sin(opts.rotY));
      const nw = w * c + d * s;
      const nd = w * s + d * c;
      w = nw;
      d = nd;
    }
    return this.add(new THREE.Vector3(cx - w / 2, y0, cz - d / 2), new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2), opts);
  }

  remove(c: Collider) {
    c.enabled = false;
  }

  private insert(c: Collider) {
    const x0 = Math.floor(c.min.x / CELL), x1 = Math.floor(c.max.x / CELL);
    const z0 = Math.floor(c.min.z / CELL), z1 = Math.floor(c.max.z / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = x + ',' + z;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): Collider[] {
    this.qset.clear();
    this.qarr.length = 0;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(x + ',' + z);
        if (arr) for (const c of arr) if (c.enabled && !this.qset.has(c)) {
          this.qset.add(c);
          this.qarr.push(c);
        }
      }
    for (const c of this.dynamic) if (c.enabled && c.max.x >= minX && c.min.x <= maxX && c.max.z >= minZ && c.min.z <= maxZ) this.qarr.push(c);
    return this.qarr;
  }

  /** push a vertical capsule (circle in XZ) out of boxes. Returns true if collided. */
  resolve(pos: THREE.Vector3, radius: number, feetY: number, headY: number, stepH: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      let moved = false;
      for (const b of list) {
        if (b.max.y <= feetY + stepH || b.min.y >= headY) continue;
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // center inside box: push out along smallest axis
          const pxl = pos.x - b.min.x, pxr = b.max.x - pos.x;
          const pzl = pos.z - b.min.z, pzr = b.max.z - pos.z;
          const m = Math.min(pxl, pxr, pzl, pzr);
          if (m === pxl) pos.x = b.min.x - radius;
          else if (m === pxr) pos.x = b.max.x + radius;
          else if (m === pzl) pos.z = b.min.z - radius;
          else pos.z = b.max.z + radius;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** highest walkable surface under the circle not above feet+stepH */
  groundAt(x: number, z: number, radius: number, feetY: number, stepH: number): number {
    let g = 0;
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    for (const b of list) {
      if (b.max.y > feetY + stepH + 0.001) continue;
      if (x + radius < b.min.x || x - radius > b.max.x || z + radius < b.min.z || z - radius > b.max.z) continue;
      if (b.max.y > g) g = b.max.y;
    }
    return g;
  }

  /** ceiling (lowest box bottom above y) */
  ceilingAt(x: number, z: number, radius: number, y: number): number {
    let c = Infinity;
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    for (const b of list) {
      if (b.min.y < y) continue;
      if (x + radius < b.min.x || x - radius > b.max.x || z + radius < b.min.z || z - radius > b.max.z) continue;
      if (b.min.y < c) c = b.min.y;
    }
    return c;
  }

  /** segment test against opaque boxes (line of sight) */
  blocked(a: THREE.Vector3, b: THREE.Vector3, ignore?: Collider): boolean {
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
    const list = this.query(minX, minZ, maxX, maxZ);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const c of list) {
      if (!c.opaque || c === ignore) continue;
      if (c.max.y - c.min.y < 0.9 && c.max.y < Math.max(a.y, b.y) - 0.2) continue;
      let t0 = 0, t1 = 1;
      const axes: [number, number, number, number][] = [
        [a.x, dx, c.min.x, c.max.x],
        [a.y, dy, c.min.y, c.max.y],
        [a.z, dz, c.min.z, c.max.z],
      ];
      let ok = true;
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < mn || o > mx) {
            ok = false;
            break;
          }
        } else {
          let ta = (mn - o) / d, tb = (mx - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) {
            ok = false;
            break;
          }
        }
      }
      if (ok && t1 > 0.02 && t0 < 0.98) return true;
    }
    return false;
  }

  /** is a point inside any enabled collider (for nav grid) */
  solidAt(x: number, z: number, y0: number, y1: number, r: number): boolean {
    const list = this.query(x - r, z - r, x + r, z + r);
    for (const b of list) {
      if (b.tag === 'door' || b.tag === 'nonav-ignore') continue;
      if (b.max.y <= y0 || b.min.y >= y1) continue;
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      return true;
    }
    return false;
  }

  /** distance along a ray to the first opaque box (or max) */
  rayDist(o: THREE.Vector3, d: THREE.Vector3, max: number): number {
    const ex = o.x + d.x * max, ez = o.z + d.z * max;
    const list = this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez));
    let best = max;
    for (const c of list) {
      if (!c.opaque && c.max.y - c.min.y < 1.2) continue;
      let t0 = 0, t1 = best;
      let ok = true;
      const axes: [number, number, number, number][] = [
        [o.x, d.x, c.min.x, c.max.x],
        [o.y, d.y, c.min.y, c.max.y],
        [o.z, d.z, c.min.z, c.max.z],
      ];
      for (const [oo, dd, mn, mx] of axes) {
        if (Math.abs(dd) < 1e-9) {
          if (oo < mn || oo > mx) { ok = false; break; }
        } else {
          let ta = (mn - oo) / dd, tb = (mx - oo) / dd;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 > 0.05 && t0 < best) best = t0;
    }
    // ground plane
    if (d.y < -1e-4) best = Math.min(best, (0 - o.y) / d.y);
    return best;
  }
}
