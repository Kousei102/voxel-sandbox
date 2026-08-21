import { readFileSync } from "node:fs";
import { GRASS, STONE, WATER } from "../src/blocks";
import {
  MAX_PROJECTILES,
  PROJECTILE_KINDS,
  Projectiles,
  boxOf,
  projectileDef,
  type ProjectileKind,
} from "../src/projectiles";
import { buildBoxMesh } from "../src/mobmesh";
import { mobRgb } from "../src/mobs";
import { VOID_Y } from "../src/vitals";
import { Arena, sourceOf } from "./arena";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";

/** 平らな草原（上面 y=11）と、その上の広い空。 */
function field(): Arena {
  const arena = new Arena();
  arena.fill(-40, 40, 10, 10, -40, 40, GRASS);
  return arena;
}

/** dt 刻みで `seconds` 秒ぶん回す。 */
function advance(p: Projectiles, arena: Arena, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) p.update(dt, arena.asWorld());
}

export function run(): void {
  describe("飛んでいるもの（純粋と描画の切り分け）");

  // 描画はこの環境では確かめられない。だから「判断」は projectiles.ts に閉じ込めてあり、
  // three に触るのは projectilerender.ts だけ。ここが崩れると、飛び道具まわりが
  // 丸ごと「ブラウザを開くまで確かめられないもの」になる。
  const source = sourceOf("src/projectiles.ts");
  const rendering = [
    "Mesh",
    "BufferGeometry",
    "Material",
    "document.",
    "getElementById",
    "AudioContext",
    "onBeforeCompile",
  ].filter((name) => source.includes(name));
  check("projectiles.ts は描画に触らない", rendering.length === 0, rendering.join(" "));

  // 逆向き。判断が描画側へ漏れていないか（漏れると、その判断だけテストが届かなくなる）。
  const render = sourceOf("src/projectilerender.ts");
  const decisions = [
    "Math.random(",
    "GRAVITY",
    "TERMINAL",
    "MAX_PROJECTILES",
    "hasColumn",
    "blockOverlapsBody",
    "isLiquid",
    "setVoxel",
  ].filter((name) => render.includes(name));
  check("projectilerender.ts に判断が漏れていない", decisions.length === 0, decisions.join(" "));

  // **向きは焼いてある値を読むだけ。** 描画が速度から作り直すと、刺さって止まった矢の
  // 向きがその場で 0 に戻る（止まった瞬間に速度が 0 になるので）。
  check("projectilerender.ts は速度を見ない", !render.includes("velocity"));

  // **いちばん強い判定。** 新しい GLSL はこの環境で一切確かめられないので、
  // 光の合成は terrainshader.ts の既存 3 行を通す以外に道が無いことを構造で保つ。
  const shader = ["ShaderMaterial", "vertexShader", "fragmentShader"].filter((name) =>
    render.includes(name),
  );
  check("projectilerender.ts は新しい GLSL を書かない", shader.length === 0, shader.join(" "));
  check(
    "projectilerender.ts は地形と同じ光の合成を使う",
    render.includes('from "./terrainshader"') && render.includes("useTerrainLighting"),
  );

  // ボクセルの無い列で飛ばすと壁を抜けていく。構造で保っているので、
  // ガードそのものが消えたら気付けるようにしておく。
  check("projectiles.ts は未生成の列を見張っている", source.includes("hasColumn"));
  // `edits` は「プレイヤーがやったこと」でなければならない（モブ・ドロップと同じ制約）。
  check("projectiles.ts は世界を書き換えない", !source.includes("setVoxel"));

  describe("飛び道具の表");

  const names = new Set<string>();
  let sane = 0;
  for (const def of PROJECTILE_KINDS) {
    names.add(def.name);
    console.log(
      `      ${def.kind.padEnd(9)} ${def.name.padEnd(7)} 半径 ${def.half}  速さ ${def.speed}m/s  ` +
        `重力 x${def.gravityScale}  抵抗 ${def.drag}  寿命 ${def.life}s  ` +
        `壁 ${def.onBlock}${def.glows ? "  光る" : ""}${def.aims ? "  向く" : ""}`,
    );
    if (def.half > 0 && def.speed > 0 && def.life > 0 && def.gravityScale >= 0) sane++;
  }
  check("4 種類ある（火球・矢・エンダーアイ・ブレス）", PROJECTILE_KINDS.length === 4);
  check("どれも寸法と速さと寿命が正の数", sane === PROJECTILE_KINDS.length);
  check("名前が重複していない", names.size === PROJECTILE_KINDS.length);
  check(
    "知らない種類を引いたら落ちる（黙って別のものにならない）",
    (() => {
      try {
        projectileDef("なにか" as ProjectileKind);
        return false;
      } catch {
        return true;
      }
    })(),
  );

  describe("飛び道具の形");

  let boxesOk = 0;
  let windingOk = 0;
  for (const def of PROJECTILE_KINDS) {
    const box = boxOf(def.kind);
    // **中心が原点**（向きを変えて回すので、ずれていると回転で位置が動く）。
    const centered =
      box[0] === -box[3] && box[1] === -box[4] && box[2] === -box[5] && box[3] === def.half;
    if (centered) boxesOk++;

    const mesh = buildBoxMesh(box, def.color, mobRgb);
    // 箱の中心は原点なので、面が外を向いているかを中心から見て確かめられる。
    verifyWinding(def.kind, mesh, [0, 0, 0]);
    const volume = signedVolume(mesh);
    const want = (def.half * 2) ** 3;
    console.log(
      `      ${def.kind.padEnd(9)} 三角 ${mesh.indices.length / 3} 枚  体積 ${volume.toFixed(4)}（想定 ${want.toFixed(4)}）`,
    );
    // **相対で見ること。** 頂点は Float32 なので、0.1 のような 2 進で割り切れない
    // 半径だと絶対値では 1e-9 に収まらない（0.125 の落とし物では収まる）。
    if (Math.abs(volume - want) < want * 1e-6) windingOk++;
  }
  check("箱は中心が原点で、当たり判定と同じ大きさ", boxesOk === PROJECTILE_KINDS.length);
  check("体積が寸法どおり（裏返りなし）", windingOk === PROJECTILE_KINDS.length);

  describe("撃つ");

  {
    const arena = field();
    const p = new Projectiles();
    // yaw 0 のとき前は -Z（`player.ts` の forward と同じ規約）。
    const shot = p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    const speed = shot ? shot.velocity.length() : 0;
    console.log(
      `      正面へ: 速度 (${shot?.velocity.x.toFixed(2)}, ${shot?.velocity.y.toFixed(2)}, ${shot?.velocity.z.toFixed(2)})  大きさ ${speed.toFixed(2)}`,
    );
    check("視線の向きへ飛ぶ（yaw 0 で -Z）", !!shot && shot.velocity.z < -11 && Math.abs(shot.velocity.x) < 1e-6);
    check("速さが表のとおり", Math.abs(speed - projectileDef("fireball").speed) < 1e-6);

    const up = p.launch("fireball", 0.5, 20, 0.5, 0, 0.6);
    check("上を向いて撃つと上へ行く", !!up && up.velocity.y > 0);

    check("向きの無い弾は撃たない", p.spawn("fireball", 0, 20, 0, 0, 0, 0) === null);
    console.log(`      2 発撃って ${p.count} 個（向き無しは数に入らない）`);
    check("撃った数だけ増える", p.count === 2);

    p.clear();
    check("clear() で空になる", p.count === 0);
    void arena;
  }

  {
    const p = new Projectiles();
    for (let i = 0; i < MAX_PROJECTILES + 6; i++) p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    console.log(`      ${MAX_PROJECTILES + 6} 発撃って ${p.count} 個  先頭の id ${p.list[0].id}`);
    check("上限で頭打ちになる", p.count === MAX_PROJECTILES);
    // **古いほうから捨てる。** 新しいほうを捨てると、撃った瞬間に消えて
    // 外したのか出ていないのか分からない。
    check("捨てられるのは古いほう", p.list[0].id === 7);
  }

  describe("飛ぶ");

  {
    const arena = field();
    const p = new Projectiles();
    p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 0.5);
    const shot = p.list[0];
    console.log(
      `      火球 0.5 秒: z ${shot.position.z.toFixed(3)}（想定 -5.5）  y ${shot.position.y.toFixed(3)}`,
    );
    check("重力 0 の弾はまっすぐ飛ぶ", Math.abs(shot.position.y - 20) < 1e-6);
    check("速さのぶんだけ進む", Math.abs(shot.position.z - -5.5) < 1e-3);
  }

  {
    const arena = field();
    const p = new Projectiles();
    p.launch("arrow", 0.5, 30, 0.5, 0, 0);
    advance(p, arena, 0.3);
    const arrow = p.list[0];
    const drop = 30 - arrow.position.y;
    const flown = 0.5 - arrow.position.z;
    console.log(
      `      矢 0.3 秒: 落ち ${drop.toFixed(3)}m  進み ${flown.toFixed(2)}m（抵抗無しなら 12m）  ` +
        `pitch ${arrow.pitch.toFixed(3)}`,
    );
    check("重力のある弾は落ちる", drop > 0.5 && drop < 3);
    check("抵抗で少しずつ勢いを失う", flown < 12 && flown > 10);
    // 向きは判断の側で焼く。**落ち始めたら下を向く。**
    check("進む向きを向く（落ちながら下を向く）", arrow.pitch < 0);
  }

  {
    // ボクセルの無い列では動かさない。無いと `getVoxel` が AIR を返して壁を抜ける。
    const arena = field();
    arena.missingColumns.add("0,0");
    const p = new Projectiles();
    p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 0.2);
    console.log(`      未生成の列: z ${p.list[0].position.z}（撃った所のまま）`);
    check("未生成の列では動かない", p.list[0].position.z === 0.5);
  }

  {
    const arena = field();
    const p = new Projectiles();
    let expired = 0;
    p.onExpire = () => expired++;
    // ブレスは寿命 3 秒。上へ撃てば壁にも地面にも当たらない。
    p.launch("breath", 0.5, 30, 0.5, 0, Math.PI / 2);
    advance(p, arena, 2.9);
    const alive = p.count;
    advance(p, arena, 0.3);
    console.log(`      ブレス: 2.9 秒で ${alive} 個 → 3.2 秒で ${p.count} 個（消えた合図 ${expired} 回）`);
    check("寿命が来るまでは残る", alive === 1);
    check("寿命で消える", p.count === 0 && expired === 1);
  }

  {
    // 奈落は寿命任せにしない（世界の底から下はどこまでも空なので落ち続ける）。
    // **試験場は y < 0 を岩盤で塞いでいる**ので、落として待つのではなく
    // 奈落の下から撃つ（`test/drops.test.ts` の奈落の試験と同じ作法）。
    const arena = field();
    const p = new Projectiles();
    let expired = 0;
    p.onExpire = () => expired++;
    p.launch("arrow", 0.5, VOID_Y - 1, 0.5, 0, 0);
    check("奈落に落ちる前は居る", p.count === 1);
    advance(p, arena, 1 / 60, 1 / 60);
    console.log(`      奈落（y < ${VOID_Y}）: ${p.count} 個  消えた合図 ${expired} 回`);
    check("奈落へ落ちたら寿命を待たずに消える", p.count === 0 && expired === 1);
  }

  describe("ぶつかる");

  /** z = -5 に厚さ 1 の石壁を立てた草原。 */
  function walled(): Arena {
    const arena = field();
    arena.fill(-6, 6, 11, 26, -5, -5, STONE);
    return arena;
  }

  {
    const arena = walled();
    const p = new Projectiles();
    const hits: number[][] = [];
    p.onHitBlock = (_shot, x, y, z) => hits.push([x, y, z]);
    p.launch("arrow", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 0.5);
    const arrow = p.list[0];
    console.log(
      `      矢: 当たり ${hits.length} 回 ${JSON.stringify(hits[0])}  z ${arrow?.position.z.toFixed(3)}  刺さり ${arrow?.stuck}`,
    );
    check("矢は壁に刺さって止まる", p.count === 1 && arrow.stuck === true);
    check("当たったマスを 1 回だけ知らせる", hits.length === 1 && hits[0][2] === -5);
    // **めり込ませないこと。** 中に置くと、刺さった矢が壁の中に埋まって見えない。
    // 壁のマスは z ∈ [-5, -4] なので、**箱の前面が -4 より手前**であること
    // （「壁より手前」だけを見ると、半分めり込んでいても通ってしまう ——
    //  実際、止める行を消した状態でも通った）。
    const front = arrow.position.z - projectileDef("arrow").half;
    console.log(`      矢の前面 ${front.toFixed(3)}（壁の面は -4）`);
    check("壁にめり込まない", front >= -4);

    const where = arrow.position.z;
    advance(p, arena, 0.5);
    check("刺さったあとは動かない", arrow.position.z === where);
    check("刺さっても寿命の合図は増えない", hits.length === 1);
  }

  {
    const arena = walled();
    const p = new Projectiles();
    let hits = 0;
    p.onHitBlock = () => hits++;
    p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 1);
    console.log(`      火球: 当たり ${hits} 回  残り ${p.count} 個`);
    check("火球は壁で消える", p.count === 0 && hits === 1);
  }

  {
    const arena = walled();
    const p = new Projectiles();
    let hits = 0;
    p.onHitBlock = () => hits++;
    // **エンダーアイは壁を抜ける。** 要塞は地面の下なので、止まると案内にならない。
    p.launch("eye", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 1);
    console.log(`      エンダーアイ: z ${p.list[0]?.position.z.toFixed(2)}  当たり ${hits} 回`);
    check("エンダーアイは壁を抜けて飛び続ける", p.count === 1 && p.list[0].position.z < -5);
    check("抜けるものは当たりを知らせない", hits === 0);
  }

  {
    // **フレームが重くても抜けない。** 矢は 40m/s なので、1/20 秒だと 2m 進む ——
    // 刻まずに動かすと厚さ 1 マスの壁を飛び越える。
    const arena = walled();
    const p = new Projectiles();
    p.launch("arrow", 0.5, 20, 0.5, 0, 0);
    advance(p, arena, 1, 1 / 20);
    const arrow = p.list[0];
    console.log(`      重いフレーム（1/20 秒）: z ${arrow?.position.z.toFixed(3)}  刺さり ${arrow?.stuck}`);
    check("1 フレームが重くても壁を抜けない", !!arrow && arrow.stuck === true && arrow.position.z > -5);
  }

  describe("液体");

  {
    const dry = field();
    const wet = field();
    wet.fill(-10, 10, 12, 26, -40, 10, WATER);

    const a = new Projectiles();
    const b = new Projectiles();
    a.launch("arrow", 0.5, 20, 0.5, 0, 0);
    b.launch("arrow", 0.5, 20, 0.5, 0, 0);
    advance(a, dry, 0.2);
    advance(b, wet, 0.2);
    const inAir = 0.5 - a.list[0].position.z;
    const inWater = 0.5 - b.list[0].position.z;
    console.log(
      `      矢 0.2 秒: 空中 ${inAir.toFixed(2)}m / 水中 ${inWater.toFixed(2)}m  ` +
        `水に浸かっている ${b.list[0].inLiquid}`,
    );
    check("水に浸かったことが分かる", b.list[0].inLiquid === true);
    check("液体の中では失速する", inWater < inAir * 0.6);
    // **液体でも落ちること。** 止めると水面に矢が浮いたまま残る。
    check("液体の中でも沈んでいく", b.list[0].position.y < 20);
  }

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(
    `      projectiles.ts ${lines("src/projectiles.ts")} 行 / ` +
      `projectilerender.ts ${lines("src/projectilerender.ts")} 行`,
  );
}
