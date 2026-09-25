import { readFileSync } from "node:fs";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import {
  AIR,
  BED,
  BLOCKS,
  BOOKSHELF,
  BRICK,
  BROWN_MUSHROOM,
  CACTUS,
  CAKE,
  CLAY,
  COAL_BLOCK,
  COAL_ORE,
  COBBLE_SLAB,
  COBWEB,
  DIAMOND_BLOCK,
  DIRT,
  END_PORTAL_FRAME,
  FACE_XN,
  FACE_XP,
  FACE_YN,
  FACE_YP,
  FACE_ZN,
  FACE_ZP,
  FARMLAND,
  FENCE,
  FENCE_ARMS,
  FENCE_POST_BOX,
  FRAME_HEIGHT,
  GOLD_BLOCK,
  GLASS,
  GLOWSTONE,
  GRASS,
  GRAVEL,
  ICE,
  IRON_BLOCK,
  LADDER,
  LADDER_XN,
  LADDER_ZN,
  LADDER_ZP,
  LEAVES,
  LAVA,
  LOW_BAND_MAX,
  MAX_BLOCK_ID,
  NETHER_BRICK,
  NETHER_BRICK_FENCE,
  NETHER_BRICK_SLAB,
  NETHER_BRICK_SLAB_TOP,
  NO_SUPPORT,
  OBSIDIAN,
  PLANK,
  PLANK_SLAB,
  PLANK_SLAB_TOP,
  PLANK_STAIRS,
  RED_MUSHROOM,
  SAND,
  SAPLING,
  SANDSTONE,
  SANDSTONE_SLAB,
  SHARED_ID_START,
  SNOW,
  SPRUCE_LEAVES,
  SPRUCE_SAPLING,
  STONE,
  STONE_BRICK,
  STONE_BRICK_SLAB,
  STONE_BRICK_SLAB_TOP,
  STONE_SLAB,
  STONE_SLAB_TOP,
  STONE_STAIRS,
  SUGAR_CANE,
  TALL_GRASS,
  TIER_HAND,
  TIER_IRON,
  TIER_STONE,
  TIER_WOOD,
  TORCH,
  VARIANT_BAND_MAX,
  VINE,
  VINE_XN,
  VINE_ZN,
  VINE_ZP,
  WALL_TORCH_ZN,
  WATER,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  baseBlock,
  blockDef,
  blockName,
  blockTool,
  blocksSky,
  canSupport,
  collisionBoxes,
  endPortalFrame,
  fenceConnects,
  frameFacing,
  frameHasEye,
  hangsBelow,
  isEndPortalFrame,
  isClimbable,
  isOpaque,
  isProp,
  isHotLiquid,
  ladderVariant,
  isLiquid,
  isReplaceable,
  isBladed,
  isSlippery,
  isSoil,
  isSpiky,
  isSticky,
  isTallCollision,
  isTranslucent,
  remainsAfterBreak,
  liquidFog,
  needsSoil,
  needsSand,
  isSand,
  needsBank,
  isBank,
  needsWater,
  wetsBank,
  waterBesideOk,
  placeSpot,
  placedVariant,
  shapeBoxes,
  shapeBounds,
  stacksOnSelf,
  supportFaces,
  supportHint,
  supportsBlock,
  tilled,
  torchVariant,
  vineVariant,
} from "../src/blocks";
import { MAX_LIGHT } from "../src/constants";
import { Crops, MUSHROOM_SPREAD_SECONDS } from "../src/crops";
import { BLOCK_LIGHT, SKY_LIGHT } from "../src/lighting";
import { PLAYER_SIZE } from "../src/physics";
import {
  APPLE,
  ARROW,
  BONE,
  BOOK,
  BOW,
  BOWL,
  BREAD,
  BRICK_ITEM,
  BUCKET,
  CHARCOAL,
  CLAY_BALL,
  COAL,
  COOKED_CHICKEN,
  DIAMOND,
  DIAMOND_BOOTS,
  DIAMOND_CHESTPLATE,
  DIAMOND_HELMET,
  DIAMOND_LEGGINGS,
  DIAMOND_SWORD,
  DIAMOND_HOE,
  EGG,
  FEATHER,
  GOLDEN_APPLE,
  GOLD_BOOTS,
  GOLD_CHESTPLATE,
  GOLD_HELMET,
  GLOWSTONE_DUST,
  SPIDER_EYE,
  GOLD_INGOT,
  GOLD_LEGGINGS,
  IRON_BOOTS,
  IRON_CHESTPLATE,
  IRON_HELMET,
  IRON_INGOT,
  IRON_LEGGINGS,
  IRON_PICKAXE,
  LAVA_BUCKET,
  LEATHER,
  LEATHER_BOOTS,
  LEATHER_CHESTPLATE,
  LEATHER_HELMET,
  LEATHER_LEGGINGS,
  MAX_ITEM_ID,
  MILK_BUCKET,
  MUSHROOM_STEW,
  NO_ITEM,
  PAPER,
  RAW_BEEF,
  RAW_CHICKEN,
  SHEARS,
  SNOWBALL,
  STEAK,
  STICK,
  STRING,
  SUGAR,
  WATER_BUCKET,
  WHEAT,
  WHEAT_SEEDS,
  WOOD_AXE,
  WOOD_HOE,
  WOOD_PICKAXE,
  WOOD_SWORD,
  allFoodIds,
  allItemIds,
  bucketOf,
  bucketUse,
  dropOf,
  emptyAfterEating,
  foodOf,
  isBlade,
  extraDrops,
  isBucket,
  isHoe,
  isSeed,
  itemColor,
  itemName,
  itemStackLimit,
  liquidOf,
  placedBlock,
  rollDrop,
  rollDrops,
  thrownProjectile,
  toolOf,
} from "../src/items";
import { PROJECTILE_KINDS } from "../src/projectiles";
import { breakTime, canHarvest } from "../src/mining";
import { Player } from "../src/player";
import { raycastVoxels } from "../src/raycast";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { check, describe } from "./harness";

