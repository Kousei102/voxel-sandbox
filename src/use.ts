/**
 * 右クリックで**何が起きるか**の振り分け。**判断だけのファイル**で、three も DOM も
 * `World` も持ち物も出てこない（`placing.ts` / `bow.ts` / `endportal.ts` と同じ形）。
 *
 * もとは `main.ts` の `useOrPlace()` にあった `if` の列（いまは 17 通り）。**順番そのものが
 * 判断です** —— 並べ替えると静かに壊れるものが 3 つあり、どれもブラウザを開いて
 * 現物を狙うまで気付けません:
 *
 * - **刈る**（`shear`）は器より先。あとにすると、作業台やチェストの前に立った羊だけ
 *   刈れません（そこまで追い込まないと気付けない形で壊れます）
 *
 * - **枠にアイを嵌める**（`fitEye`）は**投げる**（`throwEye`）より先。逆にすると、
 *   枠を狙っても手からアイが飛んでいって**永久に嵌まりません**（枠は地下 18 マス）
 * - **バケツ**は食べ物より先。どちらも右クリックですが、バケツは押しっぱなしではなく
 *   1 回で終わります
 *
 * ここが返すのは**注文（`UseAction`）だけ**で、書き込みも音も持ち物も `main.ts` の仕事。
 * だから「どの状況で何が起きるか」を丸ごとヘッドレスで確かめられます。
 */

import {
  CHEST,
  CRAFTING_TABLE,
  FURNACE,
  baseBlock,
  isBed,
  isEndPortalFrame,
  type PlaceAim,
} from "./blocks";
import {
  BUCKET,
  ENDER_EYE,
  MILK_BUCKET,
  foodOf,
  isBow,
  isBucket,
  isFireStarter,
  isHoe,
  isSeed,
  isShears,
  placedBlock,
  thrownProjectile,
} from "./items";
// **型だけ。** `Projectiles` を値で取ると、判断だけのこのファイルに three 側の
// 都合が流れ込みます（`test/projectiles.test.ts` の見張り）。
import type { ProjectileKind } from "./projectiles";

/** 右クリックした瞬間の事実。**`main.ts` は集めて渡すだけ**（判断はこの中）。 */
export interface UseFacts {
  /** 手に持っているアイテム。 */
  readonly held: number;
  readonly creative: boolean;
  /** 食べられるか（`vitals.ts` が決める）。 */
  readonly canEat: boolean;
  /** **放てる矢があるか。** クリエイティブぶんは呼ぶ側で込みにする（`bow.ts` と同じ約束）。 */
  readonly hasArrow: boolean;
  /**
   * **いま刈れるモブが手前に居るか。** 「手前か」は `controls.ts` の `mobIsNearer()`、
   * 「刈れるか」は `mobs.ts` の `canShear()` で、呼ぶ側が 2 つを込みにして渡します
   * （`hasArrow` とまったく同じ約束 —— ここが器を見に行き始めると判断が 2 か所に散ります）。
   */
  readonly shearable: boolean;
  /**
   * **いま搾れるモブが手前に居るか。** 「手前か」は `controls.ts` の `mobIsNearer()`、
   * 「搾れるか」は `mobs.ts` の `canMilk()` で、`shearable` とまったく同じ約束で
   * 呼ぶ側が 2 つを込みにして渡します（ここが器を見に行き始めると判断が散ります）。
   */
  readonly milkable: boolean;
}

/** 効くマス（狙ったブロックそのもの）。 */
export interface UseSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 右クリックの注文。**`none` と `flash` を分けてある**（`placing.ts` の
 * `PlaceOutcome` と同じ理由）—— 黙って何も起きないのと、理由を出すのとでは
 * 手ごたえがまるで違う。
 */
export type UseAction =
  | { readonly kind: "none" }
  /** 手前のモブを刈る（何が何個出るかは `mobs.ts` の `MobDef.shearing`）。 */
  | { readonly kind: "shear" }
  /** 手前のモブを搾る（誰から搾れるかは `mobs.ts` の `MobDef.milkable`）。 */
  | { readonly kind: "milk" }
  /** ミルクを飲む（何が消えるかは `vitals.ts` の `drinkMilk()`）。 */
  | { readonly kind: "drink" }
  | { readonly kind: "flash"; readonly message: string }
  | { readonly kind: "craft" }
  | { readonly kind: "furnace"; readonly at: UseSpot }
  | { readonly kind: "chest"; readonly at: UseSpot }
  | { readonly kind: "bed"; readonly at: UseSpot; readonly id: number }
  /** クワで耕す。**耕せるかどうかはここで決めない**（可否は `placing.ts`）。 */
  | { readonly kind: "till"; readonly at: UseSpot }
  /** 種を植える。**植わるかどうかはここで決めない**（可否は `placing.ts` の `tryPlant()`）。 */
  | { readonly kind: "plant"; readonly at: UseSpot }
  | { readonly kind: "bucket"; readonly item: number }
  | { readonly kind: "fitEye"; readonly at: UseSpot }
  | { readonly kind: "throwEye" }
  /** 手のものを投げる（何が飛ぶかは `items.ts` の `thrownProjectile()`）。 */
  | { readonly kind: "throw"; readonly item: number; readonly projectile: ProjectileKind }
  | { readonly kind: "ignite"; readonly aim: PlaceAim }
  | { readonly kind: "draw"; readonly item: number }
  | { readonly kind: "eat"; readonly item: number }
  | { readonly kind: "place"; readonly aim: PlaceAim; readonly base: number };

