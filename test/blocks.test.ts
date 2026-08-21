import { readFileSync } from "node:fs";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import {
  AIR,
  BED,
  BLOCKS,
  CACTUS,
  COBBLE_SLAB,
  FACE_XN,
  FACE_XP,
  FACE_YN,
  FACE_YP,
  FACE_ZN,
  FACE_ZP,
  GRASS,
  LAVA,
  MAX_BLOCK_ID,
  MAX_VARIANT_ID,
  PLANK_SLAB,
  PLANK_SLAB_TOP,
  PLANK_STAIRS,
  SANDSTONE_SLAB,
  STONE,
  STONE_SLAB,
  STONE_SLAB_TOP,
  STONE_STAIRS,
  TALL_GRASS,
  TORCH,
  WALL_TORCH_ZN,
  WATER,
  baseBlock,
  blockName,
  canSupport,
  collisionBoxes,
  isProp,
  isHotLiquid,
  isLiquid,
  isReplaceable,
  liquidFog,
  placeSpot,
  placedVariant,
  shapeBoxes,
} from "../src/blocks";
import { MAX_LIGHT } from "../src/constants";
import {
  BUCKET,
  IRON_INGOT,
  LAVA_BUCKET,
  NO_ITEM,
  STICK,
  WATER_BUCKET,
  allItemIds,
  bucketOf,
  bucketUse,
  dropOf,
  isBucket,
  itemName,
  itemStackLimit,
  liquidOf,
  placedBlock,
} from "../src/items";
import { breakTime } from "../src/mining";
import { Player } from "../src/player";
import { raycastVoxels } from "../src/raycast";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { check, describe } from "./harness";

export function run(): void {
  describe("ブロック ID の枠");

  // 1..63 は greedy meshing の統合キー（encodeFace は id に 6 ビットしかない）と
  // アイテム ID を兼ねる。64 以降は面マスクに載らない向き違いだけ。
  const cubes = BLOCKS.filter((b) => b.model === "cube");
  const props = BLOCKS.filter((b) => b.model !== "cube");
  const high = BLOCKS.filter((b) => b.id > MAX_BLOCK_ID);
  console.log(
    `      立方体 ${cubes.length} / 非立方体 ${props.length}` +
      `（うち 64 以降 ${high.length}）  1..63 の空き ${
        MAX_BLOCK_ID - BLOCKS.filter((b) => b.id <= MAX_BLOCK_ID).length + 1
      }`,
  );

  check(
    "立方体はすべて 63 以下（encodeFace の 6 ビットに収まる）",
    cubes.every((b) => b.id <= MAX_BLOCK_ID),
    cubes
      .filter((b) => b.id > MAX_BLOCK_ID)
      .map((b) => b.name)
      .join(" ") || "",
  );
  check(
    "64 以降は立方体でない向き違いだけ",
    high.every((b) => isProp(b.id) && b.variantOf !== AIR),
    high.map((b) => `${b.id}:${b.name}`).join(" "),
  );
  check("ID は上限 255 に収まる", BLOCKS.every((b) => b.id <= MAX_VARIANT_ID));
  check(
    "ID が重複していない",
    new Set(BLOCKS.map((b) => b.id)).size === BLOCKS.length,
    `${BLOCKS.length} 個`,
  );

  // 64 以降の「アイテム」ID は棒・鉱物・道具のもの。**ブロックの 64 以降とは別の空間**で、
  // 向き違いはアイテムを持たないので衝突しない。ここが崩れると、
  // 上付きハーフを置いたつもりで棒が消えるような壊れ方をする。
  const items = new Set(allItemIds());
  check(
    "向き違いの ID にアイテムを作っていない",
    high.every((b) => placedBlock(b.id) !== b.id),
    `${high.length} 個（例: ${high
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
    [...states].filter((id) => id !== STONE_STAIRS).every((id) => id > MAX_BLOCK_ID),
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

  check("草むらは 63 以下（アイテムとして持てる）", TALL_GRASS <= MAX_BLOCK_ID, `ID ${TALL_GRASS}`);
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
  check("壊すと自分が手に入る", dropOf(TALL_GRASS).item === TALL_GRASS);

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

  world.dispose();
}
