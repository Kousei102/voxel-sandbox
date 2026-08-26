import { Vector3 } from "three";
import { GRASS } from "../src/blocks";
import {
  DRAW_SECONDS,
  Drawing,
  FULL_DRAW_PITCH,
  MAX_ARROW_DAMAGE,
  MIN_ARROW_DAMAGE,
  MIN_POWER,
  SHOOT_HEIGHT,
  arrowDamage,
  drawPower,
} from "../src/bow";
import { ARROW, BOW, isBow, itemName, itemStackLimit } from "../src/items";
import { PLAYER_OWNER, Projectiles, type ProjectileTarget } from "../src/projectiles";
import { recipeFor } from "../src/sfx";
import { Arena, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 平らな草原（上面 y=11）と、その上の広い空。`test/projectiles.test.ts` と同じ形。 */
function field(): Arena {
  const arena = new Arena();
  arena.fill(-40, 40, 10, 10, -40, 40, GRASS);
  return arena;
}

/** 的。**位置は足元の中心**（`physics.ts` の約束）で、大きさはプレイヤーと同じ。 */
function dummy(owner: number, x: number, y: number, z: number): ProjectileTarget {
  return { owner, position: new Vector3(x, y, z), size: { half: 0.3, height: 1.8, step: 0 } };
}

/** 弓を持って `seconds` 秒引く（矢はある・画面は生きている、という並の状況）。 */
function drawFor(seconds: number, dt = 1 / 60): Drawing {
  const bow = new Drawing();
  bow.begin(BOW);
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) bow.advance(dt, { playing: true, held: BOW, hasArrow: true });
  return bow;
}