export function run(): void {
  describe("ブロック ID の枠");

  // 3 帯（`blocks.ts` の「ブロック ID の枠」）。1..63 と 64..110 は**凍結**で、
  // 新しい番号は 111 以降の**ブロックとアイテムで 1 本の列**から取る。
  const cubes = BLOCKS.filter((b) => b.model === "cube");
  const props = BLOCKS.filter((b) => b.model !== "cube");
  const variantBand = BLOCKS.filter((b) => b.id > LOW_BAND_MAX && b.id <= VARIANT_BAND_MAX);
  const shared = BLOCKS.filter((b) => b.id >= SHARED_ID_START);

  // **空きは 2 つとも出すこと。** 1..63 が尽きても 111 以降で続けられる、という
  // 一点がこの枠の全部なので、片方だけ出すと「もう置けない」に見える。
  const lowFree = LOW_BAND_MAX - BLOCKS.filter((b) => b.id <= LOW_BAND_MAX).length + 1;
  const sharedUsed = new Set([...shared.map((b) => b.id), ...allItemIds().filter((i) => i >= SHARED_ID_START)]);
  const sharedFree = MAX_BLOCK_ID - SHARED_ID_START + 1 - sharedUsed.size;
  console.log(
    `      立方体 ${cubes.length} / 非立方体 ${props.length}（うち向き違いの帯 ${variantBand.length}）` +
      `  1..63 の空き ${lowFree}  111..255 の空き ${sharedFree}`,
  );

  check(
    "ID は上限 255 に収まる（ボクセルが Uint8Array）",
    BLOCKS.every((b) => b.id <= MAX_BLOCK_ID),
    BLOCKS.filter((b) => b.id > MAX_BLOCK_ID)
      .map((b) => b.name)
      .join(" "),
  );
  check(
    "64..110 は立方体でない向き違いだけ（凍結した帯）",
    variantBand.every((b) => isProp(b.id) && b.variantOf !== AIR),
    variantBand.map((b) => `${b.id}:${b.name}`).join(" "),
  );
  check(
    "ID が重複していない",
    new Set(BLOCKS.map((b) => b.id)).size === BLOCKS.length,
    `${BLOCKS.length} 個`,
  );

  // **111 以降はブロックとアイテムで 1 本の番号列。** 片側だけ見て空き番号を取ると、
  // 「ブロック側では空きなのにアイテム側では埋まっている」番号を掴む。
  // その番号のブロックを置いてから壊すと、まったく別のアイテムが手に入る。
  const collisions = shared
    .filter((b) => itemName(b.id) !== "" && placedBlock(b.id) !== b.id)
    .map((b) => `${b.id}:${b.name} ↔ アイテム ${itemName(b.id)}`);
  check(
    "111 以降で 1 つの番号を 2 つのものが取っていない",
    collisions.length === 0,
    collisions.join(" / ") || `共有帯の使用済み ${sharedUsed.size} 個`,
  );

  // **アイテムの側も数を出すこと。** ブロックだけ数えていると、共有帯を
  // アイテムで埋めたときに「空きが減った理由」が出力から読めない。
  const sharedItems = allItemIds().filter((id) => id >= SHARED_ID_START);
  console.log(
    `      アイテム ${allItemIds().length} 種（うち共有帯 ${sharedItems.length} 個: ` +
      `${sharedItems.map((id) => `${id} ${itemName(id)}`).join(" / ")}）  MAX_ITEM_ID ${MAX_ITEM_ID}`,
  );
  // **ゆるめるのではなく数え直すこと。** 123 はブロック（実った小麦）なので、
  // 共有帯のアイテムは 122 と 124 の 2 つが飛び飛びに並ぶ（1 本の番号列だから正しい）。
  // **135..137 は `items.ts` に 1 行も書かずに増えた 3 個です** —— 鉱物をしまう立方体を
  // `blocks.ts` に足すと、`variantOf === AIR` なので for が同じ番号のアイテムを作ります。
  check(
    "共有帯のアイテムは剣 4 本・シアーズ・クワ 4 本・小麦の種・小麦・パン・鶏の肉 2 つ・羽根・卵・牛の肉 2 つ・革・糸・雪玉・鉱物の立方体 3 つ・ミルクバケツ・キノコ 2 種・ボウル・シチュー・サトウキビ・砂糖・はしご・リンゴ・紙・本・本棚・金のリンゴ・クモの巣・ケーキ・氷・フェンス・革の防具 4 部位・骨・木炭・苗木 2 種・粘土・粘土玉・レンガ・鉄の防具 4 部位・金・ダイヤの防具 8 部位・ツタ・ネザーレンガのフェンス・石炭ブロック・グロウストーンダスト・クモの目の 69 個（190 まで。**クモの目が入ったので数え直した** —— 名指しの一覧はそのままで、末尾に 1 個足しただけ）",
    sharedItems.length === 69 && sharedItems[4] === SHEARS && sharedItems[8] === DIAMOND_HOE &&
      sharedItems[9] === WHEAT_SEEDS && sharedItems[10] === WHEAT && sharedItems[11] === BREAD &&
      sharedItems[12] === RAW_CHICKEN && sharedItems[13] === COOKED_CHICKEN &&
      sharedItems[14] === FEATHER && sharedItems[15] === EGG &&
      sharedItems[16] === RAW_BEEF && sharedItems[17] === STEAK &&
      sharedItems[18] === LEATHER && sharedItems[19] === STRING &&
      sharedItems[20] === SNOWBALL && sharedItems[21] === IRON_BLOCK &&
      sharedItems[22] === GOLD_BLOCK && sharedItems[23] === DIAMOND_BLOCK &&
      sharedItems[24] === MILK_BUCKET &&
      // **139..140 は `items.ts` に 1 行も書かずに増えた 2 個です**（135..137 と同じで、
      // `variantOf === AIR` のブロックには for が同じ番号のアイテムを作ります）。
      // **`MAX_ITEM_ID` を伸ばすのだけは手作業**なので、そこは別に突き合わせます。
      sharedItems[25] === RED_MUSHROOM && sharedItems[26] === BROWN_MUSHROOM &&
      // **141 / 142 は `items.ts` に手で足した 2 個**（ブロックは 1 つも増えていない）。
      // **上限を伸ばすのは手作業**なので、そこは別に突き合わせる。
      sharedItems[27] === BOWL && sharedItems[28] === MUSHROOM_STEW &&
      // **143 は `items.ts` に 1 行も書かずに増えたブロック**（サトウキビ。139..140 と
      // 同じで `variantOf === AIR`）で、**144 は手で足したアイテム**（砂糖）。
      // **上限を伸ばすのは手作業**なので、そこは別に突き合わせる。
      sharedItems[29] === SUGAR_CANE && sharedItems[30] === SUGAR &&
      // **145 は `items.ts` に 1 行も書かずに増えたブロック**（はしごの大元。
      // 143 と同じで `variantOf` が `AIR`）。**146..148 は `variantOf: LADDER` なので
      // アイテムを持ちません** —— だからブロックが 4 個増えてもアイテムは 1 個だけ。
      // **上限を伸ばすのは手作業**なので、そこは別に突き合わせる。
      sharedItems[31] === LADDER &&
      // **149 は `items.ts` に手で足したアイテム**（リンゴ）。**146..148 は飛ばしたまま**
      // （はしごの向き違いが取っている番号で、振り直せないので詰めません）。
      sharedItems[32] === APPLE &&
      // **150 / 151 は `items.ts` に手で足したアイテム**（紙・本）で、**152 は
      // `items.ts` に 1 行も書かずに増えたブロック**（本棚。145 と同じで `variantOf` が
      // `AIR` なので for が同じ番号のアイテムを作る）。**上限を持つのがブロック側なのは
      // 4 度目**なので、`MAX_ITEM_ID` の突き合わせをここで一緒に見る。
      sharedItems[33] === PAPER && sharedItems[34] === BOOK &&
      sharedItems[35] === BOOKSHELF &&
      // **153 は `items.ts` に手で足したアイテム**（金のリンゴ）。**ブロックは 1 つも
      // 増えていない**ので、上限がアイテム側に戻った（本棚で 4 度目だったブロック側から）。
      sharedItems[36] === GOLDEN_APPLE &&
      // **154 は `items.ts` に 1 行も書かずに増えたブロック**（クモの巣。152 本棚と
      // 同じで `variantOf` が `AIR` なので for が同じ番号のアイテムを作る）。
      sharedItems[37] === COBWEB &&
      // **155 も同じ**（ケーキ。`variantOf` が `AIR`）。
      sharedItems[38] === CAKE &&
      // **156 も同じ**（氷。`variantOf` が `AIR` なので for が同じ番号のアイテムを作る）。
      sharedItems[39] === ICE &&
      // **157 も同じ**（フェンス。`variantOf` が `AIR`）。
      sharedItems[40] === FENCE &&
      // **158..161 は `items.ts` に手で足したアイテム 4 つ**（革の防具 4 部位）。
      // **ブロックは 1 つも増えていない**ので、上限がアイテム側に戻った
      // （フェンスまで 8 度目だったブロック側から）。
      sharedItems[41] === LEATHER_HELMET && sharedItems[42] === LEATHER_CHESTPLATE &&
      sharedItems[43] === LEATHER_LEGGINGS && sharedItems[44] === LEATHER_BOOTS &&
      // **162 も `items.ts` に手で足したアイテム**（骨。スケルトンの落とし物で、
      // ブロックは 1 つも増えていない）。
      sharedItems[45] === BONE &&
      // **163 も `items.ts` に手で足したアイテム**（木炭。原木を焼くと出る燃料で、
      // ブロックは 1 つも増えていない）。
      sharedItems[46] === CHARCOAL &&
      // **164..165 は `items.ts` に 1 行も書かずに増えたブロック 2 つ**（苗木 2 種。
      // 157 フェンスと同じで `variantOf` が `AIR` なので for が同じ番号のアイテムを作る）。
      // **上限を持つのがブロック側なのは 9 度目**なので、`MAX_ITEM_ID` の突き合わせも
      // ここで一緒に見る（伸ばし忘れは型では止まらない。**比べる相手を新しい番号に
      // 直すこと** —— 古い番号のまま残すと `tsc` が TS2367 で落ちます。`rules/testing.md`）。
      sharedItems[47] === SAPLING && sharedItems[48] === SPRUCE_SAPLING &&
      // **168 は `items.ts` に 1 行も書かずに増えたブロック**（粘土。164..165 の苗木と
      // 同じで `variantOf` が `AIR` なので for が同じ番号のアイテムを作る）で、
      // **169 は手で足したアイテム**（粘土玉。掘ると 4 個落ちる）。
      sharedItems[49] === CLAY && sharedItems[50] === CLAY_BALL &&
      // **170 も手で足したアイテム**（レンガ。粘土玉を焼くと出る。ブロックは 1 つも
      // 増えていない —— 組み上がる先は低帯の `BRICK`(12) なので）。
      sharedItems[51] === BRICK_ITEM &&
      // **171..174 は `items.ts` に手で足したアイテム 4 つ**（鉄の防具 4 部位。
      // 158..161 の革と同じで、ブロックは 1 つも増えていない）。**33b でも動かない。**
      sharedItems[52] === IRON_HELMET && sharedItems[53] === IRON_CHESTPLATE &&
      sharedItems[54] === IRON_LEGGINGS && sharedItems[55] === IRON_BOOTS &&
      // **175..182 も `items.ts` に手で足したアイテム 8 つ**（金・ダイヤの防具 8 部位。
      // 革・鉄と同じで、ブロックは 1 つも増えていない）。
      // **上限を持つのはアイテム側のまま**なので、`MAX_ITEM_ID` の突き合わせも
      // ここで一緒に見る（伸ばし忘れは型では止まらない。**比べる相手を新しい番号に
      // 直すこと** —— 古い番号のまま残すと `tsc` が TS2367 で落ちます。`rules/testing.md`）。
      sharedItems[56] === GOLD_HELMET && sharedItems[57] === GOLD_CHESTPLATE &&
      sharedItems[58] === GOLD_LEGGINGS && sharedItems[59] === GOLD_BOOTS &&
      sharedItems[60] === DIAMOND_HELMET && sharedItems[61] === DIAMOND_CHESTPLATE &&
      sharedItems[62] === DIAMOND_LEGGINGS && sharedItems[63] === DIAMOND_BOOTS &&
      // **183 は `items.ts` に 1 行も書かずに増えたブロック**（ツタの大元。145 の
      // はしごと同じで `variantOf` が `AIR` なので for が同じ番号のアイテムを作る）。
      // **184..186 は `variantOf: VINE` なのでアイテムを持ちません** —— だから
      // ブロックが 4 個増えてもアイテムは 1 個だけ。
      sharedItems[64] === VINE &&
      // **187 も `items.ts` に 1 行も書かずに増えたブロック**（ネザーレンガの
      // フェンス。157 のフェンスと同じで `variantOf` が `AIR` なので for が同じ
      // 番号のアイテムを作る）。
      sharedItems[65] === NETHER_BRICK_FENCE &&
      // **188 も同じ**（石炭ブロック。135..137 の鉱物をしまう立方体と同じで
      // `variantOf` が `AIR`）。**上限を持つのがブロック側なのは 12 度目**なので、
      // `MAX_ITEM_ID` の突き合わせをここで一緒に見る（伸ばし忘れは型では止まらない。
      // **比べる相手を新しい番号に直すこと** —— 古い番号のまま残すと `tsc` が
      // TS2367 で落ちます。`rules/testing.md`）。
      sharedItems[66] === COAL_BLOCK &&
      // **189 は手で足したアイテム**（グロウストーンダスト。ブロックは増えない ——
      // 組み上がる先は低帯の `GLOWSTONE`(47) なので）。上限がアイテム側に戻った。
      sharedItems[67] === GLOWSTONE_DUST &&
      // **190 も手で足したアイテム**（クモの目。ブロックは増えない）。
      sharedItems[68] === SPIDER_EYE &&
      MAX_ITEM_ID === SPIDER_EYE,
    `${sharedItems.join(" ")} / MAX_ITEM_ID ${MAX_ITEM_ID}`,
  );
  // **空きも数で押さえること。** 上の一覧だけだと、番号を飛ばして取っても緑のまま
  // （一覧は「何番が入っているか」しか見ていない）。**尽きたら人を呼ぶ**という
  // 予算がこの数字なので（`AUTODEV.md` の 2）、減り方を 1 件として見張る。
  check(
    "111..255 の空きは 65（クモの目 190 で 1 個減った。番号を 1 つ取ったので数え直した）",
    sharedFree === 65,
    `${sharedFree} 個`,
  );
  // **肉は置けず・道具でもなく・食べられる。** 3 つを並べて見ること —— `block` を
  // 付ければ置ける肉になり、`tool:` を付ければ `TOOL_ATTACK` に無い種類が入って NaN、
  // `FOODS` に無ければ拾えるだけの飾りになる（どれも型では止まらない）。
  const meats: [string, number][] = [
    ["生鶏肉", RAW_CHICKEN],
    ["焼き鳥", COOKED_CHICKEN],
    // 牛の肉も鶏とまったく同じ 3 点で見る（**ステーキは焼き豚と同点**なので、
    // 数値そのものは `vitals` 側ではなく上の出力で読む）。
    ["生牛肉", RAW_BEEF],
    ["ステーキ", STEAK],
  ];
  for (const [name, id] of meats) {
    const food = foodOf(id);
    console.log(
      `      ${name}(${id}) 置ける ${placedBlock(id) !== AIR} / 道具 ${toolOf(id) !== null}` +
        ` / 食べ物 空腹 +${food?.hunger} 満腹度 +${food?.saturation} 毒 ${food?.poison}`,
    );
    check(
      `${name}は置けず・道具でもなく・食べられる`,
      placedBlock(id) === AIR && toolOf(id) === null && food !== null,
      `block ${placedBlock(id)} / tool ${toolOf(id)} / food ${food === null ? "なし" : "あり"}`,
    );
  }
  // **羽根は肉と違って食べ物ではありません。** 3 つとも「無い」ことを並べて見ること ——
  // `block` を付ければ置ける羽根になり、`tool:` を付ければ `TOOL_ATTACK` に無い種類が
  // 入って NaN、`FOODS` に足せば食べられる羽根になります（どれも型では止まりません）。
  console.log(
    `      羽根(${FEATHER}) 置ける ${placedBlock(FEATHER) !== AIR}` +
      ` / 道具 ${toolOf(FEATHER) !== null} / 食べ物 ${foodOf(FEATHER) !== null}`,
  );
  check(
    "羽根は置けず・道具でもなく・食べ物でもない",
    placedBlock(FEATHER) === AIR && toolOf(FEATHER) === null && foodOf(FEATHER) === null,
    `block ${placedBlock(FEATHER)} / tool ${toolOf(FEATHER)} / food ${foodOf(FEATHER)}`,
  );
  // **革も羽根とまったく同じ「置けず・道具でもなく・食べ物でもない」もの**です
  // （肉と同じ山から出るので、`FOODS` に紛れ込んでも型では止まりません）。
  // **使い道はまだありません** —— 防具も本も別件なので、レシピも精錬も 0 行です。
  console.log(
    `      革(${LEATHER}) 置ける ${placedBlock(LEATHER) !== AIR}` +
      ` / 道具 ${toolOf(LEATHER) !== null} / 食べ物 ${foodOf(LEATHER) !== null}`,
  );
  check(
    "革は置けず・道具でもなく・食べ物でもない",
    placedBlock(LEATHER) === AIR && toolOf(LEATHER) === null && foodOf(LEATHER) === null,
    `block ${placedBlock(LEATHER)} / tool ${toolOf(LEATHER)} / food ${foodOf(LEATHER)}`,
  );
  // **糸も革・羽根とまったく同じ「置けず・道具でもなく・食べ物でもない」もの**です。
  // **使い道は弓（棒 3 + 糸 3）1 本だけ**で、精錬は 0 行のまま
  // （本数は `test/crafting.test.ts` の「糸を使うレシピはちょうど 1 本」が見ています）。
  console.log(
    `      糸(${STRING}) 置ける ${placedBlock(STRING) !== AIR}` +
      ` / 道具 ${toolOf(STRING) !== null} / 食べ物 ${foodOf(STRING) !== null}`,
  );
  check(
    "糸は置けず・道具でもなく・食べ物でもない",
    placedBlock(STRING) === AIR && toolOf(STRING) === null && foodOf(STRING) === null,
    `block ${placedBlock(STRING)} / tool ${toolOf(STRING)} / food ${foodOf(STRING)}`,
  );
  // **卵も羽根と同じ「置けず・道具でもなく・食べ物でもない」もの**です。
  // **投げるのは別の周**（`projectiles.ts` に 1 行もありません）。
  console.log(
    `      卵(${EGG}) 置ける ${placedBlock(EGG) !== AIR}` +
      ` / 道具 ${toolOf(EGG) !== null} / 食べ物 ${foodOf(EGG) !== null}` +
      ` / 1 山 ${itemStackLimit(EGG)} 個`,
  );
  check(
    "卵は置けず・道具でもなく・食べ物でもない",
    placedBlock(EGG) === AIR && toolOf(EGG) === null && foodOf(EGG) === null,
    `block ${placedBlock(EGG)} / tool ${toolOf(EGG)} / food ${foodOf(EGG)}`,
  );
  // **バケツの 1 個と同じ測り方**（`MAX_STACK` を使っていないことの唯一の根拠）。
  check(
    "卵は 16 個までしか積めない（本家の値。64 ではない）",
    itemStackLimit(EGG) === 16,
    `${itemStackLimit(EGG)} 個`,
  );

  // **95..110 は空けたまま**（ブロック側の向き違いが使っている番号）。
  const inGap = allItemIds().filter((id) => id > VARIANT_BAND_MAX - 16 && id <= VARIANT_BAND_MAX);
  check("95..110 にアイテムを置いていない", inGap.length === 0, inGap.join(" "));

  // **剣はどのブロックの適正でもない。** 1 つでも `tool: "sword"` を要求すると、
  // 剣がそのブロックの採掘道具になって（`toolSpeed()` が速さを返し、`canHarvest()` が
  // 通る）、「殴るための道具」でなくなる。
  const swordBlocks = BLOCKS.filter((b) => blockTool(b.id) === "sword").map((b) => `${b.id}:${b.name}`);
  const toolKinds = [...new Set(BLOCKS.map((b) => blockTool(b.id)).filter((t) => t !== null))];
  console.log(`      ブロックが要求する道具: ${toolKinds.join(" / ")}`);
  check(
    "「sword」を要求するブロックが 1 つも無い",
    swordBlocks.length === 0,
    swordBlocks.join(" / ") || `要求される種類 ${toolKinds.length} 個`,
  );

  // **向き違いはアイテムを持たない**（`items.ts` が `variantOf` のあるものを飛ばす）。
  // だから 64..110 の帯は、同じ番号のアイテム（棒 64・鉱物・道具）と数字が重なっていても
  // 衝突しない。ここが崩れると、上付きハーフを置いたつもりで棒が消えるような壊れ方をする。
  const items = new Set(allItemIds());
  const variants = BLOCKS.filter((b) => b.variantOf !== AIR);
  check(
    "向き違いの ID にアイテムを作っていない",
    variants.every((b) => placedBlock(b.id) !== b.id),
    `${variants.length} 個（例: ${variants
      .slice(0, 3)
      .map((b) => `${b.id}:${b.name} ↔ アイテム ${itemName(b.id) || "なし"}`)
      .join(" / ")}）`,
  );
  check(
    "アイテム側の 64 以降は今まで通り",
    items.has(STICK) && placedBlock(STICK) === AIR,
    `64 = ${itemName(STICK)}`,
  );
  check(
    "向き違いを壊すと大元が手に入る",
    baseBlock(STONE_SLAB_TOP) === STONE_SLAB && baseBlock(PLANK_SLAB_TOP) === PLANK_SLAB,
  );
  check(
    "上付きと下付きは同じ名前で出る",
    blockName(STONE_SLAB_TOP) === blockName(STONE_SLAB),
    blockName(STONE_SLAB),
  );

  describe("ブロックの形（当たり判定・狙う判定・見た目）");

  check("立方体は 1 個の箱", collisionBoxes(STONE).length === 1);
  check(
    "下付きハーフは下半分だけ",
    collisionBoxes(STONE_SLAB)[0][4] === 0.5 && collisionBoxes(STONE_SLAB)[0][1] === 0,
  );
  check(
    "上付きハーフは上半分だけ",
    collisionBoxes(STONE_SLAB_TOP)[0][1] === 0.5 && collisionBoxes(STONE_SLAB_TOP)[0][4] === 1,
  );
  // 松明は形を持つが通り抜けられる。形と当たり判定を 1 か所にしたので、ここが分かれ道。
  check("松明は通り抜けられる", collisionBoxes(TORCH).length === 0);
  check("松明にも狙う形はある", shapeBoxes(TORCH).length > 0);
  check("空気は狙えない", shapeBoxes(AIR).length === 0);
  check("サボテンは当たり判定も細い", collisionBoxes(CACTUS)[0][0] > 0);

  describe("支えの判定（松明を置けるか）");

  check("立方体は 6 面とも支えになる", [0, 1, 2, 3, 4, 5].every((f) => canSupport(STONE, f)));
  check("下付きハーフの上面は支えにならない", !canSupport(STONE_SLAB, FACE_YP));
  check("下付きハーフの下面は支えになる", canSupport(STONE_SLAB, FACE_YN));
  check("上付きハーフの上面は支えになる", canSupport(STONE_SLAB_TOP, FACE_YP));
  check("上付きハーフの下面は支えにならない", !canSupport(STONE_SLAB_TOP, FACE_YN));
  check("ハーフの側面は半分しかないので支えにならない", !canSupport(STONE_SLAB, FACE_XP));
  check("松明は何も支えられない", [0, 1, 2, 3, 4, 5].every((f) => !canSupport(TORCH, f)));
  check("サボテンは細いので支えにならない", !canSupport(CACTUS, FACE_YP));
  // ベッドは 9/16 しか高さが無いので、上に松明が付かない（下付きハーフと同じ理由）。
  // ベッドの下面は床いっぱいなので、そちらは支えになる。
  check("ベッドの上面は支えにならない", !canSupport(BED, FACE_YP));
  check("ベッドの下面は支えになる", canSupport(BED, FACE_YN));

  describe("置き方で決まる向き");

  /** 置き方の材料。階段以外は向きを見ないので、既定は +X を向いているものとする。 */
  const aim = (support: number, hitY: number, facing = FACE_XP) => ({ support, hitY, facing });

  // 支えの向き = 新しいマスから見て、叩いたブロックのある側。
  check(
    "上の面を叩くと下付き",
    placedVariant(STONE_SLAB, aim(FACE_YN, 0.0)) === STONE_SLAB,
  );
  check(
    "下の面を叩くと上付き",
    placedVariant(STONE_SLAB, aim(FACE_YP, 1.0)) === STONE_SLAB_TOP,
  );
  check(
    "横の面の上半分を叩くと上付き",
    placedVariant(STONE_SLAB, aim(FACE_XP, 0.8)) === STONE_SLAB_TOP,
  );
  check(
    "横の面の下半分を叩くと下付き",
    placedVariant(STONE_SLAB, aim(FACE_XP, 0.2)) === STONE_SLAB,
  );
  check(
    "材質ごとに対応する上付きへ変わる",
    placedVariant(PLANK_SLAB, aim(FACE_YP, 1)) === PLANK_SLAB_TOP &&
      placedVariant(COBBLE_SLAB, aim(FACE_YP, 1)) !== PLANK_SLAB_TOP &&
      placedVariant(SANDSTONE_SLAB, aim(FACE_YP, 1)) !== PLANK_SLAB_TOP,
  );
  check(
    "松明はこれまで通り壁と床で変わる",
    placedVariant(TORCH, aim(FACE_YN, 0)) === TORCH &&
      placedVariant(TORCH, aim(FACE_ZN, 0.5)) === WALL_TORCH_ZN &&
      placedVariant(TORCH, aim(FACE_YP, 1)) === AIR,
  );
  check(
    "向きを持たないブロックはそのまま",
    placedVariant(STONE, aim(FACE_YP, 0.9)) === STONE,
  );

  describe("ネザーレンガと石レンガのハーフ");

  // **大元は 1..63 の凍結した帯の残り**（アイテムとして持てるので、アイテム ID と
  // 同じ番号でないと置けない）で、**上付きは共有帯**（64..110 は満杯で凍結）。
  // 4 つの番号と `variantOf` と `itemName()` を**並べて出してから**判定する。
  const brickSlabs = [
    NETHER_BRICK_SLAB,
    STONE_BRICK_SLAB,
    NETHER_BRICK_SLAB_TOP,
    STONE_BRICK_SLAB_TOP,
  ];
  console.log(
    `      ${brickSlabs
      .map(
        (id) =>
          `${id}:${blockName(id)} variantOf=${blockDef(id).variantOf} ` +
          `アイテム「${itemName(id)}」`,
      )
      .join("  ")}`,
  );
  check(
    "大元 2 つは 55 / 56（1..63）でアイテムになる",
    NETHER_BRICK_SLAB === 55 && STONE_BRICK_SLAB === 56 &&
      NETHER_BRICK_SLAB <= LOW_BAND_MAX && STONE_BRICK_SLAB <= LOW_BAND_MAX &&
      blockDef(NETHER_BRICK_SLAB).variantOf === AIR &&
      blockDef(STONE_BRICK_SLAB).variantOf === AIR &&
      itemName(NETHER_BRICK_SLAB) === "ネザーレンガハーフ" &&
      itemName(STONE_BRICK_SLAB) === "石レンガハーフ",
    `${NETHER_BRICK_SLAB} ${itemName(NETHER_BRICK_SLAB)} / ${STONE_BRICK_SLAB} ${itemName(STONE_BRICK_SLAB)}`,
  );
  // **上付きは共有帯なので、アイテムを作らせてはいけない** —— 作ると同じ番号の
  // アイテムと衝突する（置いて壊すと別のものが手に入る形）。
  check(
    "上付き 2 つは 166 / 167（共有帯）でアイテムにならない",
    NETHER_BRICK_SLAB_TOP === 166 && STONE_BRICK_SLAB_TOP === 167 &&
      NETHER_BRICK_SLAB_TOP >= SHARED_ID_START && STONE_BRICK_SLAB_TOP >= SHARED_ID_START &&
      blockDef(NETHER_BRICK_SLAB_TOP).variantOf === NETHER_BRICK_SLAB &&
      blockDef(STONE_BRICK_SLAB_TOP).variantOf === STONE_BRICK_SLAB &&
      itemName(NETHER_BRICK_SLAB_TOP) === "" && itemName(STONE_BRICK_SLAB_TOP) === "",
    `${NETHER_BRICK_SLAB_TOP}「${itemName(NETHER_BRICK_SLAB_TOP)}」 / ` +
      `${STONE_BRICK_SLAB_TOP}「${itemName(STONE_BRICK_SLAB_TOP)}」`,
  );
  // **空きの数も出すこと**（`AUTODEV.md` の 2 の予算）。低帯は 55 / 56 で 2 個・
  // 共有帯は上付き 2 つで 2 個減る。
  check(
    "1..63 の空きは 7（55 / 56 を取って 2 個減った）",
    lowFree === 7,
    `${lowFree} 個`,
  );

  // **箱を出力してから判定する。** 下付きは下半分・上付きは上半分で、
  // 既存 4 材質とまったく同じ形（`slabPair()` が対で定義するので、ずれようがない）。
  const brickBoxes = brickSlabs.map((id) => `${id}:[${collisionBoxes(id)[0].join(",")}]`);
  console.log(`      ${brickBoxes.join("  ")}`);
  check(
    "下付きは下半分・上付きは上半分",
    collisionBoxes(NETHER_BRICK_SLAB)[0].join() === "0,0,0,1,0.5,1" &&
      collisionBoxes(STONE_BRICK_SLAB)[0].join() === "0,0,0,1,0.5,1" &&
      collisionBoxes(NETHER_BRICK_SLAB_TOP)[0].join() === "0,0.5,0,1,1,1" &&
      collisionBoxes(STONE_BRICK_SLAB_TOP)[0].join() === "0,0.5,0,1,1,1",
    brickBoxes.join(" "),
  );
  check(
    "上付きと下付きは同じ名前で、大元は下付き",
    blockName(NETHER_BRICK_SLAB_TOP) === blockName(NETHER_BRICK_SLAB) &&
      blockName(STONE_BRICK_SLAB_TOP) === blockName(STONE_BRICK_SLAB) &&
      baseBlock(NETHER_BRICK_SLAB_TOP) === NETHER_BRICK_SLAB &&
      baseBlock(STONE_BRICK_SLAB_TOP) === STONE_BRICK_SLAB,
    `${blockName(NETHER_BRICK_SLAB_TOP)} / ${blockName(STONE_BRICK_SLAB_TOP)}`,
  );
  // 立方体でないので `opaque: false`。ただし**屋根として光は止める**
  // （でないとハーフで葺いた屋根の下が昼のまま明るくなる。`rules/blocks-shapes.md`）。
  check(
    "opaque でないが空は塞ぐ（屋根に葺ける）",
    brickSlabs.every((id) => !isOpaque(id) && blocksSky(id)),
    brickSlabs.map((id) => `${id}:opaque=${isOpaque(id)} sky=${blocksSky(id)}`).join(" "),
  );
  // **色は元の材質の写し**（ずらすと同じ材質の壁と屋根で色が食い違う）。
  check(
    "色は元のレンガと 1 の位まで同じ",
    blockDef(NETHER_BRICK_SLAB).top === blockDef(NETHER_BRICK).top &&
      blockDef(NETHER_BRICK_SLAB).side === blockDef(NETHER_BRICK).side &&
      blockDef(NETHER_BRICK_SLAB).bottom === blockDef(NETHER_BRICK).bottom &&
      blockDef(STONE_BRICK_SLAB).top === blockDef(STONE_BRICK).top &&
      blockDef(STONE_BRICK_SLAB).side === blockDef(STONE_BRICK).side &&
      blockDef(STONE_BRICK_SLAB).bottom === blockDef(STONE_BRICK).bottom,
    `ネザー 0x${blockDef(NETHER_BRICK_SLAB).top.toString(16)} / ` +
      `石 0x${blockDef(STONE_BRICK_SLAB).top.toString(16)}`,
  );

  // 置く向き。**表（`SLAB_TOP_BY_BOTTOM`）は `boxes === SLAB_TOP_BOX` から自動で立つ**ので、
  // 手で 1 行も書かずにこうなる。**他の材質の上付きにならない**ことも並べて見る。
  check(
    "上の面を狙うと上付き・下の面を狙うと下付き",
    placedVariant(NETHER_BRICK_SLAB, aim(FACE_YP, 1.0)) === NETHER_BRICK_SLAB_TOP &&
      placedVariant(NETHER_BRICK_SLAB, aim(FACE_YN, 0.0)) === NETHER_BRICK_SLAB &&
      placedVariant(STONE_BRICK_SLAB, aim(FACE_YP, 1.0)) === STONE_BRICK_SLAB_TOP &&
      placedVariant(STONE_BRICK_SLAB, aim(FACE_YN, 0.0)) === STONE_BRICK_SLAB,
    `ネザー上 ${placedVariant(NETHER_BRICK_SLAB, aim(FACE_YP, 1.0))} / ` +
      `石レンガ上 ${placedVariant(STONE_BRICK_SLAB, aim(FACE_YP, 1.0))}`,
  );
  check(
    "他の材質の上付きにはならない",
    placedVariant(NETHER_BRICK_SLAB, aim(FACE_YP, 1)) !== STONE_BRICK_SLAB_TOP &&
      placedVariant(STONE_BRICK_SLAB, aim(FACE_YP, 1)) !== NETHER_BRICK_SLAB_TOP &&
      placedVariant(STONE_SLAB, aim(FACE_YP, 1)) !== NETHER_BRICK_SLAB_TOP &&
      placedVariant(NETHER_BRICK_SLAB, aim(FACE_YP, 1)) !== STONE_SLAB_TOP,
  );
  // **`items.ts` の `DROPS` に 1 行も書いていない** —— `dropOf()` の既定が
  // `baseBlock()` なので、`variantOf` を向けただけで大元が落ちる。
  check(
    "上付きを掘ると大元が 1 個落ちる",
    dropOf(NETHER_BRICK_SLAB_TOP).item === NETHER_BRICK_SLAB &&
      dropOf(NETHER_BRICK_SLAB_TOP).count === 1 &&
      dropOf(STONE_BRICK_SLAB_TOP).item === STONE_BRICK_SLAB &&
      dropOf(STONE_BRICK_SLAB_TOP).count === 1,
    `${dropOf(NETHER_BRICK_SLAB_TOP).item} x${dropOf(NETHER_BRICK_SLAB_TOP).count} / ` +
      `${dropOf(STONE_BRICK_SLAB_TOP).item} x${dropOf(STONE_BRICK_SLAB_TOP).count}`,
  );

  describe("ハーフブロックの上に立つ・狙う");

  const world = new World(new Scene(), new WorldGen(20260803));
  world.primeAround(0.5, 0.5, 1);
  const ground = world.surfaceY(0, 0); // 地面のすぐ上（= 空いているマス）
  // 足場を平らにならしてから、その上にハーフを置く
  for (let z = -1; z <= 2; z++) {
    for (let x = -1; x <= 2; x++) {
      world.setVoxel(x, ground - 1, z, STONE);
      for (let y = ground; y < ground + 4; y++) world.setVoxel(x, y, z, AIR);
    }
  }
  world.setVoxel(1, ground, 1, STONE_SLAB);

  const camera = new PerspectiveCamera();
  const player = new Player(camera);
  player.position.set(1.5, ground + 3, 1.5);
  for (let i = 0; i < 200; i++) player.update(1 / 60, world);
  check(
    "下付きハーフの上には半ブロックの高さで立つ",
    player.onGround && Math.abs(player.position.y - (ground + 0.5)) < 1e-6,
    `y=${(player.position.y - ground).toFixed(3)}（想定 0.5）`,
  );

  // 上付きハーフは足元が空いているので、床の上に立つ
  world.setVoxel(1, ground, 1, AIR);
  world.setVoxel(1, ground, 1, STONE_SLAB_TOP);
  player.position.set(1.5, ground + 3, 1.5);
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 200; i++) player.update(1 / 60, world);
  check(
    "上付きハーフの上には 1 ブロックの高さで立つ",
    Math.abs(player.position.y - (ground + 1)) < 1e-6,
    `y=${(player.position.y - ground).toFixed(3)}（想定 1）`,
  );

  // 段差の自動登り。ハーフ（0.5）は登れて、立方体（1.0）は登れない。
  world.setVoxel(1, ground, 1, AIR);
  world.setVoxel(1, ground, 1, STONE_SLAB);
  player.position.set(-0.5, ground, 1.5);
  player.velocity.set(0, 0, 0);
  player.yaw = -Math.PI / 2; // +X 向き
  player.setKey("KeyW", true);
  // 登ったあとは通り過ぎて元の高さへ戻るので、途中の最高到達点で見る
  let peak = player.position.y;
  let onSlab = 0;
  for (let i = 0; i < 180; i++) {
    player.update(1 / 60, world);
    peak = Math.max(peak, player.position.y);
    if (player.position.x > 1 && player.position.x < 2) onSlab = player.position.y - ground;
  }
  check(
    "ハーフブロックの段差は歩いて登れる",
    player.position.x > 2 && peak >= ground + 0.5 - 1e-6,
    `ハーフの上で y=+${onSlab.toFixed(2)} / 最高 +${(peak - ground).toFixed(2)}`,
  );

  world.setVoxel(1, ground, 1, AIR);
  world.setVoxel(1, ground, 1, STONE);
  player.position.set(-0.5, ground, 1.5);
  player.velocity.set(0, 0, 0);
  for (let i = 0; i < 180; i++) player.update(1 / 60, world);
  check(
    "立方体の壁は登れない（ジャンプが要る）",
    player.position.x < 1 && Math.abs(player.position.y - ground) < 1e-6,
    `x=${player.position.x.toFixed(2)} y=+${(player.position.y - ground).toFixed(2)}`,
  );
  player.clearKeys();

  // 屋根として空の光を止める。opaque は false なので、ここは blocksSky が効いている。
  const openSky = world.getLight(0, ground + 2, 0);
  world.setVoxel(0, ground + 3, 0, STONE_SLAB);
  const roofed = world.getLight(0, ground + 2, 0);
  check(
    "ハーフを屋根にすると下が暗くなる",
    openSky === MAX_LIGHT && roofed < MAX_LIGHT,
    `屋根なし ${openSky} → 屋根あり ${roofed}`,
  );
  world.setVoxel(0, ground + 3, 0, AIR);
  check(
    "外すと明るさが戻る",
    world.getLight(0, ground + 2, 0) === MAX_LIGHT,
    `${world.getLight(0, ground + 2, 0)}`,
  );

  // 狙う判定。ハーフの上の空間を通す光線は、ハーフに当たってはいけない。
  world.setVoxel(1, ground, 1, AIR);
  world.setVoxel(1, ground, 1, STONE_SLAB);
  const over = raycastVoxels(
    world,
    new Vector3(-1, ground + 0.75, 1.5),
    new Vector3(1, 0, 0),
    8,
  );
  check(
    "ハーフの上半分を通る光線はすり抜ける",
    over === null || over.block.x !== 1 || over.block.y !== ground,
    over ? `${blockName(over.id)} @ ${over.block.x},${over.block.y},${over.block.z}` : "外れ",
  );
  const into = raycastVoxels(
    world,
    new Vector3(-1, ground + 0.25, 1.5),
    new Vector3(1, 0, 0),
    8,
  );
  check(
    "ハーフの下半分を狙えば当たる",
    into !== null && into.id === STONE_SLAB && into.normal.x === -1,
    into ? `${blockName(into.id)} 法線 ${into.normal.x},${into.normal.y},${into.normal.z}` : "外れ",
  );
  const onto = raycastVoxels(
    world,
    new Vector3(1.5, ground + 3, 1.5),
    new Vector3(0, -1, 0),
    8,
  );
  check(
    "真上から狙うと上面（高さ 0.5）に当たる",
    onto !== null && onto.normal.y === 1 && Math.abs(onto.point.y - (ground + 0.5)) < 1e-6,
    onto ? `y=${(onto.point.y - ground).toFixed(3)}` : "外れ",
  );

  describe("階段");

  // 置く人が向いている側が高くなる（歩いてきてそのまま登れる向き）。
  // 高い側は「段」の箱（2 個目）がどちらへ寄っているかで分かる。
  const step = (id: number) => shapeBoxes(id)[1];
  const tallAtXP = (id: number) => step(id)[0] === 0.5 && step(id)[3] === 1;
  const tallAtZN = (id: number) => step(id)[2] === 0 && step(id)[5] === 0.5;

  check("階段は箱 2 個（ハーフ＋段）", shapeBoxes(STONE_STAIRS).length === 2);
  check(
    "大元は +X 向き・下付き",
    tallAtXP(STONE_STAIRS) && step(STONE_STAIRS)[1] === 0.5 && step(STONE_STAIRS)[4] === 1,
    `段 ${step(STONE_STAIRS).join(",")}`,
  );

  const facingZN = placedVariant(STONE_STAIRS, aim(FACE_YN, 0, FACE_ZN));
  check(
    "向いている側が高くなる",
    tallAtZN(facingZN) && facingZN !== STONE_STAIRS,
    `ID ${facingZN} 段 ${step(facingZN).join(",")}`,
  );
  const flipped = placedVariant(STONE_STAIRS, aim(FACE_YP, 1, FACE_XP));
  check(
    "下の面を叩くと上下が反転する",
    step(flipped)[1] === 0 && step(flipped)[4] === 0.5 && tallAtXP(flipped),
    `ID ${flipped} 段 ${step(flipped).join(",")}`,
  );
  check(
    "横の面の上半分を叩いても反転する（ハーフと同じ規則）",
    placedVariant(STONE_STAIRS, aim(FACE_XP, 0.8, FACE_XP)) === flipped,
  );
  const states = new Set(
    [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN].flatMap((f) => [
      placedVariant(STONE_STAIRS, aim(FACE_YN, 0, f)),
      placedVariant(STONE_STAIRS, aim(FACE_YP, 1, f)),
    ]),
  );
  check("向き 4 × 上下 2 で 8 通りある", states.size === 8, `${states.size} 通り`);
  check(
    "大元以外はすべて 64 以降",
    [...states].filter((id) => id !== STONE_STAIRS).every((id) => id > LOW_BAND_MAX),
    [...states].join(","),
  );
  check(
    "どの向きでも名前とドロップは大元に揃う",
    [...states].every((id) => blockName(id) === blockName(STONE_STAIRS) && baseBlock(id) === STONE_STAIRS),
    blockName(STONE_STAIRS),
  );
  check(
    "材質ごとに別の階段になる",
    placedVariant(PLANK_STAIRS, aim(FACE_YN, 0, FACE_ZN)) !== facingZN,
  );

  // 段々に置いて、ジャンプせずに登れること。**これが無いと階段を置く意味がない。**
  for (let z = -1; z <= 2; z++) {
    for (let x = -1; x <= 6; x++) {
      world.setVoxel(x, ground - 1, z, STONE);
      for (let y = ground; y < ground + 4; y++) world.setVoxel(x, y, z, AIR);
    }
  }
  world.setVoxel(1, ground, 1, STONE_STAIRS);
  world.setVoxel(2, ground, 1, STONE);
  world.setVoxel(2, ground + 1, 1, STONE_STAIRS);
  player.position.set(-0.5, ground, 1.5);
  player.velocity.set(0, 0, 0);
  player.yaw = -Math.PI / 2; // +X 向き
  player.setKey("KeyW", true);
  let climbed = 0;
  for (let i = 0; i < 240; i++) {
    player.update(1 / 60, world);
    climbed = Math.max(climbed, player.position.y - ground);
  }
  check(
    "2 段の階段をジャンプせずに登れる",
    player.position.x > 3 && climbed >= 2 - 1e-6,
    `x=${player.position.x.toFixed(2)} / 登った高さ +${climbed.toFixed(2)}（想定 2）`,
  );
  player.clearKeys();

  // 段の無い側（低いほうの上）は空いている。埋まっていると、階段の上の
  // 何も無い所を狙って壊すことになる。
  const through = raycastVoxels(
    world,
    new Vector3(0, ground + 0.75, 1.5),
    new Vector3(1, 0, 0),
    8,
  );
  check(
    "階段の空いている側は素通りして、奥の段に当たる",
    through !== null && through.block.x === 1 && Math.abs(through.point.x - 1.5) < 1e-6,
    through ? `${blockName(through.id)} の x=${through.point.x.toFixed(2)}` : "外れ",
  );
  const lower = raycastVoxels(
    world,
    new Vector3(0, ground + 0.25, 1.5),
    new Vector3(1, 0, 0),
    8,
  );
  check(
    "階段の低い側は手前の面に当たる",
    lower !== null && lower.block.x === 1 && lower.normal.x === -1 && lower.point.x === 1,
    lower ? `${blockName(lower.id)} の x=${lower.point.x.toFixed(2)} 法線 ${lower.normal.x}` : "外れ",
  );

  // ハーフと同じで、屋根にすると下が暗くなる（opaque: false のままなので blocksSky が効く）
  world.setVoxel(0, ground + 3, 0, STONE_STAIRS);
  const underStairs = world.getLight(0, ground + 2, 0);
  check("階段を屋根にすると下が暗くなる", underStairs < MAX_LIGHT, `${underStairs}`);
  world.setVoxel(0, ground + 3, 0, AIR);
  for (let x = 1; x <= 2; x++) {
    for (let y = ground; y < ground + 4; y++) world.setVoxel(x, y, 1, AIR);
  }

  describe("どのマスに置くか");

  // 狙ったブロックの隣（法線の側）に置く。これが基本。
  const beside = placeSpot({
    id: STONE,
    block: { x: 3, y: 4, z: 5 },
    normal: { x: 0, y: 1, z: 0 },
    point: { y: 5 },
  }, FACE_XP);
  check(
    "ふつうは狙った面の側に置く",
    beside.x === 3 && beside.y === 5 && beside.z === 5 && beside.support === FACE_YN,
    `(${beside.x},${beside.y},${beside.z}) 支え ${beside.support}`,
  );
  const sideways = placeSpot({
    id: STONE,
    block: { x: 3, y: 4, z: 5 },
    normal: { x: -1, y: 0, z: 0 },
    point: { y: 4.7 },
  }, FACE_XP);
  check(
    "横の面を叩けば横のマス（叩いた高さも渡る）",
    sideways.x === 2 && sideways.support === FACE_XP && Math.abs(sideways.hitY - 0.7) < 1e-6,
    `x=${sideways.x} 支え ${sideways.support} hitY=${sideways.hitY.toFixed(2)}`,
  );

  // 草むらは押しのけて置く。隣に置くと、草が残ったまま横にブロックが生える。
  for (const [label, normal] of [
    ["上から", { x: 0, y: 1, z: 0 }],
    ["横から", { x: -1, y: 0, z: 0 }],
  ] as const) {
    const onto2 = placeSpot({
      id: TALL_GRASS,
      block: { x: 3, y: 4, z: 5 },
      normal,
      point: { y: 4.4 },
    }, FACE_XP);
    check(
      `草むらを${label}狙うとそのマスに置く`,
      onto2.x === 3 && onto2.y === 4 && onto2.z === 5,
      `(${onto2.x},${onto2.y},${onto2.z})`,
    );
    check(
      `草むらを${label}狙ったときの支えは真下`,
      onto2.support === FACE_YN && onto2.hitY === 0,
      `支え ${onto2.support} hitY=${onto2.hitY}`,
    );
  }

  describe("草むら");

  check("草むらは 63 以下（アイテムとして持てる）", TALL_GRASS <= LOW_BAND_MAX, `ID ${TALL_GRASS}`);
  check("草むらにはアイテムがある", items.has(TALL_GRASS) && placedBlock(TALL_GRASS) === TALL_GRASS);
  // 地面の「草」ブロックと名前で見分けが付くこと（アイテム欄で並ぶので、同名だと選べない）
  check(
    "草むらは地面の草ブロックとは別物",
    blockName(TALL_GRASS) !== blockName(GRASS),
    `${blockName(GRASS)}（ID ${GRASS}）/ ${blockName(TALL_GRASS)}（ID ${TALL_GRASS}）`,
  );
  check("草むらは通り抜けられる", collisionBoxes(TALL_GRASS).length === 0);
  check("草むらにも狙う形はある", shapeBoxes(TALL_GRASS).length > 0);
  check("草むらは支えにならない", [0, 1, 2, 3, 4, 5].every((f) => !canSupport(TALL_GRASS, f)));
  check("草むらは上書きして置ける", isReplaceable(TALL_GRASS));
  check("固いブロックは上書きされない", !isReplaceable(STONE) && !isReplaceable(STONE_SLAB));
  check("素手ですぐ壊せる", breakTime(TALL_GRASS) === 0, `${breakTime(TALL_GRASS)} 秒`);
  // **12.5% で小麦の種、外したら草むらそのもの**（砂利と同じ `otherwise` の形）。
  // 「自分が手に入る」の 1 件を**消さずに 2 件へ割った**もの —— 草むらは
  // これからも置けるアイテムのままで、種はそのうえに 12.5% で乗る。
  console.log(
    `      草むらのドロップ: 当たり ${itemName(rollDrop(TALL_GRASS, 0.05).item)} / ` +
      `外れ ${itemName(rollDrop(TALL_GRASS, 0.5).item)}（確率 ${dropOf(TALL_GRASS).chance}）`,
  );
  check(
    "草むらを壊すと外れたときは自分が手に入る",
    rollDrop(TALL_GRASS, 0.5).item === TALL_GRASS && rollDrop(TALL_GRASS, 0.5).count === 1,
    `${itemName(rollDrop(TALL_GRASS, 0.5).item)} x${rollDrop(TALL_GRASS, 0.5).count}`,
  );
  check(
    "草むらを壊すと 12.5% で小麦の種",
    dropOf(TALL_GRASS).chance === 0.125 && rollDrop(TALL_GRASS, 0.05).item === WHEAT_SEEDS &&
      rollDrop(TALL_GRASS, 0.124).item === WHEAT_SEEDS && rollDrop(TALL_GRASS, 0.125).item === TALL_GRASS,
    `${itemName(rollDrop(TALL_GRASS, 0.05).item)} / 境目 ${itemName(rollDrop(TALL_GRASS, 0.125).item)}`,
  );

  // 足場の上に生やす。歩いて通り抜けられて、足場を壊すと一緒に消える。
  world.setVoxel(1, ground, 1, AIR);
  world.setVoxel(1, ground, 1, TALL_GRASS);
  check(
    "草むらは支えのある所にしか置けない",
    world.getVoxel(1, ground, 1) === TALL_GRASS && !world.canPlaceAt(1, ground + 2, 1, TALL_GRASS),
  );

  player.position.set(-0.5, ground, 1.5);
  player.velocity.set(0, 0, 0);
  player.yaw = -Math.PI / 2; // +X 向き
  player.setKey("KeyW", true);
  let lift = 0;
  for (let i = 0; i < 180; i++) {
    player.update(1 / 60, world);
    lift = Math.max(lift, player.position.y - ground);
  }
  check(
    "草むらは歩いて通り抜けられる（乗り上げない）",
    player.position.x > 2 && Math.abs(lift) < 1e-6,
    `x=${player.position.x.toFixed(2)} / 最高 +${lift.toFixed(2)}`,
  );
  player.clearKeys();

  // 空の光を止めない。止めると草の生えた地面が一段暗くなる。
  check(
    "草むらは空の光を止めない",
    world.getLight(1, ground, 1) === MAX_LIGHT,
    `${world.getLight(1, ground, 1)}`,
  );

  world.setVoxel(1, ground - 1, 1, AIR);
  check(
    "足元を壊すと草むらも消える",
    world.getVoxel(1, ground, 1) === AIR,
    blockName(world.getVoxel(1, ground, 1)),
  );

  // 狙う判定。草むらは細いので、端をかすめる光線は当たらない。
  world.setVoxel(1, ground - 1, 1, STONE);
  world.setVoxel(1, ground, 1, TALL_GRASS);
  const stalk = raycastVoxels(world, new Vector3(-1, ground + 0.4, 1.5), new Vector3(1, 0, 0), 8);
  check(
    "草むらの中心を狙えば当たる",
    stalk !== null && stalk.id === TALL_GRASS,
    stalk ? `${blockName(stalk.id)} @ ${stalk.block.x},${stalk.block.y},${stalk.block.z}` : "外れ",
  );
  const above = raycastVoxels(world, new Vector3(-1, ground + 0.9, 1.5), new Vector3(1, 0, 0), 8);
  check(
    "草むらの上を通る光線はすり抜ける",
    above === null || above.id !== TALL_GRASS,
    above ? `${blockName(above.id)} @ ${above.block.x},${above.block.y},${above.block.z}` : "外れ",
  );

  describe("液体（水・溶岩）");

  // **液体は 1 つの判定に寄せてある。** `id === WATER` を散らすと、液体を足したときに
  // 必ずどれかを忘れる（実際、溶岩を足したときに狙う判定・設置・フォグの 3 つとも
  // 忘れていて、溶岩湖の向こうを狙うと手前の溶岩が置き場になっていた）。
  // 狙う判定に液体の名前を書き戻さないための見張り。ここに `id !== WATER` が
  // 戻ると、次の液体（ネザーの溶岩海も同じ ID）でまた同じ壊れ方をする。
  //
  // **液体の名前を書いてよいのは「水そのもの」を見る所だけ**（息・音のこもり・
  // 水しぶき = `main.ts` と `player.ts`）。物理・浮力・湧き・設置は
  // 「液体か」「焼ける液体か」で決まるので、下のファイルには名前が要らない。
  for (const file of ["src/raycast.ts", "src/mobs.ts", "src/drops.ts", "src/beds.ts"]) {
    const source = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
    check(
      `${file.slice(4)} は個別の液体を名指ししない`,
      !/\bWATER\b|\bLAVA\b/.test(source),
      "液体かどうかは isLiquid() / isHotLiquid() に聞くこと",
    );
  }

  const liquids = BLOCKS.filter((b) => b.liquid).map((b) => b.name);
  check("液体は水と溶岩の 2 つ", liquids.length === 2, liquids.join(" / "));
  check("水が液体", isLiquid(WATER));
  check("溶岩が液体", isLiquid(LAVA));
  check("石は液体でない", !isLiquid(STONE) && !isLiquid(TALL_GRASS) && !isLiquid(AIR));

  // 焼ける液体。**プレイヤーもモブもこの 1 本を見る**ので、`id === LAVA` を
  // 散らさずに済む（ネザーの溶岩海が同じ ID を使う）。
  const hot = BLOCKS.filter((b) => b.hot).map((b) => b.name);
  check("焼ける液体は溶岩だけ", hot.length === 1 && isHotLiquid(LAVA), hot.join(" / "));
  check("水では焼けない", !isHotLiquid(WATER) && !isHotLiquid(STONE));
  check("焼けるものは必ず液体", BLOCKS.every((b) => !b.hot || b.liquid));

  // 刺さるブロック。**`id === CACTUS` を散らさないための表 1 本**（`hot` と同じ作法）。
  // どのマスに効くかは `player.ts`、どれだけ痛いかは `vitals.ts` のもの。
  const spiky = BLOCKS.filter((b) => b.spiky);
  console.log(`      刺さるブロック: ${spiky.map((b) => `${b.name}(${b.id})`).join(" / ") || "無し"}`);
  check("刺さるのはサボテンだけ", spiky.length === 1 && isSpiky(CACTUS), spiky.map((b) => b.name).join(" / "));
  check("石も草も刺さらない", !isSpiky(STONE) && !isSpiky(TALL_GRASS) && !isSpiky(AIR));
  // 刺さるものは通り抜けられない（`solid: false` にすると、体が中心まで入って
  // 「隣に立っただけでは偽」が意味を失う）
  check("刺さるものは必ず solid", spiky.every((b) => b.solid), spiky.map((b) => `${b.name}:${b.solid}`).join(" "));

  // 登れるブロック。**`id === LADDER` を散らさないための表 1 本**（`spiky` と同じ作法）。
  // どのマスに効くかは `player.ts`、落ちたぶんを打ち消すかは `vitals.ts` のもの。
  const climbable = BLOCKS.filter((b) => b.climbable);
  const climbableIds = climbable.map((b) => b.id).sort((a, b) => a - b);
  console.log(
    `      登れるブロック ${climbable.length} 個: ` +
      `${climbable.map((b) => `${b.name}(${b.id})`).join(" / ") || "無し"}`,
  );
  // **ゆるめるのではなく数え直すこと**（`isBladed` の 5 個と同じ形。`rules/testing.md`）。
  // **一覧そのものと突き合わせている**ので、8 個に増えても「抜けと余分の両方で落ちる」
  // 強さは 1 つも弱まっていない。
  check(
    "登れるのははしごとツタの 4 向きずつ 8 個（145..148 と 183..186。ツタが入って数え直した。ゆるめていない）",
    climbableIds.length === 8 &&
      climbableIds.join(",") ===
        [LADDER, LADDER_XN, LADDER_ZP, LADDER_ZN, VINE, VINE_XN, VINE_ZP, VINE_ZN]
          .sort((a, b) => a - b)
          .join(","),
    `id=[${climbableIds.join(",")}]`,
  );
  check(
    "4 向きとも isClimbable() が真",
    [LADDER, LADDER_XN, LADDER_ZP, LADDER_ZN].every((id) => isClimbable(id)),
    [LADDER, LADDER_XN, LADDER_ZP, LADDER_ZN].map((id) => `${id}:${isClimbable(id)}`).join(" "),
  );
  check(
    "石・サボテン・松明・水は登れない",
    !isClimbable(STONE) && !isClimbable(CACTUS) && !isClimbable(TORCH) && !isClimbable(WATER) && !isClimbable(AIR),
    `石=${isClimbable(STONE)} サボテン=${isClimbable(CACTUS)} 松明=${isClimbable(TORCH)} 水=${isClimbable(WATER)}`,
  );
  // 登れるものは通り抜けられること（solid にすると、はしごの前に立てなくなって
  // 「体が重なる」が一度も成り立たない）
  check(
    "登れるものは solid でない",
    climbable.every((b) => !b.solid),
    climbable.map((b) => `${b.name}:${b.solid}`).join(" "),
  );

  // 液体はバケツが無いと持てない（バケツはまだ無い）。**溶岩を足したとき、
  // 水だけを弾いていたせいで「溶岩」というアイテムが黙って 1 個増えていた。**
  const liquidItems = BLOCKS.filter((b) => b.liquid && allItemIds().includes(b.id)).map((b) => b.name);
  check("液体はアイテムにならない", liquidItems.length === 0, liquidItems.join(" / ") || "水も溶岩も無し");

  // 液体は必ずフォグを持つ（持たないと、頭まで浸かっても画面が変わらない）。
  const noFog = BLOCKS.filter((b) => b.liquid && !b.fog).map((b) => b.name);
  check("液体はフォグを持つ", noFog.length === 0, noFog.join(" "));
  check("液体でないものはフォグを持たない", BLOCKS.every((b) => b.liquid || !b.fog));

  const waterFog = liquidFog(WATER)!;
  const lavaFog = liquidFog(LAVA)!;
  check("溶岩のフォグは水よりずっと濃い", lavaFog.far < waterFog.far / 5, `${lavaFog.far} < ${waterFog.far}`);
  // 溶岩は自分で光っているので、夜に暗くならない。掛けると真っ黒になる。
  check("水は昼夜で暗くなる / 溶岩は暗くならない", waterFog.daylit && !lavaFog.daylit);

  // --- 狙う光線は液体を素通りする ---
  // ここが効いていないと、溶岩湖に向けてブロックを置いたときに
  // **底の石の上ではなく、手前の溶岩そのもの**がそのブロックになる。
  for (const [name, id] of [["水", WATER], ["溶岩", LAVA]] as const) {
    const lx = 6;
    world.setVoxel(lx, ground, 1, id);
    world.setVoxel(lx + 1, ground, 1, STONE);
    const shot = raycastVoxels(
      world,
      new Vector3(lx - 1, ground + 0.5, 1.5),
      new Vector3(1, 0, 0),
      8,
    );
    check(
      `${name}を通る光線は素通りして、奥の石に当たる`,
      shot !== null && shot.id === STONE && shot.block.x === lx + 1,
      shot ? `${blockName(shot.id)} @ x=${shot.block.x}` : "外れ",
    );
    // 当たった面の隣（= 置くマス）が液体のマスそのもの。液体は replaceable なので
    // **埋め立てはできる** —— 素通りさせても「液体にブロックを置けない」にはならない。
    const spot = shot ? placeSpot(shot, FACE_XP) : null;
    check(
      `${name}のマスが置き場になる（埋め立てはできる）`,
      spot !== null && spot.x === lx && isReplaceable(world.getVoxel(spot.x, spot.y, spot.z)),
      spot ? `x=${spot.x}` : "外れ",
    );
    world.setVoxel(lx, ground, 1, AIR);
    world.setVoxel(lx + 1, ground, 1, AIR);

    // **バケツを持っているときだけ液体に当たる。** これが無いと水面を狙えず、
    // 水を汲めない（既定を変えると、上の「素通りする」が壊れて溶岩バグが戻る）。
    world.setVoxel(lx, ground, 1, id);
    const scooped = raycastVoxels(
      world,
      new Vector3(lx - 1, ground + 0.5, 1.5),
      new Vector3(1, 0, 0),
      8,
      true,
    );
    check(
      `バケツを持つと${name}そのものに当たる`,
      scooped !== null && scooped.id === id && scooped.block.x === lx,
      scooped ? `${blockName(scooped.id)} @ x=${scooped.block.x}` : "外れ",
    );
    world.setVoxel(lx, ground, 1, AIR);
  }

  describe("バケツ");

  // **液体を足したらバケツも足すこと。** 汲めない液体があると、そこだけ
  // 「見えるのに触れないもの」になる（ネザーの溶岩海も同じ LAVA なので、
  // ここが揃っていればそのまま汲める）。
  const noBucket = BLOCKS.filter((b) => b.liquid && bucketOf(b.id) === NO_ITEM).map((b) => b.name);
  check("すべての液体に対応するバケツがある", noBucket.length === 0, noBucket.join(" ") || "水も溶岩も汲める");

  // 不変条件: 中身から引いたバケツの中身は、元の液体に戻る。
  const roundTrip = [WATER, LAVA].every((liquid) => liquidOf(bucketOf(liquid)) === liquid);
  check("バケツと中身が 1 対 1", roundTrip, `水 → ${itemName(bucketOf(WATER))} / 溶岩 → ${itemName(bucketOf(LAVA))}`);

  check(
    "バケツは 3 つとも「バケツ」と分かる",
    isBucket(BUCKET) && isBucket(WATER_BUCKET) && isBucket(LAVA_BUCKET),
  );
  check("バケツでないものは false", !isBucket(IRON_INGOT) && !isBucket(NO_ITEM) && !isBucket(STONE));

  // **積めるのは 1 個まで。** 16 個の水を 1 枠に持てると水路作りが別のゲームになる。
  const stacks = [BUCKET, WATER_BUCKET, LAVA_BUCKET].map((id) => itemStackLimit(id));
  check("バケツは 1 個までしか積めない", stacks.every((n) => n === 1), stacks.join(" / "));

  // 汲む
  for (const [name, liquid] of [["水", WATER], ["溶岩", LAVA]] as const) {
    const use = bucketUse(BUCKET, liquid);
    check(
      `空バケツで${name}を汲める`,
      use?.kind === "fill" && use.item === bucketOf(liquid) && use.liquid === liquid,
      use ? `${use.kind} → ${itemName(use.item)}` : "使えない",
    );
  }
  check("空バケツで石は汲めない", bucketUse(BUCKET, STONE) === null);
  check("空バケツで空気は汲めない", bucketUse(BUCKET, AIR) === null);

  // 流す。**狙った先が何であっても流せること**（置くマスを決めるのは呼ぶ側）。
  for (const [name, held, liquid] of [["水", WATER_BUCKET, WATER], ["溶岩", LAVA_BUCKET, LAVA]] as const) {
    const use = bucketUse(held, STONE);
    check(
      `${name}入りバケツは流せて、空バケツが手に残る`,
      use?.kind === "empty" && use.liquid === liquid && use.item === BUCKET,
      use ? `${use.kind} → ${blockName(use.liquid)} / 手は ${itemName(use.item)}` : "使えない",
    );
  }

  // バケツでないものを渡しても何も起きない（`main.ts` が誤って呼んでも安全）
  check("バケツ以外では何も起きない", bucketUse(IRON_INGOT, WATER) === null && bucketUse(NO_ITEM, LAVA) === null);

  describe("雪ブロックと雪玉");

  // **雪は自分ではなく雪玉 4 個になって落ちる**（Minecraft と同じ個数）。
  // 確率 1 なので `otherwise` は要らない —— 外れる目が無い。
  console.log(
    `      雪のドロップ: ${itemName(rollDrop(SNOW, 0.5).item)} x${rollDrop(SNOW, 0.5).count}` +
      `（確率 ${dropOf(SNOW).chance}） / 雪玉 1 枠 ${itemStackLimit(SNOWBALL)} 個`,
  );
  check(
    "雪を掘ると雪玉 4 個",
    rollDrop(SNOW, 0.5).item === SNOWBALL && rollDrop(SNOW, 0.5).count === 4 &&
      dropOf(SNOW).chance === 1,
    `${itemName(rollDrop(SNOW, 0.5).item)} x${rollDrop(SNOW, 0.5).count}`,
  );
  // **雪ブロックそのものは落ちない。** ここが緑のまま雪も落ちていると、
  // 戻すレシピが「増やす仕掛け」になる（掘るたびに 4 個 + 1 ブロック）。
  check(
    "雪を掘っても雪ブロックは落ちない（戻すのはクラフト）",
    rollDrop(SNOW, 0.5).item !== SNOW && rollDrops(SNOW, 0.5, 0.9).length === 1,
    `${rollDrops(SNOW, 0.5, 0.9).map((s) => `${itemName(s.item)} x${s.count}`).join(" + ")}`,
  );
  // 雪玉は置けず・道具でもなく・食べ物でもない（羽根・革・糸と同じ扱い）。
  console.log(
    `      雪玉: 置くと ${placedBlock(SNOWBALL)}（AIR=${AIR}） / 道具 ${toolOf(SNOWBALL) ? "あり" : "null"} / ` +
      `食べ物 ${foodOf(SNOWBALL) ? "あり" : "null"}`,
  );
  check(
    "雪玉は置けず・道具でもなく・食べ物でもない",
    placedBlock(SNOWBALL) === AIR && toolOf(SNOWBALL) === null && foodOf(SNOWBALL) === null,
    `${placedBlock(SNOWBALL)} / ${toolOf(SNOWBALL) ? "道具" : "null"} / ${foodOf(SNOWBALL) ? "食べ物" : "null"}`,
  );
  // **積めるのは 16 個**（卵と同じ。本家の値）。掘ると 4 個ずつ増えるので、
  // 64 にすると 1 枠が 16 ブロックぶんになる。
  check(
    "雪玉は 1 枠 16 個（卵と同じ）",
    itemStackLimit(SNOWBALL) === 16 && itemStackLimit(SNOWBALL) === itemStackLimit(EGG),
    `雪玉 ${itemStackLimit(SNOWBALL)} / 卵 ${itemStackLimit(EGG)}`,
  );

  describe("投げるもの");

  // **表 1 本**（`FILLED_BUCKETS` / `FIRE_STARTERS` / `BOWS` と同じ作法）。
  // `held === EGG` と書き始めると、投げるものが増えるたびに `use.ts` の
  // `decideUse()` に分岐が 1 本ずつ生える。
  const throwable: [string, number][] = [
    ["卵", EGG],
    ["雪玉", SNOWBALL],
    ["石", STONE],
    ["弓", BOW],
    ["矢", ARROW],
    ["棒", STICK],
    ["パン", BREAD],
  ];
  console.log(
    `      thrownProjectile: ${throwable.map(([n, id]) => `${n} → ${thrownProjectile(id) ?? "null"}`).join(" / ")}`,
  );
  check("卵を投げると卵が飛ぶ", thrownProjectile(EGG) === "egg", `${thrownProjectile(EGG)}`);
  check(
    "雪玉を投げると雪玉が飛ぶ",
    thrownProjectile(SNOWBALL) === "snowball",
    `${thrownProjectile(SNOWBALL)}`,
  );
  {
    const wrong = throwable.filter(
      ([, id]) => id !== EGG && id !== SNOWBALL && thrownProjectile(id) !== null,
    );
    check("それ以外は投げられない（null）", wrong.length === 0, wrong.map(([n]) => n).join(" "));
  }
  // **綴りのずれをここで止める。** 表の行き先が `PROJECTILE_KINDS` に無いと、
  // 投げた瞬間に `projectileDef()` が落ちる（ブラウザを開くまで気付けない）。
  {
    const kinds = new Set(PROJECTILE_KINDS.map((def) => def.kind));
    const missing = allItemIds()
      .map((id) => thrownProjectile(id))
      .filter((kind): kind is NonNullable<typeof kind> => kind !== null)
      .filter((kind) => !kinds.has(kind));
    check("投げた先が全部 PROJECTILE_KINDS にある", missing.length === 0, missing.join(" "));
  }

  describe("耕地とクワ");

  // **`variantOf: DIRT`** —— 点火中のかまど（`FURNACE_LIT`）と同じ仕掛け。
  check("耕地は土の向き違い（variantOf: DIRT）", baseBlock(FARMLAND) === DIRT, `baseBlock ${baseBlock(FARMLAND)}`);
  // (a) `variantOf` が AIR でないので `items.ts` の for が飛ばす → アイテムが無い。
  check("耕地はアイテムを持たない（一覧が増えない）", itemName(FARMLAND) === "", `"${itemName(FARMLAND)}"`);
  // (b) `dropOf()` の既定（`baseBlock()`）どおり、掘ると土が 1 個落ちる。
  check("耕地を掘ると土が落ちる", dropOf(FARMLAND).item === DIRT && dropOf(FARMLAND).count === 1, `${itemName(dropOf(FARMLAND).item)} x${dropOf(FARMLAND).count}`);

  // `tilled()` の 4 通り（純粋・座標を知らない。`quenched()` と同じ形）。
  const tillCases: [string, number, number][] = [
    ["土", DIRT, FARMLAND],
    ["草", GRASS, FARMLAND],
    ["石", STONE, AIR],
    ["空気", AIR, AIR],
  ];
  console.log(`      tilled(): ${tillCases.map(([n, id]) => `${n}→${blockName(tilled(id))}`).join(" / ")}`);
  for (const [name, id, want] of tillCases) {
    check(`${name}を耕すと ${want === FARMLAND ? "耕地" : "何も起きない"}`, tilled(id) === want, `${tilled(id)}`);
  }

  // クワは 4 本だけ `isHoe()` が true。掘る速さは持たない（素手と同じ 1）。
  console.log(
    `      isHoe: 木のクワ ${isHoe(WOOD_HOE)} / ダイヤのクワ ${isHoe(DIAMOND_HOE)} / ` +
      `石 ${isHoe(STONE)} / 素手 ${isHoe(NO_ITEM)}`,
  );
  check("木・ダイヤのクワは isHoe", isHoe(WOOD_HOE) && isHoe(DIAMOND_HOE));
  check("クワでないものは isHoe ではない", !isHoe(STONE) && !isHoe(NO_ITEM) && !isHoe(BUCKET));

  wheatCrop(world, ground);

  endPortalFrames();
  storedBlocks();
  mushrooms();
  bowlAndStew();
  sugarCane(world, ground);
  cactusStack(world, ground);
  cactusOnSand(world, ground);
  caneByWater(world, ground);
  mushroomSpreadInWorld(world);
  ladders();
  vines(world, ground);
  apples();
  paperBookBookshelf();
  goldenApples();
  cobwebs();
  cakes();
  ices();
  fences();
  netherBrickFences();
  coalBlocks();
  saplings();
  clay();
  glowstoneDust();
  brickNames();

  world.dispose();
}

