import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { DayNight } from "./daynight";

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  varying vec3 vDirection;

  void main() {
    float h = vDirection.y;
    vec3 color = h > 0.0
      ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6))
      : mix(horizon, ground, pow(clamp(-h, 0.0, 1.0), 0.5));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** 天球の半径。カメラの far (2400) より内側であること。 */
const DOME_RADIUS = 1000;
const CELESTIAL_DISTANCE = 900;
const STAR_DISTANCE = 940;
const SUN_SIZE = 90;
const MOON_SIZE = 70;
const STAR_COUNT = 700;

const SUN_COLOR = 0xfff3cf;
const MOON_COLOR = 0xdde6f4;

/** PlaneGeometry の法線。この向きを原点（＝カメラ）に向ける。 */
const PLANE_NORMAL = new Vector3(0, 0, 1);
const scratchDir = new Vector3();
const scratchBack = new Vector3();

/**
 * カメラに追従する天球と、太陽・月・星。
 *
 * 色と位置は DayNight が出した値をそのまま貼るだけ。ここで時刻の計算はしない。
 * 天体は板ポリ（Minecraft と同じく四角い）で、テクスチャもシェーダも使わない。
 */
export class Sky {
  readonly object = new Group();

  private readonly uniforms;
  private readonly domeMaterial: ShaderMaterial;
  private readonly sun: Mesh;
  private readonly moon: Mesh;
  private readonly stars: Points;
  private readonly sunMaterial: MeshBasicMaterial;
  private readonly moonMaterial: MeshBasicMaterial;
  private readonly starMaterial: PointsMaterial;
  private readonly waterColor = new Color();
  private underwater = false;

  constructor(horizonColor: number) {
    this.domeMaterial = new ShaderMaterial({
      uniforms: {
        zenith: { value: new Color(0x3f7fd0) },
        horizon: { value: new Color(horizonColor) },
        ground: { value: new Color(0x4c5a63) },
      },
      vertexShader,
      fragmentShader,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.uniforms = this.domeMaterial.uniforms;

    const dome = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), this.domeMaterial);
    dome.renderOrder = -2;
    this.object.add(dome);

    this.sunMaterial = celestialMaterial(SUN_COLOR);
    this.sun = new Mesh(new PlaneGeometry(SUN_SIZE, SUN_SIZE), this.sunMaterial);
    this.moonMaterial = celestialMaterial(MOON_COLOR);
    this.moon = new Mesh(new PlaneGeometry(MOON_SIZE, MOON_SIZE), this.moonMaterial);

    this.starMaterial = new PointsMaterial({
      color: 0xffffff,
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new Points(starField(), this.starMaterial);

    for (const body of [this.sun, this.moon, this.stars]) {
      // 天球の内側・地形の手前。深度は書かないので地形に隠れる。
      body.renderOrder = -1;
      body.frustumCulled = false;
      this.object.add(body);
    }

    this.object.frustumCulled = false;
  }

  /** 水中では空を水の色で塗り潰し、天体を隠す。 */
  setUnderwater(on: boolean, color: Color): void {
    this.underwater = on;
    this.waterColor.copy(color);
  }

  update(dayNight: DayNight): void {
    if (this.underwater) {
      (this.uniforms.zenith.value as Color).copy(this.waterColor);
      (this.uniforms.horizon.value as Color).copy(this.waterColor);
      (this.uniforms.ground.value as Color).copy(this.waterColor).multiplyScalar(0.5);
      this.sun.visible = false;
      this.moon.visible = false;
      this.stars.visible = false;
      return;
    }

    (this.uniforms.zenith.value as Color).copy(dayNight.zenith);
    (this.uniforms.horizon.value as Color).copy(dayNight.horizon);
    (this.uniforms.ground.value as Color).copy(dayNight.ground);

    place(this.sun, this.sunMaterial, dayNight.sunDirection, dayNight.sunOpacity);
    place(this.moon, this.moonMaterial, dayNight.moonDirection, dayNight.moonOpacity);

    this.stars.visible = dayNight.starOpacity > 0.01;
    this.starMaterial.opacity = dayNight.starOpacity;
    this.stars.rotation.z = dayNight.starAngle;
  }

  dispose(): void {
    this.object.traverse((node) => {
      if (node instanceof Mesh || node instanceof Points) node.geometry.dispose();
    });
    this.domeMaterial.dispose();
    this.sunMaterial.dispose();
    this.moonMaterial.dispose();
    this.starMaterial.dispose();
  }
}

function celestialMaterial(color: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    fog: false,
  });
}

/** 天体を向き dir の先に置き、板の面をカメラへ向ける。 */
function place(mesh: Mesh, material: MeshBasicMaterial, dir: Vector3, opacity: number): void {
  mesh.visible = opacity > 0.01;
  if (!mesh.visible) return;
  material.opacity = opacity;
  scratchDir.copy(dir).normalize();
  scratchBack.copy(scratchDir).negate();
  mesh.quaternion.setFromUnitVectors(PLANE_NORMAL, scratchBack);
  mesh.position.copy(scratchDir).multiplyScalar(CELESTIAL_DISTANCE);
}

/**
 * 星の座標。毎回同じ星空になるよう、Math.random ではなく固定の線形合同法で撒く。
 * 星ぼしは +Z 軸まわりに回るので、球面全体に均等に撒く（上半球に寄せると回転で偏る）。
 * 地平線より下の星は地形が手前に描かれて隠れる。
 */
function starField(): BufferGeometry {
  const positions = new Float32Array(STAR_COUNT * 3);
  let state = 0x2f6ec4;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let i = 0; i < STAR_COUNT; i++) {
    const y = rand() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = rand() * Math.PI * 2;
    positions[i * 3] = Math.cos(phi) * r * STAR_DISTANCE;
    positions[i * 3 + 1] = y * STAR_DISTANCE;
    positions[i * 3 + 2] = Math.sin(phi) * r * STAR_DISTANCE;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}
