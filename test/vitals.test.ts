import {
  AIR_SECONDS,
  DROWN_DAMAGE,
  EXHAUST_ATTACK,
  EXHAUST_LIMIT,
  EXHAUST_MINE,
  EXHAUST_REGEN,
  EXHAUST_SPRINT,
  EXHAUST_WALK,
  MAX_HEALTH,
  MAX_HUNGER,
  MOB_HURT_COOLDOWN,
  POISON_FLOOR,
  POISON_INTERVAL,
  POISON_SECONDS,
  POISON_TICKS,
  REGEN_DELAY,
  REGEN_HUNGER,
  REGEN_INTERVAL,
  SPRINT_HUNGER,
  START_SATURATION,
  STARVE_FLOOR,
  STARVE_INTERVAL,
  VOID_Y,
  Vitals,
  fallDamage,
  type VitalsContext,
} from "../src/vitals";
import { COOKED_PORK, ROTTEN_FLESH, allFoodIds, foodOf, itemName } from "../src/items";
import { heartStates } from "../src/ui";
import { check, describe } from "./harness";

const STEP = 1 / 60;

/** `player.ts` の WALK_SPEED / SPRINT_SPEED。消耗の実感を出すために合わせておく。 */
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.4;

function ctx(over: Partial<VitalsContext> = {}): VitalsContext {
  return {
    y: 64,
    onGround: true,
    inWater: false,
    headInWater: false,
    flying: false,
    invulnerable: false,
    moved: 0,
    sprinting: false,
    ...over,
  };
}

/**
 * 実際に歩かせる。**進んだ距離を返すので、まず「動いた証拠」を出してから見ること**
 * （動いていないのに「減っていない」で通る偽陽性を避ける）。
 */