/**
 * レンガの名前の対（32b）。**ブロックの `BRICK`(12) と、アイテムの
 * `BRICK_ITEM`(170) が一覧に並んで出ます** —— 同じ名前だと 2 つあることが
 * 画面から読めないので、**名前が別の文字列であること**をここで見張ります。
 *
 * **`BRICK` の ID は 12 のまま**（変えたのは `def()` の表示名 1 つだけ）。
 * セーブに入るのは番号なので、既存のセーブは 1 バイトも動きません。
 */
function brickNames(): void {
  describe("レンガ（ブロック 12 とアイテム 170 の名前の対）");

  // **並べて出力してから判定すること** —— どちらが「レンガ」でどちらが
  // 「レンガブロック」かを、落ちたときに出力だけで読めるようにしておく。
  console.log(
    `      ブロック BRICK(${BRICK}) 「${blockName(BRICK)}」 ／ ` +
      `アイテム BRICK_ITEM(${BRICK_ITEM}) 「${itemName(BRICK_ITEM)}」`,
  );
  check(
    "ブロックは「レンガブロック」・アイテムは「レンガ」（本家の日本語と同じ）",
    blockName(BRICK) === "レンガブロック" && itemName(BRICK_ITEM) === "レンガ",
    `${blockName(BRICK)} / ${itemName(BRICK_ITEM)}`,
  );
  // **2 つが別の文字列であること。** ここが崩れると、一覧に「レンガ」が 2 つ並ぶ。
  check(
    "一覧に同じ名前が 2 つ並ばない（ブロックとアイテムで名前が別）",
    blockName(BRICK) !== itemName(BRICK_ITEM),
    `${blockName(BRICK)} ↔ ${itemName(BRICK_ITEM)}`,
  );
  // **ブロック側の ID は 12 のまま**（振り直すとセーブの差分が別のブロックに化ける）。
  // **アイテムのほうは置けない**（置けるのは 12 のほうで、レンガは 2x2 で組む材料）。
  console.log(
    `      BRICK(${BRICK}) を持って置くと ${placedBlock(BRICK)} ／ ` +
      `BRICK_ITEM(${BRICK_ITEM}) を持って置くと ${placedBlock(BRICK_ITEM)}`,
  );
  check(
    "レンガブロックは番号 12 のまま持てて置ける・レンガ（170）は置けない",
    BRICK === 12 && placedBlock(BRICK) === BRICK && placedBlock(BRICK_ITEM) === 0,
    `${placedBlock(BRICK)} / ${placedBlock(BRICK_ITEM)}`,
  );
}

/**
 * 粘土（ブロック 168・32a）。**普通の立方体で、特別なのは落とすものだけ**です
 * （掘ると粘土玉 4 個。雪とまったく同じ対）。
 *
 * ここで守りたいのは 3 点:
 *
 * - **掘っても粘土ブロックそのものは返らないこと**（`DROPS` の 1 行が効いていること）。
 *   素手でもシャベルでも同じ —— **道具で変わる落とし物を足していない**
 * - **`variantOf` が既定の `AIR`** —— これで `items.ts` の for が同じ番号のアイテムを
 *   作るので、**2x2 で戻した粘土は置ける**（手で `item()` を足すと二重登録）
 * - **`falls` を付けていないこと**（砂・砂利との唯一の違い。本家の粘土は落ちません）
 *
 * **海底に湧くことは `test/worldgen.test.ts`**（あちらが `voxel()` を実際に引きます）。
 * **2x2 で戻せることは `test/crafting.test.ts`**、**色は `test/items.test.ts`**。
 */
function clay(): void {
  describe("粘土（海底に湧いて、掘ると粘土玉 4 個）");

  const d = blockDef(CLAY);
  // **素手とシャベルの 2 通りを並べて出すこと** —— 片方だけだと「道具で変わる
  // 落とし物を足した」ときに気付けない（粘土は本家でもどちらでも 4 個）。
  const byHand = rollDrop(CLAY, 0.5);
  const stacks = rollDrops(CLAY, 0.5, 0.9);
  console.log(
    `      粘土(${CLAY}): model ${d.model} / 不透明 ${d.opaque} / variantOf ${d.variantOf} / ` +
      `硬さ ${d.hardness} / 道具 ${d.tool} 階層 ${d.minTier} / 落ちる ${d.falls} / 音 ${d.sound} / ` +
      `色 0x${d.top.toString(16)}`,
  );
  console.log(
    `      掘ると: ${itemName(byHand.item)} x${byHand.count}（山 ${stacks.length} 個）  ` +
      `アイテム名「${itemName(CLAY)}」→ 置くと ${placedBlock(CLAY)}`,
  );
  check(
    "粘土は立方体で、向き違いではない（アイテムが自動で付く）",
    d.model === "cube" && d.opaque === true && d.variantOf === AIR,
    `${d.model} / 不透明 ${d.opaque} / variantOf ${d.variantOf}`,
  );
  check(
    "粘土は硬さ 0.6 のシャベル掘り（階層は素手から）",
    d.hardness === 0.6 && d.tool === "shovel" && d.minTier === TIER_HAND,
    `硬さ ${d.hardness} / ${d.tool} / 階層 ${d.minTier}`,
  );
  // **砂・砂利との唯一の違い。** `falls: true` を足すと、海底を掘った拍子に
  // 上の粘土が崩れて落ちてくる（本家の粘土は落ちない）。
  check(
    "粘土は落ちない（砂・砂利との違いはここだけ）",
    d.falls === false && blockDef(SAND).falls === true && blockDef(GRAVEL).falls === true,
    `粘土 ${d.falls} / 砂 ${blockDef(SAND).falls} / 砂利 ${blockDef(GRAVEL).falls}`,
  );
  check(
    "粘土を掘ると粘土玉が 4 個落ちる（山は 1 つ）",
    byHand.item === CLAY_BALL && byHand.count === 4 && stacks.length === 1 &&
      stacks[0].item === CLAY_BALL && stacks[0].count === 4,
    `${itemName(byHand.item)} x${byHand.count}（山 ${stacks.length} 個）`,
  );
  // **粘土ブロックそのものは落ちてこないこと。** ここが崩れると、雪と同じ対
  // （`crafting.ts` の 2x2）が要らなくなってしまい、対の意味が消える。
  check(
    "粘土ブロックそのものは落ちない（だから 2x2 で戻す必要がある）",
    stacks.every((s) => s.item !== CLAY),
    stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
  );
  // **乱数が何であっても 4 個**（`chance: 1` なので当たり外れが無い）。
  const rolls = [0.0, 0.25, 0.5, 0.75, 0.99].map((r) => rollDrop(CLAY, r));
  console.log(`      乱数を振っても: ${rolls.map((x) => `${itemName(x.item)} x${x.count}`).join(" / ")}`);
  check(
    "乱数を振っても必ず粘土玉 4 個（chance は 1）",
    rolls.every((x) => x.item === CLAY_BALL && x.count === 4),
    rolls.map((x) => `${itemName(x.item)} x${x.count}`).join(" / "),
  );
  // **2x2 で戻した粘土は置ける**（`variantOf` が `AIR` なので for がアイテムを作る）。
  check(
    "粘土は同じ番号のアイテムとして持てて、置くと自分に戻る",
    itemName(CLAY) === "粘土" && placedBlock(CLAY) === CLAY,
    `「${itemName(CLAY)}」→ ${placedBlock(CLAY)}`,
  );
  // **音は砂利と同じ粒の音**（本家の粘土も砂利と同じ音のグループ）。
  check(
    "粘土の音は砂利と同じ粒の音",
    d.sound === "sand" && d.sound === blockDef(GRAVEL).sound,
    `粘土 ${d.sound} / 砂利 ${blockDef(GRAVEL).sound}`,
  );
}

/**
 * グロウストーン（ブロック 47）を掘るとグロウストーンダスト（アイテム 189）が 3 個（47）。
 * **粘土とまったく同じ対**で、2x2 で戻せることは `test/crafting.test.ts`、色は `test/items.test.ts`。
 *
 * ここで守りたいのは 3 点:
 *
 * - **粉 3 個・1 山だけ**（本家は 2〜4 個。個数の範囲を持てないので平均で固定。
 *   **2 山目に粉を割っていないこと** —— 「extra は 1 山目と別のアイテム」に当たる）
 * - **素手でも落ちる**（`minTier` を書いていない。本家もどの道具でも落ちる）
 * - **ブロック 47 そのものは落ちない / ブロック 189 は無い**（アイテムだけ）
 */
function glowstoneDust(): void {
  describe("グロウストーンダスト（47・グロウストーンを掘ると粉 3 個）");

  const d = blockDef(GLOWSTONE);
  const byHand = rollDrop(GLOWSTONE, 0.5);
  const stacks = rollDrops(GLOWSTONE, 0.99, 0.99);
  console.log(
    `      グロウストーン(${GLOWSTONE}): 硬さ ${d.hardness} / 道具 ${d.tool} 階層 ${d.minTier} / ` +
      `素手で収穫 ${canHarvest(GLOWSTONE, NO_ITEM)} / 木のツルハシで収穫 ${canHarvest(GLOWSTONE, WOOD_PICKAXE)}`,
  );
  console.log(
    `      掘ると: ${itemName(byHand.item)} x${byHand.count}（山 ${stacks.length} 個: ` +
      `${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" / ")}）`,
  );
  check(
    "グロウストーンを掘るとグロウストーンダストが 3 個落ちる（山は 1 つ）",
    byHand.item === GLOWSTONE_DUST && byHand.count === 3 && stacks.length === 1 &&
      stacks[0].item === GLOWSTONE_DUST && stacks[0].count === 3,
    `${itemName(byHand.item)} x${byHand.count}（山 ${stacks.length} 個）`,
  );
  check(
    "グロウストーンそのものは落ちない（だから 2x2 で戻す必要がある）",
    byHand.item !== GLOWSTONE && stacks.every((s) => s.item !== GLOWSTONE),
    stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
  );
  check(
    "グロウストーンは素手でも収穫になる（minTier を書いていない）",
    canHarvest(GLOWSTONE, NO_ITEM) && canHarvest(GLOWSTONE, WOOD_PICKAXE),
    `素手 ${canHarvest(GLOWSTONE, NO_ITEM)} / 木のツルハシ ${canHarvest(GLOWSTONE, WOOD_PICKAXE)}`,
  );
  const rolls = [0.0, 0.25, 0.5, 0.75, 0.99].map((r) => rollDrop(GLOWSTONE, r));
  console.log(`      乱数を振っても: ${rolls.map((x) => `${itemName(x.item)} x${x.count}`).join(" / ")}`);
  check(
    "乱数を振っても必ず粉 3 個（chance は 1）",
    rolls.every((x) => x.item === GLOWSTONE_DUST && x.count === 3),
    rolls.map((x) => `${itemName(x.item)} x${x.count}`).join(" / "),
  );
  // **ブロック 189 は作らない**（アイテムだけ）。`blockDef()` は定義の無い ID を
  // 空気として返すので、`BLOCKS` に 189 が無いことを直に見る。
  const block189 = BLOCKS.find((b) => b.id === GLOWSTONE_DUST);
  console.log(`      ブロック ${GLOWSTONE_DUST}: ${block189 ? block189.name : "無し"} / 置くと ${placedBlock(GLOWSTONE_DUST)}`);
  check(
    "ブロック 189 は存在しない（グロウストーンダストはアイテムだけ・置けない）",
    block189 === undefined && placedBlock(GLOWSTONE_DUST) === AIR,
    `${block189?.name ?? "無し"} / ${placedBlock(GLOWSTONE_DUST)}`,
  );
  // **ブロック 190 も作らない**（クモの目はアイテムだけ）。同じ形で直に見る。
  const block190 = BLOCKS.find((b) => b.id === SPIDER_EYE);
  console.log(`      ブロック ${SPIDER_EYE}: ${block190 ? block190.name : "無し"} / 置くと ${placedBlock(SPIDER_EYE)}`);
  check(
    "ブロック 190 は存在しない（クモの目はアイテムだけ・置けない）",
    block190 === undefined && placedBlock(SPIDER_EYE) === AIR,
    `${block190?.name ?? "無し"} / ${placedBlock(SPIDER_EYE)}`,
  );
}

/**
 * 氷（ブロック 156）。**ブロックと滑りだけ**が 25a なので、ここで見るのは
 * **表の値そのもの**だけです —— **凍った海（自然生成）は 25b**。
 *
 * **どれだけ滑るかは `test/physics.test.ts`**（あちらが `Player` を実際に走らせます）。
 * **壊したマスが水になることは `test/breaking.test.ts`**（あちらが `tryBreak()` を回します）。
 */
function ices(): void {
  describe("氷");

  // --- 形と性質（**普通の立方体**。ガラスと違うのは濃さ・硬さ・道具・旗 2 つ） ---
  const def = blockDef(ICE);
  const glass = blockDef(GLASS);
  console.log(
    `      model ${def.model} / isProp ${isProp(ICE)} / opaque ${def.opaque} / ` +
      `blocksSky ${def.blocksSky} / translucent ${isTranslucent(ICE)} / alpha ${def.alpha} / ` +
      `solid ${def.solid} / replaceable ${def.replaceable} / variantOf ${def.variantOf} / ` +
      `supportFace ${def.supportFace} / hardness ${def.hardness} / tool ${blockTool(ICE)} / ` +
      `sound ${def.sound}  ｜ 対照のガラス: alpha ${glass.alpha} / hardness ${glass.hardness} / tool ${blockTool(GLASS)}`,
  );
  check(
    "普通の立方体（model は cube・isProp は偽・箱は 1 個の 1x1x1）",
    def.model === "cube" && !isProp(ICE) && collisionBoxes(ICE).length === 1 &&
      collisionBoxes(ICE)[0][3] === 1 && collisionBoxes(ICE)[0][4] === 1,
    `model ${def.model} / 箱 [${collisionBoxes(ICE)[0].join(" ")}]`,
  );
  // **`translucent` が効くのは立方体だけ**（`isProp` なブロックは `buildProps()` が
  // 必ず不透明側へ積むので黙って無視される。`rules/meshing-render.md`）。
  // だから**立方体であること**と半透明であることを続けて見る。
  check(
    "半透明で、濃さはガラス（0.3）より濃い 0.6",
    isTranslucent(ICE) && !def.opaque && def.alpha === 0.6 && def.alpha > glass.alpha,
    `alpha ${def.alpha} / ガラス ${glass.alpha} / translucent ${isTranslucent(ICE)}`,
  );
  // **`blocksSky` を書くと 25b で氷の下の海が真っ暗になる**（既定は `opaque` = false）。
  // 対照は屋根材のハーフ（`opaque: false` なのに `blocksSky: true`）。
  check(
    "blocksSky は false（書いていない。屋根材のハーフとは違う）",
    !def.blocksSky && blockDef(STONE_SLAB).blocksSky,
    `氷 ${def.blocksSky} / 石ハーフ ${blockDef(STONE_SLAB).blocksSky}`,
  );
  // **`variantOf` を書くとアイテムが作られない**（一覧に出ず、置けない）。
  // **`replaceable` を付けると置いた氷が黙って消え**、**`supportFace` を書くと
  // 床が消えたときに壊れる**（氷は宙に浮いてよい）。
  check(
    "solid で、variantOf も replaceable も supportFace も付いていない",
    def.solid && def.variantOf === AIR && !def.replaceable &&
      def.supportFace === NO_SUPPORT && !stacksOnSelf(ICE),
    `solid ${def.solid} / variantOf ${def.variantOf} / replaceable ${def.replaceable} / ` +
      `supportFace ${def.supportFace} / stacksOnSelf ${stacksOnSelf(ICE)}`,
  );
  // **`minTier` を書かないこと** —— 木のツルハシで掘れるのが本家。**`minTier` が 0 なので
  // 素手でも「適正」**（`canHarvest()` が早い return で真を返す）で、ツルハシは
  // **速さだけ**が変わる（`0.5 × 1.5` = 0.75 秒 ↔ `0.5 × 1.5 / 2` = 0.375 秒）。
  // **数値を出してから判定する** —— 「素手だと 5 倍」は `minTier` を書いたときの話。
  check(
    "硬さ 0.5・ツルハシが適正・階層は要らない（素手 0.75 秒 / 木のツルハシ 0.375 秒）",
    def.hardness === 0.5 && blockTool(ICE) === "pickaxe" && def.sound === "glass" &&
      canHarvest(ICE, NO_ITEM) && breakTime(ICE, NO_ITEM) === 0.75 &&
      breakTime(ICE, WOOD_PICKAXE) === 0.375,
    `hardness ${def.hardness} / tool ${blockTool(ICE)} / ` +
      `素手 ${breakTime(ICE, NO_ITEM).toFixed(3)}s ツルハシ ${breakTime(ICE, WOOD_PICKAXE).toFixed(3)}s`,
  );

  // --- 旗 2 つ（**どちらも氷だけ**。値を並べて出してから判定する） ---
  const slippery = BLOCKS.filter((b) => isSlippery(b.id)).map((b) => `${b.id}:${b.name}`);
  const remains = BLOCKS.filter((b) => remainsAfterBreak(b.id) !== AIR)
    .map((b) => `${b.id}:${b.name}→${blockName(remainsAfterBreak(b.id))}`);
  console.log(`      isSlippery: [${slippery.join(" ")}]  breaksInto: [${remains.join(" ")}]`);
  // 対照を並べる —— 「いつも真」の実装がここを素通りしないため。
  const others: [string, number][] = [
    ["石", STONE], ["雪", SNOW], ["ガラス", GLASS], ["水", WATER], ["クモの巣", COBWEB],
  ];
  console.log(
    `      対照: ${others.map(([n, id]) => `${n} slippery=${isSlippery(id)} 残る=${blockName(remainsAfterBreak(id))}`).join(" / ")}`,
  );
  check(
    "isSlippery が真なのは氷だけ（石・雪・ガラス・水・クモの巣は偽）",
    slippery.length === 1 && isSlippery(ICE) && others.every(([, id]) => !isSlippery(id)),
    slippery.join(" ") || "0 個",
  );
  // **`sticky` と 1 つの旗にまとめないこと**（`blocks.ts` のコメントが名指しで断っている）
  // —— 氷は滑らせるだけ・クモの巣は鈍らせるだけ。**両方に付いていないこと**を見る。
  check(
    "滑るのと鈍るのは別の旗（氷は sticky でなく、クモの巣は slippery でない）",
    isSlippery(ICE) && !isSticky(ICE) && isSticky(COBWEB) && !isSlippery(COBWEB),
    `氷 slippery=${isSlippery(ICE)} sticky=${isSticky(ICE)} / ` +
      `巣 slippery=${isSlippery(COBWEB)} sticky=${isSticky(COBWEB)}`,
  );
  check(
    "壊したあとに何かが残るのも氷だけ（水が残る。ほかは全部 AIR）",
    remains.length === 1 && remainsAfterBreak(ICE) === WATER &&
      others.every(([, id]) => remainsAfterBreak(id) === AIR),
    remains.join(" ") || "0 個",
  );

  // --- 掘って出るもの（**3 通りとも 0 個**。ガラス・ケーキと同じ `NO_ITEM` の 1 行） ---
  const tools: [string, number][] = [
    ["素手", NO_ITEM], ["木のツルハシ", WOOD_PICKAXE], ["木の剣", WOOD_SWORD],
  ];
  const drop = dropOf(ICE);
  const harvest = tools.map(([, item]) => canHarvest(ICE, item));
  const stacks = rollDrops(ICE, 0.5, 0.5);
  console.log(
    `      dropOf(): ${drop.item} x${drop.count} chance ${drop.chance} / ` +
      `rollDrops(0.5, 0.5) の山 ${stacks.length} 個 / ` +
      `rollDrop(0.0) x${rollDrop(ICE, 0).count} / rollDrop(0.99) x${rollDrop(ICE, 0.99).count} / ` +
      `canHarvest: ${tools.map(([n], i) => `${n} ${harvest[i]}`).join(" / ")}`,
  );
  check(
    "掘っても何も落ちない（素手・ツルハシ・剣の 3 通りとも 0 個）",
    drop.item === NO_ITEM && drop.count === 0 && drop.chance === 0 &&
      stacks.length === 0 && harvest.every((ok) => ok) &&
      rollDrop(ICE, 0).count === 0 && rollDrop(ICE, 0.99).count === 0,
    `山 ${stacks.length} 個 / ${tools.map(([n], i) => `${n} canHarvest=${harvest[i]}`).join(" ")}`,
  );
  // **`otherwise` を書くと「外れたら氷が戻る」になる**（砂利の形）。ガラス・ケーキと
  // 同じでここは書かない —— 壊したら水になって消えるのが本家の形。
  check(
    "extra も otherwise も書いていない（山は 0 のまま）",
    drop.extra === undefined && drop.otherwise === undefined,
    `extra ${drop.extra === undefined ? "無し" : "有り"} / otherwise ${drop.otherwise === undefined ? "無し" : "有り"}`,
  );

  // --- アイテム 156（`items.ts` の for が自動で作る。手で足すと二重登録） ---
  console.log(
    `      アイテム ${ICE}: 「${itemName(ICE)}」 placedBlock ${placedBlock(ICE)} / ` +
      `1 枠 ${itemStackLimit(ICE)} 個 / 道具 ${toolOf(ICE) === null ? "でない" : "である"} / ` +
      `食べ物 ${foodOf(ICE) === null ? "でない" : "である"}`,
  );
  check(
    "アイテム 156 は「氷」で、置くと 156 が戻る（一覧にも出る）",
    itemName(ICE) === "氷" && placedBlock(ICE) === ICE &&
      allItemIds().includes(ICE) && toolOf(ICE) === null && foodOf(ICE) === null,
    `${itemName(ICE)} / placedBlock ${placedBlock(ICE)} / 一覧に ${allItemIds().includes(ICE)}`,
  );

  // --- 一覧に並ぶ色（既存のどれとも見分けが付くこと。**判定に入るのは `top` だけ**） ---
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === ICE) continue;
    const gap = dist(itemColor(ICE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: 氷 0x${itemColor(ICE).toString(16)} ↔ ${who} ${best.toFixed(1)}` +
      `（ガラス 0x${itemColor(GLASS).toString(16)} とは ${dist(itemColor(ICE), itemColor(GLASS)).toFixed(1)}）`,
  );
  check(
    "氷は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  // **1 色のブロック**（`side` も `bottom` も `top` から落ちてくる）。ガラス・
  // クモの巣と同じで、上下と側面で見分ける必要が無い —— **書き分けたつもりで
  // `side` だけ書くと下面まで側面色になる**罠（本棚）の裏返しをここで固定しておく。
  check(
    "上面・側面・下面が同じ 1 色（top だけを書いている）",
    def.top === def.side && def.side === def.bottom && def.top === 0x8fc4f2,
    `top 0x${def.top.toString(16)} / side 0x${def.side.toString(16)} / bottom 0x${def.bottom.toString(16)}`,
  );
}

/**
 * フェンス（ブロック 157・26a）。**ここで見るのは表の値そのもの**で、
 * **跳んでも越えられない／通り抜けられない／上でガタつかないは
 * `test/physics.test.ts`**（あちらが本物の `Player` を走らせます）。
 *
 * **このブロックだけが `BlockDef.collision` を持ちます** —— 見た目と狙いの形
 * （`shapeBoxes`・上端 1.0）と当たり判定（`collisionBoxes`・上端 1.5）が違う
 * 唯一の例外なので、**2 種類の箱を両方とも数と上端で出してから**判定します。
 */
function fences(): void {
  describe("フェンス");

  // --- 形が 2 本立ちしている（**ここが 26a の全部**。数と上端を両方出す） ---
  const def = blockDef(FENCE);
  const shape = shapeBoxes(FENCE);
  const collision = collisionBoxes(FENCE);
  const shapeTop = Math.max(...shape.map((b) => b[4]));
  const collisionTop = Math.max(...collision.map((b) => b[4]));
  const bounds = [0, 0, 0, 0, 0, 0];
  shapeBounds(FENCE, bounds);
  console.log(
    `      model ${def.model} / isProp ${isProp(FENCE)} / opaque ${def.opaque} / ` +
      `blocksSky ${def.blocksSky} / solid ${def.solid} / hardness ${def.hardness} / ` +
      `tool ${blockTool(FENCE)} / sound ${def.sound}\n` +
      `      形（shapeBoxes）: 箱 ${shape.length} 個 上端 ${shapeTop} / ` +
      `当たり判定（collisionBoxes）: 箱 ${collision.length} 個 [${collision[0].join(" ")}] 上端 ${collisionTop}\n` +
      `      選択枠（shapeBounds）: [${bounds.join(" ")}]（形の側 = 上端 ${bounds[4]}）`,
  );
  // 柱 1 + 腕 4 方向 x 2 段 = 9 個。**見た目の腕は繋がる側だけ**（26b）だが、
  // **`boxes` は 9 箱のまま** —— 減らすと繋がっていない側から狙えなくなる。
  check(
    "見た目と狙いの形は柱 1 + 腕 8 の 9 個で、上端はマスの 1.0",
    shape.length === 9 && shapeTop === 1 &&
      shape[0][0] === 0.375 && shape[0][3] === 0.625 && shape[0][4] === 1,
    `箱 ${shape.length} 個 / 上端 ${shapeTop} / 柱 [${shape[0].join(" ")}]`,
  );
  // **当たり判定だけマスいっぱい x 1.5。** 柱の太さ（0.25）にすると、`collisionBoxes()`
  // は座標を知らないので**列のあいだを歩いて抜けられる**（`blocks.ts` のコメント）。
  check(
    "当たり判定は [[0,0,0,1,1.5,1]] の 1 個だけ（マスいっぱい x 高さ 1.5）",
    collision.length === 1 && collision[0][0] === 0 && collision[0][1] === 0 &&
      collision[0][2] === 0 && collision[0][3] === 1 && collision[0][4] === 1.5 &&
      collision[0][5] === 1,
    `箱 ${collision.length} 個 [${collision[0].join(" ")}]`,
  );
  // **`boxes` のほうを 1.5 にすると、狙う判定も選択枠も 1.5 になる**
  // （空中を狙っているのにフェンスに当たる）。**選択枠は形の側**であることを見る。
  check(
    "選択枠とひび割れ（shapeBounds）は形の側の 1.0 まで（当たり判定の 1.5 ではない）",
    bounds[4] === 1 && bounds[4] < collisionTop && collisionTop === 1.5,
    `選択枠の上端 ${bounds[4]} / 当たり判定の上端 ${collisionTop}`,
  );

  // --- `collision` を持つのはフェンスだけ（値を並べて出してから判定する） ---
  const differs = BLOCKS.filter((b) => b.collision !== b.boxes).map((b) => `${b.id}:${b.name}`);
  const tall = BLOCKS.filter((b) => isTallCollision(b.id)).map((b) => `${b.id}:${b.name}`);
  console.log(
    `      collision が boxes と別: [${differs.join(" ")}]  isTallCollision: [${tall.join(" ")}]`,
  );
  // 対照を並べる —— 「いつも真」の実装がここを素通りしないため。
  const others: [string, number][] = [
    ["石", STONE], ["石ハーフ", STONE_SLAB], ["石階段", STONE_STAIRS],
    ["サボテン", CACTUS], ["ケーキ", CAKE], ["はしご", LADDER],
  ];
  console.log(
    `      対照: ${others.map(([n, id]) => `${n} 当たり上端 ${Math.max(0, ...collisionBoxes(id).map((b) => b[4]))} tall=${isTallCollision(id)}`).join(" / ")}`,
  );
  check(
    "見た目と当たり判定が違うのはフェンス 2 材質だけ（ほかは 3 つの用途が同じ形。材質が 2 つになったので数え直した）",
    differs.length === 2 && def.collision !== def.boxes &&
      blockDef(NETHER_BRICK_FENCE).collision !== blockDef(NETHER_BRICK_FENCE).boxes &&
      others.every(([, id]) => blockDef(id).collision === blockDef(id).boxes),
    differs.join(" ") || "0 個",
  );
  // **手で旗を書かず `collision` の最大 y > 1 から立てること**（2 か所に書くと食い違う）。
  // **`isTallCollision()` が真のマスだけ**が `collides()` の 1 段下の層に残る。
  check(
    "isTallCollision が真なのもフェンス 2 材質だけ（石・ハーフ・階段・サボテン・ケーキ・はしごは偽。材質が 2 つになったので数え直した）",
    tall.length === 2 && isTallCollision(FENCE) && isTallCollision(NETHER_BRICK_FENCE) &&
      others.every(([, id]) => !isTallCollision(id)),
    tall.join(" ") || "0 個",
  );

  // --- 繋がる相手の表（26b）。**表を出してから判定する**（「いつも真」を素通りさせない） ---
  // 繋がるのは**フェンスどうし**と、**立方体で `solid` かつ `opaque`** なものだけ。
  // **見た目の腕がどこへ伸びるかだけ**で、当たり判定（マスいっぱい x 1.5）は隣に依らない。
  // **ネザーレンガのフェンス（187）も相手に並べる**（41 で材質が 2 つになった）。
  // **⚠ 本家では木とネザーレンガのフェンスは繋がりませんが、ここでは繋がります** ——
  // `fenceConnects()` は「フェンスならどれでも」の表 1 本で、材質の分岐を入れると
  // `mesher.ts` とこの表の 2 か所に材質が漏れるため（`blocks.ts` の注記）。
  const connectTable: [string, number][] = [
    ["石", STONE], ["葉", LEAVES], ["板", PLANK], ["フェンス", FENCE],
    ["ネザーレンガのフェンス", NETHER_BRICK_FENCE],
    ["ガラス", GLASS], ["水", WATER], ["草", TALL_GRASS], ["空気", AIR],
    ["石ハーフ", STONE_SLAB], ["石階段", STONE_STAIRS], ["サボテン", CACTUS],
  ];
  console.log(
    `      fenceConnects: ${connectTable
      .map(([n, id]) => `${n} ${fenceConnects(id)}`)
      .join(" / ")}`,
  );
  console.log(
    `      内訳（isProp / solid / opaque）: ${connectTable
      .map(([n, id]) => `${n} ${isProp(id)}/${blockDef(id).solid}/${blockDef(id).opaque}`)
      .join(" / ")}`,
  );
  const connected = new Set(["石", "葉", "板", "フェンス", "ネザーレンガのフェンス"]);
  check(
    "繋がるのは石・葉・板・フェンス 2 材質だけ（立方体で solid かつ opaque、とフェンス。材質が 2 つになったので数え直した）",
    connectTable.every(([n, id]) => fenceConnects(id) === connected.has(n)),
    connectTable.map(([n, id]) => `${n} ${fenceConnects(id)}`).join(" / "),
  );

  // --- 形は 1 か所（`FENCE_BOXES` は `FENCE_POST_BOX` と `FENCE_ARMS` から組む） ---
  // **箱の数値を 2 か所に書かないこと** —— `mesher.ts` は同じ配列を積むだけ。
  console.log(
    `      柱 [${FENCE_POST_BOX.join(" ")}] / 腕 ${FENCE_ARMS.length} 方向 ` +
      `${FENCE_ARMS.map((a) => `(${a.dx},${a.dz})x${a.boxes.length}`).join(" ")}`,
  );
  check(
    "9 箱は 柱 1 + 腕 4 方向 x 2 段 を組んだもの（同じ配列を指している）",
    shape[0] === FENCE_POST_BOX && FENCE_ARMS.length === 4 &&
      FENCE_ARMS.every((a) => a.boxes.length === 2) &&
      FENCE_ARMS.every((a, i) => shape[1 + i] === a.boxes[0] && shape[5 + i] === a.boxes[1]) &&
      FENCE_ARMS.every((a) => Math.abs(a.dx) + Math.abs(a.dz) === 1),
    `柱 ${shape[0] === FENCE_POST_BOX} / 腕 ${FENCE_ARMS.length} 方向`,
  );

  // --- 性質（**`supportFace` を書かないので宙に浮く**。旗も 1 つも付けない） ---
  check(
    "solid で、variantOf も replaceable も supportFace も旗も付いていない",
    def.solid && def.variantOf === AIR && !def.replaceable &&
      def.supportFace === NO_SUPPORT && !stacksOnSelf(FENCE) &&
      !isSpiky(FENCE) && !isSticky(FENCE) && !isSlippery(FENCE) && !isClimbable(FENCE) &&
      !isBladed(FENCE) && remainsAfterBreak(FENCE) === AIR,
    `solid ${def.solid} / variantOf ${def.variantOf} / supportFace ${def.supportFace} / ` +
      `spiky ${isSpiky(FENCE)} sticky ${isSticky(FENCE)} slippery ${isSlippery(FENCE)}`,
  );
  // **`blocksSky` を書くとフェンスの下だけ一段暗くなる**（既定は `opaque` = false）。
  // 対照は屋根材のハーフ（`opaque: false` なのに `blocksSky: true`）。
  check(
    "blocksSky は false（書いていない。屋根材のハーフとは違う）",
    !def.blocksSky && !def.opaque && blockDef(STONE_SLAB).blocksSky,
    `フェンス ${def.blocksSky} / 石ハーフ ${blockDef(STONE_SLAB).blocksSky}`,
  );
  // **数値を出してから判定する。** 硬さ 2・斧が適正・`minTier` は書かない
  // （素手でも落ちる）。**`minTier` が 0 なので素手でも「適正」**（`canHarvest()` が
  // 早い return で真を返す）で、斧は**速さだけ**が変わる ——
  // 素手 `2 × 1.5` = 3.0 秒 / 木の斧 `2 × 1.5 / 2` = 1.5 秒。
  // **「素手だと 5 倍」は `minTier` を書いたときの話**（氷の節と同じ罠）。
  console.log(
    `      硬さ ${def.hardness} / tool ${blockTool(FENCE)} / minTier ${def.minTier} / ` +
      `素手 ${breakTime(FENCE, NO_ITEM).toFixed(3)}s 木の斧 ${breakTime(FENCE, WOOD_AXE).toFixed(3)}s ` +
      `木のツルハシ ${breakTime(FENCE, WOOD_PICKAXE).toFixed(3)}s`,
  );
  check(
    "硬さ 2・斧が適正・階層は要らない（素手 3.0 秒 / 木の斧 1.5 秒）",
    def.hardness === 2 && blockTool(FENCE) === "axe" && def.sound === "wood" &&
      def.minTier === TIER_HAND && canHarvest(FENCE, NO_ITEM) &&
      breakTime(FENCE, NO_ITEM) === 3 && breakTime(FENCE, WOOD_AXE) === 1.5,
    `hardness ${def.hardness} / tool ${blockTool(FENCE)} / ` +
      `素手 ${breakTime(FENCE, NO_ITEM).toFixed(3)}s 斧 ${breakTime(FENCE, WOOD_AXE).toFixed(3)}s`,
  );

  // --- 掘って出るもの（**自分が 1 個**。`DROPS` は 0 行で、既定の `baseBlock()`） ---
  const drop = dropOf(FENCE);
  const stacks = rollDrops(FENCE, 0.5, 0.5);
  console.log(
    `      dropOf(): ${itemName(drop.item)}(${drop.item}) x${drop.count} chance ${drop.chance} / ` +
      `rollDrops(0.5, 0.5) の山 ${stacks.length} 個 ${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" ")} / ` +
      `baseBlock ${baseBlock(FENCE)}`,
  );
  check(
    "壊すと自分が 1 個落ちる（DROPS に 1 行も書いていない = 既定の baseBlock）",
    drop.item === FENCE && drop.count === 1 && drop.chance === 1 &&
      baseBlock(FENCE) === FENCE && stacks.length === 1 && stacks[0].item === FENCE &&
      stacks[0].count === 1 && drop.extra === undefined && drop.otherwise === undefined,
    `${itemName(drop.item)} x${drop.count} / 山 ${stacks.length} 個`,
  );

  // --- アイテム 157（`items.ts` の for が自動で作る。手で足すと二重登録） ---
  console.log(
    `      アイテム ${FENCE}: 「${itemName(FENCE)}」 placedBlock ${placedBlock(FENCE)} / ` +
      `1 枠 ${itemStackLimit(FENCE)} 個 / 道具 ${toolOf(FENCE) === null ? "でない" : "である"} / ` +
      `食べ物 ${foodOf(FENCE) === null ? "でない" : "である"}`,
  );
  check(
    "アイテム 157 は「フェンス」で、置くと 157 が戻る（一覧にも出る）",
    itemName(FENCE) === "フェンス" && placedBlock(FENCE) === FENCE &&
      allItemIds().includes(FENCE) && toolOf(FENCE) === null && foodOf(FENCE) === null,
    `${itemName(FENCE)} / placedBlock ${placedBlock(FENCE)} / 一覧に ${allItemIds().includes(FENCE)}`,
  );

  // --- 一覧に並ぶ色（既存のどれとも見分けが付くこと。**判定に入るのは `top` だけ**） ---
  // **木の茶色は一覧でいちばん混んでいる帯**で、板（0xb18a56）をそのまま使うと
  // 板から 7.1 しか離れず判定（20）に落ちる。灰緑へ寄せて 26.2 離してある。
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === FENCE) continue;
    const gap = dist(itemColor(FENCE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: フェンス 0x${itemColor(FENCE).toString(16)} ↔ ${who} ${best.toFixed(1)}` +
      `（板 0x${itemColor(PLANK).toString(16)} とは ${dist(itemColor(FENCE), itemColor(PLANK)).toFixed(1)}）`,
  );
  check(
    "フェンスは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  check(
    "上面・側面・下面が同じ 1 色（top だけを書いている）",
    def.top === def.side && def.side === def.bottom && def.top === 0x988a5e,
    `top 0x${def.top.toString(16)} / side 0x${def.side.toString(16)} / bottom 0x${def.bottom.toString(16)}`,
  );
}

