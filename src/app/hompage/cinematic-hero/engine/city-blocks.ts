// cinematic-hero/engine/CityBlocks.js — tòa nhà cao tầng hiện đại: khối đế cửa hàng sáng đèn, mặt dựng kính, viền LED xanh/đỏ, đèn báo không lưu
import * as THREE from 'three';
import { canvasTexture, mulberry32, worldScaleBoxUV, glowSprite } from './util';

const PANEL_W = 1.8;   // m / ô kính
const FLOOR_H = 3.6;   // m / tầng

export class CityBlocks {
  accentBlue: any;
  accentRed: any;
  beacons: any;
  blueLed: any;
  front: any;
  glassMats: any;
  group: any;
  podiumMat: any;
  rand: any;
  redLed: any;
  roofMat: any;
  /**
   * @param {{ roadHalf: number, sidewalk: number, seed?: number, accentBlue?: number, accentRed?: number }} opts
   */
  constructor({ roadHalf, sidewalk, seed = 31, accentBlue = 0x3b82f6, accentRed = 0xf43f5e }:
    { roadHalf: number; sidewalk: number; seed?: number; accentBlue?: number; accentRed?: number }) {
    this.group = new THREE.Group();
    this.front = roadHalf + sidewalk + 0.5;            // mặt tiền cách tim đường
    this.rand = mulberry32(seed);
    this.beacons = [];                                  // đèn báo không lưu (nhấp nháy)
    this.accentBlue = accentBlue;
    this.accentRed = accentRed;

    // Vật liệu dùng chung (UV theo mét -> 1 texture cho mọi khối)
    this.glassMats = [1, 2, 3, 4].map((s) => new THREE.MeshStandardMaterial({
      color: 0x0b111c, roughness: 0.16, metalness: 0.9, envMapIntensity: 1.25,
      emissive: 0xffffff, emissiveMap: CityBlocks.curtainWall(s), emissiveIntensity: 0.8,
    }));
    this.podiumMat = new THREE.MeshStandardMaterial({
      color: 0x101319, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.1, emissive: 0xffffff, emissiveMap: CityBlocks.shopfront(7), emissiveIntensity: 0.55,
    });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.8, metalness: 0.3 });
    this.blueLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentBlue).multiplyScalar(2.4) });
    this.redLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentRed).multiplyScalar(2.2) });

    this.layout();
  }

  // ── Bố cục: dãy nhà hai bên đường chính (Z) và đường ngang (X), để trống giữa ngã tư ──
  private layout() {
    const r = this.rand, F = this.front;
    const rowAlong = (axis: 'x' | 'z', sign: number, from: number, to: number) => {
      for (let s = from; s < to;) {
        const len = Math.min(16 + r() * 14, Math.max(8, to - s));                       // dọc theo đường
        const dep = 16 + r() * 10;                       // vào trong
        const near = Math.min(Math.abs(s), Math.abs(s + len));
        const h = near < 40 ? 38 + r() * 55 : 22 + r() * 70; // gần ngã tư: cao, hoành tráng
        const c = s + len / 2;
        const pos = axis === 'z' ? new THREE.Vector3(sign * (F + dep / 2), 0, c) : new THREE.Vector3(c, 0, sign * (F + dep / 2));
        const [w, d] = axis === 'z' ? [dep, len - 2] : [len - 2, dep];
        this.tower(pos, w, d, h, Math.floor(r() * 4));
        s += len + 1.5 + r() * 3;
      }
    };
    const plaza = F + 9;                                 // góc ngã tư để trống thành quảng trường -> khung hình thoáng
    for (const sign of [-1, 1]) {
      rowAlong('z', sign, -230, -plaza); rowAlong('z', sign, plaza, 160);
      rowAlong('x', sign, -200, -plaza); rowAlong('x', sign, plaza, 200);
    }
    // Dãy cao tầng xa cuối đường chính (chiều sâu bối cảnh, mờ dần trong sương)
    for (let i = 0; i < 9; i++) this.tower(new THREE.Vector3(-70 + i * 17 + r() * 6, 0, -280 - r() * 40), 14, 14, 50 + r() * 90, i % 4, true);
  }

  /** 1 tòa nhà: khối đế (cửa hàng) + thân kính + mái + (tuỳ chọn) viền LED & đèn báo không lưu. */
  tower(pos: THREE.Vector3, w: number, d: number, h: number, variant = 0, far = false) {
    const r = this.rand;
    const podiumH = far ? 0 : 7;
    if (podiumH) {
      const pg = worldScaleBoxUV(new THREE.BoxGeometry(w, podiumH, d), w, podiumH, d, 24, podiumH);
      const pod = new THREE.Mesh(pg, this.podiumMat);
      pod.position.set(pos.x, podiumH / 2, pos.z);
      pod.receiveShadow = true;
      this.group.add(pod);
    }
    const inset = far ? 0 : 1.2;
    const tw = w - inset * 2, td = d - inset * 2, th = h - podiumH;
    const g = worldScaleBoxUV(new THREE.BoxGeometry(tw, th, td), tw, th, td, PANEL_W * 4, FLOOR_H * 8);
    const body = new THREE.Mesh(g, this.glassMats[variant % 4]);
    body.position.set(pos.x, podiumH + th / 2, pos.z);
    body.castShadow = !far; body.receiveShadow = !far;
    this.group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(tw * 0.6, 2.2, td * 0.6), this.roofMat);
    roof.position.set(pos.x, h + 1.1, pos.z);
    this.group.add(roof);
    if (far) return body;

    // Viền LED: dọc các cạnh (xanh) hoặc vương miện trên đỉnh (xanh / đỏ)
    const roll = r();
    if (roll < 0.35) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, th, 0.18), this.blueLed);
        strip.position.set(pos.x + sx * (tw / 2 + 0.05), podiumH + th / 2, pos.z + sz * (td / 2 + 0.05));
        this.group.add(strip);
      }
    } else if (roll < 0.6) {
      const mat = r() < 0.55 ? this.blueLed : this.redLed;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.3, 0.35, td + 0.3), mat);
      crown.position.set(pos.x, h - 0.6, pos.z);
      this.group.add(crown);
    }
    // Dải LED xanh chạy dọc mái hiên khối đế (đổ ánh xanh xuống vỉa hè)
    if (podiumH && r() < 0.5) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), this.blueLed);
      band.position.set(pos.x, podiumH + 0.05, pos.z);
      this.group.add(band);
    }
    // Đèn báo không lưu trên nóc nhà cao
    if (h > 55) {
      const b = glowSprite(0xff2236, 3.2, 1);
      b.position.set(pos.x, h + 2.8, pos.z);
      b.userData['phase'] = r() * 6.28;
      this.group.add(b);
      this.beacons.push(b);
    }
    return body;
  }

  /** Nhấp nháy đèn báo không lưu. */
  update(t: number) {
    for (const b of this.beacons) {
      const k = Math.max(0, Math.sin(t * 2.4 + b.userData['phase']));
      b.material.opacity = 0.15 + 0.85 * Math.pow(k, 6);
    }
  }

  // ── Texture mặt dựng kính: 4 ô x 8 tầng, khung nhôm tối, kính tối, một phần văn phòng sáng đèn ──
  static curtainWall(seed: number) {
    return canvasTexture(256, 512, (g, w, h) => {
      const r = mulberry32(seed * 101);
      g.fillStyle = '#05070b'; g.fillRect(0, 0, w, h);                  // khung (góc (0,0) tối cho mặt mái)
      const cw = w / 4, ch = h / 8;
      for (let fy = 0; fy < 8; fy++) {
        const floorLit = r() < 0.32;                                   // cả tầng văn phòng sáng
        const tone = r() < 0.6 ? [255, 214 + r() * 30, 160 + r() * 50] : [170, 205 + r() * 30, 255];
        for (let fx = 0; fx < 4; fx++) {
          const lit = floorLit ? r() < 0.85 : r() < 0.12;
          const x = fx * cw + 3, y = fy * ch + 3, pw = cw - 6, ph = ch - 7;
          if (lit) {
            const a = 0.45 + r() * 0.5;
            const grd = g.createLinearGradient(0, y, 0, y + ph);
            grd.addColorStop(0, `rgba(${tone[0]},${tone[1] | 0},${tone[2] | 0},${a})`);
            grd.addColorStop(1, `rgba(${tone[0] * 0.7 | 0},${tone[1] * 0.7 | 0},${tone[2] * 0.7 | 0},${a * 0.7})`);
            g.fillStyle = grd;
          } else {
            g.fillStyle = `rgb(${8 + r() * 6},${12 + r() * 8},${22 + r() * 10})`;
          }
          g.fillRect(x, y, pw, ph);
        }
        g.fillStyle = '#020306'; g.fillRect(0, fy * ch + ch - 4, w, 4);   // dầm sàn
      }
    });
  }

  // ── Texture khối đế: mặt kính cửa hàng sáng + biển hiệu màu nhấn ──
  static shopfront(seed: number) {
    return canvasTexture(512, 128, (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = '#030406'; g.fillRect(0, 0, w, h);
      const top = h * 0.48;                                   // ~3.6 m cửa kính phía dưới (podium 7 m)
      for (let x = 0; x < w; x += 64) {                       // 8 ô / 24 m -> mỗi cửa hàng 3 m
        const lit = r() < 0.42;
        const warm = r() < 0.6;
        if (lit) {
          const grd = g.createLinearGradient(0, top, 0, h);
          grd.addColorStop(0, warm ? 'rgba(255,214,160,0.85)' : 'rgba(190,215,255,0.85)');
          grd.addColorStop(1, warm ? 'rgba(110,70,40,0.5)' : 'rgba(40,60,100,0.5)');
          g.fillStyle = grd;
        } else g.fillStyle = 'rgba(14,18,26,1)';
        g.fillRect(x + 5, top, 54, h - top - 5);
        g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(x + 31, top, 2, h - top); g.fillRect(x + 5, top + (h - top) * 0.55, 54, 2);
        if (lit && r() < 0.55) {                              // biển hiệu nhỏ: xanh / đỏ / trắng
          const pick = r();
          g.fillStyle = pick < 0.45 ? 'rgba(59,130,246,1)' : pick < 0.75 ? 'rgba(244,63,94,1)' : 'rgba(225,232,250,1)';
          g.fillRect(x + 14, top * 0.62, 36, top * 0.16);
        }
      }
    });
  }
}
