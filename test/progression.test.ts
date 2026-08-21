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

import { existsSync, readdirSync } from "node:fs";
import { AIR, BLOCKS, LAVA, OBSIDIAN, WATER } from "../src/blocks";
import { CHUNK_VOLUME } from "../src/constants";
import { RECIPES, findRecipe } from "../src/crafting";
import { Dimensions, NETHER, OVERWORLD, type DimensionState } from "../src/dimensions";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";
import { type Slot } from "../src/inventory";
import { NO_ITEM, dropOf, isFireStarter, itemName, rollDrop } from "../src/items";
import { quenchAround } from "../src/liquids";
import { canHarvest } from "../src/mining";
import { ignite } from "../src/portals";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { Scene } from "three";

/**
 * **達成済みの件数。項目を達成したときだけ 1 つ上げること。**
 * これより減ったら `npm test` が赤くなる（達成の後戻りを退行として捕まえる）。
 */
const ACHIEVED_BASELINE = 4;

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

/**
 * `src/` のどこかにその語を書いたファイルがあるか。**仮の判定にしか使わないこと。**
 *
 * **仮の判定は「成果物」に掛けること。** 「土台のファイルがあるか」に掛けると、
 * 器を作った瞬間に達成したことになります（`structures.ts` を足した周に
 * 「ネザー要塞が生成される」が勝手に達成へ変わりました。要塞は 1 個も建っていません）。
 */
function anySourceHas(word: string): { done: boolean; detail?: string } {
  for (const name of readdirSync("src")) {
    if (!name.endsWith(".ts")) continue;
    // **コメントを落として読むこと。** 落とさないと、器の説明に書いた
    // 「ネザー要塞・要塞・エンドの黒曜石の柱が全部これに乗ります」がそのまま当たります
    // （これで一度、要塞 0 個のまま達成に変わりました）。
    if (sourceOf(`src/${name}`).includes(word)) {
      return { done: true, detail: `src/${name}` };
    }
  }
  return { done: false, detail: `どこにも「${word}」が無い` };
}

/** ソースが存在して、その語を含むか。**仮の判定にしか使わないこと。** */
function sourceHas(path: string, ...words: string[]): { done: boolean; detail?: string } {
  if (!existsSync(path)) return { done: false, detail: `${path} が無い` };
  const source = sourceOf(path);
  const missing = words.filter((w) => !source.includes(w));
  return { done: missing.length === 0, detail: missing.length ? `${missing.join(" ")} が無い` : path };
}

