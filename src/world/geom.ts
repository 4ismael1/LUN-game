import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Box geometry whose UVs are in world meters (no stretched textures). */
export function uvBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h], [d, h], // +x -x
    [w, d], [w, d], // +y -y
    [w, h], [w, h], // +z -z
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

export function uvPlane(w: number, h: number, sx = 1, sy = 1): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * sx, uv.getY(i) * h * sy);
  return g;
}

/** Cylinder with UV scaled by circumference / height in meters. */
export function uvCylinder(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}

function ensureAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  // strip other attrs for merge compatibility
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  geo.clearGroups();
  return geo;
}

/**
 * Collects transformed geometry per material/chunk and merges into a few draw calls.
 */
export class Batcher {
  private parts = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; chunk: string; cast: boolean; receive: boolean }>();
  private m = new THREE.Matrix4();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3Like, rotY = 0, chunk = 'plaza', cast = true, receive = true, scale?: THREE.Vector3Like, rot?: THREE.Euler) {
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(rot);
    else q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.m.compose(new THREE.Vector3(pos.x, pos.y, pos.z), q, scale ? new THREE.Vector3(scale.x, scale.y, scale.z) : new THREE.Vector3(1, 1, 1));
    this.addMatrix(geo, mat, this.m, chunk, cast, receive);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4, chunk = 'plaza', cast = true, receive = true) {
    const g = ensureAttrs(geo.clone());
    g.applyMatrix4(matrix);
    const key = chunk + '|' + mat.uuid + '|' + (cast ? 1 : 0);
    let p = this.parts.get(key);
    if (!p) {
      p = { mat, geos: [], chunk, cast, receive };
      this.parts.set(key, p);
    }
    p.geos.push(g);
  }

  build(): Map<string, THREE.Group> {
    const groups = new Map<string, THREE.Group>();
    for (const p of this.parts.values()) {
      if (!p.geos.length) continue;
      const merged = mergeGeometries(p.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, p.mat);
      mesh.castShadow = p.cast;
      mesh.receiveShadow = p.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      let g = groups.get(p.chunk);
      if (!g) {
        g = new THREE.Group();
        g.name = 'chunk:' + p.chunk;
        groups.set(p.chunk, g);
      }
      g.add(mesh);
      p.geos.forEach((x) => x.dispose());
    }
    this.parts.clear();
    return groups;
  }
}

/** Catenary-ish sag curve points between a and b */
export function sagPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

export function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
