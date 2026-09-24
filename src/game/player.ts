import * as THREE from 'three';
import { Input } from '../core/input';
import { World, HideSpot } from '../world/world';

export interface NoiseEvent {
  pos: THREE.Vector3;
  radius: number;
  kind: string;
}

export class Player {
  pos = new THREE.Vector3(12, 0.15, 21);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  radius = 0.32;
  eye = 1.62;
  eyeTarget = 1.62;
  crouching = false;
  running = false;
  onGround = true;
  stamina = 1;
  exhausted = false;
  bobPhase = 0;
  stepDist = 0;
  moveSpeed = 0;
  canMove = true;
  canLook = true;
  canRun = true;
  hidden: HideSpot | null = null;
  hideLook = { yaw: 0, pitch: 0 };
  noise: NoiseEvent[] = [];
  onStep: (surface: string, running: boolean, crouch: boolean) => void = () => {};
  lastGround = 0;
  fallVel = 0;
  camShake = 0;
  lookOverride: { target: THREE.Vector3; strength: number } | null = null;
  private tmp = new THREE.Vector3();
  bobOffset = new THREE.Vector3();
  speedMul = 1;
  lastDX = 0;
  lastDY = 0;

  constructor(public cam: THREE.PerspectiveCamera, public world: World) {
    cam.rotation.order = 'YXZ';
  }

  teleport(p: THREE.Vector3, yaw?: number, pitch = 0) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.fallVel = 0;
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
    this.syncCamera(0);
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  update(dt: number, input: Input, zoneStep: string) {
    this.noise.length = 0;
    // look
    const [mx, my] = input.consumeMouse();
    this.lastDX = mx;
    this.lastDY = my;
    if (this.canLook) {
      if (this.hidden) {
        this.hideLook.yaw = THREE.MathUtils.clamp(this.hideLook.yaw - mx, -0.6, 0.6);
        this.hideLook.pitch = THREE.MathUtils.clamp(this.hideLook.pitch - my, -0.4, 0.3);
        this.yaw = this.hidden.yaw + this.hideLook.yaw;
        this.pitch = this.hideLook.pitch;
      } else {
        this.yaw -= mx;
        this.pitch = THREE.MathUtils.clamp(this.pitch - my, -1.45, 1.45);
      }
    }
    if (this.lookOverride) {
      const to = this.tmp.copy(this.lookOverride.target).sub(this.eyePos);
      const ty = Math.atan2(-to.x, -to.z);
      const tp = Math.atan2(to.y, Math.hypot(to.x, to.z));
      let dy = ty - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const k = Math.min(1, dt * this.lookOverride.strength);
      this.yaw += dy * k;
      this.pitch += (tp - this.pitch) * k;
    }
    if (this.hidden) {
      this.pos.copy(this.hidden.inside);
      this.eyeTarget = this.hidden.kind === 'understage' ? 0.35 : this.hidden.kind === 'stall' ? 0.8 : 1.5;
      this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 6);
      this.moveSpeed = 0;
      this.stamina = Math.min(1, this.stamina + dt * 0.3);
      this.syncCamera(dt);
      return;
    }
    // movement intent
    let fx = 0, fz = 0;
    if (this.canMove) {
      if (input.down('KeyW') || input.down('ArrowUp')) fz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) fz -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) fx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) fx += 1;
    }
    const wantCrouch = this.canMove && (input.down('KeyC') || input.down('ControlLeft') || input.down('ControlRight'));
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) {
      // stand only if there is headroom
      const ceil = this.world.col.ceilingAt(this.pos.x, this.pos.z, this.radius * 0.8, this.pos.y + 1.0);
      if (ceil - this.pos.y > 1.8) this.crouching = false;
    }
    const moving = fx !== 0 || fz !== 0;
    this.running = moving && fz > 0 && this.canRun && !this.crouching && !this.exhausted && (input.down('ShiftLeft') || input.down('ShiftRight'));
    // stamina
    if (this.running) {
      this.stamina -= dt / 7.5;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt / (moving ? 7 : 4.5));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const speed = (this.crouching ? 1.35 : this.running ? 5.1 : 2.75) * this.speedMul;
    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const wish = new THREE.Vector3().addScaledVector(f, fz).addScaledVector(r, fx);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = this.onGround ? 12 : 3;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, dt * accel);
    const oldPos = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const stepH = 0.46;
    const height = this.crouching ? 1.15 : 1.78;
    this.world.col.resolve(this.pos, this.radius, this.pos.y, this.pos.y + height, stepH);
    // ground
    const g = this.world.col.groundAt(this.pos.x, this.pos.z, this.radius * 0.55, this.pos.y, stepH);
    if (g >= this.pos.y - 0.02) {
      // step up (smooth)
      const up = g - this.pos.y;
      this.pos.y = up > 0.05 ? this.pos.y + Math.min(up, dt * 6 + 0.02) : g;
      if (up > 0.2) this.eye -= up * 0.5; // absorb visually
      this.fallVel = 0;
      this.onGround = true;
    } else {
      this.fallVel -= 22 * dt;
      this.pos.y += this.fallVel * dt;
      if (this.pos.y <= g) {
        if (this.fallVel < -6) this.camShake = Math.min(0.6, -this.fallVel * 0.04);
        this.pos.y = g;
        this.fallVel = 0;
        this.onGround = true;
      } else this.onGround = this.pos.y - g < 0.08;
    }
    const moved = Math.hypot(this.pos.x - oldPos.x, this.pos.z - oldPos.z);
    this.moveSpeed = moved / Math.max(dt, 1e-4);
    // footsteps
    if (this.onGround && moved > 0.0005) {
      this.stepDist += moved;
      const stride = this.running ? 0.95 : this.crouching ? 0.55 : 0.72;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.onStep(zoneStep, this.running, this.crouching);
        const nr = this.running ? 15 : this.crouching ? 1.5 : 5.5;
        this.noise.push({ pos: this.pos.clone(), radius: nr, kind: 'step' });
      }
      this.bobPhase += moved * (this.running ? 1.3 : 1.7);
    }
    this.eyeTarget = this.crouching ? 0.98 : 1.62;
    this.eye += (this.eyeTarget - this.eye) * Math.min(1, dt * 9);
    this.syncCamera(dt);
  }

  syncCamera(dt: number) {
    const bobAmt = Math.min(1, this.moveSpeed / 3) * (this.running ? 0.055 : 0.03);
    const by = Math.sin(this.bobPhase * 2) * bobAmt;
    const bx = Math.cos(this.bobPhase) * bobAmt * 0.6;
    this.camShake = Math.max(0, this.camShake - dt * 1.5);
    const sh = this.camShake;
    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    this.cam.position.set(this.pos.x + r.x * bx + (Math.random() - 0.5) * sh * 0.08, this.pos.y + this.eye + by + (Math.random() - 0.5) * sh * 0.08, this.pos.z + r.z * bx);
    this.cam.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.02, this.yaw, Math.sin(this.bobPhase) * bobAmt * 0.15);
  }

  emit(radius: number, kind: string, pos?: THREE.Vector3) {
    this.noise.push({ pos: (pos ?? this.pos).clone(), radius, kind });
  }
}
