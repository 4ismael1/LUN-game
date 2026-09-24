import * as THREE from 'three';
import { World, Door } from '../world/world';
import { NavGrid } from './nav';
import { makeCanvasTex, flameTexture } from '../world/canvasTex';
import { LampSource } from '../world/lights';

export type EState = 'inactive' | 'apparition' | 'patrol' | 'observe' | 'investigate' | 'search' | 'chase' | 'lost' | 'return' | 'scripted';

export interface PerceptInput {
  playerPos: THREE.Vector3;
  playerEye: THREE.Vector3;
  playerHidden: boolean;
  playerCrouch: boolean;
  flashlightOn: boolean;
  playerForward: THREE.Vector3;
  noise: { pos: THREE.Vector3; radius: number; kind: string }[];
  playerLit: number;
}

function buildMesh(w: World) {
  const g = new THREE.Group();
  const m = w.mats;
  const cloth = m.sets.get('fabric_dark');
  const dressMat = new THREE.MeshStandardMaterial({
    color: 0x1a1318,
    map: cloth?.diff ?? null,
    normalMap: cloth?.nor ?? null,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  dressMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.uniforms.uTime;
    sh.uniforms.uMove = { value: 0 };
    (dressMat as any).userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uMove;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float k = clamp(1.0 - position.y / 1.3, 0.0, 1.0);
       float a = atan(position.z, position.x);
       transformed.x += sin(uTime * 2.1 + a * 3.0) * 0.03 * k + k * k * uMove * 0.12;
       transformed.z += cos(uTime * 1.7 + a * 5.0) * 0.03 * k;`,
    );
  };
  // dress: lathe profile with folds
  const prof: THREE.Vector2[] = [];
  const pts = [[0.62, 0], [0.6, 0.12], [0.5, 0.5], [0.36, 0.95], [0.2, 1.3], [0.19, 1.45], [0.23, 1.72], [0.24, 1.86], [0.12, 1.95], [0.06, 1.98]];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const dressGeo = new THREE.LatheGeometry(prof, 40);
  const pos = dressGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const fold = 1 + 0.06 * Math.sin(a * 11) * Math.max(0, 1 - y / 1.3) + 0.02 * Math.sin(a * 23);
    pos.setX(i, x * fold);
    pos.setZ(i, z * fold);
  }
  dressGeo.computeVertexNormals();
  const dress = new THREE.Mesh(dressGeo, dressMat);
  dress.castShadow = true;
  g.add(dress);
  // rebozo (striped shawl) over shoulders and hanging down the back
  const rebozoTex = makeCanvasTex(256, 256, (c) => {
    c.fillStyle = '#3a0c18';
    c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      c.fillStyle = y % 32 === 0 ? '#5a1424' : '#240812';
      c.fillRect(0, y, 256, 8);
    }
    for (let x = 0; x < 256; x += 6) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x, 0, 2, 256);
    }
    c.fillStyle = '#b08a4a';
    for (let x = 0; x < 256; x += 8) c.fillRect(x, 240, 3, 16);
  });
  rebozoTex.wrapS = rebozoTex.wrapT = THREE.RepeatWrapping;
  const rebozoMat = new THREE.MeshStandardMaterial({ map: rebozoTex, roughness: 0.9, side: THREE.DoubleSide });
  const reb = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.46, 0.75, 24, 3, true, Math.PI * 0.15, Math.PI * 1.7), rebozoMat);
  reb.position.y = 1.55;
  reb.rotation.y = Math.PI * 0.5;
  reb.castShadow = true;
  g.add(reb);
  // neck & head (elongated)
  const skin = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.55 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.28, 10), skin);
  neck.position.y = 2.06;
  g.add(neck);
  const head = new THREE.Group();
  head.position.y = 2.22;
  g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0x0c0a0c, roughness: 1 }));
  skull.scale.set(1, 1.15, 1);
  head.add(skull);
  // porcelain mask with painted closed eyes, cracks
  const maskTex = makeCanvasTex(256, 256, (c) => {
    const grd = c.createRadialGradient(128, 110, 20, 128, 128, 150);
    grd.addColorStop(0, '#f2ebe0');
    grd.addColorStop(1, '#c8bfb0');
    c.fillStyle = grd;
    c.fillRect(0, 0, 256, 256);
    // cheeks
    c.fillStyle = 'rgba(190,60,70,0.35)';
    c.beginPath();
    c.arc(70, 160, 26, 0, Math.PI * 2);
    c.arc(186, 160, 26, 0, Math.PI * 2);
    c.fill();
    // closed painted eyes with long lashes
    c.strokeStyle = '#1a1212';
    c.lineWidth = 5;
    for (const ex of [82, 174]) {
      c.beginPath();
      c.arc(ex, 118, 26, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      c.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const a = 0.2 * Math.PI + (i / 6) * 0.6 * Math.PI;
        c.beginPath();
        c.moveTo(ex + Math.cos(a) * 26, 118 + Math.sin(a) * 26);
        c.lineTo(ex + Math.cos(a) * 36, 118 + Math.sin(a) * 38);
        c.stroke();
      }
      c.lineWidth = 5;
    }
    // dark tear lines
    c.strokeStyle = 'rgba(30,20,20,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(80, 146);
    c.bezierCurveTo(78, 170, 84, 190, 80, 220);
    c.moveTo(176, 146);
    c.bezierCurveTo(178, 175, 172, 196, 176, 214);
    c.stroke();
    // small red lips
    c.fillStyle = '#7a1a22';
    c.beginPath();
    c.ellipse(128, 200, 16, 7, 0, 0, Math.PI * 2);
    c.fill();
    // cracks
    c.strokeStyle = 'rgba(40,30,25,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(150, 20);
    c.lineTo(140, 60);
    c.lineTo(160, 90);
    c.lineTo(150, 120);
    c.moveTo(140, 60);
    c.lineTo(110, 70);
    c.stroke();
  });
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 14, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.15, Math.PI * 0.7), new THREE.MeshStandardMaterial({ map: maskTex, roughness: 0.3, metalness: 0.05, emissive: 0x302820, emissiveMap: maskTex, emissiveIntensity: 0.25 }));
  mask.rotation.y = Math.PI / 2;
  mask.position.z = 0.012;
  mask.scale.set(1.02, 1.18, 1.05);
  head.add(mask);
  // black lace veil
  const laceTex = makeCanvasTex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(10,8,10,0.95)';
    c.lineWidth = 2;
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
      c.beginPath();
      c.arc(x + 8, y + 8, 6, 0, Math.PI * 2);
      c.stroke();
    }
    for (let y = 0; y < 256; y += 32) {
      c.beginPath();
      for (let x = 0; x <= 256; x += 8) c.lineTo(x, y + Math.sin(x * 0.2) * 5);
      c.stroke();
    }
    c.fillStyle = 'rgba(8,6,8,0.4)';
    c.fillRect(0, 0, 256, 256);
  });
  laceTex.wrapS = laceTex.wrapT = THREE.RepeatWrapping;
  laceTex.repeat.set(3, 2);
  const veilMat = new THREE.MeshStandardMaterial({ map: laceTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 1, color: 0x2a2228, depthWrite: false });
  const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.42, 1.1, 24, 6, true), veilMat);
  veil.position.y = 1.78;
  g.add(veil);
  const veilCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), veilMat);
  veilCap.position.y = 2.28;
  veilCap.scale.set(1, 1.1, 1);
  g.add(veilCap);
  // comb (peineta) behind the head
  const comb = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x0a0808, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
  comb.position.set(0, 2.35, -0.08);
  g.add(comb);
  // arms: long, thin
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.25, 1.82, 0.02);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.55, 8), dressMat);
    upper.position.y = -0.27;
    arm.add(upper);
    const fore = new THREE.Group();
    fore.position.y = -0.55;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.5, 8), skin);
    lower.position.y = -0.25;
    fore.add(lower);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.025), skin);
    hand.position.y = -0.56;
    fore.add(hand);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.13, 4), skin);
      finger.position.set(-0.022 + f * 0.015, -0.7, 0);
      fore.add(finger);
    }
    arm.add(fore);
    arm.userData.fore = fore;
    g.add(arm);
    arms.push(arm);
  }
  // veladora (votive candle) in the right hand
  const candle = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x8a1a1a, emissive: 0xff3a20, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
  candle.add(glass);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: 0xff9a50, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.scale.set(0.05, 0.11, 1);
  flame.position.y = 0.1;
  candle.add(flame);
  candle.position.set(0, -0.72, 0.05);
  arms[1].userData.fore.add(candle);
  // cascabeles (tiny bells) on the veil hem and dress hem
  const bellGeo = new THREE.SphereGeometry(0.018, 6, 5);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 1, roughness: 0.3 });
  const bells = new THREE.InstancedMesh(bellGeo, bellMat, 40);
  for (let i = 0; i < 40; i++) {
    const a = (i / 20) * Math.PI * 2;
    const hem = i < 20;
    const r = hem ? 0.42 : 0.62;
    const y = hem ? 1.25 : 0.04;
    bells.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  g.add(bells);
  g.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh) {
      mm.castShadow = true;
      mm.frustumCulled = false;
    }
  });
  return { g, head, arms, dressMat, candle, veil, mask };
}

export class Entity {
  root = new THREE.Group();
  visual: ReturnType<typeof buildMesh>;
  pos = new THREE.Vector3(0, 0, -200);
  yaw = 0;
  state: EState = 'inactive';
  mode: 'off' | 'apparition' | 'hunt' | 'scripted' = 'off';
  path: THREE.Vector3[] = [];
  pathTimer = 0;
  stateTime = 0;
  target = new THREE.Vector3();
  lastKnown = new THREE.Vector3();
  lastSeenTime = 0;
  seeTime = 0;
  patrolPoints: THREE.Vector3[] = [];
  patrolIdx = 0;
  speed = 0;
  aggression = 1;
  canSeePlayer = false;
  distToPlayer = 999;
  onCatch: () => void = () => {};
  onState: (s: EState, prev: EState) => void = () => {};
  sound: { step: (p: THREE.Vector3, chase: boolean) => void; jingle: (p: THREE.Vector3) => void; scream: (p: THREE.Vector3) => void; door: (d: Door) => void } = { step: () => {}, jingle: () => {}, scream: () => {}, door: () => {} };
  private visPos = new THREE.Vector3();
  private stutter = 0;
  private stepAcc = 0;
  private jingleAcc = 0;
  private headJerk = new THREE.Euler();
  private headJerkTimer = 0;
  private lostTime = 0;
  lamp: LampSource;
  apparitionSpot: THREE.Vector3 | null = null;
  apparitionLook = 0;
  apparitionOnVanish: (() => void) | null = null;
  apparitionMaxTime = 0;
  hiddenSeen = false;
  scriptedPath: THREE.Vector3[] = [];
  scriptedSpeed = 2;
  scriptedDone: (() => void) | null = null;
  searchCenter = new THREE.Vector3();
  catchRadius = 1.05;
  zoneLimit: ((p: THREE.Vector3) => boolean) | null = null;
  private blockedTime = 0;
  forceChaseTime = 0;
  noSafeZones: ((p: THREE.Vector3) => boolean) | null = null;

  constructor(private w: World, private nav: NavGrid) {
    this.visual = buildMesh(w);
    this.root.add(this.visual.g);
    this.root.visible = false;
    w.scene.add(this.root);
    this.lamp = w.lamp('entityCandle', new THREE.Vector3(0, -50, 0), { color: 0xff4a2a, intensity: 2.2, distance: 6, flicker: 'candle', poolY: null, halo: false, priority: 3 });
  }

  setState(s: EState) {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.stateTime = 0;
    this.path = [];
    this.pathTimer = 0;
    this.onState(s, prev);
  }

  place(p: THREE.Vector3, yaw = 0) {
    this.pos.copy(p);
    this.visPos.copy(p);
    this.yaw = yaw;
    this.root.visible = true;
    this.root.position.copy(p);
    this.root.rotation.y = yaw;
  }

  hide() {
    this.root.visible = false;
    this.pos.set(0, -200, 0);
    this.lamp.pos.set(0, -50, 0);
    this.mode = 'off';
    this.setState('inactive');
  }

  /** show her standing somewhere, vanishing when observed for a while or approached */
  apparition(p: THREE.Vector3, faceTo: THREE.Vector3, opts: { maxTime?: number; onVanish?: () => void } = {}) {
    this.mode = 'apparition';
    this.place(p, Math.atan2(faceTo.x - p.x, faceTo.z - p.z));
    this.apparitionSpot = p.clone();
    this.apparitionLook = 0;
    this.apparitionOnVanish = opts.onVanish ?? null;
    this.apparitionMaxTime = opts.maxTime ?? 25;
    this.setState('apparition');
  }

  hunt(spawn: THREE.Vector3, patrol: THREE.Vector3[], aggression = 1) {
    this.mode = 'hunt';
    this.patrolPoints = patrol;
    this.patrolIdx = 0;
    this.aggression = aggression;
    this.place(spawn);
    this.setState('patrol');
  }

  scripted(path: THREE.Vector3[], speed: number, done?: () => void) {
    this.mode = 'scripted';
    if (!this.root.visible) this.place(path[0]);
    this.scriptedPath = path.map((p) => p.clone());
    this.scriptedSpeed = speed;
    this.scriptedDone = done ?? null;
    this.setState('scripted');
  }

  hear(pos: THREE.Vector3, radius: number) {
    if (this.mode !== 'hunt') return;
    const d = pos.distanceTo(this.pos);
    if (d > radius) return;
    if (this.state === 'chase') return;
    this.lastKnown.copy(pos);
    if (this.state !== 'investigate' || d < 6) this.setState('investigate');
    this.target.copy(pos);
  }

  private moveAlong(dt: number, speed: number, dest: THREE.Vector3, repathEvery = 0.6): boolean {
    this.pathTimer -= dt;
    if (this.pathTimer <= 0 || !this.path.length) {
      this.path = this.nav.findPath(this.pos, dest) ?? [dest.clone()];
      this.pathTimer = repathEvery;
    }
    const next = this.path[0];
    if (!next) return true;
    const to = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
    const d = to.length();
    if (d < 0.35) {
      this.path.shift();
      if (!this.path.length) return new THREE.Vector3(dest.x - this.pos.x, 0, dest.z - this.pos.z).length() < 0.8;
      return false;
    }
    this.speed += (speed - this.speed) * Math.min(1, dt * 2.5);
    to.normalize();
    const step = Math.min(d, this.speed * dt);
    const old = this.pos.clone();
    this.pos.addScaledVector(to, step);
    // collide & open doors
    const before = this.pos.clone();
    this.w.col.resolve(this.pos, 0.35, 0.3, 2.3, 0.3);
    if (before.distanceTo(this.pos) > 0.01) {
      this.blockedTime += dt;
      for (const door of this.w.doors) {
        if (door.isOpen || door.scripted) continue;
        const c = door.collider;
        if (this.pos.x > c.min.x - 0.9 && this.pos.x < c.max.x + 0.9 && this.pos.z > c.min.z - 0.9 && this.pos.z < c.max.z + 0.9) {
          if (!door.locked) {
            door.setOpen(true);
            this.sound.door(door);
          }
        }
      }
      if (this.blockedTime > 1.5) {
        this.pathTimer = 0;
        this.blockedTime = 0;
      }
    } else this.blockedTime = 0;
    const tyaw = Math.atan2(to.x, to.z);
    let dy = tyaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, dt * 5);
    void old;
    return false;
  }

  private perceive(p: PerceptInput): boolean {
    const eye = new THREE.Vector3(this.pos.x, 2.1, this.pos.z);
    const toP = p.playerEye.clone().sub(eye);
    const d = toP.length();
    this.distToPlayer = Math.hypot(p.playerPos.x - this.pos.x, p.playerPos.z - this.pos.z);
    if (p.playerHidden) return false;
    let range = 17 * this.aggression;
    if (p.flashlightOn) {
      // flashlight pointed toward her makes the player very visible
      const facing = p.playerForward.dot(eye.clone().sub(p.playerEye).normalize());
      range *= facing > 0.6 ? 1.9 : 1.35;
    }
    if (p.playerCrouch) range *= p.flashlightOn ? 0.85 : 0.55;
    range *= 0.75 + p.playerLit * 0.5;
    if (d > range) return false;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const flat = toP.clone().setY(0).normalize();
    const ang = fwd.dot(flat);
    const cone = this.state === 'chase' || this.state === 'search' ? -0.2 : 0.35;
    if (ang < cone && d > 2.5) return false;
    if (this.w.col.blocked(eye, p.playerEye)) {
      // try chest height too
      const chest = p.playerPos.clone();
      chest.y += 1.0;
      if (this.w.col.blocked(eye, chest)) return false;
    }
    return true;
  }

  update(dt: number, t: number, p: PerceptInput) {
    this.stateTime += dt;
    if (this.state === 'inactive') return;
    const seen = this.mode === 'hunt' ? this.perceive(p) : false;
    this.canSeePlayer = seen;
    this.distToPlayer = Math.hypot(p.playerPos.x - this.pos.x, p.playerPos.z - this.pos.z);
    if (this.mode === 'hunt') {
      for (const n of p.noise) this.hear(n.pos, n.radius * (this.state === 'search' ? 1.3 : 1));
    }
    let moving = false;
    switch (this.state) {
      case 'apparition': {
        // face the player, vanish if watched too long or approached
        const tyaw = Math.atan2(p.playerPos.x - this.pos.x, p.playerPos.z - this.pos.z);
        this.yaw += (tyaw - this.yaw) * Math.min(1, dt * 0.8);
        const toE = new THREE.Vector3(this.pos.x, 1.8, this.pos.z).sub(p.playerEye);
        const look = p.playerForward.dot(toE.clone().normalize());
        const visible = look > 0.93 && !this.w.col.blocked(p.playerEye, new THREE.Vector3(this.pos.x, 1.8, this.pos.z));
        if (visible) this.apparitionLook += dt;
        if (this.apparitionLook > 2.2 || this.distToPlayer < 9 || this.stateTime > this.apparitionMaxTime) {
          const cb = this.apparitionOnVanish;
          this.hide();
          cb?.();
          return;
        }
        break;
      }
      case 'patrol': {
        if (seen) {
          this.lastKnown.copy(p.playerPos);
          this.seeTime += dt;
          if (this.distToPlayer < 12 || this.seeTime > 0.9 / this.aggression) this.setState('chase');
          else if (this.seeTime > 0.25) this.setState('observe');
          break;
        } else this.seeTime = Math.max(0, this.seeTime - dt);
        if (!this.patrolPoints.length) break;
        const dest = this.patrolPoints[this.patrolIdx % this.patrolPoints.length];
        moving = true;
        if (this.moveAlong(dt, 1.15, dest, 2)) {
          this.patrolIdx = (this.patrolIdx + 1 + Math.floor(Math.random() * 2)) % this.patrolPoints.length;
          this.path = [];
        }
        break;
      }
      case 'observe': {
        const tyaw = Math.atan2(p.playerPos.x - this.pos.x, p.playerPos.z - this.pos.z);
        this.yaw += (tyaw - this.yaw) * Math.min(1, dt * 2);
        if (seen) {
          this.lastKnown.copy(p.playerPos);
          this.seeTime += dt;
        }
        if (this.stateTime > 1.8 / this.aggression) this.setState(seen || this.seeTime > 0.8 ? 'chase' : 'investigate');
        if ((this.state as EState) === 'investigate') this.target.copy(this.lastKnown);
        break;
      }
      case 'investigate': {
        if (seen) {
          this.lastKnown.copy(p.playerPos);
          this.setState(this.distToPlayer < 15 ? 'chase' : 'observe');
          break;
        }
        moving = true;
        if (this.moveAlong(dt, 1.9 * this.aggression, this.target, 1.0) || this.stateTime > 20) {
          this.searchCenter.copy(this.pos);
          this.setState('search');
        }
        break;
      }
      case 'search': {
        if (seen) {
          this.lastKnown.copy(p.playerPos);
          this.setState('chase');
          break;
        }
        if (!this.path.length || this.pathTimer < -3) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
          this.target.set(this.searchCenter.x + Math.cos(a) * r, 0, this.searchCenter.z + Math.sin(a) * r);
          this.path = this.nav.findPath(this.pos, this.target) ?? [];
          this.pathTimer = 99;
        }
        moving = true;
        if (this.path.length) {
          const reached = this.moveAlong(dt, 1.3, this.path[this.path.length - 1], 99);
          if (reached) this.path = [];
        }
        if (this.stateTime > 14) this.setState('return');
        break;
      }
      case 'chase': {
        if (seen || this.forceChaseTime > 0) {
          this.lastKnown.copy(p.playerPos);
          this.lastSeenTime = t;
          this.lostTime = 0;
        } else this.lostTime += dt;
        this.forceChaseTime = Math.max(0, this.forceChaseTime - dt);
        moving = true;
        const sp = (3.4 + Math.min(1.1, this.stateTime * 0.12)) * this.aggression;
        this.moveAlong(dt, sp, this.lastKnown, 0.35);
        if (this.lostTime > 4.5 && new THREE.Vector3(this.lastKnown.x - this.pos.x, 0, this.lastKnown.z - this.pos.z).length() < 1.5) {
          this.searchCenter.copy(this.pos);
          this.setState('lost');
        } else if (this.lostTime > 10) {
          this.searchCenter.copy(this.lastKnown);
          this.setState('search');
        }
        // catch
        if (this.distToPlayer < this.catchRadius && !p.playerHidden && Math.abs(p.playerPos.y - this.pos.y) < 2.2) {
          this.onCatch();
          return;
        }
        break;
      }
      case 'lost': {
        // looks around, head turning
        if (seen) {
          this.setState('chase');
          break;
        }
        this.yaw += Math.sin(this.stateTime * 2.2) * dt * 1.4;
        if (this.stateTime > 4) this.setState('search');
        break;
      }
      case 'return': {
        if (seen) {
          this.setState('chase');
          break;
        }
        moving = true;
        const dest = this.patrolPoints[this.patrolIdx % Math.max(1, this.patrolPoints.length)] ?? this.pos;
        if (this.moveAlong(dt, 1.2, dest, 1.5)) this.setState('patrol');
        break;
      }
      case 'scripted': {
        const next = this.scriptedPath[0];
        if (!next) {
          const cb = this.scriptedDone;
          this.scriptedDone = null;
          cb?.();
          break;
        }
        const to = next.clone().sub(this.pos);
        const d = to.length();
        moving = true;
        if (d < 0.2) this.scriptedPath.shift();
        else {
          to.normalize();
          this.pos.addScaledVector(to, Math.min(d, this.scriptedSpeed * dt));
          this.yaw = Math.atan2(to.x, to.z);
        }
        this.distToPlayer = this.pos.distanceTo(p.playerPos);
        if (this.pos.distanceTo(p.playerPos) < this.catchRadius + 0.2 && !p.playerHidden) {
          this.onCatch();
          return;
        }
        break;
      }
    }
    if (this.mode === 'hunt' && this.zoneLimit && this.state !== 'chase' && this.state !== 'return' && !this.zoneLimit(this.pos)) {
      // don't leave the hunting area
      this.setState('return');
    }
    this.animate(dt, t, moving, p);
  }

  private animate(dt: number, t: number, moving: boolean, p: PerceptInput) {
    // stop-motion stutter: the visual position updates in steps
    this.stutter -= dt;
    const chase = this.state === 'chase';
    if (this.stutter <= 0 || !moving) {
      this.visPos.copy(this.pos);
      this.stutter = moving ? (chase ? 0.06 : 0.11) + Math.random() * 0.05 : 0;
    }
    this.root.position.copy(this.visPos);
    this.root.position.y = this.pos.y + (moving ? Math.abs(Math.sin(t * 5)) * 0.03 : 0) + Math.sin(t * 0.7) * 0.02;
    this.root.rotation.y = this.yaw;
    this.root.rotation.z = moving ? Math.sin(t * 2.3) * 0.03 : Math.sin(t * 0.5) * 0.015;
    this.root.rotation.x = chase ? 0.12 : 0.02;
    const sh = (this.visual.dressMat as any).userData.shader;
    if (sh) sh.uniforms.uMove.value = moving ? Math.min(1, this.speed / 3) : 0;
    // head jerks
    this.headJerkTimer -= dt;
    if (this.headJerkTimer <= 0) {
      this.headJerkTimer = 0.4 + Math.random() * (chase ? 0.6 : 2.4);
      this.headJerk.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * (Math.random() < 0.2 ? 1.4 : 0.4));
    }
    const hd = this.visual.head;
    if (this.state === 'apparition' || this.state === 'observe') {
      // tilt head toward player
      hd.rotation.z += (0.45 - hd.rotation.z) * Math.min(1, dt * 3);
    } else hd.rotation.set(hd.rotation.x + (this.headJerk.x - hd.rotation.x) * Math.min(1, dt * 18), hd.rotation.y + (this.headJerk.y - hd.rotation.y) * Math.min(1, dt * 18), hd.rotation.z + (this.headJerk.z - hd.rotation.z) * Math.min(1, dt * 18));
    // arms
    const [la, ra] = this.visual.arms;
    const reach = chase ? -1.1 : -0.1;
    la.rotation.x += (reach + Math.sin(t * 3) * 0.05 - la.rotation.x) * Math.min(1, dt * 4);
    ra.rotation.x += ((chase ? -0.6 : -0.35) - ra.rotation.x) * Math.min(1, dt * 4);
    (la.userData.fore as THREE.Object3D).rotation.x = chase ? -0.4 : -0.05;
    (ra.userData.fore as THREE.Object3D).rotation.x = -0.9;
    // candle light follows the hand
    const cp = new THREE.Vector3();
    this.visual.candle.getWorldPosition(cp);
    this.lamp.pos.copy(cp);
    // sounds
    if (moving) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > (chase ? 1.1 : 0.8)) {
        this.stepAcc = 0;
        this.sound.step(this.pos, chase);
      }
      this.jingleAcc += dt;
      if (this.jingleAcc > (chase ? 0.45 : 1.3)) {
        this.jingleAcc = 0;
        this.sound.jingle(this.pos);
      }
    }
  }
}
