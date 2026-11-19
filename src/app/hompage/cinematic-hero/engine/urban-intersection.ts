// cinematic-hero/engine/UrbanIntersection.js — ghép toàn bộ môi trường ngã tư đô thị nửa đêm thành 1 component tái sử dụng
import * as THREE from 'three';
import { WetRoadNetwork } from './wet-road-network';
import { CityBlocks } from './city-blocks';
import { StreetLamp } from './street-lamp';
import { TrafficSignal } from './traffic-signal';
import { SurveillanceCamera } from './surveillance-camera';
import type { SignalState } from './traffic-signal';
import { canvasTexture, glowSprite } from './util';

export class UrbanIntersection {
  cameras: any;
  city: any;
  group: any;
  half: any;
  mainCamera: any;
  roads: any;
  signals: any;
  stopZ: any;
  /**
   * @param {{ accentBlue?: number, accentRed?: number, quality?: 'high'|'low' }} opts
   */
  constructor({ accentBlue = 0x3b82f6, accentRed = 0xf43f5e, quality = 'high' }:
    { accentBlue?: number; accentRed?: number; quality?: 'high' | 'low' } = {}) {
    this.group = new THREE.Group();
    this.roads = new WetRoadNetwork({ lanes: 3, laneWidth: 3.5, sidewalk: 5.5, reflectionScale: quality === 'high' ? 0.55 : 0.35 });
    this.group.add(this.roads.group);
    const H = this.roads.half, SD = this.roads.stopDist;
    this.half = H;
    this.stopZ = -SD;                                    // vạch dừng hướng +Z (hướng của siêu xe)

    this.city = new CityBlocks({ roadHalf: H, sidewalk: this.roads.sidewalk, accentBlue, accentRed });
    this.group.add(this.city.group);

    // ── Đèn đường: dọc 2 bên đường chính và đường ngang; chỉ đèn gần ngã tư có ánh sáng thật ──
    const lampOffset = H + 1.9;
    let shadowBudget = 2;
    const addLamp = (pos: THREE.Vector3, facing: THREE.Vector3) => {
      const d = pos.length();
      const light = d < 52;
      const castShadow = light && shadowBudget > 0 && d < 34 && pos.z < 0;
      if (castShadow) shadowBudget--;
      const lamp = new StreetLamp({ position: pos, facing, light, castShadow });
      this.group.add(lamp.group);
    };
    for (let z = -200; z <= 160; z += 30) {
      if (Math.abs(z) < 20) continue;
      addLamp(new THREE.Vector3(-lampOffset, 0, z + 6), new THREE.Vector3(1, 0, 0));
      addLamp(new THREE.Vector3(lampOffset, 0, z - 6), new THREE.Vector3(-1, 0, 0));
    }
    for (let x = -180; x <= 180; x += 30) {
      if (Math.abs(x) < 20) continue;
      addLamp(new THREE.Vector3(x + 6, 0, -lampOffset), new THREE.Vector3(0, 0, 1));
      addLamp(new THREE.Vector3(x - 6, 0, lampOffset), new THREE.Vector3(0, 0, -1));
    }

    // ── Đèn tín hiệu 4 hướng (cột ở góc phải phía trước mỗi hướng xe tới) ──
    const P = H + 1.7, Q = SD + 1.1;
    this.signals = {
      north: new TrafficSignal({ position: new THREE.Vector3(-P, 0, -Q), rotationY: 0 }),
      south: new TrafficSignal({ position: new THREE.Vector3(P, 0, Q), rotationY: Math.PI }),
      east: new TrafficSignal({ position: new THREE.Vector3(-Q, 0, P), rotationY: Math.PI / 2 }),
      west: new TrafficSignal({ position: new THREE.Vector3(Q, 0, -P), rotationY: -Math.PI / 2 }),
    };
    for (const s of Object.values(this.signals) as TrafficSignal[]) this.group.add(s.group);

    // ── Camera giám sát AI ──
    // Camera chính: trên tay vươn ở góc xa ngã tư, nhìn về làn xe hướng +Z (dùng cho góc nhìn giám sát)
    this.mainCamera = new SurveillanceCamera({
      pole: new THREE.Vector3(H + 2.3, 0, 3.0), head: new THREE.Vector3(2.2, 7.6, 2.6),
      target: new THREE.Vector3(-2.4, 0.6, -SD - 9), height: 8.6, sweep: 0.18,
    });
    this.cameras = [
      this.mainCamera,
      new SurveillanceCamera({ pole: new THREE.Vector3(-H - 2.6, 0, -SD - 2.8), head: new THREE.Vector3(-H - 1.6, 7.0, -SD - 2.2), target: new THREE.Vector3(2, 0, 2), sweep: 0.45 }),
      new SurveillanceCamera({ pole: new THREE.Vector3(H + 2.6, 0, -SD - 2.8), head: new THREE.Vector3(H + 1.6, 7.0, -SD - 2.2), target: new THREE.Vector3(-3, 0, -2), sweep: 0.45 }),
      new SurveillanceCamera({ pole: new THREE.Vector3(-H - 2.6, 0, SD + 2.8), head: new THREE.Vector3(-H - 1.6, 7.0, SD + 2.2), target: new THREE.Vector3(3, 0, 1), sweep: 0.45 }),
      new SurveillanceCamera({ pole: new THREE.Vector3(H + 2.4, 0, -64), head: new THREE.Vector3(H + 1.5, 6.6, -63.4), target: new THREE.Vector3(-3, 0, -86), sweep: 0.3 }),
    ];
    for (const c of this.cameras) this.group.add(c.group);

    // ── Ánh sáng nhấn xanh / đỏ (hắt màu xuống vỉa hè + phản chiếu trên mặt đường ướt) ──
    const accent = (color: number, intensity: number, pos: THREE.Vector3, dist = 24) => {
      const l = new THREE.PointLight(color, intensity, dist, 2); l.position.copy(pos); this.group.add(l);
      const g = glowSprite(color, 2.6, 0.55); g.position.copy(pos); this.group.add(g);
    };
    accent(accentBlue, 95, new THREE.Vector3(-H - 6.4, 3.6, -24));
    accent(accentRed, 70, new THREE.Vector3(H + 6.4, 3.2, -34));
    accent(accentBlue, 80, new THREE.Vector3(H + 6.4, 3.6, 26));
    accent(accentRed, 60, new THREE.Vector3(-H - 6.4, 3.2, 30));
    accent(accentBlue, 70, new THREE.Vector3(-26, 3.4, H + 6.4));

    // ── Biển LED / neon trên mặt tiền ──
    const F = this.city.front;
    this.billboard('TRAFFIC AI', '#3b82f6', new THREE.Vector3(F - 0.05, 17, -44), -Math.PI / 2, 14, 4.2);
    this.billboard('LIVE · AI MONITORING', '#f43f5e', new THREE.Vector3(-F + 0.05, 11, -58), Math.PI / 2, 12, 2.2);
    this.billboard('HOTEL', '#f43f5e', new THREE.Vector3(-F + 0.05, 24, -30), Math.PI / 2, 8, 2.4);
    this.billboard('24/7', '#60a5fa', new THREE.Vector3(30, 9, F - 0.05), Math.PI, 6, 2.4);
  }

