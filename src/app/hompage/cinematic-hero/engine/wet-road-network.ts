// cinematic-hero/engine/WetRoadNetwork.js — ngã tư nhiều làn: mặt nhựa hơi ướt có phản chiếu, vạch kẻ, vạch dừng, vạch người đi bộ, vỉa hè
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { canvasTexture, mulberry32 } from './util';

export class WetRoadNetwork {
  crossFrom: any;
  crossTo: any;
  group: any;
  half: any;
  laneWidth: any;
  lanes: any;
  length: any;
  reflectionScale: any;
  reflector: any;
  sidewalk: any;
  stopDist: any;
  stopLineMaterial: any;
  stopLines: any;
  /**
   * Đường chính theo trục Z, đường ngang theo trục X, giao nhau tại gốc toạ độ.
   * Giao thông bên phải: hướng +Z dùng các làn x ∈ [-half, 0].
   * @param {{ lanes?: number, laneWidth?: number, sidewalk?: number, length?: number, reflectionScale?: number }} opts
   */
  constructor({ lanes = 3, laneWidth = 3.5, sidewalk = 5.5, length = 420, reflectionScale = 0.5 }:
    { lanes?: number; laneWidth?: number; sidewalk?: number; length?: number; reflectionScale?: number } = {}) {
    this.group = new THREE.Group();
    this.lanes = lanes;
    this.laneWidth = laneWidth;
    this.half = lanes * laneWidth;                    // 10.5 m
    this.sidewalk = sidewalk;
    this.crossFrom = this.half + 0.9;                 // vạch người đi bộ
    this.crossTo = this.half + 4.1;
    this.stopDist = this.half + 5.0;                  // vạch dừng cách tâm 15.5 m
    this.length = length;
    this.reflectionScale = reflectionScale;

    this.buildSurface();
    this.buildMarkings();
    this.buildSidewalks();
  }

  // ── Mặt đường: gương phản chiếu bên dưới + lớp nhựa bán trong suốt (vũng nước trong hơn) ──
  private buildSurface() {
    const L = this.length;
    this.reflector = new Reflector(new THREE.PlaneGeometry(L, L), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6c717c });
    this.reflector.rotation.x = -Math.PI / 2;
    this.group.add(this.reflector);

