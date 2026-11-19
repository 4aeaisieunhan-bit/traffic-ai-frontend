// cinematic-hero/engine/TrafficSignal.js — cột đèn tín hiệu có tay vươn qua các làn xe, đổi trạng thái đỏ / vàng / xanh
import * as THREE from 'three';
import { glowSprite, poleMaterial } from './util';

export type SignalState = 'red' | 'yellow' | 'green';
const COLORS: Record<SignalState, number> = { red: 0xff1d30, yellow: 0xffad00, green: 0x16ff86 };
const housingMat = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.45, metalness: 0.3 });
const visorMat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.6, side: THREE.DoubleSide });

export class TrafficSignal {
  group: any;
  lamps: any;
  light: any;
  state: any;
  /**
   * Hệ toạ độ cục bộ: tay đèn chạy theo +X, mặt đèn nhìn về -Z (về phía xe đang tới).
   * @param {{ position: THREE.Vector3, rotationY?: number, armLength?: number, heads?: number[], height?: number }} o
   *   heads: vị trí các cụm đèn dọc theo tay (m tính từ cột)
   */
  constructor({ position, rotationY = 0, armLength = 11, heads = [4.5, 9.0], height = 6.4 }:
    { position: THREE.Vector3; rotationY?: number; armLength?: number; heads?: number[]; height?: number }) {
    this.group = new THREE.Group();
    const pm = poleMaterial();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, height + 0.8, 14), pm);
    pole.position.y = (height + 0.8) / 2; pole.castShadow = true;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, armLength, 10), pm);
    arm.rotation.z = Math.PI / 2; arm.position.set(armLength / 2, height, 0); arm.castShadow = true;
    this.group.add(pole, arm);

    this.lamps = { red: [], yellow: [], green: [] };
    for (const hx of heads) this.head(new THREE.Vector3(hx, height - 1.15, 0));
    this.head(new THREE.Vector3(0.0, 3.4, -0.32), 0.8);   // cụm đèn phụ trên cột (tầm mắt)

    this.light = new THREE.PointLight(COLORS.red, 0, 18, 1.8);
    this.light.position.set(heads[heads.length - 1], height - 1.6, -1.2);
    this.group.add(this.light);

    this.group.position.copy(position);
    this.group.rotation.y = rotationY;
    this.state = null;
  }

  private head(pos: THREE.Vector3, scale = 1) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.36, 0.36), housingMat);
    box.castShadow = true;
    g.add(box);
    (['red', 'yellow', 'green'] as SignalState[]).forEach((k, i) => {
      const y = 0.44 - i * 0.44;
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: COLORS[k], emissiveIntensity: 0.03 });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), mat);
      disc.position.set(0, y, -0.185); disc.rotation.y = Math.PI;
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 16, 1, true, 0, Math.PI), visorMat);
      visor.rotation.x = Math.PI / 2; visor.rotation.z = Math.PI; visor.position.set(0, y + 0.02, -0.29);
      const halo = glowSprite(COLORS[k], 0.85, 0);
      halo.position.set(0, y, -0.4);
      g.add(disc, visor, halo);
      this.lamps[k].push({ mat, halo });
    });
    g.position.copy(pos); g.scale.setScalar(scale);
    this.group.add(g);
  }

  /** @param {'red'|'yellow'|'green'} state */
  setState(state: SignalState) {
    if (state === this.state) return;
    this.state = state;
    for (const k of Object.keys(this.lamps) as SignalState[]) for (const { mat, halo } of this.lamps[k]) {
      const on = k === state;
      mat.emissiveIntensity = on ? 4.5 : 0.03;
      halo.material.opacity = on ? 0.55 : 0;
    }
    this.light.color.setHex(COLORS[state]);
    this.light.intensity = state === 'green' ? 8 : 14;
  }
}
