import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from "three";

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

/** カメラに追従する天球。地平線の色はフォグと合わせてある。 */
export function createSky(horizonColor: number): Mesh {
  const material = new ShaderMaterial({
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
  const sky = new Mesh(new SphereGeometry(1, 32, 16), material);
  sky.scale.setScalar(1000);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