  private billboard(text: string, color: string, pos: THREE.Vector3, ry: number, w: number, h: number) {
    const tex = canvasTexture(1024, Math.round(1024 * h / w), (g, cw, ch) => {
      g.fillStyle = '#020306'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = color; g.lineWidth = 6; g.globalAlpha = 0.6; g.strokeRect(10, 10, cw - 20, ch - 20); g.globalAlpha = 1;
      g.font = `700 ${Math.round(ch * 0.62)}px Rajdhani, Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color; g.fillText(text, cw / 2, ch / 2 + 6);
      g.shadowBlur = 0; g.globalAlpha = 0.75; g.fillStyle = '#ffffff'; g.fillText(text, cw / 2, ch / 2 + 6);
    }, { repeat: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.9, 1.9, 1.9) }));
    m.position.copy(pos); m.rotation.y = ry;
    this.group.add(m);
    return m;
  }

  /**
   * @param {number} t
   * @param {{ mainSignal?: 'red'|'yellow'|'green', alert?: boolean, track?: THREE.Vector3|null, mainBeam?: boolean }} s
   */
  update(t: number, { mainSignal = 'red', alert = false, track = null, mainBeam = true }:
    { mainSignal?: SignalState; alert?: boolean; track?: THREE.Vector3 | null; mainBeam?: boolean } = {}) {
    this.signals.north.setState(mainSignal);
    this.signals.south.setState(mainSignal);
    const cross = mainSignal === 'red' ? 'green' : 'red';
    this.signals.east.setState(cross);
    this.signals.west.setState(cross);
    this.mainCamera.setAlert(alert);
    this.mainCamera.beam.visible = mainBeam;
    this.mainCamera.update(t, track);
    for (let i = 1; i < this.cameras.length; i++) this.cameras[i].update(t);
    this.city.update(t);
    this.roads.setStopLineAlert(alert, t);
  }

  setSize(w: number, h: number) { this.roads.setSize(w, h); }
}