/**
 * ネザーレンガのフェンス（ブロック 187・41・本家 Beta 1.9）。**2 材質目のフェンス**なので、
 * **ここで見るのは「157 と同じところ」と「違う 3 つ」の両方**です。
 *
 * **同じ配列を指していること**（`boxes` / `collision`）が要 —— 写して 2 本目を作ると、
 * 片方だけ直したときに見た目と当たり判定が静かに食い違います（`===` で見張る）。
 * **違うのは色・道具（ツルハシ + `minTier`）・レシピの 3 つだけ**で、
 * **`mesher.ts` も `fenceConnects()` も `isTallCollision()` も ±0 行**です
 * （数え直した 4 件は上の `fences()` にあります）。
 */
function netherBrickFences(): void {
  describe("ネザーレンガのフェンス（ブロック 187）");

  const def = blockDef(NETHER_BRICK_FENCE);
  const wood = blockDef(FENCE);
  const shape = shapeBoxes(NETHER_BRICK_FENCE);
  const collision = collisionBoxes(NETHER_BRICK_FENCE);
  console.log(
    `      model ${def.model} / isProp ${isProp(NETHER_BRICK_FENCE)} / opaque ${def.opaque} / ` +
      `blocksSky ${def.blocksSky} / solid ${def.solid} / hardness ${def.hardness} / ` +
      `tool ${blockTool(NETHER_BRICK_FENCE)} / minTier ${def.minTier} / sound ${def.sound}\n` +
      `      形 箱 ${shape.length} 個 上端 ${Math.max(...shape.map((b) => b[4]))} / ` +
      `当たり判定 箱 ${collision.length} 個 [${collision[0].join(" ")}]`,
  );
  check(
    "model は fence・isProp は真・opaque は偽・solid は真（157 とまったく同じ）",
    def.model === "fence" && isProp(NETHER_BRICK_FENCE) && !def.opaque && def.solid &&
      def.model === wood.model && isProp(FENCE) === isProp(NETHER_BRICK_FENCE) &&
      def.opaque === wood.opaque && def.solid === wood.solid,
    `model ${def.model} / isProp ${isProp(NETHER_BRICK_FENCE)} / opaque ${def.opaque} / solid ${def.solid}`,
  );
  // **同じ配列を「指している」こと**（`===`）。値が等しいだけでは足りない ——
  // 写して 2 本目を作ると、片方だけ直したときに静かに食い違う（`AUTODEV-SPEC.md` の 6）。
  check(
    "boxes も collision も 157 とまったく同じ配列を指している（写して 2 本目を作っていない）",
    def.boxes === wood.boxes && def.collision === wood.collision &&
      shape.length === 9 && collision.length === 1 && collision[0][4] === 1.5,
    `boxes 同じ ${def.boxes === wood.boxes} / collision 同じ ${def.collision === wood.collision} / ` +
      `形 ${shape.length} 箱 当たり ${collision.length} 箱 上端 ${collision[0][4]}`,
  );
  // **支えが要らない**（`supportFace` を書かない = `NO_SUPPORT`。157 と同じで宙に浮く）。
  check(
    "supportFace は NO_SUPPORT（157 と同じで宙に浮く）・blocksSky は偽",
    def.supportFace === NO_SUPPORT && def.supportFace === wood.supportFace &&
      !def.blocksSky && !wood.blocksSky,
    `supportFace ${def.supportFace} / blocksSky ${def.blocksSky}`,
  );

  // --- 違う 3 つのうちの 1 つ目: 道具（**斧ではなくツルハシ・`minTier` が要る**） ---
  // **数値を出してから判定する。** 硬さは 157 と同じ 2 だが、**`minTier: TIER_WOOD` を
  // 書いたので素手では落ちません**（`canHarvest()` が偽）。157 は `TIER_HAND` なので
  // 素手でも落ちる —— **ここが「石の仲間」と「木の仲間」の分かれ目**。
  console.log(
    `      硬さ ${def.hardness} / tool ${blockTool(NETHER_BRICK_FENCE)} / minTier ${def.minTier} / ` +
      `素手 ${breakTime(NETHER_BRICK_FENCE, NO_ITEM).toFixed(3)}s ` +
      `木の斧 ${breakTime(NETHER_BRICK_FENCE, WOOD_AXE).toFixed(3)}s ` +
      `木のツルハシ ${breakTime(NETHER_BRICK_FENCE, WOOD_PICKAXE).toFixed(3)}s\n` +
      `      対照（木のフェンス 157）: tool ${blockTool(FENCE)} / minTier ${wood.minTier} / ` +
      `素手で落ちる ${canHarvest(FENCE, NO_ITEM)}`,
  );
  check(
    "硬さ 2・ツルハシが適正・minTier は TIER_WOOD（素手 10.0 秒 / 木の斧 10.0 秒 / 木のツルハシ 1.5 秒）",
    def.hardness === 2 && def.hardness === wood.hardness &&
      blockTool(NETHER_BRICK_FENCE) === "pickaxe" && def.minTier === TIER_WOOD &&
      breakTime(NETHER_BRICK_FENCE, WOOD_PICKAXE) === 1.5 &&
      breakTime(NETHER_BRICK_FENCE, NO_ITEM) === 10 &&
      breakTime(NETHER_BRICK_FENCE, WOOD_AXE) === 10,
    `hardness ${def.hardness} / tool ${blockTool(NETHER_BRICK_FENCE)} / minTier ${def.minTier} / ` +
      `素手 ${breakTime(NETHER_BRICK_FENCE, NO_ITEM).toFixed(3)}s ` +
      `ツルハシ ${breakTime(NETHER_BRICK_FENCE, WOOD_PICKAXE).toFixed(3)}s`,
  );
  // **素手では 1 個も落ちない**（木のフェンスは落ちる）。`minTier` を書いた効き目はここ。
  check(
    "素手では落ちない（木のフェンス 157 は素手でも落ちる）",
    !canHarvest(NETHER_BRICK_FENCE, NO_ITEM) && !canHarvest(NETHER_BRICK_FENCE, WOOD_AXE) &&
      canHarvest(NETHER_BRICK_FENCE, WOOD_PICKAXE) && canHarvest(FENCE, NO_ITEM),
    `素手 ${canHarvest(NETHER_BRICK_FENCE, NO_ITEM)} / 木の斧 ${canHarvest(NETHER_BRICK_FENCE, WOOD_AXE)} / ` +
      `木のツルハシ ${canHarvest(NETHER_BRICK_FENCE, WOOD_PICKAXE)} / 157 は素手 ${canHarvest(FENCE, NO_ITEM)}`,
  );
  // **`sound` は書かないこと**（既定が `"stone"`。元のネザーレンガ 48 も書いていない）。
  check(
    "音は石（sound を書いていないので既定。元のネザーレンガ 48 と同じ。木のフェンスは wood）",
    def.sound === "stone" && def.sound === blockDef(NETHER_BRICK).sound && wood.sound === "wood",
    `187 ${def.sound} / 48 ${blockDef(NETHER_BRICK).sound} / 157 ${wood.sound}`,
  );

  // --- 旗が 1 つも立っていない（157 と同じ。**表 1 本に聞くので数も出す**） ---
  check(
    "旗は 1 つも立っていない（spiky / sticky / slippery / climbable / bladed）・variantOf も replaceable も無い",
    !isSpiky(NETHER_BRICK_FENCE) && !isSticky(NETHER_BRICK_FENCE) &&
      !isSlippery(NETHER_BRICK_FENCE) && !isClimbable(NETHER_BRICK_FENCE) &&
      !isBladed(NETHER_BRICK_FENCE) && def.variantOf === AIR && !def.replaceable &&
      !stacksOnSelf(NETHER_BRICK_FENCE) && remainsAfterBreak(NETHER_BRICK_FENCE) === AIR,
    `spiky ${isSpiky(NETHER_BRICK_FENCE)} sticky ${isSticky(NETHER_BRICK_FENCE)} ` +
      `slippery ${isSlippery(NETHER_BRICK_FENCE)} climbable ${isClimbable(NETHER_BRICK_FENCE)} ` +
      `bladed ${isBladed(NETHER_BRICK_FENCE)} / variantOf ${def.variantOf}`,
  );

  // --- 掘って出るもの（**自分が 1 個**。`DROPS` は 0 行で、既定の `baseBlock()`） ---
  const drop = dropOf(NETHER_BRICK_FENCE);
  const stacks = rollDrops(NETHER_BRICK_FENCE, 0.5, 0.5);
  console.log(
    `      dropOf(): ${itemName(drop.item)}(${drop.item}) x${drop.count} chance ${drop.chance} / ` +
      `rollDrops(0.5, 0.5) の山 ${stacks.length} 個 ` +
      `${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" ")} / ` +
      `baseBlock ${baseBlock(NETHER_BRICK_FENCE)}`,
  );
  check(
    "壊すと自分が 1 個落ちる（DROPS に 1 行も書いていない = 既定の baseBlock）",
    drop.item === NETHER_BRICK_FENCE && drop.count === 1 && drop.chance === 1 &&
      baseBlock(NETHER_BRICK_FENCE) === NETHER_BRICK_FENCE && stacks.length === 1 &&
      stacks[0].item === NETHER_BRICK_FENCE && stacks[0].count === 1 &&
      drop.extra === undefined && drop.otherwise === undefined,
    `${itemName(drop.item)} x${drop.count} / 山 ${stacks.length} 個`,
  );

  // --- アイテム 187（`items.ts` の for が自動で作る。手で足すと二重登録） ---
  console.log(
    `      アイテム ${NETHER_BRICK_FENCE}: 「${itemName(NETHER_BRICK_FENCE)}」 ` +
      `placedBlock ${placedBlock(NETHER_BRICK_FENCE)} / 1 枠 ${itemStackLimit(NETHER_BRICK_FENCE)} 個 / ` +
      `道具 ${toolOf(NETHER_BRICK_FENCE) === null ? "でない" : "である"} / ` +
      `食べ物 ${foodOf(NETHER_BRICK_FENCE) === null ? "でない" : "である"}`,
  );
  check(
    "アイテム 187 は「ネザーレンガのフェンス」で、置くと 187 が戻る（一覧にも出る）",
    itemName(NETHER_BRICK_FENCE) === "ネザーレンガのフェンス" &&
      placedBlock(NETHER_BRICK_FENCE) === NETHER_BRICK_FENCE &&
      allItemIds().includes(NETHER_BRICK_FENCE) && toolOf(NETHER_BRICK_FENCE) === null &&
      foodOf(NETHER_BRICK_FENCE) === null && itemName(NETHER_BRICK_FENCE) !== itemName(FENCE),
    `${itemName(NETHER_BRICK_FENCE)} / placedBlock ${placedBlock(NETHER_BRICK_FENCE)} / ` +
      `一覧に ${allItemIds().includes(NETHER_BRICK_FENCE)}`,
  );

  // --- 一覧に並ぶ色（**素直な写しは 48 と隔たり 0.0**。暗い赤紫へずらした値） ---
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === NETHER_BRICK_FENCE) continue;
    const gap = dist(itemColor(NETHER_BRICK_FENCE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: ネザーレンガのフェンス 0x${itemColor(NETHER_BRICK_FENCE).toString(16)} ` +
      `↔ ${who} ${best.toFixed(1)}（元のネザーレンガ 48 0x${itemColor(NETHER_BRICK).toString(16)} とは ` +
      `${dist(itemColor(NETHER_BRICK_FENCE), itemColor(NETHER_BRICK)).toFixed(1)}）`,
  );
  check(
    "ネザーレンガのフェンスは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  // **同じ形の 2 材質どうしは別の 1 件**（まとめると、どちらが詰まったか出力から読めない）。
  const woodGap = dist(itemColor(NETHER_BRICK_FENCE), itemColor(FENCE));
  console.log(
    `      フェンス 2 材質どうし: 0x${itemColor(FENCE).toString(16)} ↔ ` +
      `0x${itemColor(NETHER_BRICK_FENCE).toString(16)} = ${woodGap.toFixed(1)}`,
  );
  check(
    "木のフェンス（157）とも一覧で見分けられる（同じ形の 2 材質なので別の 1 件として見る）",
    woodGap >= 20,
    `フェンス 2 材質どうし ${woodGap.toFixed(1)}`,
  );
  check(
    "上面・側面・下面が同じ 1 色（top だけを書いている）",
    def.top === def.side && def.side === def.bottom && def.top === 0x6e3746,
    `top 0x${def.top.toString(16)} / side 0x${def.side.toString(16)} / bottom 0x${def.bottom.toString(16)}`,
  );
}

/**
 * ケーキ（ブロック 155）。**置けるところまで**が 24a なので、ここで見るのは
 * **表の値そのもの**だけです —— **かじる 7 回は 24b**（位置ごとの状態）。
 *
 * **レシピと「ミルクバケツが空のバケツになって残る」は `test/crafting.test.ts`**
 * （あちらが盤面を並べて `consumeGrid()` を回します）。
 */
function cakes(): void {
  describe("ケーキ");

  // --- 形と性質（ベッドと同じ `boxes` + `solid` + `FACE_YN`。違うのは箱と硬さ） ---
  const def = blockDef(CAKE);
  const boxes = collisionBoxes(CAKE);
  const box = boxes[0];
  console.log(
    `      model ${def.model} / opaque ${def.opaque} / solid ${def.solid} / ` +
      `replaceable ${def.replaceable} / stacksOnSelf ${stacksOnSelf(CAKE)} / ` +
      `hardness ${def.hardness} / sound ${def.sound} / supportFace ${def.supportFace} / ` +
      `variantOf ${def.variantOf} / 箱 ${boxes.length} 個 [${box.join(" ")}]`,
  );
  check(
    "箱 1 個の `boxes` で、高さは 8/16（縁は 1/16 ずつ内側）",
    def.model === "boxes" && boxes.length === 1 &&
      box[0] === 0.0625 && box[1] === 0 && box[2] === 0.0625 &&
      box[3] === 0.9375 && box[4] === 0.5 && box[5] === 0.9375,
    `[${box.join(" ")}]`,
  );
  // **高さ 0.5 は `STEP_HEIGHT`（0.6）より低い** —— ハーフと同じで歩いて登れる。
  // ここが 0.6 を超えると、置いたケーキの縁で跳ばされる（ベッドと同じ罠）。
  check(
    "solid（上に乗れる）で、高さ 0.5 は段差の自動登り 0.6 より低い",
    def.solid && box[4] === 0.5 && box[4] < PLAYER_SIZE.step,
    `solid=${def.solid} 高さ ${box[4]} / STEP_HEIGHT ${PLAYER_SIZE.step}`,
  );
  // **`variantOf` を書くとアイテムが作られない**（クリエイティブの一覧に出ず、置けない）。
  // **`replaceable` を付けると置いたケーキが黙って消え**、**`stacksOnSelf` を付けると
  // 宙に積み上がる**（どちらも `rules/blocks-shapes.md`）。
  check(
    "variantOf も replaceable も stacksOnSelf も付いていない",
    def.variantOf === AIR && !def.replaceable && !stacksOnSelf(CAKE),
    `variantOf ${def.variantOf} / replaceable ${def.replaceable} / stacksOnSelf ${stacksOnSelf(CAKE)}`,
  );
  // **床が要ることと、床が消えたら壊れることは `supportFace: FACE_YN` が面倒を見る**
  // （ベッドと同じ。`world.canPlaceAt` / `breakUnsupported` がそのまま通る）。
  // **対照はクモの巣**（`NO_SUPPORT` で宙に浮く）。`def.supportFace !== NO_SUPPORT` と
  // 続けて書くと `tsc` が TS2367 で落ちるので、**別のブロックと比べる**のが正解
  // （`rules/testing.md` の「同じ値に `=== A` と `!== B`」）。
  check(
    "supportFace は FACE_YN（床が要る。宙に浮くクモの巣とは違う）",
    def.supportFace === FACE_YN && blockDef(COBWEB).supportFace === NO_SUPPORT,
    `ケーキ ${def.supportFace} / クモの巣 ${blockDef(COBWEB).supportFace}`,
  );
  // **道具を要求しない**ので `toolSpeed()` は常に 1・`canHarvest()` は常に真 ——
  // つまり**どの道具でも同じ 0.75 秒**（`0.5 × 1.5`）。数値を出してから判定する。
  check(
    "硬さは 0.5・音は wool・道具を要求しない（どの道具でも 0.75 秒）",
    def.hardness === 0.5 && def.sound === "wool" && blockTool(CAKE) === null &&
      breakTime(CAKE, NO_ITEM) === 0.75 && breakTime(CAKE, WOOD_PICKAXE) === 0.75,
    `hardness ${def.hardness} / sound ${def.sound} / tool ${blockTool(CAKE)} / ` +
      `素手 ${breakTime(CAKE, NO_ITEM).toFixed(2)}s ツルハシ ${breakTime(CAKE, WOOD_PICKAXE).toFixed(2)}s`,
  );
  // **横も痩せているので支えになれない**（サボテンと同じ。`canSupport()` は
  // 「面が端まで埋まっているか」を見るので、`box[u] = 0.0625 > 0` で落ちる）。
  check(
    "上面は支えにならない（横が 1/16 痩せている。サボテンと同じ）",
    !canSupport(CAKE, FACE_YP) && !canSupport(CACTUS, FACE_YP),
    `ケーキ ${canSupport(CAKE, FACE_YP)} / サボテン ${canSupport(CACTUS, FACE_YP)}`,
  );

  // --- 掘って出るもの（**3 通りとも 0 個**。ガラスと同じ `NO_ITEM` の 1 行） ---
  // **道具で変わらないこと**を並べて見る —— `canHarvest()` の側で塞いだのではなく、
  // **落ちるものが最初から無い**（`chance: 0`）のが正しい形。
  const tools: [string, number][] = [
    ["素手", NO_ITEM], ["木のツルハシ", WOOD_PICKAXE], ["木の剣", WOOD_SWORD],
  ];
  const drop = dropOf(CAKE);
  // **道具は `canHarvest()` の側だけを動かす** —— 3 通りとも収穫にはなるが、
  // 落ちるものが最初から無いので山は 0（クモの巣は逆で、`canHarvest()` が塞いでいる）。
  const harvest = tools.map(([, item]) => canHarvest(CAKE, item));
  const stacks = rollDrops(CAKE, 0.5, 0.5);
  console.log(
    `      dropOf(): ${drop.item} x${drop.count} chance ${drop.chance} / ` +
      `rollDrops(0.5, 0.5) の山 ${stacks.length} 個 / ` +
      `rollDrop(0.0) x${rollDrop(CAKE, 0).count} / rollDrop(0.99) x${rollDrop(CAKE, 0.99).count} / ` +
      `canHarvest: ${tools.map(([n], i) => `${n} ${harvest[i]}`).join(" / ")}`,
  );
  check(
    "掘っても何も落ちない（素手・ツルハシ・剣の 3 通りとも 0 個）",
    drop.item === NO_ITEM && drop.count === 0 && drop.chance === 0 &&
      stacks.length === 0 && harvest.every((ok) => ok) &&
      rollDrop(CAKE, 0).count === 0 && rollDrop(CAKE, 0.99).count === 0,
    `山 ${stacks.length} 個 / ${tools.map(([n], i) => `${n} canHarvest=${harvest[i]}`).join(" ")}`,
  );
  // **`otherwise` を書くと「外れたらケーキが戻る」になる**（砂利の形）。ガラスと同じで
  // ここは書かない —— 置いたら食べるしかないのが本家の形。
  check(
    "extra も otherwise も書いていない（山は 0 のまま）",
    drop.extra === undefined && drop.otherwise === undefined,
    `extra ${drop.extra === undefined ? "無し" : "有り"} / otherwise ${drop.otherwise === undefined ? "無し" : "有り"}`,
  );

  // --- アイテム 155（`items.ts` の for が自動で作る。手で足すと二重登録） ---
  console.log(
    `      アイテム ${CAKE}: 「${itemName(CAKE)}」 placedBlock ${placedBlock(CAKE)} / ` +
      `1 枠 ${itemStackLimit(CAKE)} 個 / 道具 ${toolOf(CAKE) === null ? "でない" : "である"} / ` +
      `食べ物 ${foodOf(CAKE) === null ? "でない" : "である"}`,
  );
  check(
    "アイテム 155 は「ケーキ」で、置くと 155 が戻る（一覧にも出る）",
    itemName(CAKE) === "ケーキ" && placedBlock(CAKE) === CAKE &&
      allItemIds().includes(CAKE) && toolOf(CAKE) === null,
    `${itemName(CAKE)} / placedBlock ${placedBlock(CAKE)} / 一覧に ${allItemIds().includes(CAKE)}`,
  );
  // **まだ食べられません**（満腹度も回復量も 24b で決める）。`FOODS` に 1 行でも
  // 足すと、かじる仕掛けが無いまま「手に持って右クリックで消える」になる。
  check(
    "まだ食べ物ではない（FOODS に 1 行も無い。かじるのは 24b）",
    foodOf(CAKE) === null && !allFoodIds().includes(CAKE) &&
      emptyAfterEating(CAKE) === NO_ITEM,
    `foodOf ${foodOf(CAKE)} / 食べ物 ${allFoodIds().length} 種`,
  );

  // --- 一覧に並ぶ色（既存のどれとも見分けが付くこと。**判定に入るのは `top` だけ**） ---
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === CAKE) continue;
    const gap = dist(itemColor(CAKE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: ケーキ 0x${itemColor(CAKE).toString(16)} ↔ ${who} ${best.toFixed(1)}` +
      `（側面 0x${def.side.toString(16)} / 下面 0x${def.bottom.toString(16)} は一覧に出ない）`,
  );
  check(
    "ケーキは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  // **`bottom` を書き忘れると `side` が下面まで落ちてくる**（`def()` の既定。
  // 2026-09-07 の本棚で踏んだ罠で、**絵でも下から覗かないと分かりません**）。
  check(
    "上面・側面・下面が 3 つとも違う色（bottom の書き忘れが無い）",
    def.top !== def.side && def.side !== def.bottom && def.top !== def.bottom,
    `top 0x${def.top.toString(16)} / side 0x${def.side.toString(16)} / bottom 0x${def.bottom.toString(16)}`,
  );
}

/**
 * クモの巣（ブロック 154）。**旗が 2 つに割れている**のがここの全部です ——
 * `sticky`（鈍る）と `bladed`（刃物でだけ落ちる）を 1 つにまとめると、
 * 氷（鈍るだけ）やツタ（刃物だけ）を足した周に必ず片方を巻き添えにします。
 *
 * **どれだけ鈍るかは `test/physics.test.ts`**（あちらが `Player` を実際に歩かせます）。
 * **壊す時間と収穫は `test/mining.test.ts`**。ここで見るのは**表の値そのもの**だけ。
 */
function cobwebs(): void {
  describe("クモの巣");

  // --- 旗 2 つ（**どちらもクモの巣だけ**。値を並べて出してから判定する） ---
  const sticky = BLOCKS.filter((b) => isSticky(b.id)).map((b) => `${b.id}:${b.name}`);
  const bladed = BLOCKS.filter((b) => isBladed(b.id)).map((b) => `${b.id}:${b.name}`);
  console.log(`      isSticky: [${sticky.join(" ")}]  isBladed: [${bladed.join(" ")}]`);
  // 対照を並べる —— 「いつも真」の実装がここを素通りしないため。
  const others: [string, number][] = [
    ["石", STONE], ["草むら", TALL_GRASS], ["はしご", LADDER], ["サボテン", CACTUS], ["水", WATER],
  ];
  console.log(
    `      対照: ${others.map(([n, id]) => `${n} sticky=${isSticky(id)} bladed=${isBladed(id)}`).join(" / ")}`,
  );
  check(
    "isSticky が真なのはクモの巣だけ（石・草むら・はしご・サボテン・水は偽）",
    sticky.length === 1 && isSticky(COBWEB) && others.every(([, id]) => !isSticky(id)),
    sticky.join(" ") || "0 個",
  );
  // **`isSticky` の 1 個はそのまま**であることが「旗を 1 つにまとめなかった」証拠
  // （ツタは刃物だけ・クモの巣は両方）。**そちらは 1 文字も動かさないこと。**
  check(
    "刃物でだけ落ちるのはクモの巣とツタ 4 向きの 5 個（ツタが入って数え直した。ゆるめていない）",
    bladed.length === 5 && isBladed(COBWEB) &&
      [VINE, VINE_XN, VINE_ZP, VINE_ZN].every((id) => isBladed(id)) &&
      others.every(([, id]) => !isBladed(id)),
    bladed.join(" ") || "0 個",
  );
  // **`tool: "sword"` で表していないこと**が `bladed` を別の旗にした理由そのもの
  // （上の「『sword』を要求するブロックが 1 つも無い」と対で見る）。
  check(
    "クモの巣は tool を要求しない（剣を採掘道具にしていない）",
    blockTool(COBWEB) === null,
    `tool ${blockTool(COBWEB)}`,
  );

  // --- 何が刃物か（`items.ts` の `isBlade()` = 剣 or シアーズ） ---
  const blades: [string, number][] = [
    ["木の剣", WOOD_SWORD], ["ダイヤの剣", DIAMOND_SWORD], ["シアーズ", SHEARS],
  ];
  const dull: [string, number][] = [
    ["素手", NO_ITEM], ["木のツルハシ", WOOD_PICKAXE], ["木の斧", WOOD_AXE], ["石", STONE],
  ];
  console.log(
    `      isBlade: ${blades.map(([n, i]) => `${n} ${isBlade(i)}`).join(" / ")}` +
      ` ｜ ${dull.map(([n, i]) => `${n} ${isBlade(i)}`).join(" / ")}`,
  );
  check(
    "刃物は剣 4 本とシアーズだけ（素手・ツルハシ・斧は違う）",
    blades.every(([, i]) => isBlade(i)) && dull.every(([, i]) => !isBlade(i)),
    blades.concat(dull).map(([n, i]) => `${n}:${isBlade(i)}`).join(" "),
  );

  // --- 落ちるもの（刃物なら糸 1 個・そうでなければ何も落ちない） ---
  // **`chance` は 1 のまま**で、落ちるかどうかを決めているのは `canHarvest()` のほう。
  const drop = rollDrop(COBWEB, 0.5);
  console.log(
    `      dropOf(): ${itemName(dropOf(COBWEB).item)} x${dropOf(COBWEB).count} ` +
      `chance ${dropOf(COBWEB).chance}  rollDrop(0.5): ${itemName(drop.item)} x${drop.count}`,
  );
  check(
    "掘ると糸が 1 個（巣そのものは戻らない）",
    drop.item === STRING && drop.count === 1 && dropOf(COBWEB).chance === 1,
    `${itemName(drop.item)} x${drop.count}`,
  );
  // **2 山目にも「外したら別のもの」にも繋がっていない**（本棚と同じ形の見張り）。
  const stacks = rollDrops(COBWEB, 0.99, 0.99);
  check(
    "山は 1 つだけ（extra も otherwise も書いていない）",
    stacks.length === 1 && stacks[0].item === STRING && dropOf(COBWEB).extra === undefined,
    `${stacks.length} 山 / extra ${dropOf(COBWEB).extra === undefined ? "無し" : "有り"}`,
  );

  // --- 形と性質（草むら・キノコと同じ十字。違うのは硬さと支えと `replaceable`） ---
  const def = blockDef(COBWEB);
  console.log(
    `      model ${def.model} / opaque ${def.opaque} / solid ${def.solid} / ` +
      `replaceable ${def.replaceable} / hardness ${def.hardness} / sound ${def.sound} / ` +
      `supportFace ${def.supportFace} / variantOf ${def.variantOf} / 箱 ${collisionBoxes(COBWEB).length} 個`,
  );
  check(
    "十字で通り抜けられて、支えが要らない（宙に浮く）",
    def.model === "cross" && !def.opaque && !def.solid && def.supportFace === NO_SUPPORT &&
      isProp(COBWEB),
    `${def.model} solid=${def.solid} supportFace=${def.supportFace}`,
  );
  // **`replaceable` を付けないこと** —— 付けると、置いた巣の上にブロックを置いた
  // 拍子に `placeSpot()` が狙ったマス自身を返して黙って消える（草むらとの違い）。
  check(
    "replaceable ではない（草むらとの違い。置いた巣が黙って消えない）",
    !def.replaceable && isReplaceable(TALL_GRASS),
    `巣 ${def.replaceable} / 草むら ${isReplaceable(TALL_GRASS)}`,
  );
  // 硬さ 0 にすると素手で一瞬で消える（草むらと同じになってしまう）。
  check(
    "硬さは 1.2（草むらの 0 とは違って、素手では時間が掛かる）",
    def.hardness === 1.2 && def.variantOf === AIR && def.sound === "wool",
    `hardness ${def.hardness} / sound ${def.sound}`,
  );

  // --- 一覧に並ぶ色（既存のどれとも見分けが付くこと） ---
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === COBWEB) continue;
    const gap = dist(itemColor(COBWEB), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: クモの巣 0x${itemColor(COBWEB).toString(16)} ↔ ${who} ${best.toFixed(1)}`,
  );
  check(
    "クモの巣は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
}

/**
 * 金のリンゴ（アイテム 153）。**ブロックは 1 つも増えていません** ——
 * 見るのはリンゴ（149）と同じ持ち物としての 3 点と色、それに
 * **この表で唯一の 2 つ（`heal` と `alwaysEdible`）が付いているか**です。
 *
 * **食べたときに体力がどう動くかは `test/vitals.test.ts`**（あちらが `Vitals` を回します）。
 * ここで見るのは**表の値そのもの**だけ。
 */
function goldenApples(): void {
  describe("金のリンゴ");

  const food = foodOf(GOLDEN_APPLE);
  console.log(
    `      金のリンゴ(${GOLDEN_APPLE}) 「${itemName(GOLDEN_APPLE)}」 置ける ${placedBlock(GOLDEN_APPLE) !== AIR}` +
      ` / 道具 ${toolOf(GOLDEN_APPLE) !== null} / 1 枠 ${itemStackLimit(GOLDEN_APPLE)} 個` +
      ` / 食べ物 空腹 +${food?.hunger} 満腹度 +${food?.saturation} 毒 ${food?.poison}` +
      ` 回復 ${food?.heal} 満腹でも ${food?.alwaysEdible}`,
  );
  check(
    "金のリンゴは置けず・道具でもない",
    placedBlock(GOLDEN_APPLE) === AIR && toolOf(GOLDEN_APPLE) === null,
    `block ${placedBlock(GOLDEN_APPLE)} / tool ${toolOf(GOLDEN_APPLE)}`,
  );
  // **器が戻る食べ物ではない**ので 1 枠 64 個（シチューの `stack: 1` と混ぜないこと）。
  check(
    "1 枠 64 個まで積める（器が戻る食べ物ではない）",
    itemStackLimit(GOLDEN_APPLE) === 64 && emptyAfterEating(GOLDEN_APPLE) === NO_ITEM,
    `${itemStackLimit(GOLDEN_APPLE)} 個 / 戻る器 ${emptyAfterEating(GOLDEN_APPLE)}`,
  );
  // 本家の値（4 / 9.6）。**満腹度は焼き豚 12.8 に届かない**ので、腹を満たす目的では
  // 今までどおり焼き豚がいちばん強い（強さの並びは動いていない）。
  check(
    "食べると空腹 +4 / 満腹度 +9.6 で毒なし",
    food !== null && food.hunger === 4 && food.saturation === 9.6 && !food.poison,
    food === null ? "食べ物ではない" : `${food.hunger} / ${food.saturation} / 毒 ${food.poison}`,
  );
  // **この 2 つが付いているのは金のリンゴだけ** —— 他の 10 行に付くと、
  // 満腹の門が消える（`alwaysEdible`）か、食べるだけで体力が戻る（`heal`）。
  check(
    "体力が 4 戻り、満腹でも食べられる",
    food !== null && food.heal === 4 && food.alwaysEdible === true,
    food === null ? "食べ物ではない" : `回復 ${food.heal} / 満腹でも ${food.alwaysEdible}`,
  );
  const special = allFoodIds().filter((id) => {
    const f = foodOf(id);
    return f !== null && (f.heal !== undefined || f.alwaysEdible !== undefined);
  });
  console.log(`      heal / alwaysEdible を持つ食べ物: ${special.map((id) => itemName(id)).join(" / ")}`);
  check(
    "heal と alwaysEdible を持つのは金のリンゴだけ（既存の 10 行は書き換えていない）",
    special.length === 1 && special[0] === GOLDEN_APPLE,
    special.map((id) => `${id} ${itemName(id)}`).join(" / ") || "0 個",
  );
  // 伸ばし忘れるとクリエイティブの一覧にだけ出てこない（`rules/items-survival.md`）。
  // **上限そのものはクモの巣（154）へ移った**ので、ここで見るのは「金のリンゴが
  // 一覧に届いている」ことと「上限がそこまで下がっていない」ことの 2 つ ——
  // **番号ちょうどの突き合わせは共有帯の一覧（38 個）の側**が持っている
  // （同じ値に `=== A` と `!== B` を並べると `tsc` が落ちる。`rules/testing.md`）。
  check(
    "MAX_ITEM_ID は金のリンゴまで届いている（一覧にも出る）",
    MAX_ITEM_ID >= GOLDEN_APPLE && allItemIds().includes(GOLDEN_APPLE),
    `MAX_ITEM_ID ${MAX_ITEM_ID} / 一覧に ${allItemIds().includes(GOLDEN_APPLE)}`,
  );

  // **一覧に並ぶ色は、既存のどれとも見分けが付くこと。** 金色は思ったより混んでいる
  // （金インゴット 0xf2d15c・ブレイズパウダー 0xe8a33d・ブレイズロッド）ので、
  // いちばん近い相手を出してから判定する。
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === GOLDEN_APPLE) continue;
    const gap = dist(itemColor(GOLDEN_APPLE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: 金のリンゴ 0x${itemColor(GOLDEN_APPLE).toString(16)} ↔ ${who} ${best.toFixed(1)}`,
  );
  check(
    "金のリンゴは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  // **ブロックは 1 つも増えていない** —— `blocks.ts` に `def()` を足すと立方体が増え、
  // 153 番のブロックができる（`blockDef()` は知らない番号で AIR を返す）。
  check(
    "153 番のブロックは無い（ブロックを 1 つも増やしていない）",
    !BLOCKS.some((b) => b.id === GOLDEN_APPLE) && blockDef(GOLDEN_APPLE).id === AIR,
    `blockDef(${GOLDEN_APPLE}) = ${blockDef(GOLDEN_APPLE).name}`,
  );
}

/**
 * 紙（150）・本（151）・本棚（152）。**レシピは `test/crafting.test.ts`**、
 * ここで見るのは持ち物と形と落ちるものの 4 つです。
 *
 * **本棚の落とし物が唯一の面白いところ**です —— `variantOf` を書いていないので
 * 既定なら「掘ると自分が 1 個」に落ち着くところを、`DROPS` の 1 行で
 * **本 3 個に差し替えて**あります（板 6 個は戻らない）。**確率にも 2 本目の乱数にも
 * 繋がっていない**ことを 9 通りで見ます。
 */
function paperBookBookshelf(): void {
  describe("紙・本・本棚");

  // --- 持ち物としての 3 つ（値を出してから判定する） ---
  const trio: [string, number][] = [["紙", PAPER], ["本", BOOK], ["本棚", BOOKSHELF]];
  for (const [name, id] of trio) {
    console.log(
      `      ${name}(${id}): 名前「${itemName(id)}」/ 置ける ${placedBlock(id)} / ` +
        `道具 ${toolOf(id) !== null} / 食べ物 ${foodOf(id) !== null} / ` +
        `1 枠 ${itemStackLimit(id)} 個 / 色 0x${itemColor(id).toString(16)}`,
    );
  }
  // **紙と本は置けません**（`block: AIR`）。**本棚だけは自分に戻ります** ——
  // ブロック側の for が同じ番号のアイテムを作るからで、`items.ts` には 1 行も無い。
  check(
    "紙と本は置けず、本棚だけが置けて自分に戻る",
    placedBlock(PAPER) === AIR && placedBlock(BOOK) === AIR && placedBlock(BOOKSHELF) === BOOKSHELF,
    `紙 ${placedBlock(PAPER)} / 本 ${placedBlock(BOOK)} / 本棚 ${placedBlock(BOOKSHELF)}`,
  );
  // **道具でないこと**（`tool:` を付けると `TOOL_ATTACK` に無い種類が入って NaN）。
  check(
    "3 つとも道具ではない",
    trio.every(([, id]) => toolOf(id) === null),
    trio.map(([name, id]) => `${name} ${toolOf(id) === null ? "-" : String(toolOf(id)?.kind)}`).join(" / "),
  );
  // **食べ物でもない** —— 種類の数も一緒に見る（`FOODS` に足すと増える。クモの目で 12 種へ数え直した）。
  check(
    "3 つとも食べ物ではなく、食べられるものは 12 種（クモの目で 11 種から 12 種になった）",
    trio.every(([, id]) => foodOf(id) === null) && allFoodIds().length === 12,
    `${trio.map(([name, id]) => `${name} ${foodOf(id) === null ? "-" : "食べ物"}`).join(" / ")} / ${allFoodIds().length} 種`,
  );
  check(
    "3 つとも 1 枠 64 個まで積める（器が戻る食べ物ではない）",
    trio.every(([, id]) => itemStackLimit(id) === 64),
    trio.map(([name, id]) => `${name} ${itemStackLimit(id)}`).join(" / "),
  );

  // --- 一覧に並ぶ色（既存のどれとも見分けが付くこと） ---
  // **白と茶はもう混み合っています** —— 雪玉・羽根・卵・砂糖／板・原木・はしごが居るので、
  // 素直な「紙の白」も「木の茶」も 20 を割ります。**いちばん近い相手を出してから判定する。**
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  for (const [name, id] of trio) {
    let best = Infinity;
    let who = "";
    for (const other of allItemIds()) {
      if (other === id) continue;
      const gap = dist(itemColor(id), itemColor(other));
      if (gap < best) {
        best = gap;
        who = itemName(other);
      }
    }
    console.log(`      色のいちばん近い相手: ${name} 0x${itemColor(id).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
    check(
      `${name}は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）`,
      best >= 20,
      `いちばん近い ${who} と ${best.toFixed(1)}`,
    );
  }
  // **一覧に出るのは `top` だけ** —— 側面（本の背）は判定に入らないので、
  // 入れ替わっていないことをここで別に見る（絵で見るのは `npm run shot -- bookshelf`）。
  const shelf = blockDef(BOOKSHELF);
  console.log(
    `      本棚の面の色: 上 0x${shelf.top.toString(16)} / 側 0x${shelf.side.toString(16)} / ` +
      `下 0x${shelf.bottom.toString(16)} / 一覧 0x${itemColor(BOOKSHELF).toString(16)}`,
  );
  check(
    "本棚は上下が木口・側面が本の背で、一覧の色は上面のほう",
    shelf.top === 0xd0a878 && shelf.bottom === 0xd0a878 && shelf.side === 0x9c5064 &&
      itemColor(BOOKSHELF) === shelf.top,
    `上 0x${shelf.top.toString(16)} / 側 0x${shelf.side.toString(16)} / 下 0x${shelf.bottom.toString(16)}`,
  );

  // --- 本棚は普通の立方体（`boxes` も `model` も書いていない） ---
  const boxes = collisionBoxes(BOOKSHELF);
  const faces: [string, number][] = [
    ["+X", FACE_XP], ["-X", FACE_XN], ["+Y", FACE_YP],
    ["-Y", FACE_YN], ["+Z", FACE_ZP], ["-Z", FACE_ZN],
  ];
  console.log(
    `      本棚の形: model ${shelf.model} / variantOf ${shelf.variantOf} / isProp ${isProp(BOOKSHELF)} / ` +
      `箱 ${boxes.length} 個 ${JSON.stringify(boxes)} / 硬さ ${shelf.hardness} / 道具 ${shelf.tool} / ` +
      `階層 ${shelf.minTier} / 音 ${shelf.sound} / 支え ${faces.map(([n, f]) => `${n}:${canSupport(BOOKSHELF, f)}`).join(" ")}`,
  );
  check(
    "本棚は 1x1x1 の立方体 1 個で、向き違いではない",
    !isProp(BOOKSHELF) && shelf.model === "cube" && shelf.variantOf === AIR &&
      boxes.length === 1 && boxes[0].join(",") === "0,0,0,1,1,1",
    `isProp ${isProp(BOOKSHELF)} / ${shelf.model} / 箱 ${boxes.length} 個`,
  );
  check(
    "本棚は 6 面とも支えになる（松明もベッドも置ける）",
    faces.every(([, f]) => canSupport(BOOKSHELF, f)),
    faces.map(([n, f]) => `${n}:${canSupport(BOOKSHELF, f)}`).join(" "),
  );
  check(
    "本棚は硬さ 1.5・斧が適正・素手でも壊せて木の音（本家の値）",
    shelf.hardness === 1.5 && shelf.tool === "axe" && shelf.minTier === TIER_HAND && shelf.sound === "wood",
    `硬さ ${shelf.hardness} / ${shelf.tool} / 階層 ${shelf.minTier} / ${shelf.sound}`,
  );
  check(
    "本棚は不透明で通り抜けられない（普通の立方体の既定のまま）",
    shelf.opaque && shelf.solid && !shelf.replaceable && !shelf.translucent,
    `opaque ${shelf.opaque} / solid ${shelf.solid} / replaceable ${shelf.replaceable}`,
  );

  // --- 壊すと本 3 個（板 6 個は戻らない） ---
  // **`roll` と `extraRoll` を 9 通りに振っても同じ 1 山**であることが、
  // 「確率にも 2 本目の乱数にも繋がっていない」の証拠。
  const rolls = [0.01, 0.5, 0.99];
  const results: string[] = [];
  let sameEveryTime = true;
  for (const roll of rolls) {
    for (const extraRoll of rolls) {
      const stacks = rollDrops(BOOKSHELF, roll, extraRoll);
      results.push(`${roll}/${extraRoll}→${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし"}`);
      if (stacks.length !== 1 || stacks[0]?.item !== BOOK || stacks[0]?.count !== 3) sameEveryTime = false;
    }
  }
  console.log(`      本棚を壊す 9 通り: ${results.join(" / ")}`);
  check(
    "本棚は roll も extraRoll も何であれ本 3 個の 1 山（確率にも 2 本目の乱数にも繋がっていない）",
    sameEveryTime,
    results.join(" / "),
  );
  // **板は 1 枚も戻りません**（本家どおり。「戻す」レシピも足していない）。
  const shelfDrop = rollDrop(BOOKSHELF, 0.5);
  check(
    "本棚を壊しても板は 1 枚も戻らず、本棚そのものも落ちない",
    shelfDrop.item === BOOK && shelfDrop.count === 3 && dropOf(BOOKSHELF).item === BOOK,
    `${itemName(shelfDrop.item)} x${shelfDrop.count}`,
  );
}

/**
 * リンゴ（アイテム 149）。**ブロックは 1 つも増えていません** ——
 * オークの葉の 2 山目として落ちるだけです。
 *
 * **ここで守りたいのは「棒とリンゴが別々に当たる」の 1 点**です。乱数が 1 本に
 * 戻ると（`extraRoll` を落とす・`roll` を使い回す）、棒が出た葉からだけリンゴが出る
 * 形になり、**下の 4 通りの表が `1,2,0,1` でなくなります。**
 */
function apples(): void {
  describe("リンゴ");

  // --- 何が落ちるか（値を出してから判定する） ---
  const cases: [string, number, number, number][] = [
    ["オークの葉・棒当たり + リンゴ当たり", LEAVES, 0.05, 0.001],
    ["オークの葉・棒外し + リンゴ当たり", LEAVES, 0.5, 0.001],
    ["オークの葉・棒当たり + リンゴ外し", LEAVES, 0.05, 0.9],
    ["オークの葉・両方外し", LEAVES, 0.5, 0.9],
    ["針葉樹の葉・棒当たり + リンゴの帯の目（0.001）", SPRUCE_LEAVES, 0.05, 0.001],
  ];
  for (const [label, id, roll, extraRoll] of cases) {
    const stacks = rollDrops(id, roll, extraRoll);
    console.log(
      `      ${label}: ${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし"}`,
    );
  }

  const both = rollDrops(LEAVES, 0.05, 0.001);
  check(
    "棒もリンゴも当たると 2 山（棒 1 + リンゴ 1）",
    both.length === 2 && both[0]?.item === STICK && both[0]?.count === 1 &&
      both[1]?.item === APPLE && both[1]?.count === 1,
    both.map((s) => `${itemName(s.item)} x${s.count}`).join(" + "),
  );
  // **1 山目を外してもリンゴは出る** —— これが「相関していない」の一番強い証拠。
  const appleOnly = rollDrops(LEAVES, 0.5, 0.001);
  check(
    "棒を外してもリンゴは落ちる（1 山目の当たり外れと無関係）",
    appleOnly.length === 1 && appleOnly[0]?.item === APPLE,
    appleOnly.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし",
  );
  const stickOnly = rollDrops(LEAVES, 0.05, 0.9);
  check(
    "リンゴを外すと棒だけ（葉の 10% は今までどおり）",
    stickOnly.length === 1 && stickOnly[0]?.item === STICK,
    stickOnly.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし",
  );
  // **リンゴの帯（0..0.005）の目でも、針葉樹の葉からはリンゴが出ない。**
  // 30a で 2 山目に苗木が入ったので「1 山だけ」では測れなくなった（苗木が出る）——
  // **判定をゆるめるのではなく、「どの山もリンゴでない」に置き換えてある。**
  const spruce = rollDrops(SPRUCE_LEAVES, 0.05, 0.001);
  check(
    "針葉樹の葉からはリンゴが出ない（本家はオークとダークオークだけ）",
    spruce.every((s) => s.item !== APPLE) && spruce[0]?.item === STICK,
    spruce.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし",
  );

  // --- **2 本の乱数が独立している**（1 本では作れない表） ---
  // 乱数を 1 本に戻すと、棒を外した目（0.5）ではリンゴも必ず外れるので
  // **3 つ目が 0 山、4 つ目も 0 山**になり、この表は `1,2,0,0` に潰れます。
  const table = [
    rollDrops(LEAVES, 0.05, 0.9).length,
    rollDrops(LEAVES, 0.05, 0.001).length,
    rollDrops(LEAVES, 0.5, 0.9).length,
    rollDrops(LEAVES, 0.5, 0.001).length,
  ];
  console.log(`      4 通りの山の数（棒当/棒外 × リンゴ外/当）: ${table.join(",")}`);
  check(
    "2 本の乱数は独立している（4 通りの山の数が 1,2,0,1）",
    table.join(",") === "1,2,0,1",
    table.join(","),
  );

  // --- アイテムとしての形（革・羽根・糸と同じ 3 点 + 食べ物） ---
  const food = foodOf(APPLE);
  console.log(
    `      リンゴ(${APPLE}) 「${itemName(APPLE)}」 置ける ${placedBlock(APPLE) !== AIR}` +
      ` / 道具 ${toolOf(APPLE) !== null} / 1 枠 ${itemStackLimit(APPLE)} 個` +
      ` / 食べ物 空腹 +${food?.hunger} 満腹度 +${food?.saturation} 毒 ${food?.poison}`,
  );
  check(
    "リンゴは置けず・道具でもない",
    placedBlock(APPLE) === AIR && toolOf(APPLE) === null,
    `block ${placedBlock(APPLE)} / tool ${toolOf(APPLE)}`,
  );
  // 本家の値（4 / 2.4）。**パン 5 / 6 には届かない**ので、畑を作る理由は消えていない。
  check(
    "食べると空腹 +4 / 満腹度 +2.4 で毒なし",
    food !== null && food.hunger === 4 && food.saturation === 2.4 && !food.poison,
    food === null ? "食べ物ではない" : `${food.hunger} / ${food.saturation} / 毒 ${food.poison}`,
  );
  // **食べ物の数も見張ること** —— `FOODS` に 1 行足したことが数で出る唯一の足場。
  console.log(`      食べられるもの ${allFoodIds().length} 種`);
  check(
    "食べられるものが 11 種から 12 種になった（クモの目）",
    allFoodIds().length === 12,
    `${allFoodIds().length} 種`,
  );

  // **一覧に並ぶ色は、既存のどれとも見分けが付くこと。** 赤が既に 2 つある
  // （赤キノコ 0xc9403a・生牛肉 0xc8564f）ので、いちばん近い相手を出してから判定する。
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === APPLE) continue;
    const gap = dist(itemColor(APPLE), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(`      色のいちばん近い相手: リンゴ 0x${itemColor(APPLE).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
  check(
    "リンゴは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
}

/**
 * はしご（145..148）。**壁掛けの松明を写した形**なので、ここで見るのは
 * 「写し間違えていないか」「アイテムが 1 個だけか」「掘ると大元が落ちるか」の 3 つ。
 * **置く経路と支えを失う経路は `test/placing.test.ts`、レシピは
 * `test/crafting.test.ts`**（あちらは本物の `World` を通します）。
 *
 * **まだ登れません**（掴まる物理は 19b）。ここでは `solid: false` だけを見ます。
 */
function ladders(): void {
  describe("はしご");

  // **6 面ぶんを並べて出してから判定する。** 表を並べ替えたときに、どの面が
  // どこへ行ったかが出力だけで分かる。
  const faces: [string, number][] = [
    ["+X", FACE_XP],
    ["-X", FACE_XN],
    ["+Y（天井）", FACE_YP],
    ["-Y（床）", FACE_YN],
    ["+Z", FACE_ZP],
    ["-Z", FACE_ZN],
  ];
  console.log(
    `      ladderVariant(): ${faces.map(([n, f]) => `${n}→${ladderVariant(f)}`).join(" / ")}`,
  );
  check(
    "壁の 4 面それぞれに別の向きが返る",
    ladderVariant(FACE_XP) === LADDER && ladderVariant(FACE_XN) === LADDER_XN &&
      ladderVariant(FACE_ZP) === LADDER_ZP && ladderVariant(FACE_ZN) === LADDER_ZN,
    faces.map(([n, f]) => `${n}:${ladderVariant(f)}`).join(" "),
  );
  // **床と天井は AIR。** 松明との唯一の違いがここなので、1 件として持つ。
  check(
    "床にも天井にも付かない（松明との違い）",
    ladderVariant(FACE_YP) === AIR && ladderVariant(FACE_YN) === AIR &&
      torchVariant(FACE_YN) === TORCH,
    `天井 ${ladderVariant(FACE_YP)} / 床 ${ladderVariant(FACE_YN)} / 松明の床 ${torchVariant(FACE_YN)}`,
  );

  // 向き違いは大元に寄る（アイテムもドロップも名前も増えない）。
  const variants: [string, number, number][] = [
    ["-X", LADDER_XN, FACE_XN],
    ["+Z", LADDER_ZP, FACE_ZP],
    ["-Z", LADDER_ZN, FACE_ZN],
  ];
  console.log(
    `      向き違い: ${variants.map(([n, id]) => `${n}=${id} variantOf ${blockDef(id).variantOf}`).join(" / ")}` +
      `  大元 ${LADDER} variantOf ${blockDef(LADDER).variantOf}`,
  );
  check(
    "146..148 の variantOf は 145（大元は AIR のまま）",
    variants.every(([, id]) => blockDef(id).variantOf === LADDER) &&
      blockDef(LADDER).variantOf === AIR,
    variants.map(([, id]) => blockDef(id).variantOf).join(" "),
  );

  // **アイテムは 1 個だけ。** 向き違いにアイテムが付くと、一覧に「はしご」が 4 個並ぶ。
  const named = allItemIds().filter((id) => itemName(id) === blockName(LADDER));
  console.log(`      アイテム一覧の「${blockName(LADDER)}」: ${named.length} 個 [${named.join(" ")}]`);
  check(
    "アイテム一覧に「はしご」は 1 個だけ（145）",
    named.length === 1 && named[0] === LADDER,
    named.join(" "),
  );

  // 掘ると 4 つとも大元が 1 個（`DROPS` に 1 行も書いていないので、既定の
  // `baseBlock()` がそのまま出る）。
  const drops = [LADDER, LADDER_XN, LADDER_ZP, LADDER_ZN].map((id) => rollDrop(id, 0.5));
  console.log(`      掘ると: ${drops.map((d) => `${d.item} x${d.count}`).join(" / ")}`);
  check(
    "4 向きとも掘ると 145 が 1 個",
    drops.every((d) => d.item === LADDER && d.count === 1),
    drops.map((d) => `${d.item} x${d.count}`).join(" "),
  );

  // 形と性質。**厚さ 3/16 の板が支えの側に貼り付く**こと（裏返っていると、
  // 壁の中に埋まったはしごになる）。
  const boxes: [string, number, number, number][] = [
    // [名前, id, 見る軸の添字(0=x,2=z), 支えのある側が +か]
    ["+X", LADDER, 0, 1],
    ["-X", LADDER_XN, 0, 0],
    ["+Z", LADDER_ZP, 2, 1],
    ["-Z", LADDER_ZN, 2, 0],
  ];
  console.log(
    `      箱: ${boxes.map(([n, id]) => `${n}=[${blockDef(id).boxes[0].join(",")}]`).join(" / ")}`,
  );
  check(
    "板は支えのある側に厚さ 3/16 で貼り付く",
    boxes.every(([, id, axis, positive]) => {
      const box = blockDef(id).boxes[0];
      const min = box[axis];
      const max = box[axis + 3];
      return positive ? min === 0.8125 && max === 1 : min === 0 && max === 0.1875;
    }),
    boxes.map(([n, id]) => `${n}:${blockDef(id).boxes[0].join(",")}`).join(" "),
  );
  // **通り抜けられる**（`solid: false`）。登る物理は 19b なので、ここでは
  // 「素通りする板」であることだけを押さえる。
  const defs = [LADDER, LADDER_XN, LADDER_ZP, LADDER_ZN].map((id) => blockDef(id));
  console.log(
    `      性質: solid ${defs.map((d) => d.solid).join("/")} / opaque ${defs.map((d) => d.opaque).join("/")} / ` +
      `硬さ ${defs.map((d) => d.hardness).join("/")} / 音 ${defs[0].sound} / 道具 ${defs[0].tool}`,
  );
  check(
    "4 向きとも通り抜けられて・不透明でなく・斧で 0.4",
    defs.every((d) => !d.solid && !d.opaque && d.hardness === 0.4 && d.tool === "axe" &&
      d.sound === "wood" && d.model === "boxes"),
    defs.map((d) => `${d.id}:${d.solid}/${d.opaque}/${d.hardness}`).join(" "),
  );
  // **`replaceable` も `stacksOnSelf` も付いていないこと**（前者は狙ったマス自身に
  // 置かれ、後者は壁の無い所へ積み上がる）。
  check(
    "replaceable も stacksOnSelf も付いていない",
    defs.every((d) => !d.replaceable && !stacksOnSelf(d.id)),
    defs.map((d) => `${d.id}:${d.replaceable}/${stacksOnSelf(d.id)}`).join(" "),
  );
  // はしご自身は支えになれない（薄い板なので `canSupport()` を通らない）。
  check(
    "はしごの上には松明を置けない",
    !canSupport(LADDER, FACE_YP) && !supportsBlock(LADDER, FACE_YP, TORCH),
    `canSupport ${canSupport(LADDER, FACE_YP)}`,
  );
}

/**
 * ツタ（183..186・34a + 34b）。**はしごの節とまったく同じ形で見る** —— 壁掛け 4 向きの
 * 表・向き違いの寄せ先・アイテム 1 個・掘ると大元・箱の貼り付き、の 5 つ。
 *
 * **はしごと違うのは 4 つだけ**なので、そこは名指しで見る:
 * **厚さ 1/16（はしごは 3/16）**・**硬さ 0.2 と草の音**・**`bladed` の旗**・
 * **`hangsBelow` の旗（真上のツタにぶら下がる。34b）**。
 * **刃物でだけ落ちること自体は `cobwebs()` の数え直しと `test/mining.test.ts`**、
 * **一覧の色は `test/items.test.ts`** が見ている（ここは形と旗の表だけ）。
 *
 * **34b のぶんは末尾**（支えの候補の表・`vineVariant()` の 2 つ目の引数・
 * `supportsBlock()` の真理値表・**本物の `World` での連鎖**）。`Slab` は
 * `breakUnsupported()` を持たないので、連鎖だけはここで `world` を通す。
 */
function vines(world: World, ground: number): void {
  describe("ツタ（壁掛け 4 向き + 下へ垂れる）");

  // **4 つの定義を並べて出してから判定する。** 番号と supportFace の対応が
  // ずれたときに、出力だけでどこが動いたか読める。
  const all = [VINE, VINE_XN, VINE_ZP, VINE_ZN];
  const defs = all.map((id) => blockDef(id));
  console.log(
    `      def: ${defs.map((d) => `${d.id}:${d.name} supportFace=${d.supportFace} variantOf=${d.variantOf}`).join(" / ")}`,
  );

  // **6 面ぶんを並べて出してから判定する**（はしごの節と同じ理由）。
  const faces: [string, number][] = [
    ["+X", FACE_XP],
    ["-X", FACE_XN],
    ["+Y（天井）", FACE_YP],
    ["-Y（床）", FACE_YN],
    ["+Z", FACE_ZP],
    ["-Z", FACE_ZN],
  ];
  console.log(
    `      vineVariant(): ${faces.map(([n, f]) => `${n}→${vineVariant(f)}`).join(" / ")}`,
  );
  check(
    "壁の 4 面それぞれに別の向きが返る",
    vineVariant(FACE_XP) === VINE && vineVariant(FACE_XN) === VINE_XN &&
      vineVariant(FACE_ZP) === VINE_ZP && vineVariant(FACE_ZN) === VINE_ZN,
    faces.map(([n, f]) => `${n}:${vineVariant(f)}`).join(" "),
  );
  // **床と「ツタでない天井」は AIR**（支えの中身を渡さない呼び方は 34a のまま）。
  check(
    "床にも付かず、ツタ以外の天井にも付かない",
    vineVariant(FACE_YP) === AIR && vineVariant(FACE_YN) === AIR &&
      torchVariant(FACE_YN) === TORCH,
    `天井 ${vineVariant(FACE_YP)} / 床 ${vineVariant(FACE_YN)} / 松明の床 ${torchVariant(FACE_YN)}`,
  );
  // **置けない理由の文も表から出ていること**（`supportHint()`）。「床か壁」のままだと嘘。
  console.log(
    `      supportHint: ツタ「${supportHint(VINE)}」 / はしご「${supportHint(LADDER)}」 / ` +
      `松明「${supportHint(TORCH)}」 / 苗木「${supportHint(SAPLING)}」`,
  );
  check(
    "置けない理由の文は「壁」（松明の「床か壁」・苗木の「土か草の上」とは別）",
    supportHint(VINE) === "壁" && supportHint(TORCH) === "床か壁" &&
      supportHint(SAPLING) === "土か草の上",
    `ツタ「${supportHint(VINE)}」`,
  );
  // **置く経路も通しで見る**（`placedVariant()` に 1 行足したのがここに出る）。
  check(
    "placedVariant() が支えの向きから 4 向きを出す",
    placedVariant(VINE, { support: FACE_XN, hitY: 0.5, facing: FACE_XP }) === VINE_XN &&
      placedVariant(VINE, { support: FACE_ZP, hitY: 0.5, facing: FACE_XP }) === VINE_ZP &&
      placedVariant(VINE, { support: FACE_YN, hitY: 0, facing: FACE_XP }) === AIR,
    `-X→${placedVariant(VINE, { support: FACE_XN, hitY: 0.5, facing: FACE_XP })} ` +
      `床→${placedVariant(VINE, { support: FACE_YN, hitY: 0, facing: FACE_XP })}`,
  );

  // 向き違いは大元に寄る（アイテムもドロップも名前も増えない）。
  check(
    "184..186 の variantOf と baseBlock() は 183（大元は AIR のまま）",
    [VINE_XN, VINE_ZP, VINE_ZN].every((id) => blockDef(id).variantOf === VINE) &&
      [VINE_XN, VINE_ZP, VINE_ZN].every((id) => baseBlock(id) === VINE) &&
      blockDef(VINE).variantOf === AIR && baseBlock(VINE) === VINE,
    all.map((id) => `${id}→${baseBlock(id)}`).join(" "),
  );

  // **アイテムは 1 個だけ**（向き違いに付くと一覧に「ツタ」が 4 個並ぶ）。
  const named = allItemIds().filter((id) => itemName(id) === blockName(VINE));
  console.log(`      アイテム一覧の「${blockName(VINE)}」: ${named.length} 個 [${named.join(" ")}]`);
  check(
    "アイテム一覧に「ツタ」は 1 個だけ（183）",
    named.length === 1 && named[0] === VINE,
    named.join(" "),
  );

  // 掘ると 4 つとも大元が 1 個（`DROPS` に 1 行も書いていないので、既定の
  // `baseBlock()` がそのまま出る）。**刃物でないと 1 個も落ちないのは
  // `canHarvest()` の側**なので、そちらは `test/mining.test.ts`。
  const drops = all.map((id) => rollDrop(id, 0.5));
  console.log(`      掘ると: ${drops.map((d) => `${d.item} x${d.count}`).join(" / ")}`);
  check(
    "4 向きとも掘ると 183 が 1 個",
    drops.every((d) => d.item === VINE && d.count === 1),
    drops.map((d) => `${d.item} x${d.count}`).join(" "),
  );

  // 形。**厚さ 1/16 の板が支えの側に貼り付く**こと（裏返っていると壁に埋まる）。
  // **はしごの 3/16 と並べて出すこと** —— 同じ定数を撒くと厚さが一緒に動く。
  const boxes: [string, number, number, number][] = [
    // [名前, id, 見る軸の添字(0=x,2=z), 支えのある側が +か]
    ["+X", VINE, 0, 1],
    ["-X", VINE_XN, 0, 0],
    ["+Z", VINE_ZP, 2, 1],
    ["-Z", VINE_ZN, 2, 0],
  ];
  console.log(
    `      箱: ${boxes.map(([n, id]) => `${n}=[${blockDef(id).boxes[0].join(",")}]`).join(" / ")}` +
      `  はしご +X=[${blockDef(LADDER).boxes[0].join(",")}]`,
  );
  check(
    "板は支えのある側に厚さ 1/16 で貼り付く（はしごの 3/16 より薄い）",
    boxes.every(([, id, axis, positive]) => {
      const box = blockDef(id).boxes[0];
      const min = box[axis];
      const max = box[axis + 3];
      return positive ? min === 0.9375 && max === 1 : min === 0 && max === 0.0625;
    }) && blockDef(LADDER).boxes[0][0] === 0.8125,
    boxes.map(([n, id]) => `${n}:${blockDef(id).boxes[0].join(",")}`).join(" "),
  );

  // 性質。**はしごと違うのは硬さと音だけ**（道具はどちらも斧 —— あれは「掘る速さ」の
  // 表で、落ちるかどうかは `bladed` の側が決める）。
  console.log(
    `      性質: solid ${defs.map((d) => d.solid).join("/")} / opaque ${defs.map((d) => d.opaque).join("/")} / ` +
      `硬さ ${defs.map((d) => d.hardness).join("/")} / 音 ${defs[0].sound} / 道具 ${defs[0].tool} / ` +
      `model ${defs[0].model}（はしごは硬さ ${blockDef(LADDER).hardness} / 音 ${blockDef(LADDER).sound}）`,
  );
  check(
    "4 向きとも通り抜けられて・不透明でなく・斧で 0.2・草の音",
    defs.every((d) => !d.solid && !d.opaque && d.hardness === 0.2 && d.tool === "axe" &&
      d.sound === "grass" && d.model === "boxes") &&
      all.every((id) => isProp(id)),
    defs.map((d) => `${d.id}:${d.solid}/${d.opaque}/${d.hardness}/${d.sound}`).join(" "),
  );
  // **旗は 2 つだけ**（登れる・刃物でだけ落ちる）。**残り 6 つは 4 向きとも偽**で、
  // 対照に石・草むら・はしごを並べる（「いつも真」の実装がここを素通りしないため）。
  const flags: [string, (id: number) => boolean][] = [
    ["climbable", isClimbable],
    ["bladed", isBladed],
    ["stacksOnSelf", stacksOnSelf],
    ["needsSoil", needsSoil],
    ["needsSand", needsSand],
    ["needsBank", needsBank],
    ["needsWater", needsWater],
    ["replaceable", isReplaceable],
    ["slippery", isSlippery],
    ["sticky", isSticky],
    ["spiky", isSpiky],
  ];
  for (const [name, fn] of flags)
    console.log(
      `      ${name}: ツタ ${all.map((id) => fn(id)).join("/")}` +
        `  ｜ 石 ${fn(STONE)} / 草むら ${fn(TALL_GRASS)} / はしご ${fn(LADDER)}`,
    );
  check(
    "4 向きとも登れて・刃物でだけ落ちる（石・草むら・はしごは登れない側の対照）",
    all.every((id) => isClimbable(id) && isBladed(id)) &&
      !isClimbable(STONE) && !isClimbable(TALL_GRASS) && isClimbable(LADDER) &&
      !isBladed(LADDER) && !isBladed(STONE),
    all.map((id) => `${id}:${isClimbable(id)}/${isBladed(id)}`).join(" "),
  );
  check(
    "stacksOnSelf も needsSoil も needsSand も needsBank も needsWater も replaceable も slippery も sticky も spiky も付いていない",
    all.every((id) =>
      !stacksOnSelf(id) && !needsSoil(id) && !needsSand(id) && !needsBank(id) &&
      !needsWater(id) && !isReplaceable(id) &&
      !isSlippery(id) && !isSticky(id) && !isSpiky(id)) &&
      isReplaceable(TALL_GRASS),
    all.map((id) => `${id}:${stacksOnSelf(id)}/${needsSoil(id)}/${isReplaceable(id)}`).join(" "),
  );
  // ツタ自身は支えになれない（薄い板なので `canSupport()` を通らない）。
  check(
    "ツタの上には松明を置けない",
    all.every((id) => !canSupport(id, FACE_YP) && !supportsBlock(id, FACE_YP, TORCH)),
    `canSupport ${canSupport(VINE, FACE_YP)}`,
  );

  // --- 下へ垂れる（34b） -----------------------------------------------------
  // **支えの候補が 2 つになるだけ**で、`supportFace` は壁のまま（`hangsBelow` の旗）。
  // **4 向きぶんと、対照（はしご・松明・苗木・石）を並べて出してから判定する。**
  console.log(
    `      supportFaces: ${all.map((id) => `${id}→[${supportFaces(id).join(",")}]`).join(" / ")}` +
      `  ｜ はしご [${supportFaces(LADDER).join(",")}] / 松明 [${supportFaces(TORCH).join(",")}] / ` +
      `苗木 [${supportFaces(SAPLING).join(",")}] / 石 [${supportFaces(STONE).join(",")}]`,
  );
  check(
    "4 向きとも支えの候補は [壁, +Y] の 2 つ（supportFace は壁のまま）",
    all.every((id) => {
      const faces = supportFaces(id);
      return faces.length === 2 && faces[0] === blockDef(id).supportFace && faces[1] === FACE_YP;
    }) && supportFaces(VINE_XN)[0] === FACE_XN,
    all.map((id) => `${id}:[${supportFaces(id).join(",")}]`).join(" "),
  );
  check(
    "はしご・松明・苗木は候補 1 つのまま / 石は 0 個（hangsBelow はツタ 4 つだけ）",
    supportFaces(LADDER).length === 1 && supportFaces(TORCH).length === 1 &&
      supportFaces(SAPLING).length === 1 && supportFaces(STONE).length === 0 &&
      all.every((id) => hangsBelow(id)) &&
      ![LADDER, LADDER_XN, TORCH, SAPLING, STONE, SUGAR_CANE].some((id) => hangsBelow(id)),
    `はしご ${supportFaces(LADDER).length} / 松明 ${supportFaces(TORCH).length} / ` +
      `苗木 ${supportFaces(SAPLING).length} / 石 ${supportFaces(STONE).length}`,
  );
  // **上と同じ向きをそのまま写すこと**（垂れた列の途中で板の側が入れ替わらない）。
  const ceilings: [string, number][] = [
    ["ツタ+X", VINE],
    ["ツタ-X", VINE_XN],
    ["ツタ+Z", VINE_ZP],
    ["ツタ-Z", VINE_ZN],
    ["石", STONE],
    ["はしご", LADDER],
    ["空気", AIR],
  ];
  console.log(
    `      vineVariant(+Y, 真上): ${ceilings.map(([n, id]) => `${n}→${vineVariant(FACE_YP, id)}`).join(" / ")}`,
  );
  check(
    "真上がツタなら同じ向きが返る（4 向きとも）",
    all.every((id) => vineVariant(FACE_YP, id) === id),
    all.map((id) => `${id}→${vineVariant(FACE_YP, id)}`).join(" "),
  );
  check(
    "ツタ以外の天井には付かない（石・はしご・空気・引数なしは AIR）",
    vineVariant(FACE_YP, STONE) === AIR && vineVariant(FACE_YP, LADDER) === AIR &&
      vineVariant(FACE_YP, AIR) === AIR && vineVariant(FACE_YP) === AIR,
    `石 ${vineVariant(FACE_YP, STONE)} / はしご ${vineVariant(FACE_YP, LADDER)} / ` +
      `空気 ${vineVariant(FACE_YP, AIR)}`,
  );
  // **`supportsBlock()` の 1 行は `face` を見ていること** —— 見ないと横のツタにも
  // 貼り付いて、空中へ横に伸びていきます。**`canSupport()` はゆるめていない。**
  // **石の天井は `canSupport()` がそのまま通す**（ゆるめても狭めてもいない）——
  // だから「石の下に垂れたツタは落ちない」が、**手では置けない**
  // （`vineVariant(FACE_YP, STONE)` が AIR。上の判定）。2 つは別の話で、
  // **落ちるかどうかは `canPlaceAt()`、置けるかどうかは表**が決める。
  const hangCases: [string, number, number, number, boolean][] = [
    ["ツタの真下のツタ（向き違い）", VINE_XN, FACE_YN, VINE_ZP, true],
    ["ツタの真下の同じ向き", VINE_XN, FACE_YN, VINE_XN, true],
    ["ツタの横のツタ", VINE_XN, FACE_XN, VINE_ZP, false],
    ["ツタの真下のはしご", VINE_XN, FACE_YN, LADDER, false],
    ["石の真下のツタ（canSupport がそのまま通る）", STONE, FACE_YN, VINE_XN, true],
    ["空気の真下のツタ", AIR, FACE_YN, VINE_XN, false],
  ];
  console.log(
    `      supportsBlock(支え, face, 置くもの): ` +
      hangCases.map(([n, s, f, i]) => `${n} ${supportsBlock(s, f, i)}`).join(" / ") +
      `  （canSupport(ツタ, -Y) は ${canSupport(VINE_XN, FACE_YN)} のまま）`,
  );
  for (const [name, supporter, face, id, want] of hangCases) {
    check(
      `${name}は${want ? "ぶら下がれる" : "付かない"}`,
      supportsBlock(supporter, face, id) === want,
      `${supportsBlock(supporter, face, id)}`,
    );
  }
  check(
    "石の天井は「支えになる」が「置く向き」は出ない（手では置けない。置く経路は表が止める）",
    supportsBlock(STONE, FACE_YN, VINE_XN) && vineVariant(FACE_YP, STONE) === AIR,
    `supportsBlock ${supportsBlock(STONE, FACE_YN, VINE_XN)} / vineVariant ${vineVariant(FACE_YP, STONE)}`,
  );
  check(
    "canSupport はゆるめていない（ツタは 6 面とも支えになれない）",
    all.every((id) => [0, 1, 2, 3, 4, 5].every((f) => !canSupport(id, f))),
    `-Y ${canSupport(VINE_XN, FACE_YN)} / +Y ${canSupport(VINE_XN, FACE_YP)}`,
  );
  // **置く経路も通しで見る**（`placedVariant()` は `ctx.supporter` を渡すだけ）。
  check(
    "placedVariant() は真上のツタから同じ向きを出す（supporter 省略なら AIR）",
    placedVariant(VINE, { support: FACE_YP, hitY: 0, facing: FACE_XP, supporter: VINE_ZP }) === VINE_ZP &&
      placedVariant(VINE, { support: FACE_YP, hitY: 0, facing: FACE_XP, supporter: STONE }) === AIR &&
      placedVariant(VINE, { support: FACE_YP, hitY: 0, facing: FACE_XP }) === AIR,
    `ツタ+Z の下→${placedVariant(VINE, { support: FACE_YP, hitY: 0, facing: FACE_XP, supporter: VINE_ZP })} / ` +
      `石の下→${placedVariant(VINE, { support: FACE_YP, hitY: 0, facing: FACE_XP, supporter: STONE })}`,
  );

  // **本物の `World` で壁に 1 マス + ぶら下がり 2 マスを作り、壁を壊す**
  // （`Slab` は `breakUnsupported` を持たないので、連鎖はここでしか見られない。
  // 手本はサトウキビの 3 段積み）。置く側だけ直して壊す側を `supportFace()` 1 本の
  // ままにすると、**垂らせるのに壁を壊しても垂れたぶんが宙に残る。**
  {
    const bx = 9;
    const bz = 9;
    const by = ground + 5;
    // 周りを空にしてから使う（地形なりだと壁の裏に土が残って支えが増える）。
    for (let y = by - 4; y <= by + 1; y++) {
      for (let x = bx - 1; x <= bx + 2; x++) {
        for (let z = bz - 1; z <= bz + 1; z++) world.setVoxel(x, y, z, AIR);
      }
    }
    world.setVoxel(bx, by, bz, STONE); // 壁は 1 マスだけ（真横の列は空のまま）
    // **上から順に置くこと** —— `setVoxel()` は `canPlaceAt()` を通るので、
    // 下から置くと真上が空で 1 マスも書けない。
    const hung = [0, 1, 2].map((k) => world.setVoxel(bx + 1, by - k, bz, VINE_XN));
    console.log(
      `      壁 ${bx},${by},${bz} + ツタ 3 マス: 置けた ${hung.join(",")} / 中身 ` +
        [0, 1, 2].map((k) => world.getVoxel(bx + 1, by - k, bz)).join(","),
    );
    check(
      "壁のツタの下に 2 マスぶら下げられる（真下に壁は無い）",
      hung.every((ok) => ok) &&
        [0, 1, 2].every((k) => world.getVoxel(bx + 1, by - k, bz) === VINE_XN) &&
        world.getVoxel(bx, by - 1, bz) === AIR,
      `置けた ${hung.join(",")} / 壁の下 ${world.getVoxel(bx, by - 1, bz)}`,
    );

    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, broken) => { if (baseBlock(broken) === VINE) broke++; };
    world.setVoxel(bx, by, bz, AIR); // 壁を壊す
    console.log(
      `      壁を壊したあと: 合図 ${broke} 回 / 中身 ` +
        [0, 1, 2].map((k) => world.getVoxel(bx + 1, by - k, bz)).join(","),
    );
    check(
      "壁を壊すとぶら下がった 2 マスも落ちる（合図が 3 回）",
      broke === 3 && [0, 1, 2].every((k) => world.getVoxel(bx + 1, by - k, bz) === AIR),
      `合図 ${broke} 回 / 中身 ${[0, 1, 2].map((k) => world.getVoxel(bx + 1, by - k, bz)).join(",")}`,
    );
    world.onAutoBreak = undefined;
  }
}

/**
 * サトウキビ（ブロック 143）と砂糖（アイテム 144）。**サトウキビはキノコの定義を
 * 写した生えもの**なので、ここで見るのは「写し間違えていないか」「掘ると自分が
 * 落ちるか」「砂糖が持ち物として正しいか」「一覧の色で見分けが付くか」の 4 つ。
 * **どこに生えるか（浜）と何段で立つかは `test/worldgen.test.ts`、
 * レシピは `test/crafting.test.ts`、置く経路は `test/placing.test.ts`。**
 *
 * **積める（18b）ぶんの見張りもここ**: `supportsBlock()` の真理値表と、
 * 本物の `World` で 3 段積んで下を壊す経路。
 */
function sugarCane(world: World, ground: number): void {
  describe("サトウキビと砂糖");

  const d = blockDef(SUGAR_CANE);
  const dropped = rollDrop(SUGAR_CANE, 0.5);
  console.log(
    `      サトウキビ(${SUGAR_CANE}): model ${d.model} / variantOf ${d.variantOf} / 硬さ ${d.hardness} / ` +
      `色 0x${d.top.toString(16)} / 通り抜け ${!d.solid} / 上書きされる ${isReplaceable(SUGAR_CANE)} / ` +
      `支え ${d.supportFace} / 箱 ${JSON.stringify(d.boxes)} / ` +
      `掘ると ${itemName(dropped.item)} x${dropped.count} / アイテム名「${itemName(SUGAR_CANE)}」`,
  );
  // **キノコと同じ 6 点。ただし `replaceable` だけは逆**（18b で外した）。
  // `variantOf` を書くとアイテムが作られない（一覧にも持ち物にも出ない）。
  //
  // **`replaceable` が付いていると永久に積めない** —— `placeSpot()` が狙ったマス
  // 自身を返すので、上面を狙っても 1 本目に重なり、`setVoxel` が「同じ値」で
  // false を返す。**苗（`WHEAT_CROP`）と同じ側**で、草むら・キノコとは逆。
  check(
    "サトウキビは十字・通り抜けられる・硬さ 0・向き違いではない",
    d.model === "cross" && !d.solid && !d.opaque && d.hardness === 0 && d.variantOf === AIR,
    `model ${d.model} / solid ${d.solid} / opaque ${d.opaque} / ` +
      `硬さ ${d.hardness} / variantOf ${d.variantOf}`,
  );
  check(
    "サトウキビは上書きされない（積むために外した。苗と同じ側・草むらとは逆）",
    !isReplaceable(SUGAR_CANE) && !isReplaceable(WHEAT_CROP) && isReplaceable(TALL_GRASS),
    `サトウキビ ${isReplaceable(SUGAR_CANE)} / 苗 ${isReplaceable(WHEAT_CROP)} / ` +
      `草むら ${isReplaceable(TALL_GRASS)}`,
  );
  check(
    "サトウキビの支えは真下（浮いたまま残らない）",
    d.supportFace === FACE_YN,
    `supportFace ${d.supportFace}`,
  );
  // **箱の上端は 1（`CROSS_BOX` の 0.8 ではない）。** 積めるようにする 18b で、
  // 上端 0.8 のままだと 2 本目との継ぎ目が 0.2 マス空く。
  const box = d.boxes[0];
  check(
    "サトウキビの箱は上端がマスいっぱい（CANE_BOX。CROSS_BOX の 0.8 ではない）",
    d.boxes.length === 1 && box[4] === 1 && box[1] === 0 && box[0] === 0.1 && box[3] === 0.9,
    `${JSON.stringify(d.boxes)}（草むらは ${JSON.stringify(blockDef(TALL_GRASS).boxes)}）`,
  );
  check(
    "サトウキビは掘ると自分が 1 個落ちる（DROPS に 1 行も要らない）",
    dropped.item === SUGAR_CANE && dropped.count === 1 && rollDrops(SUGAR_CANE, 0.5, 0.9).length === 1 &&
      itemName(SUGAR_CANE) === "サトウキビ" && placedBlock(SUGAR_CANE) === SUGAR_CANE,
    `${itemName(dropped.item)} x${dropped.count}（山 ${rollDrops(SUGAR_CANE, 0.5, 0.9).length} 個）`,
  );

  // **砂糖は置けず・道具でもなく・食べ物でもない**（革・羽根・糸と同じ 3 点）。
  // `block` を付ければ置ける砂糖になり、`tool:` を付ければ `TOOL_ATTACK` に無い
  // 種類が入って NaN、`FOODS` に足せば食べられる砂糖になる（どれも型では止まらない）。
  console.log(
    `      砂糖(${SUGAR}) 「${itemName(SUGAR)}」 置ける ${placedBlock(SUGAR) !== AIR}` +
      ` / 道具 ${toolOf(SUGAR) !== null} / 食べ物 ${foodOf(SUGAR) !== null}` +
      ` / 1 枠 ${itemStackLimit(SUGAR)} 個`,
  );
  check(
    "砂糖は置けず・道具でもなく・食べ物でもない",
    placedBlock(SUGAR) === AIR && toolOf(SUGAR) === null && foodOf(SUGAR) === null,
    `block ${placedBlock(SUGAR)} / tool ${toolOf(SUGAR)} / food ${foodOf(SUGAR)}`,
  );

  // **一覧に並ぶ色は、既存の 107 種のどれとも見分けが付くこと。**
  // 白っぽいものが混んでいるので砂糖のほうが際どい（雪から 22.3）。
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  const added = [SUGAR_CANE, SUGAR];
  const nearest: string[] = [];
  let worst = Infinity;
  for (const id of added) {
    let best = Infinity;
    let who = "";
    for (const other of allItemIds()) {
      if (other === id || added.includes(other)) continue;
      const gap = dist(itemColor(id), itemColor(other));
      if (gap < best) {
        best = gap;
        who = itemName(other);
      }
    }
    nearest.push(`${itemName(id)} 0x${itemColor(id).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
    if (best < worst) worst = best;
  }
  console.log(`      色のいちばん近い相手: ${nearest.join(" / ")}`);
  check(
    "サトウキビも砂糖も、既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    worst >= 20,
    `いちばん近い組で ${worst.toFixed(1)}`,
  );

  // --- 積める（18b） ---
  // **支えの表は `supportsBlock()` 1 本。** `canSupport()` の側はゆるめていない
  // （松明とベッドの足場）ので、**十字の上に十字**は今までどおり断られる。
  // **4 通りを 1 行に出してから判定する。**
  const supportCases: [string, number, number][] = [
    ["サトウキビの上のサトウキビ", SUGAR_CANE, SUGAR_CANE],
    ["サトウキビの上の松明", SUGAR_CANE, TORCH],
    ["石の上のサトウキビ（45 で置けなくなった）", STONE, SUGAR_CANE],
    ["空気の上のサトウキビ", AIR, SUGAR_CANE],
  ];
  console.log(
    `      supportsBlock(真下, FACE_YP, 置くもの): ` +
      supportCases
        .map(([n, s, i]) => `${n} ${supportsBlock(s, FACE_YP, i)}`)
        .join(" / ") +
      `  （canSupport(サトウキビ, FACE_YP) は ${canSupport(SUGAR_CANE, FACE_YP)} のまま）`,
  );
  check(
    "サトウキビの上のサトウキビは置ける（canSupport はゆるめていない）",
    supportsBlock(SUGAR_CANE, FACE_YP, SUGAR_CANE) && !canSupport(SUGAR_CANE, FACE_YP) &&
      stacksOnSelf(SUGAR_CANE),
    `supportsBlock ${supportsBlock(SUGAR_CANE, FACE_YP, SUGAR_CANE)} / ` +
      `canSupport ${canSupport(SUGAR_CANE, FACE_YP)} / stacksOnSelf ${stacksOnSelf(SUGAR_CANE)}`,
  );
  check(
    "サトウキビの上の松明は置けない・石の上のサトウキビは置けない（45）・空気の上は置けない",
    !supportsBlock(SUGAR_CANE, FACE_YP, TORCH) && !supportsBlock(STONE, FACE_YP, SUGAR_CANE) &&
      !supportsBlock(AIR, FACE_YP, SUGAR_CANE) && !stacksOnSelf(TALL_GRASS),
    `松明 ${supportsBlock(SUGAR_CANE, FACE_YP, TORCH)} / 石 ${supportsBlock(STONE, FACE_YP, SUGAR_CANE)} / ` +
      `空気 ${supportsBlock(AIR, FACE_YP, SUGAR_CANE)} / 草むら stacksOnSelf ${stacksOnSelf(TALL_GRASS)}`,
  );

  // **本物の `World` で 3 段積んで、いちばん下を壊す**（偽の試験場は
  // `breakUnsupported` を持たない。手本は上の小麦の節）。置く側だけを
  // `supportsBlock()` にして壊す側を `canSupport()` のまま残すと、
  // **積めるのに下を壊しても上 2 段が宙に残る。**
  {
    const cx = 5;
    const cz = 5;
    world.setVoxel(cx, ground - 1, cz, SAND);
    // **水辺に立てる**（45。根元の砂の横 +X に水を 1 つ）。判定と回数は変えない。
    world.setVoxel(cx + 1, ground - 1, cz, WATER);
    for (let y = ground; y < ground + 5; y++) world.setVoxel(cx, y, cz, AIR);
    let stacked = 0;
    for (let k = 0; k < 3; k++) {
      if (world.setVoxel(cx, ground + k, cz, SUGAR_CANE)) stacked++;
    }
    console.log(
      `      3 段積み: 置けたのは ${stacked} 段 / 中身 ` +
        [0, 1, 2, 3].map((k) => world.getVoxel(cx, ground + k, cz)).join(","),
    );
    check(
      "砂の上にサトウキビを 3 段積める",
      stacked === 3 && world.getVoxel(cx, ground + 2, cz) === SUGAR_CANE &&
        world.getVoxel(cx, ground + 3, cz) === AIR,
      `${stacked} 段 / 3 段目 ${world.getVoxel(cx, ground + 2, cz)}`,
    );

    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === SUGAR_CANE) broke++; };
    world.setVoxel(cx, ground, cz, AIR); // いちばん下を壊す
    check(
      "いちばん下を壊すと上 2 段も落ちる（合図が 2 回）",
      broke === 2 && world.getVoxel(cx, ground + 1, cz) === AIR &&
        world.getVoxel(cx, ground + 2, cz) === AIR,
      `合図 ${broke} 回 / 2 段目 ${world.getVoxel(cx, ground + 1, cz)} / ` +
        `3 段目 ${world.getVoxel(cx, ground + 2, cz)}`,
    );
    world.onAutoBreak = undefined;
  }
}

/**
 * **サボテンを積む**（37・2026-09-20）。サボテンに `stacksOnSelf` を足したので、
 * 見るのは**サトウキビ（18b）とまったく同じ 2 つ**です:
 * `supportsBlock()` の真理値表と、**本物の `World` で 3 段積んで下を壊す**経路。
 *
 * **`canSupport(CACTUS, FACE_YP)` は false のまま**（サボテンの箱は 1/16 細いので
 * 「面が端まで埋まっている」を満たせません）。**あちらをゆるめて通さないこと** ——
 * 壁掛けの松明とベッドの足場です（`rules/blocks-shapes.md`）。
 *
 * **偽の試験場では確かめたことになりません** —— `crops.ts` の試験場（`test/crops.test.ts`
 * の `Field`）は `canPlaceAt` を持たないので、`stacksOnSelf` を足し忘れても緑のままです。
 */
function cactusStack(world: World, ground: number): void {
  describe("サボテンを積む");

  // g. **4 つの値を 1 行に出してから判定する**（サトウキビの節と同じ書き方）。
  console.log(
    `      supportsBlock(サボテン, FACE_YP, サボテン) ${supportsBlock(CACTUS, FACE_YP, CACTUS)} / ` +
      `canSupport(サボテン, FACE_YP) ${canSupport(CACTUS, FACE_YP)} / ` +
      `stacksOnSelf(サボテン) ${stacksOnSelf(CACTUS)} / ` +
      `supportsBlock(サボテン, FACE_YP, 松明) ${supportsBlock(CACTUS, FACE_YP, TORCH)}`,
  );
  check(
    "サボテンの上のサボテンは置ける（canSupport はゆるめていない・松明は刺さらない）",
    supportsBlock(CACTUS, FACE_YP, CACTUS) && !canSupport(CACTUS, FACE_YP) &&
      stacksOnSelf(CACTUS) && !supportsBlock(CACTUS, FACE_YP, TORCH),
    `supportsBlock ${supportsBlock(CACTUS, FACE_YP, CACTUS)} / ` +
      `canSupport ${canSupport(CACTUS, FACE_YP)} / stacksOnSelf ${stacksOnSelf(CACTUS)} / ` +
      `松明 ${supportsBlock(CACTUS, FACE_YP, TORCH)}`,
  );

  // h. **本物の `World` で 3 段積んで、いちばん下を壊す**（置く側だけを
  // `supportsBlock()` にして壊す側を `canSupport()` のまま残すと、
  // **積めるのに下を壊しても上 2 段が宙に残る**）。サトウキビの節と同じ形。
  {
    const cx = 7;
    const cz = 7;
    world.setVoxel(cx, ground - 1, cz, SAND);
    for (let y = ground; y < ground + 5; y++) world.setVoxel(cx, y, cz, AIR);
    let stacked = 0;
    for (let k = 0; k < 3; k++) {
      if (world.setVoxel(cx, ground + k, cz, CACTUS)) stacked++;
    }
    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === CACTUS) broke++; };
    world.setVoxel(cx, ground, cz, AIR); // いちばん下を壊す
    world.onAutoBreak = undefined;
    console.log(
      `      3 段積み: 置けたのは ${stacked} 段 / いちばん下を壊したあとの中身 ` +
        [0, 1, 2, 3].map((k) => world.getVoxel(cx, ground + k, cz)).join(",") +
        ` / 落ちた合図 ${broke} 回`,
    );
    check(
      "砂の上にサボテンを 3 段積めて、いちばん下を壊すと上 2 段も落ちる",
      stacked === 3 && broke === 2 && world.getVoxel(cx, ground + 1, cz) === AIR &&
        world.getVoxel(cx, ground + 2, cz) === AIR,
      `${stacked} 段 / 合図 ${broke} 回 / 2 段目 ${world.getVoxel(cx, ground + 1, cz)} / ` +
        `3 段目 ${world.getVoxel(cx, ground + 2, cz)}`,
    );
  }
}

