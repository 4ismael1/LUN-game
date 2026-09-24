import * as THREE from 'three';

/** Beam cookie: hot center, a faint reflector ring and dusty falloff (classic horror flashlight). */
function cookieTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 126);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,250,235,0.95)');
  grd.addColorStop(0.3, 'rgba(210,200,180,0.55)');
  grd.addColorStop(0.36, 'rgba(255,245,225,0.72)'); // reflector ring
  grd.addColorStop(0.44, 'rgba(160,150,135,0.35)');
  grd.addColorStop(0.75, 'rgba(70,66,60,0.14)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // lens smudges / dust
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 90;
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.beginPath();
    g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** faint volumetric cone texture (bright near the lens, fading along its length) */
function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.1, 'rgba(255,255,255,0.1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(0.9, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0.6)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  // soften the edges horizontally so the cone silhouette isn't visible
  const img = g.getImageData(0, 0, 64, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const k = Math.sin((x / 63) * Math.PI);
      img.data[(y * 64 + x) * 4 + 3] *= k * k;
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/**
 * First-person hand-held flashlight: visible model with inertia sway, projected cookie
 * spot light, a subtle volumetric cone and a small bounce light.
 */
export class HandFlashlight {
  group = new THREE.Group(); // attached to the camera
  model = new THREE.Group();
  spot: THREE.SpotLight;
  target = new THREE.Object3D();
  bounce: THREE.PointLight;
  cone: THREE.Mesh;
  lens: THREE.Mesh;
  private sway = new THREE.Vector2();
  private swayVel = new THREE.Vector2();
  private lower = 1; // 0 = raised, 1 = lowered out of view
  private lowerTarget = 1;
  private bob = 0;
  private aim = new THREE.Vector3();
  intensity = 0;
  private aimDist = 8;

  constructor(private cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    cam.add(this.group);
    this.group.add(this.model);
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.75, roughness: 0.38 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.9 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0x8a8a88, metalness: 1, roughness: 0.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 16), metal);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.06;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0235, 0.0235, 0.09, 16), rubber);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.08;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.022, 0.05, 16), metal);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = -0.065;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 18), chrome);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.105;
    const button = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.018), rubber);
    button.position.set(0, 0.024, 0.02);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.031, 18), new THREE.MeshBasicMaterial({ color: 0x333028, toneMapped: false }));
    this.lens.position.z = -0.1255;
    this.lens.rotation.y = Math.PI;
    // hand (simple glove-like shape so it doesn't float)
    const skin = new THREE.MeshStandardMaterial({ color: 0x6a5040, roughness: 0.8 });
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
    hand.scale.set(1.1, 0.9, 1.6);
    hand.position.set(0.005, -0.012, 0.08);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 1 }));
    sleeve.rotation.x = Math.PI / 2 - 0.3;
    sleeve.position.set(0.02, -0.05, 0.22);
    for (const m of [body, grip, neck, head, button, this.lens, hand, sleeve]) {
      m.renderOrder = 999;
      (m.material as THREE.Material).depthTest = true;
      this.model.add(m);
    }
    this.model.position.set(0.2, -0.19, -0.36);
    this.model.rotation.set(0.05, 0.08, 0);
    // volumetric cone
    const coneGeo = new THREE.CylinderGeometry(1.35, 0.03, 7, 24, 1, true);
    coneGeo.translate(0, -3.5, 0);
    coneGeo.rotateX(-Math.PI / 2);
    this.cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff0d8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.cone.position.z = -0.13;
    this.cone.visible = false;
    this.model.add(this.cone);
    // lights
    this.spot = new THREE.SpotLight(0xfff0d6, 0, 30, 0.5, 0.35, 1.3);
    this.spot.map = cookieTexture();
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.02;
    this.spot.shadow.camera.near = 0.15;
    this.spot.shadow.camera.far = 30;
    scene.add(this.spot, this.target);
    this.spot.target = this.target;
    this.bounce = new THREE.PointLight(0xffe8cc, 0, 5, 2);
    scene.add(this.bounce);
  }

  get visible() {
    return this.lower < 0.98;
  }

  setHeld(held: boolean) {
    this.lowerTarget = held ? 0 : 1;
  }

  /**
   * @param on beam state
   * @param level 0..1 brightness (battery, flicker)
   */
  update(dt: number, on: boolean, level: number, mouseDX: number, mouseDY: number, moveSpeed: number, running: boolean, rayDist: (o: THREE.Vector3, d: THREE.Vector3, max: number) => number) {
    // inertia sway from mouse movement
    this.swayVel.x += (-mouseDX * 0.6 - this.sway.x * 30) * dt;
    this.swayVel.y += (mouseDY * 0.6 - this.sway.y * 30) * dt;
    this.swayVel.multiplyScalar(Math.max(0, 1 - dt * 9));
    this.sway.addScaledVector(this.swayVel, dt * 10);
    this.sway.clampScalar(-0.08, 0.08);
    this.bob += dt * moveSpeed * (running ? 2.1 : 2.6);
    const bobAmt = Math.min(1, moveSpeed / 3) * (running ? 0.022 : 0.01);
    this.lower += (this.lowerTarget - this.lower) * Math.min(1, dt * 7);
    const m = this.model;
    m.position.set(0.2 + this.sway.x + Math.cos(this.bob) * bobAmt, -0.19 + this.sway.y - Math.abs(Math.sin(this.bob)) * bobAmt - this.lower * 0.35, -0.36);
    m.rotation.set(0.05 + this.sway.y * 1.5 + this.lower * 0.9, 0.08 - this.sway.x * 2, -this.sway.x * 1.2);
    this.model.visible = this.lower < 0.98;
    // beam
    // avoid blown-out surfaces up close (auto-exposure feel)
    const near = THREE.MathUtils.clamp(this.aimDist / 5, 0.35, 1);
    this.intensity = on ? 24 * level * near : 0;
    this.spot.intensity = this.intensity;
    this.bounce.intensity = on ? 0.9 * level : 0;
    this.cone.visible = on && level > 0.1;
    (this.cone.material as THREE.MeshBasicMaterial).opacity = 0.045 * level;
    (this.lens.material as THREE.MeshBasicMaterial).color.setRGB(on ? 1.6 * level + 0.2 : 0.2, on ? 1.5 * level + 0.19 : 0.19, on ? 1.3 * level + 0.16 : 0.16);
    // light origin at the lens, aim converges on what the player looks at
    this.cam.updateMatrixWorld();
    const lensW = new THREE.Vector3();
    this.lens.getWorldPosition(lensW);
    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    const dist = Math.max(1.2, rayDist(this.cam.position, fwd, 25));
    this.aimDist += (dist - this.aimDist) * Math.min(1, dt * 8);
    const want = this.cam.position.clone().addScaledVector(fwd, dist);
    this.aim.lerp(want, Math.min(1, dt * 16));
    if (this.aim.lengthSq() === 0) this.aim.copy(want);
    // when lowered (camera raised / hidden) the beam points down in front
    this.spot.position.copy(this.visible ? lensW : this.cam.position.clone().add(new THREE.Vector3(0, -0.3, 0)));
    this.target.position.copy(this.aim);
    this.target.updateMatrixWorld();
    // bounce light: a little in front of the surface hit
    this.bounce.position.copy(this.cam.position).addScaledVector(fwd, Math.min(dist * 0.85, 4));
  }
}
