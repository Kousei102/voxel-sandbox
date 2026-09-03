import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import {
  AIR,
  END_STONE,
  GRASS,
  LAVA,
  NETHER_BRICK,
  SAND,
  STONE,
  STONE_SLAB,
  WATER,
  WOOL,
  isLiquid,
} from "../src/blocks";
import { MAX_LIGHT, columnOf } from "../src/constants";
import { DayNight } from "../src/daynight";
import {
  DIAMOND_AXE,
  DIAMOND_SWORD,
  EGG,
  ENDER_PEARL,
  FEATHER,
  NO_ITEM,
  RAW_CHICKEN,
  RAW_PORK,
  ROTTEN_FLESH,
  STONE_AXE,
  WOOD_AXE,
  WOOD_HOE,
  WOOD_PICKAXE,
  WOOD_SHOVEL,
  WOOD_SWORD,
  itemName,
} from "../src/items";
import { buildMobMesh } from "../src/mobmesh";
import {
  ATTACK_RANGE,
  BOSSES,
  DESPAWN_DISTANCE,
  HOSTILE_LIGHT_MAX,
  HOSTILE_SIGHT,
  MAX_HOSTILE,
  MOB_ATTACK_COOLDOWN,
  MOB_DAMAGE,
  PLAYER_ATTACK_COOLDOWN,
  attackDamage,
  dropFor,
  dropsFor,
  LOOK_DISTANCE,
  MAX_MOBS,
  MOBS,
  MOB_KINDS,
  Mobs,
  PASSIVE_SKY_MIN,
  SPAWN_MIN_DISTANCE,
  WALK_SWING,
  canSpawnHostile,
  canSpawnPassive,
  hostileFor,
  mobRgb,
  spawnLight,
  sunlightBurns,
  teleportSpot,
  walkSwing,
  type Mob,
  type MobContext,
  type MobDef,
  type MobDropStack,
  type MobKind,
  type MobTarget,
  type MobPhase,
  type OrbitRule,
  type TeleportRule,
} from "../src/mobs";
import { DIMENSIONS, END, OVERWORLD } from "../src/dimensions";
import { PLAYER_OWNER, Projectiles, type Shot } from "../src/projectiles";
import { boxBlocked } from "../src/physics";
import { raycastVoxels } from "../src/raycast";
import type { Sfx } from "../src/sfx";
import { BURN_SECONDS, MAX_HEALTH, MOB_HURT_COOLDOWN, Vitals } from "../src/vitals";
import { Arena, seeded } from "./arena";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";


function ctx(over: Partial<MobContext> = {}): MobContext {
  return { playerX: 0.5, playerY: 11, playerZ: 0.5, brightness: 1, random: seeded(12345), ...over };
}

function flatGrass(): Arena {
  const arena = new Arena();
  arena.fill(-80, 80, 10, 10, -80, 80, GRASS);
  arena.sky = MAX_LIGHT;
  return arena;
}

/**
 * 自然な湧きを止めた試験場。**スカイライトを 0 にするだけでは止まらない** ——
 * 暗い所はそのまま敵対モブの湧き条件になるので、松明ぶんのブロックライトも要る。
 * （受動は sky < 9 で止まり、敵対は max(sky * 明るさ, block) > 7 で止まる。）
 */
function quiet(arena: Arena): Arena {
  arena.sky = 0;
  arena.block = MAX_LIGHT;
  return arena;
}

/** 部位の箱をすべて足した体積。裏返りが 1 面でもあると符号つき体積とずれる。 */
function boxVolume(def: MobDef, group: number): number {
  let total = 0;
  for (const b of def.boxes) {
    if (b.group !== group) continue;
    total += (b.box[3] - b.box[0]) * (b.box[4] - b.box[1]) * (b.box[5] - b.box[2]);
  }
  return total;
}

function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

