/**
 * 飛んでいるものの描画。**three だけ。判断は 1 つも書かないこと。**
 *
 * 何を・どこに・どんな向きで出すかは全部 `projectiles.ts` が決めていて、ここは
 * その結果を `Mesh` に貼るだけ（`droprender.ts` / `mobrender.ts` とまったく同じ形）。
 *
 * **速度を見ないこと。** 向きは `projectiles.ts` が `yaw` / `pitch` に焼いてある
 * （ここで速度から作り直すと、刺さって止まった矢の向きがその場で 0 に戻る）。
 *
 * **新しい GLSL は書かない。** 地形・モブ・落とし物と同じ `useTerrainLighting()` を掛けた
 * `MeshBasicMaterial` を 1 枚だけ使い、光は `voxelLight` 属性で渡す。
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
import { MAX_LIGHT } from "./constants";
import { BLOCK_LIGHT, SKY_LIGHT } from "./lighting";
import { BLOCK_SHADE, SKY_SHADE, type MeshArrays } from "./meshbuild";
import { buildBoxMesh } from "./mobmesh";
import { mobRgb } from "./mobs";
import { boxOf, projectileDef, type Projectile, type ProjectileKind } from "./projectiles";
import { LIGHT_ATTRIBUTE, useTerrainLighting } from "./terrainshader";
import type { World } from "./world";

interface Rig {
  readonly mesh: Mesh;
  /** 前フレームの光量 0..15。変わったときだけ属性を書き直す。 */
  sky: number;
  block: number;
}

export class ProjectileRenderer {
  private readonly material: MeshBasicMaterial;
  private readonly rigs = new Map<number, Rig>();
  /** 種類ごとの形。1 回作って使い回す（色と大きさだけが違う同じ立方体）。 */
  private readonly shapes = new Map<ProjectileKind, MeshArrays>();

  constructor(
    private readonly scene: Scene,
    daylight: IUniform<Color>,
  ) {
    this.material = new MeshBasicMaterial({ vertexColors: true, fog: true });
    // 地形・モブ・落とし物と同じ patch・同じ uniform オブジェクト。
    // **別の GLSL を書かないこと。**
    useTerrainLighting(this.material, daylight);
  }

  /** 毎フレーム、いま飛んでいるものに合わせて `Mesh` を作り・動かし・片付ける。 */
  sync(projectiles: readonly Projectile[], world: World): void {
    const alive = new Set<number>();

    for (const projectile of projectiles) {
      alive.add(projectile.id);
      let rig = this.rigs.get(projectile.id);
      if (!rig) {
        rig = this.createRig(projectile.kind);
        this.rigs.set(projectile.id, rig);
      }

      // 位置は体の中心なので、そのまま貼れば回しても中心がずれない。
      rig.mesh.position.set(
        projectile.position.x,
        projectile.position.y,
        projectile.position.z,
      );

      const def = projectileDef(projectile.kind);
      if (def.aims) {
        // 進む向きを向く。**YXZ の順**（先に横を向いてから、その体の軸で上下に傾く）。
        rig.mesh.rotation.order = "YXZ";
        rig.mesh.rotation.set(projectile.pitch, projectile.yaw, 0);
      } else {
        // 向きを持たないものは転がして見せる。速さも位相も `projectiles.ts` の値。
        rig.mesh.rotation.set(projectile.spin * 0.6, projectile.spin, 0);
      }

      this.applyLight(rig, projectile, world);
    }

    for (const [id, rig] of this.rigs) {
      if (alive.has(id)) continue;
      disposeRig(rig);
      this.rigs.delete(id);
    }
  }

  private createRig(kind: ProjectileKind): Rig {
    let shape = this.shapes.get(kind);
    if (!shape) {
      // 色は sRGB hex → 線形。**ブロック・モブ・落とし物とまったく同じ道を通す。**
      shape = buildBoxMesh(boxOf(kind), projectileDef(kind).color, mobRgb);
      this.shapes.set(kind, shape);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(shape.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(shape.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(shape.colors, 4));
    // 光は 1 個につき 1 組なので、個体ごとに自前の配列を持つ（形は共有、光は個別）。
    geometry.setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(shape.light.slice(), 2));
    geometry.setIndex(new BufferAttribute(shape.indices, 1));
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, this.material);
    // **`matrixAutoUpdate` を false にしないこと**（全部原点で固まる。`droprender.ts` と同じ）。
    this.scene.add(mesh);
    return { mesh, sky: -1, block: -1 };
  }

  /**
   * その居るマスの光を頂点に流す。0..15 が変わったときだけ書き直す。
   * **自分で光るもの（`glows`）は周りを見ずに最大**にする —— そう決めたのは
   * `projectiles.ts` の表で、ここは分岐を貼るだけ。
   */
  private applyLight(rig: Rig, projectile: Projectile, world: World): void {
    const def = projectileDef(projectile.kind);
    let sky = MAX_LIGHT;
    let block = MAX_LIGHT;
    if (!def.glows) {
      const x = Math.floor(projectile.position.x);
      const y = Math.floor(projectile.position.y);
      const z = Math.floor(projectile.position.z);
      sky = world.getLight(x, y, z, SKY_LIGHT);
      block = world.getLight(x, y, z, BLOCK_LIGHT);
    }
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
