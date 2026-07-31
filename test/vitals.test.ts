import {
  AIR_SECONDS,
  DROWN_DAMAGE,
  MAX_HEALTH,
  REGEN_DELAY,
  REGEN_INTERVAL,
  VOID_Y,
  Vitals,
  fallDamage,
  type VitalsContext,
} from "../src/vitals";
import { heartStates } from "../src/ui";
import { check, describe } from "./harness";

const STEP = 1 / 60;

function ctx(over: Partial<VitalsContext> = {}): VitalsContext {
  return {
    y: 64,
    onGround: true,
    inWater: false,
    headInWater: false,
    flying: false,
    invulnerable: false,
    ...over,
  };
}

/** 高さ from から落として着地させる。 */
function drop(vitals: Vitals, from: number, opts: Partial<VitalsContext> = {}): void {
  vitals.update(STEP, ctx({ y: from, onGround: true, ...opts }));
  for (let y = from; y > 0; y -= 1) {
    vitals.update(STEP, ctx({ y, onGround: false, ...opts }));
  }
  vitals.update(STEP, ctx({ y: 0, onGround: true, ...opts }));
}

/** ある状況で秒数ぶん進める。 */
function advance(vitals: Vitals, seconds: number, over: Partial<VitalsContext> = {}): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) vitals.update(STEP, ctx(over));
}

