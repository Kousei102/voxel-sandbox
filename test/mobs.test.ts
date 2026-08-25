import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import { AIR, GRASS, LAVA, NETHER_BRICK, SAND, STONE, STONE_SLAB, WATER, WOOL } from "../src/blocks";
import { MAX_LIGHT } from "../src/constants";
import { DayNight } from "../src/daynight";
import { NO_ITEM, RAW_PORK, ROTTEN_FLESH, STONE_AXE, WOOD_PICKAXE, itemName } from "../src/items";
import { buildMobMesh } from "../src/mobmesh";
import {
  ATTACK_RANGE,
  DESPAWN_DISTANCE,
  HOSTILE_LIGHT_MAX,
  HOSTILE_SIGHT,
  MAX_HOSTILE,
  MOB_ATTACK_COOLDOWN,
  MOB_DAMAGE,
  PLAYER_ATTACK_COOLDOWN,
  attackDamage,
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
  walkSwing,
  type MobContext,
  type MobDef,
  type MobKind,
} from "../src/mobs";
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

  describe("湧く地面（どの敵対モブになるか）");

  // **地面を指定したモブが勝つ。** 同じ土俵で抽選すると、要塞の半分がゾンビになって
  // 「ブレイズロッドを集める場所」という意味が薄れる。
  const groundRoll = seeded(211);
  const onBrick = new Set<string>();
  const onStone = new Set<string>();
  for (let i = 0; i < 200; i++) {
    onBrick.add(String(hostileFor(NETHER_BRICK, groundRoll)));
    onStone.add(String(hostileFor(STONE, groundRoll)));
  }
  console.log(
    `      ネザーレンガ → ${[...onBrick].join(" ")} / 石 → ${[...onStone].join(" ")}`,
  );
  check("ネザーレンガの上ではブレイズだけ", onBrick.size === 1 && onBrick.has("blaze"), [...onBrick].join(" "));
  check("それ以外ではゾンビだけ", onStone.size === 1 && onStone.has("zombie"), [...onStone].join(" "));
  check(
    "地面を指定したモブは「どこでも」の地面に湧かない",
    MOB_KINDS.every((kind) => !MOBS[kind].spawnOn || MOBS[kind].hostile),
    "受動モブに spawnOn を付けるなら trySpawn 側も直すこと",
  );

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
  check("両方の種類が湧く", new Set(wild.list.map((m) => m.kind)).size === 2, [...new Set(wild.list.map((m) => m.kind))].join(" "));

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
    const counts: Record<string, number> = { 豚: 0, 羊: 0, ゾンビ: 0 };
    for (const mob of group.list) counts[MOBS[mob.kind].name]++;
    return counts;
  }

  const stone = new Arena();
  stone.fill(-80, 80, 10, 10, -80, 80, STONE);

  const atNight = census(flatGrass(), { brightness: midnight, random: seeded(41) });
  const atNoon = census(flatGrass(), { brightness: noon, random: seeded(41) });
  const torchlit = census((() => { const a = flatGrass(); a.block = 14; return a; })(), { brightness: midnight, random: seeded(41) });
  const inCave = census(stone, { brightness: noon, random: seeded(41) });
  const show = (c: Record<string, number>) => `豚 ${c.豚} / 羊 ${c.羊} / ゾンビ ${c.ゾンビ}`;
  console.log(`      夜の草地      ${show(atNight)}`);
  console.log(`      昼の草地      ${show(atNoon)}`);
  console.log(`      夜+松明の草地 ${show(torchlit)}`);
  console.log(`      昼の洞窟(石)  ${show(inCave)}`);

  check("夜の地表にゾンビが湧く", atNight.ゾンビ > 0, show(atNight));
  check("敵対の上限を超えない", atNight.ゾンビ <= MAX_HOSTILE, `${atNight.ゾンビ} / ${MAX_HOSTILE}`);
  check("昼の地表にはゾンビが湧かない", atNoon.ゾンビ === 0, show(atNoon));
  check("松明を置いた所には湧かない", torchlit.ゾンビ === 0, show(torchlit));
  check("昼でも暗い洞窟には湧く", inCave.ゾンビ > 0, show(inCave));
  // 草でない地面には受動が湧かない（暗さで敵対に振り分けたあとも変わらない）
  check("石の上に受動は湧かない", inCave.豚 === 0 && inCave.羊 === 0, show(inCave));

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
    while (fight.count > 0 && hits < 50) {
      if (fight.attack(victim, weapon, fightCtx)) hits++;
      advance(fight, arena, fightCtx, COOLDOWN_FRAMES);
    }
    const drop = drops[0];
    console.log(
      `      ${MOBS[kind].name}    ${String(MOBS[kind].maxHealth).padStart(2)}  ${itemName(weapon).padEnd(8)}` +
        `  ${perHit.toFixed(1)}   ${String(hits).padStart(2)} 回     ` +
        `${drop ? `${itemName(drop.item)} x${drop.count}` : "なし"}`,
    );
    check(
      `${MOBS[kind].name}: ceil(体力 / ダメージ) 回でちょうど倒れる`,
      hits === expected && fight.count === 0,
      `${hits} 回 / 期待 ${expected} 回`,
    );
    // 確率つきのドロップ（ゾンビの腐った肉）は出ないこともある。
    // **出るなら 1 回だけ・中身は表どおり**が守るべきところ。
    const certain = MOBS[kind].drop.chance >= 1;
    check(
      `${MOBS[kind].name}: ドロップは多くても 1 回で、中身は表どおり`,
      drops.length <= 1 &&
        (!drop || (drop.item === MOBS[kind].drop.item && drop.count === MOBS[kind].drop.count)) &&
        (!certain || drops.length === 1),
      `${drops.length} 回（確率 ${MOBS[kind].drop.chance}）`,
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
