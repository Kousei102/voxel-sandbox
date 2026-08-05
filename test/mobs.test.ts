import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import { AIR, BEDROCK, GRASS, SAND, STONE, STONE_SLAB, WATER, WOOL } from "../src/blocks";
import { MAX_LIGHT, WORLD_HEIGHT } from "../src/constants";
import { DayNight } from "../src/daynight";
import { NO_ITEM, RAW_PORK, STONE_AXE, WOOD_PICKAXE, itemName } from "../src/items";
import { SKY_LIGHT } from "../src/lighting";
import { buildMobMesh } from "../src/mobmesh";
import {
  DESPAWN_DISTANCE,
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
  canSpawnPassive,
  mobRgb,
  spawnLight,
  walkSwing,
  type MobContext,
  type MobDef,
} from "../src/mobs";
import { boxBlocked } from "../src/physics";
import { raycastVoxels } from "../src/raycast";
import type { Sfx } from "../src/sfx";
import type { World } from "../src/world";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";

/**
 * `getVoxel` / `getLight` / `hasColumn` だけを持つ試験場
 * （`physics.test.ts` と同じ理由で、当たり判定と湧きが見るのはこれだけ）。
 */
class Arena {
  private readonly cells = new Map<number, number>();
  /** 一律のスカイライト。0 のままなら受動モブは 1 体も湧かない。 */
  sky = 0;
  block = 0;

  private key(x: number, y: number, z: number): number {
    return ((x + 512) * 1024 + (z + 512)) * 128 + y;
  }

  fill(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
    id: number,
  ): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.cells.set(this.key(x, y, z), id);
      }
    }
  }

  getVoxel(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= WORLD_HEIGHT) return AIR;
    return this.cells.get(this.key(x, y, z)) ?? AIR;
  }

  getLight(_x: number, _y: number, _z: number, channel = SKY_LIGHT): number {
    return channel === SKY_LIGHT ? this.sky : this.block;
  }

  hasColumn(): boolean {
    return true;
  }

  asWorld(): World {
    return this as unknown as World;
  }
}

/** 決まった順で同じ数列を返す乱数。湧きと AI のテストを再現できるようにする。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function ctx(over: Partial<MobContext> = {}): MobContext {
  return { playerX: 0.5, playerY: 11, playerZ: 0.5, brightness: 1, random: seeded(12345), ...over };
}

function flatGrass(): Arena {
  const arena = new Arena();
  arena.fill(-80, 80, 10, 10, -80, 80, GRASS);
  arena.sky = MAX_LIGHT;
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
  const decisions = ["Math.random(", "spawn", "damage", "MOB_KINDS", "maxHealth", "hostile"].filter((name) =>
    renderSource.includes(name),
  );
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
    const fits = Math.max(-minX, maxX, -minZ, maxZ) <= def.size.half + 1e-9 && maxY <= def.size.height + 1e-9;
    check(
      `${def.name}: モデルが当たり判定に収まる`,
      fits,
      `x±${Math.max(-minX, maxX).toFixed(3)} z±${Math.max(-minZ, maxZ).toFixed(3)} 高さ ${maxY.toFixed(3)} / 判定 ±${def.size.half} x ${def.size.height}`,
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
  flat.sky = 0; // このグループでは自然な湧きを起こさない
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

  // 離れると消える。**DESPAWN_DISTANCE は UNLOAD_DISTANCE * CHUNK_SIZE より小さいこと。**
  // 大きいと、ボクセルの無い列にモブが立って世界を突き抜けて落ちる。
  check("デスポーン距離が読み込み範囲の内側", DESPAWN_DISTANCE < 10 * 16, `${DESPAWN_DISTANCE} < 160`);
  const before = wild.count;
  for (let frame = 0; frame < 60; frame++) {
    wild.update(1 / 60, field.asWorld(), ctx({ playerX: 400, playerZ: 400, random: seeded(9) }));
  }
  check("プレイヤーが離れると消える", wild.count === 0, `${before} 体 → ${wild.count} 体`);

  describe("モブの AI");

  // 徘徊。固まりもせず、無限遠へも行かない。
  const roam = flatGrass();
  roam.sky = 0;
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
  ledge.sky = 0;
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
    arena.sky = 0;
    return arena;
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

  // 倒れるまでの回数とドロップ。落ちたアイテムの仕組みがまだ無いので、
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
    check(
      `${MOBS[kind].name}: ドロップが 1 回だけ入る`,
      drops.length === 1 && drop.item === MOBS[kind].drop.item && drop.count === MOBS[kind].drop.count,
      `${drops.length} 回`,
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

  describe("モブの費用");

  // 上限まで居る状態のフレーム時間。**constants.ts の予算から上限を導かないこと**
  // （予算そのものを壊す退行を見逃す）。ここは「チャンク 1 個ぶん」を単位にする。
  const busy = flatGrass();
  const crowd = new Mobs();
  for (let i = 0; i < MAX_MOBS; i++) {
    const a = (i / MAX_MOBS) * Math.PI * 2;
    crowd.spawn(i % 2 ? "pig" : "sheep", Math.cos(a) * 20 + 0.5, 11, Math.sin(a) * 20 + 0.5, a, seeded(100 + i));
  }
  const busyCtx = ctx({ random: seeded(31) });
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

  crowd.clear();
  check("clear で全部消える", crowd.count === 0);
}
