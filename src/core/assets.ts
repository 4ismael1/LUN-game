import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AudioEngine } from '../audio/audio';

export const BASE = './assets/';

/**
 * Physical materials (transmission glass, clearcoat) force an extra full-scene render
 * pass every frame and add shader variants; plain standard materials look the same at night.
 */
function simplifyMaterials(root: THREE.Object3D) {
  const swap = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const conv = (m: THREE.Material) => {
      const p = m as THREE.MeshPhysicalMaterial;
      if (!p.isMeshPhysicalMaterial) return m;
      let s = swap.get(m);
      if (!s) {
        const glass = p.transmission > 0 || p.transparent;
        const std = new THREE.MeshStandardMaterial({
          name: p.name,
          color: p.color,
          map: p.map,
          normalMap: p.normalMap,
          roughness: p.roughness,
          roughnessMap: p.roughnessMap,
          metalness: p.metalness,
          metalnessMap: p.metalnessMap,
          emissive: p.emissive,
          emissiveMap: p.emissiveMap,
          emissiveIntensity: p.emissiveIntensity,
          alphaMap: p.alphaMap,
          alphaTest: p.alphaTest,
          side: p.side,
          transparent: glass,
          opacity: glass ? Math.min(p.opacity, 0.45) : p.opacity,
          depthWrite: !glass,
        });
        swap.set(m, std);
        s = std;
      }
      return s;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
  });
}

export class Assets {
  textures = new Map<string, THREE.Texture>();
  models = new Map<string, GLTF>();
  hdr: THREE.DataTexture | null = null;
  missing: string[] = [];
  private texLoader = new THREE.TextureLoader();
  private gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private modelInfo = new Map<string, { box: THREE.Box3; size: THREE.Vector3 }>();

  async loadAll(
    list: { textures: string[]; models: string[]; audio: string[]; hdr?: string },
    audio: AudioEngine,
    onProgress: (f: number, label: string) => void,
  ) {
    const jobs: { label: string; run: () => Promise<void>; w: number }[] = [];
    for (const t of list.textures)
      jobs.push({
        label: 'texturas',
        w: 1,
        run: async () => {
          try {
            const tx = await this.texLoader.loadAsync(BASE + 'textures/' + t);
            this.textures.set(t, tx);
          } catch {
            this.missing.push('textures/' + t);
          }
        },
      });
    for (const m of list.models)
      jobs.push({
        label: 'modelos',
        w: 2,
        run: async () => {
          try {
            const g = await this.gltfLoader.loadAsync(BASE + 'models/' + m + '.glb');
            simplifyMaterials(g.scene);
            this.models.set(m, g);
          } catch {
            this.missing.push('models/' + m);
          }
        },
      });
    for (const a of list.audio)
      jobs.push({
        label: 'sonido',
        w: 1,
        run: async () => {
          try {
            await audio.load(a, BASE + 'audio/' + a + '.mp3');
          } catch {
            this.missing.push('audio/' + a);
          }
        },
      });
    if (list.hdr)
      jobs.push({
        label: 'cielo',
        w: 2,
        run: async () => {
          try {
            this.hdr = await new RGBELoader().loadAsync(BASE + 'textures/' + list.hdr);
          } catch {
            this.missing.push('hdr');
          }
        },
      });
    const total = jobs.reduce((s, j) => s + j.w, 0);
    let done = 0;
    // limited concurrency
    let idx = 0;
    const worker = async () => {
      while (idx < jobs.length) {
        const j = jobs[idx++];
        await j.run();
        done += j.w;
        onProgress(done / total, j.label);
      }
    };
    await Promise.all(new Array(6).fill(0).map(worker));
    if (this.missing.length) console.warn('[assets] missing:', this.missing);
  }

  /** Load sounds that aren't needed for the title / first minutes, without blocking. */
  loadAudioBackground(names: string[], audio: AudioEngine, concurrency = 3): Promise<void> {
    let idx = 0;
    const worker = async () => {
      while (idx < names.length) {
        const a = names[idx++];
        if (audio.has(a)) continue;
        try {
          await audio.load(a, BASE + 'audio/' + a + '.mp3');
        } catch {
          this.missing.push('audio/' + a);
        }
      }
    };
    return Promise.all(new Array(concurrency).fill(0).map(worker)).then(() => undefined);
  }

  tex(name: string) {
    return this.textures.get(name);
  }

  has(model: string) {
    return this.models.has(model);
  }

  info(model: string) {
    let i = this.modelInfo.get(model);
    if (!i) {
      const g = this.models.get(model);
      if (!g) return null;
      g.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g.scene);
      i = { box, size: box.getSize(new THREE.Vector3()) };
      this.modelInfo.set(model, i);
    }
    return i;
  }

  /**
   * Clone a model normalized so its height (or largest horizontal size) equals the given size,
   * with its base centered on the origin.
   */
  instance(model: string, opts: { height?: number; width?: number; skinned?: boolean; shadows?: boolean } = {}): THREE.Object3D | null {
    const g = this.models.get(model);
    if (!g) return null;
    const info = this.info(model)!;
    const src = g.scene;
    const obj = opts.skinned ? SkeletonUtils.clone(src) : src.clone(true);
    let s = 1;
    if (opts.height) s = opts.height / Math.max(0.001, info.size.y);
    else if (opts.width) s = opts.width / Math.max(0.001, Math.max(info.size.x, info.size.z));
    const wrap = new THREE.Group();
    const c = info.box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x * s, -info.box.min.y * s, -c.z * s);
    obj.scale.setScalar(s);
    wrap.add(obj);
    wrap.userData.scale = s;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = opts.shadows ?? true;
        m.receiveShadow = true;
        if (!opts.skinned) m.matrixAutoUpdate = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && mat.map) mat.map.anisotropy = 4;
      }
    });
    return wrap;
  }

  /** Build InstancedMeshes for many copies of a static model. */
  instanced(model: string, transforms: { pos: THREE.Vector3; rotY: number; scale?: number }[], opts: { height?: number; width?: number; shadows?: boolean } = {}): THREE.Group | null {
    const g = this.models.get(model);
    if (!g || !transforms.length) return null;
    const info = this.info(model)!;
    let s = 1;
    if (opts.height) s = opts.height / Math.max(0.001, info.size.y);
    else if (opts.width) s = opts.width / Math.max(0.001, Math.max(info.size.x, info.size.z));
    const c = info.box.getCenter(new THREE.Vector3());
    const norm = new THREE.Matrix4().compose(new THREE.Vector3(-c.x * s, -info.box.min.y * s, -c.z * s), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    const group = new THREE.Group();
    g.scene.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.scene.matrixWorld).invert();
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const im = new THREE.InstancedMesh(m.geometry, m.material, transforms.length);
      const q = new THREE.Quaternion();
      const tm = new THREE.Matrix4();
      transforms.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rotY);
        const sc = t.scale ?? 1;
        tm.compose(t.pos, q, new THREE.Vector3(sc, sc, sc));
        tm.multiply(norm).multiply(local);
        im.setMatrixAt(i, tm);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = opts.shadows ?? true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    });
    return group;
  }
}
