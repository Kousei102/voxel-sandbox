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

import { existsSync } from "node:fs";
import {
  AIR,
  BLOCKS,
  LAVA,
  NETHERRACK,
  NETHER_BRICK,
  OBSIDIAN,
  STONE,
  WATER,
  frameHasEye,
  isEndPortalFrame,
} from "../src/blocks";
import { CHUNK_LAYERS, CHUNK_SIZE, CHUNK_VOLUME } from "../src/constants";
import { findRecipe } from "../src/crafting";
import { Dimensions, END, NETHER, OVERWORLD, type DimensionState } from "../src/dimensions";
import { Arena, Slab, seeded, sourceOf } from "./arena";
import { BOSSES, MOBS, Mobs, PLAYER_ATTACK_COOLDOWN, hostileFor } from "../src/mobs";
import { check, describe } from "./harness";
import { type Slot } from "../src/inventory";
import { NO_ITEM, dropOf, isFireStarter, itemName, itemStackLimit, rollDrop } from "../src/items";
import { liveCrystals, shatterCrystal } from "../src/crystals";
import { quenchAround } from "../src/liquids";
import { canHarvest } from "../src/mining";
import { ignite } from "../src/portals";
import {
  arrive,
  arriveThrough,
  buildPortal,
  linkScale,
  linkedSpot,
  planTravel,
  portalAt,
  standable,
} from "../src/portaltravel";
import { Projectiles, projectileDef } from "../src/projectiles";
import { STRONGHOLD, STRONGHOLD_SITE, eyeShot, nearestStronghold } from "../src/stronghold";
import { fitEye } from "../src/endportal";
import { placementsFor, type StructureDef } from "../src/structures";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { Scene } from "three";

/**
 * **達成済みの件数。項目を達成したときだけ 1 つ上げること。**
 * これより減ったら `npm test` が赤くなる（達成の後戻りを退行として捕まえる）。
 */
const ACHIEVED_BASELINE = 13;

/** ネザー要塞を探す範囲（列）。**広げると `npm test` がそのぶん遅くなります。** */
const RADIUS = 4;

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

