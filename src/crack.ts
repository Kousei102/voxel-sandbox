import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  type Texture,
} from "three";

const STAGES = 10;
const SIZE = 16;

/**
 * 採掘中のひび割れ。10 段階。
 *
 * 外部アセットは使わず、canvas に線を引いて `CanvasTexture` を作る（実行時生成なので
 * 「アセットを持たない」方針のままでいられる）。シェーダには一切触っていない。
 * ブロックと同じ大きさの箱を z ファイティングしないよう少しだけ膨らませて重ねる。
 */
export class CrackOverlay {
  readonly mesh: Mesh;
  private readonly textures: Texture[] = [];
  private readonly material: MeshBasicMaterial;
  private stage = -1;

  constructor() {
    for (let i = 0; i < STAGES; i++) this.textures.push(makeCrackTexture(i));
    this.material = new MeshBasicMaterial({
      map: this.textures[0],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      fog: false,
    });
    this.mesh = new Mesh(new BoxGeometry(1.003, 1.003, 1.003), this.material);
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
  }

  /** stage は 0..9。-1 で消す。 */
  setStage(stage: number, x = 0, y = 0, z = 0): void {
    if (stage < 0) {
      this.mesh.visible = false;
      this.stage = -1;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    const clamped = Math.min(STAGES - 1, stage);
    if (clamped === this.stage) return;
    this.stage = clamped;
    this.material.map = this.textures[clamped];
    this.material.needsUpdate = true;
  }

  dispose(): void {
    for (const texture of this.textures) texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

/** 段階が進むほど線が増えて太くなる、16x16 のひび割れ。 */
function makeCrackTexture(stage: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 1;

  // 中心から外へ伸びる折れ線。段階ごとに本数と長さを増やす。
  const lines = 2 + stage;
  let state = 0x9e3779b9;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let i = 0; i < lines; i++) {
    const angle = (i / lines) * Math.PI * 2 + rand() * 0.8;
    const length = 2 + ((stage + 1) / STAGES) * 7;
    let x = SIZE / 2 + (rand() - 0.5) * 3;
    let y = SIZE / 2 + (rand() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 2 + Math.floor(length / 3);
    for (let s = 0; s < steps; s++) {
      x += Math.cos(angle) * (length / steps) + (rand() - 0.5) * 2;
      y += Math.sin(angle) * (length / steps) + (rand() - 0.5) * 2;
      ctx.lineTo(Math.round(x), Math.round(y));
    }
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  return texture;
}
