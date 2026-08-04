import { readFileSync } from "node:fs";
import { AIR, BEDROCK, STONE, STONE_SLAB, WATER } from "../src/blocks";
import { WORLD_HEIGHT } from "../src/constants";
import { buildMobMesh } from "../src/mobmesh";
import { MOBS, MOB_KINDS, Mobs, mobRgb, walkSwing, WALK_SWING, type MobDef } from "../src/mobs";
import type { World } from "../src/world";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";

/** `getVoxel` だけを持つ試験場（`physics.test.ts` と同じ理由でこれで足りる）。 */
class Arena {
  private readonly cells = new Map<number, number>();

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
}

function flatArena(): World {
  const arena = new Arena();
  arena.fill(-20, 20, 10, 10, -20, 20, STONE);
  return arena as unknown as World;
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
  check('mobmesh.ts は three を import しない', !meshSource.includes('from "three"'));

  // 逆向き。判断が描画側へ漏れていないか（漏れると、その判断だけテストが届かなくなる）。
  const renderSource = stripComments("src/mobrender.ts");
  const decisions = ["Math.random(", "spawn", "damage", "MOB_KINDS", "maxHealth"].filter((name) =>
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

    // 頂点数 = 箱の数 x 24。統合はしないので、ここは必ず一致する。
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

    // 色と光の属性。色が範囲外だと白飛びし、光の長さが違うとシェーダが読み違える。
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

  // 前後の脚が互い違いに出るか（同じ位相だと 4 本そろって前に出て、跳ねて見える）
  const pig = MOBS.pig;
  // 位相 0 と π は sin が両方 0 なので、振れ幅が最大になる 1/4 周ずらした所で見る
  const swingPhases = pig.groups.filter((g) => g.motion === "swing").map((g) => g.phase);
  const distinct = new Set(swingPhases.map((p) => walkSwing(p + Math.PI / 2).toFixed(6)));
  check("脚が互い違いに振れる", distinct.size === 2, `位相 ${swingPhases.length} 本 / 見え方 ${distinct.size} 通り`);
  // 対角の 2 本が同じ向き（前左と後右）。全部そろうと跳ねて見える。
  check(
    "対角の脚がそろう",
    walkSwing(swingPhases[0] + 1) === walkSwing(swingPhases[3] + 1) &&
      walkSwing(swingPhases[1] + 1) === walkSwing(swingPhases[2] + 1),
  );

  describe("モブの物理");

  const world = flatArena();
  const mobs = new Mobs();
  const pigMob = mobs.spawn("pig", 0.5, 16, 0.5);
  check("湧かせると数が増える", mobs.count === 1);

  for (let i = 0; i < 180; i++) mobs.update(1 / 60, world);
  check("落ちて地面に立つ", pigMob.onGround && Math.abs(pigMob.position.y - 11) < 1e-9, `y=${pigMob.position.y}`);
  check("止まっていれば位相が進まない", pigMob.walkPhase === 0, `位相 ${pigMob.walkPhase}`);

  // 歩いた距離で位相が進む（時間ではない）。速度を与えて確かめる。
  pigMob.velocity.set(2, 0, 0);
  const startX = pigMob.position.x;
  for (let i = 0; i < 60; i++) {
    pigMob.velocity.x = 2;
    mobs.update(1 / 60, world);
  }
  const walked = pigMob.position.x - startX;
  check("歩いた距離で位相が進む", pigMob.walkPhase > 0 && walked > 1.5, `${walked.toFixed(2)} ブロックで位相 ${pigMob.walkPhase.toFixed(2)}`);

  // 壁に押し付けても位相は進まない（時間で刻むと、その場で足踏みして見える）
  const wallArena = new Arena();
  wallArena.fill(-20, 20, 10, 10, -20, 20, STONE);
  wallArena.fill(3, 3, 11, 13, -20, 20, STONE);
  const walled = new Mobs();
  const pusher = walled.spawn("pig", 0.5, 11, 0.5);
  for (let i = 0; i < 120; i++) {
    pusher.velocity.x = 4;
    walled.update(1 / 60, wallArena as unknown as World);
  }
  const stuckPhase = pusher.walkPhase;
  for (let i = 0; i < 120; i++) {
    pusher.velocity.x = 4;
    walled.update(1 / 60, wallArena as unknown as World);
  }
  check("壁に押し付けても脚は振れない", pusher.walkPhase === stuckPhase, `位相 ${stuckPhase.toFixed(2)} のまま`);
  check("壁を貫通しない", pusher.position.x < 3, `x=${pusher.position.x.toFixed(3)}`);

  // ハーフブロックは歩いて登れる（段差 0.5）
  const slabArena = new Arena();
  slabArena.fill(-20, 20, 10, 10, -20, 20, STONE);
  slabArena.fill(3, 6, 11, 11, -20, 20, STONE_SLAB);
  const stepper = new Mobs();
  const climber = stepper.spawn("pig", 0.5, 11, 0.5);
  for (let i = 0; i < 180; i++) {
    climber.velocity.x = 2;
    stepper.update(1 / 60, slabArena as unknown as World);
  }
  check("ハーフブロックを歩いて登れる", climber.position.y >= 11.5, `y=${climber.position.y.toFixed(3)} x=${climber.position.x.toFixed(2)}`);

  // 水中で沈み続けない（水底を歩き続けると、あとで溺れを入れたときに黙って死ぬ）。
  // 水は y=10..15（水面の上端は 16）、その下は石。落ちてから浮いてくるはず。
  const poolArena = new Arena();
  poolArena.fill(-20, 20, 0, 9, -20, 20, STONE);
  poolArena.fill(-4, 4, 10, 15, -4, 4, WATER);
  const pool = new Mobs();
  const swimmer = pool.spawn("pig", 0.5, 20, 0.5);
  let sank = 20;
  for (let i = 0; i < 600; i++) {
    pool.update(1 / 60, poolArena as unknown as World);
    sank = Math.min(sank, swimmer.position.y);
  }
  check(
    "水中で沈み続けない（水面まで浮く）",
    swimmer.position.y > 14,
    `いま y=${swimmer.position.y.toFixed(2)} / いちばん沈んだ所 y=${sank.toFixed(2)}（水底は 10）`,
  );

  mobs.clear();
  check("clear で全部消える", mobs.count === 0);
}