/**
 * ソースが存在して、その語を含むか。**仮の判定にしか使わないこと。**
 *
 * **仮の判定は「成果物」に掛けること。** 「土台のファイルがあるか」「その名前の
 * 関数があるか」に掛けると、**器を作った瞬間・1 行足した瞬間に達成へ化けます**
 * （`structures.ts` / `dimensions.ts` / `projectiles.ts` / ブレイズ /
 * エンダーアイのレシピ / 要塞の方角と、同じ形で 6 度踏んでいます）。
 *
 * **コメントを落として読むこと**（`sourceOf`）。落とさないと、器の説明に書いた
 * 「ネザー要塞・要塞・エンドの黒曜石の柱が全部これに乗ります」がそのまま当たります。
 */
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
    kind: "本物",
    // **器があるかを見ないこと。** 前は `dimensions.ts` に `export` があるかを見ていて、
    // 器を作った瞬間に達成へ変わりました（行き先も移る手立ても無いのに）。
    // いまは「ネザーが遊べる次元として登録されているか」→「実際に往復して
    // 置いてきたものが残るか」→「`main.ts` に移る配線があるか」の順に見ます。
    probe: () => {
      const dims = new Dimensions();
      if (!dims.known(NETHER)) {
        return { done: false, detail: "ネザーがまだ次元の表に無い（生成器待ち）" };
      }
      // ネザーの地形が本当に作られるか（天井があること ＝ 空が見えないこと）。
      const gen = dims.sourceFor(NETHER, 12345);
      if (!gen) return { done: false, detail: "ネザーの生成器が無い" };
      const chunk = new Uint8Array(CHUNK_VOLUME);
      gen.generateChunk(0, CHUNK_LAYERS - 1, 0, chunk);
      const roof = chunk[((CHUNK_SIZE - 1) * CHUNK_SIZE + 0) * CHUNK_SIZE + 0];
      if (roof === AIR) return { done: false, detail: "ネザーに天井が無い" };

      // **実際に往復する。** 枠を建てて、通って、戻ってくるところまで。
      const over = new Slab();
      over.fill(-32, 132, 1, 40, -64, 32, STONE);
      const nether = new Slab();
      nether.fill(-32, 32, 1, 30, -32, 32, NETHERRACK);
      buildPortal(over, 100, 41, -37, "x");

      const home: DimensionState = { edits: { "0,2,0": [7, 3] } };
      if (!dims.switchTo(NETHER, home)) return { done: false, detail: "ネザーへ移れない" };
      const go = linkedSpot(100.5, -37.5, linkScale(OVERWORLD, NETHER));
      const there = arrive(nether, go.x, go.z, 41, "x");
      if (!standable(nether, Math.floor(there.x), there.y, Math.floor(there.z))) {
        return { done: false, detail: "ネザーで立てない場所に出る" };
      }

      const back = dims.switchTo(OVERWORLD, { edits: {} });
      if (back?.edits["0,2,0"]?.[1] !== 3) {
        return { done: false, detail: "戻るとオーバーワールドの改変が消える" };
      }
      const home2 = linkedSpot(there.x, there.z, linkScale(NETHER, OVERWORLD));
      const returned = arrive(over, home2.x, home2.z, there.y, "x");
      if (returned.built) return { done: false, detail: "戻るたびに新しい枠が建つ" };

      // ここだけは配線の確認（`main.ts` はヘッドレスでは動かせない）。
      const wired = sourceHas("src/main.ts", "switchTo", "arriveThrough", "portalAt", "planTravel");
      if (!wired.done) return { done: false, detail: `main.ts に移る配線が無い（${wired.detail}）` };
      return { done: true, detail: `往復できる（ネザーの出口 ${there.y}）` };
    },
  },
  {
    name: "ネザー要塞が原点から近くに生成される",
    kind: "本物",
    // **器（`structures.ts`）があるかを見ないこと。** 器を作った周に、要塞が
    // 1 個も建っていないのに達成へ変わりました。**実際に生成して探します。**
    //
    // 深い検証は `test/fortress.test.ts`（形・順序に依らないこと・費用）にあるので、
    // ここは「種を変えても、ポータルを出てすぐの所に建っているか」だけを見ます。
    // **要塞の床は必ず段 2（y 32..47）にある**ので、その段だけ舐めれば足ります。
    probe: () => {
      const chunk = new Uint8Array(CHUNK_VOLUME);
      const worst: string[] = [];
      for (const seed of [12345, 4242, 999]) {
        // **種ごとに器を作り直すこと。** `Dimensions` は次元 1 つにつき生成器を
        // 1 個だけ作って使い回す（列のキャッシュを捨てないため）ので、
        // 同じ器に別の種を渡しても**最初の種の地形が返ってきます**
        // （3 種類とも「最寄り 34 マス」と出て気付きました）。
        const gen = new Dimensions().sourceFor(NETHER, seed);
        if (!gen) return { done: false, detail: "ネザーの生成器が無い" };
        let best = Infinity;
        for (let cx = -RADIUS; cx <= RADIUS; cx++) {
          for (let cz = -RADIUS; cz <= RADIUS; cz++) {
            chunk.fill(0);
            gen.generateChunk(cx, 2, cz, chunk);
            if (!chunk.includes(NETHER_BRICK)) continue;
            const d = Math.hypot((cx + 0.5) * CHUNK_SIZE, (cz + 0.5) * CHUNK_SIZE);
            best = Math.min(best, d);
          }
        }
        if (!Number.isFinite(best)) return { done: false, detail: `種 ${seed} の近くに要塞が無い` };
        worst.push(`${seed}:${best.toFixed(0)}`);
      }
      // ネザーは 1:8 なので、100 マス歩けばオーバーワールドの 800 マス分。
      return { done: true, detail: `最寄りまで ${worst.join(" / ")} マス` };
    },
  },
  {
    name: "ブレイズがブレイズロッドを落とす",
    kind: "本物",
    // **アイテムがあるかを見ないこと。** 名前だけなら `items.ts` に 1 行足せば達成に
    // 化けます（`structures.ts` / `dimensions.ts` / `projectiles.ts` で 3 度踏みました）。
    // ここは「要塞の床に実際に湧く」→「倒すとロッドが落ちる」を 1 本通します。
    // 飛び方・火への強さの深い検証は `test/mobs.test.ts` にあります。
    probe: () => {
      const rod = item("ブレイズロッド");
      if (rod === NO_ITEM) return { done: false, detail: "ブレイズロッドのアイテムが無い" };
      if (!MOBS.blaze?.flying) return { done: false, detail: "ブレイズが飛ばない（溶岩の海を越えられない）" };

      // 要塞の床（ネザーレンガ）を暗くした試験場。**実際に湧かせる。**
      const arena = new Arena();
      arena.fill(-80, 80, 10, 10, -80, 80, NETHER_BRICK);
      const mobs = new Mobs();
      const ctx = { playerX: 0.5, playerY: 11, playerZ: 0.5, brightness: 1, random: seeded(4242) };
      mobs.populate(arena.asWorld(), ctx, 400);
      const blaze = mobs.list.find((mob) => mob.kind === "blaze");
      if (!blaze) return { done: false, detail: "ネザーレンガの上に 1 体も湧かない" };
      const others = mobs.list.filter((mob) => mob.kind !== "blaze").length;
      if (others > 0) return { done: false, detail: `要塞の床にブレイズ以外が ${others} 体湧く` };

      // 倒すと落ちるか。**乱数は呼ぶ側が作る**ので、確率 0.5 の当たり側を渡す。
      let dropped = 0;
      mobs.onDrop = (id, count) => {
        if (id === rod) dropped += count;
      };
      const axe = item("ダイヤの斧");
      let swings = 0;
      while (swings < 20 && mobs.list.includes(blaze)) {
        if (mobs.attack(blaze, axe, ctx, () => 0)) swings++;
        // 殴る間隔（`PLAYER_ATTACK_COOLDOWN`）を明ける
        mobs.update(PLAYER_ATTACK_COOLDOWN, arena.asWorld(), ctx);
      }
      return {
        done: dropped > 0,
        detail: `${mobs.count + 1} 体ぜんぶブレイズ / ${swings} 回で倒してロッド ${dropped} 個`,
      };
    },
  },
  {
    name: "エンダーマンがエンダーパールを落とす",
    kind: "本物",
    // **アイテムがあるかを見ないこと。** 名前だけなら `items.ts` に 1 行足せば達成に
    // 化けます（`structures.ts` / `dimensions.ts` / `projectiles.ts` / ブレイズで
    // 4 度踏みました）。ここは「夜の地表に実際に湧く」→「倒すとパールが落ちる」を
    // 1 本通します。跳び方の深い検証は `test/mobs.test.ts` にあります。
    probe: () => {
      const pearl = item("エンダーパール");
      if (pearl === NO_ITEM) return { done: false, detail: "エンダーパールのアイテムが無い" };
      if (!MOBS.enderman?.teleport) return { done: false, detail: "エンダーマンが跳ばない" };

      // 暗い石の平地（＝夜の地表と同じ湧き条件）。**実際に湧かせる。**
      // ゾンビ 100 に対して重み 10 なので、当たるまで試行数が要ります。
      const arena = new Arena();
      arena.fill(-80, 80, 10, 10, -80, 80, STONE);
      const mobs = new Mobs();
      const ctx = { playerX: 0.5, playerY: 11, playerZ: 0.5, brightness: 1, random: seeded(8181) };
      mobs.populate(arena.asWorld(), ctx, 600);
      const man = mobs.list.find((mob) => mob.kind === "enderman");
      if (!man) return { done: false, detail: `${mobs.count} 体湧いたがエンダーマンは 0 体` };

      // 倒すと落ちるか。**乱数は呼ぶ側が作る**ので、確率 0.5 の当たり側を渡す。
      let dropped = 0;
      mobs.onDrop = (id, count) => {
        if (id === pearl) dropped += count;
      };
      const axe = item("ダイヤの斧");
      let swings = 0;
      while (swings < 30 && mobs.list.includes(man)) {
        if (mobs.attack(man, axe, ctx, () => 0)) swings++;
        // 殴る間隔（`PLAYER_ATTACK_COOLDOWN`）を明ける
        mobs.update(PLAYER_ATTACK_COOLDOWN, arena.asWorld(), ctx);
      }
      return {
        done: dropped > 0,
        detail: `${mobs.count + 1} 体中エンダーマンが湧く / ${swings} 回で倒してパール ${dropped} 個`,
      };
    },
  },
  {
    name: "エンダーアイが作れる",
    kind: "本物",
    // **レシピの名前があるかを見ないこと。** `recipe("エンダーアイ")` だけなら
    // `crafting.ts` に 1 行足した瞬間に達成へ化けます（同じ形で 5 度踏んでいます）。
    // ここは「**2 つの導線が本当に合流しているか**」を見ます ——
    // 材料がどちらもモブの落とし物であること（＝要塞と夜の両方を通ること）と、
    // 手持ちの 2x2 で 2 段とも実際に組み上がること。
    // レシピの細かい検証（順番・置く場所・抜け道）は `test/crafting.test.ts`。
    probe: () => {
      const rod = item("ブレイズロッド");
      const pearl = item("エンダーパール");
      const powder = item("ブレイズパウダー");
      const eye = item("エンダーアイ");
      if (powder === NO_ITEM || eye === NO_ITEM) {
        return { done: false, detail: "ブレイズパウダーかエンダーアイのアイテムが無い" };
      }

      // **材料の出どころ。** どちらもモブ落ちでなければ、要塞にも夜にも行かずに作れる。
      if (MOBS.blaze?.drop.item !== rod || MOBS.enderman?.drop.item !== pearl) {
        return { done: false, detail: "材料がブレイズとエンダーマンの落とし物になっていない" };
      }

      // 2x2 の盤面を作る小道具（作業台を探しに戻らずに作れることも見る）。
      const hand = (...items: number[]): Slot[] =>
        Array.from({ length: 4 }, (_, i) => ({ item: items[i] ?? NO_ITEM, count: items[i] ? 1 : 0 }));

      // 1 段目: ロッド 1 本 → パウダー（Minecraft と同じで 2 個出る）
      const toPowder = findRecipe(hand(rod), 2);
      if (toPowder?.out !== powder) {
        return { done: false, detail: "ブレイズロッドからパウダーが作れない" };
      }
      // 2 段目: パウダー + パール → アイ
      const toEye = findRecipe(hand(powder, pearl), 2);
      if (toEye?.out !== eye) {
        return { done: false, detail: "パウダーとパールからエンダーアイが作れない" };
      }
      // **パウダーを飛ばす抜け道が無いこと。** あるとロッドが 2 倍要る。
      const shortcut = findRecipe(hand(rod, pearl), 2);
      if (shortcut) return { done: false, detail: `ロッド + パールが ${shortcut.name} になる` };

      const rods = Math.ceil(12 / toEye.count / toPowder.count);
      return {
        done: true,
        detail: `2x2 でロッド 1 → パウダー ${toPowder.count} → アイ ${toEye.count}（枠 12 個 = ロッド ${rods} 本）`,
      };
    },
  },
  {
    name: "投げたエンダーアイが要塞の方を向く",
    kind: "本物",
    // **名前があるかを見ないこと。** 前は `anySourceHas("strongholdDirection")` で、
    // 関数を 1 つ書いた瞬間に達成へ変わりました（`structures.ts` / `dimensions.ts` /
    // `projectiles.ts` / ブレイズ / エンダーアイのレシピと、同じ形で 5 度踏んでいます）。
    //
    // ここは**実際に投げます**。深い検証は `test/stronghold.test.ts` にあるので、
    // 導線として要る 2 つだけを見ます ——
    // (1) 投げた弾が本当に飛んでいて、その向きが要塞を指しているか
    // (2) その要塞を、地形を作る側（`structures.ts` の器）も同じ場所に建てるか
    //     （食い違うと、指した先を掘っても何も無い）。
    probe: () => {
      const eye = item("エンダーアイ");
      if (eye === NO_ITEM) return { done: false, detail: "エンダーアイのアイテムが無い" };

      // 要塞は地面の下なので、壁で止まる飛び道具では案内にならない。
      if (projectileDef("eye").onBlock !== "pass") {
        return { done: false, detail: "エンダーアイが壁で止まる" };
      }

      // **`STRONGHOLD_SITE` を広げただけの建物**を器に通す（建てるのは 2-8）。
      const marker: StructureDef = {
        ...STRONGHOLD_SITE,
        name: "要塞",
        extent: { x: 0, up: 0, z: 0 },
        build: () => {},
      };

      const spots: [number, number][] = [
        [0.5, 0.5],
        [523.5, -318.5],
        [-1204.5, 877.5],
      ];
      const seen: string[] = [];
      for (const seed of [12345, 4242]) {
        for (const [x, z] of spots) {
          const shot = eyeShot(seed, x, 70, z);
          if (!shot) return { done: false, detail: `種 ${seed} の (${x}, ${z}) で投げられない` };

          // **実際に飛ばす。** 注文の向きだけを見ると、表の速さ 0 でも通る。
          const flying = new Projectiles();
          const fired = flying.fire(shot);
          if (!fired || fired.velocity.length() <= 0) {
            return { done: false, detail: "投げたアイが飛ばない" };
          }

          const site = nearestStronghold(seed, x, z);
          if (!site) return { done: false, detail: "要塞が見つからない" };
          const dot =
            (fired.velocity.x * (site.x - x) + fired.velocity.z * (site.z - z)) /
            Math.hypot(fired.velocity.x, fired.velocity.z) /
            site.distance;
          if (dot < 1 - 1e-6) {
            return { done: false, detail: `向きが要塞を指していない（内積 ${dot.toFixed(3)}）` };
          }

          // **指した先に本当に建つか。** ここが食い違うと、掘るまで気付けない。
          const places = placementsFor([marker], seed, site.x >> 4, site.z >> 4, () => 40);
          if (!places.some((p) => p.x === site.x && p.z === site.z)) {
            return { done: false, detail: "指した先を地形の側が知らない" };
          }
          seen.push(site.distance.toFixed(0));
        }
      }
      return { done: true, detail: `${seen.length} 通りとも要塞を指す（${seen.join(" / ")} マス先）` };
    },
  },
  {
    name: "エンドポータルが 12 個の枠で起動する",
    kind: "本物",
    // **ブロックがあるかを見ないこと。** 前は「エンドポータル枠」と「エンドポータル」が
    // 表にあるかだけで、**ブロックを 1 行足した瞬間に達成へ化けました**
    // （`structures.ts` / `dimensions.ts` / `projectiles.ts` / ブレイズ /
    // エンダーアイのレシピ / 要塞の方角と、同じ形で 6 度踏んでいます）。
    //
    // ここは**要塞が実際に建てた輪**にアイを 12 個嵌めます。手で並べた輪だと、
    // 建てる側と起動する側が食い違っていても両方とも緑になります。
    // 深い検証（順番・角寄りの枠・未読み込みの列）は `test/endportal.test.ts`。
    probe: () => {
      const eye = item("エンダーアイ");
      const portal = block("エンドポータル");
      if (eye === NO_ITEM || !portal) return { done: false, detail: "アイかポータルのブロックが無い" };

      // **要塞の部屋をそのまま建てる**（`stronghold.ts` の `build()` を通す）。
      const slab = new Slab();
      const y = 40;
      STRONGHOLD.build({ def: STRONGHOLD, x: 0, y, z: 0 }, (px, py, pz, id) => {
        slab.setVoxel(px, py, pz, id);
      });

      // 建った枠を舐めて探す（輪の表を読み直さない）。
      const spots: [number, number, number][] = [];
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (isEndPortalFrame(slab.getVoxel(dx, y + 1, dz))) spots.push([dx, y + 1, dz]);
        }
      }
      if (spots.length !== 12) return { done: false, detail: `枠が ${spots.length} 個しか建たない` };
      if (spots.some(([x, fy, z]) => frameHasEye(slab.getVoxel(x, fy, z)))) {
        return { done: false, detail: "建った時点でアイが嵌まっている" };
      }

      // **アイ 12 個が 1 枠に収まること**（`stack` が足りないと集めきれない）。
      if (itemStackLimit(eye) < 12) return { done: false, detail: `アイのスタックが ${itemStackLimit(eye)}` };

      const inside = () => {
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) if (slab.getVoxel(dx, y + 1, dz) === portal.id) n++;
        }
        return n;
      };

      let used = 0;
      for (const [x, fy, z] of spots) {
        const fit = fitEye(slab, x, fy, z);
        if (fit.kind !== "fitted") return { done: false, detail: `${used + 1} 個目が嵌まらない` };
        used++;
        // **11 個では起動しないこと**（1 個でも足りれば、集める工程が意味を失う）。
        if (used < 12 && inside() > 0) return { done: false, detail: `${used} 個で起動してしまう` };
      }
      if (inside() !== 9) return { done: false, detail: `12 個嵌めても中心が ${inside()} マス` };

      // ここだけは配線の確認（`main.ts` はヘッドレスでは動かせない）。
      const wired = sourceHas("src/main.ts", "fitEye(");
      if (!wired.done) return { done: false, detail: "main.ts に嵌める配線が無い" };
      return { done: true, detail: `アイ ${used} 個で中心 3x3 が開く` };
    },
  },
  {
    name: "エンドへ行ける",
    kind: "本物",
    // **ブロックがあるかを見ないこと。** 前は `block("エンドストーン")` の存在だけで、
    // **`blocks.ts` に 1 行足した瞬間に達成へ化けました**（`structures.ts` /
    // `dimensions.ts` / `projectiles.ts` / ブレイズ / エンダーアイのレシピ /
    // 要塞の方角 / エンドポータルのブロックと、同じ形で 7 度踏んでいます）。
    //
    // ここは**要塞が実際に起動した面を踏んで、エンドの地形を作って降ります**。
    // 深い検証は `test/endgen.test.ts`（島の形）と `test/portaltravel.test.ts`
    // （種類の見分け・行き先・降ろし方）にあります。
    probe: () => {
      const stone = block("エンドストーン");
      if (!stone) return { done: false, detail: "エンドストーンのブロックが無い" };

      const dims = new Dimensions();
      if (!dims.known(END)) {
        return { done: false, detail: "エンドがまだ次元の表に無い（生成器待ち）" };
      }

      // **踏むのは要塞が起動した面。** 手で置いた面だと、建てる側・起動する側と
      // 食い違っていても通ってしまう。
      const slab = new Slab();
      const y = 40;
      STRONGHOLD.build({ def: STRONGHOLD, x: 0, y, z: 0 }, (px, py, pz, id) => {
        slab.setVoxel(px, py, pz, id);
      });
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (isEndPortalFrame(slab.getVoxel(dx, y + 1, dz))) fitEye(slab, dx, y + 1, dz);
        }
      }
      const here = portalAt(slab.getVoxel(0, y + 1, 0));
      if (here?.kind !== "end") {
        return { done: false, detail: "起動した面がエンドポータルとして見分けられない" };
      }

      // **遠くの要塞から入っても島を目指すこと。** 座標を掛け算で移す形だと、
      // ここで島の外（虚空）を指して、出た瞬間に落ちて死ぬ。
      const trip = planTravel(OVERWORLD, here, 5312.5, y + 1, -4096.5);
      if (trip.to !== END) return { done: false, detail: `行き先が ${trip.to}` };

      // **実際にエンドの地形を作って降りる。**
      const source = dims.sourceFor(END, 424242);
      if (!source) return { done: false, detail: "エンドの生成器が無い" };
      const world = new World(new Scene(), source);
      world.primeAround(trip.x, trip.z, 1);
      const landing = arriveThrough(world, trip);
      const lx = Math.floor(landing.x);
      const lz = Math.floor(landing.z);
      if (!standable(world, lx, landing.y, lz)) {
        return { done: false, detail: `出た場所 (${lx}, ${landing.y}, ${lz}) に立てない` };
      }
      if (world.getVoxel(lx, landing.y - 1, lz) !== stone.id) {
        return { done: false, detail: "足元がエンドストーンでない" };
      }

      // **島が有限であること。** 遠くまで地面が続くなら、それはエンドではなく平原。
      const far = new Uint8Array(CHUNK_VOLUME);
      source.generateChunk(40, 3, 40, far);
      if (far.some((id) => id !== AIR)) return { done: false, detail: "640 マス先にも地面がある" };

      // ここだけは配線の確認（`main.ts` はヘッドレスでは動かせない）。
      const wired = sourceHas("src/main.ts", "portalAt", "planTravel", "arriveThrough");
      if (!wired.done) return { done: false, detail: `main.ts に配線が無い（${wired.detail}）` };
      return {
        done: true,
        detail: `要塞の面 → エンドの島 (${lx}, ${landing.y}, ${lz}) に立てる`,
      };
    },
  },
  {
    name: "エンダードラゴンを倒せる",
    kind: "本物",
    // **`mobs.ts` に `dragon` という語があるかを見ないこと。** 前はそれだけで、
    // **表に 1 行足した瞬間に達成へ化けました**（`structures.ts` / `dimensions.ts` /
    // `projectiles.ts` / ブレイズ / エンダーアイのレシピ / 要塞の方角 /
    // エンドポータルのブロック / エンドストーンと、同じ形で 8 度踏んでいます）。
    //
    // ここは**エンドの島を実際に作って、そこに湧いたボスと戦います** ——
    // (1) 自然には湧かないこと（湧くなら夜の地表にも出る）
    // (2) エンドに降りれば居ること
    // (3) **生きているクリスタルがあるうちは倒せないこと**（＝柱を落とす意味）
    // (4) 落としきれば倒せること
    // 飛び方・輪・回復の深い検証は `test/mobs.test.ts` の「ボス」にあります。
    probe: () => {
      const plan = BOSSES[END];
      if (!plan) return { done: false, detail: "エンドにボスが居ない" };
      const def = MOBS[plan.kind];
      if (!def?.boss) return { done: false, detail: `${plan.kind} がボスとして置かれていない` };

      // **自然には湧かないこと。** 抽選に残っていると、夜のオーバーワールドに出る。
      const roll = seeded(4242);
      for (let i = 0; i < 500; i++) {
        if (hostileFor(STONE, roll) === plan.kind) {
          return { done: false, detail: "自然な湧きの抽選に出てくる" };
        }
      }

      const dims = new Dimensions();
      const source = dims.sourceFor(END, 424242);
      if (!source) return { done: false, detail: "エンドの生成器が無い" };
      const world = new World(new Scene(), source);
      // 柱（半径 28）まで読み込む。**読めていない列のクリスタルは数えない**ので、
      // 狭いと「最初から 0 個」になって (3) が意味を失う。
      world.primeAround(0.5, 0.5, 3);

      const mobs = new Mobs();
      const dragon = mobs.ensureBoss(END, world);
      if (!dragon) return { done: false, detail: "エンドに降りてもボスが居ない" };

      const guards = liveCrystals(world).length;
      if (guards < 2) return { done: false, detail: `生きているクリスタルが ${guards} 個しか無い` };

      const axe = item("ダイヤの斧");
      /** 倒れるまで殴る（最大 `limit` 回）。**回復のもとは毎回ワールドから数え直す。** */
      const fight = (limit: number): number => {
        let hits = 0;
        while (hits < limit && mobs.list.includes(dragon)) {
          const ctx = {
            playerX: dragon.position.x,
            playerY: dragon.position.y,
            playerZ: dragon.position.z,
            brightness: 1,
            // **`main.ts` とまったく同じ数え方**（生きていると確かめられたものだけ）。
            healers: liveCrystals(world).length,
            random: seeded(77),
          };
          if (mobs.attack(dragon, axe, ctx, () => 0)) hits++;
          mobs.update(PLAYER_ATTACK_COOLDOWN, world, ctx);
        }
        return hits;
      };

      // (3) クリスタルが生きているうちは倒せない。**回復が無ければ死んでいる回数**を
      // 振ってから見る（体力 200 / 1 発 4.5 なら 45 回で足りる）。
      const guarded = fight(60);
      if (!mobs.list.includes(dragon)) {
        return { done: false, detail: `クリスタル ${guards} 個が生きていても ${guarded} 回で倒せる` };
      }

      // (4) 落としきれば倒せる。**掘るのと同じ経路**（`shatterCrystal`）で砕く。
      for (const spot of liveCrystals(world)) shatterCrystal(world, spot.x, spot.y, spot.z);
      const left = liveCrystals(world).length;
      if (left > 0) return { done: false, detail: `砕いても ${left} 個残る` };
      const hits = fight(200);
      if (mobs.list.includes(dragon)) {
        return { done: false, detail: `クリスタルが 0 個でも ${hits} 回で倒せない` };
      }

      // ここだけは配線の確認（`main.ts` はヘッドレスでは動かせない）。
      const wired = sourceHas("src/main.ts", "ensureBoss(", "healers");
      if (!wired.done) return { done: false, detail: `main.ts に配線が無い（${wired.detail}）` };
      return {
        done: true,
        detail: `クリスタル ${guards} 個の間は ${guarded} 回振っても倒れず、0 個なら ${hits} 回で倒せる`,
      };
    },
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
