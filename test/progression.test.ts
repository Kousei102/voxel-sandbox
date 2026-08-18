/**
 * クリア導線の進み具合。**ループの北極星。**
 *
 * `npm test` の緑は「壊していない」しか言わない。「クリアに近づいた」を測るものが
 * 無いと、ループは細かい直しを無限にやって進まない。ここが唯一の進捗の指標。
 *
 * ## 2 つの決まり
 *
 * 1. **未達の項目を `check()` に掛けないこと。** `harness.ts` の `summary()` は
 *    失敗が 1 件でもあれば `process.exitCode` を 1 にする。未達を `check()` にすると
 *    `npm test` が最初から赤くなり、**本物の退行と区別できなくなる**（CI も通らない）。
 *    ここでは数えて出すだけにして、`check()` に掛けるのは下の `ACHIEVED_BASELINE` だけ。
 *
 * 2. **後戻りしないこと（ラチェット）。** 項目を達成したら `ACHIEVED_BASELINE` を
 *    1 つ上げる。以後その項目が壊れると `npm test` が赤くなる。
 *    **上げ忘れると、達成が守られない。** 逆に、達成していないのに上げると即赤くなる。
 *
 * ## probe の育て方
 *
 * 最初の probe は **「名前がある」程度の仮の判定**（`仮` と出る）。土台が無いうちは
 * それ以上のことが書けないため。**実装したら必ず本物に差し替えること** ——
 * 深い検証はその機能のテストファイル（`test/portals.test.ts` など）に `check()` で書き、
 * ここの probe は「その入口が実際に動くか」を 1 つ呼ぶ形にする。
 * `仮` が残ったまま「達成 12 / 12」になっても、それはクリアできるという意味ではない。
 */

import { existsSync, readFileSync } from "node:fs";
import { BLOCKS, TIER_DIAMOND } from "../src/blocks";
import { RECIPES } from "../src/crafting";
import { check, describe } from "./harness";
import { NO_ITEM, dropOf, itemName } from "../src/items";

/**
 * **達成済みの件数。項目を達成したときだけ 1 つ上げること。**
 * これより減ったら `npm test` が赤くなる（達成の後戻りを退行として捕まえる）。
 */
const ACHIEVED_BASELINE = 0;

type Probe = () => { done: boolean; detail?: string };

interface Milestone {
  readonly name: string;
  /** `仮` = 名前や存在を見ているだけ。`本物` = 実際に動かしている。 */
  readonly kind: "仮" | "本物";
  readonly probe: Probe;
}

/** ブロックの表に、その名前のものがあるか。 */
function block(name: string) {
  return BLOCKS.find((b) => b.name === name);
}

/** アイテムの表に、その名前のものがあるか（1..255 を舐める）。 */
function item(name: string): number {
  for (let id = 1; id <= 255; id++) if (itemName(id) === name) return id;
  return NO_ITEM;
}

/** レシピの表に、その名前のものがあるか。 */
function recipe(name: string): boolean {
  return RECIPES.some((r) => r.name === name);
}

/** ソースが存在して、その語を含むか。**仮の判定にしか使わないこと。** */
function sourceHas(path: string, ...words: string[]): { done: boolean; detail?: string } {
  if (!existsSync(path)) return { done: false, detail: `${path} が無い` };
  const source = readFileSync(path, "utf8");
  const missing = words.filter((w) => !source.includes(w));
  return { done: missing.length === 0, detail: missing.length ? `${missing.join(" ")} が無い` : path };
}

