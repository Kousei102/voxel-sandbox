import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import { GRASS, STONE, WATER } from "../src/blocks";
import {
  MAX_PROJECTILES,
  PLAYER_OWNER,
  PROJECTILE_KINDS,
  Projectiles,
  boxOf,
  projectileDef,
  type ProjectileKind,
  type ProjectileTarget,
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
function advance(
  p: Projectiles,
  arena: Arena,
  seconds: number,
  dt = 1 / 60,
  targets: readonly ProjectileTarget[] = [],
): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) p.update(dt, arena.asWorld(), targets);
}

/**
 * 的。**位置は足元の中心**（`physics.ts` の約束。飛び道具だけが体の中心を持つ）で、
 * 大きさはプレイヤーと同じ 0.6 x 1.8。
 */
function dummy(owner: number, x: number, y: number, z: number): ProjectileTarget {
  return { owner, position: new Vector3(x, y, z), size: { half: 0.3, height: 1.8, step: 0 } };
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
    // **当たった先が消えたら、弾もその場から消せること**（エンドクリスタルを砕いた矢）。
    // 消せないと、砕けた相手だけが消えて**矢が空中に浮いたまま残る。**
    // `onHitBlock` の中から呼んでよい（走査が後ろから回るので、いま見ている番号を
    // 抜いてもまだ見ていない前側の並びは動かない）。
    const arena = walled();
    const p = new Projectiles();
    let expired = 0;
    p.onExpire = () => expired++;
    p.onHitBlock = (shot) => {
      p.remove(shot);
    };
    p.launch("arrow", 0.5, 20, 0.5, 0, 0);
    p.launch("arrow", -0.5, 20, 0.5, 0, 0);
    advance(p, arena, 0.5);
    console.log(`      当てた 2 本を消したあと: 残り ${p.count} 本 / 寿命の合図 ${expired} 回`);
    check("当たった弾を onHitBlock の中から消せる", p.count === 0, `${p.count} 本`);
    // **寿命でも上限でもないので `onExpire` は呼ばない**（当たって消える火球と同じ扱い）。
    check("当たって消えたぶんは寿命の合図を出さない", expired === 0, `${expired} 回`);
    // 無いものを渡しても落ちない（2 度呼ばれても 2 本消えない）。
    const ghost = new Projectiles();
    const stray = ghost.launch("arrow", 0, 20, 0, 0, 0);
    check("同じ弾を 2 度消しても 2 度は効かない", ghost.remove(stray!) && !ghost.remove(stray!));
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

  describe("相手に当たる");

  {
    const arena = field();
    const p = new Projectiles();
    const hits: [number, number][] = [];
    p.onHitTarget = (shot, target) => hits.push([target.owner, shot.damage]);
    // 撃ったのはモブ（id 7）で、的はプレイヤー。**重みは撃った側が載せる。**
    p.spawn("fireball", 0.5, 20, 0.5, 0, 0, -1, 7, 5);
    advance(p, arena, 1, 1 / 60, [dummy(PLAYER_OWNER, 0.5, 19.2, -5.5)]);
    console.log(`      火球 → プレイヤー: 当たり ${hits.length} 回 ${JSON.stringify(hits)}  残り ${p.count} 個`);
    check("相手に当たると消える", p.count === 0 && hits.length === 1);
    check(
      "誰に当たったかと重みがそのまま届く",
      hits[0]?.[0] === PLAYER_OWNER && hits[0]?.[1] === 5,
      JSON.stringify(hits[0]),
    );
  }

  {
    // **撃った本人には当たらない。** 口元から出るので、見ないと必ず自分に当たる。
    const arena = field();
    const p = new Projectiles();
    let hits = 0;
    p.onHitTarget = () => hits++;
    const shot = p.spawn("fireball", 0.5, 20, 0.5, 0, 0, -1, 7, 5);
    // 撃った本人（id 7）が進む先に立っている。
    advance(p, arena, 0.3, 1 / 60, [dummy(7, 0.5, 19.2, -2.5)]);
    console.log(`      本人の中を通す: 当たり ${hits} 回  z ${shot?.position.z.toFixed(2)}`);
    check("撃った本人には当たらない", hits === 0 && p.count === 1);
  }

  {
    // **刺さるもの（矢）も、相手に当たったら残らない。** 体に刺さった矢を
    // 持ち歩かせる仕組みが無いので、壁と同じ扱いにすると宙に矢が浮く。
    const arena = field();
    const p = new Projectiles();
    let hits = 0;
    p.onHitTarget = () => hits++;
    p.spawn("arrow", 0.5, 20, 0.5, 0, 0, -1, PLAYER_OWNER, 9);
    advance(p, arena, 0.5, 1 / 60, [dummy(3, 0.5, 19.2, -8.5)]);
    console.log(`      矢 → モブ: 当たり ${hits} 回  残り ${p.count} 個`);
    check("矢は相手に刺さらず消える", hits === 1 && p.count === 0);
  }

  {
    // **素通りするもの（エンダーアイ）は相手も見ない。** 案内役なので、
    // 通り道に立った人を撃つ道理がない。
    const arena = field();
    const p = new Projectiles();
    let hits = 0;
    p.onHitTarget = () => hits++;
    p.spawn("eye", 0.5, 20, 0.5, 0, 0, -1, PLAYER_OWNER, 5);
    advance(p, arena, 1, 1 / 60, [dummy(3, 0.5, 19.2, -4.5)]);
    console.log(`      エンダーアイ: 当たり ${hits} 回  z ${p.list[0]?.position.z.toFixed(2)}`);
    check("素通りするものは相手にも当たらない", hits === 0 && p.count === 1);
  }

  {
    // **フレームが重くても相手を飛び越えない**（壁と同じ 0.2m 刻みに乗せてある）。
    // 矢は 40m/s なので、1/20 秒だと 1 回に 2m 進む —— 刻まないと、
    // z が -9.5 → -11.5 と飛んで、あいだに立っている的をまたぐ。
    // **的の高さは落ちたぶんに合わせてある**（11m 先で 1.1m ほど落ちる）。
    const arena = field();
    const p = new Projectiles();
    let hits = 0;
    p.onHitTarget = () => hits++;
    p.spawn("arrow", 0.5, 20, 0.5, 0, 0, -1, PLAYER_OWNER, 9);
    advance(p, arena, 0.5, 1 / 20, [dummy(3, 0.5, 18, -10.5)]);
    console.log(`      重いフレーム（1/20 秒）: 当たり ${hits} 回  残り ${p.count} 個`);
    check("1 フレームが重くても相手を抜けない", hits === 1 && p.count === 0);
  }

  {
    // 高さの約束（飛び道具は体の中心・相手は足元の中心）。**頭の上は当たらない。**
    const arena = field();
    const p = new Projectiles();
    let hits = 0;
    p.onHitTarget = () => hits++;
    p.spawn("fireball", 0.5, 24, 0.5, 0, 0, -1, 7, 5);
    advance(p, arena, 1, 1 / 60, [dummy(PLAYER_OWNER, 0.5, 19.2, -5.5)]);
    console.log(`      頭上 3m を通す: 当たり ${hits} 回`);
    check("背より上を飛んだものは当たらない", hits === 0);
  }

  {
    // 注文（`Shot`）の形。**撃つ側が値を決めて渡す**ので、そのまま載っていること。
    const p = new Projectiles();
    const shot = p.fire({ kind: "fireball", x: 0.5, y: 20, z: 0.5, dx: 0, dy: 0, dz: -1, owner: 12, damage: 5 });
    const plain = p.launch("fireball", 0.5, 20, 0.5, 0, 0);
    console.log(
      `      注文: owner ${shot?.owner} / 重み ${shot?.damage}　既定: owner ${plain?.owner} / 重み ${plain?.damage}`,
    );
    check("注文の撃ち手と重みが弾に載る", shot?.owner === 12 && shot?.damage === 5);
    // **既定は「プレイヤーが撃った、重み 0」。** デバッグの `N` キーで何かが減らないように。
    check("既定はプレイヤーの重み 0", plain?.owner === PLAYER_OWNER && plain?.damage === 0);
  }

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(
    `      projectiles.ts ${lines("src/projectiles.ts")} 行 / ` +
      `projectilerender.ts ${lines("src/projectilerender.ts")} 行`,
  );
}