const MILESTONES: readonly Milestone[] = [
  {
    name: "溶岩がある（黒曜石とネザーの海の材料）",
    kind: "本物",
    // 深い検証は `test/worldgen.test.ts`（高さの上限・散らばり）と
    // `test/lighting.test.ts`（生成された溶岩が光るか）にある。
    // ここは「実際に生成すると出てくるか」だけを 1 回まわして見る。
    probe: () => {
      const lava = block("溶岩");
      if (!lava) return { done: false, detail: "ブロックが無い" };
      if (lava.solid || !lava.replaceable || lava.emission === 0) {
        return { done: false, detail: "液体として置かれていない" };
      }
      const gen = new WorldGen(12345);
      const data = new Uint8Array(CHUNK_VOLUME);
      let found = 0;
      // 溶岩は y <= LAVA_LEVEL(10) なので、一番下の段（cy=0）だけで足りる。
      for (let cx = 0; cx < 4 && found === 0; cx++) {
        for (let cz = 0; cz < 4 && found === 0; cz++) {
          gen.generateChunk(cx * 3, 0, cz * 3, data);
          for (const id of data) if (id === LAVA) found++;
        }
      }
      return { done: found > 0, detail: `生成で ${found} マス見つかる` };
    },
  },
  {
    name: "黒曜石が手に入る（ダイヤのツルハシでだけ）",
    kind: "本物",
    // **実際に作って掘る。** 深い検証は `test/liquids.test.ts` にあるので、
    // ここは「水と溶岩をぶつければ黒曜石になり、ダイヤでだけ持ち帰れる」という
    // 導線そのものを 1 回通す。
    probe: () => {
      const obsidian = block("黒曜石");
      if (!obsidian) return { done: false, detail: "ブロックが無い" };

      const world = new World(new Scene(), new WorldGen(424242));
      world.primeAround(0.5, 0.5, 1);
      const y = world.surfaceY(0, 0) + 3;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) world.setVoxel(dx, y + dy, 0, AIR);
      }
      world.setVoxel(1, y, 0, LAVA);
      world.setVoxel(0, y, 0, WATER);
      quenchAround(world, 0, y, 0);
      const made = world.getVoxel(1, y, 0) === obsidian.id;

      // 階層が足りない道具では何も落とさない（`mining.ts` の規則）。
      const pick = item("ダイヤのツルハシ");
      const iron = item("鉄のツルハシ");
      const only = canHarvest(obsidian.id, pick) && !canHarvest(obsidian.id, iron);
      const drops = dropOf(obsidian.id).item !== NO_ITEM;
      return {
        done: made && only && drops,
        detail: `溶岩+水 → ${made ? "黒曜石" : "変わらず"} / minTier ${obsidian.minTier}`,
      };
    },
  },
  {
    name: "火打石と打ち金が作れる",
    kind: "本物",
    // **砂利を掘るところから通す。** 深い検証は `test/worldgen.test.ts`（砂利の湧き方）と
    // `test/mining.test.ts`（火打石の割合）と `test/crafting.test.ts`（レシピ）にあるので、
    // ここは「地面から掘り出して、手持ちの 2x2 で組み上がるか」だけを 1 本通す。
    probe: () => {
      const gravel = block("砂利");
      const flint = item("火打石");
      if (!gravel || flint === NO_ITEM) return { done: false, detail: "砂利か火打石が無い" };

      // 生成に砂利が埋まっているか（無ければ火打石は永久に手に入らない）。
      const gen = new WorldGen(12345);
      const data = new Uint8Array(CHUNK_VOLUME);
      let buried = 0;
      for (let cy = 0; cy < 4 && buried === 0; cy++) {
        gen.generateChunk(0, cy, 0, data);
        for (const id of data) if (id === gravel.id) buried++;
      }

      // 掘れば火打石が出る目があるか（`otherwise` があるので外しても砂利は残る）。
      const hit = rollDrop(gravel.id, 0.05).item === flint;
      const miss = rollDrop(gravel.id, 0.5).item === gravel.id;

      // 手持ちの 2x2 で組めるか（作業台を探しに戻らずに済む）。
      const grid: Slot[] = [
        { item: item("鉄インゴット"), count: 1 },
        { item: flint, count: 1 },
        { item: NO_ITEM, count: 0 },
        { item: NO_ITEM, count: 0 },
      ];
      const made = findRecipe(grid, 2)?.name === "火打石と打ち金";
      return {
        done: buried > 0 && hit && miss && made,
        detail: `砂利 ${buried} マス / 火打石 ${hit ? "出る" : "出ない"} / 2x2 で${made ? "作れる" : "作れない"}`,
      };
    },
  },
  {
    name: "ポータルの枠を検出して点火できる",
    kind: "本物",
    // **実際に枠を組んで火を点ける。** 枠の形の細かい検証は `test/portals.test.ts`
    // （欠けた枠・大きすぎる枠・角の扱い）にあるので、ここは導線を 1 本通すだけ。
    probe: () => {
      const portal = block("ネザーポータル");
      if (!portal) return { done: false, detail: "ブロックが無い" };
      if (!isFireStarter(item("火打石と打ち金"))) return { done: false, detail: "火種が無い" };

      const world = new World(new Scene(), new WorldGen(424242));
      world.primeAround(0.5, 0.5, 1);
      const base = world.surfaceY(0, 0) + 2;
      // 内側 2x3 の枠。四隅も置く（角は無くてもよいが、あって困らない）。
      for (let y = base - 1; y <= base + 3; y++) {
        for (let x = -1; x <= 2; x++) {
          const inside = x >= 0 && x <= 1 && y >= base && y <= base + 2;
          world.setVoxel(x, y, 0, inside ? AIR : OBSIDIAN);
        }
      }
      const lit = ignite(world, 0, base, 0);
      const filled = world.getVoxel(1, base + 2, 0) === portal.id;
      return {
        done: lit === 6 && filled,
        detail: `内側 2x3 に ${lit} マス点いた`,
      };
    },
  },
  {
    name: "ネザーへ行って戻れる（セーブを往復しても壊れない）",
    kind: "仮",
    // **器があるかを見ないこと。** 前は `dimensions.ts` に `export` があるかを見ていて、
    // 器を作った瞬間に達成へ変わりました（行き先も移る手立ても無いのに）。
    // いまは「ネザーが遊べる次元として登録されているか」→「実際に往復して
    // 置いてきたものが残るか」→「`main.ts` に移る配線があるか」の順に見ます。
    probe: () => {
      const dims = new Dimensions();
      if (!dims.known(NETHER)) {
        return { done: false, detail: "ネザーがまだ次元の表に無い（生成器待ち）" };
      }
      // 往復して、オーバーワールドに置いてきたものが残るか。
      const home: DimensionState = { edits: { "0,2,0": [7, 3] } };
      if (!dims.switchTo(NETHER, home)) return { done: false, detail: "ネザーへ移れない" };
      const back = dims.switchTo(OVERWORLD, { edits: {} });
      if (back?.edits["0,2,0"]?.[1] !== 3) {
        return { done: false, detail: "戻るとオーバーワールドの改変が消える" };
      }
      // ここだけは仮の判定（配線は `main.ts` にあり、ヘッドレスでは動かせない）。
      const wired = sourceHas("src/main.ts", "switchTo");
      return { done: wired.done, detail: wired.done ? "往復できる" : "main.ts に移る配線が無い" };
    },
  },
  {
    name: "ネザー要塞が原点から近くに生成される",
    kind: "仮",
    // **器（`structures.ts`）があるかを見ないこと。** 器を作った周に、要塞が
    // 1 個も建っていないのに達成へ変わりました。**建つものの名前**で見ます。
    probe: () => anySourceHas("ネザー要塞"),
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