/**
 * **サボテンは砂の上だけ**（44・2026-09-23）。苗木（30a）の `needsSoil` / `soil` と
 * まったく同じ形の 2 組目（`needsSand` / `sand`）で、効くのは `supportsBlock()` の 1 行。
 * **その 1 行は `stacksOnSelf` の行より後**なので、サボテンの上のサボテンは立ったまま。
 *
 * ここも**本物の `World`** で見ます（`crops.test.ts` の `Field` は `canPlaceAt` を持たない）。
 */
function cactusOnSand(world: World, ground: number): void {
  describe("サボテンは砂の上だけ（44）");

  // 表を出してから判定する。
  const sandNeeders = BLOCKS.filter((b) => needsSand(b.id)).map((b) => b.name);
  const sands = BLOCKS.filter((b) => isSand(b.id)).map((b) => b.name);
  const both = BLOCKS.filter((b) => needsSand(b.id) && needsSoil(b.id)).map((b) => b.name);
  console.log(
    `      needsSand: ${sandNeeders.join(",") || "なし"} / isSand: ${sands.join(",") || "なし"} / ` +
      `needsSand と needsSoil の両方: ${both.join(",") || "なし"}`,
  );
  check("needsSand が真なのはサボテンだけ",
    sandNeeders.length === 1 && needsSand(CACTUS), sandNeeders.join(","));
  check("isSand が真なのは砂だけ（砂岩は入らない）",
    sands.length === 1 && isSand(SAND) && !isSand(SANDSTONE), sands.join(","));
  check("needsSand と needsSoil が両方真のブロックは無い", both.length === 0, both.join(","));

  // 真理値表を 1 行に出してから判定する。
  const grounds: [string, number][] = [
    ["砂", SAND], ["草", GRASS], ["土", DIRT], ["石", STONE], ["砂岩", SANDSTONE], ["板", PLANK],
  ];
  const table = grounds.map(([n, id]) => [n, supportsBlock(id, FACE_YP, CACTUS)] as const);
  console.log(
    `      supportsBlock(〜, FACE_YP, サボテン): ${table.map(([n, v]) => `${n} ${v}`).join(" / ")}` +
      ` / サボテンの上 ${supportsBlock(CACTUS, FACE_YP, CACTUS)}`,
  );
  check("砂の上にはサボテンが立つ", supportsBlock(SAND, FACE_YP, CACTUS));
  check(
    "草・土・石・砂岩・板の上にはサボテンが立たない",
    table.slice(1).every(([, v]) => !v),
    table.map(([n, v]) => `${n}:${v}`).join(" "),
  );
  check("サボテンの上のサボテンは今までどおり立つ", supportsBlock(CACTUS, FACE_YP, CACTUS));

  // 対照: 苗木（30a）と松明（canSupport）の線が動いていない。
  console.log(
    `      対照: 苗木 草 ${supportsBlock(GRASS, FACE_YP, SAPLING)} / 砂 ${supportsBlock(SAND, FACE_YP, SAPLING)}` +
      ` / 松明 石 ${supportsBlock(STONE, FACE_YP, TORCH)}`,
  );
  check(
    "苗木は草の上に立ち砂の上には立たない・石の上の松明は立つ（対照）",
    supportsBlock(GRASS, FACE_YP, SAPLING) && !supportsBlock(SAND, FACE_YP, SAPLING) &&
      supportsBlock(STONE, FACE_YP, TORCH),
  );

  // 置けない理由の文。
  console.log(
    `      supportHint: サボテン「${supportHint(CACTUS)}」/ 苗木「${supportHint(SAPLING)}」/ 松明「${supportHint(TORCH)}」`,
  );
  check(
    "supportHint はサボテンが「砂の上」・苗木は「土か草の上」・松明は「床か壁」のまま",
    supportHint(CACTUS) === "砂の上" && supportHint(SAPLING) === "土か草の上" &&
      supportHint(TORCH) === "床か壁",
  );

  // 本物の `World` で置く・下を置き換える。
  {
    const cx = 9;
    const cz = 7;
    for (let y = ground; y < ground + 4; y++) world.setVoxel(cx, y, cz, AIR);
    world.setVoxel(cx, ground - 1, cz, GRASS);
    const onGrass = world.setVoxel(cx, ground, cz, CACTUS);
    const afterGrass = world.getVoxel(cx, ground, cz);
    world.setVoxel(cx, ground - 1, cz, SAND);
    const onSand = world.setVoxel(cx, ground, cz, CACTUS);
    const second = world.setVoxel(cx, ground + 1, cz, CACTUS);
    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === CACTUS) broke++; };
    world.setVoxel(cx, ground - 1, cz, DIRT); // 根元の砂を土に置き換える
    world.onAutoBreak = undefined;
    const after = [0, 1].map((k) => world.getVoxel(cx, ground + k, cz));
    console.log(
      `      World: 草の上 ${onGrass}（マス ${afterGrass}）/ 砂の上 ${onSand} / 2 段目 ${second} / ` +
        `砂を土にしたあと ${after.join(",")} / 落ちた合図 ${broke} 回`,
    );
    check("本物の World で草の上には置けず、マスは空気のまま", !onGrass && afterGrass === AIR);
    check("本物の World で砂の上には 2 段積める", onSand && second);
    check(
      "根元の砂を土に置き換えると 2 段とも落ちる",
      broke === 2 && after.every((v) => v === AIR),
      `合図 ${broke} 回 / ${after.join(",")}`,
    );
    world.setVoxel(cx, ground - 1, cz, GRASS);
  }
}

