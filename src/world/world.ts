import * as THREE from 'three';
import { Batcher, uvBox } from './geom';
import { CollisionWorld, Collider } from './colliders';
import { Materials } from './materials';
import { LightManager, LampSource, Flicker } from './lights';
import { Assets } from '../core/assets';
import { lightPool, glowSprite } from './canvasTex';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  prompt: string | (() => string);
  enabled: () => boolean;
  onUse: () => void;
  /** max use distance */
  reach?: number;
  hold?: number;
}

export interface Zone {
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  indoor: boolean;
  reverb: [number, number, number];
  fog: number;
  priority: number;
  footstep: 'stone' | 'wood' | 'tile' | 'grass';
}

export interface HideSpot {
  id: string;
  inside: THREE.Vector3;
  exit: THREE.Vector3;
  yaw: number;
  kind: 'wardrobe' | 'confessional' | 'stall' | 'understage' | 'locker';
  enabled: () => boolean;
}

export class Door {
  angle = 0;
  target = 0;
  locked = false;
  lockedMsg = 'Está cerrada.';
  speed = 2.2;
  collider: Collider;
  onOpen?: () => void;
  openedOnce = false;
  sound: 'wood' | 'iron' | 'shutter' = 'wood';
  /** true: door can't be operated by the player at all (scripted) */
  scripted = false;
  constructor(
    public id: string,
    public pivot: THREE.Object3D,
    public width: number,
    public height: number,
    public openAngle: number,
    public axis: 'x' | 'z',
    public hingePos: THREE.Vector3,
    colliders: CollisionWorld,
    public thickness = 0.12,
  ) {
    this.collider = colliders.add(new THREE.Vector3(), new THREE.Vector3(), { dynamic: true, tag: 'door', opaque: true });
    this.updateCollider();
  }
  get isOpen() {
    return Math.abs(this.target) > 0.01;
  }
  updateCollider() {
    // door slab from hinge along local +x rotated by (base rot + angle)
    const base = this.pivot.userData.baseRot ?? 0;
    const a = base + this.angle;
    const dx = Math.cos(a) * this.width;
    const dz = -Math.sin(a) * this.width;
    const x0 = this.hingePos.x, z0 = this.hingePos.z;
    const x1 = x0 + dx, z1 = z0 + dz;
    const t = this.thickness / 2 + 0.02;
    this.collider.min.set(Math.min(x0, x1) - t, this.hingePos.y, Math.min(z0, z1) - t);
    this.collider.max.set(Math.max(x0, x1) + t, this.hingePos.y + this.height, Math.max(z0, z1) + t);
    this.collider.opaque = Math.abs(this.angle) < 0.3;
  }
  update(dt: number) {
    if (Math.abs(this.angle - this.target) < 0.001) return;
    const s = this.speed * dt;
    this.angle += Math.max(-s, Math.min(s, this.target - this.angle));
    this.pivot.rotation.y = (this.pivot.userData.baseRot ?? 0) + this.angle;
    this.updateCollider();
  }
  setOpen(open: boolean, instant = false) {
    this.target = open ? this.openAngle : 0;
    if (instant) {
      this.angle = this.target;
      this.pivot.rotation.y = (this.pivot.userData.baseRot ?? 0) + this.angle;
      this.updateCollider();
    }
  }
}

export class World {
  batch = new Batcher();
  col = new CollisionWorld();
  interactables: Interactable[] = [];
  zones: Zone[] = [];
  hides: HideSpot[] = [];
  doors: Door[] = [];
  updaters: ((dt: number, t: number) => void)[] = [];
  chunks = new Map<string, THREE.Group>();
  groups = new Map<string, THREE.Group>();
  lights: LightManager;
  poolTex = lightPool();
  glowTex = glowSprite();
  points = new Map<string, THREE.Vector3>();
  /** objects visible only through the camera (spirit layer = 2) */
  static SPIRIT = 2;
  navBounds = { minX: -70, maxX: 52, minZ: -88, maxZ: 34 };

  constructor(public scene: THREE.Scene, public mats: Materials, public assets: Assets) {
    this.lights = new LightManager(scene, 9, mats.lampOn, mats.lampOff);
  }

  group(name: string): THREE.Group {
    let g = this.groups.get(name);
    if (!g) {
      g = new THREE.Group();
      g.name = name;
      this.scene.add(g);
      this.groups.set(name, g);
    }
    return g;
  }

