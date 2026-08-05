/**
 * モブの描画。**three だけ。判断は 1 つも書かないこと。**
 *
 * 何を・どこに・どんな向きで出すかは全部 `mobs.ts` が決めていて、ここは
 * その結果を `Object3D` に貼るだけ。`CLAUDE.md` の切り分け（GLSL は
 * `terrainshader.ts` / `sky.ts` だけ、WebAudio は `audio.ts` だけ、DOM は
 * `ui.ts` / `inventoryui.ts` だけ）に、モブの three をここ 1 つだけ足す形。
 *
 * **新しい GLSL は書かない。** 地形とまったく同じ `useTerrainLighting()` を掛けた
 * `MeshBasicMaterial` を使い、光は `voxelLight` 属性で渡す。だからモブと足元の
 * ブロックが昼夜で食い違うことがない。
 */

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Color,
  type IUniform,
  type Scene,
} from "three";
import { BLOCK_SHADE, SKY_SHADE } from "./meshbuild";
import { buildMobMesh, type MobPartMesh } from "./mobmesh";
import { MOBS, mobRgb, walkSwing, type Mob, type MobKind } from "./mobs";
import { BLOCK_LIGHT, SKY_LIGHT } from "./lighting";
import { LIGHT_ATTRIBUTE, useTerrainLighting } from "./terrainshader";
import type { World } from "./world";

interface Rig {
  readonly root: Group;
  readonly parts: { readonly mesh: Mesh; readonly part: MobPartMesh }[];
  /** 前フレームの光量 0..15。変わったときだけ属性を書き直す。 */
  sky: number;
  block: number;
}

export class MobRenderer {
  private readonly material: MeshBasicMaterial;
  private readonly rigs = new Map<number, Rig>();
  /** 種類ごとの形。1 回作って使い回す（幾何は全個体で同じ）。 */
  private readonly shapes = new Map<MobKind, MobPartMesh[]>();

  constructor(
    private readonly scene: Scene,
    daylight: IUniform<Color>,
  ) {
    this.material = new MeshBasicMaterial({ vertexColors: true, fog: true });
    // 地形と同じ patch・同じ uniform オブジェクト。**別の GLSL を書かないこと。**
    useTerrainLighting(this.material, daylight);
  }

  /** 毎フレーム、いま居るモブに合わせて `Object3D` を作り・動かし・片付ける。 */
  sync(mobs: readonly Mob[], world: World): void {
    const alive = new Set<number>();

    for (const mob of mobs) {
      alive.add(mob.id);
      let rig = this.rigs.get(mob.id);
      if (!rig) {
        rig = this.createRig(mob.kind);
        this.rigs.set(mob.id, rig);
      }

      rig.root.position.set(mob.position.x, mob.position.y, mob.position.z);
      // モデルは -Z が前。three の Y 回転は (0,0,-1) を (-sin, 0, -cos) に写すので、
      // player.ts の forward の作り方とそのまま一致する。
      rig.root.rotation.y = mob.yaw;

      for (const { mesh, part } of rig.parts) {
        if (part.group.motion === "swing") {
          mesh.rotation.x = walkSwing(mob.walkPhase + part.group.phase);
        } else if (part.group.motion === "head") {
          // 向きは mobs.ts が決めている（体からの相対で、振り向ける角度に上限つき）
          mesh.rotation.y = mob.headYaw;
          mesh.rotation.x = mob.headPitch;
        }
      }

      this.applyLight(rig, mob, world);
    }

    for (const [id, rig] of this.rigs) {
      if (alive.has(id)) continue;
      disposeRig(rig);
      this.rigs.delete(id);
    }
  }

  private createRig(kind: MobKind): Rig {
    let shape = this.shapes.get(kind);
    if (!shape) {
      shape = buildMobMesh(MOBS[kind], mobRgb);
      this.shapes.set(kind, shape);
    }

    const root = new Group();
    const parts: Rig["parts"] = [];
    for (const part of shape) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(part.mesh.positions, 3));
      geometry.setAttribute("normal", new BufferAttribute(part.mesh.normals, 3));
      geometry.setAttribute("color", new BufferAttribute(part.mesh.colors, 4));
      // 光は 1 体につき 1 組なので、個体ごとに自前の配列を持つ（形は共有、光は個別）。
      geometry.setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(part.mesh.light.slice(), 2));
      geometry.setIndex(new BufferAttribute(part.mesh.indices, 1));
      geometry.computeBoundingSphere();

      const mesh = new Mesh(geometry, this.material);
      mesh.position.set(part.group.pivot[0], part.group.pivot[1], part.group.pivot[2]);
      // **チャンクの真似をして matrixAutoUpdate を false にしないこと**（全部原点で固まる）。
      root.add(mesh);
      parts.push({ mesh, part });
    }
    this.scene.add(root);
    return { root, parts, sky: -1, block: -1 };
  }

  /**
   * 頭の位置の光を 1 体ぶんまとめて頂点に流す。
   * 0..15 の組が前フレームから変わったときだけ書き直すので、ふだんはほぼ無料。
   */
  private applyLight(rig: Rig, mob: Mob, world: World): void {
    const head = mob.position.y + MOBS[mob.kind].size.height * 0.8;
    const x = Math.floor(mob.position.x);
    const y = Math.floor(head);
    const z = Math.floor(mob.position.z);
    const sky = world.getLight(x, y, z, SKY_LIGHT);
    const block = world.getLight(x, y, z, BLOCK_LIGHT);
    if (sky === rig.sky && block === rig.block) return;
    rig.sky = sky;
    rig.block = block;

    const skyShade = SKY_SHADE[sky];
    const blockShade = BLOCK_SHADE[block];
    for (const { mesh } of rig.parts) {
      const attribute = mesh.geometry.getAttribute(LIGHT_ATTRIBUTE) as BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < array.length; i += 2) {
        array[i] = skyShade;
        array[i + 1] = blockShade;
      }
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const rig of this.rigs.values()) disposeRig(rig);
    this.rigs.clear();
    this.material.dispose();
  }
}

function disposeRig(rig: Rig): void {
  for (const { mesh } of rig.parts) mesh.geometry.dispose();
  rig.root.removeFromParent();
}