export function run(): void {
  describe("モブ（純粋と描画の切り分け）");

  // 描画はこの環境では確かめられない。だから「判断」は mobs.ts / mobmesh.ts に
  // 閉じ込めてあり、three の描画に触るのは mobrender.ts だけ。ここが崩れると、
  // モブまわりが丸ごと「ブラウザを開くまで確かめられないもの」になる。
  const mobsSource = stripComments("src/mobs.ts");
  const rendering = ["Mesh", "BufferGeometry", "Material", "document.", "getElementById", "AudioContext", "onBeforeCompile"].filter(
    (name) => mobsSource.includes(name),
  );
  check("mobs.ts は描画に触らない", rendering.length === 0, rendering.join(" "));

  const meshSource = stripComments("src/mobmesh.ts");
  check("mobmesh.ts は three を import しない", !meshSource.includes('from "three"'));

  // 逆向き。判断が描画側へ漏れていないか（漏れると、その判断だけテストが届かなくなる）。
  const renderSource = stripComments("src/mobrender.ts");
  // **飛び方と火への強さもここに足すこと。** 種類ごとの分岐が描画側に生えると、
  // 「ブレイズだけ地面に埋まって見える」類がブラウザを開くまで分からなくなる。
  const decisions = [
    "Math.random(",
    "spawn",
    "damage",
    "MOB_KINDS",
    "maxHealth",
    "hostile",
    "flying",
    "fireproof",
    "flyTarget",
    // **跳び方と湧きの重みもここに足すこと。** 描画側に生えると
    // 「エンダーマンだけ跳んだ先が見えない」類がブラウザを開くまで分からなくなる。
    "teleport",
    "spawnWeight",
    // **ボスの扱い（湧かない・消えない・回る・回復する）もここに足すこと。**
    // 描画側に生えると「ドラゴンだけ輪から外れて見える」類が
    // ブラウザを開くまで分からなくなる。
    "boss",
    "orbit",
    "regen",
    "healers",
    // **刈られたかどうかもここに足すこと。** 見た目（刈られた羊の姿）は別の周だが、
    // 「誰が刈れるか・いつ戻るか」が描画側に生えると、羊を捕まえて刈るまで確かめられない。
    "shearing",
    "woolTimer",
    // **産卵もここに足すこと。** 卵は見た目に出ない（落とし物は `droprender.ts`）が、
    // 「誰が・どれだけの間隔で産むか」が描画側に生えると、鶏に張り付いて
    // 5〜10 分待つまで確かめられない。
    "laying",
    "layTimer",
  ].filter((name) => renderSource.includes(name));
  check("mobrender.ts に判断が漏れていない", decisions.length === 0, decisions.join(" "));

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(
    `      mobs.ts ${lines("src/mobs.ts")} 行 /` +
      ` mobmesh.ts ${lines("src/mobmesh.ts")} 行 /` +
      ` mobrender.ts ${lines("src/mobrender.ts")} 行`,
  );

  describe("モブの形");

  console.log("      種類   部位  頂点  当たり判定      モデルの外形 (x, y, z)");
  for (const kind of MOB_KINDS) {
    const def = MOBS[kind];
    const parts = buildMobMesh(def, mobRgb);

    // モデル全体の外形。グループの pivot を足した位置で見る。
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let vertices = 0;
    for (const b of def.boxes) {
      const p = def.groups[b.group].pivot;
      minX = Math.min(minX, p[0] + b.box[0]);
      maxX = Math.max(maxX, p[0] + b.box[3]);
      minY = Math.min(minY, p[1] + b.box[1]);
      maxY = Math.max(maxY, p[1] + b.box[4]);
      minZ = Math.min(minZ, p[2] + b.box[2]);
      maxZ = Math.max(maxZ, p[2] + b.box[5]);
    }
    for (const part of parts) vertices += part.mesh.positions.length / 3;

    console.log(
      `      ${def.name.padEnd(5)} ${String(parts.length).padStart(3)}` +
        ` ${String(vertices).padStart(5)}` +
        `  ${def.size.half * 2} x ${def.size.height}` +
        `      ${(maxX - minX).toFixed(3)} x ${(maxY - minY).toFixed(3)} x ${(maxZ - minZ).toFixed(3)}`,
    );

    // 巡回順と体積。1 面でも裏返っていると、裏面カリングでそこが丸ごと消える。
    let volumeError = 0;
    for (let g = 0; g < parts.length; g++) {
      verifyWinding(`${def.name}[${g}]`, parts[g].mesh, null);
      volumeError = Math.max(volumeError, Math.abs(signedVolume(parts[g].mesh) - boxVolume(def, g)));
    }
    check(`${def.name}: 体積が箱の合計と一致（裏返りなし）`, volumeError < 1e-6, `ずれ ${volumeError.toExponential(2)}`);
    check(`${def.name}: 頂点数が箱の数と合う`, vertices === def.boxes.length * 24, `${vertices} / ${def.boxes.length * 24}`);

    // **振る部位は軸からぶら下がっていること。** y1 が 0 でないと足首で回り、
    // 見た目には「アニメがおかしい」という形でしか出ない。
    const badPivot = def.boxes.filter((b) => def.groups[b.group].motion === "swing" && b.box[4] !== 0);
    check(`${def.name}: 振る部位は軸からぶら下がる`, badPivot.length === 0, `${badPivot.length} 個が y1 ≠ 0`);

    // モデルが当たり判定からはみ出すと、壁にめり込んで見える。
    // **後ろ（+Z）だけは四足の胴がはみ出してよい**（マイクラも同じで、豚の胴は
    // 当たり判定 0.9 に対して 1 ブロックある）。**前（-Z）と横（X）は必ず収めること** ——
    // 前は歩いていく方向なので鼻が壁に埋まると必ず目に入るし、横は擦り抜けざまに見える。
    // 後ろは尻だけなので、伸ばしても気になりません。
    const longBody = def.kind === "pig" || def.kind === "sheep";
    const front = Math.max(-minX, maxX, -minZ);
    const fits =
      front <= def.size.half + 1e-9 &&
      (longBody || maxZ <= def.size.half + 1e-9) &&
      maxY <= def.size.height + 1e-9;
    check(
      `${def.name}: モデルが当たり判定に収まる${longBody ? "（後ろを除く）" : ""}`,
      fits,
      `前と横 ${front.toFixed(3)} / 後ろ ${maxZ.toFixed(3)}` +
        ` / 高さ ${maxY.toFixed(3)} / 判定 ±${def.size.half} x ${def.size.height}`,
    );

    let badColor = 0;
    let badLight = 0;
    for (const part of parts) {
      for (const c of part.mesh.colors) if (!(c >= 0 && c <= 1)) badColor++;
      if (part.mesh.light.length !== (part.mesh.positions.length / 3) * 2) badLight++;
    }
    check(`${def.name}: 色が 0..1 に収まる`, badColor === 0, `${badColor} 件`);
    check(`${def.name}: 光の属性が頂点数 x 2`, badLight === 0);
  }

  describe("モブの歩行位相");

  console.log("      位相   0    π/2    π    3π/2");
  const swings = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((p) => walkSwing(p));
  console.log(`      振り  ${swings.map((s) => s.toFixed(3).padStart(6)).join(" ")}`);
  check("止まっていれば振れない", walkSwing(0) === 0);
  check("半周で向きが反転する", Math.abs(swings[1] + swings[3]) < 1e-9 && swings[1] > 0);
  check("振れ幅が設定どおり", Math.abs(swings[1] - WALK_SWING) < 1e-9, `${swings[1]} / ${WALK_SWING}`);

  // 位相 0 と π は sin が両方 0 なので、振れ幅が最大になる 1/4 周ずらした所で見る
  const swingPhases = MOBS.pig.groups.filter((g) => g.motion === "swing").map((g) => g.phase);
  const distinct = new Set(swingPhases.map((p) => walkSwing(p + Math.PI / 2).toFixed(6)));
  check("脚が互い違いに振れる", distinct.size === 2, `位相 ${swingPhases.length} 本 / 見え方 ${distinct.size} 通り`);
  check(
    "対角の脚がそろう",
    walkSwing(swingPhases[0] + 1) === walkSwing(swingPhases[3] + 1) &&
      walkSwing(swingPhases[1] + 1) === walkSwing(swingPhases[2] + 1),
  );

  describe("モブの物理");

  const flat = flatGrass();
  quiet(flat); // このグループでは自然な湧きを起こさない
  const world = flat.asWorld();
  const mobs = new Mobs();
  const pigMob = mobs.spawn("pig", 0.5, 16, 0.5, 0, seeded(1));
  check("湧かせると数が増える", mobs.count === 1);

  for (let i = 0; i < 180; i++) mobs.update(1 / 60, world, ctx());
  check("落ちて地面に立つ", pigMob.onGround && Math.abs(pigMob.position.y - 11) < 1e-9, `y=${pigMob.position.y}`);

  // 止めた状態を作って、歩かなければ脚が振れないことを見る
  pigMob.walking = false;
  pigMob.velocity.set(0, 0, 0);
  const restPhase = pigMob.walkPhase;
  for (let i = 0; i < 30; i++) {
    pigMob.walking = false;
    mobs.update(1 / 60, world, ctx());
  }
  check("止まっていれば位相が進まない", Math.abs(pigMob.walkPhase - restPhase) < 1e-6, `位相 ${pigMob.walkPhase.toFixed(3)}`);

  // 歩かせると、歩いた距離ぶんだけ位相が進む（時間ではない）
  const startX = pigMob.position.x;
  const startPhase = pigMob.walkPhase;
  for (let i = 0; i < 120; i++) {
    pigMob.walking = true;
    pigMob.yaw = pigMob.targetYaw = -Math.PI / 2; // +X 向き
    mobs.update(1 / 60, world, ctx());
  }
  const walked = pigMob.position.x - startX;
  check(
    "歩いた距離で位相が進む",
    walked > 2 && pigMob.walkPhase > startPhase,
    `${walked.toFixed(2)} ブロックで位相 +${(pigMob.walkPhase - startPhase).toFixed(2)}`,
  );

  // 壁に押し付けても位相は進まない（時間で刻むと、その場で足踏みして見える）
  const wallArena = new Arena();
  wallArena.fill(-20, 20, 10, 10, -20, 20, STONE);
  wallArena.fill(3, 3, 11, 13, -20, 20, STONE);
  const walled = new Mobs();
  const pusher = walled.spawn("pig", 0.5, 11, 0.5, -Math.PI / 2, seeded(2));
  const push = () => {
    pusher.walking = true;
    pusher.yaw = pusher.targetYaw = -Math.PI / 2;
    walled.update(1 / 60, wallArena.asWorld(), ctx());
  };
  for (let i = 0; i < 180; i++) push();
  const stuckPhase = pusher.walkPhase;
  for (let i = 0; i < 120; i++) push();
  check("壁に押し付けても脚は振れない", pusher.walkPhase === stuckPhase, `位相 ${stuckPhase.toFixed(2)} のまま`);
  check("壁を貫通しない", pusher.position.x < 3, `x=${pusher.position.x.toFixed(3)}`);

  // ハーフブロックは歩いて登れる（段差 0.5）
  const slabArena = new Arena();
  slabArena.fill(-20, 20, 10, 10, -20, 20, STONE);
  slabArena.fill(3, 6, 11, 11, -20, 20, STONE_SLAB);
  const stepper = new Mobs();
  const climber = stepper.spawn("pig", 0.5, 11, 0.5, -Math.PI / 2, seeded(3));
  for (let i = 0; i < 240; i++) {
    climber.walking = true;
    climber.yaw = climber.targetYaw = -Math.PI / 2;
    stepper.update(1 / 60, slabArena.asWorld(), ctx());
  }
  check("ハーフブロックを歩いて登れる", climber.position.y >= 11.5, `y=${climber.position.y.toFixed(3)} x=${climber.position.x.toFixed(2)}`);
  // 段差登りで上がれるものは**跳ばない**（跳ぶと階段を上るたびに跳ねて見える）
  check("ハーフブロックでは跳ばない", climber.onGround, `接地 ${climber.onGround}`);

  // **1 ブロックの段差は跳んで越える。** 段差登りは 0.5 までなので、これが無いと
  // 地形のちょっとした起伏でモブが止まり、ゾンビは 1 段の壁で撒ける。
  /**
   * `wall` の高さぶんの壁へ向かって 6 秒歩かせ、越えられたかを返す。
   * 接地しつづけたか（＝跳んだか）も返す。
   */
  function bumpInto(kind: MobKind, wall: number): { climbed: boolean; jumped: boolean; y: number } {
    const arena = new Arena();
    arena.fill(-20, 20, 10, 10, -20, 20, STONE);
    arena.fill(3, 20, 11, 10 + wall, -20, 20, STONE);
    quiet(arena);
    const pack = new Mobs();
    const mob = pack.spawn(kind, 0.5, 11, 0.5, -Math.PI / 2, seeded(33));
    // **プレイヤーを離しておくこと。** 目の前に置くと、敵対モブは「殴る距離だから
    // 止まる」判定で毎フレーム歩くのをやめ、壁に当たらないまま通ってしまう。
    const away = ctx({ playerX: -40, playerZ: 0.5 });
    let jumped = false;
    for (let i = 0; i < 360; i++) {
      mob.walking = true;
      mob.yaw = mob.targetYaw = -Math.PI / 2; // +X 向き（壁のほう）
      pack.update(1 / 60, arena.asWorld(), away);
      if (!mob.onGround) jumped = true;
      // 越えて着地したら止める。**歩かせ続けないこと** —— 向きを外から固定しているので
      // 崖回避が効かず、速い個体は試験場の縁から落ちて y=0 で終わる。
      if (mob.position.x > 4 && mob.onGround) break;
    }
    return { climbed: mob.position.x > 3, jumped, y: mob.position.y };
  }

  for (const kind of MOB_KINDS) {
    const one = bumpInto(kind, 1);
    console.log(`      ${MOBS[kind].name}: 1 段の壁 → ${one.climbed ? "越えた" : "越えられない"}（y=${one.y.toFixed(2)}）`);
    check(`${MOBS[kind].name}: 1 ブロックの段差を跳び越える`, one.climbed && one.y >= 11, `x が壁の向こうへ / y=${one.y.toFixed(2)}`);
  }
  // 2 段は越えられないこと。**越えられると囲いの意味が無くなる**（家の壁も柵も効かない）。
  const two = bumpInto("zombie", 2);
  check("2 ブロックの壁は越えられない", !two.climbed && two.jumped, `跳んだ ${two.jumped} / 越えた ${two.climbed}`);

  // 水中で沈み続けない（水底を歩き続けると、あとで溺れを入れたときに黙って死ぬ）
  const poolArena = new Arena();
  poolArena.fill(-20, 20, 0, 9, -20, 20, STONE);
  poolArena.fill(-4, 4, 10, 15, -4, 4, WATER);
  const pool = new Mobs();
  const swimmer = pool.spawn("pig", 0.5, 20, 0.5, 0, seeded(4));
  let sank = 20;
  for (let i = 0; i < 600; i++) {
    // 池が狭いので、歩かせると水から出てしまう。ここで見たいのは浮き沈みだけ。
    swimmer.walking = false;
    pool.update(1 / 60, poolArena.asWorld(), ctx());
    sank = Math.min(sank, swimmer.position.y);
  }
  check(
    "水中で沈み続けない（水面まで浮く）",
    swimmer.position.y > 14,
    `いま y=${swimmer.position.y.toFixed(2)} / いちばん沈んだ所 y=${sank.toFixed(2)}（水底は 10）`,
  );

  // 水の中は遅くなる。**プレイヤーと同じ 0.6 倍にすること** ——
  // ずれると、水に逃げ込んだときの追いかけっこの勝敗が一方的になる。
  /** `wet` なら蓋をした水路、そうでなければ平地を 3 秒歩いた距離。 */
  function swimDistance(wet: boolean): number {
    const arena = new Arena();
    arena.fill(-20, 60, 0, 9, -20, 20, STONE);
    if (wet) {
      arena.fill(-20, 60, 10, 20, -6, 6, WATER);
      arena.fill(-20, 60, 21, 21, -6, 6, STONE); // 浮いて水から出ないよう蓋をする
    }
    quiet(arena);
    const pack = new Mobs();
    const mob = pack.spawn("zombie", 0.5, 11, 0.5, -Math.PI / 2, seeded(37));
    const away = ctx({ playerX: -40, playerZ: 0.5 });
    for (let i = 0; i < 180; i++) {
      mob.walking = true;
      mob.yaw = mob.targetYaw = -Math.PI / 2; // +X 向き
      pack.update(1 / 60, arena.asWorld(), away);
    }
    check(
      `水中の判定が効いている（${wet ? "水路" : "平地"}）`,
      (mob.liquid === WATER) === wet,
      `liquid ${mob.liquid}`,
    );
    return mob.position.x - 0.5;
  }
  const onLand = swimDistance(false);
  const inWater = swimDistance(true);
  console.log(
    `      ゾンビが 3 秒で進む距離: 平地 ${onLand.toFixed(2)} / 水中 ${inWater.toFixed(2)}` +
      ` = ${(inWater / onLand).toFixed(2)} 倍（プレイヤーは 0.6 倍）`,
  );
  check(
    "水の中では遅くなる（プレイヤーと同じ 0.6 倍）",
    Math.abs(inWater / onLand - 0.6) < 0.08,
    `${(inWater / onLand).toFixed(2)} 倍`,
  );

  describe("飛ぶモブ（ブレイズ）");

  // **飛ぶモブは重力を受けない。** 落ちてしまえば「ネザー要塞の橋の下の
  // 溶岩の海に沈んだブレイズ」しか居なくなり、ロッドが手に入らない。
  //
  // 判断は `MobDef.flying`（表）と `flyTarget`（5Hz の判断）にあるので、
  // ここは実際に飛ばして高さを見る。**プレイヤーは離しておくこと** ——
  // 近いと追いかけて高さの狙いが変わる（`FLY_ABOVE`）。
  /** `floorY` に床のある試験場で `seconds` 秒飛ばし、いちばん低かった高さと最後の高さを返す。 */
  function hover(kind: MobKind, startY: number, floorY: number, seconds: number) {
    const arena = quiet(new Arena());
    if (floorY >= 0) arena.fill(-40, 40, floorY, floorY, -40, 40, NETHER_BRICK);
    const pack = new Mobs();
    const mob = pack.spawn(kind, 0.5, startY, 0.5, 0, seeded(201));
    const away = ctx({ playerX: -60, playerZ: 0.5, random: seeded(203) });
    let lowest = startY;
    for (let i = 0; i < seconds * 60; i++) {
      pack.update(1 / 60, arena.asWorld(), away);
      lowest = Math.min(lowest, mob.position.y);
    }
    return { y: mob.position.y, lowest, onGround: mob.onGround };
  }

  // 床の上面は floorY + 1。ブレイズはそこから `FLY_HOVER`(2.5) 浮くはずなので 13.5 前後。
  const aloft = hover("blaze", 11, 10, 5);
  const grounded = hover("pig", 11, 10, 5);
  console.log(
    `      床の上面 11 で 5 秒: ブレイズ y=${aloft.y.toFixed(2)}（最低 ${aloft.lowest.toFixed(2)}） /` +
      ` 豚 y=${grounded.y.toFixed(2)}`,
  );
  check(
    "豚は床に立つ（試験場が効いている）",
    Math.abs(grounded.y - 11) < 1e-6 && grounded.onGround,
    `y=${grounded.y}`,
  );
  check(
    "ブレイズは床から浮いて留まる",
    aloft.y > 12.5 && aloft.y < 14.5 && aloft.lowest >= 11,
    `y=${aloft.y.toFixed(2)} / 最低 ${aloft.lowest.toFixed(2)}（床の上面 11）`,
  );

  // **床が届かない所でも落ちない。** `FLY_SCAN`(8) より下にしか床が無いときは
  // その場の高さを保つ（溶岩の海の上がこれ）。0 へ降りると海に浸かる。
  const midair = hover("blaze", 40, -1, 5);
  console.log(`      床の無い所で 5 秒: ブレイズ y=${midair.y.toFixed(2)}（40 から始めた）`);
  check(
    "床が届かなくても高さを保つ（落ちない）",
    Math.abs(midair.y - 40) < 1.5,
    `y=${midair.y.toFixed(2)} / 最低 ${midair.lowest.toFixed(2)}`,
  );

  // **崖では引き返さない。** 飛ぶ意味がここにある（要塞の橋は溶岩の海をまたぐ）。
  {
    const arena = quiet(new Arena());
    arena.fill(-20, 0, 10, 10, -20, 20, NETHER_BRICK);
    arena.fill(6, 30, 10, 10, -20, 20, NETHER_BRICK);
    const pack = new Mobs();
    const mob = pack.spawn("blaze", 0.5, 12, 0.5, -Math.PI / 2, seeded(205));
    const away = ctx({ playerX: -60, playerZ: 0.5, random: seeded(207) });
    let lowest = 12;
    for (let i = 0; i < 480; i++) {
      mob.walking = true;
      mob.yaw = mob.targetYaw = -Math.PI / 2; // +X 向き（溝のほう）
      pack.update(1 / 60, arena.asWorld(), away);
      lowest = Math.min(lowest, mob.position.y);
    }
    console.log(
      `      幅 5 の溝（x 1..5）へ 8 秒: ブレイズ x=${mob.position.x.toFixed(2)} /` +
        ` いちばん低かった高さ ${lowest.toFixed(2)}（床の上面 11）`,
    );
    check(
      "溝を飛び越える（落ちない・引き返さない）",
      mob.position.x > 6 && lowest >= 11,
      `x=${mob.position.x.toFixed(2)} / 最低 ${lowest.toFixed(2)}`,
    );
  }

  describe("跳ぶモブ（エンダーマン）");

  // **跳ぶ判断は 2 つに割れている。** 「いつ跳ぶか」は `Mobs.teleport()`（`world` が要る）、
  // 「どこへ跳べるか」は `teleportSpot()`（純粋に近い。座標しか知らない）。
  // ここは後者を先に、保険が 4 つとも効いていることから見る。
  check("跳ぶのは表に teleport を持つモブだけ", MOBS.enderman.teleport !== null);
  check(
    "跳ぶモブは 1 種類だけ（増やしたら数値を TUNING.md へ）",
    MOB_KINDS.filter((k) => MOBS[k].teleport).join(" ") === "enderman",
    MOB_KINDS.filter((k) => MOBS[k].teleport).join(" "),
  );
  check("エンダーマンはエンダーパールを落とす", MOBS.enderman.drop.item === ENDER_PEARL);
  const TP = MOBS.enderman.teleport as TeleportRule;
  const ENDER_SIZE = MOBS.enderman.size;

  {
    // 床の上に、跳んではいけない所を 3 種類作る:
    // 岩の塊（+X 側。上まで詰まっているので立てない）/ 水たまり（-Z 側）/ 未生成の列。
    const arena = new Arena();
    arena.fill(-40, 40, 10, 10, -40, 40, STONE);
    arena.fill(4, 40, 12, 19, -40, 40, STONE);
    arena.fill(-40, 40, 11, 11, -40, -12, WATER);
    arena.missingColumns.add("1,0");
    quiet(arena);
    const world = arena.asWorld();
    const roll = seeded(601);

    let found = 0;
    let stuck = 0;
    let wet = 0;
    let ghost = 0;
    let strayed = 0;
    for (let i = 0; i < 500; i++) {
      const spot = teleportSpot(world, ENDER_SIZE, 0.5, 11, 0.5, TP.range, TP, roll);
      if (!spot) continue;
      found++;
      // **保険が効いているかは、返ってきた行き先を独立に測って見ること。**
      if (boxBlocked(world, spot.x, spot.y, spot.z, ENDER_SIZE)) stuck++;
      if (isLiquid(arena.getVoxel(Math.floor(spot.x), spot.y, Math.floor(spot.z)))) wet++;
      if (!arena.hasColumn(columnOf(spot.x), columnOf(spot.z))) ghost++;
      // **半径は軸ごとに掛かる**（探すのは正方形の中）ので、円で測らないこと。
      if (Math.abs(spot.y - 11) > TP.vertical) strayed++;
      if (Math.abs(spot.x - 0.5) > TP.range + 1 || Math.abs(spot.z - 0.5) > TP.range + 1) strayed++;
    }
    console.log(
      `      500 回試して行き先が見つかったのは ${found} 回` +
        `（埋まり ${stuck} / 液体 ${wet} / 未生成の列 ${ghost} / 範囲外 ${strayed}）`,
    );
    check("行き先はふつう見つかる（試験場が効いている）", found > 400, `${found} / 500`);
    check("壁や低い天井の中へ跳ばない", stuck === 0, `${stuck} 件`);
    check("液体の中へ跳ばない", wet === 0, `${wet} 件`);
    check("ボクセルの無い列へ跳ばない", ghost === 0, `${ghost} 件`);
    check("range と vertical の外へは跳ばない", strayed === 0, `${strayed} 件`);
  }

  // **行き先が無ければ跳ばない。** 壁の中に出す代わりに、その場に留まるのが正しい。
  {
    const solid = new Arena();
    solid.fill(-40, 40, 0, 40, -40, 40, STONE);
    const nowhere = teleportSpot(solid.asWorld(), ENDER_SIZE, 0.5, 11, 0.5, TP.range, TP, seeded(603));
    check("隙間がまったく無ければ跳ばない（null）", nowhere === null, String(nowhere));
  }

  /** 跳ぶ試験場。**湧きも日光も止めた平地**（`quiet` は sky 0 + block 15）。 */
  function jumpArena(): Arena {
    return quiet(flatGrass());
  }

  check("湧いた直後は跳べない（1 回ぶん待つ）", new Mobs().spawn("enderman", 0.5, 11, 0.5, 0, seeded(604)).teleportTimer === TP.cooldown);

  // 殴られると跳ぶ。**プレイヤーは `HOSTILE_SIGHT`(18) より遠くに置くこと** ——
  // 近いと「間合いを詰める側」の跳びが混ざって、どちらで跳んだのか分からなくなる。
  {
    const arena = jumpArena();
    const pack = new Mobs();
    // 乱数 0 = 必ず跳ぶ側（`hurtChance` 0.5 の内側）。
    const c = ctx({ random: () => 0 });
    const man = pack.spawn("enderman", 0.5, 11, 25.5, 0, seeded(605));
    man.teleportTimer = 0;
    const before = new Vector3().copy(man.position);
    check("殴る前は視界の外に居る（試験場が効いている）", before.distanceTo(new Vector3(0.5, 11, 0.5)) > HOSTILE_SIGHT);
    pack.attack(man, NO_ITEM, c);
    pack.update(1 / 60, arena.asWorld(), c);
    const jumped = Math.hypot(man.position.x - before.x, man.position.z - before.z);
    console.log(`      殴られた直後: ${jumped.toFixed(1)} ブロック跳んだ（体力 ${man.health} / ${MOBS.enderman.maxHealth}）`);
    check("殴られると跳ぶ", jumped > 2, `${jumped.toFixed(1)} ブロック`);
    check("跳んでも消えない（体力が減っただけ）", pack.list.includes(man) && man.health < MOBS.enderman.maxHealth);
    check("跳んだら勢いは消える（着いた先で叩きつけられない）", man.velocity.length() === 0);
  }

  // **確率を外した目では跳ばない。** `hurtChance` を 1 にすると一発も当てられなくなる。
  {
    const arena = jumpArena();
    const pack = new Mobs();
    const c = ctx({ random: () => 0.9 });
    const man = pack.spawn("enderman", 0.5, 11, 25.5, 0, seeded(606));
    man.teleportTimer = 0;
    const before = new Vector3().copy(man.position);
    pack.attack(man, NO_ITEM, c);
    pack.update(1 / 60, arena.asWorld(), c);
    const moved = Math.hypot(man.position.x - before.x, man.position.z - before.z);
    check("確率を外した目では跳ばない", moved < 1, `${moved.toFixed(2)} ブロック / 確率 ${TP.hurtChance}`);
    check("跳ばなくても殴られてはいる", man.health < MOBS.enderman.maxHealth, `体力 ${man.health}`);
  }

  // 間隔（`cooldown`）。殴り続けても、跳ぶのはこの間隔より詰まらない。
  {
    const arena = jumpArena();
    const world = arena.asWorld();
    const pack = new Mobs();
    const c = ctx({ random: () => 0 });
    const man = pack.spawn("enderman", 0.5, 11, 25.5, 0, seeded(607));
    man.teleportTimer = 0;
    const at: number[] = [];
    const prev = new Vector3();
    for (let f = 0; f < 300; f++) {
      pack.attack(man, NO_ITEM, c); // プレイヤー側のクールダウン中は何も起きない
      prev.copy(man.position);
      pack.update(1 / 60, world, c);
      if (Math.hypot(man.position.x - prev.x, man.position.z - prev.z) > 2) at.push(f / 60);
      if (!pack.list.includes(man)) break;
    }
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    console.log(
      `      殴り続けた 5 秒で跳んだのは ${at.length} 回` +
        `（${at.map((t) => t.toFixed(2)).join(" / ")} 秒 → 間隔 ${gaps.map((g) => g.toFixed(2)).join(" / ")}）`,
    );
    check("殴り続ければ何度も跳ぶ", at.length >= 2, `${at.length} 回`);
    check(
      `跳ぶ間隔は cooldown(${TP.cooldown}) を下回らない`,
      gaps.every((g) => g >= TP.cooldown - 1e-6),
      gaps.map((g) => g.toFixed(2)).join(" / "),
    );
  }

  // 遠い相手へは跳んで間合いを詰める。**ゾンビ（跳ばない）と並べて見ること** ——
  // 並べないと「たまたま歩いて近づいた」と区別が付かない。
  {
    /** 1 秒回して、プレイヤーにいちばん近づいた距離。 */
    function closeIn(kind: MobKind, seed: number): number {
      const arena = jumpArena();
      const pack = new Mobs();
      const c = ctx({ random: seeded(seed) });
      const mob = pack.spawn(kind, 0.5, 11, 15.5, 0, seeded(seed + 1));
      mob.teleportTimer = 0;
      let closest = 15;
      for (let f = 0; f < 60; f++) {
        pack.update(1 / 60, arena.asWorld(), c);
        closest = Math.min(closest, Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5));
      }
      return closest;
    }
    const man = closeIn("enderman", 611);
    const zombie = closeIn("zombie", 621);
    console.log(
      `      15 ブロック先から 1 秒: エンダーマン ${man.toFixed(1)} / ゾンビ ${zombie.toFixed(1)} ブロックまで`,
    );
    check("遠い相手へは跳んで間合いを詰める", man < TP.chaseAt, `${man.toFixed(1)} < ${TP.chaseAt}`);
    check("跳ばないモブは歩いてしか近づけない", zombie > TP.chaseAt, `ゾンビ ${zombie.toFixed(1)}`);
  }

  describe("ボス（エンダードラゴン）");

  // **ボスの違いは 3 つとも表の値**（`boss` / `orbit` / `regen`）。ここは
  // 「表がそうなっている」ではなく「実際にそう動く」まで見る。
  {
    const dragon = MOBS.dragon;
    const orbit = dragon.orbit as OrbitRule;
    const bosses = MOB_KINDS.filter((k) => MOBS[k].boss);
    console.log(
      `      ${dragon.name}: 体力 ${dragon.maxHealth} / 一撃 ${dragon.damage} /` +
        ` 輪 半径 ${orbit.radius} 高さ ${orbit.height} 詰める ${orbit.diveAt}m /` +
        ` 回復 毎秒 ${dragon.regen} x もとの数`,
    );
    check(
      "ボスは 1 種類だけ（増やしたら数値を TUNING.md へ）",
      bosses.join(" ") === "dragon",
      bosses.join(" "),
    );
    check("ボスは飛んで、火では焼けない", dragon.flying && dragon.fireproof);
    // **輪より内側で詰め始めること。** 外側だと、中心に立っているだけの相手にも
    // いつも突っ込んでいって、輪が 1 度も見えない。
    check(
      "詰める間合いは輪の半径より内側",
      orbit.diveAt < orbit.radius && orbit.turn > 0,
      `${orbit.diveAt} < ${orbit.radius} / 1 判断あたり ${orbit.turn} rad`,
    );
    // **何も落とさない。** 倒した合図は体力バーとクリア画面（2-13b）の仕事。
    check("ボスは地面に何も落とさない", dragon.drop.count === 0 && dragon.drop.item === NO_ITEM);

    // 綴りの突き合わせ（`daynight.ts` の `SKY_STYLES` と同じ作法）。
    // **`mobs.ts` は `dimensions.ts` を import しない**ので、ここでしか気付けない。
    const ids = new Set(DIMENSIONS.map((d) => d.id));
    const unknown = Object.keys(BOSSES).filter((key) => !ids.has(key as (typeof DIMENSIONS)[number]["id"]));
    console.log(`      ボスの居る次元: ${Object.keys(BOSSES).join(" ")} / 次元の表 ${[...ids].join(" ")}`);
    check("ボスの表のキーが次元の表にある", unknown.length === 0, unknown.join(" "));
  }

  /** エンドの島に見立てた台（上面 y=48）。**外周より先は虚空。** */
  function islandArena(): Arena {
    const arena = new Arena();
    arena.fill(-40, 40, 40, 48, -40, 40, END_STONE);
    return quiet(arena);
  }

  /** 召喚して 1 体返す。**null なら試験場が壊れている**ので、そこで落とす。 */
  function summonDragon(boss: Mobs, world: ReturnType<Arena["asWorld"]>) {
    // 倒した印はまだ立っていない（印そのものは `test/exitportal.test.ts`）。
    const mob = boss.ensureBoss(END, world, false);
    if (!mob) throw new Error("試験場でボスが湧かない");
    return mob;
  }

  /** プレイヤーが次に殴れるまでのフレーム数（下の戦闘の節と同じ値）。 */
  const BOSS_SWING_FRAMES = Math.ceil(PLAYER_ATTACK_COOLDOWN * 60) + 1;

  /**
   * ドラゴンを名前で指した攻め方の番に入れ直す（残り時間も満タンにする）。
   *
   * **番を止める仕掛けは足していない。** 測りたい動き（詰める・撃つ）は番が
   * 回ってくるあいだしか出ないので、**測る直前にここへ入れてから回すこと** ——
   * 入れずに長く回すと、たまたま別の番に入っていて「動かない」と読める。
   */
  function enterPhase(mob: { kind: MobKind; phase: number; phaseTimer: number }, name: string): MobPhase {
    const phases = MOBS[mob.kind].phases;
    const index = phases?.findIndex((p) => p.name === name) ?? -1;
    if (!phases || index < 0) throw new Error(`${mob.kind} に「${name}」の番が無い`);
    mob.phase = index;
    mob.phaseTimer = phases[index].seconds;
    return phases[index];
  }

  {
    const orbit = MOBS.dragon.orbit as OrbitRule;
    const arena = islandArena();
    const world = arena.asWorld();
    const boss = new Mobs();

    check("ボスの居ない次元では湧かない", boss.ensureBoss(OVERWORLD, world, false) === null);
    check("表に無い名前でも落ちない", boss.ensureBoss("なんとか", world, false) === null);

    // **未読み込みの列では見送ること**（`getVoxel` は AIR を返すので、そのまま
    // 湧かせると虚空に置いて落とす）。次のフレームに持ち越せるよう、印も立てない。
    const dark = islandArena();
    dark.missingColumns.add(`${columnOf(orbit.radius)},0`);
    check(
      "中心の列が未読み込みなら湧かせない",
      new Mobs().ensureBoss(END, dark.asWorld(), false) === null,
    );

    const dragon = boss.ensureBoss(END, world, false);
    const homeDistance = dragon ? Math.hypot(dragon.position.x - dragon.homeX, dragon.position.z - dragon.homeZ) : -1;
    console.log(
      `      召喚: ${dragon ? `(${dragon.position.x}, ${dragon.position.y}, ${dragon.position.z})` : "湧かない"}` +
        ` / 中心 (${dragon?.homeX}, ${dragon?.homeZ}) から ${homeDistance.toFixed(1)}m`,
    );
    check("エンドではボスが 1 体湧く", !!dragon && dragon.kind === "dragon" && boss.count === 1);
    check("地面の上に湧く（虚空でも埋まってもいない）", !!dragon && dragon.position.y === 49, `y=${dragon?.position.y}`);
    // **中心ではなく輪の上に湧くこと。** 中心に湧かせると、ポータルから降りた人の
    // 真上に出て、輪に出る前に殴りかかることになる。
    check(
      "湧くのは輪の上（中心ではない）",
      Math.abs(homeDistance - orbit.radius) < 1,
      `${homeDistance.toFixed(1)} / 半径 ${orbit.radius}`,
    );
    check("中心は表の点（湧いた場所ではない）", dragon?.homeX === 0.5 && dragon?.homeZ === 0.5);

    boss.ensureBoss(END, world, false);
    boss.ensureBoss(END, world, false);
    check("何度呼んでも 1 体しか湧かない", boss.count === 1, `${boss.count} 体`);

    // --- 倒したかどうか（この読み込みのあいだの記憶） -------------------------

    // **先に「まだ倒していない」ことを確かめる**（`rules/testing.md`）。これが無いと、
    // 下の「倒した」が「そもそも常に true」と見分けが付かない。
    check("生きているあいだは倒したことにならない", !boss.bossDefeated(END));
    check("ボスの居ない次元は倒しようがない", !boss.bossDefeated(OVERWORLD));

    // **倒したら湧き直さないこと。** 毎フレーム呼ぶので、湧き直すと倒せなくなる。
    if (dragon) boss.attack(dragon, NO_ITEM, ctx(), () => 0);
    boss.list.length = 0;
    console.log(`      倒したあと: bossDefeated ${boss.bossDefeated(END)} / ${boss.count} 体`);
    check("倒したら「倒した」になる", boss.bossDefeated(END));
    boss.ensureBoss(END, world, false);
    check("倒したあとは湧き直さない", boss.count === 0, `${boss.count} 体`);

    // 読み込み直し（`startWorld()` の `clear()`）で記憶は消える。**そこから先を
    // 支えるのがワールドに建つ印**（`exitportal.ts` の出口ポータル）で、
    // `main.ts` はそれを `defeated` として渡す。
    boss.clear();
    check("作り直すと記憶は消える", !boss.bossDefeated(END));
    check(
      "印が立っていれば、作り直しても湧かない",
      boss.ensureBoss(END, world, true) === null && boss.count === 0,
      `${boss.count} 体`,
    );
    check("印が無ければまた湧く", !!boss.ensureBoss(END, world, false), `${boss.count} 体`);
  }

  {
    // **ボスは遠くても消えない。** 消えると、輪の反対側へ回った拍子に戦いが終わる。
    const arena = islandArena();
    const world = arena.asWorld();
    const boss = new Mobs();
    const dragon = summonDragon(boss, world);
    const far = ctx({ playerX: 300.5, playerY: 49, playerZ: 300.5 });
    const zombie = boss.spawn("zombie", 0.5, 49, 0.5, 0, seeded(71));
    boss.update(1 / 60, world, far);
    console.log(
      `      ${DESPAWN_DISTANCE}m より遠くのプレイヤー: ボス ${boss.list.includes(dragon) ? "残る" : "消えた"}` +
        ` / ゾンビ ${boss.list.includes(zombie) ? "残る" : "消えた"}`,
    );
    check("遠くてもボスは消えない", boss.list.includes(dragon));
    check("ふつうのモブは消える（試験場が効いている）", !boss.list.includes(zombie));

    // 数の上限で間引かれもしないこと（上限は遠いものから捨てる）。
    for (let i = 0; i < MAX_MOBS + 4; i++) {
      boss.spawn("zombie", 0.5 + i * 0.1, 49, 0.5, 0, seeded(80 + i));
    }
    boss.update(1 / 60, world, ctx({ playerX: 0.5, playerY: 49, playerZ: 0.5 }));
    check(
      "数の上限でもボスは間引かれない",
      boss.list.includes(dragon) && boss.count <= MAX_MOBS,
      `${boss.count} 体 / 上限 ${MAX_MOBS}`,
    );
  }

  {
    // **実際に回るところまで見る。** 表の値だけを見ると、`aimOrbit` を呼び忘れても通る。
    const orbit = MOBS.dragon.orbit as OrbitRule;
    const arena = islandArena();
    const world = arena.asWorld();
    const boss = new Mobs();
    const dragon = summonDragon(boss, world);
    // プレイヤーは輪の外（`diveAt` より遠く）に置く。目の前に置くと詰めに来て回らない。
    const away = ctx({ playerX: 200.5, playerY: 49, playerZ: 200.5 });

    let turned = 0;
    let last = Math.atan2(dragon.position.z - dragon.homeZ, dragon.position.x - dragon.homeX);
    let minRadius = Infinity;
    let maxRadius = 0;
    const samples: string[] = [];
    for (let f = 0; f < 60 * 30; f++) {
      boss.update(1 / 60, world, away);
      const angle = Math.atan2(dragon.position.z - dragon.homeZ, dragon.position.x - dragon.homeX);
      let step = angle - last;
      while (step > Math.PI) step -= Math.PI * 2;
      while (step < -Math.PI) step += Math.PI * 2;
      turned += step;
      last = angle;
      // 最初の 5 秒は輪へ寄せる時間なので測らない（湧くのは輪の上だが、高さは地面）。
      if (f > 60 * 5) {
        const r = Math.hypot(dragon.position.x - dragon.homeX, dragon.position.z - dragon.homeZ);
        minRadius = Math.min(minRadius, r);
        maxRadius = Math.max(maxRadius, r);
      }
      if (f % (60 * 6) === 0) samples.push(`${(turned / Math.PI).toFixed(2)}π`);
    }
    console.log(
      `      30 秒回して ${(turned / Math.PI).toFixed(2)}π 周（${samples.join(" → ")}）/` +
        ` 半径 ${minRadius.toFixed(1)}〜${maxRadius.toFixed(1)}（表は ${orbit.radius}）/` +
        ` 高さ ${dragon.position.y.toFixed(1)}（中心の地面 ${dragon.homeY} + ${orbit.height}）`,
    );
    check("30 秒で 1 周以上まわる", Math.abs(turned) > Math.PI * 2, `${(turned / Math.PI).toFixed(2)}π`);
    check(
      "輪の半径を保つ（中心へ落ちも、飛び去りもしない）",
      minRadius > orbit.radius - 4 && maxRadius < orbit.radius + 4,
      `${minRadius.toFixed(1)}〜${maxRadius.toFixed(1)} / ${orbit.radius}`,
    );
    // **高さは中心の地面から測ること。** 自分の足元から測ると、輪が島のふちに
    // 掛かったときだけ（下が虚空で `groundBelow` が見つけられず）高さが跳ねる。
    check(
      "輪の高さを保つ",
      Math.abs(dragon.position.y - (dragon.homeY + orbit.height)) < 2,
      `y=${dragon.position.y.toFixed(1)} / 目標 ${dragon.homeY + orbit.height}`,
    );
    check("虚空へは出ない（島の上に居る）", Math.hypot(dragon.position.x, dragon.position.z) < 40);
  }

  {
    // **近づかれたら輪を離れて詰めること。** 回るだけなら、輪の下から矢を撃つだけの
    // 一方的な作業になる（本家のドラゴンも、近づくと突っ込んでくる）。
    const orbit = MOBS.dragon.orbit as OrbitRule;
    const arena = islandArena();
    const world = arena.asWorld();
    const boss = new Mobs();
    const dragon = summonDragon(boss, world);
    // **先に輪へ上げてから近づくこと。** 湧いた直後は地面の上に居るので、
    // フレーム 0 から測ると「降りてきた」も「詰めてきた」も最初から満たしてしまう
    // （実際そう書いて、`aimOrbit` を止めても緑のままだった）。
    const away = ctx({ playerX: 200.5, playerY: 49, playerZ: 200.5 });
    for (let f = 0; f < 60 * 12; f++) boss.update(1 / 60, world, away);
    const ringY = dragon.position.y;
    // 輪の内側（`diveAt` の内側）の地面に立つ。**輪の真下に立たないこと** ——
    // 距離 0 から始まると「近づいた」が測れない。
    const near = ctx({ playerX: 8.5, playerY: 49, playerZ: 0.5, random: seeded(97) });
    // **詰める番に入れてから測ること。** 攻め方は順ぐりに回るので、12 秒回した
    // あとはブレスの番に入っている（そこでは近づかれても輪を離れない）。
    enterPhase(dragon, "近接");
    const before = Math.hypot(dragon.position.x - near.playerX, dragon.position.z - near.playerZ);
    let closest = before;
    let lowest = ringY;
    for (let f = 0; f < 60 * 8; f++) {
      boss.update(1 / 60, world, near);
      closest = Math.min(closest, Math.hypot(dragon.position.x - near.playerX, dragon.position.z - near.playerZ));
      lowest = Math.min(lowest, dragon.position.y);
    }
    console.log(
      `      12 秒で輪（y=${ringY.toFixed(1)}）へ上がってから、内側に立って 8 秒:` +
        ` 最短 ${closest.toFixed(1)}m（開始 ${before.toFixed(1)}m）/` +
        ` いちばん低い所 y=${lowest.toFixed(1)}`,
    );
    check("輪へ上がってから測っている（試験場が効いている）", ringY > 49 + orbit.height - 2, `y=${ringY.toFixed(1)}`);
    check("近づかれたら詰めてくる", closest < ATTACK_RANGE + 1 && closest < before - 3, `${before.toFixed(1)} → ${closest.toFixed(1)}m`);
    check(
      "詰めるときは輪の高さを離れて降りてくる",
      lowest < ringY - 4,
      `y=${lowest.toFixed(1)} / 輪 ${ringY.toFixed(1)}`,
    );

    // **降りてきたら実際に届くこと。** ブレイズの浮き（2.5）をそのまま使っていた頃は、
    // 目の前まで来ても `ATTACK_HEIGHT`(1.5) に届かず**一度も殴れないボス**だった。
    const taken: number[] = [];
    const armed = ctx({
      playerX: near.playerX,
      playerY: near.playerY,
      playerZ: near.playerZ,
      random: seeded(98),
      vitals: {
        damage: (amount) => {
          taken.push(amount);
          return true;
        },
      },
    });
    // 8 秒回したぶんで「近接」の番（10 秒）が尽きかけているので入れ直す。
    enterPhase(dragon, "近接");
    for (let f = 0; f < 60 * 6; f++) boss.update(1 / 60, world, armed);
    console.log(
      `      そのあと 6 秒で ${taken.length} 発 x ${taken[0] ?? 0}（表は ${MOBS.dragon.damage}）/` +
        ` 浮く高さ ${MOBS.dragon.hover}（ブレイズは ${MOBS.blaze.hover}）`,
    );
    check(
      "降りてきたら近接が届く",
      taken.length > 0 && taken.every((n) => n === MOBS.dragon.damage),
      `${taken.length} 発 / 1 発 ${taken[0]}`,
    );
  }

  {
    // **攻め方が順ぐりに入れ替わること**（`MobDef.phases`）。表だけ見ても、
    // `advancePhase()` を呼び忘れれば 1 つ目の番のまま固まる（近接しかしない
    // ボスに戻る。**それが `REVIEW.md` に上がった症状**）。
    const phases = MOBS.dragon.phases as readonly MobPhase[];
    const cycle = phases.reduce((sum, p) => sum + p.seconds, 0);
    console.log(
      `      番: ${phases.map((p) => `${p.name} ${p.seconds}秒` + (p.chase ? "・詰める" : "") + (p.shoot ? `・撃つ(${p.above} 上)` : "")).join(" / ")}` +
        `（1 周 ${cycle} 秒）`,
    );
    check("番が 3 つある", phases.length === 3, `${phases.length} つ`);
    check("詰めるのは 1 つの番だけ", phases.filter((p) => p.chase).length === 1);
    check("撃つのは 1 つの番だけ", phases.filter((p) => p.shoot).length === 1);
    // **隙が要る。** どちらかを always 仕掛けていると、柱のクリスタルを割りに行けない。
    check("何も仕掛けない番がある", phases.some((p) => !p.chase && !p.shoot));
    const shooting = phases.find((p) => p.shoot) as MobPhase;
    check("撃つ番はプレイヤーの上を飛ぶ", shooting.above >= 10, `${shooting.above} マス上`);
    check("撃つ番では詰めない（撃ちながら殴りに来ない）", !shooting.chase);

    const arena = islandArena();
    const world = arena.asWorld();
    const boss = new Mobs();
    const dragon = summonDragon(boss, world);
    const away = ctx({ playerX: 200.5, playerY: 49, playerZ: 200.5 });
    const order: string[] = [];
    for (let f = 0; f < Math.round((cycle + 1) * 60); f++) {
      const name = phases[dragon.phase].name;
      if (order[order.length - 1] !== name) order.push(name);
      boss.update(1 / 60, world, away);
    }
    console.log(`      ${cycle + 1} 秒回して: ${order.join(" → ")}`);
    check(
      "表の並びどおりに回って先頭へ戻る",
      order.length === phases.length + 1 &&
        order.every((name, i) => name === phases[i % phases.length].name),
      order.join(" → "),
    );
  }

  {
    // **ブレスを実際に撃つところまで見る。** 表に `ranged` を足しただけでは、
    // 番の判定（`fire()`）を書き忘れても通る。
    const ranged = MOBS.dragon.ranged;
    const shooting = (MOBS.dragon.phases as readonly MobPhase[]).find((p) => p.shoot) as MobPhase;
    const orbit = MOBS.dragon.orbit as OrbitRule;
    check(
      "撃つ間合いは輪の半径より長い（輪の上から中心へ届く）",
      !!ranged && ranged.range > orbit.radius,
      `${ranged?.range}m / 輪 ${orbit.radius}`,
    );

    /**
     * 輪へ上げてから `phase` の番に入れ、**その番のあいだだけ**回して注文を集める。
     *
     * **番の長さを超えて回さないこと** —— 超えたぶんは次の番なので、
     * 「近接の番では撃たない」を測っているつもりでブレスの番の初弾を数える
     * （実際にそれで 1 発数えた）。
     *
     * **`秒 * 60` フレームは「超えて」に当たります。** `advancePhase()` は残りが 0 に
     * なったフレームで次の番へ進めるので、ちょうど回すと**最後の 1 フレームは次の番**。
     * そのフレームで判断（5Hz）が回るかどうかは、湧いたときの `thinkTimer`
     * （`Math.random() * AI_TICK`）次第です —— 回れば `aimOrbit()` が `flyTarget` を
     * 次の番の高さに書き直すので、**「ブレスの番はプレイヤーの真上を狙う」が
     * 6 回に 1 回ほど落ちていました**（61.0 / 59 = 輪の高さ）。1 フレーム手前で止めます。
     */
    function flyPhase(phase: string) {
      const table = MOBS.dragon.phases as readonly MobPhase[];
      const index = table.findIndex((p) => p.name === phase);
      const seconds = table[index].seconds;
      const arena = islandArena();
      const world = arena.asWorld();
      const boss = new Mobs();
      const dragon = summonDragon(boss, world);
      const shots: Shot[] = [];
      const at: number[] = [];
      // プレイヤーは島の中心（輪の内側だが `diveAt`(16) の外）。
      const player = ctx({
        playerX: 0.5,
        playerY: 49,
        playerZ: 0.5,
        random: seeded(41),
        shoot: (shot) => {
          shots.push(shot);
          at.push(frames / 60);
        },
      });
      let frames = 0;
      // **先に輪へ上げること**（湧いた直後は地面の上）。上げるあいだは撃たない番で回す。
      enterPhase(dragon, "旋回");
      for (let f = 0; f < 60 * 12; f++) boss.update(1 / 60, world, player);
      const ringY = dragon.position.y;
      const ringTarget = dragon.flyTarget;
      enterPhase(dragon, phase);
      for (frames = 0; frames < Math.round(seconds * 60) - 1; frames++) boss.update(1 / 60, world, player);
      // **測り終えた時点でまだその番に居ること。** これを出しておかないと、
      // 上の 1 フレームがまた入り込んでも「別の番の値を測っている」と気付けません。
      return { shots, at, dragon, ringY, ringTarget, player, stillIn: dragon.phase === index };
    }

    const breath = flyPhase("ブレス");
    check("測っているあいだ「ブレス」の番から出ていない", breath.stillIn, `phase ${breath.dragon.phase}`);
    const gaps = breath.at.slice(1).map((t, i) => t - breath.at[i]);
    const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    console.log(
      `      ブレスの番 ${shooting.seconds} 秒で ${breath.shots.length} 発` +
        `（初弾 ${breath.at[0]?.toFixed(2)} 秒・間隔 ${mean.toFixed(2)} 秒 / 表は ${ranged?.cooldown} 秒）`,
    );
    check(
      "ブレスの番では撃つ",
      breath.shots.length > 0 && breath.shots.every((s) => s.kind === "breath"),
      `${breath.shots.length} 発`,
    );
    check(
      "表の間隔どおりに撃つ",
      !!ranged && gaps.length > 3 && Math.abs(mean - ranged.cooldown) < 0.2,
      `${mean.toFixed(2)} 秒 / ${ranged?.cooldown} 秒`,
    );
    // **番に入った瞬間の初弾を待たせること**（湧いた直後と同じ理屈）。
    check("番に入った瞬間には撃たない", (breath.at[0] ?? 0) >= (ranged?.cooldown ?? 0) - 0.05, `${breath.at[0]?.toFixed(2)} 秒`);
    check(
      "撃った本人の印はドラゴン（自分のブレスで焼けない）",
      breath.shots.every((s) => s.owner === breath.dragon.id),
      `${breath.shots[0]?.owner}`,
    );
    check(
      "重みは表どおり",
      !!ranged && breath.shots.every((s) => s.damage === ranged.damage),
      `${breath.shots[0]?.damage}`,
    );
    // 10 マス上から撃ち下ろすので、向きは必ず下を向く。
    check("上から撃ち下ろす", breath.shots.every((s) => s.dy < 0), `${breath.shots[0]?.dy.toFixed(1)}`);

    // **高さはプレイヤー基準**（輪の高さのままだと、柱の上に登られると頭を取れない）。
    console.log(
      `      高さ: 旋回の番 y=${breath.ringY.toFixed(1)}（目標 ${breath.ringTarget.toFixed(1)}）→` +
        ` ブレスの番 y=${breath.dragon.position.y.toFixed(1)}（目標 ${breath.dragon.flyTarget.toFixed(1)}` +
        ` = プレイヤー ${breath.player.playerY} + ${shooting.above}）`,
    );
    check(
      "ブレスの番はプレイヤーの真上の高さを狙う",
      Math.abs(breath.dragon.flyTarget - (breath.player.playerY + shooting.above)) < 1e-6,
      `${breath.dragon.flyTarget.toFixed(1)} / ${breath.player.playerY + shooting.above}`,
    );
    check(
      "狙った高さまで実際に上がり下がりする",
      Math.abs(breath.dragon.position.y - breath.dragon.flyTarget) < 2,
      `y=${breath.dragon.position.y.toFixed(1)} / 目標 ${breath.dragon.flyTarget.toFixed(1)}`,
    );

    // **撃たない番では 1 発も撃たないこと。** 撃つ番と同じ間合い・同じ視界で回す。
    const melee = flyPhase("近接");
    const idle = flyPhase("旋回");
    console.log(
      `      同じ間合いで: 近接の番（${MOBS.dragon.phases![0].seconds} 秒）${melee.shots.length} 発 /` +
        ` 旋回の番（${MOBS.dragon.phases![2].seconds} 秒）${idle.shots.length} 発`,
    );
    check("近接の番では撃たない", melee.shots.length === 0 && melee.stillIn, `${melee.shots.length} 発`);
    check("旋回の番では撃たない", idle.shots.length === 0 && idle.stillIn, `${idle.shots.length} 発`);
    // 旋回の番は輪の高さのまま（プレイヤー基準にしない）。
    check(
      "旋回の番は輪の高さを保つ",
      Math.abs(idle.dragon.flyTarget - (idle.dragon.homeY + orbit.height)) < 1e-6,
      `${idle.dragon.flyTarget.toFixed(1)} / ${idle.dragon.homeY + orbit.height}`,
    );
  }

  {
    // **回復のもとの数は呼ぶ側が渡す**（`MobContext.healers`）。ここは
    // 「渡した数だけ速く戻る」「上限を超えない」「渡さなければ戻らない」の 3 つ。
    const arena = islandArena();
    const world = arena.asWorld();
    const dragon = MOBS.dragon;

    /** 体力を `hurt` だけ削ってから、もとが `healers` 個ある状態で 1 秒回す。 */
    function recover(healers: number, hurt: number): number {
      const boss = new Mobs();
      const mob = summonDragon(boss, world);
      mob.health = dragon.maxHealth - hurt;
      const c = ctx({ playerX: 200.5, playerY: 49, playerZ: 200.5, healers });
      for (let f = 0; f < 60; f++) boss.update(1 / 60, world, c);
      return mob.health - (dragon.maxHealth - hurt);
    }

    const none = recover(0, 100);
    const one = recover(1, 100);
    const all = recover(10, 100);
    console.log(
      `      1 秒あたりの回復: もと 0 個 ${none.toFixed(1)} / 1 個 ${one.toFixed(1)} /` +
        ` 10 個 ${all.toFixed(1)}（表は 1 個につき ${dragon.regen}）`,
    );
    check("もとが無ければ回復しない", none === 0, `${none.toFixed(2)}`);
    check("もと 1 個で表どおり戻る", Math.abs(one - dragon.regen) < 0.2, `${one.toFixed(2)} / ${dragon.regen}`);
    check("もとの数だけ速く戻る", Math.abs(all - dragon.regen * 10) < 0.5, `${all.toFixed(2)}`);
    // **上限を超えて溜めないこと。** 溜まると、もとを全部落としたあとも
    // しばらく減らない「見えない体力」ができる。
    const over = recover(10, 1);
    check("満タンを超えて溜めない", Math.abs(over - 1) < 1e-6, `${(dragon.maxHealth - 1 + over).toFixed(1)}`);
  }

  {
    // **クリア導線そのもの。** クリスタルが生きているうちは倒せず、
    // 落としきると倒せる —— ここが崩れると柱を落とす意味が消える。
    const arena = islandArena();
    const world = arena.asWorld();
    const weapon = STONE_AXE;

    /** もとが `healers` 個ある状態で、`swings` 回まで殴ってみる。 */
    function duel(healers: number, swings: number): { hits: number; alive: boolean; health: number } {
      const boss = new Mobs();
      const mob = summonDragon(boss, world);
      const c = ctx({ playerX: mob.position.x, playerY: 49, playerZ: mob.position.z, healers });
      let hits = 0;
      while (hits < swings && boss.count > 0) {
        if (boss.attack(mob, weapon, c)) hits++;
        for (let f = 0; f < BOSS_SWING_FRAMES; f++) boss.update(1 / 60, world, c);
      }
      return { hits, alive: boss.count > 0, health: mob.health };
    }

    const guarded = duel(10, 80);
    const alone = duel(0, 80);
    console.log(
      `      石の斧で殴り続ける: クリスタル 10 個 → ${guarded.hits} 回で体力 ${guarded.health.toFixed(0)}` +
        ` / 0 個 → ${alone.hits} 回で ${alone.alive ? "生存" : "撃破"}`,
    );
    check(
      "クリスタルが生きているうちは倒せない",
      guarded.alive && guarded.health > MOBS.dragon.maxHealth / 2,
      `体力 ${guarded.health.toFixed(0)} / ${MOBS.dragon.maxHealth}`,
    );
    check("クリスタルを落としきれば倒せる", !alone.alive, `${alone.hits} 回で体力 ${alone.health.toFixed(0)}`);
  }

  describe("湧く地面（どの敵対モブになるか）");

  // **地面を指定したモブが勝つ。** 同じ土俵で抽選すると、要塞の半分がゾンビになって
  // 「ブレイズロッドを集める場所」という意味が薄れる。
  const groundRoll = seeded(211);
  const onBrick = new Set<string>();
  const onStone: Record<string, number> = {};
  const ROLLS = 2000;
  for (let i = 0; i < ROLLS; i++) {
    onBrick.add(String(hostileFor(NETHER_BRICK, groundRoll)));
    const kind = String(hostileFor(STONE, groundRoll));
    onStone[kind] = (onStone[kind] ?? 0) + 1;
  }
  console.log(
    `      ネザーレンガ → ${[...onBrick].join(" ")} / 石 → ` +
      Object.entries(onStone)
        .map(([k, n]) => `${k} ${((n / ROLLS) * 100).toFixed(1)}%`)
        .join(" / "),
  );
  check("ネザーレンガの上ではブレイズだけ", onBrick.size === 1 && onBrick.has("blaze"), [...onBrick].join(" "));
  // **地面を指定しない敵対は重み（`spawnWeight`）で分ける。** 均等割りだったころ、
  // エンダーマン（体力 40・一撃 7）を足した瞬間に夜の敵対の半分がエンダーマンになった。
  {
    // **ボスは抽選に出てこない**（`HOSTILE_KINDS` が外している）。ここで外し忘れると
    // 「表の重みどおり」が永久に合わなくなる ——
    // 下の「ボスは自然に湧かない」で、実際に 1 度も出ないことを見ている。
    const anywhere = MOB_KINDS.filter((k) => MOBS[k].hostile && !MOBS[k].boss && !MOBS[k].spawnOn);
    const total = anywhere.reduce((sum, k) => sum + MOBS[k].spawnWeight, 0);
    const off = anywhere.map((k) => Math.abs((onStone[k] ?? 0) / ROLLS - MOBS[k].spawnWeight / total));
    console.log(
      `      重みの表: ${anywhere.map((k) => `${MOBS[k].name} ${MOBS[k].spawnWeight}`).join(" / ")}` +
        `（ずれ 最大 ${(Math.max(...off) * 100).toFixed(1)} ポイント）`,
    );
    check(
      "地面を指定しない敵対は表の重みどおりに湧く",
      anywhere.every((k) => (onStone[k] ?? 0) > 0) && Math.max(...off) < 0.03,
      `${anywhere.length} 種類 / ずれ ${(Math.max(...off) * 100).toFixed(1)} ポイント`,
    );
    check(
      "ゾンビがいちばん出やすい（エンダーマンはたまに）",
      (onStone.zombie ?? 0) > (onStone.enderman ?? 0) * 5,
      `ゾンビ ${onStone.zombie ?? 0} / エンダーマン ${onStone.enderman ?? 0}`,
    );
  }
  check(
    "地面を指定したモブは「どこでも」の地面に湧かない",
    MOB_KINDS.every((kind) => !MOBS[kind].spawnOn || MOBS[kind].hostile),
    "受動モブに spawnOn を付けるなら trySpawn 側も直すこと",
  );
  // **ボスは抽選のどの土俵にも出てこないこと。** 出ると、夜のオーバーワールドや
  // 要塞の床にドラゴンが湧く（体力 200・一撃 10）。
  {
    const bosses = MOB_KINDS.filter((k) => MOBS[k].boss);
    const drawn = new Set<string>();
    const roll = seeded(313);
    for (let i = 0; i < 4000; i++) {
      drawn.add(String(hostileFor(STONE, roll)));
      drawn.add(String(hostileFor(NETHER_BRICK, roll)));
    }
    console.log(`      ボス ${bosses.map((k) => MOBS[k].name).join(" ")} / 8000 回の抽選 → ${[...drawn].join(" ")}`);
    check(
      "ボスは抽選に出てこない（自然には湧かない）",
      bosses.length > 0 && bosses.every((k) => !drawn.has(k)),
      `ボス ${bosses.length} 種類 / 抽選に出たのは ${[...drawn].join(" ")}`,
    );
  }

  // 実際に湧かせる。**要塞の床（ネザーレンガ）を暗くした試験場**で、
  // 出てくるのがブレイズだけであること。
  {
    const arena = new Arena();
    arena.fill(-80, 80, 10, 10, -80, 80, NETHER_BRICK);
    arena.sky = 0;
    arena.block = 0; // 暗い ＝ 敵対モブの湧き条件
    const pack = new Mobs();
    pack.populate(arena.asWorld(), ctx({ random: seeded(213) }), 400);
    const kinds = new Set(pack.list.map((m) => m.kind));
    console.log(`      ネザーレンガの平地に 400 回試して ${pack.count} 体 / 種類 ${[...kinds].join(" ")}`);
    check("要塞の床には実際に湧く（試験場が効いている）", pack.count > 0, `${pack.count} 体`);
    check("湧いたのはブレイズだけ", kinds.size === 1 && kinds.has("blaze"), [...kinds].join(" "));
  }

  describe("モブの湧き（明るさの判定）");

  // **シェーダの合成とまったく同じ式であること。** ずれると「明るく見えるのに湧く」場所ができる。
  const clock = new DayNight();
  console.log("      時刻    明るさ  地表の実効光  洞窟  松明の下");
  for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    clock.setTime(t);
    const b = clock.brightness;
    console.log(
      `      ${clock.clock()}  ${b.toFixed(3)}` +
        `   ${spawnLight(15, 0, b).toFixed(2).padStart(6)}` +
        `      ${spawnLight(0, 0, b).toFixed(2).padStart(4)}` +
        `  ${spawnLight(15, 14, b).toFixed(2).padStart(6)}`,
    );
  }
  clock.setTime(0.25);
  const noon = clock.brightness;
  clock.setTime(0.75);
  const midnight = clock.brightness;
  check("南中の地表は明るい", spawnLight(15, 0, noon) > 7, `${spawnLight(15, 0, noon).toFixed(2)}`);
  check("真夜中の地表は暗い", spawnLight(15, 0, midnight) <= 7, `${spawnLight(15, 0, midnight).toFixed(2)}`);
  check("洞窟は昼でも暗い", spawnLight(0, 0, noon) === 0);
  // ここが「松明に意味がある」の中身。夜でも松明のそばだけは明るいまま。
  check("真夜中でも松明のそばは明るい", spawnLight(15, 14, midnight) > 7, `${spawnLight(15, 14, midnight).toFixed(2)}`);

  console.log("      受動が湧く地面: 草+光15 / 草+光8 / 砂+光15 / 石+光15");
  console.log(
    `                      ${canSpawnPassive(15, GRASS)}   ${canSpawnPassive(8, GRASS)}` +
      `      ${canSpawnPassive(15, SAND)}      ${canSpawnPassive(15, STONE)}`,
  );
  check("受動は明るい草地に湧く", canSpawnPassive(MAX_LIGHT, GRASS));
  check("暗い所には湧かない", !canSpawnPassive(PASSIVE_SKY_MIN - 1, GRASS));
  check("砂や石には湧かない", !canSpawnPassive(MAX_LIGHT, SAND) && !canSpawnPassive(MAX_LIGHT, STONE));

  describe("モブの湧き（数と場所）");

  const field = flatGrass();
  const wild = new Mobs();
  const wildCtx = ctx();
  const counts: number[] = [];
  // **湧いた瞬間の距離を見ること。** 30 秒ぶん回したあとの位置で見ると、
  // 徘徊で近づいてきただけの個体を「目の前に湧いた」と読み違える。
  const seen = new Set<number>();
  let tooClose = 0;
  let nearest = Infinity;
  for (let frame = 0; frame < 1800; frame++) {
    wild.update(1 / 60, field.asWorld(), wildCtx);
    for (const mob of wild.list) {
      if (seen.has(mob.id)) continue;
      seen.add(mob.id);
      const d = Math.hypot(mob.position.x - wildCtx.playerX, mob.position.z - wildCtx.playerZ);
      nearest = Math.min(nearest, d);
      if (d < SPAWN_MIN_DISTANCE) tooClose++;
    }
    if (frame % 300 === 299) counts.push(wild.count);
  }
  console.log(`      5 秒ごとの個体数: ${counts.join(" → ")}`);
  check("自然に湧く", wild.count > 0, `${wild.count} 体`);
  check("上限を超えない", wild.count <= MAX_MOBS, `${wild.count} / ${MAX_MOBS}`);

  let buried = 0;
  let outOfRange = 0;
  for (const mob of wild.list) {
    if (boxBlocked(field.asWorld(), mob.position.x, mob.position.y, mob.position.z, MOBS[mob.kind].size)) buried++;
    const d = Math.hypot(mob.position.x - wildCtx.playerX, mob.position.z - wildCtx.playerZ);
    if (d > DESPAWN_DISTANCE) outOfRange++;
  }
  check("ブロックに埋まっているモブが居ない", buried === 0, `${buried} 体`);
  check(
    "目の前には湧かない",
    tooClose === 0,
    `${seen.size} 体中 ${tooClose} 体が ${SPAWN_MIN_DISTANCE} ブロック以内（最短 ${nearest.toFixed(1)}）`,
  );
  check("デスポーン距離を超えて残らない", outOfRange === 0, `${outOfRange} 体`);
  // **数を決め打ちにしないこと**（受動が 2 種類だった頃は `=== 2` だった）。
  // **表から数え直す**ので、受動を足したときに「表にあるのに湧かない」が赤で出る。
  const passiveKinds = MOB_KINDS.filter((k) => !MOBS[k].hostile);
  const wildKinds = new Set(wild.list.map((m) => m.kind));
  check(
    "受動の種類がひととおり湧く",
    passiveKinds.every((k) => wildKinds.has(k)),
    `${[...wildKinds].join(" ")} / 表 ${passiveKinds.join(" ")}`,
  );
  // **「ひととおり湧く」だけにすると、余計な種類が混じっても緑になる**
  // （`=== 2` で数えていた頃はそこも拾えていた）。明るい草地なので敵対は 0 が正しい。
  check(
    "明るい草地に敵対は混じらない",
    [...wildKinds].every((k) => !MOBS[k].hostile),
    [...wildKinds].join(" "),
  );

  // 暗い所には湧かない
  const dark = flatGrass();
  dark.sky = PASSIVE_SKY_MIN - 1;
  const nightly = new Mobs();
  for (let frame = 0; frame < 1800; frame++) nightly.update(1 / 60, dark.asWorld(), ctx());
  check("暗い草地には湧かない", nightly.count === 0, `${nightly.count} 体`);

  // 未生成の列には湧かない（getVoxel が AIR を返すので、空中に湧いて閉じ込められる）
  const ungenerated = flatGrass();
  (ungenerated as unknown as { hasColumn: () => boolean }).hasColumn = () => false;
  const nowhere = new Mobs();
  for (let frame = 0; frame < 600; frame++) nowhere.update(1 / 60, ungenerated.asWorld(), ctx());
  check("ボクセルの無い列には湧かない", nowhere.count === 0, `${nowhere.count} 体`);

  // **液体の中には湧かない。** 水なら溺れ、溶岩なら焼けるだけで、どちらも
  // 「湧いた瞬間に死ぬモブ」を作り続ける。地面の 1 段上を液体で満たす
  // （`findGround` は液体を立てる場所と見なすので、ここで弾かないと湧く）。
  for (const [name, id] of [["水", WATER], ["溶岩", LAVA]] as const) {
    const flooded = flatGrass();
    flooded.fill(-80, 80, 11, 11, -80, 80, id);
    const drowned = new Mobs();
    for (let frame = 0; frame < 1800; frame++) drowned.update(1 / 60, flooded.asWorld(), ctx());
    check(`${name}の中には湧かない`, drowned.count === 0, `${drowned.count} 体`);
  }

  // 離れると消える。**DESPAWN_DISTANCE は UNLOAD_DISTANCE * CHUNK_SIZE より小さいこと。**
  // 大きいと、ボクセルの無い列にモブが立って世界を突き抜けて落ちる。
  check("デスポーン距離が読み込み範囲の内側", DESPAWN_DISTANCE < 10 * 16, `${DESPAWN_DISTANCE} < 160`);
  const before = wild.count;
  for (let frame = 0; frame < 60; frame++) {
    wild.update(1 / 60, field.asWorld(), ctx({ playerX: 400, playerZ: 400, random: seeded(9) }));
  }
  check("プレイヤーが離れると消える", wild.count === 0, `${before} 体 → ${wild.count} 体`);

  describe("敵対モブの湧き");

  // **湧きの式はシェーダの合成と同じもの**（`spawnLight`）。ここがずれると
  // 「明るく見えるのにゾンビが湧く」場所ができる。
  console.log("      場所            sky block 明るさ  実効光  ゾンビが湧く");
  const spots: [string, number, number, number][] = [
    ["地表・南中    ", 15, 0, noon],
    ["地表・真夜中  ", 15, 0, midnight],
    ["洞窟・南中    ", 0, 0, noon],
    ["松明のそば・夜", 15, 14, midnight],
  ];
  for (const [name, sky, block, b] of spots) {
    console.log(
      `      ${name}  ${String(sky).padStart(2)}  ${String(block).padStart(4)}` +
        `  ${b.toFixed(3)}  ${spawnLight(sky, block, b).toFixed(2).padStart(6)}` +
        `    ${canSpawnHostile(sky, block, b) ? "はい" : "いいえ"}`,
    );
  }
  check("真夜中の地表には湧く", canSpawnHostile(15, 0, midnight));
  check("南中の地表には湧かない", !canSpawnHostile(15, 0, noon));
  check("洞窟は昼でも湧く", canSpawnHostile(0, 0, noon));
  // ここが「松明に意味がある」の中身。**受動と違って明るさを掛ける**ので、
  // 夜でも松明の下だけは湧かない。
  check("真夜中でも松明のそばには湧かない", !canSpawnHostile(15, 14, midnight));
  check("しきい値が Minecraft と同じ 7 以下", HOSTILE_LIGHT_MAX === 7);

  /** 30 秒回して、種類ごとの数を数える。 */
  function census(arena: Arena, over: Partial<MobContext>, frames = 1800): Record<string, number> {
    const group = new Mobs();
    const world = arena.asWorld();
    const c = ctx(over);
    for (let f = 0; f < frames; f++) group.update(1 / 60, world, c);
    // **種類を足したらここにも 1 行足すこと。** 無い名前だと `counts[name]++` が
    // `NaN` になり、数えているつもりで何も見ていない状態で緑になる。
    const counts: Record<string, number> = { 豚: 0, 羊: 0, 鶏: 0, ゾンビ: 0 };
    for (const mob of group.list) counts[MOBS[mob.kind].name]++;
    return counts;
  }

  const stone = new Arena();
  stone.fill(-80, 80, 10, 10, -80, 80, STONE);

  const atNight = census(flatGrass(), { brightness: midnight, random: seeded(41) });
  const atNoon = census(flatGrass(), { brightness: noon, random: seeded(41) });
  const torchlit = census((() => { const a = flatGrass(); a.block = 14; return a; })(), { brightness: midnight, random: seeded(41) });
  const inCave = census(stone, { brightness: noon, random: seeded(41) });
  const show = (c: Record<string, number>) =>
    `豚 ${c.豚} / 羊 ${c.羊} / 鶏 ${c.鶏} / ゾンビ ${c.ゾンビ}`;
  console.log(`      夜の草地      ${show(atNight)}`);
  console.log(`      昼の草地      ${show(atNoon)}`);
  console.log(`      夜+松明の草地 ${show(torchlit)}`);
  console.log(`      昼の洞窟(石)  ${show(inCave)}`);

  check("夜の地表にゾンビが湧く", atNight.ゾンビ > 0, show(atNight));
  check("敵対の上限を超えない", atNight.ゾンビ <= MAX_HOSTILE, `${atNight.ゾンビ} / ${MAX_HOSTILE}`);
  check("昼の地表にはゾンビが湧かない", atNoon.ゾンビ === 0, show(atNoon));
  check("松明を置いた所には湧かない", torchlit.ゾンビ === 0, show(torchlit));
  check("昼でも暗い洞窟には湧く", inCave.ゾンビ > 0, show(inCave));
  // **受動が 3 種類目（鶏）になったので、湧く側も数えること。** `PASSIVE_KINDS` に
  // 足し忘れると、表にあるのに 1 体も湧かないモブが黙って残る。
  check("昼の草地に鶏が湧く", atNoon.鶏 > 0, show(atNoon));
  // 草でない地面には受動が湧かない（暗さで敵対に振り分けたあとも変わらない）
  check(
    "石の上に受動は湧かない",
    inCave.豚 === 0 && inCave.羊 === 0 && inCave.鶏 === 0,
    show(inCave),
  );

  describe("モブの AI");

  // 徘徊。固まりもせず、無限遠へも行かない。
  const roam = flatGrass();
  quiet(roam);
  const roamers = new Mobs();
  const pig = roamers.spawn("pig", 0.5, 11, 0.5, 0, seeded(7));
  // **プレイヤーを遠くに置かないこと。** DESPAWN_DISTANCE を超えて消え、
  // 「動かない」ではなく「そもそも更新されていない」で通ってしまう。
  // 湧きは sky = 0 で止めてある。
  for (let i = 0; i < 1800; i++) roamers.update(1 / 60, roam.asWorld(), ctx());
  const drift = Math.hypot(pig.position.x - 0.5, pig.position.z - 0.5);
  check("徘徊する（固まらない）", drift > 1, `30 秒で ${drift.toFixed(1)} ブロック移動`);
  check("どこまでも走り去らない", drift < 60, `${drift.toFixed(1)} ブロック`);

  // **崖から落ちない。** これが無いと、そのうち全部が穴に落ちて世界からモブが消える。
  const ledge = new Arena();
  ledge.fill(-3, 3, 10, 10, -3, 3, GRASS);
  quiet(ledge);
  const survivors = new Mobs();
  const walkers = [
    survivors.spawn("pig", 0.5, 11, 0.5, 0, seeded(11)),
    survivors.spawn("sheep", -0.5, 11, -0.5, 2, seeded(13)),
  ];
  let fell = 0;
  let roamed = 0;
  const lastAt = walkers.map((m) => [m.position.x, m.position.z]);
  for (let i = 0; i < 3600; i++) {
    survivors.update(1 / 60, ledge.asWorld(), ctx());
    for (let w = 0; w < walkers.length; w++) {
      const mob = walkers[w];
      if (mob.position.y < 10.5) fell++;
      roamed += Math.hypot(mob.position.x - lastAt[w][0], mob.position.z - lastAt[w][1]);
      lastAt[w] = [mob.position.x, mob.position.z];
    }
  }
  // **先に「本当に歩いたか」を見ること。** デスポーンして更新されていないだけでも
  // 「落ちなかった」は通ってしまう（実際それで一度だまされた）。
  check("崖のテストでモブが歩いている", roamed > 5 && survivors.count === 2, `合計 ${roamed.toFixed(1)} ブロック / ${survivors.count} 体`);
  check(
    "崖から落ちない",
    fell === 0,
    fell ? `${fell} フレーム落下` : `60 秒歩き回っても足場の上（y=${walkers[0].position.y.toFixed(2)}）`,
  );

  // 近くのプレイヤーを目で追う
  const looker = new Mobs();
  const watcher = looker.spawn("pig", 0.5, 11, 0.5, 0, seeded(17));
  watcher.walking = false;
  for (let i = 0; i < 60; i++) {
    watcher.walking = false;
    looker.update(1 / 60, roam.asWorld(), ctx({ playerX: 0.5, playerY: 11, playerZ: -4 }));
  }
  const near = Math.abs(watcher.headYaw) + Math.abs(watcher.headPitch);
  const nearYaw = watcher.headYaw;
  const nearPitch = watcher.headPitch;
  // LOOK_DISTANCE より遠く、DESPAWN_DISTANCE よりは近い所へ（遠すぎると消える）
  for (let i = 0; i < 60; i++) {
    looker.update(1 / 60, roam.asWorld(), ctx({ playerX: 0.5, playerY: 11, playerZ: 40 }));
  }
  check("近くのプレイヤーを見る", near > 0.01, `頭 yaw ${nearYaw.toFixed(2)} pitch ${nearPitch.toFixed(2)}`);
  check("遠ざかると前を向く", watcher.headYaw === 0 && watcher.headPitch === 0);
  check("見る距離に上限がある", LOOK_DISTANCE > 0 && LOOK_DISTANCE < DESPAWN_DISTANCE, `${LOOK_DISTANCE} ブロック`);

  describe("モブの戦闘（ダメージと狙い）");

  // 攻撃力の表。**`ItemDef` に damage を足さない**ので、戦闘の数値はここ 1 か所に揃う。
  const TOOL_KIND_NAMES = ["ツルハシ", "斧    ", "シャベル"];
  const TIER_NAMES = ["木", "石", "鉄", "ダイヤ"];
  console.log(`      道具      素手 ${TIER_NAMES.map((n) => n.padStart(4)).join(" ")}`);
  const damageRows: number[][] = [];
  for (let k = 0; k < 3; k++) {
    const row = [attackDamage(NO_ITEM)];
    for (let tier = 0; tier < 4; tier++) row.push(attackDamage(WOOD_PICKAXE + tier * 3 + k));
    damageRows.push(row);
    console.log(`      ${TOOL_KIND_NAMES[k]}  ${row.map((d) => d.toFixed(1).padStart(4)).join(" ")}`);
  }
  const allDamage = damageRows.flat();
  check(
    "素手がいちばん弱い",
    allDamage.every((d) => d >= attackDamage(NO_ITEM)),
    `素手 ${attackDamage(NO_ITEM)}`,
  );
  check(
    "階層が上がるほど強い",
    damageRows.every((row) => row.every((d, i) => i === 0 || d > row[i - 1])),
  );
  check(
    "斧 > ツルハシ > シャベル",
    // 添字 0 は 3 行とも素手なので飛ばす（比べるのは道具を持っている列だけ）
    damageRows[1].every((d, i) => i === 0 || (d > damageRows[0][i] && damageRows[0][i] > damageRows[2][i])),
    `ダイヤ: 斧 ${damageRows[1][4]} / ツルハシ ${damageRows[0][4]} / シャベル ${damageRows[2][4]}`,
  );
  check(
    "極端な値が無い（1〜8）",
    allDamage.every((d) => d >= 1 && d <= 8),
    `${Math.min(...allDamage)} 〜 ${Math.max(...allDamage)}`,
  );

  // --- 剣を入れた総当り表（4 種類 x 4 階層 + 素手 = 17 通り） ---
  // **剣は別の ID の帯（111..）に居る**ので、上の 3 種類のループ
  // （`WOOD_PICKAXE + tier * 3 + k`）には乗らない。混ぜないこと。
  const KIND_ROWS: [string, (tier: number) => number][] = [
    ["剣      ", (tier) => WOOD_SWORD + tier],
    ["斧      ", (tier) => WOOD_AXE + tier * 3],
    ["ツルハシ", (tier) => WOOD_PICKAXE + tier * 3],
    ["シャベル", (tier) => WOOD_SHOVEL + tier * 3],
  ];
  const bare = attackDamage(NO_ITEM);
  console.log(`      道具      ${TIER_NAMES.map((n) => n.padStart(4)).join(" ")}    （素手 ${bare}）`);
  const fullRows = KIND_ROWS.map(([label, idOf]) => {
    const row = [0, 1, 2, 3].map((tier) => attackDamage(idOf(tier)));
    console.log(`      ${label}  ${row.map((d) => d.toFixed(1).padStart(4)).join(" ")}`);
    return row;
  });
  check(
    "剣 > 斧 > ツルハシ > シャベル > 素手（4 階層とも）",
    [0, 1, 2, 3].every(
      (t) =>
        fullRows[0][t] > fullRows[1][t] &&
        fullRows[1][t] > fullRows[2][t] &&
        fullRows[2][t] > fullRows[3][t] &&
        fullRows[3][t] > bare,
    ),
    fullRows.map((row) => row.join("/")).join(" > "),
  );
  check(
    "木の剣 4.5 / ダイヤの剣 6（本家は 4 と 7。ここは階層ごとに +0.5）",
    fullRows[0][0] === 4.5 && fullRows[0][3] === 6,
    `${fullRows[0].join(" / ")}`,
  );
  check(
    "ダイヤの剣（6）はダイヤの斧（5）より強い",
    attackDamage(DIAMOND_SWORD) === 6 && attackDamage(DIAMOND_AXE) === 5,
    `剣 ${attackDamage(DIAMOND_SWORD)} / 斧 ${attackDamage(DIAMOND_AXE)}`,
  );
  check(
    "17 通りとも 1〜8 に収まる",
    [...fullRows.flat(), bare].every((d) => d >= 1 && d <= 8),
    `${Math.min(...fullRows.flat(), bare)} 〜 ${Math.max(...fullRows.flat(), bare)}`,
  );

  // クワ。**`TOOL_ATTACK` に `hoe` を足し忘れると `attackDamage()` が NaN を返し、
  // クワで殴ったモブの体力が NaN になって二度と死ななくなる**（禁じ手 2）。
  const hoeDamage = attackDamage(WOOD_HOE);
  console.log(`      木のクワで殴る: ${hoeDamage}（シャベルと同じ階層の攻撃力）`);
  check("クワで殴っても NaN にならない", !Number.isNaN(hoeDamage), `${hoeDamage}`);
  check("木のクワは 1.5（シャベルと同じ）", hoeDamage === 1.5, `${hoeDamage}`);

  // 声色。低すぎると唸り声にも聞こえず、高すぎると耳障りになる。
  console.log(
    `      声の高さ: ${MOB_KINDS.map((k) => `${MOBS[k].name} x${MOBS[k].voice}`).join(" / ")}`,
  );
  check(
    "声色が極端でない",
    MOB_KINDS.every((k) => MOBS[k].voice >= 0.5 && MOBS[k].voice <= 2),
  );

  /** 湧きを止めた（sky = 0）平地。戦闘の途中で数が変わらないようにする。 */
  function fightArena(): Arena {
    const arena = flatGrass();
    return quiet(arena);
  }
  const advance = (m: Mobs, a: Arena, c: MobContext, frames: number): void => {
    for (let i = 0; i < frames; i++) m.update(1 / 60, a.asWorld(), c);
  };
  /** 攻撃のクールダウンが明けるまでのフレーム数。 */
  const COOLDOWN_FRAMES = Math.ceil(PLAYER_ATTACK_COOLDOWN * 60) + 1;

  // クールダウンは **`main.ts` の let ではなく `Mobs` の中**。だからここで確かめられる。
  const rapid = new Mobs();
  const rapidCtx = ctx({ random: seeded(5) });
  const punched = rapid.spawn("pig", 0.5, 11, 2.5, 0, seeded(3));
  let landed = 0;
  for (let i = 0; i < 10; i++) if (rapid.attack(punched, NO_ITEM, rapidCtx)) landed++;
  check(
    "1 フレームに 10 回クリックしても 1 回",
    landed === 1 && punched.health === MOBS.pig.maxHealth - attackDamage(NO_ITEM),
    `${landed} 回 / 体力 ${punched.health}`,
  );
  advance(rapid, fightArena(), rapidCtx, COOLDOWN_FRAMES);
  check("クールダウンが明ければまた殴れる", rapid.attack(punched, NO_ITEM, rapidCtx));

  // 倒れるまでの回数とドロップ。落とす場所は `onDrop` が渡すので、
  // 倒した瞬間に onDrop が 1 回だけ鳴る。
  console.log("      種類  体力  道具        1 発  倒すまで  ドロップ");
  for (const kind of MOB_KINDS) {
    const arena = fightArena();
    const fight = new Mobs();
    const drops: { item: number; count: number }[] = [];
    const sounds: Sfx[] = [];
    fight.onDrop = (item, count) => drops.push({ item, count });
    fight.onSound = (sfx) => sounds.push(sfx);

    const fightCtx = ctx({ random: seeded(17) });
    const victim = fight.spawn(kind, 0.5, 11, 1.5, 0, seeded(9));
    const weapon = STONE_AXE;
    const perHit = attackDamage(weapon);
    const expected = Math.ceil(MOBS[kind].maxHealth / perHit);
    let hits = 0;
    // **上限は表から作ること。** 決め打ちの回数にすると、体力 200 のボスを足したときに
    // 「倒しきる前に打ち切った」のか「倒せない」のかが区別できなくなる。
    while (fight.count > 0 && hits < expected + 2) {
      if (fight.attack(victim, weapon, fightCtx)) hits++;
      advance(fight, arena, fightCtx, COOLDOWN_FRAMES);
    }
    console.log(
      `      ${MOBS[kind].name}    ${String(MOBS[kind].maxHealth).padStart(2)}  ${itemName(weapon).padEnd(8)}` +
        `  ${perHit.toFixed(1)}   ${String(hits).padStart(2)} 回     ` +
        `${drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" + ") || "なし"}`,
    );
    check(
      `${MOBS[kind].name}: ceil(体力 / ダメージ) 回でちょうど倒れる`,
      hits === expected && fight.count === 0,
      `${hits} 回 / 期待 ${expected} 回`,
    );
    // 確率つきのドロップ（ゾンビの腐った肉）は出ないこともある。
    // **出るなら山ごとに 1 回だけ・中身は表どおり**が守るべきところ。
    // **2 山目（`extra`）を持つモブは 2 回まで**（鶏の羽根）——
    // 上限をゆるめずに、**表が持っている山の数ぶんだけ**許す形にしてある。
    const table = MOBS[kind].drop;
    const expectedStacks = [table, table.extra].filter(
      (s): s is MobDropStack => s !== undefined && s.item !== NO_ITEM && s.count > 0,
    );
    const certain = expectedStacks.filter((s) => s.chance >= 1).length;
    // **並び順のまま、飛ばされることはあっても入れ替わらないこと**（表を前から食う）。
    let cursor = 0;
    const inOrder = drops.every((d) => {
      while (cursor < expectedStacks.length) {
        const s = expectedStacks[cursor++];
        if (s.item === d.item && s.count === d.count) return true;
      }
      return false;
    });
    check(
      `${MOBS[kind].name}: ドロップは山ごとに多くても 1 回で、中身は表どおり`,
      drops.length <= expectedStacks.length && inOrder && drops.length >= certain,
      `${drops.length} 回 / 表の山 ${expectedStacks.length}（うち確率 1 が ${certain}）`,
    );
    check(
      `${MOBS[kind].name}: 殴った回数だけ悲鳴、倒した瞬間に断末魔`,
      sounds.filter((s) => s === "mobhurt").length === expected - 1 &&
        sounds.filter((s) => s === "mobdeath").length === 1,
      `悲鳴 ${sounds.filter((s) => s === "mobhurt").length} / 断末魔 ${sounds.filter((s) => s === "mobdeath").length}`,
    );
  }
  check("羊は置ける羊毛を落とす", MOBS.sheep.drop.item === WOOL);
  check("豚は生豚肉を落とす（まだ食べられない）", MOBS.pig.drop.item === RAW_PORK);

  // のけぞりと逃走。**向きだけ変えても逃げない**（向きは少しずつしか変わらない）ので、
  // 実際に距離が開くところまで見る。
  const fleeArena = fightArena();
  const flee = new Mobs();
  const fleeCtx = ctx({ random: seeded(23) });
  const runner = flee.spawn("pig", 0.5, 11, 3.5, 0, seeded(29));
  const startDistance = Math.hypot(runner.position.x - 0.5, runner.position.z - 0.5);
  flee.attack(runner, NO_ITEM, fleeCtx);
  const knockZ = runner.velocity.z;
  check(
    "のけぞりはプレイヤーと反対へ向く",
    knockZ > 0,
    `プレイヤー z 0.5 / モブ z 3.5 → vz ${knockZ.toFixed(2)}`,
  );
  check("殴られると赤く光る", runner.hurtTimer > 0, `${runner.hurtTimer.toFixed(2)} 秒`);
  advance(flee, fleeArena, fleeCtx, 180);
  const fledDistance = Math.hypot(runner.position.x - 0.5, runner.position.z - 0.5);
  check(
    "殴ると 3 秒で距離が開く",
    fledDistance > startDistance + 2,
    `${startDistance.toFixed(1)} → ${fledDistance.toFixed(1)} ブロック`,
  );
  advance(flee, fleeArena, fleeCtx, 60);
  check("逃げ終われば元に戻る", runner.fleeTimer === 0 && runner.hurtTimer === 0);

  // 狙い。**ブロックとの手前・奥は `hit.point` からの距離で決める**
  // （`RaycastHit` に距離のフィールドを足さない）。
  const aimArena = fightArena();
  const aim = new Mobs();
  const aimed = aim.spawn("pig", 0.5, 11, -3.5, 0, seeded(31));
  const eye = new Vector3(0.5, 11.4, 0.5);
  const ahead = new Vector3(0, 0, -1);
  const front = aim.pick(eye, ahead, 6);
  check(
    "正面のモブに当たる",
    // 目 z=0.5 からモブの手前の面 z=-3.05（中心 -3.5 + 半幅 0.45）まで
    front?.mob === aimed && Math.abs((front?.distance ?? 0) - 3.55) < 0.01,
    `距離 ${front?.distance.toFixed(2) ?? "なし"}`,
  );
  check("1 ブロック横は外れる", aim.pick(new Vector3(2.5, 11.4, 0.5), ahead, 6) === null);
  check("届く距離の外は外れる", aim.pick(eye, ahead, 2) === null);
  check("モブが 1 体も居なければ null", new Mobs().pick(eye, ahead, 6) === null);

  // 壁越しに殴れないこと。判定そのものは main.ts の 2 行だが、
  // 「どちらが手前か」の材料（モブの距離とブロックの距離）はここで確かめられる。
  aimArena.fill(0, 0, 11, 11, -1, -1, STONE);
  const wall = raycastVoxels(aimArena.asWorld(), eye, ahead, 6);
  const wallDistance = wall ? wall.point.distanceTo(eye) : Infinity;
  check(
    "壁越しならブロックが勝つ",
    wall !== null && wallDistance < (front?.distance ?? Infinity),
    `ブロック ${wallDistance.toFixed(2)} < モブ ${front?.distance.toFixed(2)}`,
  );

  describe("羊を刈る（倒さずに羊毛を取る）");

  // --- 誰が刈れるか（表 1 本。`kind === "sheep"` と書かない） ---
  console.log(
    `      刈れる: ${MOB_KINDS.map((k) => `${MOBS[k].name} ${MOBS[k].shearing ? "○" : "×"}`).join(" / ")}`,
  );
  {
    const shearable = MOB_KINDS.filter((k) => MOBS[k].shearing !== null);
    check("刈れるのは羊だけ", shearable.length === 1 && shearable[0] === "sheep", shearable.join(" "));
    const rule = MOBS.sheep.shearing;
    console.log(
      `      羊の表: ${itemName(rule?.item ?? NO_ITEM)} ${rule?.min}〜${rule?.max} 個 / ` +
        `${rule?.regrow} 秒で戻る（倒したときは ${itemName(MOBS.sheep.drop.item)} x${MOBS.sheep.drop.count}）`,
    );
    check("刈ると羊毛が 1〜3 個（本家のまま）", rule?.item === WOOL && rule?.min === 1 && rule?.max === 3);
    // **0 にしないこと** —— 連打で羊毛が無限に出る。
    check("戻るまでの間がある", (rule?.regrow ?? 0) > 0, `${rule?.regrow} 秒`);
  }

  /** 刈る試験場。羊 1 体と、落とし物・音の控え。 */
  function shearArena(): {
    pack: Mobs;
    sheep: ReturnType<Mobs["spawn"]>;
    drops: { item: number; count: number }[];
    sounds: Sfx[];
    c: MobContext;
    world: ReturnType<Arena["asWorld"]>;
  } {
    const pack = new Mobs();
    const drops: { item: number; count: number }[] = [];
    const sounds: Sfx[] = [];
    pack.onDrop = (item, count) => drops.push({ item, count });
    pack.onSound = (sfx) => sounds.push(sfx);
    const c = ctx({ random: seeded(101) });
    const sheep = pack.spawn("sheep", 0.5, 11, 2.5, 0, seeded(103));
    return { pack, sheep, drops, sounds, c, world: fightArena().asWorld() };
  }

  // --- 1 回目は刈れて、2 回目は刈れない ---
  {
    const { pack, sheep, drops, sounds, c } = shearArena();
    const before = pack.canShear(sheep);
    const first = pack.shear(sheep, c);
    const second = pack.shear(sheep, c);
    console.log(
      `      刈る: 前 ${before} → 1 回目 ${first}（${drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" ")}）` +
        ` → 2 回目 ${second} / 音 ${sounds.join(" ")} / 残り ${sheep.woolTimer} 秒`,
    );
    check("刈る前は刈れる", before);
    check("1 回目は刈れて、羊毛が 1 山だけ出る", first && drops.length === 1 && drops[0].item === WOOL);
    // **刈れなければ false**（呼ぶ側がシアーズを減らさないための戻り値）。
    check("2 回目は刈れない（false・何も出ない）", !second && drops.length === 1, `${second} / ${drops.length} 件`);
    check("刈ったあとは canShear も false", !pack.canShear(sheep));
    // **新しい `Sfx` を足さない**（音は確かめられない側。既にある "dig" を鳴らす）。
    check("鳴るのは既にある dig 1 回だけ", sounds.length === 1 && sounds[0] === "dig", sounds.join(" "));
    // **倒れていないこと**（刈るのは攻撃ではない）。
    check("刈っても体力は減らない", pack.count === 1 && sheep.health === MOBS.sheep.maxHealth, `${sheep.health}`);
  }

  // --- 出る数は 1〜3（種を固定した乱数 1 本を回し続ける。`rules/testing.md`） ---
  {
    const pack = new Mobs();
    const counts: number[] = [];
    pack.onDrop = (_item, count) => counts.push(count);
    const roll = seeded(211);
    const c = ctx({ random: roll });
    for (let i = 0; i < 200; i++) {
      const sheep = pack.spawn("sheep", 0.5, 11, 2.5, 0, roll);
      pack.shear(sheep, c);
    }
    const tally = [1, 2, 3].map((n) => counts.filter((c2) => c2 === n).length);
    console.log(`      200 回刈った内訳: 1 個 ${tally[0]} / 2 個 ${tally[1]} / 3 個 ${tally[2]}`);
    check("200 回とも 1〜3 個", counts.length === 200 && counts.every((n) => n >= 1 && n <= 3), `${Math.min(...counts)}〜${Math.max(...counts)}`);
    check("3 通りとも出る（偏っていない）", tally.every((n) => n > 0), tally.join(" / "));
    // 両端は乱数を直に渡して出す（`rollDrop(id, 0.05)` と同じ作法）。
    const low = new Mobs();
    const high = new Mobs();
    let lowCount = 0;
    let highCount = 0;
    low.onDrop = (_i, n) => (lowCount = n);
    high.onDrop = (_i, n) => (highCount = n);
    low.shear(low.spawn("sheep", 0.5, 11, 2.5, 0, seeded(7)), ctx({}), () => 0);
    high.shear(high.spawn("sheep", 0.5, 11, 2.5, 0, seeded(7)), ctx({}), () => 0.999999);
    console.log(`      両端: random 0 → ${lowCount} 個 / random ≈1 → ${highCount} 個`);
    check("random 0 なら 1 個", lowCount === 1, `${lowCount}`);
    check("random ≈1 でも 3 個までで止まる", highCount === 3, `${highCount}`);
  }

  // --- 60 秒でまた刈れる（毎フレーム減る） ---
  {
    const { pack, sheep, c, world } = shearArena();
    pack.shear(sheep, c);
    const regrow = MOBS.sheep.shearing?.regrow ?? 0;
    // **境目の 1 フレーム手前で止めて、「まだ戻っていない」ことも見る**（`rules/testing.md`）。
    for (let i = 0; i < regrow * 60 - 1; i++) pack.update(1 / 60, world, c);
    const justBefore = pack.canShear(sheep);
    for (let i = 0; i < 2; i++) pack.update(1 / 60, world, c);
    const after = pack.canShear(sheep);
    console.log(
      `      戻り: ${regrow} 秒の 1 フレーム手前 ${justBefore}（残り ${sheep.woolTimer.toFixed(3)} 秒）→ ${regrow} 秒後 ${after}`,
    );
    check(`${regrow} 秒経つ前はまだ刈れない`, !justBefore);
    check(`${regrow} 秒でまた刈れる`, after && sheep.woolTimer === 0, `${sheep.woolTimer}`);
  }

  // --- 刈れないモブ（表に無いものは false のまま。何も出ない） ---
  {
    const pack = new Mobs();
    const drops: number[] = [];
    pack.onDrop = (item) => drops.push(item);
    const c = ctx({});
    const rows = MOB_KINDS.filter((k) => MOBS[k].shearing === null).map((kind) => {
      const mob = pack.spawn(kind, 0.5, 11, 2.5, 0, seeded(131));
      return [MOBS[kind].name, pack.canShear(mob), pack.shear(mob, c)] as const;
    });
    console.log(`      刈れないモブ: ${rows.map(([n, can, did]) => `${n} ${can}/${did}`).join(" / ")}`);
    check(
      "豚・ゾンビ・ブレイズ・エンダーマン・ドラゴンは刈れない",
      rows.every(([, can, did]) => !can && !did) && drops.length === 0,
      `${drops.length} 件落ちた`,
    );
  }

  // --- 刈った羊を倒しても羊毛は落ちない（**殴っても撃っても**） ---
  {
    // 判断そのものは `dropFor()` の 1 本。**表（`MobDef.drop`）は書き換えない。**
    const pack = new Mobs();
    const c = ctx({});
    const woolly = pack.spawn("sheep", 0.5, 11, 2.5, 0, seeded(137));
    const shorn = pack.spawn("sheep", 0.5, 11, 4.5, 0, seeded(139));
    pack.shear(shorn, c);
    const pig = pack.spawn("pig", 0.5, 11, 6.5, 0, seeded(141));
    console.log(
      `      dropFor: 刈っていない羊 ${itemName(dropFor(woolly, MOBS.sheep)?.item ?? NO_ITEM)} / ` +
        `刈った羊 ${dropFor(shorn, MOBS.sheep) === null ? "なし" : "羊毛"} / ` +
        `豚 ${itemName(dropFor(pig, MOBS.pig)?.item ?? NO_ITEM)}`,
    );
    check("刈っていない羊は今までどおり羊毛", dropFor(woolly, MOBS.sheep)?.item === WOOL);
    check("刈った羊は何も落とさない", dropFor(shorn, MOBS.sheep) === null);
    check("刈られていないモブには効かない", dropFor(pig, MOBS.pig)?.item === RAW_PORK);
    check("表そのものは書き換えていない", MOBS.sheep.drop.item === WOOL && MOBS.sheep.drop.count === 1);
  }
  {
    // 殴って倒す（`attack()`）。**先に「刈っていない羊なら落ちる」を出すこと** ——
    // 出さないと「そもそも倒せていない」で緑になる。
    const arena = fightArena();
    const outcome = (shearFirst: boolean): number[] => {
      const pack = new Mobs();
      const dropped: number[] = [];
      pack.onDrop = (item) => dropped.push(item);
      const c = ctx({ random: seeded(149) });
      const sheep = pack.spawn("sheep", 0.5, 11, 1.5, 0, seeded(151));
      if (shearFirst) pack.shear(sheep, c);
      dropped.length = 0;
      while (pack.count > 0) {
        pack.attack(sheep, DIAMOND_SWORD, c);
        advance(pack, arena, c, COOLDOWN_FRAMES);
      }
      return dropped;
    };
    const woolly = outcome(false);
    const shorn = outcome(true);
    console.log(
      `      殴って倒す: 刈っていない羊 ${woolly.map(itemName).join(" ") || "なし"} / ` +
        `刈った羊 ${shorn.map(itemName).join(" ") || "なし"}`,
    );
    check("刈っていない羊を倒すと羊毛が落ちる", woolly.length === 1 && woolly[0] === WOOL, `${woolly.length} 件`);
    check("刈った羊を倒しても羊毛は落ちない", shorn.length === 0, `${shorn.length} 件`);
  }
  {
    // 撃って倒す（`hitByProjectile()`）。**`attack()` と同じ 1 本（`dropFor()`）を通ること** ——
    // 片方だけ直すと、弓で撃ったときだけ刈った羊から羊毛が出る。
    const shoot = (shearFirst: boolean): number[] => {
      const pack = new Mobs();
      const flying = new Projectiles();
      const dropped: number[] = [];
      pack.onDrop = (item) => dropped.push(item);
      const c = ctx({ random: seeded(157) });
      const sheep = pack.spawn("sheep", 3.5, 11, 0.5, 0, seeded(163));
      if (shearFirst) pack.shear(sheep, c);
      dropped.length = 0;
      const target = pack.projectileTargets(c).find((t) => t.owner === sheep.id)!;
      const arrow = flying.spawn("arrow", 0.5, 12, 0.5, 0, 0, -1, PLAYER_OWNER, 100);
      pack.hitByProjectile(arrow!, target, c);
      return dropped;
    };
    const woolly = shoot(false);
    const shorn = shoot(true);
    console.log(
      `      矢で倒す: 刈っていない羊 ${woolly.map(itemName).join(" ") || "なし"} / ` +
        `刈った羊 ${shorn.map(itemName).join(" ") || "なし"}`,
    );
    check("矢でも刈っていない羊なら羊毛が落ちる", woolly.length === 1 && woolly[0] === WOOL, `${woolly.length} 件`);
    check("矢で撃っても刈った羊からは出ない（2 か所とも塞がっている）", shorn.length === 0, `${shorn.length} 件`);
  }
  {
    // --- 鶏を倒すと 2 山（生鶏肉 1 + 羽根 1。**殴った側と撃った側を並べて**） ---
    // `dropsFor()` の 1 本を通ることの確認。片方だけ通っていると、
    // **弓で撃ったときだけ羽根が出ない**という形で静かに食い違う（刈った羊と同じ話）。
    const table = MOBS.chicken.drop;
    console.log(
      `      鶏の表: ${itemName(table.item)} x${table.count}/${table.chance} + ` +
        `2 山目 ${itemName(table.extra?.item ?? NO_ITEM)} x${table.extra?.count}/${table.extra?.chance}`,
    );
    check("表は生鶏肉 1 個 + 羽根 1 個・どちらも必ず落ちる",
      table.item === RAW_CHICKEN && table.count === 1 && table.chance === 1 &&
        table.extra?.item === FEATHER && table.extra.count === 1 && table.extra.chance === 1,
      `${itemName(table.item)} / ${itemName(table.extra?.item ?? NO_ITEM)}`);
    // **刈れないモブなので `dropFor()`（1 山目だけを返す旧来の関数）は素通し。**
    const bare = new Mobs();
    const solo = bare.spawn("chicken", 0.5, 11, 2.5, 0, seeded(167));
    check("dropFor も生鶏肉を返す（消していない）", dropFor(solo, MOBS.chicken)?.item === RAW_CHICKEN,
      itemName(dropFor(solo, MOBS.chicken)?.item ?? NO_ITEM));

    const arena = fightArena();
    const punched: number[] = [];
    {
      const pack = new Mobs();
      pack.onDrop = (item) => punched.push(item);
      const c = ctx({ random: seeded(173) });
      const bird = pack.spawn("chicken", 0.5, 11, 1.5, 0, seeded(179));
      while (pack.count > 0) {
        pack.attack(bird, DIAMOND_SWORD, c);
        advance(pack, arena, c, COOLDOWN_FRAMES);
      }
    }
    const shot: number[] = [];
    {
      const pack = new Mobs();
      const flying = new Projectiles();
      pack.onDrop = (item) => shot.push(item);
      const c = ctx({ random: seeded(181) });
      const bird = pack.spawn("chicken", 3.5, 11, 0.5, 0, seeded(191));
      const target = pack.projectileTargets(c).find((t) => t.owner === bird.id)!;
      const arrow = flying.spawn("arrow", 0.5, 12, 0.5, 0, 0, -1, PLAYER_OWNER, 100);
      pack.hitByProjectile(arrow!, target, c);
    }
    console.log(
      `      鶏を倒す: 殴って ${punched.map(itemName).join(" ") || "なし"} / ` +
        `矢で ${shot.map(itemName).join(" ") || "なし"}`,
    );
    check("殴って倒すと 2 山（生鶏肉 1・羽根 1）",
      punched.length === 2 && punched[0] === RAW_CHICKEN && punched[1] === FEATHER,
      `${punched.length} 件: ${punched.map(itemName).join(" ")}`);
    check("矢で倒しても 2 山（同じ 1 本を通る。弓のときだけ羽根が消えない）",
      shot.length === 2 && shot[0] === RAW_CHICKEN && shot[1] === FEATHER,
      `${shot.length} 件: ${shot.map(itemName).join(" ")}`);
  }
  {
    // --- `dropsFor()` が返す山の数の表 ---
    // **豚 1 / 刈っていない羊 1 / 刈った羊 0 / 鶏 2。** 刈った羊の 0 は
    // `dropFor()` の抑えがそのまま生きていることの証拠（写していない）。
    // **山の中身も出すこと** —— 数だけ合わせると、羽根が肉に化けても緑になる。
    const stacksOf = (mob: Mob, def: MobDef): [number, string] => {
      const stacks = dropsFor(mob, def, seeded(191));
      return [stacks.length, stacks.map((s) => `${itemName(s.item)} x${s.count}`).join(" + ")];
    };
    const pack = new Mobs();
    const c = ctx({});
    const pig = pack.spawn("pig", 0.5, 11, 2.5, 0, seeded(193));
    const woolly = pack.spawn("sheep", 0.5, 11, 4.5, 0, seeded(197));
    const shorn = pack.spawn("sheep", 0.5, 11, 6.5, 0, seeded(199));
    pack.shear(shorn, c);
    const bird = pack.spawn("chicken", 0.5, 11, 8.5, 0, seeded(211));
    const rows: [string, number, string][] = [
      ["豚", ...stacksOf(pig, MOBS.pig)],
      ["刈っていない羊", ...stacksOf(woolly, MOBS.sheep)],
      ["刈った羊", ...stacksOf(shorn, MOBS.sheep)],
      ["鶏", ...stacksOf(bird, MOBS.chicken)],
    ];
    for (const [name, n, what] of rows) console.log(`      ${name}: ${n} 山 ${what || "（なし）"}`);
    check("山の数は 豚 1 / 刈っていない羊 1 / 刈った羊 0 / 鶏 2",
      rows[0][1] === 1 && rows[1][1] === 1 && rows[2][1] === 0 && rows[3][1] === 2,
      rows.map(([name, n]) => `${name} ${n}`).join(" / "));
  }
  {
    // --- `chance` が 1 の山では乱数を引かない ---
    // **引く形に変えると、種を固定した既存テストの目がずれて関係ない所が赤くなる。**
    // 数えるのは「何回引かれたか」なので、乱数そのものを包んで測る。
    const pack = new Mobs();
    const bird = pack.spawn("chicken", 0.5, 11, 2.5, 0, seeded(223));
    const zombie = pack.spawn("zombie", 0.5, 11, 4.5, 0, seeded(227));
    const counted = (mob: Mob, def: MobDef): [number, number] => {
      let draws = 0;
      const inner = seeded(229);
      const stacks = dropsFor(mob, def, () => { draws++; return inner(); });
      return [stacks.length, draws];
    };
    const [birdStacks, birdDraws] = counted(bird, MOBS.chicken);
    const [zombieStacks, zombieDraws] = counted(zombie, MOBS.zombie);
    console.log(
      `      乱数を引いた回数: 鶏（2 山とも chance 1）${birdDraws} 回 / ` +
        `ゾンビ（chance ${MOBS.zombie.drop.chance}）${zombieDraws} 回`,
    );
    check("chance 1 の山では乱数を引かない（鶏は 2 山とも 0 回）",
      birdDraws === 0 && birdStacks === 2, `${birdDraws} 回 / ${birdStacks} 山`);
    check("chance が 1 未満の山では今までどおり 1 回引く（ゾンビ）",
      zombieDraws === 1 && zombieStacks <= 1, `${zombieDraws} 回 / ${zombieStacks} 山`);
  }

  describe("鶏が卵を産む（倒さずに取れる 2 つ目）");

  // --- 誰が産むか（表 1 本。`kind === "chicken"` と書かない） ---
  console.log(
    `      産む: ${MOB_KINDS.map((k) => `${MOBS[k].name} ${MOBS[k].laying ? "○" : "×"}`).join(" / ")}`,
  );
  {
    const layers = MOB_KINDS.filter((k) => MOBS[k].laying !== null);
    check("産むのは鶏だけ", layers.length === 1 && layers[0] === "chicken", layers.join(" "));
    const rule = MOBS.chicken.laying;
    console.log(
      `      鶏の表: ${itemName(rule?.item ?? NO_ITEM)} x${rule?.count} / ` +
        `${rule?.min}〜${rule?.max} 秒ごと（倒したときは ${itemName(MOBS.chicken.drop.item)} + ` +
        `${itemName(MOBS.chicken.drop.extra?.item ?? NO_ITEM)}）`,
    );
    check(
      "産むのは卵 1 個・300〜600 秒ごと（本家の 6000〜12000 ティック）",
      rule?.item === EGG && rule?.count === 1 && rule?.min === 300 && rule?.max === 600,
      `${itemName(rule?.item ?? NO_ITEM)} x${rule?.count} / ${rule?.min}〜${rule?.max} 秒`,
    );
    // **`min` を 0 にしないこと** —— 毎フレーム産む。
    check("次までの間がある（min > 0）", (rule?.min ?? 0) > 0 && (rule?.min ?? 0) <= (rule?.max ?? 0),
      `${rule?.min}〜${rule?.max} 秒`);
    // **倒したときの表は 1 行も動かしていない**（産卵とは別の話）。
    check("倒したときの表は書き換えていない",
      MOBS.chicken.drop.item === RAW_CHICKEN && MOBS.chicken.drop.extra?.item === FEATHER,
      `${itemName(MOBS.chicken.drop.item)} + ${itemName(MOBS.chicken.drop.extra?.item ?? NO_ITEM)}`);
  }

  // --- 湧いた直後の時計は min..max（0 から始めない） ---
  {
    const rule = MOBS.chicken.laying!;
    const pack = new Mobs();
    const starts: number[] = [];
    for (let i = 0; i < 20; i++) {
      starts.push(pack.spawn("chicken", 0.5, 11, 2.5, 0, seeded(1009 + i * 2)).layTimer);
    }
    const pig = pack.spawn("pig", 0.5, 11, 4.5, 0, seeded(1013));
    console.log(
      `      湧いた直後の layTimer: ${starts.slice(0, 5).map((n) => n.toFixed(1)).join(" / ")} …` +
        `（20 体で ${Math.min(...starts).toFixed(1)}〜${Math.max(...starts).toFixed(1)} 秒） / 豚 ${pig.layTimer}`,
    );
    // **0 から始めると、まとめ打ちで湧いた全員が最初のフレームで 1 個ずつ産む。**
    check(
      `湧いた直後の時計は ${rule.min}〜${rule.max} 秒に入る（0 から始めない）`,
      starts.every((n) => n >= rule.min && n <= rule.max),
      `${Math.min(...starts).toFixed(1)}〜${Math.max(...starts).toFixed(1)} 秒`,
    );
    check("2 体が同じ時計にならない（種ごとに散る）", new Set(starts).size > 1, `${new Set(starts).size} 通り`);
    check("産まないモブの時計は 0 のまま", pig.layTimer === 0, `${pig.layTimer}`);
  }

  /** 産卵の試験場。**湧きを止めた平地**に鶏 1 体（落とし物と音の控えつき）。 */
  function layArena(seed = 1019): {
    pack: Mobs;
    bird: Mob;
    drops: { item: number; count: number }[];
    sounds: Sfx[];
    c: MobContext;
    world: ReturnType<Arena["asWorld"]>;
  } {
    const pack = new Mobs();
    const drops: { item: number; count: number }[] = [];
    const sounds: Sfx[] = [];
    pack.onDrop = (item, count) => drops.push({ item, count });
    pack.onSound = (sfx) => sounds.push(sfx);
    const c = ctx({ random: seeded(seed) });
    const bird = pack.spawn("chicken", 0.5, 11, 2.5, 0, seeded(seed + 2));
    return { pack, bird, drops, sounds, c, world: fightArena().asWorld() };
  }

  // --- 境目の 1 フレーム手前では産まず、その次のフレームで卵 1 個が 1 山 ---
  // （`woolTimer` の戻りとまったく同じ測り方。`rules/testing.md`）
  {
    const { pack, bird, drops, sounds, c, world } = layArena();
    // 時計そのものを短く詰め直して境目まで進める（**300 秒ぶん回すのは下の節**）。
    bird.layTimer = 2;
    // **フレーム数を数えて決め打ちにしないこと** —— 2 秒 = 120 フレームぶん引いても
    // 浮動小数の端数（1e-15）が残って、その 1 フレームでは鳴らない。
    // 「鳴った最初のフレーム」を探して、その 1 つ手前を見るのが正しい測り方。
    let before = -1;
    let remain = -1;
    let frame = 0;
    for (; frame < 3 * 60; frame++) {
      before = drops.length;
      remain = bird.layTimer;
      pack.update(1 / 60, world, c);
      if (drops.length > before) break;
    }
    const after = drops.length;
    console.log(
      `      境目: 2 秒（120 フレーム）→ ${frame + 1} フレーム目で鳴った。` +
        `その 1 フレーム手前 ${before} 山（残り ${remain.toFixed(5)} 秒）→ ${after} 山` +
        `（${drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" ")}） / 音 ${sounds.join(" ") || "なし"}`,
    );
    check("境目の 1 フレーム手前ではまだ産まない", before === 0 && remain > 0, `${before} 山 / 残り ${remain}`);
    check(
      "その次のフレームで卵 x1 が 1 山",
      after === 1 && drops[0].item === EGG && drops[0].count === 1,
      `${after} 山: ${drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" ")}`,
    );
    check("鳴るのは 2 秒ぶんのフレームを回したところ（早くも遅くもない）",
      frame + 1 >= 2 * 60 && frame + 1 <= 2 * 60 + 1, `${frame + 1} フレーム目`);
    // **音は足さない**（`onSound` を鳴らさないのが仕様。鳴らすと鶏が居るだけで鳴り続ける）。
    check("産んでも音は鳴らない", sounds.length === 0, sounds.join(" "));
    // **次の間隔を入れ直してから鳴らすこと** —— 入れ直さないと毎フレーム産む。
    const next = bird.layTimer;
    for (let i = 0; i < 60; i++) pack.update(1 / 60, world, c);
    console.log(`      産んだ直後の次の間隔 ${next.toFixed(1)} 秒 → 1 秒回して ${drops.length} 山のまま`);
    check(
      `産んだあと次の間隔が ${MOBS.chicken.laying?.min}〜${MOBS.chicken.laying?.max} 秒に入り直す`,
      next >= MOBS.chicken.laying!.min && next <= MOBS.chicken.laying!.max,
      `${next.toFixed(1)} 秒`,
    );
    check("続けて 1 秒回しても 2 個目は出ない", drops.length === 1, `${drops.length} 山`);
  }

  // --- min 秒ぶんでは 0 山、max 秒で 1 山（表の値そのもので回す） ---
  {
    const rule = MOBS.chicken.laying!;
    const { pack, bird, drops, c, world } = layArena(1031);
    const start = bird.layTimer;
    // **`dt` を大きめに取って回す**（産卵の時計は毎フレーム減るだけなので、
    // 刻みを変えても測っているものは同じ。1/60 で 36000 回まわすと時間を捨てる）。
    const dt = 1 / 20;
    const home = new Vector3(0.5, 11, 2.5);
    const runFor = (seconds: number): void => {
      for (let i = 0; i < seconds / dt; i++) {
        pack.update(dt, world, c);
        // **その場に留め置くこと。** 10 分も回すと徘徊で草地（±80）を出て、
        // 何も無い所へ落ちたあと `DESPAWN_DISTANCE`(72) で消える ——
        // すると「動かないから産まない」で緑になる（`rules/testing.md`）。
        bird.position.copy(home);
        bird.velocity.set(0, 0, 0);
      }
    };
    runFor(rule.min);
    const atMin = drops.length;
    const aliveAtMin = pack.count;
    runFor(rule.max - rule.min);
    const atMax = drops.length;
    console.log(
      `      最初の時計 ${start.toFixed(1)} 秒: ${rule.min} 秒で ${atMin} 山 → ${rule.max} 秒で ${atMax} 山` +
        `（${drops.map((d) => `${itemName(d.item)} x${d.count}`).join(" ")}） / 残り ${pack.count} 体`,
    );
    // **先に「まだ居る」ことを見ること** —— 消えていたら下の 2 件は何も測っていない。
    check("回しているあいだ鶏は消えていない", aliveAtMin === 1 && pack.count === 1, `${pack.count} 体`);
    check(`${rule.min} 秒ぶん回しても 0 山（min より前には産まない）`, atMin === 0, `${atMin} 山`);
    check(
      `${rule.max} 秒で卵が 1 山（max までには必ず産む）`,
      atMax === 1 && drops[0].item === EGG,
      `${atMax} 山: ${drops.map((d) => itemName(d.item)).join(" ")}`,
    );
  }

  // --- 産まないモブは max 秒ぶん回しても 1 度も鳴らない ---
  {
    const rule = MOBS.chicken.laying!;
    const pack = new Mobs();
    const drops: number[] = [];
    const sounds: Sfx[] = [];
    pack.onDrop = (item) => drops.push(item);
    pack.onSound = (sfx) => sounds.push(sfx);
    const c = ctx({ random: seeded(1039) });
    const world = fightArena().asWorld();
    // **表から取ること**（種類を足したときに書き忘れない）。ボスは自然に居ないので外す。
    const barren = MOB_KINDS.filter((k) => MOBS[k].laying === null && !MOBS[k].boss);
    const homes = barren.map((kind, i) => {
      const mob = pack.spawn(kind, 0.5 + i * 2, 11, 2.5, 0, seeded(1049 + i * 2));
      return [mob, new Vector3(mob.position.x, mob.position.y, mob.position.z)] as const;
    });
    const born = pack.count;
    const dt = 1 / 20;
    for (let i = 0; i < rule.max / dt; i++) {
      pack.update(dt, world, c);
      // **上と同じ理由でその場に留め置く**（消えると「動かないから落ちない」で緑になる）。
      for (const [mob, home] of homes) {
        mob.position.copy(home);
        mob.velocity.set(0, 0, 0);
      }
    }
    console.log(
      `      産まないモブ ${barren.map((k) => MOBS[k].name).join(" / ")} を ${rule.max} 秒: ` +
        `落とし物 ${drops.length} 件 / 音 ${sounds.length} 件（湧かせた ${born} 体・残り ${pack.count} 体）`,
    );
    // **先に「ちゃんと回った」ことを見ること**（`rules/testing.md`）——
    // 全員デスポーンしていると「動かないから落ちない」で緑になる。
    check("産まないモブを 5 種類そろえて回した", born === barren.length && pack.count > 0,
      `${born} 体 → ${pack.count} 体`);
    check(`豚・羊・ゾンビ・ブレイズ・エンダーマンは ${rule.max} 秒回しても 1 山も出ない`,
      drops.length === 0, `${drops.length} 件`);
  }

  describe("敵対モブの AI（追跡と日光）");

  const chaseArena = quiet(flatGrass());
  const chase = new Mobs();
  const hunter = chase.spawn("zombie", 0.5, 11, -10.5, 0, seeded(51));
  // ここでは `vitals` を渡さない。**追いかけてくるかどうかだけ**を見る。
  const chaseCtx = ctx({ random: seeded(53) });
  const chaseStart = Math.hypot(hunter.position.x - 0.5, hunter.position.z - 0.5);
  for (let i = 0; i < 300; i++) chase.update(1 / 60, chaseArena.asWorld(), chaseCtx);
  const chaseGap = Math.hypot(hunter.position.x - 0.5, hunter.position.z - 0.5);
  check(
    "見つけたら追いかけてくる",
    chaseGap < 2,
    `${chaseStart.toFixed(1)} → ${chaseGap.toFixed(2)} ブロック（5 秒）`,
  );
  // 当たり判定の合計（ゾンビ 0.4 + プレイヤー 0.3）より離れて止まること。
  // 重なると、ゾンビの胴がカメラの中に入って画面が塗りつぶされる。
  check(
    "目の前で止まる（プレイヤーに重ならない）",
    chaseGap > MOBS.zombie.size.half + 0.3,
    `${chaseGap.toFixed(2)} ブロック / 判定の合計 ${(MOBS.zombie.size.half + 0.3).toFixed(2)}`,
  );

  /**
   * 索敵の外・クリエイティブでは**追跡そのものが始まらない**ことを見る。
   * 徘徊で偶然近づく／離れるに左右されないよう、待機で固定してから回す
   * （追跡は `stateTimer` に関わらず `walking` を立てるので、立てば追跡と分かる）。
   */
  function chases(distance: number, over: Partial<MobContext> = {}): boolean {
    const arena = quiet(flatGrass());
    const pack = new Mobs();
    const mob = pack.spawn("zombie", 0.5, 11, 0.5 - distance, 0, seeded(57));
    mob.walking = false;
    mob.stateTimer = 1000; // 徘徊の抽選が来ないようにしておく
    const c = ctx({ random: seeded(59), ...over });
    for (let i = 0; i < 120; i++) pack.update(1 / 60, arena.asWorld(), c);
    return mob.walking;
  }
  console.log(`      索敵範囲 ${HOSTILE_SIGHT} ブロック`);
  check("索敵範囲の内側なら追う", chases(HOSTILE_SIGHT - 2));
  check("索敵範囲の外なら追わない", !chases(HOSTILE_SIGHT + 6));
  // クリエイティブは **`Vitals` ではなく `Mobs` 側で弾く**（`damage()` は元から invulnerable を見ない）
  check("クリエイティブは狙われない", !chases(4, { invulnerable: true }));

  /** 日光の下に 15 秒置く。`{ 生き残ったか, ドロップ数, 断末魔 }` を返す。 */
  function sunbathe(arena: Arena, over: Partial<MobContext> = {}): { alive: boolean; drops: number; death: number; seconds: number } {
    const pack = new Mobs();
    let drops = 0;
    let death = 0;
    pack.onDrop = () => drops++;
    pack.onSound = (sfx) => { if (sfx === "mobdeath") death++; };
    pack.spawn("zombie", 0.5, 11, 3.5, 0, seeded(61));
    const c = ctx({ random: seeded(63), ...over });
    const world = arena.asWorld();
    let frames = 0;
    for (; frames < 900 && pack.count > 0; frames++) pack.update(1 / 60, world, c);
    return { alive: pack.count > 0, drops, death, seconds: frames / 60 };
  }

  /** 石の地面。**草にすると受動が湧いて数が動く**ので、日光の試験場は石にする。 */
  function sunnyGround(): Arena {
    const arena = new Arena();
    arena.fill(-40, 40, 10, 10, -40, 40, STONE);
    arena.sky = MAX_LIGHT;
    return arena;
  }

  const burned = sunbathe(sunnyGround());
  console.log(`      朝日の下: ${burned.seconds.toFixed(1)} 秒で消えた / ドロップ ${burned.drops} 件`);
  check("朝日が当たると燃えて消える", !burned.alive, `${burned.seconds.toFixed(1)} 秒`);
  // **焼死ではドロップしない。** 遠くで勝手に焼けたゾンビの肉が手元に湧いてはいけない。
  check("焼死ではドロップしない", burned.drops === 0, `${burned.drops} 件`);
  check("焼死でも断末魔は鳴る", burned.death === 1, `${burned.death} 回`);

  const shaded = sunnyGround();
  shaded.sky = MAX_LIGHT - 1;
  check("木の下・屋根の下では燃えない", sunbathe(shaded).alive);
  check("夜は燃えない", sunbathe(sunnyGround(), { brightness: midnight }).alive);

  // 水中では燃えない。浮き上がって水から出ないよう、蓋をした水路に入れる。
  const submerged = new Arena();
  submerged.fill(-20, 20, 0, 9, -20, 20, STONE);
  submerged.fill(-6, 6, 10, 20, -6, 6, WATER);
  submerged.fill(-6, 6, 21, 21, -6, 6, STONE);
  submerged.sky = MAX_LIGHT;
  check("水中では燃えない", sunbathe(submerged).alive);

  console.log(
    `      日光の判定: sky15+昼 ${sunlightBurns(15, noon)} / sky14+昼 ${sunlightBurns(14, noon)}` +
      ` / sky15+夜 ${sunlightBurns(15, midnight)}`,
  );
  check(
    "燃えるのは真上が空いている昼だけ",
    sunlightBurns(MAX_LIGHT, noon) && !sunlightBurns(MAX_LIGHT - 1, noon) && !sunlightBurns(MAX_LIGHT, midnight),
  );

  describe("モブと溶岩");

  /**
   * 蓋をした溶岩の池に沈める。**浮き上がって出てしまわないよう蓋をすること**
   * （水と同じで、モブは液面へ浮く）。日光と切り分けるため試験場は暗くする。
   */
  function swim(
    kind: MobKind,
    id: number,
  ): { alive: boolean; drops: number; seconds: number; soaked: boolean; health: number } {
    const arena = quiet(new Arena());
    arena.fill(-20, 20, 0, 9, -20, 20, STONE);
    arena.fill(-6, 6, 10, 20, -6, 6, id);
    arena.fill(-6, 6, 21, 21, -6, 6, STONE);
    const pack = new Mobs();
    let drops = 0;
    pack.onDrop = () => drops++;
    // **プレイヤーを遠くへ置かないこと。** `DESPAWN_DISTANCE` を超えると、
    // 焼ける前に消えて「焼け死んだ」と読み違える（実際にそれで通っていた）。
    const mob = pack.spawn(kind, 0.5, 11, 3.5, 0, seeded(81))!;
    const c = ctx({ random: seeded(83) });
    const world = arena.asWorld();
    let frames = 0;
    // **浸かった証拠を先に取ること**（浸かっていなければ、何を見ても意味がない）
    let soaked = false;
    for (; frames < 900 && pack.count > 0; frames++) {
      pack.update(1 / 60, world, c);
      soaked ||= mob.liquid === id;
    }
    return { alive: pack.count > 0, drops, seconds: frames / 60, soaked, health: mob.health };
  }

  const boiled = swim("zombie", LAVA);
  console.log(`      溶岩に沈めたゾンビ: ${boiled.seconds.toFixed(1)} 秒で消えた / ドロップ ${boiled.drops} 件`);
  check("ゾンビが溶岩に浸かっている（試験場が効いている）", boiled.soaked);
  check("ゾンビは溶岩で焼け死ぬ（夜でも洞窟でも）", !boiled.alive, `${boiled.seconds.toFixed(1)} 秒`);
  check("溶岩の焼死でもドロップしない", boiled.drops === 0, `${boiled.drops} 件`);

  // **受動モブも焼けること。** 敵対だけにすると、豚が溶岩の上を平気で泳ぐ。
  const roast = swim("pig", LAVA);
  console.log(`      溶岩に沈めた豚: ${roast.seconds.toFixed(1)} 秒で消えた`);
  check("受動モブも溶岩で焼け死ぬ", !roast.alive, `${roast.seconds.toFixed(1)} 秒`);

  // 水では焼けない。**液体をひとまとめにすると、水中のゾンビまで焼ける。**
  const wet = swim("zombie", WATER);
  check("水に浸かっている（試験場が効いている）", wet.soaked);
  check("水では焼けない", wet.alive);

  // **火に強いモブ（`fireproof`）は溶岩でも焼けない。** ブレイズは溶岩の海の上を
  // 飛ぶので、かすっただけで 2.5 秒で焼け死ぬと自分の次元で生きていられない。
  const fireproof = swim("blaze", LAVA);
  console.log(
    `      溶岩に沈めたブレイズ: ${fireproof.seconds.toFixed(1)} 秒後も体力 ${fireproof.health} /` +
      ` 同じ試験場のゾンビは ${boiled.seconds.toFixed(1)} 秒で消えた`,
  );
  check("ブレイズが溶岩に浸かっている（試験場が効いている）", fireproof.soaked);
  check(
    "火に強いモブは溶岩で焼けない",
    fireproof.alive && fireproof.health === MOBS.blaze.maxHealth,
    `体力 ${fireproof.health} / ${MOBS.blaze.maxHealth}`,
  );

  // --- 溶岩から上がったあと ---
  // **プレイヤーと同じ長さ燃え続けること。** 日陰の 2 秒（`BURN_LINGER`）を
  // 溶岩に使い回していたせいで、**同じ溶岩から上がってもモブだけ 2 秒で消えていた**
  // （ブラウザで見ていたユーザーが気付いた）。日陰の 2 秒は「木の下でちらつかせない」
  // ための値で、溶岩とは別の話。
  {
    const arena = quiet(new Arena());
    arena.fill(-20, 20, 0, 9, -20, 20, STONE);
    arena.fill(-6, 6, 10, 12, -6, 6, LAVA);
    const pack = new Mobs();
    const mob = pack.spawn("zombie", 0.5, 11, 0.5, 0, seeded(91))!;
    const world = arena.asWorld();
    pack.update(1 / 60, world, ctx({ random: seeded(93) }));
    console.log(
      `      溶岩から上がった直後の燃え残り: モブ ${mob.burnTimer.toFixed(2)} 秒 /` +
        ` プレイヤー ${BURN_SECONDS} 秒`,
    );
    check("溶岩に浸かった直後の燃え残りがプレイヤーと同じ", Math.abs(mob.burnTimer - BURN_SECONDS) < 0.05, `${mob.burnTimer.toFixed(2)} / ${BURN_SECONDS} 秒`);

    // **日向へ出しても縮まないこと。** 日光の側が代入だったので、溶岩から上がって
    // 日なたに出た瞬間に残り 15 秒が 2 秒へ縮んでいた（長いほうが勝つのが正しい）。
    mob.position.set(15.5, 10, 15.5);
    arena.sky = MAX_LIGHT;
    const healthBefore = mob.health;
    for (let i = 0; i < 180; i++) pack.update(1 / 60, world, ctx({ random: seeded(95), brightness: 1 }));
    // 先に「溶岩から出て、燃え続けている」ことの証拠を出す
    check("溶岩から出ている（試験場が効いている）", pack.count === 1 && mob.liquid === AIR, `liquid ${mob.liquid} / ${pack.count} 体`);
    check("出たあとも焼かれ続けている", mob.health < healthBefore, `体力 ${healthBefore} → ${mob.health}`);
    console.log(`      3 秒 日向を歩かせたあとの燃え残り: ${mob.burnTimer.toFixed(2)} 秒（縮んでいなければ 12 前後）`);
    check(
      "日向に出ても溶岩の燃え残りが縮まない",
      mob.burnTimer > BURN_SECONDS - 4,
      `${mob.burnTimer.toFixed(2)} 秒（日陰ぶんの 2 秒に上書きされていない）`,
    );
  }

  // 日光より速いこと。同じ 2 でよいなら、ゾンビが溶岩を泳いで渡ってくる。
  console.log(`      焼ける速さ: 溶岩 ${boiled.seconds.toFixed(1)} 秒 / 朝日 ${burned.seconds.toFixed(1)} 秒`);
  check(
    "溶岩は日光よりずっと速く焼く",
    boiled.seconds * 2 < burned.seconds,
    `${boiled.seconds.toFixed(1)} 秒 < ${burned.seconds.toFixed(1)} 秒`,
  );

  describe("敵対モブの攻撃（プレイヤーへのダメージ）");

  /**
   * ゾンビ n 体に囲まれて `seconds` 秒。**本物の `Vitals`** を使う
   * （無敵時間の効きを見たいので、模造品では意味がない）。
   */
  function besieged(count: number, seconds: number, invulnerable = false) {
    const arena = quiet(flatGrass());
    const pack = new Mobs();
    const vitals = new Vitals();
    const velocity = new Vector3();
    const c = ctx({ random: seeded(71), vitals, playerVelocity: velocity, invulnerable });
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const mob = pack.spawn("zombie", 0.5 + Math.cos(a) * 1.2, 11, 0.5 + Math.sin(a) * 1.2, 0, seeded(80 + i));
      // 実際には全員が同時に着くわけではないので、殴り始めをずらす。
      // そろえると全員が同じ窓を待つ形になり、無敵時間の効きを甘く見積もる。
      mob.attackTimer = i * 0.15;
    }
    const world = arena.asWorld();
    for (let f = 0; f < seconds * 60; f++) {
      pack.update(1 / 60, world, c);
      vitals.update(1 / 60, {
        y: 11,
        onGround: true,
        inLiquid: false,
        inLava: false,
        headInWater: false,
        flying: false,
        invulnerable,
        moved: 0,
        sprinting: false,
      });
    }
    return { lost: MAX_HEALTH - vitals.health, cause: vitals.cause, velocity, dead: vitals.dead };
  }

  const solo = besieged(1, 2);
  const swarm = besieged(6, 2);
  console.log(
    `      2 秒で減る体力: 1 体 ${solo.lost} / 6 体 ${swarm.lost}` +
      `（1 体の理論値 ${(MOB_DAMAGE / MOB_ATTACK_COOLDOWN) * 2} / 無敵時間の頭打ち ${(MOB_DAMAGE / MOB_HURT_COOLDOWN) * 2}）`,
  );
  check("殴られると体力が減る", solo.lost > 0, `${solo.lost} 減った`);
  check("死因がモンスターになる", solo.cause === "モンスター", `${solo.cause}`);
  check(
    "無敵時間で頭打ちになる（人数ぶんには増えない）",
    swarm.lost <= (MOB_DAMAGE / MOB_HURT_COOLDOWN) * 2 && swarm.lost <= solo.lost * 2,
    `1 体 ${solo.lost} → 6 体 ${swarm.lost}（6 倍なら ${solo.lost * 6}）`,
  );
  check(
    "ノックバックでプレイヤーが押される",
    solo.velocity.x < 0 && solo.velocity.y > 0,
    `速度 (${solo.velocity.x.toFixed(1)}, ${solo.velocity.y.toFixed(1)}, ${solo.velocity.z.toFixed(1)})`,
  );
  const safe = besieged(6, 2, true);
  check("クリエイティブでは殴られない", safe.lost === 0 && safe.velocity.lengthSq() === 0, `${safe.lost} 減った`);
  check("殴れる距離が届く距離と同じくらい", ATTACK_RANGE > 1 && ATTACK_RANGE < 3, `${ATTACK_RANGE} ブロック`);

  // 腐った肉は確率つき（0.6）。1 回では確かめられないので、まとめて倒して割合で見る。
  const bulkCtx = ctx({ random: seeded(91) });
  // **乱数は 1 本を回し続けること。** 1 体ごとに `seeded(...)` を作ると、
  // 線形合同法の 1 個目の値が種にそのまま引きずられて 200 回全部が同じ側に転ぶ
  // （実際それで「確率 0.6 なのに 100%」が通ってしまった）。
  const dropRandom = seeded(91);
  let dropped = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    // クールダウンは `Mobs` が持つので、1 体ずつ新しい群れで殴る（フレームを回さずに済む）
    const bulk = new Mobs();
    bulk.onDrop = (item) => { if (item === ROTTEN_FLESH) dropped++; };
    const mob = bulk.spawn("zombie", 0.5, 11, 2.5, 0, dropRandom);
    mob.health = 1; // 1 発で倒れるようにしておく
    bulk.attack(mob, STONE_AXE, bulkCtx, dropRandom);
  }
  const rate = dropped / trials;
  console.log(`      腐った肉の落ちる割合: ${(rate * 100).toFixed(0)}%（表は ${MOBS.zombie.drop.chance * 100}%）`);
  check("腐った肉は表どおりの割合で落ちる", Math.abs(rate - MOBS.zombie.drop.chance) < 0.1, `${(rate * 100).toFixed(0)}%`);
  check("ゾンビは腐った肉を落とす（まだ食べられない）", MOBS.zombie.drop.item === ROTTEN_FLESH);

  describe("ブレイズの火球（撃つ・当たる）");

  {
    console.log("      種類   近接  遠くから");
    for (const kind of MOB_KINDS) {
      const def = MOBS[kind];
      const r = def.ranged;
      console.log(
        `      ${def.name.padEnd(6)} ${String(def.damage).padStart(2)}    ` +
          (r
            ? `${r.kind} 重み ${r.damage} / 間合い ${r.near}〜${r.range}m / ${r.cooldown} 秒ごと`
            : "撃たない"),
      );
    }
    const shooters = MOB_KINDS.filter((kind) => MOBS[kind].ranged);
    // **撃つモブが増えたらここを書き換えること**（`TUNING.md` の表と対）。
    // ドラゴンはブレスを撃つが、**撃つのは「ブレス」の番だけ**（下の攻め方の節）。
    check(
      "撃つのはブレイズとドラゴンだけ",
      shooters.length === 2 && shooters.includes("blaze") && shooters.includes("dragon"),
      shooters.join(" "),
    );
    // **重みを 1 つの定数で分け合わないこと。** 分け合っていた頃、ブレイズの一撃は
    // ゾンビと同じ 2 だった（本家は 6）。
    check(
      "近接の重みが種類ごとに違う",
      MOBS.zombie.damage === 2 && MOBS.blaze.damage === 6,
      `ゾンビ ${MOBS.zombie.damage} / ブレイズ ${MOBS.blaze.damage}`,
    );
    check(
      "受動モブは殴らない",
      MOBS.pig.damage === 0 && MOBS.sheep.damage === 0 && MOBS.chicken.damage === 0,
      `豚 ${MOBS.pig.damage} / 羊 ${MOBS.sheep.damage} / 鶏 ${MOBS.chicken.damage}`,
    );
    const ranged = MOBS.blaze.ranged;
    // **回るモブには当てはまらない線**（下でドラゴンぶんを別に見ている）。
    // ブレイズは自分から寄っていくので、見えた瞬間に撃たれないことが要る。
    check(
      "撃ち始める間合いは追い始める距離より短い",
      !!ranged && ranged.range < HOSTILE_SIGHT,
      `${ranged?.range} < ${HOSTILE_SIGHT}`,
    );
    check(
      "近すぎると撃たない線がある",
      !!ranged && ranged.near > 0 && ranged.near < ranged.range,
      `${ranged?.near}m`,
    );
  }

  /**
   * ブレイズを 1 体置いて、撃った注文（`Shot`）を集める。
   * **湧きは止めてある**（`quiet`）ので、集まるのはこの 1 体ぶんだけ。
   * 湧いた直後の待ちは外す —— ここで見たいのは「撃つかどうか」だけ。
   */
  function blazeShots(
    options: {
      distance?: number;
      seconds?: number;
      wall?: boolean;
      invulnerable?: boolean;
      kind?: MobKind;
    } = {},
  ) {
    const { distance = 10, seconds = 1 / 60, wall = false, invulnerable = false, kind = "blaze" } = options;
    const arena = quiet(flatGrass());
    // プレイヤー（z = 0.5）とモブのあいだに立てる壁。
    if (wall) arena.fill(-6, 6, 11, 24, 5, 5, STONE);
    const pack = new Mobs();
    const shots: Shot[] = [];
    const c = ctx({ random: seeded(55), invulnerable, shoot: (shot) => shots.push(shot) });
    const mob = pack.spawn(kind, 0.5, 13, 0.5 + distance, 0, seeded(56));
    mob.shootTimer = 0;
    const world = arena.asWorld();
    for (let f = 0; f < Math.round(seconds * 60); f++) pack.update(1 / 60, world, c);
    const left = Math.hypot(mob.position.x - c.playerX, mob.position.z - c.playerZ);
    return { shots, mob, pack, world, ctx: c, distance: left };
  }

  {
    const shot = blazeShots({ distance: 10 });
    const first = shot.shots[0];
    console.log(
      `      10m から: ${shot.shots.length} 発  ${first?.kind} 重み ${first?.damage}  ` +
        `撃ち手 ${first?.owner}（モブの id ${shot.mob.id}）  ` +
        `向き (${first?.dx.toFixed(1)}, ${first?.dy.toFixed(1)}, ${first?.dz.toFixed(1)})`,
    );
    check("間合いに入ると撃つ", shot.shots.length === 1);
    check("撃つのは表のもの（火球・重み 5）", first?.kind === "fireball" && first?.damage === 5);
    // **撃ち手の印が要る。** 無いと、口元から出た火球が自分に当たる。
    check("撃った本人の印が乗る", first?.owner === shot.mob.id && first?.owner !== PLAYER_OWNER);
    check("プレイヤーのほうへ向く", !!first && first.dz < 0 && Math.abs(first.dx) < 0.5);
    // 足元ではなく体の中ほどから（足元だと自分の足場に当たる）
    check("撃ち出す高さが足元より上", !!first && first.y > shot.mob.position.y + 0.5);
  }

  {
    const far = blazeShots({ distance: 17 });
    const close = blazeShots({ distance: 2 });
    const creative = blazeShots({ distance: 10, invulnerable: true });
    const zombie = blazeShots({ distance: 10, kind: "zombie" });
    console.log(
      `      17m ${far.shots.length} 発 / 2m ${close.shots.length} 発 / ` +
        `クリエイティブ ${creative.shots.length} 発 / ゾンビ ${zombie.shots.length} 発`,
    );
    check("間合いより遠いと撃たない", far.shots.length === 0);
    check("近すぎると撃たない（殴る間合い）", close.shots.length === 0);
    check("クリエイティブは狙われない", creative.shots.length === 0);
    check("撃たないモブは撃たない", zombie.shots.length === 0);
  }

  {
    // 近接の重みが**表から**来ていること。表を直しただけでは、殴る側が
    // 1 つの定数を見たままでも通ってしまう。
    const hits: Partial<Record<MobKind, number[]>> = {};
    for (const kind of ["zombie", "blaze"] as MobKind[]) {
      const arena = quiet(flatGrass());
      const pack = new Mobs();
      const amounts: number[] = [];
      const vitals: MobTarget = {
        damage: (amount) => {
          amounts.push(amount);
          return true;
        },
      };
      const c = ctx({ random: seeded(63), vitals });
      // **プレイヤーと同じ高さに置くこと。** ブレイズは床から 2.5 浮くので、
      // 平地に立っているプレイヤーには（`ATTACK_HEIGHT` を超えて）近接が届かない。
      pack.spawn(kind, 0.5, 11, 1.5, 0, seeded(64));
      pack.update(1 / 60, arena.asWorld(), c);
      hits[kind] = amounts;
    }
    console.log(
      `      近接 1 発: ゾンビ ${JSON.stringify(hits.zombie)} / ブレイズ ${JSON.stringify(hits.blaze)}`,
    );
    check(
      "殴る重みは表から来る",
      hits.zombie?.[0] === MOBS.zombie.damage && hits.blaze?.[0] === MOBS.blaze.damage,
      `${hits.zombie?.[0]} / ${hits.blaze?.[0]}`,
    );
    check(
      "ブレイズの一撃はゾンビより重い",
      (hits.blaze?.[0] ?? 0) > (hits.zombie?.[0] ?? 0),
      `${hits.blaze?.[0]} > ${hits.zombie?.[0]}`,
    );
  }

  {
    // **壁越しに撃たないこと。** 姿の見えない所から火球が飛んでくると、
    // どこから撃たれているのか分からないまま焼かれる（要塞は壁だらけ）。
    const blocked = blazeShots({ distance: 10, wall: true });
    console.log(`      壁ごし: ${blocked.shots.length} 発（同じ距離で壁が無ければ 1 発）`);
    check("見えていなければ撃たない", blocked.shots.length === 0);
  }

  {
    // 間隔。**1 秒では 2 発目が出ないこと**（`cooldown` は 3 秒）。
    const short = blazeShots({ distance: 15, seconds: 1 });
    // **2 発目のすぐあとで止めること。** 回し続けると詰め寄って `near` を割り込み、
    // 「間隔が明けたのに撃たない」形で落ちる（測っているのは間隔であって間合いではない）。
    const long = blazeShots({ distance: 15, seconds: 3.2 });
    console.log(
      `      15m から 1 秒 ${short.shots.length} 発 / 3.2 秒 ${long.shots.length} 発` +
        `（3.2 秒後の距離 ${long.distance.toFixed(1)}m・間合いは ${MOBS.blaze.ranged?.near}m から）`,
    );
    check("間隔の内は撃ち直さない", short.shots.length === 1, `${short.shots.length} 発`);
    check("間隔ぶん待つと次の 1 発", long.shots.length === 2, `${long.shots.length} 発`);
  }

  {
    // **通しで 1 本。** 撃つ（`mobs.ts`）→ 飛ぶ（`projectiles.ts`）→ 当たる（`mobs.ts`）。
    // どれか 1 つが繋がっていないと、ここだけが赤くなる。
    const arena = quiet(flatGrass());
    const pack = new Mobs();
    const flying = new Projectiles();
    const taken: [number, string, number | undefined][] = [];
    const vitals: MobTarget = {
      damage: (amount, cause, cooldown) => {
        taken.push([amount, cause, cooldown]);
        return true;
      },
    };
    const c = ctx({
      random: seeded(57),
      vitals,
      shoot: (shot) => {
        flying.fire(shot);
      },
    });
    flying.onHitTarget = (shot, target) => pack.hitByProjectile(shot, target, c);
    const blaze = pack.spawn("blaze", 0.5, 13, 10.5, 0, seeded(58));
    blaze.shootTimer = 0;
    const world = arena.asWorld();
    let flew = 0;
    for (let f = 0; f < 120; f++) {
      pack.update(1 / 60, world, c);
      flying.update(1 / 60, world, pack.projectileTargets(c));
      flew = Math.max(flew, flying.count);
    }
    console.log(
      `      通し（2 秒）: 飛んだ ${flew} 個  当たり ${taken.length} 回 ${JSON.stringify(taken)}`,
    );
    // **先に「ちゃんと飛んだ」ことを見ること**（`rules/testing.md`）。
    // 1 発も出ていないのに「当たらなかった」で通る形を避ける。
    check("火球が飛んだ", flew > 0, `${flew} 個`);
    check("撃った火球がプレイヤーに当たる", taken.length > 0, `${taken.length} 回`);
    check("重みは表のとおり（火球 5）", taken[0]?.[0] === 5, `${taken[0]?.[0]}`);
    // **近接と同じ窓を共有すること。** 別の窓にすると、殴られながら火球を受けたときだけ
    // 倍の速さで減る。
    check(
      "死因も無敵時間も近接と同じ",
      taken[0]?.[1] === "モンスター" && taken[0]?.[2] === MOB_HURT_COOLDOWN,
      `${taken[0]?.[1]} / ${taken[0]?.[2]}`,
    );
  }

  {
    // 当たり先の並び。**使い回しの配列なので、その場で控えること。**
    const pack = new Mobs();
    pack.spawn("zombie", 3.5, 11, 0.5, 0, seeded(59));
    pack.spawn("pig", 5.5, 11, 0.5, 0, seeded(60));
    const c = ctx({});
    const targets = pack.projectileTargets(c);
    const owners = targets.map((t) => t.owner);
    const playerFoot = targets[0].position.y;
    const playerHeight = targets[0].size.height;
    const creative = pack.projectileTargets(ctx({ invulnerable: true })).map((t) => t.owner);
    console.log(
      `      的: ${owners.join(" ")}（0 はプレイヤー）  クリエイティブ: ${creative.join(" ")}  ` +
        `プレイヤーの足元 y ${playerFoot} 高さ ${playerHeight}`,
    );
    check("プレイヤーとモブが全部並ぶ", owners.length === 3, `${owners.length} 件`);
    check("プレイヤーの印は 0", owners[0] === PLAYER_OWNER);
    // モブの id は 1 から。**0 と食い違うので、撃った本人に当たることがない。**
    check("モブの印は 0 と食い違う", owners.slice(1).every((id) => id !== PLAYER_OWNER), owners.join(" "));
    check("プレイヤーの的は足元の中心 + 背丈", playerFoot === 11 && playerHeight === 1.8);
    check("クリエイティブでは的から外れる", creative.length === 2 && !creative.includes(PLAYER_OWNER));
  }

  {
    // 当たったあと。**倒したのがプレイヤーの弾のときだけ落ちる**（`attack()` と同じ規則）。
    const pack = new Mobs();
    const flying = new Projectiles();
    const dropped: number[] = [];
    pack.onDrop = (item) => dropped.push(item);
    const c = ctx({});
    pack.spawn("pig", 3.5, 11, 0.5, 0, seeded(61));
    pack.spawn("pig", 5.5, 11, 0.5, 0, seeded(62));
    const targets = pack.projectileTargets(c);
    const mine = targets[1];
    const stray = targets[2];
    const arrow = flying.spawn("arrow", 0.5, 12, 0.5, 0, 0, -1, PLAYER_OWNER, 100);
    const other = flying.spawn("fireball", 0.5, 12, 0.5, 0, 0, -1, 9, 100);
    pack.hitByProjectile(arrow!, mine, c);
    const afterMine = [pack.count, dropped.length];
    pack.hitByProjectile(other!, stray, c);
    console.log(
      `      プレイヤーの矢: 残り ${afterMine[0]} 体・落とし物 ${afterMine[1]} 件 → ` +
        `モブの流れ弾: 残り ${pack.count} 体・落とし物 ${dropped.length} 件`,
    );
    check("プレイヤーが倒したら落ちる", afterMine[0] === 1 && dropped[0] === RAW_PORK);
    check("モブの流れ弾では落ちない", pack.count === 0 && dropped.length === 1);
  }

  describe("モブの費用");

  // 上限まで居る状態のフレーム時間。**constants.ts の予算から上限を導かないこと**
  // （予算そのものを壊す退行を見逃す）。ここは「チャンク 1 個ぶん」を単位にする。
  const busy = flatGrass();
  const crowd = new Mobs();
  for (let i = 0; i < MAX_MOBS; i++) {
    const a = (i / MAX_MOBS) * Math.PI * 2;
    // 3 種類を混ぜる（ゾンビが入ると追跡と日光の判定も費用に乗る）
    crowd.spawn(MOB_KINDS[i % MOB_KINDS.length], Math.cos(a) * 20 + 0.5, 11, Math.sin(a) * 20 + 0.5, a, seeded(100 + i));
  }
  // **真夜中で測ること。** 昼にするとゾンビが焼け死んで数が減り、
  // 「上限まで居るときの費用」を測っていないことに気付けない。
  const busyCtx = ctx({ random: seeded(31), brightness: midnight });
  for (let i = 0; i < 60; i++) crowd.update(1 / 60, busy.asWorld(), busyCtx); // 暖機
  const frames: number[] = [];
  for (let i = 0; i < 900; i++) {
    const t = performance.now();
    crowd.update(1 / 60, busy.asWorld(), busyCtx);
    frames.push(performance.now() - t);
  }
  frames.sort((a, b) => a - b);
  const median = frames[Math.floor(frames.length * 0.5)];
  const p99 = frames[Math.floor(frames.length * 0.99)];
  console.log(
    `      ${crowd.count} 体でのフレーム時間: 中央 ${median.toFixed(3)}ms / p99 ${p99.toFixed(3)}ms`,
  );
  // チャンク 1 個の生成が約 1ms。モブはその半分に収まっていること。
  check("上限まで居ても 1 フレームが軽い", median < 0.5, `中央 ${median.toFixed(3)}ms / 上限 0.5ms`);
  // 測っている最中に減っていないこと（減っていたら上の数字は上限の費用ではない）
  check("測っているあいだ数が減っていない", crowd.count === MAX_MOBS, `${crowd.count} / ${MAX_MOBS} 体`);

  crowd.clear();
  check("clear で全部消える", crowd.count === 0);

  describe("近くのモンスター（ベッドで寝られるか）");

  {
    const near = new Mobs();
    // **先に「そこに居るのに false」でないこと**を確かめる。数えていないだけで
    // 通ってしまう形の偽陽性を避ける（`.claude/rules/testing.md`）。
    near.spawn("zombie", 3, 10, 0, 0, seeded(7));
    check("敵対モブが半径の内に居れば true", near.hostileNear(0, 10, 0, 8));
    check("半径の外なら false", !near.hostileNear(0, 10, 0, 2));
    check("半径ぴったりは内側に数える", near.hostileNear(0, 10, 0, 3));

    // 受動モブは数えない（羊に囲まれて寝られないのはおかしい）
    const passive = new Mobs();
    passive.spawn("sheep", 1, 10, 0, 0, seeded(8));
    passive.spawn("pig", 0, 10, 1, 0, seeded(9));
    check("受動モブは数えない", !passive.hostileNear(0, 10, 0, 8), `${passive.count} 体居る`);

    // 距離は 3 次元で見る（真上の穴に居るゾンビも数える）
    const above = new Mobs();
    above.spawn("zombie", 0, 15, 0, 0, seeded(10));
    check("真上のゾンビも数える", above.hostileNear(0, 10, 0, 8));
    check("縦に離れていれば数えない", !above.hostileNear(0, 10, 0, 4));

    check("1 体も居なければ false", !new Mobs().hostileNear(0, 10, 0, 8));
  }
}
