/**
 * 右クリックで**何が起きるか**の振り分け。**判断だけのファイル**で、three も DOM も
 * `World` も持ち物も出てこない（`placing.ts` / `bow.ts` / `endportal.ts` と同じ形）。
 *
 * もとは `main.ts` の `useOrPlace()` にあった 11 通りの `if` の列。**順番そのものが
 * 判断です** —— 並べ替えると静かに壊れるものが 2 つあり、どちらもブラウザを開いて
 * 現物を狙うまで気付けません:
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
import { ENDER_EYE, foodOf, isBow, isBucket, isFireStarter, placedBlock } from "./items";

/** 右クリックした瞬間の事実。**`main.ts` は集めて渡すだけ**（判断はこの中）。 */
export interface UseFacts {
  /** 手に持っているアイテム。 */
  readonly held: number;
  readonly creative: boolean;
  /** 食べられるか（`vitals.ts` が決める）。 */
  readonly canEat: boolean;
  /** **放てる矢があるか。** クリエイティブぶんは呼ぶ側で込みにする（`bow.ts` と同じ約束）。 */
  readonly hasArrow: boolean;
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
  | { readonly kind: "flash"; readonly message: string }
  | { readonly kind: "craft" }
  | { readonly kind: "furnace"; readonly at: UseSpot }
  | { readonly kind: "chest"; readonly at: UseSpot }
  | { readonly kind: "bed"; readonly at: UseSpot; readonly id: number }
  | { readonly kind: "bucket"; readonly item: number }
  | { readonly kind: "fitEye"; readonly at: UseSpot }
  | { readonly kind: "throwEye" }
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

  if (aim && aim.id === CRAFTING_TABLE) return { kind: "craft" };
  // かまど。点火中も同じ 1 台なので、大元の ID で見る。
  if (aim && baseBlock(aim.id) === FURNACE) return { kind: "furnace", at: aim.block };
  if (aim && aim.id === CHEST) return { kind: "chest", at: aim.block };
  // ベッドは足側でも枕側でも同じ 1 台なので、どちらを叩いても同じ扱い。
  if (aim && isBed(aim.id)) return { kind: "bed", at: aim.block, id: aim.id };

  // バケツ。**汲めるか流せるかは `items.ts` の `bucketUse()`**、どのマスに効くかは
  // `placing.ts` の `tryBucket()`。ここは「バケツを使う」とだけ言う。
  if (isBucket(held)) return { kind: "bucket", item: held };

  // **嵌めるほうが先**（上のコメント）。
  if (aim && held === ENDER_EYE && isEndPortalFrame(aim.id)) return { kind: "fitEye", at: aim.block };
  // 投げたアイは視線ではなく要塞のほうを向く案内役なので、狙う先は要らない。
  if (held === ENDER_EYE) return { kind: "throwEye" };

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
