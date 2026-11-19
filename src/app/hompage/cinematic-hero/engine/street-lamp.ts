// cinematic-hero/engine/StreetLamp.js — đèn đường LED hiện đại (cột thép mảnh, đầu đèn dẹt), tuỳ chọn ánh sáng thật + đổ bóng
import * as THREE from 'three';
import { beamCone, glowSprite, poleMaterial } from './util';

const headMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.4, metalness: 0.7, emissive: 0xe4eeff, emissiveIntensity: 0 });
const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf1ff).multiplyScalar(3.2) });

export class StreetLamp {
  group: any;
  light: any;
  /**
   * @param {{ position: THREE.Vector3, facing: THREE.Vector3, height?: number, arm?: number, light?: boolean, castShadow?: boolean, color?: number }} o
   *   facing: hướng tay đèn vươn ra (về phía lòng đường), mặt phẳng XZ
   */
  constructor({ position, facing, height = 9.5, arm = 2.6, light = false, castShadow = false, color = 0xd6e4ff }:
    { position: THREE.Vector3; facing: THREE.Vector3; height?: number; arm?: number; light?: boolean; castShadow?: boolean; color?: number }) {
    this.group = new THREE.Group();
    const pm = poleMaterial();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, height, 12), pm);
    pole.position.y = height / 2; pole.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 12), pm);
    base.position.y = 0.3;
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, arm), pm);
    armMesh.position.set(0, height - 0.05, arm / 2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 1.2), headMat);
    head.position.set(0, height - 0.14, arm - 0.2);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.0), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.set(0, height - 0.2, arm - 0.2);
    this.group.add(pole, base, armMesh, head, lens);

    const lampPos = new THREE.Vector3(0, height - 0.25, arm - 0.2);
    const halo = glowSprite(0xdbe7ff, 1.8, 0.85); halo.position.copy(lampPos); this.group.add(halo);
    const cone = beamCone(4.2, height - 0.3, color, 0.024); cone.position.copy(lampPos); this.group.add(cone);

    if (light) {
      const spot = new THREE.SpotLight(color, 360, 34, 0.95, 0.7, 1.7);
      spot.position.copy(lampPos);
      spot.target.position.set(0, 0, arm + 0.6);
      if (castShadow) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.03;
        spot.shadow.camera.near = 1; spot.shadow.camera.far = 30;
      }
      this.group.add(spot, spot.target);
      this.light = spot;
    }

    this.group.position.copy(position);
    this.group.rotation.y = Math.atan2(facing.x, facing.z);
  }
}
