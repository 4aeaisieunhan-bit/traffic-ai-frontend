// cinematic-hero/engine/cinematic-engine.ts
// Cảnh 3D trang chủ: siêu xe xanh drift qua vạch dừng lúc đèn đỏ -> camera bay vào camera giám sát ->
// phát lại chậm 0.5x, khung đỏ bám xe, "TRAFFIC VIOLATION DETECTED" -> dừng hình làm bằng chứng.
// Mọi chuyển động là hàm của thời gian timeline GSAP (tua / dừng / phát chính xác).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap } from 'gsap';
import { NightAtmosphere } from './night-atmosphere';
import { UrbanIntersection } from './urban-intersection';
import { beamCone, canvasTexture, glowSprite, mulberry32 } from './util';

/** Các phần tử HUD (DOM) do component Angular cung cấp. */
export interface CinematicHud {
  cctv: HTMLElement;
  clock: HTMLElement;
  speed: HTMLElement;
  trackState: HTMLElement;
  freezeChip: HTMLElement;
  box: HTMLElement;
  boxTag: HTMLElement;
  boxMeta: HTMLElement;
  alert: HTMLElement;
  alertInfo: HTMLElement;
  alertSpeed: HTMLElement;
  flash: HTMLElement;
  fade: HTMLElement;
}

export interface CinematicOptions {
  quality: 'high' | 'low';
  modelUrl: string;
  dracoPath: string;
  brandBlue?: number;
}