    const asphalt = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#2a2c31'; g.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let i = 0; i < 30000; i++) {
        const v = 24 + Math.floor(r() * 44);
        g.fillStyle = `rgba(${v},${v},${v + 4},${0.3 + r() * 0.55})`;
        g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
      for (let i = 0; i < 26; i++) {
        g.fillStyle = `rgba(8,8,10,${0.07 + r() * 0.1})`;
        g.beginPath(); g.ellipse(r() * w, r() * h, 18 + r() * 60, 6 + r() * 26, r() * 3, 0, Math.PI * 2); g.fill();
      }
    });
    // Mặt nạ độ ướt: phần lớn khô (đục), rải rác vũng nước nông (trong -> thấy phản chiếu)
    const wet = canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
      const r = mulberry32(9);
      for (let i = 0; i < 90; i++) {
        const x = r() * w, y = r() * h, rad = 20 + r() * 110, d = 40 + r() * 70;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(${d},${d},${d},0.95)`); grd.addColorStop(0.6, `rgba(${d},${d},${d},0.5)`); grd.addColorStop(1, 'rgba(220,220,220,0)');
        g.fillStyle = grd;
        g.beginPath(); g.ellipse(x, y, rad * (0.6 + r()), rad * (0.3 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
      }
    }, { srgb: false });

    const mat = (rx: number, ry: number) => {
      const map = asphalt.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
      const a = wet.clone(); a.repeat.set(rx / 3, ry / 3); a.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        color: 0x8d9099, map, roughness: 0.55, roughnessMap: a, metalness: 0, transparent: true, alphaMap: a, envMapIntensity: 0.6,
      });
    };
    const w = this.half * 2;
    const main = new THREE.Mesh(new THREE.PlaneGeometry(w, L), mat(3, 60));
    main.rotation.x = -Math.PI / 2; main.position.y = 0.002; main.receiveShadow = true;
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(L, w), mat(60, 3));
    cross.rotation.x = -Math.PI / 2; cross.position.y = 0.0025; cross.receiveShadow = true;
    this.group.add(main, cross);
  }

  // ── Vạch kẻ đường ──
  private buildMarkings() {
    const white = new THREE.MeshStandardMaterial({ color: 0xe9ecf2, roughness: 0.45, emissive: 0x23252b });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe0ab1f, roughness: 0.5, emissive: 0x1d1404 });
    this.stopLineMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.5, emissive: 0xb4bac6, emissiveIntensity: 0.32 });
    const H = this.half, lw = this.laneWidth, L = this.length / 2;
    const pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();      // gom theo vật liệu -> merge thành ít mesh (tối ưu draw call)
    const add = (mat: THREE.Material, w: number, d: number, x: number, z: number) => {
      const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, 0.006, z);
      if (!pieces.has(mat)) pieces.set(mat, []);
      pieces.get(mat)!.push(g);
    };
    const outside = (v: number) => Math.abs(v) > this.crossTo + 0.6;
    // Đường chính (Z) & đường ngang (X): vạch đôi vàng giữa, vạch trắng đứt chia làn, vạch trắng liền mép
    for (const along of ['z', 'x']) {
      const put = (w: number, d: number, a: number, b: number, mat: THREE.Material) =>
        (along === 'z' ? add(mat, w, d, a, b) : add(mat, d, w, b, a));
      // vạch liền (chia đoạn để không cắt qua ngã tư)
      for (const sign of [-1, 1]) {
        const segLen = L - (this.crossTo + 0.6), segMid = sign * (this.crossTo + 0.6 + segLen / 2);
        put(0.14, segLen, -0.16, segMid, yellow); put(0.14, segLen, 0.16, segMid, yellow);
        put(0.2, segLen, -H + 0.35, segMid, white); put(0.2, segLen, H - 0.35, segMid, white);
      }
      // vạch đứt chia làn: dài 3 m, cách 6 m
      for (let k = 1; k < this.lanes; k++) for (const side of [-1, 1]) {
        for (let s = -L + 2; s < L; s += 9) { if (!outside(s) || !outside(s + 3)) continue; put(0.15, 3, side * k * lw, s + 1.5, white); }
      }
    }
    // Vạch người đi bộ 4 phía
    const cw = this.crossTo - this.crossFrom, cm = (this.crossFrom + this.crossTo) / 2;
    for (let x = -H + 0.6; x <= H - 0.6; x += 1.3) { add(white, 0.65, cw, x, -cm); add(white, 0.65, cw, x, cm); }
    for (let z = -H + 0.6; z <= H - 0.6; z += 1.3) { add(white, cw, 0.65, -cm, z); add(white, cw, 0.65, cm, z); }
    for (const [mat, list] of pieces) {
      const merged = mergeGeometries(list);
      const m = new THREE.Mesh(merged, mat); m.receiveShadow = true; this.group.add(m);
    }
    // Vạch dừng (mesh riêng để đổi màu khi vi phạm) — 4 hướng, chỉ phủ nửa đường của chiều đi tới
    const sd = this.stopDist;
    this.stopLines = {
      north: this.stopLine(H, 0.55, -H / 2, -sd),   // xe đi về +Z (hướng của siêu xe)
      south: this.stopLine(H, 0.55, H / 2, sd),
      east: this.stopLine(0.55, H, -sd, H / 2),
      west: this.stopLine(0.55, H, sd, -H / 2),
    };
  }

  private stopLine(w: number, d: number, x: number, z: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.stopLineMaterial);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.008, z); m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  // ── Vỉa hè 4 góc + bó vỉa ──
  private buildSidewalks() {
    const H = this.half, S = this.length / 2;
    const tile = canvasTexture(256, 256, (g, w) => {
      g.fillStyle = '#3a3d44'; g.fillRect(0, 0, w, w);
      const r = mulberry32(12);
      for (let i = 0; i < 9000; i++) { const v = 45 + r() * 30; g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`; g.fillRect(r() * w, r() * w, 2, 2); }
      g.strokeStyle = 'rgba(15,16,20,0.9)'; g.lineWidth = 3;
      for (let i = 0; i <= w; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    });
    tile.repeat.set(60, 60);
    const walk = new THREE.MeshStandardMaterial({ color: 0x9a9ea8, map: tile, roughness: 0.8, metalness: 0 });
    const curb = new THREE.MeshStandardMaterial({ color: 0x6d717b, roughness: 0.65 });
    const size = S - H;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.16, size), walk);
      slab.position.set(sx * (H + size / 2), 0.08, sz * (H + size / 2));
      slab.receiveShadow = true;
      const cx = new THREE.Mesh(new THREE.BoxGeometry(size, 0.18, 0.3), curb); cx.position.set(sx * (H + size / 2), 0.09, sz * (H + 0.15));
      const cz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, size), curb); cz.position.set(sx * (H + 0.15), 0.09, sz * (H + size / 2));
      cx.receiveShadow = cz.receiveShadow = true;
      this.group.add(slab, cx, cz);
    }
  }

  /** Vạch dừng nhấp nháy đỏ khi có vi phạm. */
  setStopLineAlert(on: boolean, t = 0) {
    const m = this.stopLineMaterial;
    if (on) { const k = 0.5 + 0.5 * Math.sin(t * 12); m.color.setHex(0xff3344); m.emissive.setRGB(1, 0.07, 0.12); m.emissiveIntensity = 1.2 + 2.4 * k; }
    else { m.color.setHex(0xf2f4f8); m.emissive.setHex(0xb4bac6); m.emissiveIntensity = 0.32; }
  }

  /** Cập nhật độ phân giải phản chiếu theo kích thước màn hình (W, H đã nhân pixelRatio). */
  setSize(w: number, h: number) {
    this.reflector.getRenderTarget().setSize(Math.round(w * this.reflectionScale), Math.round(h * this.reflectionScale));
  }
}

/** Gộp nhiều BufferGeometry cùng thuộc tính (position/normal/uv) thành 1 (không cần BufferGeometryUtils). */
export function mergeGeometries(list: THREE.BufferGeometry[]) {
  let vCount = 0, iCount = 0;
  for (const g of list) { vCount += g.attributes['position'].count; iCount += g.index ? g.index.count : g.attributes['position'].count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx: Uint32Array | Uint16Array = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes['position'].array, vo * 3);
    nor.set(g.attributes['normal'].array, vo * 3);
    uv.set(g.attributes['uv'].array, vo * 2);
    const src: ArrayLike<number> = g.index ? g.index.array : [...Array(g.attributes['position'].count).keys()];
    for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
    vo += g.attributes['position'].count; io += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
