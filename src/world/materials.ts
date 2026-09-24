import * as THREE from 'three';
import { talavera, stripes } from './canvasTex';

export interface TexSet {
  diff?: THREE.Texture;
  nor?: THREE.Texture;
  rough?: THREE.Texture;
  ao?: THREE.Texture;
  alpha?: THREE.Texture;
}

export const TEXTURE_SETS = [
  'cobble', 'plaster', 'plaster_old', 'cantera', 'stone_floor', 'terracotta', 'wood', 'wood_door',
  'metal_rust', 'ground', 'grass', 'bark', 'concrete', 'fabric_dark', 'roof_tiles',
];

function fallbackTex(color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Materials {
  sets = new Map<string, TexSet>();
  private cache = new Map<string, THREE.Material>();
  envMap: THREE.Texture | null = null;
  /** global uniforms shared by animated materials */
  uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0.4 },
  };

  setTextures(name: string, set: TexSet) {
    for (const t of Object.values(set)) {
      if (!t) continue;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    if (set.diff) set.diff.colorSpace = THREE.SRGBColorSpace;
    this.sets.set(name, set);
  }

  /** textured PBR material; repeat = tiles per meter */
  pbr(set: string, opts: { color?: THREE.ColorRepresentation; repeat?: number; rough?: number; metal?: number; normalScale?: number; emissive?: THREE.ColorRepresentation; key?: string; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
    const key = opts.key ?? `${set}|${opts.color ?? ''}|${opts.repeat ?? ''}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.normalScale ?? ''}|${opts.emissive ?? ''}|${opts.side ?? ''}`;
    const c = this.cache.get(key);
    if (c) return c as THREE.MeshStandardMaterial;
    const ts = this.sets.get(set);
    const rep = opts.repeat ?? 0.5;
    const clone = (t?: THREE.Texture) => {
      if (!t) return null;
      const n = t.clone();
      n.repeat.set(rep, rep);
      n.needsUpdate = true;
      return n;
    };
    const m = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: ts ? clone(ts.diff) : fallbackTex('#8a8278'),
      normalMap: ts ? clone(ts.nor) : null,
      roughnessMap: ts ? clone(ts.rough) : null,
      aoMap: null,
      roughness: opts.rough ?? 1,
      metalness: opts.metal ?? 0,
      side: opts.side ?? THREE.FrontSide,
    });
    if (!ts?.diff) (m.map as THREE.Texture).repeat.set(rep, rep);
    if (m.normalMap) m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    if (this.envMap) {
      m.envMap = this.envMap;
      m.envMapIntensity = 0.25;
    }
    this.cache.set(key, m);
    return m;
  }

  flat(color: THREE.ColorRepresentation, opts: { rough?: number; metal?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; key?: string; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
    const key = opts.key ?? `flat|${color}|${opts.rough}|${opts.metal}|${opts.emissive}|${opts.emissiveIntensity}|${opts.opacity}|${opts.side}`;
    const c = this.cache.get(key);
    if (c) return c as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    if (this.envMap) {
      m.envMap = this.envMap;
      m.envMapIntensity = 0.3;
    }
    this.cache.set(key, m);
    return m;
  }

  get(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  // ---- named materials ----
  get cobble() {
    return this.pbr('cobble', { repeat: 0.45, rough: 0.78, color: 0xb8aea0, normalScale: 1.2 });
  }
  get sidewalk() {
    return this.pbr('cantera', { repeat: 0.5, rough: 0.85, color: 0xb59c8a });
  }
  plaster(color: THREE.ColorRepresentation) {
    return this.pbr('plaster', { repeat: 0.33, color, rough: 1 });
  }
  plasterOld(color: THREE.ColorRepresentation) {
    return this.pbr('plaster_old', { repeat: 0.3, color, rough: 1 });
  }
  get cantera() {
    return this.pbr('cantera', { repeat: 0.6, color: 0xe0b7a2, rough: 0.95 });
  }
  get canteraDark() {
    return this.pbr('cantera', { repeat: 0.6, color: 0xa88372, rough: 0.95 });
  }
  get stoneFloor() {
    return this.pbr('stone_floor', { repeat: 0.4, rough: 0.55, color: 0xcfc6b8 });
  }
  get terracotta() {
    return this.pbr('terracotta', { repeat: 0.6, rough: 0.8 });
  }
  get wood() {
    return this.pbr('wood', { repeat: 0.5, rough: 0.8, color: 0xa08470 });
  }
  get woodDark() {
    return this.pbr('wood', { repeat: 0.5, rough: 0.7, color: 0x5a4030 });
  }
  get woodDoor() {
    return this.pbr('wood_door', { repeat: 0.8, rough: 0.7, color: 0xc0a090 });
  }
  get rust() {
    return this.pbr('metal_rust', { repeat: 0.8, rough: 0.7, metal: 0.4 });
  }
  get iron() {
    return this.flat(0x1b1d1f, { rough: 0.55, metal: 0.7, key: 'iron' });
  }
  get ironGreen() {
    return this.flat(0x23352c, { rough: 0.5, metal: 0.6, key: 'ironGreen' });
  }
  get bronze() {
    return this.flat(0x5a4a30, { rough: 0.35, metal: 0.9, key: 'bronze' });
  }
  get gold() {
    return this.flat(0xa8812f, { rough: 0.35, metal: 1, key: 'gold' });
  }
  get ground() {
    return this.pbr('ground', { repeat: 0.4, rough: 1, color: 0x9a8a7a });
  }
  get grass() {
    return this.pbr('grass', { repeat: 0.35, rough: 1, color: 0x7a8f68 });
  }
  get bark() {
    return this.pbr('bark', { repeat: 1, rough: 1, color: 0x9a8a80 });
  }
  get concrete() {
    return this.pbr('concrete', { repeat: 0.4, rough: 0.95 });
  }
  get roofTiles() {
    return this.pbr('roof_tiles', { repeat: 0.5, rough: 0.8 });
  }
  get glassDark() {
    return this.flat(0x0b0f14, { rough: 0.1, metal: 0.2, key: 'glassDark' });
  }
  get glassWarm() {
    return this.flat(0x2a1a0a, { rough: 0.2, emissive: 0xffb060, emissiveIntensity: 0.9, key: 'glassWarm' });
  }
  get glassCool() {
    return this.flat(0x0a1016, { rough: 0.2, emissive: 0x9fd0ff, emissiveIntensity: 0.25, key: 'glassCool' });
  }
  get lampOn() {
    return this.flat(0xfff0d0, { emissive: 0xffc070, emissiveIntensity: 3.2, key: 'lampOn' });
  }
  get lampOff() {
    return this.flat(0x30302a, { rough: 0.3, key: 'lampOff' });
  }
  get talavera() {
    return this.get('talavera', () => {
      const t = talavera(1);
      t.repeat.set(2, 2);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.3 });
    }) as THREE.MeshStandardMaterial;
  }
  lona(colors: string[]) {
    return this.get('lona|' + colors.join(','), () => {
      const t = stripes(colors);
      t.repeat.set(0.5, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
    }) as THREE.MeshStandardMaterial;
  }
}