/**
 * **サトウキビは水辺だけ**（45・2026-09-24）。床は 3 組目の狭める表（`needsBank` / `bank`。
 * 草・土・砂）で `supportsBlock()` の 1 行、**横の水は `supportsBlock()` の外**で、
 * 判断は純関数 `waterBesideOk()`、読むのは `World.canPlaceAt()` の 1 か所だけ。
 * ここも**本物の `World`** で見ます（写しの `test/arena.ts` は `placing.test.ts` が見る）。
 */
/**
 * **本物の `World` でキノコが広がる（46）。** `test/crops.test.ts` の偽の `Field` は
 * `canPlaceAt` も本物の明るさも持たないので、「テストだけが緑」を止める 1 件
 * （`rules/stateful-blocks.md` のサボテンの件と同じ理由）。石で閉じた箱（中 3x2x3）の
 * 中では増え、屋根の無い地表（空 15）では増えない。
 */
function mushroomSpreadInWorld(world: World): void {
  describe("本物の World でキノコが広がる（46）");

  /** (cx, y, cz) を中心に x/z ±2・y ±2 の赤キノコの本数。 */
  const reds = (cx: number, y: number, cz: number): number => {
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) if (world.getVoxel(cx + dx, y + dy, cz + dz) === RED_MUSHROOM) n++;
      }
    }
    return n;
  };
  const lightAt = (x: number, y: number, z: number): string =>
    `空 ${world.getLight(x, y, z, SKY_LIGHT)}・ブロック ${world.getLight(x, y, z, BLOCK_LIGHT)}`;

  // 箱: 外 5x4x5（x 20..24・z -12..-8）、中 3x2x3。**中を先に空けてから壁と屋根を置く。**
  const bx = 22;
  const bz = -10;
  const by = world.surfaceY(bx, bz) + 3;
  for (let y = by - 1; y <= by + 2; y++) {
    for (let z = bz - 2; z <= bz + 2; z++) {
      for (let x = bx - 2; x <= bx + 2; x++) {
        const inside = Math.abs(x - bx) <= 1 && Math.abs(z - bz) <= 1 && y >= by && y <= by + 1;
        world.setVoxel(x, y, z, inside ? AIR : STONE);
      }
    }
  }
  const boxPlaced = world.setVoxel(bx, by, bz, RED_MUSHROOM);
  const boxCrops = new Crops();
  boxCrops.notePlaced({ x: bx, y: by, z: bz }, RED_MUSHROOM, world);
  const boxLight = lightAt(bx + 1, by, bz);
  boxCrops.update(MUSHROOM_SPREAD_SECONDS, world);
  const inBox = reds(bx, by, bz);

  // 対照: 屋根の無い地表の石の上（x 26..28 は箱から離す。上は 12 マス空ける）。
  const ox = 27;
  const oz = -10;
  const oy = world.surfaceY(ox, oz) + 1;
  for (let z = oz - 1; z <= oz + 1; z++) {
    for (let x = ox - 1; x <= ox + 1; x++) {
      world.setVoxel(x, oy - 1, z, STONE);
      for (let y = oy; y < oy + 12; y++) world.setVoxel(x, y, z, AIR);
    }
  }
  const openPlaced = world.setVoxel(ox, oy, oz, RED_MUSHROOM);
  const openCrops = new Crops();
  openCrops.notePlaced({ x: ox, y: oy, z: oz }, RED_MUSHROOM, world);
  const openLight = lightAt(ox + 1, oy, oz);
  openCrops.update(MUSHROOM_SPREAD_SECONDS, world);
  const inOpen = reds(ox, oy, oz);

  console.log(
    `      閉じた箱（y=${by}）: 置けた ${boxPlaced} / 隣の明るさ ${boxLight} / ${MUSHROOM_SPREAD_SECONDS} 秒後 ${inBox} 本` +
      ` / 地表（y=${oy}）: 置けた ${openPlaced} / 隣の明るさ ${openLight} / ${inOpen} 本`,
  );
  check(
    "石で閉じた箱の中では赤キノコが 2 本に増える",
    boxPlaced && inBox === 2 && boxCrops.count === 2,
    `${inBox} 本 / 覚えている ${boxCrops.count} 本 / ${boxLight}`,
  );
  check("屋根の無い地表（空 15）では 1 本のまま", openPlaced && inOpen === 1, `${inOpen} 本 / ${openLight}`);
}