const MILESTONES: readonly Milestone[] = [
  {
    name: "溶岩がある（黒曜石とネザーの海の材料）",
    kind: "仮",
    probe: () => {
      const lava = block("溶岩");
      return { done: !!lava, detail: lava ? `ID ${lava.id}` : "ブロックが無い" };
    },
  },
  {
    name: "黒曜石が手に入る（ダイヤのツルハシでだけ）",
    kind: "仮",
    probe: () => {
      const obsidian = block("黒曜石");
      if (!obsidian) return { done: false, detail: "ブロックが無い" };
      // 階層が足りない道具では何も落とさない（`mining.ts` の規則）ので、
      // minTier がダイヤであることが「ダイヤのツルハシが要る」の実体。
      const tier = obsidian.minTier === TIER_DIAMOND;
      const drops = dropOf(obsidian.id).item !== NO_ITEM;
      return { done: tier && drops, detail: `minTier ${obsidian.minTier} / ドロップ ${drops}` };
    },
  },
  {
    name: "火打石と打ち金が作れる",
    kind: "仮",
    probe: () => ({ done: recipe("火打石と打ち金") && item("火打石") !== NO_ITEM }),
  },
  {
    name: "ポータルの枠を検出して点火できる",
    kind: "仮",
    probe: () => sourceHas("src/portals.ts", "export function"),
  },
  {
    name: "ネザーへ行って戻れる（セーブを往復しても壊れない）",
    kind: "仮",
    // 次元ごとの入れ物は `SaveData` の**省略可の新しいキー**に置く。
    // `version` は 1 のまま（`test/storage.test.ts`）。
    probe: () => {
      const dims = sourceHas("src/dimensions.ts", "export");
      if (!dims.done) return dims;
      return sourceHas("src/storage.ts", "dims");
    },
  },
  {
    name: "ネザー要塞が原点から近くに生成される",
    kind: "仮",
    probe: () => sourceHas("src/structures.ts", "export"),
  },
  {
    name: "ブレイズがブレイズロッドを落とす",
    kind: "仮",
    probe: () => ({ done: item("ブレイズロッド") !== NO_ITEM }),
  },
  {
    name: "エンダーマンがエンダーパールを落とす",
    kind: "仮",
    probe: () => ({ done: item("エンダーパール") !== NO_ITEM }),
  },
  {
    name: "エンダーアイが作れる",
    kind: "仮",
    probe: () => ({ done: recipe("エンダーアイ") }),
  },
  {
    name: "投げたエンダーアイが要塞の方を向く",
    kind: "仮",
    probe: () => sourceHas("src/projectiles.ts", "export"),
  },
  {
    name: "エンドポータルが 12 個の枠で起動する",
    kind: "仮",
    probe: () => ({ done: !!block("エンドポータル枠") && !!block("エンドポータル") }),
  },
  {
    name: "エンドへ行ける",
    kind: "仮",
    probe: () => ({ done: !!block("エンドストーン") }),
  },
  {
    name: "エンダードラゴンを倒せる",
    kind: "仮",
    probe: () => sourceHas("src/mobs.ts", "dragon"),
  },
];

export function run(): void {
  describe("進行（クリア導線）");

  let achieved = 0;
  let placeholders = 0;
  const lines: string[] = [];

  for (const milestone of MILESTONES) {
    const { done, detail } = milestone.probe();
    if (done) achieved++;
    if (milestone.kind === "仮") placeholders++;
    lines.push(
      `      ${done ? "達成" : "未達"}  [${milestone.kind}] ${milestone.name}` +
        (detail ? `  — ${detail}` : ""),
    );
  }

  console.log(`      達成 ${achieved} / ${MILESTONES.length}（仮の判定 ${placeholders} 件）`);
  for (const line of lines) console.log(line);

  // **ここだけが `check()`。** 未達は失敗ではないが、達成の後戻りは失敗。
  check(
    `達成が ${ACHIEVED_BASELINE} 件から後戻りしていない`,
    achieved >= ACHIEVED_BASELINE,
    `いま ${achieved} 件`,
  );

  // 上げ忘れの逆（達成していないのに上げた）もここで気付ける。
  check(
    "ACHIEVED_BASELINE が実態を追い越していない",
    ACHIEVED_BASELINE <= MILESTONES.length,
    `${ACHIEVED_BASELINE} / ${MILESTONES.length}`,
  );

  // 達成したのに baseline を上げ忘れると、その項目は守られないまま残る。
  // 失敗にはしない（同じ周のうちに上げる想定）が、必ず目に入るようにしておく。
  if (achieved > ACHIEVED_BASELINE) {
    console.log(
      `      ※ ACHIEVED_BASELINE を ${achieved} に上げてください` +
        `（上げるまで、達成した項目は退行しても赤くなりません）`,
    );
  }
}
