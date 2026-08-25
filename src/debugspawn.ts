/**
 * デバッグの湧かせ方（`M` でモブ、`N` で飛び道具）。**「湧かない場所」と
 * 「描けていない」を切り分けるための鍵**なので、湧きの条件には従わない。
 *
 * three も DOM も出てこないので、出す種類と場所はヘッドレスで確かめられる
 * （`test/debugspawn.test.ts`）。`main.ts` にはキーの配線だけを残すこと。
 */

import type { PlaceAim } from "./blocks";
import { MOB_KINDS, type MobKind } from "./mobs";
import { PROJECTILE_KINDS } from "./projectiles";

/** 出すモブ 1 体ぶん。`mobs.spawn()` にそのまま渡せる形。 */
export interface MobSpawn {
  readonly kind: MobKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * 狙った面の手前にモブを 1 体。**種類は `roll`（0..1）で選ぶ**ので、
 * 乱数は呼ぶ側が作る（`items.ts` の `rollDrop()` と同じ作法）。
 *
 * 向きはプレイヤーの真裏 —— 出したモブと目が合うほうが、居るかどうかが分かりやすい。
 */
export function debugMob(aim: PlaceAim, yaw: number, roll: number): MobSpawn {
  const index = Math.min(MOB_KINDS.length - 1, Math.floor(roll * MOB_KINDS.length));
  return {
    kind: MOB_KINDS[index],
    // マスの中心（法線の側）に置く。面の上にちょうど乗るよう y だけ足さない。
    x: aim.block.x + aim.normal.x + 0.5,
    y: aim.block.y + aim.normal.y,
    z: aim.block.z + aim.normal.z + 0.5,
    yaw: yaw + Math.PI,
  };
}

/**
 * 次に出す飛び道具の番号。**押すたびに順ぐり**なので、4 種類とも同じ手順で出せる。
 * 始まりは `-1`（最初の 1 回で 0 になる）。
 */
export function nextShot(index: number): number {
  return (index + 1) % PROJECTILE_KINDS.length;
}