export function run(): void {
  describe("弓と矢");

  // --- 切り分け（`bow.ts` は判断だけを持つ） ---
  const source = sourceOf("src/bow.ts");
  const leaked = [
    "Mesh",
    "Material",
    "document.",
    "getElementById",
    "AudioContext",
    "Math.random(",
    // アイテム ID を知り始めると、「どれが弓か」が `items.ts` の表と 2 か所になる。
    "items",
    "inventory",
    // 飛ばすのは `projectiles.ts` の仕事。ここは重みを決めるだけ。
    "Projectiles",
  ].filter((name) => source.includes(name));
  check("bow.ts は判断だけを持つ（描画・持ち物・飛ばす所に触らない）", leaked.length === 0, leaked.join(" "));

  // --- 引き具合とダメージの表（触ったときに壊れ方が見えるように出す） ---
  console.log("      引き(秒)   引き具合   ダメージ");
  for (const seconds of [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.0, 1.5]) {
    const power = drawPower(seconds);
    const damage = arrowDamage(power);
    console.log(
      `      ${seconds.toFixed(2).padStart(6)}   ${power.toFixed(2).padStart(6)}   ` +
        `${damage === 0 ? "放てない" : damage.toString().padStart(6)}`,
    );
  }

  check("満引きは 1.0 秒（Minecraft と同じ）", DRAW_SECONDS === 1 && drawPower(1) === 1);
  check("引き続けても 1 を超えない", drawPower(10) === 1, `${drawPower(10)}`);
  check("引いていなければ 0", drawPower(0) === 0 && drawPower(-1) === 0);
  check(
    "満引きのダメージは 9（Minecraft と同じ）",
    arrowDamage(1) === MAX_ARROW_DAMAGE && MAX_ARROW_DAMAGE === 9,
    `${arrowDamage(1)}`,
  );
  check(
    "浅い引きでは放てない（矢を減らさない）",
    arrowDamage(MIN_POWER - 0.01) === 0 && arrowDamage(0) === 0,
    `下限 ${MIN_POWER}`,
  );
  // **0 にしないこと。** 当たっても何も起きない矢は、外したのと区別が付かない。
  check(
    "放てるならダメージは必ず 1 以上",
    arrowDamage(MIN_POWER) >= MIN_ARROW_DAMAGE && MIN_ARROW_DAMAGE >= 1,
    `下限の引きで ${arrowDamage(MIN_POWER)}`,
  );
  check(
    "引くほど強くなる",
    arrowDamage(0.3) < arrowDamage(0.6) && arrowDamage(0.6) < arrowDamage(1),
    `${arrowDamage(0.3)} → ${arrowDamage(0.6)} → ${arrowDamage(1)}`,
  );

  // --- 引いている最中（`Eating` とまったく同じ形） ---
  {
    const bow = new Drawing();
    check("引き始める前は何も起きていない", !bow.active && bow.power === 0 && bow.release() === null);

    bow.begin(BOW);
    const facts = { playing: true, held: BOW, hasArrow: true };
    let fulls = 0;
    for (let i = 0; i < 30; i++) if (bow.advance(1 / 60, facts) === "full") fulls++;
    console.log(`      0.5 秒引いた: 引き具合 ${bow.power.toFixed(2)} / 満引きの合図 ${fulls} 回`);
    check("押しているあいだ引きが溜まる", bow.active && Math.abs(bow.power - 0.5) < 0.02, `${bow.power}`);
    check("満引き前は合図が出ない", fulls === 0);

    for (let i = 0; i < 60; i++) if (bow.advance(1 / 60, facts) === "full") fulls++;
    check("満引きに達すると合図が 1 度だけ出る", fulls === 1 && bow.power === 1, `${fulls} 回`);
  }

  // --- 中断する条件（**ここに集めてあること**が肝心） ---
  for (const [name, facts] of [
    ["画面が変わった（ポインタが外れた）", { playing: false, held: BOW, hasArrow: true }],
    ["手を持ち替えた", { playing: true, held: ARROW, hasArrow: true }],
    ["矢が尽きた", { playing: true, held: BOW, hasArrow: false }],
  ] as const) {
    const bow = drawFor(0.9);
    const before = bow.power;
    const step = bow.advance(1 / 60, facts);
    check(
      `${name}ら引きが無かったことになる`,
      step === "none" && !bow.active && bow.power === 0 && bow.release() === null,
      `中断前 ${before.toFixed(2)}`,
    );
  }

  // --- 離したとき ---
  {
    const bow = drawFor(1.2);
    const shot = bow.release();
    check("満引きで離すと 9 の矢が出る", shot?.damage === 9 && shot.power === 1, JSON.stringify(shot));
    // **2 回呼んでも 2 本は出ない**（離したのと画面が変わったのが同じフレームに来る）。
    check("離したあとは何も出ない", bow.release() === null && !bow.active);
  }
  {
    const bow = drawFor(0.5);
    const shot = bow.release();
    check(
      "半分の引きでも放てる（弱いだけ）",
      shot !== null && shot.damage > 0 && shot.damage < MAX_ARROW_DAMAGE,
      JSON.stringify(shot),
    );
  }
  {
    const bow = drawFor(0.05);
    check("引きが浅いと放たない（矢は減らない）", bow.release() === null && !bow.active);
  }

  // --- 実際に撃って当てる（重みが相手まで届くか） ---
  // **注文の値だけを見ないこと。** 表の速さが 0 でも、載せた数字だけなら通る。
  {
    const bow = drawFor(1.2);
    const shot = bow.release();
    const p = new Projectiles();
    const hits: [number, number][] = [];
    p.onHitTarget = (fired, target) => hits.push([target.owner, fired.damage]);
    // 目の高さから、まっすぐ前（yaw 0 は -Z）へ。`main.ts` の `loose()` と同じ形。
    const arrow = p.launch(
      "arrow", 0.5, 11 + SHOOT_HEIGHT, 0.5, 0, 0, PLAYER_OWNER, shot?.damage ?? 0,
    );
    const arena = field();
    // 8m 先に立つゾンビ（撃ち手はプレイヤーなので当たる）。
    const targets = [dummy(3, 0.5, 11, -8.5)];
    for (let i = 0; i < 30; i++) p.update(1 / 60, arena.asWorld(), targets);
    console.log(
      `      放った矢: 速さ ${arrow?.velocity.length().toFixed(0)}m/s  当たり ${hits.length} 回 ` +
        `${JSON.stringify(hits)}  残り ${p.count} 個`,
    );
    check("放った矢が実際に飛ぶ", (arrow?.velocity.length() ?? 0) > 1);
    check("当たった相手に引きぶんの重みが届く", hits.length === 1 && hits[0][1] === 9, JSON.stringify(hits[0]));
    check("撃った本人（プレイヤー）には当たらない", arrow?.owner === PLAYER_OWNER);
  }

  // --- アイテム ---
  check("弓と矢の名前", itemName(BOW) === "弓" && itemName(ARROW) === "矢", `${BOW} / ${ARROW}`);
  check("弓は表 1 本で見分ける", isBow(BOW) && !isBow(ARROW) && !isBow(0));
  // 弓は道具と同じで積めない。矢は普通に積める（1 本ずつ枠を食うと使い物にならない）。
  check(
    "弓は 1 本、矢は 64 本まで持てる",
    itemStackLimit(BOW) === 1 && itemStackLimit(ARROW) === 64,
    `弓 ${itemStackLimit(BOW)} / 矢 ${itemStackLimit(ARROW)}`,
  );

  // --- 音（満引きの合図は「同じ音を高く」） ---
  // この環境では引く動きを描けないので、**満引きは音でしか分からない。**
  const loose = recipeFor("bow");
  const full = recipeFor("bow", "none", FULL_DRAW_PITCH);
  console.log(`      弓の音: 放つ ${loose.freq}Hz / 満引き ${full.freq.toFixed(0)}Hz（x${FULL_DRAW_PITCH}）`);
  check("満引きの合図は放つ音より高い", full.freq > loose.freq && FULL_DRAW_PITCH > 1);
}