function caneByWater(world: World, ground: number): void {
  describe("サトウキビは水辺だけ（45）");

  // 表を出してから判定する。
  const names = (f: (id: number) => boolean): string[] =>
    BLOCKS.filter((b) => f(b.id)).map((b) => b.name);
  const bankNeeders = names(needsBank);
  const banks = names(isBank);
  const waterNeeders = names(needsWater);
  const wets = names(wetsBank);
  const twoOrMore = names((id) =>
    [needsSoil(id), needsSand(id), needsBank(id)].filter(Boolean).length >= 2);
  console.log(
    `      needsBank: ${bankNeeders.join(",") || "なし"} / isBank: ${banks.join(",") || "なし"} / ` +
      `needsWater: ${waterNeeders.join(",") || "なし"} / wetsBank: ${wets.join(",") || "なし"} / ` +
      `狭める表が 2 つ以上: ${twoOrMore.join(",") || "なし"}`,
  );
  check("needsBank が真なのはサトウキビだけ",
    bankNeeders.length === 1 && needsBank(SUGAR_CANE), bankNeeders.join(","));
  check(
    "isBank が真なのは草・土・砂だけ（耕地・砂岩は入らない）",
    banks.length === 3 && isBank(GRASS) && isBank(DIRT) && isBank(SAND) &&
      !isBank(FARMLAND) && !isBank(SANDSTONE),
    banks.join(","),
  );
  check("needsWater が真なのはサトウキビだけ",
    waterNeeders.length === 1 && needsWater(SUGAR_CANE), waterNeeders.join(","));
  check("wetsBank が真なのは水だけ（溶岩・氷は入らない）",
    wets.length === 1 && wetsBank(WATER) && !wetsBank(LAVA) && !wetsBank(ICE), wets.join(","));
  check("needsSoil・needsSand・needsBank のうち 2 つ以上が真のブロックは無い",
    twoOrMore.length === 0, twoOrMore.join(","));

  // 真理値表を 1 行に出してから判定する（床だけ。水は下の `waterBesideOk`）。
  const grounds: [string, number][] = [
    ["草", GRASS], ["土", DIRT], ["砂", SAND],
    ["石", STONE], ["砂岩", SANDSTONE], ["耕地", FARMLAND], ["板", PLANK],
  ];
  const table = grounds.map(([n, id]) => [n, supportsBlock(id, FACE_YP, SUGAR_CANE)] as const);
  console.log(
    `      supportsBlock(〜, FACE_YP, サトウキビ): ${table.map(([n, v]) => `${n} ${v}`).join(" / ")}` +
      ` / サトウキビの上 ${supportsBlock(SUGAR_CANE, FACE_YP, SUGAR_CANE)}`,
  );
  check("草・土・砂の上にはサトウキビが立つ", table.slice(0, 3).every(([, v]) => v),
    table.map(([n, v]) => `${n}:${v}`).join(" "));
  check("石・砂岩・耕地・板の上にはサトウキビが立たない", table.slice(3).every(([, v]) => !v),
    table.map(([n, v]) => `${n}:${v}`).join(" "));
  check("サトウキビの上のサトウキビは今までどおり立つ", supportsBlock(SUGAR_CANE, FACE_YP, SUGAR_CANE));
  console.log(
    `      対照: 苗木 草 ${supportsBlock(GRASS, FACE_YP, SAPLING)} / 砂 ${supportsBlock(SAND, FACE_YP, SAPLING)}` +
      ` ｜ サボテン 砂 ${supportsBlock(SAND, FACE_YP, CACTUS)} / 草 ${supportsBlock(GRASS, FACE_YP, CACTUS)}`,
  );
  check(
    "苗木（草 真・砂 偽）とサボテン（砂 真・草 偽）は動いていない（対照）",
    supportsBlock(GRASS, FACE_YP, SAPLING) && !supportsBlock(SAND, FACE_YP, SAPLING) &&
      supportsBlock(SAND, FACE_YP, CACTUS) && !supportsBlock(GRASS, FACE_YP, CACTUS),
  );

  // `waterBesideOk` の表を出してから判定する。
  const A = AIR;
  const cases: [string, boolean, boolean][] = [
    ["横に水 1 つ", waterBesideOk(SUGAR_CANE, SAND, [A, WATER, A, A]), true],
    ["横が全部空気", waterBesideOk(SUGAR_CANE, SAND, [A, A, A, A]), false],
    ["横が溶岩だけ", waterBesideOk(SUGAR_CANE, SAND, [LAVA, LAVA, A, A]), false],
    ["横が氷だけ", waterBesideOk(SUGAR_CANE, SAND, [ICE, A, A, A]), false],
    ["真下がサトウキビ（積んだ段）", waterBesideOk(SUGAR_CANE, SUGAR_CANE, [A, A, A, A]), true],
    ["松明（水を見ない）", waterBesideOk(TORCH, STONE, [A, A, A, A]), true],
  ];
  console.log(`      waterBesideOk: ${cases.map(([n, v]) => `${n} ${v}`).join(" / ")}`);
  check("waterBesideOk の 6 通りが期待どおり", cases.every(([, v, want]) => v === want),
    cases.filter(([, v, want]) => v !== want).map(([n]) => n).join(","));

  // 置けない理由の文。
  console.log(
    `      supportHint: サトウキビ「${supportHint(SUGAR_CANE)}」/ 苗木「${supportHint(SAPLING)}」/ ` +
      `サボテン「${supportHint(CACTUS)}」`,
  );
  check(
    "supportHint はサトウキビが「水辺の土・草・砂の上」・苗木とサボテンはそのまま",
    supportHint(SUGAR_CANE) === "水辺の土・草・砂の上" && supportHint(SAPLING) === "土か草の上" &&
      supportHint(CACTUS) === "砂の上",
  );

  // 本物の `World` で置く。根元 (cx, ground, cz)・床 (cx, ground-1, cz)。
  {
    const cx = 11;
    const cz = 11;
    const clear = (): void => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          world.setVoxel(cx + dx, ground - 1, cz + dz, SAND);
          for (let y = ground; y < ground + 4; y++) world.setVoxel(cx + dx, y, cz + dz, AIR);
        }
      }
    };
    clear();
    const dry = world.setVoxel(cx, ground, cz, SUGAR_CANE);
    const dryCell = world.getVoxel(cx, ground, cz);
    world.setVoxel(cx + 1, ground - 1, cz + 1, WATER); // 斜めだけ
    const diagonal = world.setVoxel(cx, ground, cz, SUGAR_CANE);
    clear();
    world.setVoxel(cx + 1, ground, cz, WATER); // 1 段上（根元と同じ高さ）だけ
    const above = world.setVoxel(cx, ground, cz, SUGAR_CANE);
    clear();
    world.setVoxel(cx - 1, ground - 1, cz, WATER); // 床の横 -X
    const wet = world.setVoxel(cx, ground, cz, SUGAR_CANE);
    const second = world.setVoxel(cx, ground + 1, cz, SUGAR_CANE);
    const third = world.setVoxel(cx, ground + 2, cz, SUGAR_CANE);
    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === SUGAR_CANE) broke++; };
    world.setVoxel(cx, ground - 1, cz, STONE); // 根元の砂を石に置き換える
    world.onAutoBreak = undefined;
    const after = [0, 1, 2].map((k) => world.getVoxel(cx, ground + k, cz));
    console.log(
      `      World: 水の無い砂 ${dry}（マス ${dryCell}）/ 斜めだけ水 ${diagonal} / 1 段上だけ水 ${above} / ` +
        `水辺の砂 ${wet}・2 段目 ${second}・3 段目 ${third} / 砂を石にしたあと ${after.join(",")} / ` +
        `落ちた合図 ${broke} 回`,
    );
    check("本物の World で水の無い砂には置けず、マスは空気のまま", !dry && dryCell === AIR);
    check("斜めだけに水・1 段上だけに水では置けない", !diagonal && !above);
    check("水辺の砂には 1 段目が置けて 3 段まで積める", wet && second && third);
    check(
      "根元の砂を石に置き換えると 3 段とも落ちる（合図 3 回）",
      broke === 3 && after.every((v) => v === AIR),
      `合図 ${broke} 回 / ${after.join(",")}`,
    );
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) world.setVoxel(cx + dx, ground - 1, cz + dz, GRASS);
    }
  }
}

/**
 * ボウル（141）・キノコシチュー（142）。**どちらも置けないアイテム**なので、
 * ここで見るのは「持ち物としての形」と「一覧で見分けが付くか」の 2 つ。
 * **食べたときの値は `test/vitals.test.ts`、レシピは `test/crafting.test.ts`。**
 */
function bowlAndStew(): void {
  describe("ボウルとキノコシチュー");

  // **4 点を 1 行に出してから判定する**（雪玉・ミルクバケツと同じ書き方）。
  // `block` を付ければ置けるボウルになり、`tool:` を付ければ `TOOL_ATTACK` に
  // 無い種類が入って NaN、`FOODS` の側を取り違えれば器のほうが食べられる。
  const carried: [string, number, boolean][] = [
    ["ボウル", BOWL, false],
    ["キノコシチュー", MUSHROOM_STEW, true],
  ];
  for (const [name, id, edible] of carried) {
    console.log(
      `      ${name}(${id}): 置くと ${placedBlock(id)}（AIR=${AIR}） / 道具 ${toolOf(id) ? "あり" : "null"} / ` +
        `食べ物 ${foodOf(id) ? `空腹 +${foodOf(id)?.hunger}` : "null"} / 1 枠 ${itemStackLimit(id)} 個`,
    );
    check(
      `${name}は置けず・道具でもない`,
      placedBlock(id) === AIR && toolOf(id) === null,
      `${placedBlock(id)} / ${toolOf(id) ? "道具" : "null"}`,
    );
    check(
      `${name}は${edible ? "食べられる" : "食べ物ではない（器そのものは食べない）"}`,
      (foodOf(id) !== null) === edible,
      `${foodOf(id) ? "食べ物" : "null"}`,
    );
  }
  // **シチューが 1 枠 1 個なのは不変条件**（手触りではない）。食べ切ったあとに
  // `inventory.setSelected(BOWL, 1)` で器を戻すので、2 個以上積めると
  // **1 個食べただけで残りの山ごとボウル 1 個に潰れる**（`src/items.ts` のコメント）。
  check(
    "キノコシチューは 1 枠 1 個（ボウルは 64 個）",
    itemStackLimit(MUSHROOM_STEW) === 1 && itemStackLimit(BOWL) === 64,
    `シチュー ${itemStackLimit(MUSHROOM_STEW)} / ボウル ${itemStackLimit(BOWL)}`,
  );
  // **食べ切ると戻るものは `items.ts` の表 1 本**（`main.ts` はこれを引くだけ）。
  console.log(
    `      emptyAfterEating: シチュー → ${itemName(emptyAfterEating(MUSHROOM_STEW)) || "無し"} / ` +
      `ボウル → ${itemName(emptyAfterEating(BOWL)) || "無し"} / パン → ${itemName(emptyAfterEating(BREAD)) || "無し"}`,
  );
  check(
    "シチューを食べ切るとボウルが戻る",
    emptyAfterEating(MUSHROOM_STEW) === BOWL,
    `${emptyAfterEating(MUSHROOM_STEW)}`,
  );
  // **器を持たない食べ物からは何も戻らない。** ここが `NO_ITEM` でないと、
  // パンを食べただけで手の中に知らないものが湧く。
  {
    const wrong = allItemIds().filter((id) => id !== MUSHROOM_STEW && emptyAfterEating(id) !== NO_ITEM);
    check("器が戻るのはシチューだけ", wrong.length === 0, wrong.map((id) => itemName(id)).join(" "));
  }

  // **一覧（DOM）は撮れないので、色の隔たりが唯一の足場。** 並んで見える 4 つ
  // （材料のキノコ 2 種と、器と中身）は**どの 2 つも RGB で 60 以上**。
  const shades: [string, number][] = [
    ["赤キノコ", itemColor(RED_MUSHROOM)],
    ["茶キノコ", itemColor(BROWN_MUSHROOM)],
    ["ボウル", itemColor(BOWL)],
    ["キノコシチュー", itemColor(MUSHROOM_STEW)],
  ];
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  const pairs: string[] = [];
  let closest = Infinity;
  for (let i = 0; i < shades.length; i++) {
    for (let j = i + 1; j < shades.length; j++) {
      const d = dist(shades[i][1], shades[j][1]);
      pairs.push(`${shades[i][0]}↔${shades[j][0]} ${d.toFixed(0)}`);
      closest = Math.min(closest, d);
    }
  }
  console.log(
    `      色: ${shades.map(([n, c]) => `${n} 0x${c.toString(16)}`).join(" / ")}  隔たり: ${pairs.join(" / ")}`,
  );
  check("材料と出来上がりの 4 つはどの 2 つも見分けられる（RGB で 60 以上）", closest >= 60, `いちばん近い組で ${closest.toFixed(1)}`);
  // **一覧は 105 種を超えて密なので、全体からは 20 以上で十分**（`HANDOFF.md` の実測）。
  // ここを 40 に上げると、取れるのは目に痛い原色だけになる。
  {
    const near: string[] = [];
    for (const id of [BOWL, MUSHROOM_STEW]) {
      let min = Infinity;
      let who = "";
      for (const other of allItemIds()) {
        if (other === id) continue;
        const d = dist(itemColor(id), itemColor(other));
        if (d < min) { min = d; who = itemName(other); }
      }
      console.log(`      ${itemName(id)} にいちばん近い既存の色は「${who}」で ${min.toFixed(1)}`);
      if (min < 20) near.push(`${itemName(id)}↔${who} ${min.toFixed(1)}`);
    }
    check("既存のどのアイテムの色からも 20 以上離れている", near.length === 0, near.join(" / "));
  }
}

/**
 * 赤キノコ（139）・茶キノコ（140）。**草むらの定義をそのまま写した生えもの**なので、
 * ここで見るのは「写し間違えていないか」と「絵で見分けが付くか」の 2 つ。
 * **どこに生えるか（森・針葉樹林）は `test/worldgen.test.ts`。**
 */
function mushrooms(): void {
  describe("キノコ 2 種（赤・茶）");

  const grown: [string, number][] = [
    ["赤キノコ", RED_MUSHROOM],
    ["茶キノコ", BROWN_MUSHROOM],
  ];
  for (const [name, block] of grown) {
    const d = blockDef(block);
    const dropped = rollDrop(block, 0.5);
    console.log(
      `      ${name}(${block}): model ${d.model} / variantOf ${d.variantOf} / 硬さ ${d.hardness} / ` +
        `色 0x${d.top.toString(16)} / 通り抜け ${!d.solid} / 上書きされる ${isReplaceable(block)} / ` +
        `掘ると ${itemName(dropped.item)} x${dropped.count} / アイテム名「${itemName(block)}」`,
    );
    check(
      `${name}は cross で、向き違いではない（アイテムが自動で付く）`,
      d.model === "cross" && d.variantOf === AIR,
      `${d.model} / variantOf ${d.variantOf}`,
    );
    check(
      `${name}は同じ番号のアイテムとして持てて、置くと自分に戻る`,
      itemName(block) === name && placedBlock(block) === block,
      `「${itemName(block)}」→ ${placedBlock(block)}`,
    );
    check(
      `${name}は掘ると自分が 1 個落ちる（DROPS に 1 行も要らない）`,
      dropped.item === block && dropped.count === 1 && rollDrops(block, 0.5, 0.9).length === 1,
      `${itemName(dropped.item)} x${dropped.count}（山 ${rollDrops(block, 0.5, 0.9).length} 個）`,
    );
    // **`replaceable` が無いと、`stampTree()` の `isReplaceable()` が偽になって
    // 森の木の葉がキノコに弾かれ、葉に穴が空く**（草むらとまったく同じ理由）。
    check(
      `${name}は上書きして置ける（木の葉が弾かれない）`,
      isReplaceable(block) && !d.solid && !d.opaque && d.hardness === 0,
      `replaceable ${isReplaceable(block)} / solid ${d.solid} / opaque ${d.opaque} / 硬さ ${d.hardness}`,
    );
    // 下の床が消えたら一緒に壊れる（草むらと同じ `supportFace: FACE_YN`）。
    check(
      `${name}は床が要る（浮いたまま残らない）`,
      d.supportFace === FACE_YN,
      `supportFace ${d.supportFace}`,
    );
  }

  // **3 つとも `cross` の板 1 枚なので、色が近いと絵で見分けが付かない。**
  // どの 2 つも RGB の距離で十分離れていること（`npm run shot` で見るときの唯一の足場）。
  const shades: [string, number][] = [
    ["草むら", blockDef(TALL_GRASS).top],
    ["赤キノコ", blockDef(RED_MUSHROOM).top],
    ["茶キノコ", blockDef(BROWN_MUSHROOM).top],
  ];
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  const pairs: string[] = [];
  let closest = Infinity;
  for (let i = 0; i < shades.length; i++) {
    for (let j = i + 1; j < shades.length; j++) {
      const d = dist(shades[i][1], shades[j][1]);
      pairs.push(`${shades[i][0]}↔${shades[j][0]} ${d.toFixed(0)}`);
      if (d < closest) closest = d;
    }
  }
  console.log(
    `      色: ${shades.map(([n, c]) => `${n} 0x${c.toString(16)}`).join(" / ")}` +
      `  隔たり: ${pairs.join(" / ")}`,
  );
  check(
    "草むら・赤・茶はどの 2 つも色で見分けられる（RGB で 60 以上）",
    closest >= 60,
    `いちばん近い組で ${closest.toFixed(1)}`,
  );
}

/**
 * 小麦の苗と種。**苗はアイテムを持たない**（一覧が増えるのは種の 1 枠だけ）ので、
 * 落ちるものは `DROPS` の 1 行が唯一の根拠になる。
 */
function wheatCrop(world: World, ground: number): void {
  describe("小麦の苗と種");

  // **`variantOf` は自分自身**（耕地の `variantOf: DIRT` と違って、大元にできる相手が居ない）。
  console.log(
    `      苗 ${WHEAT_CROP}（baseBlock ${baseBlock(WHEAT_CROP)} / アイテム "${itemName(WHEAT_CROP)}"）  ` +
      `種 ${WHEAT_SEEDS}（${itemName(WHEAT_SEEDS)}）  落ちるもの ${itemName(dropOf(WHEAT_CROP).item)} ` +
      `x${dropOf(WHEAT_CROP).count}`,
  );
  check("苗の大元は自分自身", baseBlock(WHEAT_CROP) === WHEAT_CROP, `${baseBlock(WHEAT_CROP)}`);
  // `variantOf !== AIR` なので `items.ts` の for が飛ばす → 一覧にも持ち物にも出ない。
  check("苗はアイテムを持たない（一覧が増えるのは種の 1 枠だけ）", itemName(WHEAT_CROP) === "", `"${itemName(WHEAT_CROP)}"`);
  // **既定の `baseBlock()` はアイテムの無い 121 を返す**ので、`DROPS` の 1 行が要る。
  check(
    "苗を壊すと種が 1 個",
    rollDrop(WHEAT_CROP, 0.5).item === WHEAT_SEEDS && rollDrop(WHEAT_CROP, 0.5).count === 1,
    `${itemName(rollDrop(WHEAT_CROP, 0.5).item)} x${rollDrop(WHEAT_CROP, 0.5).count}`,
  );

  // 草むらと同じ形（通り抜けられて、支えにならない）だが、**上書きして置けない** ——
  // `replaceable` にすると、植えた苗の上にブロックを置いた拍子に消える。
  check("苗は通り抜けられる", collisionBoxes(WHEAT_CROP).length === 0);
  check("苗にも狙う形はある", shapeBoxes(WHEAT_CROP).length > 0);
  check("苗は支えにならない", [0, 1, 2, 3, 4, 5].every((f) => !canSupport(WHEAT_CROP, f)));
  check("苗は上書きして置けない（草むらと違う）", !isReplaceable(WHEAT_CROP) && isReplaceable(TALL_GRASS));
  check("素手ですぐ壊せる", breakTime(WHEAT_CROP) === 0, `${breakTime(WHEAT_CROP)} 秒`);

  // 種は「植えるもの」だけ。**道具でも食べ物でもない**（`ToolKind` を増やすと
  // `mobs.ts` の `TOOL_ATTACK` が NaN を返す罠。シアーズと同じ）。
  console.log(
    `      isSeed: 種 ${isSeed(WHEAT_SEEDS)} / 草むら ${isSeed(TALL_GRASS)} / ` +
      `クワ ${isSeed(WOOD_HOE)} / 素手 ${isSeed(NO_ITEM)}`,
  );
  check("種だけが isSeed", isSeed(WHEAT_SEEDS));
  check(
    "種でないものは isSeed ではない",
    !isSeed(TALL_GRASS) && !isSeed(WOOD_HOE) && !isSeed(NO_ITEM) && !isSeed(STONE),
  );
  check(
    "種は道具でも食べ物でもない",
    toolOf(WHEAT_SEEDS) === null && foodOf(WHEAT_SEEDS) === null,
    `tool ${toolOf(WHEAT_SEEDS)} / food ${foodOf(WHEAT_SEEDS)}`,
  );
  // **`block: AIR`** —— 植えるのは `place` でなく `plant` の経路（`placing.ts` の `tryPlant()`）。
  check("種は置けるアイテムではない（植えるのは plant の経路）", placedBlock(WHEAT_SEEDS) === AIR, `${placedBlock(WHEAT_SEEDS)}`);

  // **支えを失う経路を本物の `World` で通す**（偽の試験場は `breakUnsupported` を持たない）。
  // `supportFace: FACE_YN` の 1 行が効いていないと、**耕地を掘っても苗だけが宙に残る。**
  {
    world.setVoxel(2, ground - 1, 2, FARMLAND);
    for (let y = ground; y < ground + 3; y++) world.setVoxel(2, y, 2, AIR);
    check("苗は支えのある所にしか置けない", !world.canPlaceAt(2, ground + 2, 2, WHEAT_CROP));
    world.setVoxel(2, ground, 2, WHEAT_CROP);
    check("耕地の上には立つ", world.getVoxel(2, ground, 2) === WHEAT_CROP, `${world.getVoxel(2, ground, 2)}`);

    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === WHEAT_CROP) broke++; };
    world.setVoxel(2, ground - 1, 2, AIR); // 下の耕地を掘る
    check(
      "耕地を掘ると苗も壊れて、落とす合図が 1 回出る",
      world.getVoxel(2, ground, 2) === AIR && broke === 1,
      `苗 ${world.getVoxel(2, ground, 2)} / 合図 ${broke} 回`,
    );
    world.onAutoBreak = undefined;
  }

  ripeWheat();
}

/**
 * 実った小麦（123）。**苗と違って `variantOf` は大元（苗）を向いている**ので、
 * `dropOf()` の既定は「苗 = アイテムの無い 121」を返す。だから `DROPS` の 1 行が
 * 無いと、**実らせても種しか採れない**（書き忘れが一番起こりやすい所）。
 */
