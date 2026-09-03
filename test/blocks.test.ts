import { readFileSync } from "node:fs";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import {
  AIR,
  BED,
  BLOCKS,
  CACTUS,
  COBBLE_SLAB,
  DIRT,
  END_PORTAL_FRAME,
  FACE_XN,
  FACE_XP,
  FACE_YN,
  FACE_YP,
  FACE_ZN,
  FACE_ZP,
  FARMLAND,
  FRAME_HEIGHT,
  GRASS,
  LAVA,
  LOW_BAND_MAX,
  MAX_BLOCK_ID,
  PLANK_SLAB,
  PLANK_SLAB_TOP,
  PLANK_STAIRS,
  SANDSTONE_SLAB,
  SHARED_ID_START,
  STONE,
  STONE_SLAB,
  STONE_SLAB_TOP,
  STONE_STAIRS,
  TALL_GRASS,
  TORCH,
  VARIANT_BAND_MAX,
  WALL_TORCH_ZN,
  WATER,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
  baseBlock,
  blockDef,
  blockName,
  blockTool,
  canSupport,
  collisionBoxes,
  endPortalFrame,
  frameFacing,
  frameHasEye,
  isEndPortalFrame,
  isProp,
  isHotLiquid,
  isLiquid,
  isReplaceable,
  liquidFog,
  placeSpot,
  placedVariant,
  shapeBoxes,
  tilled,
} from "../src/blocks";
import { MAX_LIGHT } from "../src/constants";
import { PLAYER_SIZE } from "../src/physics";
import {
  BREAD,
  BUCKET,
  COOKED_CHICKEN,
  DIAMOND_HOE,
  FEATHER,
  IRON_INGOT,
  LAVA_BUCKET,
  MAX_ITEM_ID,
  NO_ITEM,
  RAW_CHICKEN,
  SHEARS,
  STICK,
  WATER_BUCKET,
  WHEAT,
  WHEAT_SEEDS,
  WOOD_HOE,
  allItemIds,
  bucketOf,
  bucketUse,
  dropOf,
  foodOf,
  isBucket,
  isHoe,
  isSeed,
  itemName,
  itemStackLimit,
  liquidOf,
  placedBlock,
  rollDrop,
  rollDrops,
  toolOf,
} from "../src/items";
import { breakTime } from "../src/mining";
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
  check(
    "共有帯のアイテムは剣 4 本・シアーズ・クワ 4 本・小麦の種・小麦・パン・鶏の肉 2 つ・羽根の 15 個（128 まで）",
    sharedItems.length === 15 && sharedItems[4] === SHEARS && sharedItems[8] === DIAMOND_HOE &&
      sharedItems[9] === WHEAT_SEEDS && sharedItems[10] === WHEAT && sharedItems[11] === BREAD &&
      sharedItems[12] === RAW_CHICKEN && sharedItems[13] === COOKED_CHICKEN &&
      sharedItems[14] === FEATHER && MAX_ITEM_ID === FEATHER,
    `${sharedItems.join(" ")} / MAX_ITEM_ID ${MAX_ITEM_ID}`,
  );
  // **肉は置けず・道具でもなく・食べられる。** 3 つを並べて見ること —— `block` を
  // 付ければ置ける肉になり、`tool:` を付ければ `TOOL_ATTACK` に無い種類が入って NaN、
  // `FOODS` に無ければ拾えるだけの飾りになる（どれも型では止まらない）。
  const meats: [string, number][] = [["生鶏肉", RAW_CHICKEN], ["焼き鳥", COOKED_CHICKEN]];
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

  world.dispose();
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
    const stacks = rollDrops(WHEAT_CROP_RIPE, 0.5);
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
    const young = rollDrops(WHEAT_CROP, 0.5);
    check(
      "苗は 1 山のまま（実る前に刈っても得しない）",
      young.length === 1 && young[0].item === WHEAT_SEEDS && young[0].count === 1,
      young.map((s) => `${itemName(s.item)} x${s.count}`).join(" / "),
    );
  }

  // --- 不変条件（表が増えたときに勝手に壊れないこと） ---
  {
    const withExtra: string[] = [];
    const sameItem: string[] = [];
    const tooMany: string[] = [];
    for (const { id } of BLOCKS) {
      const drop = dropOf(id);
      if (drop.extra) {
        withExtra.push(`${blockName(id)}(${id})`);
        // **2 山目は 1 山目と別のアイテム**（同じなら 1 山にまとめるべきで、
        // 分かれていると拾う側で 2 枠を食う）。
        if (drop.extra.item === drop.item) sameItem.push(`${blockName(id)}(${id})`);
      }
      // 当たりの目と外れの目の両方で見る（`chance` と `extra` の組み合わせ）。
      for (const roll of [0, 0.5, 0.999]) {
        if (rollDrops(id, roll).length > 2) tooMany.push(`${blockName(id)}(${id})@${roll}`);
      }
    }
    console.log(`      extra を持つブロック: ${withExtra.join(" / ") || "なし"}`);
    check("extra を持つのは実った小麦だけ", withExtra.length === 1, withExtra.join(" / "));
    check("extra は 1 山目と別のアイテム", sameItem.length === 0, sameItem.join(" / "));
    check("どのブロックでも山は 2 つまで", tooMany.length === 0, tooMany.join(" / "));
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
