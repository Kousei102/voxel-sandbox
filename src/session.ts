/**
 * セーブの組み立てと読み戻し。**`main.ts` から出した「判断」**で、
 * どのキーに何を書くか・読んだ値をどこまで信じるかをここに集めてある。
 *
 * three も DOM も出てこないのでヘッドレスで丸ごと確かめられる（`test/session.test.ts`）。
 * `main.ts` に残るのは「値を集めて渡す」だけ。
 *
 * **受け取るのは器そのものではなく、`serialize()` を持つ何か**（`beds.ts` /
 * `placing.ts` と同じ作法）。だからテストは偽物を並べるだけで書ける。
 *
 * 決まりごとは `rules/dimensions.md`（セーブの形）と `rules/inventory-screen.md` の
 * 末尾（`version` は 1 のまま・キーは「省略可・無ければ既定」に揃える）。
 */

import type { DimensionState, SaveShape } from "./dimensions";
import type { SaveData } from "./storage";
import { serializeEdits } from "./storage";
import { MAX_HEALTH, MAX_HUNGER } from "./vitals";
import type { EditMap } from "./world";

/** いま居る次元の「位置ごとの持ち物」を持っているもの。 */
export interface StateSources {
  readonly world: { editsForSave(): EditMap };
  readonly drops: { serialize(): number[] };
  readonly furnaces: { serialize(): Record<string, number[]> | undefined };
  readonly chests: { serialize(): Record<string, number[]> | undefined };
}

/**
 * いま居る次元の持ち物をまとめる。**保存するときも、次元を移るときも同じものを渡す。**
 *
 * 2 か所に書き写さないこと —— 片方だけ直すと、移った先から戻ったときに
 * かまどの中身だけが消える、という形で静かに壊れる。
 */
export function collectState(from: StateSources): DimensionState {
  return {
    edits: serializeEdits(from.world.editsForSave()),
    drops: from.drops.serialize(),
    furnaces: from.furnaces.serialize(),
    chests: from.chests.serialize(),
  };
}

/** `buildSave()` に渡すもの。**ここに無い値はセーブに載らない。** */
export interface SaveParts {
  /**
   * ワールドの種。**`world.seed` を渡さないこと** —— あちらは生成器の種なので、
   * ネザーに居るあいだは塩を混ぜたあとの値になっていて、保存すると
   * **次に開いたとき別の世界になる**（`rules/dimensions.md`）。
   */
  readonly seed: number;
  readonly player: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly pitch: number;
    readonly flying: boolean;
  };
  readonly time: number;
  readonly creative: boolean;
  readonly health: number;
  readonly hunger: number;
  readonly inventory: number[];
  readonly craft: number[] | undefined;
  readonly volume: number;
  /** リスポーン地点。**世界に 1 点だけ**なので上の階層に置く。 */
  readonly bed: number[] | undefined;
  /**
   * その 1 点が**どの次元か**。**オーバーワールドなら `undefined`**（`shape.dim` と同じ作法）。
   * 地点そのものは 1 つのままで、増えるのは「どの次元の 1 点か」だけ。
   */
  readonly bedDim: string | undefined;
  /** `dims.forSave(collectState(...))` の結果。 */
  readonly shape: SaveShape;
}

/**
 * 書き出す形を組み立てる。**オーバーワールドの持ち物は上の階層のまま**で、
 * それ以外の次元だけが `dims` の下に入る（`shape` がそう分けてある）。
 */
export function buildSave(parts: SaveParts): SaveData {
  const { position } = parts.player;
  return {
    version: 1,
    seed: parts.seed,
    player: {
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: parts.player.yaw,
      pitch: parts.player.pitch,
      flying: parts.player.flying,
    },
    time: parts.time,
    creative: parts.creative,
    health: parts.health,
    hunger: parts.hunger,
    inventory: parts.inventory,
    craft: parts.craft,
    volume: parts.volume,
    drops: parts.shape.top.drops,
    furnaces: parts.shape.top.furnaces,
    chests: parts.shape.top.chests,
    bed: parts.bed,
    bedDim: parts.bedDim,
    edits: parts.shape.top.edits,
    dim: parts.shape.dim,
    dims: parts.shape.others,
  };
}

/**
 * 読んだセーブのうち、**そのまま信じてはいけない値**をここで均す。
 * `null` は「セーブに無い（既定のままにする）」の意味。
 *
 * - 時刻: 数でなければ触らない
 * - 体力: **0 以下は満タンで再開**（読み込んだ瞬間に死亡画面を出さない）
 * - 空腹: **0 も受け取る**（体力と違って、空腹 0 では死んでいない）。
 *   欠けているときは満腹（空腹が無かった頃のセーブ）
 */
export function restoredValues(saved: SaveData | null | undefined): {
  time: number | null;
  health: number | null;
  hunger: number | null;
} {
  const time = typeof saved?.time === "number" && Number.isFinite(saved.time) ? saved.time : null;
  const health =
    typeof saved?.health === "number" && saved.health > 0
      ? Math.min(MAX_HEALTH, saved.health)
      : null;
  const hunger =
    typeof saved?.hunger === "number" && Number.isFinite(saved.hunger)
      ? Math.max(0, Math.min(MAX_HUNGER, saved.hunger))
      : null;
  return { time, health, hunger };
}

/**
 * 読んだセーブを `dims.fromSave()` に渡す形へ。**上の階層（`edits` / `drops` /
 * `furnaces` / `chests`）がオーバーワールドのぶん**で、それ以外は `dims` の下。
 */
export function savedShape(saved: SaveData | null | undefined): {
  dim?: string;
  top: Partial<DimensionState>;
  others?: Record<string, DimensionState>;
} {
  return {
    dim: saved?.dim,
    top: {
      edits: saved?.edits,
      drops: saved?.drops,
      furnaces: saved?.furnaces,
      chests: saved?.chests,
    },
    others: saved?.dims,
  };
}