function ripeWheat(): void {
  describe("実った小麦");

  console.log(
    `      実った小麦 ${WHEAT_CROP_RIPE}（baseBlock ${baseBlock(WHEAT_CROP_RIPE)} / ` +
      `アイテム "${itemName(WHEAT_CROP_RIPE)}"）  小麦 ${WHEAT}（${itemName(WHEAT)}）  ` +
      `落ちるもの ${itemName(dropOf(WHEAT_CROP_RIPE).item)} x${dropOf(WHEAT_CROP_RIPE).count}`,
  );

  check(
    "実った小麦の大元は苗（variantOf: WHEAT_CROP）",
    baseBlock(WHEAT_CROP_RIPE) === WHEAT_CROP,
    `${baseBlock(WHEAT_CROP_RIPE)}`,
  );
  // `variantOf !== AIR` なので `items.ts` の for が飛ばす → 一覧も持ち物も増えない。
  check(
    "実った小麦はアイテムを持たない（一覧が増えるのは小麦の 1 枠だけ）",
    itemName(WHEAT_CROP_RIPE) === "",
    `"${itemName(WHEAT_CROP_RIPE)}"`,
  );
  // **既定の `baseBlock()` は苗（アイテムの無い 121）を返す**ので、`DROPS` の 1 行が要る。
  check(
    "実った小麦を掘ると小麦が 1 個",
    rollDrop(WHEAT_CROP_RIPE, 0.5).item === WHEAT && rollDrop(WHEAT_CROP_RIPE, 0.5).count === 1,
    `${itemName(rollDrop(WHEAT_CROP_RIPE, 0.5).item)} x${rollDrop(WHEAT_CROP_RIPE, 0.5).count}`,
  );
  // **`rollDrop()` は 1 山目だけ**（既存の約 25 か所の根拠。ここを配列にしない）。
  check(
    "rollDrop() には種が出てこない（1 山目だけを答えるため）",
    rollDrop(WHEAT_CROP_RIPE, 0.5).item !== WHEAT_SEEDS,
    `${itemName(rollDrop(WHEAT_CROP_RIPE, 0.5).item)}`,
  );

  // --- 種も戻る（2 山）。**これで畑が自転する** ---
  {
    const stacks = rollDrops(WHEAT_CROP_RIPE, 0.5, 0.9);
    console.log(
      `      実った小麦の山（${stacks.length} 個）: ` +
        stacks.map((s) => `${itemName(s.item)}(${s.item}) x${s.count}`).join(" / "),
    );
    check("実った小麦は 2 山落ちる", stacks.length === 2, `${stacks.length} 山`);
    check(
      "1 山目は小麦 124 が 1 個",
      stacks[0]?.item === WHEAT && stacks[0]?.count === 1,
      `${itemName(stacks[0]?.item ?? NO_ITEM)} x${stacks[0]?.count}`,
    );
    check(
      "2 山目は種 122 が 1 個（植え直せる）",
      stacks[1]?.item === WHEAT_SEEDS && stacks[1]?.count === 1,
      `${itemName(stacks[1]?.item ?? NO_ITEM)} x${stacks[1]?.count}`,
    );
    // **苗は 1 山のまま。** 実る前に刈っても得しない（得すると、育つのを待つ理由が消える）。
    const young = rollDrops(WHEAT_CROP, 0.5, 0.9);
    check(
      "苗は 1 山のまま（実る前に刈っても得しない）",
      young.length === 1 && young[0].item === WHEAT_SEEDS && young[0].count === 1,
      young.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
    );
    // **`chance` を持たない 2 山目は `extraRoll` を外し目にしても必ず落ちる**
    // （葉のリンゴに確率を足した周に、種まで確率つきになっていないことの足場）。
    const unlucky = rollDrops(WHEAT_CROP_RIPE, 0.5, 0.99);
    console.log(
      `      extraRoll 0.99 の実った小麦: ` +
        unlucky.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
    );
    check(
      "実った小麦の種は extraRoll 0.99 でも落ちる（chance 省略 = 必ず）",
      unlucky.length === 2 && unlucky[1]?.item === WHEAT_SEEDS && unlucky[1]?.count === 1,
      unlucky.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
    );
  }

  // --- 不変条件（表が増えたときに勝手に壊れないこと） ---
  {
    const withExtra: string[] = [];
    const sameItem: string[] = [];
    const tooMany: string[] = [];
    const overOne: string[] = [];
    for (const { id } of BLOCKS) {
      const drop = dropOf(id);
      // **`drop.extra.item` と直に書かないこと** —— 2 件並べた行（オークの葉）で
      // 静かに壊れる。候補は必ず `extraDrops()` を通して配列で受ける。
      const extras = extraDrops(drop);
      if (extras.length > 0) {
        withExtra.push(`${blockName(id)}(${id})×${extras.length}`);
        // **2 山目は 1 山目と別のアイテム**（同じなら 1 山にまとめるべきで、
        // 分かれていると拾う側で 2 枠を食う）。
        for (const extra of extras) {
          if (extra.item === drop.item) sameItem.push(`${blockName(id)}(${id})`);
        }
        // **帯の合計が 1 を超えていないこと。** 超えると、後ろの候補（苗木）が
        // `extraRoll` のどの目でも切られて**永久に出ません**。
        const total = extras.reduce((sum, extra) => sum + (extra.chance ?? 1), 0);
        if (total > 1) overOne.push(`${blockName(id)}(${id}) 合計 ${total}`);
      }
      // 当たりの目と外れの目を**2 本の乱数それぞれで**見る（`chance` と `extra.chance` の
      // 組み合わせ。片方だけ振ると、2 山目の当たりが 1 度も試されない目が残る）。
      for (const roll of [0, 0.5, 0.999]) {
        for (const extraRoll of [0, 0.5, 0.999]) {
          if (rollDrops(id, roll, extraRoll).length > 2) {
            tooMany.push(`${blockName(id)}(${id})@${roll},${extraRoll}`);
          }
        }
      }
    }
    console.log(`      extra を持つブロック: ${withExtra.join(" / ") || "なし"}`);
    // **数えて直すこと、ゆるめないこと。** 実った小麦（種）・オークの葉（リンゴと
    // 苗木の 2 件）・トウヒの葉（苗木だけ）の 3 つ。
    check(
      "extra を持つのは実った小麦と葉 2 種の 3 つ（オークの葉だけ候補 2 件）",
      withExtra.length === 3,
      withExtra.join(" / "),
    );
    check("extra は 1 山目と別のアイテム", sameItem.length === 0, sameItem.join(" / "));
    check("どのブロックでも山は 2 つまで", tooMany.length === 0, tooMany.join(" / "));
    check("2 山目の帯の合計は 1 を超えない", overOne.length === 0, overOne.join(" / "));
  }

  // 苗と同じ形（通り抜けられる・支えにならない・上書きして置けない・素手ですぐ壊せる）。
  check("実った小麦は通り抜けられる", collisionBoxes(WHEAT_CROP_RIPE).length === 0);
  check("実った小麦にも狙う形はある", shapeBoxes(WHEAT_CROP_RIPE).length > 0);
  check("実った小麦は支えにならない", [0, 1, 2, 3, 4, 5].every((f) => !canSupport(WHEAT_CROP_RIPE, f)));
  check("実った小麦は上書きして置けない", !isReplaceable(WHEAT_CROP_RIPE));
  check("実った小麦も素手ですぐ壊せる", breakTime(WHEAT_CROP_RIPE) === 0, `${breakTime(WHEAT_CROP_RIPE)} 秒`);

  // 小麦は「材料」だけ。**道具でも食べ物でもない**（食べるのはパンにしてから）。
  console.log(
    `      小麦: tool ${toolOf(WHEAT)} / food ${foodOf(WHEAT)} / ` +
      `置けるブロック ${placedBlock(WHEAT)} / 1 山 ${itemStackLimit(WHEAT)}`,
  );
  check("小麦は道具でも食べ物でもない", toolOf(WHEAT) === null && foodOf(WHEAT) === null);
  // **`block: AIR`** —— 置けると、耕地も育つ時間も飛ばして畑を並べられる。
  check("小麦は置けるアイテムではない", placedBlock(WHEAT) === AIR, `${placedBlock(WHEAT)}`);
  check("小麦は 64 個まで積める", itemStackLimit(WHEAT) === 64, `${itemStackLimit(WHEAT)}`);

  // パン（125）。**小麦と違って食べ物**で、道具でも置けるアイテムでもない。
  const bread = foodOf(BREAD);
  console.log(
    `      ${itemName(BREAD)}(${BREAD}): tool ${toolOf(BREAD)} / ` +
      `food ${bread ? `空腹 +${bread.hunger} / 満腹度 +${bread.saturation} / 毒 ${bread.poison}` : "null"} / ` +
      `置けるブロック ${placedBlock(BREAD)} / 1 山 ${itemStackLimit(BREAD)}`,
  );
  check("パンは食べ物", bread !== null);
  // **`tool:` を持たせない**（`ToolKind` が増えると `TOOL_ATTACK` に無い種類が入って NaN）。
  check("パンは道具ではない", toolOf(BREAD) === null, `${toolOf(BREAD)}`);
  // **置けるパンは本家にない。**
  check("パンは置けるアイテムではない", placedBlock(BREAD) === AIR, `${placedBlock(BREAD)}`);
  // 傷が付く物ではないので 1 山にしない。
  check("パンは 64 個まで積める", itemStackLimit(BREAD) === 64, `${itemStackLimit(BREAD)}`);
}

/** エンドポータルの枠（向き 4 x アイの有無 2）。要塞が並べる（`stronghold.ts`）。 */
function endPortalFrames(): void {
  describe("エンドポータルの枠");

  const facings = [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN];
  const all = facings.flatMap((f) => [endPortalFrame(f, false), endPortalFrame(f, true)]);
  check("向き 4 × アイの有無 2 で 8 通り", new Set(all).size === 8, all.join(" "));
  check(
    "大元は +X 向き・アイ無し",
    endPortalFrame(FACE_XP, false) === END_PORTAL_FRAME,
    `${endPortalFrame(FACE_XP, false)}`,
  );
  check(
    "大元以外は 64 以降",
    all.filter((id) => id !== END_PORTAL_FRAME).every((id) => id > LOW_BAND_MAX),
    all.join(" "),
  );
  check("上下の向きでは枠にならない", endPortalFrame(FACE_YP, false) === AIR && endPortalFrame(FACE_YN, true) === AIR);

  // 状態の読み書きが噛み合っているか（書いた向き・アイが読み出せる）。
  const roundTrip = facings.every((f) =>
    [false, true].every((eye) => {
      const id = endPortalFrame(f, eye);
      return isEndPortalFrame(id) && frameFacing(id) === f && frameHasEye(id) === eye;
    }),
  );
  check("書いた向きとアイの有無がそのまま読み出せる", roundTrip);
  check("枠でないものは false", !isEndPortalFrame(STONE) && !isEndPortalFrame(AIR) && !frameHasEye(STONE));

  // **アイテムも名前も 1 つに揃うこと**（壁掛け松明・点火中のかまどと同じ仕掛け）。
  const names = new Set(all.map((id) => blockName(id)));
  check("8 通りとも同じ名前で出る", names.size === 1, [...names].join(" "));
  check(
    "向き違いはアイテムを作らない",
    all.filter((id) => id !== END_PORTAL_FRAME).every((id) => baseBlock(id) === END_PORTAL_FRAME),
  );

  // **壊せないこと。** 掘れると、起動する前に枠を壊してクリアできなくなる。
  const breakable = all.filter((id) => Number.isFinite(blockDef(id).hardness));
  check("枠は 8 通りとも壊せない", breakable.length === 0, `${breakable.length} 個が壊せる`);

  // アイが嵌まったことが**形でも**分かること（色だけだと箱の数が合わなくなっても気付けない）。
  const plain = shapeBoxes(endPortalFrame(FACE_XP, false));
  const eyed = shapeBoxes(endPortalFrame(FACE_XP, true));
  console.log(
    `      枠の高さ ${FRAME_HEIGHT}（箱 ${plain.length} 個） / アイ入りは箱 ${eyed.length} 個`,
  );
  check("アイ入りは箱がひとつ増える", eyed.length === plain.length + 1, `${plain.length} → ${eyed.length}`);
  check("枠の高さは 13/16", plain[0][4] === FRAME_HEIGHT, `${plain[0][4]}`);
  // 13/16 は `STEP_HEIGHT`(0.6) より高いので、歩いて乗り越えられない（跳ぶことになる）。
  check(
    "歩いて乗り越えられない高さ",
    FRAME_HEIGHT > PLAYER_SIZE.step,
    `${FRAME_HEIGHT} > ${PLAYER_SIZE.step}`,
  );
  // 上面が丸ごと埋まっていないので、松明は載らない（下付きハーフと同じ理由）。
  check("枠の上面は支えにならない", !canSupport(END_PORTAL_FRAME, FACE_YP));
}

/**
 * 鉱物をしまう立方体（135 鉄 / 136 金 / 137 ダイヤ）。**9 個 → 1 個 → 9 個**の
 * 個数そのものは `test/crafting.test.ts` が見ていて、ここは**ブロックの側**だけ。
 */
function storedBlocks(): void {
  describe("鉱物をしまう立方体（鉄・金・ダイヤ）");

  // **`variantOf` を書いていないこと（既定の `AIR`）が全部の足場です。** これ 1 つで
  // (a) `items.ts` の for が同じ番号のアイテムを作り（手で足すと二重登録）、
  // (b) `dropOf()` の既定が自分を返すので**掘ると自分が落ちます**（`DROPS` に 0 行）。
  const stored: [string, number, number, number][] = [
    ["鉄ブロック", IRON_BLOCK, IRON_INGOT, TIER_STONE],
    ["金ブロック", GOLD_BLOCK, GOLD_INGOT, TIER_IRON],
    ["ダイヤブロック", DIAMOND_BLOCK, DIAMOND, TIER_IRON],
  ];
  for (const [name, block, ingot, tier] of stored) {
    const d = blockDef(block);
    const dropped = rollDrop(block, 0.5);
    console.log(
      `      ${name}(${block}): model ${d.model} / variantOf ${d.variantOf} / 硬さ ${d.hardness} / ` +
        `道具 ${d.tool} 階層 ${d.minTier} / 色 0x${d.top.toString(16)}（材料 0x${itemColor(ingot).toString(16)}）/ ` +
        `掘ると ${itemName(dropped.item)} x${dropped.count} / アイテム名「${itemName(block)}」`,
    );
    check(
      `${name}は立方体で、向き違いではない（アイテムが自動で付く）`,
      d.model === "cube" && d.variantOf === AIR,
      `${d.model} / variantOf ${d.variantOf}`,
    );
    check(
      `${name}は同じ番号のアイテムとして持てて、置くと自分に戻る`,
      itemName(block) === name && placedBlock(block) === block,
      `「${itemName(block)}」→ ${placedBlock(block)}`,
    );
    check(
      `${name}は掘ると自分が 1 個落ちる（DROPS に 1 行も要らない）`,
      dropped.item === block && dropped.count === 1 && rollDrops(block, 0.5, 0.9).length === 1,
      `${itemName(dropped.item)} x${dropped.count}（山 ${rollDrops(block, 0.5, 0.9).length} 個）`,
    );
    check(
      `${name}はツルハシ専用で、階層は ${tier}`,
      d.tool === "pickaxe" && d.minTier === tier,
      `${d.tool} / ${d.minTier}`,
    );
    // **色は材料の山と同じ**（一覧で「9 個ぶんの色」に見えることが唯一の手掛かり）。
    check(
      `${name}の色は材料の色をそのまま写している`,
      d.top === itemColor(ingot),
      `0x${d.top.toString(16)} vs 0x${itemColor(ingot).toString(16)}`,
    );
  }
  // **音は既定の "stone" のまま**（金属の音を足すと `audio.ts` / `sfx.ts` の話になる）。
  check(
    "3 つとも石の音のまま（金属の音は無い）",
    stored.every(([, block]) => blockDef(block).sound === "stone"),
    stored.map(([name, block]) => `${name} ${blockDef(block).sound}`).join(" / "),
  );
  // **食べ物でも道具でもない**（`FOODS` にも `ToolDef` にも 1 行も足していない）。
  check(
    "3 つとも食べ物でも道具でもない",
    stored.every(([, block]) => foodOf(block) === null && toolOf(block) === null),
    stored.map(([name, block]) => `${name} ${foodOf(block) ? "食べ物" : "-"}${toolOf(block) ? "道具" : "-"}`).join(" / "),
  );
}

/**
 * 石炭ブロック（ブロック 188・42）。**鉱物をしまう立方体（135..137）とまったく同じ形**
 * なのに**別の節にしてある**のは、上の `stored` の表に
 * **「色は材料の色をそのまま写している」**の 1 件があるためです ——
 * 石炭ブロックは**そこだけ写していない**（写すと一覧の隔たりが 0.0 になる）ので、
 * **表に 4 行目として足すと必ず落ちます**（`AUTODEV-SPEC.md` の 5）。
 *
 * ここで見るのは 4 つ:
 * **135..137 と同じ形か**（`model` / `variantOf` / `opaque` / `solid` / 硬さ / 道具 / 音）/
 * **素手では 1 個も落ちないか**（`minTier: TIER_WOOD`。135..137 とは階層が違う）/
 * **掘ると自分が 1 個戻るか**（`DROPS` に 0 行）/
 * **一覧で石炭(65) と見分けられるか**（**色を写さなかった理由がここ**）。
 *
 * **燃料としての 800 秒は `test/smelting.test.ts`**（表の側なので、そちらで数える）。
 */
function coalBlocks(): void {
  describe("石炭ブロック（ブロック 188）");

  const d = blockDef(COAL_BLOCK);
  const iron = blockDef(IRON_BLOCK);
  console.log(
    `      石炭ブロック(${COAL_BLOCK}): model ${d.model} / variantOf ${d.variantOf} / ` +
      `opaque ${d.opaque} / solid ${d.solid} / 硬さ ${d.hardness} / ` +
      `道具 ${blockTool(COAL_BLOCK)} 階層 ${d.minTier} / sound ${d.sound}\n` +
      `      対照（鉄ブロック 135）: model ${iron.model} / 硬さ ${iron.hardness} / ` +
      `階層 ${iron.minTier} / sound ${iron.sound}`,
  );
  check(
    "立方体で向き違いではない（variantOf が AIR なのでアイテム 188 が自動で付く）",
    d.model === "cube" && d.variantOf === AIR && d.model === iron.model &&
      d.opaque && d.solid && d.opaque === iron.opaque && d.solid === iron.solid,
    `model ${d.model} / variantOf ${d.variantOf} / opaque ${d.opaque} / solid ${d.solid}`,
  );
  check(
    "音は石（sound を書いていないので既定。135..137 と同じ）",
    d.sound === "stone" && d.sound === iron.sound,
    `188 ${d.sound} / 135 ${iron.sound}`,
  );

  // --- 掘る速さと、素手で落ちるか（**数値を出してから判定する**）----------------
  // 硬さ 5 は鉄ブロックと同じだが、**`minTier` は `TIER_WOOD`**（鉄は `TIER_STONE`）。
  // **落ちない道具は `MISMATCH_FACTOR`(5) に丸ごと差し替わる**（`HARVEST_FACTOR`(1.5) に
  // 掛かるのではない。`mining.ts` の `breakTime`）ので、素手は `5 × 5 / 1` = 25.0 秒。
  // 木のツルハシは `5 × 1.5 / 2` = 3.75 秒・鉄のツルハシは `5 × 1.5 / 6` = 1.25 秒。
  console.log(
    `      素手 ${breakTime(COAL_BLOCK, NO_ITEM).toFixed(3)}s / ` +
      `木のツルハシ ${breakTime(COAL_BLOCK, WOOD_PICKAXE).toFixed(3)}s / ` +
      `鉄のツルハシ ${breakTime(COAL_BLOCK, IRON_PICKAXE).toFixed(3)}s\n` +
      `      落ちるか: 素手 ${canHarvest(COAL_BLOCK, NO_ITEM)} / ` +
      `木のツルハシ ${canHarvest(COAL_BLOCK, WOOD_PICKAXE)} / ` +
      `対照（鉄ブロック 135）は木のツルハシで ${canHarvest(IRON_BLOCK, WOOD_PICKAXE)}`,
  );
  check(
    "硬さ 5・ツルハシが適正・minTier は TIER_WOOD（素手 25.0 秒 / 木のツルハシ 3.75 秒 / 鉄のツルハシ 1.25 秒）",
    d.hardness === 5 && d.hardness === iron.hardness &&
      blockTool(COAL_BLOCK) === "pickaxe" && d.minTier === TIER_WOOD &&
      breakTime(COAL_BLOCK, NO_ITEM) === 25 &&
      breakTime(COAL_BLOCK, WOOD_PICKAXE) === 3.75 &&
      breakTime(COAL_BLOCK, IRON_PICKAXE) === 1.25,
    `硬さ ${d.hardness} / ${blockTool(COAL_BLOCK)} / minTier ${d.minTier} / ` +
      `素手 ${breakTime(COAL_BLOCK, NO_ITEM).toFixed(3)}s ` +
      `木 ${breakTime(COAL_BLOCK, WOOD_PICKAXE).toFixed(3)}s ` +
      `鉄 ${breakTime(COAL_BLOCK, IRON_PICKAXE).toFixed(3)}s`,
  );
  // **素手では 1 個も落ちない**（鉄ブロック 135 は `TIER_STONE` なので木のツルハシでも落ちない ——
  // **そこが 135..137 との分かれ目**なので、対照を 1 つ並べておく）。
  check(
    "素手では落ちない（木のツルハシでは落ちる。鉄ブロック 135 は木では落ちない）",
    !canHarvest(COAL_BLOCK, NO_ITEM) && canHarvest(COAL_BLOCK, WOOD_PICKAXE) &&
      !canHarvest(IRON_BLOCK, WOOD_PICKAXE),
    `素手 ${canHarvest(COAL_BLOCK, NO_ITEM)} / 木 ${canHarvest(COAL_BLOCK, WOOD_PICKAXE)} / ` +
      `135 を木で ${canHarvest(IRON_BLOCK, WOOD_PICKAXE)}`,
  );

  // --- 掘って出るもの（**自分が 1 個**。`DROPS` は 0 行で、既定の `baseBlock()`）---
  const drop = rollDrop(COAL_BLOCK, 0.5);
  const stacks = rollDrops(COAL_BLOCK, 0.5, 0.9);
  console.log(
    `      掘ると ${itemName(drop.item)}(${drop.item}) x${drop.count}（山 ${stacks.length} 個）/ ` +
      `baseBlock ${baseBlock(COAL_BLOCK)} / アイテム名「${itemName(COAL_BLOCK)}」 ` +
      `placedBlock ${placedBlock(COAL_BLOCK)} / 一覧に ${allItemIds().includes(COAL_BLOCK)}`,
  );
  check(
    "掘ると自分が 1 個落ちる（DROPS に 1 行も書いていない = 既定の baseBlock）",
    drop.item === COAL_BLOCK && drop.count === 1 && baseBlock(COAL_BLOCK) === COAL_BLOCK &&
      stacks.length === 1 && stacks[0].item === COAL_BLOCK && stacks[0].count === 1,
    `${itemName(drop.item)} x${drop.count} / 山 ${stacks.length} 個`,
  );
  // **石炭鉱石(14) を掘っても石炭ブロックは出ない**（`DROPS` に 1 行も足していない）。
  check(
    "石炭鉱石 14 は今までどおり石炭が落ちる（ドロップ表を書き換えていない）",
    rollDrop(COAL_ORE, 0.5).item === COAL,
    `石炭鉱石 → ${itemName(rollDrop(COAL_ORE, 0.5).item)}`,
  );
  check(
    "アイテム 188 は「石炭ブロック」で、置くと 188 が戻る（一覧にも出る・食べ物でも道具でもない）",
    itemName(COAL_BLOCK) === "石炭ブロック" && placedBlock(COAL_BLOCK) === COAL_BLOCK &&
      allItemIds().includes(COAL_BLOCK) && toolOf(COAL_BLOCK) === null &&
      foodOf(COAL_BLOCK) === null,
    `${itemName(COAL_BLOCK)} / placedBlock ${placedBlock(COAL_BLOCK)} / ` +
      `一覧に ${allItemIds().includes(COAL_BLOCK)}`,
  );

  // --- 一覧に並ぶ色（**材料の写し 0x23262b は隔たり 0.0**。本家の写し 0x100f0f）---
  // **135..137 の「色は材料の色をそのまま写す」を写していない唯一のもの**なので、
  // **いちばん近い相手と隔たりを出してから**判定する（ネザーレンガのフェンスと同じ形）。
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let best = Infinity;
  let who = "";
  for (const other of allItemIds()) {
    if (other === COAL_BLOCK) continue;
    const gap = dist(itemColor(COAL_BLOCK), itemColor(other));
    if (gap < best) {
      best = gap;
      who = itemName(other);
    }
  }
  console.log(
    `      色のいちばん近い相手: 石炭ブロック 0x${itemColor(COAL_BLOCK).toString(16)} ↔ ` +
      `${who} ${best.toFixed(1)}（材料の石炭 0x${itemColor(COAL).toString(16)} / ` +
      `黒曜石 ${dist(itemColor(COAL_BLOCK), itemColor(OBSIDIAN)).toFixed(1)} / ` +
      `石炭鉱石 ${dist(itemColor(COAL_BLOCK), itemColor(COAL_ORE)).toFixed(1)}）`,
  );
  check(
    "石炭ブロックは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    best >= 20,
    `いちばん近い ${who} と ${best.toFixed(1)}`,
  );
  // **しまう元としまった先は別の 1 件**（まとめると、どちらが詰まったか出力から読めない）。
  // **ここが「材料の色を写さなかった」理由そのもの** —— 写すと 0.0 になる。
  const coalGap = dist(itemColor(COAL_BLOCK), itemColor(COAL));
  console.log(
    `      しまう元としまった先: 石炭 0x${itemColor(COAL).toString(16)} ↔ ` +
      `石炭ブロック 0x${itemColor(COAL_BLOCK).toString(16)} = ${coalGap.toFixed(1)}`,
  );
  check(
    "材料の石炭（65）とも一覧で見分けられる（色を写していないのはここが理由。写すと 0.0）",
    coalGap >= 20 && itemColor(COAL_BLOCK) !== itemColor(COAL),
    `石炭 ↔ 石炭ブロック ${coalGap.toFixed(1)}`,
  );
}

/**
 * 苗木 2 種（ブロック 164 / 165・30a）。**落ちて・土の上にだけ立って・掘れば戻る**
 * ところまでで、**育ちません**（木になるのは 30b）。
 *
 * ここで守りたいのは 3 点です:
 *
 * - **葉の 2 山目が `extraRoll` の帯で分かれていること**（リンゴ 0..0.005 →
 *   苗木 0.005..0.055）。**乱数は 2 本のまま**で、リンゴと苗木は同時に落ちない
 * - **真下が土・草・耕地のときだけ立つこと**（`needsSoil` の表 1 本）。
 *   **`canSupport()` はゆるめていない** —— あれは壁掛けの松明とベッドの足場
 * - **置く側と壊す側が同じ `supportsBlock()` を通ること** —— 片方だけだと
 *   「置けないのに下を掘っても残る」「置けるのに勝手に消える」ができる
 */
function saplings(): void {
  describe("苗木 2 種（葉から落ちて、土の上に立つ）");

  const kinds: [string, number][] = [
    ["オークの苗木", SAPLING],
    ["トウヒの苗木", SPRUCE_SAPLING],
  ];

  // --- 形と性質（小麦の苗の写し。違うのは色・`variantOf`・`needsSoil` の 3 つ）---
  for (const [name, id] of kinds) {
    const d = blockDef(id);
    const dropped = rollDrop(id, 0.5);
    console.log(
      `      ${name}(${id}): model ${d.model} / variantOf ${d.variantOf} / 硬さ ${d.hardness} / ` +
        `色 0x${d.top.toString(16)} / 通り抜け ${!d.solid} / 上書きされる ${isReplaceable(id)} / ` +
        `支え ${d.supportFace} / needsSoil ${needsSoil(id)} / 積める ${stacksOnSelf(id)} / ` +
        `掘ると ${itemName(dropped.item)} x${dropped.count}`,
    );
    // **苗（`WHEAT_CROP`）とまったく同じ 5 点。** `variantOf` だけは逆側で、
    // 書くとアイテムが作られず**掘っても戻らない**（一覧にも持ち物にも出ない）。
    check(
      `${name}は十字・通り抜けられる・硬さ 0・草の音・向き違いではない`,
      d.model === "cross" && !d.solid && !d.opaque && d.hardness === 0 &&
        d.sound === "grass" && d.variantOf === AIR,
      `model ${d.model} / solid ${d.solid} / opaque ${d.opaque} / 硬さ ${d.hardness} / ` +
        `sound ${d.sound} / variantOf ${d.variantOf}`,
    );
    // **`replaceable` を付けると、植えた苗木の上にブロックを置いた拍子に消える**
    // （`placeSpot()` が狙ったマス自身を返すため）。苗と同じ側・草むらとは逆。
    // **`stacksOnSelf` も付けない**（苗木の上に苗木は立たない。サトウキビとは逆）。
    check(
      `${name}は上書きされず・積めない（苗と同じ側。草むら／サトウキビとは逆）`,
      !isReplaceable(id) && !stacksOnSelf(id) && isReplaceable(TALL_GRASS) && stacksOnSelf(SUGAR_CANE),
      `上書き ${isReplaceable(id)} / 積める ${stacksOnSelf(id)}`,
    );
    check(
      `${name}の支えは真下で、土が要る`,
      d.supportFace === FACE_YN && needsSoil(id),
      `supportFace ${d.supportFace} / needsSoil ${needsSoil(id)}`,
    );
    // **`DROPS` に 1 行も要らない** —— `variantOf` が `AIR` なので `dropOf()` の
    // 既定（`baseBlock()`）が自分を 1 個落とす。**アイテムも自動で作られる。**
    check(
      `${name}は掘ると自分が 1 個落ちる（DROPS に 1 行も要らない）`,
      dropped.item === id && dropped.count === 1 && rollDrops(id, 0.5, 0.9).length === 1 &&
        itemName(id) === name && placedBlock(id) === id,
      `${itemName(dropped.item)} x${dropped.count}（山 ${rollDrops(id, 0.5, 0.9).length} 個）/ ` +
        `アイテム名「${itemName(id)}」/ 置ける ${placedBlock(id)}`,
    );
  }

  // --- 葉から落ちる（帯を出してから判定する）---------------------------------
  // **リンゴ 0..0.005 → 苗木 0.005..0.055 の順**。1 山目（棒 10%）は `roll` の側で、
  // ここは `extraRoll` だけを振る。
  const dropCases: [string, number, number, number][] = [
    ["オークの葉・リンゴの帯（0.001）", LEAVES, 0.5, 0.001],
    ["オークの葉・苗木の帯（0.03）", LEAVES, 0.5, 0.03],
    ["オークの葉・棒当たり + 苗木", LEAVES, 0.05, 0.03],
    ["オークの葉・帯の外（0.9）", LEAVES, 0.5, 0.9],
    ["トウヒの葉・苗木の帯（0.03）", SPRUCE_LEAVES, 0.5, 0.03],
    ["トウヒの葉・帯の外（0.9）", SPRUCE_LEAVES, 0.5, 0.9],
  ];
  for (const [label, id, roll, extraRoll] of dropCases) {
    const stacks = rollDrops(id, roll, extraRoll);
    console.log(
      `      ${label}: ${stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし"}`,
    );
  }
  const appleBand = rollDrops(LEAVES, 0.5, 0.001);
  const saplingBand = rollDrops(LEAVES, 0.5, 0.03);
  const both = rollDrops(LEAVES, 0.05, 0.03);
  const outside = rollDrops(LEAVES, 0.5, 0.9);
  check(
    "オークの葉: 0.001 はリンゴ 1 山・0.03 は苗木 1 山（帯が分かれている）",
    appleBand.length === 1 && appleBand[0]?.item === APPLE &&
      saplingBand.length === 1 && saplingBand[0]?.item === SAPLING,
    `0.001 → ${appleBand.map((s) => itemName(s.item)).join("+") || "なし"} / ` +
      `0.03 → ${saplingBand.map((s) => itemName(s.item)).join("+") || "なし"}`,
  );
  // **リンゴと苗木は同時に落ちない**（帯で分けたので、当たるのはどちらか片方）。
  // 本家は独立だが、乱数を 3 本目に増やすと `breaking.ts` と `main.ts` に及ぶ（`TUNING.md`）。
  check(
    "リンゴと苗木は同時に落ちない（帯なので片方だけ）",
    !appleBand.some((s) => s.item === SAPLING) && !saplingBand.some((s) => s.item === APPLE),
    `${appleBand.map((s) => itemName(s.item)).join("+")} / ${saplingBand.map((s) => itemName(s.item)).join("+")}`,
  );
  check(
    "棒も当たると 2 山（棒 + 苗木）・帯の外は 0 山",
    both.length === 2 && both[0]?.item === STICK && both[1]?.item === SAPLING &&
      outside.length === 0,
    `${both.map((s) => itemName(s.item)).join(" + ")} / 外 ${outside.length} 山`,
  );
  const spruceBand = rollDrops(SPRUCE_LEAVES, 0.5, 0.03);
  check(
    "トウヒの葉からはトウヒの苗木（オークの苗木ではない）",
    spruceBand.length === 1 && spruceBand[0]?.item === SPRUCE_SAPLING,
    spruceBand.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ") || "なし",
  );

  // --- 土の上にだけ立つ（表を一覧で出してから判定する）------------------------
  // **`canSupport()` はゆるめていない** —— 石の上でも `canSupport` は true のままで、
  // 落としているのは `supportsBlock()` の 1 行だけ。**ここを混ぜると松明が草むらに刺さる。**
  const soilCases: [string, number, boolean][] = [
    ["土", DIRT, true],
    ["草", GRASS, true],
    ["耕地", FARMLAND, true],
    ["石", STONE, false],
    ["板", PLANK, false],
    ["砂", SAND, false],
    ["ガラス", GLASS, false],
    ["葉", LEAVES, false],
    ["空気", AIR, false],
  ];
  console.log(
    `      supportsBlock(真下, FACE_YP, 苗木): ` +
      soilCases.map(([n, s]) => `${n} ${supportsBlock(s, FACE_YP, SAPLING)}`).join(" / "),
  );
  console.log(
    `      canSupport(真下, FACE_YP) は変わらない: ` +
      soilCases.map(([n, s]) => `${n} ${canSupport(s, FACE_YP)}`).join(" / "),
  );
  const wrong = soilCases.filter(([, s, want]) => supportsBlock(s, FACE_YP, SAPLING) !== want);
  check(
    "苗木が立つのは土・草・耕地の上だけ（石・板・砂・ガラス・葉の上には立たない）",
    wrong.length === 0,
    wrong.map(([n]) => n).join(" / ") || "9 通りとも表どおり",
  );
  check(
    "トウヒの苗木も同じ表（`id === SAPLING` と書いていない）",
    soilCases.every(([, s, want]) => supportsBlock(s, FACE_YP, SPRUCE_SAPLING) === want),
    soilCases.map(([n, s]) => `${n} ${supportsBlock(s, FACE_YP, SPRUCE_SAPLING)}`).join(" / "),
  );
  // **`canSupport()` をゆるめていないこと**（石は今までどおり支えで、松明は刺さる）。
  check(
    "canSupport はゆるめていない（石の上の松明は今までどおり置ける）",
    canSupport(STONE, FACE_YP) && supportsBlock(STONE, FACE_YP, TORCH) &&
      !supportsBlock(TALL_GRASS, FACE_YP, TORCH),
    `石 ${canSupport(STONE, FACE_YP)} / 石の上の松明 ${supportsBlock(STONE, FACE_YP, TORCH)} / ` +
      `草むらの上の松明 ${supportsBlock(TALL_GRASS, FACE_YP, TORCH)}`,
  );
  // **`isSoil()` は表 1 本**（土を増やしたときに片方だけ直し忘れない）。
  console.log(
    `      isSoil(): ${soilCases.map(([n, s]) => `${n} ${isSoil(s)}`).join(" / ")}`,
  );
  check(
    "isSoil は土・草・耕地の 3 つだけ",
    BLOCKS.filter((b) => isSoil(b.id)).length === 3 && isSoil(DIRT) && isSoil(GRASS) && isSoil(FARMLAND),
    BLOCKS.filter((b) => isSoil(b.id)).map((b) => b.name).join(" / "),
  );

  // **置けない理由の文**（`supportHint()`）。「床か壁」のままだと嘘になる。
  console.log(
    `      supportHint: 苗木「${supportHint(SAPLING)}」/ はしご「${supportHint(LADDER)}」/ ` +
      `松明「${supportHint(TORCH)}」`,
  );
  check(
    "置けない理由は「土か草の上」（はしごの「壁」・松明の「床か壁」は変わらない）",
    supportHint(SAPLING) === "土か草の上" && supportHint(SPRUCE_SAPLING) === "土か草の上" &&
      supportHint(LADDER) === "壁" && supportHint(TORCH) === "床か壁",
    `苗木「${supportHint(SAPLING)}」/ はしご「${supportHint(LADDER)}」/ 松明「${supportHint(TORCH)}」`,
  );
}