const NOTHING: UseAction = { kind: "none" };

/**
 * 右クリックで何をするかを決める。`aim` は狙っているブロック（空を向いていれば null）。
 *
 * **`aim` が無くても食べられること**（空を向いたまま食べられないのはおかしい）。
 * 弓・バケツ・エンダーアイも同じで、狙う先を要りません。
 */
export function decideUse(aim: PlaceAim | null, facts: UseFacts): UseAction {
  const { held, creative } = facts;

  // **器より先。** 羊は作業台やチェストの前にも立つので、あとにすると
  // 「器の前に居る羊だけ刈れない」という、現物を追い込むまで気付けない形になる。
  // **手前に居るときだけ真**（`shearable` に「手前か」が込みで入っている）。
  if (facts.shearable && isShears(held)) return { kind: "shear" };

  // 搾る。**刈るの隣・器より前**（あとにすると、作業台やチェストの前に立った牛だけ
  // 搾れません —— 羊とまったく同じ壊れ方で、現物を追い込むまで気付けない）。
  // **空のバケツのときだけ** —— 中身の入ったバケツで搾れると、水がミルクに化けます。
  if (facts.milkable && held === BUCKET) return { kind: "milk" };

  if (aim && aim.id === CRAFTING_TABLE) return { kind: "craft" };
  // かまど。点火中も同じ 1 台なので、大元の ID で見る。
  if (aim && baseBlock(aim.id) === FURNACE) return { kind: "furnace", at: aim.block };
  if (aim && aim.id === CHEST) return { kind: "chest", at: aim.block };
  // ベッドは足側でも枕側でも同じ 1 台なので、どちらを叩いても同じ扱い。
  if (aim && isBed(aim.id)) return { kind: "bed", at: aim.block, id: aim.id };

  // クワ。**耕せるかどうか（土か草か・上が塞がっていないか）はここで決めない**
  // （`place` と同じで、可否は `placing.ts` の `tryTill()`）。
  if (aim && isHoe(held)) return { kind: "till", at: aim.block };

  // 種。**クワの次・バケツより前**（耕す → 植える、の順に並べておくと読める）。
  // **植わるかどうか（耕地の上か・塞がっていないか）はここで決めない** ——
  // クワとまったく同じで、可否は `placing.ts` の `tryPlant()`。
  if (aim && isSeed(held)) return { kind: "plant", at: aim.block };

  // バケツ。**汲めるか流せるかは `items.ts` の `bucketUse()`**、どのマスに効くかは
  // `placing.ts` の `tryBucket()`。ここは「バケツを使う」とだけ言う。
  if (isBucket(held)) return { kind: "bucket", item: held };

  // ミルクを飲む。**バケツの直後**（器より後ろでないと、ミルクを持っているあいだ
  // 作業台が開きません）。**`aim` は見ない** —— 空を向いたまま飲めるのが正しい
  // （食べる・弓・バケツと同じ扱い）。**満腹でも飲めること** ——
  // `FOODS` に無いので `canEat` の門に掛からず、満腹のままでも毒を消せる。
  if (held === MILK_BUCKET) return { kind: "drink" };

  // **嵌めるほうが先**（上のコメント）。
  if (aim && held === ENDER_EYE && isEndPortalFrame(aim.id)) return { kind: "fitEye", at: aim.block };
  // 投げたアイは視線ではなく要塞のほうを向く案内役なので、狙う先は要らない。
  if (held === ENDER_EYE) return { kind: "throwEye" };

  // 投げるもの（卵）。**アイの次・火種より前**（投げるものどうしを並べておくと読める）。
  // **`aim` は見ない** —— 空へ投げられるのが正しい（食べる・弓と同じ扱い）。
  // **器より前に出さないこと** —— 出すと、作業台の上に立って卵を持っているあいだ
  // 作業台が開きません（`rules/use.md` の並びの 2 番目）。
  const thrown = thrownProjectile(held);
  if (thrown) return { kind: "throw", item: held, projectile: thrown };

  // 火打石と打ち金。**どのマスに火を点けるかも枠の判定も `placing.ts` / `portals.ts`。**
  if (aim && isFireStarter(held)) return { kind: "ignite", aim };

  // 弓。**引き始めるだけ**で、放つのは離したとき。長さも下限も `bow.ts`。
  if (isBow(held)) {
    return facts.hasArrow ? { kind: "draw", item: held } : { kind: "flash", message: "矢がありません" };
  }

  // 食べ物。**何がどれだけ戻るかは `items.ts`、食べられるかは `vitals.ts`**。
  // ここは「押しっぱなしが始まった」ことだけを言う。
  if (foodOf(held)) {
    if (creative) return NOTHING;
    if (!facts.canEat) return { kind: "flash", message: "お腹は空いていません" };
    return { kind: "eat", item: held };
  }

  if (!aim) return NOTHING;
  // 置けるかどうかと書き込みは `placing.ts`（**可否はあちら**。ここは何を置くかまで）。
  return { kind: "place", aim, base: placedBlock(held) };
}
