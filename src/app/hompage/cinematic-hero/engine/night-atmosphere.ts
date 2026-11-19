// cinematic-hero/engine/NightAtmosphere.js — bầu trời đêm (hình học thật), sương, ánh trăng đổ bóng, bản đồ phản chiếu môi trường
import * as THREE from 'three';

export class NightAtmosphere {
  environment: any;
  fog: any;
  group: any;
  moon: any;
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ fogColor?: number, fogDensity?: number, shadowSize?: number }} opts
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    { fogColor = 0x060a14, fogDensity = 0.0105, shadowSize = 2048 }: { fogColor?: number; fogDensity?: number; shadowSize?: number } = {},
  ) {
    this.group = new THREE.Group();
    this.fog = new THREE.FogExp2(fogColor, fogDensity);

    // Vòm trời gradient: đỉnh gần đen, chân trời ánh xanh của đô thị (không phải ảnh nền phẳng)
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(520, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(0x010207) }, horizon: { value: new THREE.Color(0x0b1730) }, glow: { value: new THREE.Color(0x1d3a7a) } },
        vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 top, horizon, glow; varying vec3 vP;
          void main(){
            float h = clamp(vP.y, 0.0, 1.0);
            vec3 c = mix(horizon, top, pow(h, 0.45));
            c += glow * pow(1.0 - h, 14.0) * 0.55;            // quầng sáng đô thị sát chân trời
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.renderOrder = -1;
    this.group.add(sky);

    // Ánh sáng nền rất yếu + trăng lạnh (đổ bóng tòa nhà và xe xuống mặt đường)
    this.group.add(new THREE.HemisphereLight(0x1d2a4d, 0x020305, 0.32));
    const moon = new THREE.DirectionalLight(0x9db2ff, 0.32);
    moon.position.set(-40, 80, -30);
    moon.castShadow = true;
    moon.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(moon.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 220 });
    moon.shadow.camera.updateProjectionMatrix();
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.04;
    this.group.add(moon, moon.target);
    this.moon = moon;

    // Bản đồ phản chiếu: "studio đô thị ban đêm" dựng bằng các tấm phát sáng
    // -> sơn xe có dải phản chiếu dài như quảng cáo ô tô (lam, đỏ, trắng ấm)
    this.environment = NightAtmosphere.buildEnvironment(renderer);
  }

  static buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x020308);
    const panel = (w: number, h: number, color: number, intensity: number, pos: THREE.Vector3, look: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.copy(pos); m.lookAt(look); env.add(m);
    };
    const o = new THREE.Vector3();
    panel(14, 1.4, 0xffffff, 3.2, new THREE.Vector3(0, 9, 0), o);                 // dải sáng trên đầu (softbox)
    panel(10, 0.9, 0xcfe0ff, 2.2, new THREE.Vector3(0, 7, -8), o);
    panel(18, 5, 0x2f6bff, 1.6, new THREE.Vector3(-12, 3, 4), o);                  // tường kính xanh của tòa nhà
    panel(8, 4, 0xff2a48, 1.4, new THREE.Vector3(12, 2.5, -6), o);                // biển LED đỏ
    panel(30, 2.5, 0xffb070, 0.9, new THREE.Vector3(0, 1.5, 14), o);              // dãy đèn đường xa
    panel(40, 10, 0x0a1430, 1.0, new THREE.Vector3(0, -6, 0), new THREE.Vector3(0, 1, 0)); // mặt đường tối ánh xanh
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    return tex;
  }

  /** Gắn vào scene. */
  applyTo(scene: THREE.Scene): this {
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x010207);
    scene.environment = this.environment;
    scene.environmentIntensity = 0.55;
    return this;
  }
}