  /** textured static box, center-bottom anchored; optionally collidable */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, mat: THREE.Material, opts: { col?: boolean; chunk?: string; rotY?: number; cast?: boolean; opaque?: boolean; tag?: string } = {}) {
    this.batch.add(uvBox(w, h, d), mat, { x: cx, y: y0 + h / 2, z: cz }, opts.rotY ?? 0, opts.chunk ?? 'plaza', opts.cast ?? true);
    if (opts.col) return this.col.addBox(cx, y0, cz, w, h, d, { rotY: opts.rotY, opaque: opts.opaque, tag: opts.tag });
    return null;
  }

  /** box by min/max corners */
  boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, opts: { col?: boolean; chunk?: string; cast?: boolean; opaque?: boolean } = {}) {
    return this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), mat, opts);
  }

  solid(cx: number, y0: number, cz: number, w: number, h: number, d: number, opts: { opaque?: boolean; tag?: string } = {}) {
    return this.col.addBox(cx, y0, cz, w, h, d, opts);
  }

  geo(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3Like, rotY = 0, chunk = 'plaza', cast = true, scale?: THREE.Vector3Like, rot?: THREE.Euler) {
    this.batch.add(geo, mat, pos, rotY, chunk, cast, true, scale, rot);
  }

  interact(i: Interactable) {
    this.interactables.push(i);
    return i;
  }

  zone(name: string, x0: number, z0: number, x1: number, z1: number, opts: Partial<Zone> & { y0?: number; y1?: number } = {}) {
    this.zones.push({
      name,
      min: new THREE.Vector3(Math.min(x0, x1), opts.y0 ?? -5, Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), opts.y1 ?? 60, Math.max(z0, z1)),
      indoor: opts.indoor ?? false,
      reverb: opts.reverb ?? [0.05, 0.08, 0],
      fog: opts.fog ?? 1,
      priority: opts.priority ?? 1,
      footstep: opts.footstep ?? 'stone',
    });
  }

  zoneAt(p: THREE.Vector3): Zone | null {
    let best: Zone | null = null;
    for (const z of this.zones) {
      if (p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z) {
        if (!best || z.priority > best.priority) best = z;
      }
    }
    return best;
  }

  /** register a lamp: emissive bulb mesh + ground pool + pooled point light */
  lamp(id: string, pos: THREE.Vector3, opts: { color?: THREE.ColorRepresentation; intensity?: number; distance?: number; flicker?: Flicker; group?: string; bulb?: THREE.Mesh | null; poolY?: number | null; poolSize?: number; on?: boolean; priority?: number; halo?: boolean; parent?: THREE.Object3D; zone?: string } = {}): LampSource {
    const emissives: THREE.Mesh[] = [];
    if (opts.bulb) emissives.push(opts.bulb);
    const pools: THREE.Object3D[] = [];
    const color = new THREE.Color(opts.color ?? 0xffb35c);
    if (opts.poolY !== null && opts.poolY !== undefined) {
      const size = opts.poolSize ?? 7;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: this.poolTex, color: color.clone().multiplyScalar(0.5), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, opts.poolY + 0.02, pos.z);
      m.userData.baseOpacity = 0.4;
      m.renderOrder = 1;
      (opts.parent ?? this.group('pools')).add(m);
      pools.push(m);
    }
    if (opts.halo !== false) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.position.copy(pos);
      s.scale.setScalar(1.3);
      s.userData.baseOpacity = 0.55;
      (opts.parent ?? this.group('halos')).add(s);
      pools.push(s);
    }
    return this.lights.add(id, pos, color, opts.intensity ?? 6, opts.distance ?? 14, { flicker: opts.flicker, group: opts.group, emissives, pools, on: opts.on, priority: opts.priority, zone: opts.zone });
  }

  /** place a GLB prop normalized to height; returns object (or null if missing) */
  prop(model: string, x: number, y: number, z: number, rotY: number, height: number, opts: { col?: [number, number, number] | boolean; parent?: THREE.Object3D; width?: number; shadows?: boolean } = {}): THREE.Object3D | null {
    const shadows = opts.shadows ?? height >= 1.6;
    const o = this.assets.instance(model, opts.width ? { width: opts.width, shadows } : { height, shadows });
    if (!o) return null;
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    (opts.parent ?? this.group('props')).add(o);
    if (opts.col) {
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      if (Array.isArray(opts.col)) this.col.addBox(x, y, z, opts.col[0], opts.col[1], opts.col[2], { rotY });
      else this.col.add(b.min, b.max, { opaque: b.max.y - b.min.y > 1.4 });
    }
    return o;
  }

  finalize() {
    const built = this.batch.build();
    for (const [name, g] of built) {
      const existing = this.chunks.get(name);
      if (existing) {
        [...g.children].forEach((c) => existing.add(c));
      } else {
        this.scene.add(g);
        this.chunks.set(name, g);
      }
    }
  }

  private cullItems: { o: THREE.Object3D; c: THREE.Vector3; r: number }[] = [];
  private cullT = 0;
  /** distance-cull small scattered objects (props, bulbs, signs…) to save draw calls */
  setupCulling(groupNames: string[]) {
    for (const n of groupNames) {
      const grp = this.groups.get(n);
      if (!grp) continue;
      for (const o of grp.children) {
        if (o.userData.noCull) continue;
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) continue;
        const sph = b.getBoundingSphere(new THREE.Sphere());
        this.cullItems.push({ o, c: sph.center, r: sph.radius });
      }
    }
  }
  cull(cam: THREE.Vector3, maxD: number) {
    for (const it of this.cullItems) it.o.visible = it.c.distanceTo(cam) - it.r < maxD;
  }

  update(dt: number, t: number) {
    for (const d of this.doors) d.update(dt);
    for (const u of this.updaters) u(dt, t);
  }
}
