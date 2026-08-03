import { BufferAttribute, BufferGeometry, Mesh, type Material } from "three";
import { AIR } from "./blocks";
import { CHUNK_SIZE, CHUNK_VOLUME } from "./constants";
import type { MeshArrays } from "./mesher";
import { LIGHT_ATTRIBUTE } from "./terrainshader";

export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

export class Chunk {
  readonly data = new Uint8Array(CHUNK_VOLUME);
  /** 空からの光量 0..15。昼夜で暗くなる側。 */
  readonly skyLight = new Uint8Array(CHUNK_VOLUME);
  /** 松明などブロック自身が出す光 0..15。昼夜の影響を受けない側。 */
  readonly blockLight = new Uint8Array(CHUNK_VOLUME);
  /**
   * このチャンクに一度でもブロックライトが入ったか。
   * 光源はごく稀なので、隣の列から光を拾うときの走査をこの旗で丸ごと飛ばす。
   * 消えても false には戻さない（余分に走査するだけで、間違いにはならない）。
   */
  hasBlockLight = false;
  /** 空気以外のブロック数。0 ならメッシュ化を丸ごと省ける。 */
  solidCount = 0;
  dirty = true;
  opaqueMesh: Mesh | null = null;
  translucentMesh: Mesh | null = null;

  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly cz: number,
  ) {}

  get(lx: number, ly: number, lz: number): number {
    return this.data[localIndex(lx, ly, lz)];
  }

  setIndex(index: number, id: number): void {
    const prev = this.data[index];
    if (prev === id) return;
    if (prev === AIR && id !== AIR) this.solidCount++;
    else if (prev !== AIR && id === AIR) this.solidCount--;
    this.data[index] = id;
    this.dirty = true;
  }

  recountSolid(): void {
    let count = 0;
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      if (this.data[i] !== AIR) count++;
    }
    this.solidCount = count;
  }

  applyMesh(
    arrays: MeshArrays | null,
    existing: Mesh | null,
    material: Material,
    renderOrder: number,
  ): Mesh | null {
    if (!arrays) {
      if (existing) {
        existing.geometry.dispose();
        existing.removeFromParent();
      }
      return null;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(arrays.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(arrays.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(arrays.colors, 4));
    // x = スカイライトの明るさ、y = ブロックライトの明るさ。
    // 名前はシェーダ側の attribute 名と共通の定数から取る。
    geometry.setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(arrays.light, 2));
    geometry.setIndex(new BufferAttribute(arrays.indices, 1));
    geometry.computeBoundingSphere();

    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      return existing;
    }
    const mesh = new Mesh(geometry, material);
    mesh.position.set(this.cx * CHUNK_SIZE, this.cy * CHUNK_SIZE, this.cz * CHUNK_SIZE);
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  dispose(): void {
    for (const mesh of [this.opaqueMesh, this.translucentMesh]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    this.opaqueMesh = null;
    this.translucentMesh = null;
  }
}
