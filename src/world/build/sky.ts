import * as THREE from 'three';

export interface Sky {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uDawn: { value: number };
    uStorm: { value: number };
    uFlash: { value: number };
    uRed: { value: number };
  };
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  update(dt: number, camPos: THREE.Vector3): void;
}

export function buildSky(scene: THREE.Scene): Sky {
  const uniforms = {
    uTime: { value: 0 },
    uDawn: { value: 0 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uRed: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDawn, uStorm, uFlash, uRed;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){
        vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        // night gradient
        vec3 zenith = vec3(0.012, 0.02, 0.05);
        vec3 horizon = vec3(0.06, 0.07, 0.11);
        vec3 cityGlow = vec3(0.22, 0.12, 0.06);
        vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.6, h));
        col += cityGlow * pow(1.0 - clamp(h, 0.0, 1.0), 10.0) * (1.0 - uDawn) * 0.6;
        // stars
        vec3 sp = d * 380.0;
        float st = step(0.9965, hash(floor(sp)));
        float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp)) * 50.0);
        col += vec3(st * tw) * smoothstep(0.05, 0.4, h) * (1.0 - uStorm * 0.85) * (1.0 - uDawn);
        // moon
        vec3 moonDir = normalize(vec3(-0.45, 0.55, -0.7));
        float md = dot(d, moonDir);
        vec3 moonCol = mix(vec3(0.9, 0.92, 1.0), vec3(1.0, 0.45, 0.3), uRed);
        col += moonCol * smoothstep(0.9993, 0.9996, md) * 1.6 * (1.0 - uDawn * 0.7);
        col += moonCol * pow(max(md, 0.0), 180.0) * 0.35 * (1.0 - uStorm * 0.6);
        // clouds
        vec2 cuv = d.xz / max(h + 0.12, 0.05);
        float c = fbm(vec3(cuv * 0.9 + vec2(uTime * 0.004, uTime * 0.002), uTime * 0.01));
        float cover = mix(0.55, 0.3, uStorm);
        float cl = smoothstep(cover, cover + 0.35, c) * smoothstep(-0.05, 0.25, h);
        vec3 cloudCol = mix(vec3(0.03, 0.035, 0.05), vec3(0.08, 0.07, 0.07), smoothstep(0.0, 1.0, pow(max(md,0.0), 8.0)));
        // dawn colors
        vec3 dawnZen = vec3(0.25, 0.35, 0.55);
        vec3 dawnHor = vec3(1.0, 0.55, 0.3);
        vec3 dcol = mix(dawnHor, dawnZen, smoothstep(-0.05, 0.5, h));
        vec3 sunDir = normalize(vec3(0.8, 0.05, 0.4));
        dcol += vec3(1.0, 0.7, 0.4) * pow(max(dot(d, sunDir), 0.0), 12.0) * 0.8;
        col = mix(col, dcol, uDawn);
        cloudCol = mix(cloudCol, vec3(0.9, 0.55, 0.45), uDawn);
        col = mix(col, cloudCol, cl * 0.92);
        // lightning
        col += vec3(0.6, 0.65, 0.8) * uFlash * (0.4 + cl);
        // below horizon: dark
        col = mix(col, horizon * 0.6, smoothstep(0.0, -0.08, h) * (1.0 - uDawn * 0.5));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  scene.add(mesh);

  const moon = new THREE.DirectionalLight(0x8ea8d8, 0.55);
  moon.position.set(-45, 55, -70);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera as THREE.OrthographicCamera;
  sc.left = -32;
  sc.right = 32;
  sc.top = 32;
  sc.bottom = -32;
  sc.near = 1;
  sc.far = 200;
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.04;
  scene.add(moon);
  scene.add(moon.target);
  const hemi = new THREE.HemisphereLight(0x3a4a70, 0x2a1e18, 0.35);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x1a1e2a, 0.25);
  scene.add(ambient);
  const moonOffset = new THREE.Vector3(-45, 55, -70);
  const snap = 4;
  return {
    mesh,
    uniforms,
    moon,
    hemi,
    ambient,
    update(dt, camPos) {
      mesh.position.copy(camPos);
      // follow camera with texel snapping to avoid shimmering
      const tx = Math.round(camPos.x / snap) * snap;
      const tz = Math.round(camPos.z / snap) * snap;
      moon.target.position.set(tx, 0, tz);
      moon.position.set(tx + moonOffset.x, moonOffset.y, tz + moonOffset.z);
      const dawn = uniforms.uDawn.value;
      moon.color.setRGB(0.55 + dawn * 0.45, 0.66 + dawn * 0.2, 0.85 - dawn * 0.3);
      moon.intensity = 0.55 + dawn * 1.4 + uniforms.uFlash.value * 3.0;
      // climax: a dim red glow from the sky so the square stays readable without the flashlight
      const red = uniforms.uRed.value;
      hemi.color.setRGB(0.23 + dawn * 0.4 + red * 0.5, 0.29 + dawn * 0.35 - red * 0.08, 0.44 + dawn * 0.3 - red * 0.2);
      hemi.groundColor.setRGB(0.16 + dawn * 0.25 + red * 0.12, 0.12 + dawn * 0.15, 0.1 + dawn * 0.1);
      hemi.intensity = 0.35 + dawn * 0.9 + red * 0.3 + uniforms.uFlash.value * 1.5;
    },
  };
}