export interface CinematicEngine {
  readonly duration: number;
  /** Phát / dừng vòng lặp hiển thị (timeline giữ nguyên vị trí). */
  play(): void;
  pause(): void;
  /** Hiển thị 1 khung hình tĩnh tại thời điểm t (dùng cho chế độ giảm chuyển động). */
  showStill(t?: number): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export async function createCinematicEngine(canvas: HTMLCanvasElement, hud: CinematicHud, opts: CinematicOptions): Promise<CinematicEngine> {
  const HIGH = opts.quality === 'high';
  const BRAND_BLUE = opts.brandBlue ?? 0x3b82f6;

  // ══════════════════ RENDERER · SCENE · MÔI TRƯỜNG ══════════════════
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: HIGH, powerPreference: 'high-performance' });
  renderer.setPixelRatio(HIGH ? Math.min(window.devicePixelRatio, 1.5) : 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = HIGH;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const atmosphere = new NightAtmosphere(renderer, { shadowSize: HIGH ? 2048 : 1024 }).applyTo(scene);
  const city = new UrbanIntersection({ accentBlue: BRAND_BLUE, accentRed: 0xf43f5e, quality: opts.quality });
  scene.add(city.group);
  const STOP_Z: number = city.stopZ;

  const cineCam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 900);
  const cctvCam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 900);
  let activeCam = cineCam;
  const CCTV_LOOK: THREE.Vector3 = city.mainCamera.baseTarget.clone();
  const CCTV_POS: THREE.Vector3 = city.mainCamera.lensPosition.clone()
    .add(CCTV_LOOK.clone().sub(city.mainCamera.lensPosition).normalize().multiplyScalar(0.45));

  // ══════════════════ QUỸ ĐẠO XE (mét) ══════════════════
  const LANE_X = -1.75;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(LANE_X, 0, -150), new THREE.Vector3(LANE_X, 0, -70), new THREE.Vector3(LANE_X, 0, -34),
    new THREE.Vector3(-1.6, 0, -20), new THREE.Vector3(-0.6, 0, -9), new THREE.Vector3(3.2, 0, -1.0),
    new THREE.Vector3(10, 0, 2.6), new THREE.Vector3(26, 0, 3.2), new THREE.Vector3(90, 0, 3.2), new THREE.Vector3(200, 0, 3.2),
  ], false, 'centripetal');
  path.arcLengthDivisions = 4000;
  const PATH_LEN = path.getLength();
  const uWhere = (fn: (p: THREE.Vector3) => boolean) => {
    for (let i = 0; i <= 4000; i++) { const u = i / 4000; if (fn(path.getPointAt(u))) return u; }
    return 1;
  };
  const U = {
    replayStart: uWhere((p) => p.z > -44),
    driftStart: uWhere((p) => p.z > -24),
    stop: uWhere((p) => p.z > STOP_Z - 2.2),
    peakIn: uWhere((p) => p.z > -8),
    peakOut: uWhere((p) => p.x > 5),
    driftEnd: uWhere((p) => p.x > 20),
    exit: uWhere((p) => p.x > 58),
    replayEnd: uWhere((p) => p.x > 34),
  };
  const MAX_SLIP = 0.62;
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const slipAt = (u: number) => MAX_SLIP * smooth(U.driftStart, U.peakIn, u) * (1 - smooth(U.peakOut, U.driftEnd, u));

  // ══════════════════ KỊCH BẢN (GSAP) ══════════════════
  const S = { u: 0, rc: 0, freeze: 0, phase: 0, cctv: 0, glitch: 0, light: 1, fade: 1, flash: 0, alert: 0, track: 0, zoom: 0 };
  const R = { sb: 1, lb: 0, ox: -3, oy: 1.0, oz: 8, ly: 0.7, lz: 0, wb: 0, fov: 40 };
  const STATIC_POS = new THREE.Vector3(4.6, 1.05, 34);     // máy quay thấp giữa đường chính, nhìn dọc qua ngã tư
  const STATIC_LOOK = new THREE.Vector3(-1.4, 3.4, -90);
  const DUR = 15.0;
  const T_CUT = 7.6;

  const tl = gsap.timeline({ paused: true, repeat: -1 });
  tl.set(S, { u: 0, rc: 0, freeze: 0, phase: 0, cctv: 0, light: 1, fade: 1, track: 0, alert: 0, zoom: 0 }, 0)
    .set(R, { sb: 1, lb: 0, ox: -3, oy: 1.0, oz: 8, ly: 0.7, lz: 0, wb: 0, fov: 40 }, 0)
    .to(S, { fade: 0, duration: 0.8, ease: 'power1.out' }, 0)
    .to(S, { u: U.driftStart, duration: 4.3, ease: 'none' }, 0)
    .to(S, { u: U.driftEnd, duration: 2.5, ease: 'power1.out' }, 4.3)
    .to(S, { u: U.exit, duration: 0.8, ease: 'power2.in' }, 6.8)
    .set(S, { light: 2 }, 1.6)
    .to(R, { lb: 1, duration: 1.2, ease: 'power1.inOut' }, 1.7)
    .to(R, { sb: 0, fov: 34, duration: 1.4, ease: 'power3.inOut' }, 2.7)
    .to(R, { ox: -5.2, oy: 1.0, oz: 3.4, duration: 1.0, ease: 'sine.inOut' }, 3.0)
    .to(R, { ox: -7.4, oy: 1.5, oz: -2.4, lz: 0.4, duration: 1.6, ease: 'sine.inOut' }, 4.0)
    .to(R, { ox: -3.5, oy: 3.6, oz: -10, fov: 38, duration: 0.85, ease: 'power1.inOut' }, 5.6)
    .to(R, { wb: 1, fov: 42, duration: 1.15, ease: 'power3.inOut' }, 6.45)
    .to(S, { glitch: 1, duration: 0.15, ease: 'none' }, T_CUT - 0.18)
    .set(S, { phase: 1, cctv: 1, u: U.replayStart }, T_CUT)
    .to(S, { glitch: 0, duration: 0.45, ease: 'power2.out' }, T_CUT + 0.02)
    .set(S, { track: 1 }, T_CUT + 0.7)
    .set(S, { track: 2 }, T_CUT + 1.5)
    .to(S, { fade: 1, duration: 0.55, ease: 'power1.in' }, DUR - 0.55)
    .set({}, {}, DUR);
  const REPLAY_SEC_PER_U = 6.4 / (U.replayEnd - U.replayStart);
  const T_DETECT = T_CUT + REPLAY_SEC_PER_U * (U.stop - U.replayStart);
  const FREEZE_DUR = 1.5;
  const U_FREEZE = U.stop + (FREEZE_DUR / REPLAY_SEC_PER_U) / 2;
  tl.to(S, { u: U.stop, rc: T_DETECT - T_CUT, duration: T_DETECT - T_CUT, ease: 'none' }, T_CUT)
    .to(S, { u: U_FREEZE, rc: T_DETECT - T_CUT + FREEZE_DUR / 2, duration: FREEZE_DUR, ease: 'power2.out' }, T_DETECT)
    .set(S, { freeze: 1 }, T_DETECT + FREEZE_DUR)
    .set(S, { track: 3 }, T_DETECT)
    .fromTo(S, { flash: 0.7 }, { flash: 0, duration: 0.45, ease: 'power2.out', immediateRender: false }, T_DETECT)
    .to(S, { alert: 1, duration: 0.35, ease: 'back.out(1.8)' }, T_DETECT + 0.12)
    .to(S, { zoom: 1, duration: 1.6, ease: 'power2.inOut' }, T_DETECT);

  // ══════════════════ SIÊU XE (GLB, sơn xanh thương hiệu) ══════════════════
  const carRig = new THREE.Group();
  const carTilt = new THREE.Group();
  carRig.add(carTilt); scene.add(carRig);
  const wheels: Record<string, THREE.Object3D> = {};
  const carLocalBox = new THREE.Box3();
  const rearWheelLocal = [new THREE.Vector3(), new THREE.Vector3()];

  const draco = new DRACOLoader().setDecoderPath(opts.dracoPath);
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync(opts.modelUrl);
  draco.dispose();
  const car = gltf.scene;
  {
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(BRAND_BLUE), metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 1, roughness: 0.36 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0c11, metalness: 0.3, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.74 });
    const set = (name: string, mat: THREE.Material) => { const o = car.getObjectByName(name); o?.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).material = mat; }); };
    set('body', bodyMat);
    ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach((n) => set(n, detailMat));
    set('glass', glassMat);
    car.updateMatrixWorld(true);
    const c = new THREE.Vector3(), b = new THREE.Box3();
    car.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      const n = (mat.name || '').toLowerCase();
      if (n.includes('taillight')) { const cl = mat.clone(); cl.emissive = new THREE.Color(0xff0a1e); cl.emissiveIntensity = 3; m.material = cl; }
      if (n.includes('projector') || n.includes('turn_signal')) {
        b.setFromObject(m).getCenter(c);            // mô hình gốc: đầu xe ở phía -Z
        if (c.z < 0) { const cl = mat.clone(); cl.emissive = new THREE.Color(0xdfeeff); cl.emissiveIntensity = 2.5; m.material = cl; }
      }
    });
    for (const k of ['fl', 'fr', 'rl', 'rr']) { const w = car.getObjectByName('wheel_' + k); if (w) { w.rotation.order = 'YXZ'; wheels[k] = w; } }
    const flip = new THREE.Group(); flip.rotation.y = Math.PI; flip.add(car); carTilt.add(flip);
    carTilt.updateMatrixWorld(true);
    carLocalBox.setFromObject(car);
    (['rl', 'rr'] as const).forEach((k, i) => { if (wheels[k]) { wheels[k].getWorldPosition(rearWheelLocal[i]); rearWheelLocal[i].y = 0.12; } });

    const front = carLocalBox.max.z, back = carLocalBox.min.z, halfW = (carLocalBox.max.x - carLocalBox.min.x) / 2;
    for (const sx of [-1, 1]) {
      const hx = sx * halfW * 0.62, hy = 0.66;
      const spot = new THREE.SpotLight(0xe6f2ff, 110, 38, 0.42, 0.6, 2.0);
      spot.position.set(hx, hy, front - 0.35); spot.target.position.set(hx * 1.6, 0, front + 22);
      carTilt.add(spot, spot.target);
      const cone = beamCone(2.4, 15, 0xcfe4ff, 0.022);
      cone.position.set(hx, hy, front - 0.25); cone.lookAt(new THREE.Vector3(hx * 1.3, -2.8, front + 16)); cone.rotateX(-Math.PI / 2);
      carTilt.add(cone);
      const halo = glowSprite(0xdfeeff, 0.55, 0.8); halo.position.set(hx, hy, front + 0.02); carTilt.add(halo);
      const tHalo = glowSprite(0xff1020, 0.9, 0.85); tHalo.scale.set(0.9, 0.5, 1); tHalo.position.set(sx * halfW * 0.7, 0.78, back + 0.05); carTilt.add(tHalo);
    }
    const tail = new THREE.PointLight(0xff1020, 6, 7, 2); tail.position.set(0, 0.7, back - 0.4); carTilt.add(tail);
    const under = new THREE.PointLight(BRAND_BLUE, 4, 4.5, 2); under.position.set(0, 0.18, 0); carTilt.add(under);
    // Đèn chính kiểu quảng cáo ô tô: nguồn sáng hẹp phía trên bám theo xe -> sơn xanh luôn là tâm điểm
    const key = new THREE.SpotLight(0xe8f0ff, 120, 16, 0.32, 0.9, 1.5); key.position.set(-2.2, 9.5, 1.2); key.target.position.set(0, 0.7, 0);
    carRig.add(key, key.target);
    const shadowTex = canvasTexture(128, 256, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
      grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }, { repeat: false });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 * 1.35, (front - back) * 1.2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = 2; carRig.add(sh);
  }

  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  function poseCar(u: number) {
    const p = path.getPointAt(u), tan = path.getTangentAt(u);
    const pathYaw = Math.atan2(tan.x, tan.z);
    const slip = slipAt(u);
    carRig.position.copy(p);
    carRig.rotation.y = pathYaw + slip;
    carTilt.rotation.z = -slip * 0.07;
    carTilt.rotation.x = -slip * 0.02;
    const spin = (u * PATH_LEN) / 0.34;
    for (const k of ['fl', 'fr', 'rl', 'rr']) if (wheels[k]) wheels[k].rotation.x = -spin;
    const steer = -slip * 0.85;                 // bẻ lái ngược khi drift
    if (wheels['fl']) wheels['fl'].rotation.y = steer;
    if (wheels['fr']) wheels['fr'].rotation.y = steer;
    carRig.updateMatrixWorld(true);
    return { p, pathYaw, slip };
  }

  // ══════════════════ KHÓI LỐP (phát theo quãng đường trượt, tính trước) ══════════════════
  const smokeTex = canvasTexture(128, 128, (g, w) => {
    const r = mulberry32(77);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.45, y = w / 2 + (r() - 0.5) * w * 0.45, rad = w * (0.15 + r() * 0.25);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${0.16 + r() * 0.16})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
    }
  }, { srgb: false, repeat: false });
  const MAX_P = HIGH ? 2600 : 1200;
  const smokeGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_P * 3), pSize = new Float32Array(MAX_P), pAlpha = new Float32Array(MAX_P), pRot = new Float32Array(MAX_P);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  smokeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  smokeGeo.setAttribute('aRot', new THREE.BufferAttribute(pRot, 1));
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: smokeTex }, uScale: { value: 400 }, uColor: { value: new THREE.Color(0.23, 0.25, 0.3) }, uWarm: { value: new THREE.Color(0.12, 0.2, 0.4) } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute float aRot;
      uniform float uScale; varying float vAlpha; varying float vRot; varying float vH;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 640.0);
        vAlpha = aAlpha * smoothstep(1.5, 7.0, -mv.z); vRot = aRot; vH = position.y;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uColor; uniform vec3 uWarm;
      varying float vAlpha; varying float vRot; varying float vH;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float s = sin(vRot), co = cos(vRot);
        c = mat2(co, -s, s, co) * c;
        float a = texture2D(uTex, c + 0.5).a * vAlpha;
        if (a < 0.003) discard;
        vec3 col = uColor + uWarm * (1.0 - smoothstep(0.0, 2.0, vH)) * 0.6;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false; smoke.renderOrder = 3;
  scene.add(smoke);

  interface Emission { t0: number; rc: number; phase: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; s0: number; grow: number; life: number; r0: number; rv: number; amp: number; }
  const emissions: Emission[] = [];
  const speedTable: number[] = [];
  {
    const dt = 1 / 60, r = mulberry32(99);
    let prev: THREE.Vector3 | null = null, budget = 0;
    for (let i = 0; i * dt <= DUR; i++) {
      const t = i * dt;
      tl.time(t, false);
      const { slip } = poseCar(S.u);
      const pos = carRig.position.clone();
      const v = prev ? pos.clone().sub(prev).divideScalar(dt) : new THREE.Vector3();
      const jumped = v.length() > 80;
      if (jumped) v.set(0, 0, 0);
      speedTable.push(v.length() * (S.phase === 1 ? 2 : 1) * 3.6);
      prev = pos;
      if (!jumped && slip > 0.12 && v.length() > 1) {
        const k = slip / MAX_SLIP, timeScale = S.phase === 1 ? 2 : 1;
        v.multiplyScalar(timeScale);
        budget += (v.length() / timeScale) * dt * (2.5 + 4 * k) * (HIGH ? 1 : 0.55);
        const n = Math.floor(budget); budget -= n;
        for (const wl of rearWheelLocal) {
          const wp = wl.clone().applyMatrix4(carRig.matrixWorld);
          for (let j = 0; j < n; j++) emissions.push({
            t0: t + r() * dt, rc: S.rc + r() * dt, phase: S.phase,
            x: wp.x + (r() - 0.5) * 0.3, y: 0.18 + r() * 0.15, z: wp.z + (r() - 0.5) * 0.3,
            vx: -v.x * 0.16 + (r() - 0.5) * 2.4, vy: 0.5 + r() * 0.9, vz: -v.z * 0.16 + (r() - 0.5) * 2.4,
            s0: 0.5 + r() * 0.5, grow: 2.2 + r() * 2.0, life: 2.3 + r() * 1.8, r0: r() * 6.283, rv: (r() - 0.5) * 0.9,
            amp: (0.14 + k * 0.16) * (S.phase === 1 ? 0.6 : 1),
          });
        }
      }
    }
    emissions.sort((a, b) => a.t0 - b.t0);
    tl.time(0, false);
  }
  function updateSmoke(t: number) {
    const phase = t >= T_CUT ? 1 : 0;
    let n = 0;
    for (let i = 0; i < emissions.length && n < MAX_P; i++) {
      const e = emissions[i];
      if (e.t0 > t) break;
      if (e.phase === 1 && e.rc > S.rc) continue;
      const age = e.phase === 1 ? (S.rc - e.rc) * 0.5 : t - e.t0;
      if (age >= e.life || e.phase !== phase) continue;
      const damp = (1 - Math.exp(-age * 1.3)) / 1.3;
      pPos[n * 3] = e.x + e.vx * damp; pPos[n * 3 + 1] = e.y + e.vy * damp + age * 0.28; pPos[n * 3 + 2] = e.z + e.vz * damp;
      pSize[n] = e.s0 + e.grow * Math.pow(age, 0.65);
      pAlpha[n] = e.amp * Math.min(1, age / 0.18) * Math.pow(1 - age / e.life, 2.2);
      pRot[n] = e.r0 + e.rv * age;
      n++;
    }
    smokeGeo.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aRot']) smokeGeo.attributes[k].needsUpdate = true;
  }

  // ══════════════════ HẬU KỲ ══════════════════
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, cineCam);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.6, 0.5, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const cctvPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uGlitch: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1280, 720) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uAmount, uGlitch, uTime; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        float band = step(0.55, h(vec2(floor(uv.y * 22.0), floor(uTime * 24.0))));
        uv.x += (h(vec2(floor(uv.y * 70.0), floor(uTime * 30.0))) - 0.5) * 0.12 * band * uGlitch;
        vec2 cc = uv - 0.5;
        uv = 0.5 + cc * (1.0 + uAmount * 0.07 * dot(cc, cc));
        float ca = 0.0010 + uGlitch * 0.014 + uAmount * 0.0009;
        vec3 col = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 cam = mix(vec3(l), col, 0.45) * vec3(0.93, 1.02, 1.04);
        cam = (cam - 0.5) * 1.1 + 0.5;
        col = mix(col, cam, uAmount);
        col *= 1.0 - uAmount * 0.09 * (0.5 + 0.5 * sin(vUv.y * uRes.y * 1.4));
        col += (h(vUv * uRes + fract(uTime * 7.31)) - 0.5) * (0.025 + 0.05 * uAmount + 0.45 * uGlitch);
        col *= mix(0.6, 1.0, smoothstep(0.92, 0.22, length(vUv - 0.5)));
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(cctvPass);

  // ══════════════════ KẾT XUẤT 1 KHUNG HÌNH TẠI t ══════════════════
  let W = 1280, H = 720;
  let fovScale = 1;
  const followPos = new THREE.Vector3(), followLook = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const trackPt = new THREE.Vector3();
  const pad2 = (n: number) => String(n).padStart(2, '0');

  function renderAt(t: number) {
    const { p, pathYaw } = poseCar(S.u);
    const signal = S.phase === 1 ? 'red' : (['green', 'yellow', 'red'] as const)[S.light];

    const cy = Math.cos(pathYaw), sy = Math.sin(pathYaw);
    const toWorld = (ox: number, oy: number, oz: number, out: THREE.Vector3) => out.set(p.x + ox * cy + oz * sy, p.y + oy, p.z - ox * sy + oz * cy);
    toWorld(R.ox, R.oy, R.oz, followPos);
    toWorld(0, R.ly, R.lz, followLook);
    camPos.copy(followPos).lerp(STATIC_POS, R.sb);
    camLook.copy(followLook).lerp(tmpV.copy(followLook).lerp(STATIC_LOOK, 1 - R.lb), R.sb);
    camPos.lerp(CCTV_POS, R.wb);
    camLook.lerp(CCTV_LOOK, R.wb);
    cineCam.position.copy(camPos); cineCam.lookAt(camLook);
    cineCam.fov = R.fov * fovScale; cineCam.updateProjectionMatrix();

    trackPt.copy(CCTV_LOOK).lerp(tmpV2.copy(p).setY(0.6), 0.88);
    cctvCam.position.copy(CCTV_POS); cctvCam.lookAt(S.phase === 1 ? trackPt : CCTV_LOOK);
    cctvCam.fov = (40 - 6 * S.zoom) * fovScale; cctvCam.updateProjectionMatrix();
    activeCam = S.phase === 1 ? cctvCam : cineCam;
    renderPass.camera = activeCam;

    city.update(t, { mainSignal: signal, alert: S.track >= 3, track: S.phase === 1 ? trackPt : null, mainBeam: S.phase === 0 && R.wb < 0.5 });
    updateSmoke(t);
    smokeMat.uniforms['uScale'].value = (H * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(activeCam.fov) / 2));
    cctvPass.uniforms['uAmount'].value = S.cctv;
    cctvPass.uniforms['uGlitch'].value = S.glitch;
    cctvPass.uniforms['uTime'].value = t;
    composer.render();

    // ── HUD ──
    hud.cctv.style.opacity = String(S.cctv);
    hud.fade.style.opacity = String(S.fade);
    hud.flash.style.opacity = String(S.flash);
    hud.alert.style.opacity = String(S.alert);
    hud.alert.style.transform = `translateX(-50%) scale(${0.85 + 0.15 * S.alert})`;
    hud.alertInfo.style.opacity = String(S.alert);
    hud.alertInfo.style.transform = `translateX(${(1 - S.alert) * 24}px)`;
    const tSpeed = S.phase === 1 && t > T_DETECT ? T_DETECT : t;
    const sp = speedTable[Math.min(speedTable.length - 1, Math.round(tSpeed * 60))] || 0;
    hud.speed.textContent = `SPEED ${Math.round(sp)} KM/H`;
    hud.freezeChip.style.opacity = String(S.freeze);
    hud.alertSpeed.textContent = S.track >= 3 ? `${Math.round(speedTable[Math.round(T_DETECT * 60)] || sp)} KM/H` : '— KM/H';
    const secs = 7 + S.rc * 0.5;
    hud.clock.textContent = `00:12:${pad2(Math.floor(secs))}.${pad2(Math.floor((secs % 1) * 100))}`;
    hud.trackState.textContent = ['SCANNING', 'ACQUIRING', 'TRACKING #017', 'VIOLATION'][S.track];
    hud.trackState.classList.toggle('red', S.track >= 2);

    if (S.phase === 1 && S.track >= 1) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        tmpV.set(i & 1 ? carLocalBox.max.x : carLocalBox.min.x, i & 2 ? carLocalBox.max.y : carLocalBox.min.y, i & 4 ? carLocalBox.max.z : carLocalBox.min.z)
          .applyMatrix4(carTilt.matrixWorld).project(activeCam);
        const sx = (tmpV.x * 0.5 + 0.5) * W, syy = (-tmpV.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, syy); y1 = Math.max(y1, syy);
      }
      const pad = 6;
      hud.box.style.opacity = '1';
      hud.box.style.transform = `translate(${x0 - pad}px, ${y0 - pad}px)`;
      hud.box.style.width = `${x1 - x0 + pad * 2}px`;
      hud.box.style.height = `${y1 - y0 + pad * 2}px`;
      hud.box.classList.toggle('acquire', S.track === 1);
      hud.boxTag.textContent = S.track === 1 ? 'ACQUIRING…' : S.track === 2 ? 'VEHICLE · SUPERCAR 0.98' : 'VIOLATION · RED LIGHT';
      hud.boxMeta.textContent = S.track === 1 ? 'OBJECT DETECTED' : `ID #017 · ${Math.round(sp)} KM/H`;
    } else hud.box.style.opacity = '0';
  }

  // ══════════════════ VÒNG LẶP · ĐIỀU KHIỂN ══════════════════
  let raf = 0;
  let running = false;
  const clock = new THREE.Clock();
  const frame = () => {
    raf = requestAnimationFrame(frame);
    tl.time((tl.time() + Math.min(0.05, clock.getDelta())) % DUR);
    renderAt(tl.time());
  };

  function setSize(width: number, height: number) {
    W = Math.max(1, width); H = Math.max(1, height);
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    const pr = renderer.getPixelRatio();
    city.setSize(W * pr, H * pr);
    cctvPass.uniforms['uRes'].value.set(W * pr, H * pr);
    const aspect = W / H;
    fovScale = aspect < 1 ? 1.55 : aspect < 1.4 ? 1.2 : 1;     // màn hình dọc: mở rộng góc nhìn để vẫn thấy xe
    // Dịch khung hình (không di chuyển camera): màn hình ngang -> tâm cảnh sang phải (chữ hero ở bên trái);
    // màn hình dọc -> tâm cảnh lên trên (chữ hero ở nửa dưới). Khung đỏ vẫn khớp vì dùng chung ma trận chiếu.
    const shiftX = aspect >= 1.2 ? W * 0.17 : 0;
    const shiftY = aspect < 1 ? H * 0.26 : 0;
    for (const c of [cineCam, cctvCam]) {
      c.aspect = aspect;
      if (shiftX || shiftY) c.setViewOffset(W, H, -shiftX, shiftY, W, H); else c.clearViewOffset();
      c.updateProjectionMatrix();
    }
    if (!running) renderAt(tl.time());
  }

  const play = () => {
    if (running) return;
    running = true;
    clock.getDelta();
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  return {
    duration: DUR,
    play,
    pause,
    showStill(t = 2.5) {
      pause();
      tl.time(t, false);
      renderAt(t);
    },
    setSize,
    dispose() {
      pause();
      tl.kill();
      const seen = new Set<unknown>();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mt of mats) {
          if (seen.has(mt)) continue;
          seen.add(mt);
          for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
          (mt as THREE.ShaderMaterial).uniforms && Object.values((mt as THREE.ShaderMaterial).uniforms).forEach((u) => (u.value as THREE.Texture)?.isTexture && (u.value as THREE.Texture).dispose());
          mt.dispose();
        }
      });
      city.roads.reflector.dispose();
      atmosphere.environment.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
