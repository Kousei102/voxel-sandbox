/**
 * 落ちたアイテムの描画。**three だけ。判断は 1 つも書かないこと。**
 *
 * 何を・どこに・どんな向きで出すかは全部 `drops.ts` が決めていて、ここは
 * その結果を `Mesh` に貼るだけ（`mobrender.ts` とまったく同じ形）。
 *
 * **新しい GLSL は書かない。** 地形・モブと同じ `useTerrainLighting()` を掛けた
 * `MeshBasicMaterial` を 1 枚だけ使い、光は `voxelLight` 属性で渡す。
 * だから落ちたアイテムと足元のブロックが昼夜で食い違うことがない。
 */

import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  type Color,
  type IUniform,
  type Scene,
} from "three";
import { DROP_BOX, dropBob, type Drop } from "./drops";
import { itemColor } from "./items";
import { BLOCK_LIGHT, SKY_LIGHT } from "./lighting";
import { BLOCK_SHADE, SKY_SHADE, type MeshArrays } from "./meshbuild";
import { buildBoxMesh } from "./mobmesh";
import { mobRgb } from "./mobs";
import { LIGHT_ATTRIBUTE, useTerrainLighting } from "./terrainshader";
import type { World } from "./world";

interface Rig {
  readonly mesh: Mesh;
  /** 前フレームの光量 0..15。変わったときだけ属性を書き直す。 */
  sky: number;
  block: number;
}

export class DropRenderer {
  private readonly material: MeshBasicMaterial;
  private readonly rigs = new Map<number, Rig>();
  /** アイテムごとの形。1 回作って使い回す（色だけが違う同じ立方体）。 */
  private readonly shapes = new Map<number, MeshArrays>();

  constructor(
    private readonly scene: Scene,
    daylight: IUniform<Color>,
  ) {
    this.material = new MeshBasicMaterial({ vertexColors: true, fog: true });
    // 地形・モブと同じ patch・同じ uniform オブジェクト。**別の GLSL を書かないこと。**
    useTerrainLighting(this.material, daylight);
  }

  /** 毎フレーム、いま落ちているものに合わせて `Mesh` を作り・動かし・片付ける。 */
  sync(drops: readonly Drop[], world: World): void {
    const alive = new Set<number>();

    for (const drop of drops) {
      alive.add(drop.id);
      let rig = this.rigs.get(drop.id);
      if (!rig) {
        rig = this.createRig(drop.item);
        this.rigs.set(drop.id, rig);
      }

      // 揺れ幅も回る速さも `drops.ts` が決めた値。ここは貼るだけ。
      rig.mesh.position.set(
        drop.position.x,
        drop.position.y + dropBob(drop.spin),
        drop.position.z,
      );
      rig.mesh.rotation.y = drop.spin;

      this.applyLight(rig, drop, world);
    }

    for (const [id, rig] of this.rigs) {
      if (alive.has(id)) continue;
      disposeRig(rig);
      this.rigs.delete(id);
    }
  }

  private createRig(item: number): Rig {
    let shape = this.shapes.get(item);
    if (!shape) {
      // 色は sRGB hex → 線形。**ブロック・モブとまったく同じ道を通す**
      // （別の道にすると、落ちた羊毛と置いた羊毛が違う色に見える）。
      shape = buildBoxMesh(DROP_BOX, itemColor(item), mobRgb);
      this.shapes.set(item, shape);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(shape.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(shape.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(shape.colors, 4));
    // 光は 1 山につき 1 組なので、個体ごとに自前の配列を持つ（形は共有、光は個別）。
    geometry.setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(shape.light.slice(), 2));
    geometry.setIndex(new BufferAttribute(shape.indices, 1));
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, this.material);
    // **`matrixAutoUpdate` を false にしないこと**（全部原点で固まる。`mobrender.ts` と同じ）。
    this.scene.add(mesh);
    return { mesh, sky: -1, block: -1 };
  }

  /** その山の居るマスの光を頂点に流す。0..15 が変わったときだけ書き直す。 */
  private applyLight(rig: Rig, drop: Drop, world: World): void {
    const x = Math.floor(drop.position.x);
    const y = Math.floor(drop.position.y);
    const z = Math.floor(drop.position.z);
    const sky = world.getLight(x, y, z, SKY_LIGHT);
    const block = world.getLight(x, y, z, BLOCK_LIGHT);
    if (sky === rig.sky && block === rig.block) return;
    rig.sky = sky;
    rig.block = block;

    const skyShade = SKY_SHADE[sky];
    const blockShade = BLOCK_SHADE[block];
    const attribute = rig.mesh.geometry.getAttribute(LIGHT_ATTRIBUTE) as BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < array.length; i += 2) {
      array[i] = skyShade;
      array[i + 1] = blockShade;
    }
    attribute.needsUpdate = true;
  }

  dispose(): void {
    for (const rig of this.rigs.values()) disposeRig(rig);
    this.rigs.clear();
    this.material.dispose();
  }
}

function disposeRig(rig: Rig): void {
  rig.mesh.geometry.dispose();
  rig.mesh.removeFromParent();
}
