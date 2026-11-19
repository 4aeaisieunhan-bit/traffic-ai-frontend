// cinematic-hero/engine/SurveillanceCamera.js — camera giám sát AI trên cột: thân camera, đèn LED, tia quét xanh (đỏ khi phát hiện vi phạm)
import * as THREE from 'three';
import { aimBeam, beamCone, glowSprite, poleMaterial } from './util';

const shellMat = new THREE.MeshStandardMaterial({ color: 0xd9dee7, roughness: 0.28, metalness: 0.45 });
const shellDark = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.5, metalness: 0.6 });

export class SurveillanceCamera {
  alert: any;
  alertColor: any;
  baseTarget: any;
  beam: any;
  beamRadiusPerM: any;
  group: any;
  head: any;
  led: any;
  ledHalo: any;
  lensMat: any;
  lensPosition: any;
  scanColor: any;
  sweep: any;
  target: any;
  /**
   * @param {{ pole: THREE.Vector3, head: THREE.Vector3, target: THREE.Vector3, height?: number, sweep?: number, scanColor?: number, alertColor?: number }} o
   *   pole: chân cột (y = 0), head: vị trí ống kính, target: điểm nhìn mặc định, sweep: biên độ quét ngang (rad)
   */
  constructor({ pole, head, target, height = 8, sweep = 0.35, scanColor = 0x3b82f6, alertColor = 0xff2d46 }:
    { pole: THREE.Vector3; head: THREE.Vector3; target: THREE.Vector3; height?: number; sweep?: number; scanColor?: number; alertColor?: number }) {
    this.group = new THREE.Group();
    this.lensPosition = head.clone();
    this.baseTarget = target.clone();
    this.target = target.clone();
    this.sweep = sweep;
    this.scanColor = new THREE.Color(scanColor);
    this.alertColor = new THREE.Color(alertColor);
    this.alert = false;

    const pm = poleMaterial();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, height, 12), pm);
    p.position.set(pole.x, height / 2, pole.z); p.castShadow = true;
    this.group.add(p);
    // Tay đỡ từ đỉnh cột tới camera
    const top = new THREE.Vector3(pole.x, height - 0.3, pole.z);
    const armLen = top.distanceTo(new THREE.Vector3(head.x, top.y, head.z));
    if (armLen > 0.3) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, armLen), pm);
      arm.position.set((top.x + head.x) / 2, top.y, (top.z + head.z) / 2);
      arm.lookAt(new THREE.Vector3(head.x, top.y, head.z));
      arm.castShadow = true;
      this.group.add(arm);
    }
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.1, Math.max(0.1, top.y - head.y - 0.1), 0.1), pm);
    mount.position.set(head.x, (top.y + head.y) / 2 + 0.1, head.z);
    this.group.add(mount);

    // Đầu camera (xoay theo mục tiêu)
    this.head = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.05), shellMat);
    body.position.z = -0.42; body.castShadow = true;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 1.25), shellMat); hood.position.set(0, 0.24, -0.35);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.12), shellDark); back.position.z = -0.98;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 24),
      new THREE.MeshStandardMaterial({ color: 0x030405, roughness: 0.1, metalness: 0.9, emissive: scanColor, emissiveIntensity: 1.4 }));
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.12;
    this.lensMat = lens.material;
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.25) }));
    this.led.position.set(0.15, 0.13, 0.1);
    this.ledHalo = glowSprite(0xff2236, 0.5, 0.8); this.ledHalo.position.copy(this.led.position);
    this.head.add(body, hood, back, lens, this.led, this.ledHalo);
    this.head.position.copy(head);
    this.group.add(this.head);

    // Tia quét AI (nón sáng mờ từ ống kính tới mặt đường)
    this.beam = beamCone(1, 1, scanColor, 0.018);
    this.beamRadiusPerM = 0.16;
    this.group.add(this.beam);
    this.aim();
  }

  private aim() {
    this.head.lookAt(this.target);
    aimBeam(this.beam, this.lensPosition, this.target);
    const L = this.lensPosition.distanceTo(this.target);
    this.beam.scale.x = this.beam.scale.z = L * this.beamRadiusPerM;
  }

  /** Bật / tắt trạng thái phát hiện vi phạm (tia quét đỏ, LED nháy nhanh). */
  setAlert(on: boolean) {
    this.alert = on;
    this.beam.material.uniforms['uColor'].value.copy(on ? this.alertColor : this.scanColor);
    this.beam.material.uniforms['uIntensity'].value = on ? 0.03 : 0.018;
    this.lensMat.emissive.copy(on ? this.alertColor : this.scanColor);
  }

  /**
   * @param {number} t thời gian (s)
   * @param {THREE.Vector3|null} track nếu có: camera bám theo điểm này thay vì quét tự động
   */
  update(t: number, track: THREE.Vector3 | null = null) {
    if (track) this.target.copy(track);
    else {
      const a = Math.sin(t * 0.6 + this.lensPosition.x) * this.sweep;
      const d = this.baseTarget.clone().sub(this.lensPosition);
      d.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      this.target.copy(this.lensPosition).add(d);
    }
    this.aim();
    const blink = this.alert ? (Math.floor(t * 8) % 2) : (Math.floor(t * 1.5) % 2);
    this.led.material.color.setRGB(blink ? 4 : 0.3, 0.15, 0.25);
    this.ledHalo.material.opacity = blink ? 0.85 : 0.05;
  }
}