export function run(): void {
  describe("体力");

  // 落差とダメージの対応をまず表にして出す
  const rows = [1, 3, 4, 5, 10, 20, 23, 40]
    .map((d) => `${d}m→${fallDamage(d)}`)
    .join("  ");
  console.log(`      落差とダメージ: ${rows}`);

  check("3 ブロックまでは無傷", fallDamage(3) === 0 && fallDamage(1) === 0);
  check("4 ブロックで 1 ダメージ", fallDamage(4) === 1);
  check("23 ブロックで即死する", fallDamage(23) >= MAX_HEALTH, `${fallDamage(23)} ダメージ`);

  // --- 落下 ---
  const faller = new Vitals();
  drop(faller, 3);
  check("3 ブロック落ちても減らない", faller.health === MAX_HEALTH, `hp ${faller.health}`);

  const hurt = new Vitals();
  drop(hurt, 10);
  check(
    "10 ブロック落ちると 7 減る",
    hurt.health === MAX_HEALTH - 7,
    `hp ${hurt.health} / 落差 ${hurt.lastFall.toFixed(1)}`,
  );

  const splash = new Vitals();
  drop(splash, 20, { inWater: true });
  check("水に落ちればダメージ無し", splash.health === MAX_HEALTH, `hp ${splash.health}`);

  const flyer = new Vitals();
  drop(flyer, 20, { flying: true });
  check("飛行中は落下ダメージを受けない", flyer.health === MAX_HEALTH, `hp ${flyer.health}`);

  // 上がってから下がる（ジャンプ）
  const jumper = new Vitals();
  jumper.update(STEP, ctx({ y: 64, onGround: true }));
  for (const y of [64.5, 65, 65.4, 65, 64.5]) jumper.update(STEP, ctx({ y, onGround: false }));
  jumper.update(STEP, ctx({ y: 64, onGround: true }));
  check("ジャンプでは減らない", jumper.health === MAX_HEALTH, `落差 ${jumper.lastFall.toFixed(2)}`);

  const deadly = new Vitals();
  drop(deadly, 40);
  check("高すぎる落下で死ぬ", deadly.dead && deadly.cause === "落下", `hp ${deadly.health}`);

  // --- 溺れ ---
  const diver = new Vitals();
  advance(diver, AIR_SECONDS - 1, { headInWater: true });
  check(
    "息が続くうちは減らない",
    diver.health === MAX_HEALTH && diver.airFraction < 0.1,
    `息 ${(diver.airFraction * 100).toFixed(0)}%`,
  );

  advance(diver, 3, { headInWater: true });
  check(
    "息が切れると毎秒ダメージ",
    diver.health <= MAX_HEALTH - DROWN_DAMAGE * 2,
    `hp ${diver.health}（${DROWN_DAMAGE}/秒）`,
  );
  check("死因が溺れになる", diver.cause === "溺れ");

  advance(diver, 0.5, { headInWater: false });
  check("水から出れば息が戻る", diver.airFraction === 1, `息 ${(diver.airFraction * 100).toFixed(0)}%`);

  const drowned = new Vitals();
  advance(drowned, AIR_SECONDS + 12, { headInWater: true });
  check("潜り続ければ溺死する", drowned.dead, `hp ${drowned.health}`);

  // --- 奈落 ---
  const falling = new Vitals();
  advance(falling, 1, { y: VOID_Y - 10, onGround: false });
  check("奈落では減り続ける", falling.health < MAX_HEALTH && !falling.dead, `hp ${falling.health}`);
  advance(falling, 5, { y: VOID_Y - 10, onGround: false });
  check("奈落で死ぬ", falling.dead && falling.cause === "奈落");

  // --- 自然回復 ---
  const healing = new Vitals();
  healing.damage(6, "落下");
  check("ダメージが入る", healing.health === MAX_HEALTH - 6);
  advance(healing, REGEN_DELAY - 1);
  check("被弾直後は回復しない", healing.health === MAX_HEALTH - 6, `hp ${healing.health}`);
  advance(healing, 2 + REGEN_INTERVAL * 3);
  check("しばらくすると少しずつ回復する", healing.health > MAX_HEALTH - 6, `hp ${healing.health}`);
  advance(healing, REGEN_INTERVAL * 20);
  check("放っておけば満タンに戻る", healing.health === MAX_HEALTH, `hp ${healing.health}`);

  // --- 死亡と復活 ---
  const dying = new Vitals();
  dying.damage(MAX_HEALTH, "落下");
  check("体力 0 で死ぬ", dying.dead && dying.health === 0);
  check("死んだあとは追加ダメージを受けない", !dying.damage(5, "溺れ") && dying.health === 0);
  advance(dying, 20);
  check("死んだままでは回復しない", dying.health === 0 && dying.dead);
  dying.respawn();
  check(
    "リスポーンで満タンに戻る",
    !dying.dead && dying.health === MAX_HEALTH && dying.airFraction === 1 && dying.cause === null,
  );

  // --- クリエイティブ ---
  const godmode = new Vitals();
  drop(godmode, 40, { invulnerable: true });
  advance(godmode, AIR_SECONDS + 10, { invulnerable: true, headInWater: true });
  advance(godmode, 5, { invulnerable: true, y: VOID_Y - 20 });
  check(
    "クリエイティブでは何も受けない",
    godmode.health === MAX_HEALTH && !godmode.dead && godmode.airFraction === 1,
    `hp ${godmode.health}`,
  );

  // クリエイティブ中に溜め込んだ落差でサバイバルに戻った瞬間に死なないこと
  const switched = new Vitals();
  switched.update(STEP, ctx({ y: 100, onGround: false, invulnerable: true }));
  switched.update(STEP, ctx({ y: 10, onGround: false, invulnerable: true }));
  switched.update(STEP, ctx({ y: 10, onGround: true }));
  check("モードを戻した直後に落下ダメージが出ない", switched.health === MAX_HEALTH, `hp ${switched.health}`);

  // --- ハートの表示 ---
  // 半分のハートは体力が奇数のときだけ出る。CSS は見た目しか確かめられないので、
  // 「いつ半分になるか」だけはここで固定しておく。
  const shape = (health: number) =>
    heartStates(health)
      .map((s) => (s === "full" ? "■" : s === "half" ? "◧" : "□"))
      .join("");
  for (const health of [MAX_HEALTH, 19, 13, 1, 0]) {
    console.log(`      hp ${String(health).padStart(2)}  ${shape(health)}`);
  }

  check("満タンは 10 個すべて赤", shape(MAX_HEALTH) === "■■■■■■■■■■");
  check("体力 19 は最後の 1 個が半分", shape(19) === "■■■■■■■■■◧", shape(19));
  check("体力 13 は 6 個と半分", shape(13) === "■■■■■■◧□□□", shape(13));
  check("体力 1 は半分ひとつだけ", shape(1) === "◧□□□□□□□□□", shape(1));
  check("体力 0 は 1 個も赤くない", shape(0) === "□□□□□□□□□□");
  check(
    "奇数の体力では必ず半分がひとつ出る",
    [1, 3, 5, 7, 9, 11, 13, 15, 17, 19].every(
      (hp) => heartStates(hp).filter((s) => s === "half").length === 1,
    ),
  );
  check(
    "偶数の体力では半分が出ない",
    [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].every(
      (hp) => heartStates(hp).filter((s) => s === "half").length === 0,
    ),
  );

  // --- 明滅 ---
  const flash = new Vitals();
  flash.damage(2, "落下");
  check("被弾で赤くなる", flash.hurtFlash === 1);
  advance(flash, 1);
  check("赤みは消える", flash.hurtFlash === 0);
}
