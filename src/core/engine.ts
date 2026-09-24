import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { settings, onSettings } from './settings';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    danger: { value: 0 },
    desat: { value: 0 },
    brightness: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    flash: { value: 0 },
    blackout: { value: 0 },
    aberr: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, danger, desat, brightness, flash, blackout, aberr;
    uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float ab = aberr * 0.004 + danger * 0.0025;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      col *= brightness;
      // subtle grade: lift shadows toward blue-green, warm highlights
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(l), desat);
      col += vec3(0.004, 0.008, 0.014) * (1.0 - smoothstep(0.0, 0.3, l));
      col *= tint;
      col = mix(col, col * vec3(1.05, 0.92, 0.9), danger * 0.6);
      // vignette
      float v = smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85)) * (1.0 + vignette + danger * 0.5));
      col *= mix(1.0, v, 0.85);
      // grain
      float g = hash(uv * vec2(1920.0,1080.0) + fract(time * 7.13) * 100.0) - 0.5;
      col += g * (grain + danger * 0.04) * (0.6 + 0.4 * (1.0 - l));
      col = mix(col, vec3(1.0, 0.98, 0.95), flash);
      col *= (1.0 - blackout);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  clock = new THREE.Clock();
  pixelRatio = 1;

  constructor(public container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.layers.enable(0);
    this.scene.add(this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.applyQuality();
    onSettings(() => this.applyQuality());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality() {
    const q = settings.quality;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.pixelRatio = q === 'alto' ? Math.min(dpr, 1.5) : q === 'medio' ? Math.min(dpr, 1.0) : 0.75;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.bloom.enabled = q !== 'bajo';
    this.renderer.shadowMap.enabled = q !== 'bajo';
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.grade.uniforms.brightness.value = settings.brightness;
    this.resize();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && (m as any).isMaterial) m.needsUpdate = true;
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.floor(w / 3), Math.floor(h / 3));
  }

  private frameNo = 0;
  render() {
    this.frameNo++;
    // shadow maps refresh every other frame (big win on integrated GPUs)
    this.renderer.shadowMap.autoUpdate = false;
    if (this.frameNo % 2 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.grade.uniforms.time.value = performance.now() / 1000;
    this.composer.render();
  }
}
