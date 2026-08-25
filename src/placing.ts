/**
 * ブロックを置けるか、置くとどうなるか。**判断だけのファイル**で、three も DOM も
 * 出てこない（`portals.ts` / `beds.ts` / `portaltravel.ts` と同じ形）。
 *
 * もとは `main.ts` の `useOrPlace()` の後半にあった。**置ける／置けないの規則は
 * ブラウザを開かないと確かめられない場所に置いてはいけない** —— 置けないはずの所に
 * 置けても、置けるはずの所に置けなくても、画面を見るまで気付けないため。
 *
 * どこに置くか（`placeSpot`）と、どの向きになるか（`placedVariant`）は `blocks.ts`。
 * ここが持つのは**その 2 つを呼んだあとの可否**だけ:
 *
 * - 押しのけられないマスには置かない
 * - 自分の体と重なる所には置かない（置くと壁に埋まる）
 * - 松明のように支えが要るものは、支えのある面にだけ
 * - ベッドは 2 マスとも書けるときだけ（半分だけ置かれた状態を作らない）
 */

import {
  AIR,
  NO_SUPPORT,
  OBSIDIAN,
  bedPartner,
  blockName,
  faceFromYaw,
  isBed,
  isLiquid,
  isReplaceable,
  placeSpot,
  placedVariant,
  supportFace,
  type PlaceAim,
} from "./blocks";
import { placeBed, type BedWorld } from "./beds";
import { bucketUse } from "./items";
import { quenchAround } from "./liquids";
import { ignite, portalBlock } from "./portals";

/**
 * `beds.ts` と同じで、`World` を丸ごとではなく要る入口だけを受ける
 * （**ベッドが要るものと同じ 3 つ**なので、`BedWorld` をそのまま使う）。
 */
export type PlaceWorld = BedWorld;

/** 置こうとしている人。**`Player` が構造的に満たす**ので継承は要らない。 */
export interface PlaceBody {
  overlapsBlock(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 置いた結果。**「置けなかった」を 2 つに分けてある** ——
 * 黙って何もしない（`none`）のと、理由を出す（`blocked`）のとでは、
 * 手ごたえがまるで違う（松明が付かないのは、理由が出ないと分からない）。
 */
export type PlaceOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "blocked"; readonly message: string }
  | { readonly kind: "placed"; readonly id: number };

const NOTHING: PlaceOutcome = { kind: "none" };

/**
 * 狙っている面へ `base` のブロックを置く。**書き込みまでやる**（`placeBed()` と同じで、
 * 「確かめてから書く」を 2 つに分けると、片方だけ通った状態を作れてしまう）。
 *
 * 減らすかどうか（クリエイティブ）と音は呼ぶ側の仕事。
 */
export function tryPlace(
  world: PlaceWorld,
  body: PlaceBody,
  aim: PlaceAim,
  yaw: number,
  base: number,
): PlaceOutcome {
  if (base === AIR) return NOTHING;

  // 置くマス（草むらを狙ったならそのマス自身）と向きは `placeSpot()` が決める。
  // 階段は置く人の向きで決まるので、見ている向きも渡す。
  const spot = placeSpot(aim, faceFromYaw(yaw));
  const { x, y, z } = spot;
  const target = world.getVoxel(x, y, z);
  if (!isReplaceable(target)) return NOTHING;

  const id = placedVariant(base, spot);
  if (body.overlapsBlock(x, y, z, id)) return NOTHING;

  if (supportFace(base) !== NO_SUPPORT) {
    if (id === AIR || isLiquid(target) || !world.canPlaceAt(x, y, z, id)) {
      return { kind: "blocked", message: `${blockName(base)} は床か壁にしか付けられません` };
    }
  }

  // ベッドは 2 マスにまたがるので、書き込みも `beds.ts` に任せる
  // （**半分だけ置かれた状態を作らない**のが `placeBed()` の役目）。
  if (isBed(id)) {
    const partner = bedPartner(id);
    // 枕側にプレイヤーが立っていたら置かせない（立方体と同じ扱い）。
    if (partner && body.overlapsBlock(x + partner.dx, y, z + partner.dz, partner.id)) {
      return NOTHING;
    }
    if (!placeBed(world, spot, id)) {
      return { kind: "blocked", message: "ベッドを置くには 2 マスの床が要ります" };
    }
  } else if (!world.setVoxel(x, y, z, id)) {
    return NOTHING;
  }

  return { kind: "placed", id };
}

/**
 * 火種で火を点ける。**狙ったブロックそのものではなく、その手前の空きマス**に点ける
 * （枠の内側は空きマスなので、黒曜石を狙って手前に火が点く）。
 *
 * 何が火種かは `items.ts` の `isFireStarter()`、枠が成立しているかは
 * `portals.ts` の `ignite()`。**ここが持つのは「どのマスか」だけ。**
 */
export function tryIgnite(world: PlaceWorld, aim: PlaceAim): PlaceOutcome {
  const lit = ignite(world, aim.block.x + aim.normal.x, aim.block.y + aim.normal.y, aim.block.z + aim.normal.z);
  if (lit <= 0) return { kind: "blocked", message: "黒曜石の枠がありません" };
  return { kind: "placed", id: portalBlock("x") };
}

/**
 * バケツで汲んだ結果。`item` は**手に持ち替えるバケツ**（空 ⇔ 中身入り）。
 * **クリエイティブでも持ち替えること** —— バケツは「減る道具」ではなく
 * 中身そのものがアイテムなので、入れ替えないと永久に空のままで何も流せない。
 */
export type BucketOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "blocked"; readonly message: string }
  | { readonly kind: "used"; readonly item: number; readonly message: string };

/**
 * バケツで汲む／流す。**汲めるか流せるかの表は `items.ts` の `bucketUse()`**、
 * 固まるかどうかは `liquids.ts` の `quenchAround()`。ここが持つのは
 * **「どのマスに効くか」**と、書き込んだあとの言い分けだけ。
 *
 * `aim` は**液体に当たる光線**（`raycastVoxels(..., true)`）で取ること ——
 * 普段の光線は液体を素通りするので、そのままでは水面を狙えず汲めない。
 */
export function tryBucket(world: PlaceWorld, aim: PlaceAim, held: number, yaw: number): BucketOutcome {
  const use = bucketUse(held, aim.id);
  if (!use) return { kind: "blocked", message: "汲めるのは水と溶岩だけです" };

  // 汲むのは狙ったマス。流すのは置くマス（狙ったのが液体ならそのマス自身）。
  const spot = use.kind === "fill" ? aim.block : placeSpot(aim, faceFromYaw(yaw));
  const { x, y, z } = spot;
  if (use.kind === "empty" && !isReplaceable(world.getVoxel(x, y, z))) return { kind: "none" };
  if (!world.setVoxel(x, y, z, use.kind === "fill" ? AIR : use.liquid)) return { kind: "none" };

  // 流した液体が周りとぶつかって固まるか。**どう固まるかは `liquids.ts`。**
  const hardened = use.kind === "empty" ? quenchAround(world, x, y, z) : 0;
  return {
    kind: "used",
    item: use.item,
    message:
      hardened > 0
        ? `${blockName(OBSIDIAN)}ができた（${hardened} 個）`
        : `${blockName(use.liquid)}を${use.kind === "fill" ? "汲んだ" : "流した"}`,
  };
}
