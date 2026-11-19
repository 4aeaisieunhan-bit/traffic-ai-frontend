// cinematic-hero/engine/util.js — tiện ích dùng chung: số ngẫu nhiên có hạt giống, texture canvas, UV theo kích thước thật, chùm sáng thể tích
import * as THREE from 'three';

/** Bộ sinh số ngẫu nhiên có hạt giống -> thành phố giống hệt nhau mỗi lần tải. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Texture vẽ bằng canvas 2D (không cần file ảnh). */
export function canvasTexture(
  w: number, h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  { srgb = true, repeat = true }: { srgb?: boolean; repeat?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Đặt UV của BoxGeometry theo kích thước thật (mét) -> 1 texture lặp dùng chung cho mọi tòa nhà
 * (không phải clone texture cho từng khối => ít draw state, tiết kiệm bộ nhớ).
 * Mặt trên/dưới trỏ vào góc (0,0) của texture (vùng khung tối).
 */
export function worldScaleBoxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, cellW: number, cellH: number) {
  const uv = geo.attributes['uv'];
  // Thứ tự mặt của BoxGeometry: +x, -x, +y, -y, +z, -z (mỗi mặt 4 đỉnh)
  const faceW = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 2 || f === 3) { uv.setXY(k, 0.002, 0.002); continue; }
      uv.setXY(k, uv.getX(k) * (faceW[f] / cellW), uv.getY(k) * (h / cellH));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

let _glow: THREE.CanvasTexture | null = null;
/** Texture quầng sáng tròn (cho đèn, halo). */
export function glowTexture(): THREE.CanvasTexture {
  if (_glow) return _glow;
  _glow = canvasTexture(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  }, { repeat: false });
  return _glow;
}

export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.set(size, size, 1);
  return s;
}

/**
 * Nón sáng "thể tích" giả lập (additive): mờ dần theo chiều dài, mềm ở mép,
 * tự giảm khi nhìn dọc trục (đối diện đèn) hoặc khi camera ở quá gần -> không gây chói trắng.
 * Đỉnh nón ở gốc toạ độ, nón chạy theo trục -Y (dùng lookAt + rotateX(-PI/2) để hướng theo +Z).
 */
export function beamCone(radius: number, length: number, color: THREE.ColorRepresentation, intensity: number): THREE.Mesh {
  const g = new THREE.ConeGeometry(radius, 1, 40, 1, true);
  g.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uLength: { value: 1 } },
    vertexShader: `
      varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vHead; varying float vDist;
      void main(){
        vAlong = -position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vec3 axis = normalize((modelViewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz);
        vHead = abs(dot(axis, vV)); vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity;
      varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vHead; varying float vDist;
      void main(){
        float fall = pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.6);
        float edge = pow(abs(dot(vN, vV)), 1.8);
        float headOn = 1.0 - 0.92 * pow(vHead, 2.0);
        float near = smoothstep(0.6, 5.0, vDist);
        gl_FragColor = vec4(uColor * uIntensity * fall * edge * headOn * near, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.scale.set(1, length, 1);
  m.userData['isBeam'] = true;
  return m;
}

/** Hướng nón sáng từ `from` tới `to` (toạ độ cha). */
export function aimBeam(cone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  cone.position.copy(from);
  cone.lookAt(to);
  cone.rotateX(-Math.PI / 2);
  cone.scale.y = from.distanceTo(to);
  return cone;
}

/** Vật liệu kim loại sơn tĩnh điện cho cột đèn, tay đèn… dùng chung. */
let _poleMat: THREE.MeshStandardMaterial | null = null;
export function poleMaterial() {
  return _poleMat || (_poleMat = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.42, metalness: 0.85 }));
}