function travel(vitals: Vitals, seconds: number, sprinting: boolean, over: Partial<VitalsContext> = {}): number {
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  const steps = Math.round(seconds / STEP);
  let distance = 0;
  for (let i = 0; i < steps; i++) {
    const moved = speed * STEP;
    distance += moved;
    vitals.update(STEP, ctx({ moved, sprinting, ...over }));
  }
  return distance;
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

  // --- 自然回復（**空腹が要る**） ---
  // 空腹が入る前は無条件に回復していた（ピースフルの代用）。**その形に戻っていないこと**を
  // 下の「腹が減っていると回復しない」で押さえている。戻すと空腹が飾りになる。
  const healing = new Vitals();
  healing.damage(6, "落下");
  check("ダメージが入る", healing.health === MAX_HEALTH - 6);
  advance(healing, REGEN_DELAY - 1);
  check("被弾直後は回復しない", healing.health === MAX_HEALTH - 6, `hp ${healing.health}`);
  advance(healing, 2 + REGEN_INTERVAL * 3);
  check("しばらくすると少しずつ回復する", healing.health > MAX_HEALTH - 6, `hp ${healing.health}`);
  advance(healing, REGEN_INTERVAL * 20);
  check("満腹なら放っておけば満タンに戻る", healing.health === MAX_HEALTH, `hp ${healing.health}`);
  check(
    "回復したぶん腹が減っている",
    healing.hunger < MAX_HUNGER,
    `空腹 ${healing.hunger}/${MAX_HUNGER}（体力 6 回復に ${(6 * EXHAUST_REGEN) / EXHAUST_LIMIT} 個ぶん）`,
  );

  const starving = new Vitals();
  starving.hunger = REGEN_HUNGER - 1;
  starving.saturation = 0;
  starving.damage(6, "落下");
  advance(starving, REGEN_DELAY + REGEN_INTERVAL * 10);
  check(
    "腹が減っていると回復しない",
    starving.health === MAX_HEALTH - 6,
    `hp ${starving.health} / 空腹 ${starving.hunger}`,
  );
  starving.eat({ hunger: 6, saturation: 6, poison: false });
  advance(starving, REGEN_INTERVAL * 4);
  check("食べれば回復が再開する", starving.health > MAX_HEALTH - 6, `hp ${starving.health}`);

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

  // --- 無敵時間（モブのダメージ） ---
  // **`cooldown` を渡したときだけ効く形にしてあること。** 一律に掛けると
  // 溺れ（1 秒ごと）と奈落（0.5 秒ごと）が黙って半分になる。
  const guarded = new Vitals();
  check("モブのダメージが入る", guarded.damage(2, "モンスター", MOB_HURT_COOLDOWN));
  check(
    "無敵時間のあいだは 2 発目が入らない",
    !guarded.damage(2, "モンスター", MOB_HURT_COOLDOWN) && guarded.health === MAX_HEALTH - 2,
    `hp ${guarded.health}`,
  );
  // ぴったり MOB_HURT_COOLDOWN 秒ぶんだと、1/60 の足し込みの誤差で
  // 窓が 5e-17 秒だけ残る。1 フレームぶん多く進めてから見る。
  advance(guarded, MOB_HURT_COOLDOWN + STEP);
  check(
    "明ければまた入る",
    guarded.damage(2, "モンスター", MOB_HURT_COOLDOWN) && guarded.health === MAX_HEALTH - 4,
    `hp ${guarded.health}`,
  );

  // **既定の経路が変わっていない証明。** cooldown を渡さない呼び出しは
  // 無敵時間を読みも書きもしないので、連続で入る。
  const unguarded = new Vitals();
  const first = unguarded.damage(2, "落下");
  const second = unguarded.damage(2, "落下");
  check(
    "cooldown を渡さなければ連続で入る（落下・溺れ・奈落）",
    first && second && unguarded.health === MAX_HEALTH - 4,
    `hp ${unguarded.health}`,
  );
  // モブに殴られた直後でも、落下ダメージは無敵時間に弾かれない（窓を共有しない）
  const mixed = new Vitals();
  mixed.damage(2, "モンスター", MOB_HURT_COOLDOWN);
  check(
    "モブの無敵時間は落下ダメージを止めない",
    mixed.damage(5, "落下") && mixed.health === MAX_HEALTH - 7,
    `hp ${mixed.health}`,
  );

  const revived = new Vitals();
  revived.damage(2, "モンスター", MOB_HURT_COOLDOWN);
  revived.respawn();
  check("リスポーンで無敵時間が消える", revived.damage(2, "モンスター", MOB_HURT_COOLDOWN));

  // --- 受けたダメージの拾い方 ---
  // **音と死亡画面はこれで拾う。「前後の体力を比べる」書き方にしないこと。**
  // モブのダメージは main.ts の updateVitals より前に入るので、前後を比べる形だと
  // 差分がもう済んでいて拾えない（実際、ゾンビに殺されても死亡画面が出なかった）。
  const notified = new Vitals();
  check("何も無ければ拾うものが無い", notified.takeDamage() === null);
  notified.damage(2, "モンスター", MOB_HURT_COOLDOWN);
  // **ダメージのあとに update() を挟んでも消えないこと**（挟むのが実際の順番）。
  advance(notified, 0.05);
  check("受けたダメージを拾える", notified.takeDamage() === "モンスター");
  check("拾えるのは 1 回だけ（自然回復で鳴り続けない）", notified.takeDamage() === null);
  advance(notified, REGEN_DELAY + REGEN_INTERVAL * 2);
  check("回復では何も拾わない", notified.takeDamage() === null && notified.health > MAX_HEALTH - 2);

  // 死んだフレームで「死んだこと」を拾えること。ここが取れないと死亡画面が出ない。
  const slain = new Vitals();
  slain.damage(MAX_HEALTH, "モンスター", MOB_HURT_COOLDOWN);
  advance(slain, 1);
  check("倒された瞬間を拾える", slain.takeDamage() === "モンスター" && slain.dead, `hp ${slain.health}`);
  check("死んだあとは何度見ても拾わない", slain.takeDamage() === null);
  slain.respawn();
  check("リスポーンで拾い残しも消える", slain.takeDamage() === null);

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

  describe("空腹");

  // まず消耗の表。数値を触ったときに「どれだけ持つか」が一目で分かるようにしておく。
  const perPoint = (rate: number) => EXHAUST_LIMIT / rate;
  const minutes = (rate: number, speed: number) => (MAX_HUNGER * perPoint(rate)) / speed / 60;
  console.log(
    `      1 個減るまで: 歩き ${perPoint(EXHAUST_WALK).toFixed(0)}m / 走り ${perPoint(EXHAUST_SPRINT).toFixed(0)}m` +
      ` / 採掘 ${perPoint(EXHAUST_MINE).toFixed(0)} 個 / 殴る ${perPoint(EXHAUST_ATTACK).toFixed(0)} 回`,
  );
  console.log(`      体力を 1 回復すると ${(EXHAUST_REGEN / EXHAUST_LIMIT).toFixed(1)} 個減る`);
  console.log(
    `      満腹から空まで（満腹度を除く）: 歩き ${minutes(EXHAUST_WALK, WALK_SPEED).toFixed(0)} 分` +
      ` / 走り ${minutes(EXHAUST_SPRINT, SPRINT_SPEED).toFixed(1)} 分`,
  );
  for (const id of allFoodIds()) {
    const food = foodOf(id);
    if (!food) continue;
    console.log(
      `      ${itemName(id).padEnd(5, "　")} 空腹 +${food.hunger}  満腹度 +${food.saturation}${food.poison ? "  毒つき" : ""}`,
    );
  }

  // --- 消耗（**動いた証拠を先に出す**） ---
  const runner = new Vitals();
  const ran = travel(runner, 60, true);
  check(
    "走ると空腹が減る",
    ran > 400 && runner.hunger < MAX_HUNGER,
    `${ran.toFixed(0)}m 走って 空腹 ${runner.hunger}/${MAX_HUNGER}`,
  );

  const walker = new Vitals();
  const walked = travel(walker, 60, false);
  check(
    "同じ時間なら歩きのほうが減らない",
    walked > 200 && walker.hunger > runner.hunger,
    `歩き ${walked.toFixed(0)}m → 空腹 ${walker.hunger} / 走り ${ran.toFixed(0)}m → 空腹 ${runner.hunger}`,
  );

  const stuffed = new Vitals();
  travel(stuffed, 15, true);
  check(
    "消耗は満腹度から先に減る（食べた直後にゲージが減らない）",
    stuffed.hunger === MAX_HUNGER && stuffed.saturation < START_SATURATION,
    `空腹 ${stuffed.hunger} / 満腹度 ${stuffed.saturation}`,
  );

  const swimmer = new Vitals();
  travel(swimmer, 60, true, { inWater: true });
  check(
    "水中では走っても歩きぶんしか減らない",
    swimmer.hunger === MAX_HUNGER,
    `空腹 ${swimmer.hunger} / 満腹度 ${swimmer.saturation}`,
  );

  const flier = new Vitals();
  travel(flier, 60, true, { flying: true, onGround: false });
  check(
    "飛行中は減らない",
    flier.hunger === MAX_HUNGER && flier.saturation === START_SATURATION,
    `空腹 ${flier.hunger} / 満腹度 ${flier.saturation}`,
  );

  // ちょうど 1 個ぶんだと、0.005 を 800 回足した端数（3.999…）が境目に乗って減らない。
  // 実際の遊びでは 1 個の差でしかないので、テスト側を 1 回多くする。
  const digger = new Vitals();
  const digs = Math.round(perPoint(EXHAUST_MINE)) + 1;
  for (let i = 0; i < digs; i++) digger.exhaust("mine");
  advance(digger, STEP);
  check(
    "掘っても減る",
    digger.saturation < START_SATURATION,
    `${digs} 個掘って 満腹度 ${digger.saturation}`,
  );

  const fighter = new Vitals();
  const swings = Math.round(perPoint(EXHAUST_ATTACK)) + 1;
  for (let i = 0; i < swings; i++) fighter.exhaust("attack");
  advance(fighter, STEP);
  check(
    "殴っても減る",
    fighter.saturation < START_SATURATION,
    `${swings} 回殴って 満腹度 ${fighter.saturation}`,
  );

  const godbelly = new Vitals();
  travel(godbelly, 120, true, { invulnerable: true });
  check(
    "クリエイティブでは減らない",
    godbelly.hunger === MAX_HUNGER && godbelly.saturation === START_SATURATION,
    `空腹 ${godbelly.hunger} / 満腹度 ${godbelly.saturation}`,
  );

  // --- 餓死しない ---
  const famished = new Vitals();
  famished.hunger = 0;
  famished.saturation = 0;
  advance(famished, STARVE_INTERVAL * 3 + 0.2);
  check(
    "空腹 0 では減り続ける",
    famished.health === MAX_HEALTH - 3 && famished.cause === "空腹",
    `hp ${famished.health}（${STARVE_INTERVAL} 秒に 1）`,
  );
  advance(famished, STARVE_INTERVAL * 40);
  check(
    "**餓死はしない**（体力 1 で止まる）",
    famished.health === STARVE_FLOOR && !famished.dead,
    `hp ${famished.health}`,
  );
  famished.eat({ hunger: 8, saturation: 8, poison: false });
  advance(famished, STARVE_INTERVAL * 2);
  check("食べれば止まる", famished.health >= STARVE_FLOOR && !famished.dead, `hp ${famished.health}`);

  // --- 食べる ---
  const eater = new Vitals();
  eater.hunger = 4;
  eater.saturation = 0;
  const cooked = foodOf(COOKED_PORK);
  if (!cooked) throw new Error("焼き豚が食べ物の表に無い");
  eater.eat(cooked);
  check("食べると空腹が戻る", eater.hunger === 4 + cooked.hunger, `空腹 ${eater.hunger}`);
  check(
    "満腹度は空腹の値を超えない",
    eater.saturation === eater.hunger,
    `満腹度 ${eater.saturation} / 空腹 ${eater.hunger}（食べ物は +${cooked.saturation}）`,
  );

  const fed = new Vitals();
  check("満腹では食べられない", !fed.canEat && fed.hunger === MAX_HUNGER);
  fed.eat(cooked);
  check("上限は超えない", fed.hunger === MAX_HUNGER, `空腹 ${fed.hunger}`);
  fed.hunger = MAX_HUNGER - 1;
  check("1 でも減っていれば食べられる", fed.canEat);

  // --- 毒（腐った肉） ---
  const rotten = foodOf(ROTTEN_FLESH);
  if (!rotten) throw new Error("腐った肉が食べ物の表に無い");
  check("腐った肉には毒がある", rotten.poison && !cooked.poison);

  const sick = new Vitals();
  sick.hunger = 10;
  sick.saturation = 0;
  sick.eat(rotten);
  check(
    "腐った肉でも空腹は戻る",
    sick.hunger === 10 + rotten.hunger && sick.poisoned,
    `空腹 ${sick.hunger} / 毒 ${sick.poisoned}`,
  );
  advance(sick, POISON_INTERVAL + 0.1);
  check("毒は少しずつ入る", sick.health === MAX_HEALTH - 1, `hp ${sick.health}`);
  advance(sick, POISON_SECONDS);
  check(
    `毒は ${POISON_TICKS} 回で切れる`,
    sick.health === MAX_HEALTH - POISON_TICKS && !sick.poisoned,
    `hp ${sick.health}`,
  );

  const dying2 = new Vitals();
  dying2.damage(MAX_HEALTH - POISON_FLOOR - 1, "モンスター");
  dying2.eat(rotten);
  advance(dying2, POISON_SECONDS + 1);
  check(
    "**毒では死なない**（体力 1 で止まる）",
    dying2.health === POISON_FLOOR && !dying2.dead && !dying2.poisoned,
    `hp ${dying2.health}`,
  );

  // --- 走れなくなる ---
  const legs = new Vitals();
  legs.hunger = SPRINT_HUNGER + 1;
  check("空腹が残っていれば走れる", legs.canSprint, `空腹 ${legs.hunger}`);
  legs.hunger = SPRINT_HUNGER;
  check("減ると走れなくなる", !legs.canSprint, `空腹 ${legs.hunger}`);

  // --- リスポーン ---
  const reborn = new Vitals();
  reborn.hunger = 2;
  reborn.saturation = 0;
  reborn.eat(rotten);
  reborn.damage(MAX_HEALTH, "空腹");
  reborn.respawn();
  check(
    "リスポーンで空腹も毒も戻る",
    reborn.hunger === MAX_HUNGER && reborn.saturation === START_SATURATION && !reborn.poisoned,
    `空腹 ${reborn.hunger} / 満腹度 ${reborn.saturation}`,
  );
}
