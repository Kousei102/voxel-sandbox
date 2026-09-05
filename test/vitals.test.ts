import {
  AIR_SECONDS,
  BURN_DAMAGE,
  BURN_SECONDS,
  DROWN_DAMAGE,
  EAT_SECONDS,
  Eating,
  EXHAUST_ATTACK,
  EXHAUST_LIMIT,
  EXHAUST_MINE,
  EXHAUST_REGEN,
  EXHAUST_SPRINT,
  EXHAUST_WALK,
  LAVA_DAMAGE,
  LAVA_INTERVAL,
  MAX_HEALTH,
  deathMessage,
  MAX_HUNGER,
  MOB_HURT_COOLDOWN,
  POISON_FLOOR,
  POISON_INTERVAL,
  POISON_SECONDS,
  POISON_TICKS,
  REGEN_DELAY,
  REGEN_HUNGER,
  REGEN_INTERVAL,
  SPIKE_DAMAGE,
  SPIKE_INTERVAL,
  SPRINT_HUNGER,
  START_SATURATION,
  STARVE_FLOOR,
  STARVE_INTERVAL,
  VOID_Y,
  Vitals,
  fallDamage,
  type VitalsContext,
} from "../src/vitals";
import {
  BREAD,
  COOKED_CHICKEN,
  COOKED_PORK,
  RAW_CHICKEN,
  ROTTEN_FLESH,
  WHEAT,
  allFoodIds,
  foodOf,
  itemName,
} from "../src/items";
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
    inLiquid: false,
    inLava: false,
    touchingSpikes: false,
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
  drop(splash, 20, { inLiquid: true });
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


  describe("溶岩と炎上");

  // 溶岩は**触れた瞬間に 1 回**入って、そのあと LAVA_INTERVAL ごと。
  // 待ってから入る形にすると、浅い溶岩をぴょんと跨いだときに無傷で通れる。
  const dipped = new Vitals();
  dipped.update(STEP, ctx({ inLiquid: true, inLava: true }));
  check(
    "溶岩に触れた最初のフレームで 1 回入る",
    dipped.health === MAX_HEALTH - LAVA_DAMAGE,
    `hp ${dipped.health}（-${LAVA_DAMAGE}）`,
  );

  const soaked = new Vitals();
  advance(soaked, 1, { inLiquid: true, inLava: true });
  const lavaHits = (MAX_HEALTH - soaked.health) / LAVA_DAMAGE;
  console.log(
    `      溶岩に 1 秒: ${MAX_HEALTH - soaked.health} 減る（${LAVA_DAMAGE} x ${lavaHits} 回` +
      ` / 間隔 ${LAVA_INTERVAL} 秒）`,
  );
  // **回数をぴったりで見ないこと。** 間隔 0.5 秒を 1/60 で刻むので、ちょうど境目の
  // 1 回が浮動小数の誤差でどちらにも転ぶ（実測 2 回）。速さは下の「死ぬまで」で見る。
  check("溶岩は 1 秒に 2 回以上入る", lavaHits >= 2, `${lavaHits} 回 = ${lavaHits * LAVA_DAMAGE} ダメージ`);
  check("溶岩に浸かると燃える", soaked.burning, `残り ${BURN_SECONDS} 秒`);
  check("死因は「溶岩」", soaked.cause === "溶岩", `${soaked.cause}`);

  // 素の体力で溶岩に落ちたら何秒もつか。**防具がまだ無いので、ここは短い。**
  const sunk = new Vitals();
  let lavaLife = 0;
  while (!sunk.dead && lavaLife < 10) {
    sunk.update(STEP, ctx({ inLiquid: true, inLava: true }));
    lavaLife += STEP;
  }
  console.log(`      溶岩に落ちてから死ぬまで: ${lavaLife.toFixed(2)} 秒（体力 ${MAX_HEALTH}・防具なし）`);
  check("溶岩に浸かり続ければ死ぬ", sunk.dead && lavaLife < 3, `${lavaLife.toFixed(2)} 秒`);

  // --- 出たあとの炎上 ---
  // 1 フレームだけ触って上がる。**溶岩ぶんと炎上ぶんが二重に入らないこと。**
  const scorched = new Vitals();
  scorched.update(STEP, ctx({ inLiquid: true, inLava: true }));
  const afterLava = scorched.health;
  advance(scorched, BURN_SECONDS + 3);
  const burned = afterLava - scorched.health;
  console.log(
    `      溶岩を 1 フレームかすっただけ: 溶岩 ${MAX_HEALTH - afterLava} + 炎上 ${burned}` +
      ` = 合計 ${MAX_HEALTH - scorched.health}（体力 ${MAX_HEALTH}）`,
  );
  check(
    `炎上は ${BURN_SECONDS} 秒ぶん入る（1 秒に ${BURN_DAMAGE}）`,
    burned === BURN_SECONDS * BURN_DAMAGE,
    `${burned}`,
  );
  check("燃え尽きたら止まる", !scorched.burning && !scorched.dead, `hp ${scorched.health}`);
  check("死因は「炎上」", scorched.cause === "炎上", `${scorched.cause}`);

  // 浸かっているあいだは炎上ぶんを足さない（足すと理由の分からない速さで死ぬ）
  const dunked = new Vitals();
  advance(dunked, 2, { inLiquid: true, inLava: true });
  check(
    "溶岩の中では炎上ぶんを二重に入れない",
    (MAX_HEALTH - Math.max(0, dunked.health)) % LAVA_DAMAGE === 0,
    `減った量 ${MAX_HEALTH - dunked.health}`,
  );

  // --- 水で消える ---
  const doused = new Vitals();
  doused.update(STEP, ctx({ inLiquid: true, inLava: true }));
  advance(doused, 2);
  const beforeWater = doused.health;
  check("溶岩から出ても燃えている", doused.burning, `hp ${beforeWater}`);
  advance(doused, 0.5, { inLiquid: true, inLava: false });
  check("水に入ると火が消える", !doused.burning);
  advance(doused, BURN_SECONDS);
  // **`===` で見ないこと** —— 火が消えれば 5 秒後から自然回復が始まるので、増える側に動く
  check("消えたあとは減らない", doused.health >= beforeWater, `hp ${beforeWater} → ${doused.health}`);

  // --- 落下と、クリエイティブ ---
  const lavaFall = new Vitals();
  drop(lavaFall, 20, { inLiquid: true, inLava: false });
  check("液体に落ちれば落下ダメージは無い（水も溶岩も）", lavaFall.health === MAX_HEALTH, `hp ${lavaFall.health}`);

  const ghost = new Vitals();
  advance(ghost, 3, { inLiquid: true, inLava: true, invulnerable: true });
  check("クリエイティブでは溶岩で焼けない", ghost.health === MAX_HEALTH && !ghost.burning, `hp ${ghost.health}`);
  // **戻したときに燃え残りを持ち越さないこと**（切り替えた瞬間に減り始める）
  advance(ghost, 3);
  check("クリエイティブを抜けても燃え残らない", ghost.health === MAX_HEALTH, `hp ${ghost.health}`);

  describe("サボテン");

  // 溶岩とまったく同じ形。**触れた瞬間に 1 回**入って、そのあと SPIKE_INTERVAL ごと。
  // 待ってから入る形にすると、浅いサボテンをかすめて無傷で通れる。
  const scratched = new Vitals();
  scratched.update(STEP, ctx({ touchingSpikes: true }));
  console.log(
    `      サボテンに触れた 1 フレーム目: hp ${MAX_HEALTH} → ${scratched.health}` +
      `（間隔 ${SPIKE_INTERVAL} 秒・1 回 ${SPIKE_DAMAGE}）死因 ${scratched.cause}`,
  );
  check(
    "サボテンに触れた最初のフレームで 1 回入る",
    scratched.health === MAX_HEALTH - SPIKE_DAMAGE,
    `hp ${scratched.health}（-${SPIKE_DAMAGE}）`,
  );
  check("死因は「サボテン」", scratched.cause === "サボテン", `${scratched.cause}`);

  const pressed = new Vitals();
  advance(pressed, 1, { touchingSpikes: true });
  const spikeHits = (MAX_HEALTH - pressed.health) / SPIKE_DAMAGE;
  console.log(`      サボテンに 1 秒: ${MAX_HEALTH - pressed.health} 減る（${spikeHits} 回）`);
  // **回数をぴったりで見ないこと**（溶岩の件と同じ。0.5 秒を 1/60 で刻むので
  // ちょうど境目の 1 回が浮動小数の誤差でどちらにも転ぶ）
  check("サボテンは 1 秒に 2 回以上入る", spikeHits >= 2, `${spikeHits} 回`);

  // 離れれば止まる。**炎上のような「出たあとも続く」ぶんは無い。**
  const stepped = new Vitals();
  advance(stepped, 1, { touchingSpikes: true });
  const afterSpike = stepped.health;
  advance(stepped, 3);
  check(
    "離れれば止まる（燃え残らない）",
    stepped.health >= afterSpike,
    `hp ${afterSpike} → ${stepped.health}（自然回復で増える側に動く）`,
  );

  // **下限を作っていない** —— 毒（`POISON_FLOOR`）と違って、サボテンでは死ぬ（本家と同じ）
  const impaled = new Vitals();
  let spikeLife = 0;
  while (!impaled.dead && spikeLife < 30) {
    impaled.update(STEP, ctx({ touchingSpikes: true }));
    spikeLife += STEP;
  }
  console.log(`      サボテンに押し付けられ続けて死ぬまで: ${spikeLife.toFixed(2)} 秒`);
  check(
    "サボテンに押し付けられ続ければ死ぬ",
    impaled.dead && impaled.cause === "サボテン",
    `${spikeLife.toFixed(2)} 秒 / 死因 ${impaled.cause}`,
  );

  const shielded = new Vitals();
  advance(shielded, 3, { touchingSpikes: true, invulnerable: true });
  check("クリエイティブでは刺さらない", shielded.health === MAX_HEALTH, `hp ${shielded.health}`);
  // **戻したときに時計を持ち越さないこと**（切り替えた瞬間に 1 発入る）
  advance(shielded, 3);
  check("クリエイティブを抜けても刺さり残らない", shielded.health === MAX_HEALTH, `hp ${shielded.health}`);

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
  travel(swimmer, 60, true, { inLiquid: true });
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

  // --- パン（かまど無しで作れる中では一番強い。**焼き豚には届かない**） ---
  const loaf = foodOf(BREAD);
  if (!loaf) throw new Error("パンが食べ物の表に無い");
  const baker = new Vitals();
  baker.hunger = 8;
  baker.saturation = 0;
  console.log(
    `      パンを食べる前: 空腹 ${baker.hunger} / 満腹度 ${baker.saturation}` +
      `（パンは 空腹 +${loaf.hunger} / 満腹度 +${loaf.saturation} / 毒 ${loaf.poison}）`,
  );
  baker.eat(loaf);
  console.log(`      食べた後: 空腹 ${baker.hunger} / 満腹度 ${baker.saturation}`);
  check("パンは空腹 +5", loaf.hunger === 5 && baker.hunger === 13, `空腹 ${baker.hunger}`);
  check("パンは満腹度 +6", loaf.saturation === 6 && baker.saturation === 6, `満腹度 ${baker.saturation}`);
  check("パンに毒はない", !loaf.poison);
  // **焼く見返りは残してある** —— 焼き豚（8 / 12.8）のほうが強い。
  check(
    "パンは焼き豚より弱い",
    loaf.hunger < cooked.hunger && loaf.saturation < cooked.saturation,
    `パン ${loaf.hunger}/${loaf.saturation} vs 焼き豚 ${cooked.hunger}/${cooked.saturation}`,
  );
  // **小麦そのものは今までどおり食べられない**（本家と同じで、パンにしてから食べる）。
  check("小麦は食べられないまま", foodOf(WHEAT) === null, `${foodOf(WHEAT)}`);

  // --- 鶏の肉（生 2 / 1.2 → 焼き 6 / 7.2。**焼く見返りがいちばん大きい肉**） ---
  const rawBird = foodOf(RAW_CHICKEN);
  const roastBird = foodOf(COOKED_CHICKEN);
  if (!rawBird || !roastBird) throw new Error("鶏の肉が食べ物の表に無い");
  for (const [name, food] of [["生鶏肉", rawBird], ["焼き鳥", roastBird]] as const) {
    const eater2 = new Vitals();
    eater2.hunger = 8;
    eater2.saturation = 0;
    console.log(
      `      ${name}を食べる前: 空腹 ${eater2.hunger} / 満腹度 ${eater2.saturation}` +
        `（空腹 +${food.hunger} / 満腹度 +${food.saturation} / 毒 ${food.poison}）`,
    );
    eater2.eat(food);
    console.log(`      食べた後: 空腹 ${eater2.hunger} / 満腹度 ${eater2.saturation}`);
    check(
      `${name}を食べると空腹が +${food.hunger}`,
      eater2.hunger === 8 + food.hunger,
      `空腹 ${eater2.hunger}`,
    );
    // **満腹度は空腹の値を超えない**（`Vitals.eat()` が捨てる）ので、
    // 焼き鳥（+7.2）は空腹 14 で頭打ちにならない 7.2 がそのまま乗る。
    check(
      `${name}の満腹度は表どおり`,
      eater2.saturation === Math.min(food.saturation, eater2.hunger),
      `満腹度 ${eater2.saturation} / 表 +${food.saturation}`,
    );
  }
  check("生鶏肉は 2 / 1.2", rawBird.hunger === 2 && rawBird.saturation === 1.2);
  check("焼き鳥は 6 / 7.2", roastBird.hunger === 6 && roastBird.saturation === 7.2);
  // **本家は生鶏肉が 30% で食中毒だが、`FoodDef` に確率が無いので毒なしにしてある**
  // （`TUNING.md`）。腐った肉の「必ず毒」と一緒にしないこと。
  check("鶏の肉はどちらも毒つきでない", !rawBird.poison && !roastBird.poison);
  // 焼く見返りは残す（生 → 焼きで空腹も満腹度も増える）。
  check(
    "焼くと強くなる",
    roastBird.hunger > rawBird.hunger && roastBird.saturation > rawBird.saturation,
    `生 ${rawBird.hunger}/${rawBird.saturation} → 焼き ${roastBird.hunger}/${roastBird.saturation}`,
  );
  // **焼き豚がいちばん強い立場は動いていない**（パン 5/6 < 焼き鳥 6/7.2 < 焼き豚 8/12.8）。
  check(
    "焼き鳥はパンより上・焼き豚より下",
    roastBird.hunger > loaf.hunger && roastBird.hunger < cooked.hunger &&
      roastBird.saturation > loaf.saturation && roastBird.saturation < cooked.saturation,
    `パン ${loaf.hunger}/${loaf.saturation} < 焼き鳥 ${roastBird.hunger}/${roastBird.saturation}` +
      ` < 焼き豚 ${cooked.hunger}/${cooked.saturation}`,
  );

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

  // --- ミルクを飲む（毒だけが消える。空腹にも満腹度にも効かない） ---
  {
    const cured = new Vitals();
    cured.hunger = 10;
    cured.saturation = 0;
    cured.eat(rotten);
    // 毒が 1 回ぶん入ったところで飲む（残り回数だけでなく端数も消えること）。
    advance(cured, POISON_INTERVAL + 0.1);
    const before = {
      health: cured.health,
      hunger: cured.hunger,
      saturation: cured.saturation,
      poisoned: cured.poisoned,
    };
    const worked = cured.drinkMilk();
    const after = {
      health: cured.health,
      hunger: cured.hunger,
      saturation: cured.saturation,
      poisoned: cured.poisoned,
    };
    console.log(
      `      飲む前 hp ${before.health} 空腹 ${before.hunger} 満腹度 ${before.saturation} 毒 ${before.poisoned}` +
        ` → 飲んだ後 hp ${after.health} 空腹 ${after.hunger} 満腹度 ${after.saturation} 毒 ${after.poisoned}` +
        `（戻り値 ${worked}）`,
    );
    check("毒のあいだに飲むと毒が消える", worked && before.poisoned && !after.poisoned);
    // **`eat()` も `heal()` も呼ばないこと** —— 本家のミルクは腹にも体力にも効かない。
    check(
      "空腹も満腹度も体力も動かない",
      after.hunger === before.hunger &&
        after.saturation === before.saturation &&
        after.health === before.health,
      `空腹 ${before.hunger}→${after.hunger} / 満腹度 ${before.saturation}→${after.saturation} / hp ${before.health}→${after.health}`,
    );
    // 消したあとは、待っても 2 回目が入らない（端数が残っていると 1 回だけ入る）。
    advance(cured, POISON_SECONDS + 1);
    check("消したあとは毒が入らない", cured.health === after.health, `hp ${cured.health}`);

    // 毒でないときは何も起きない（戻り値が偽なので、`main.ts` の文言も分かれる）。
    const healthy = new Vitals();
    healthy.hunger = 10;
    healthy.saturation = 3;
    const empty = healthy.drinkMilk();
    console.log(
      `      毒でないとき: 戻り値 ${empty} / hp ${healthy.health} 空腹 ${healthy.hunger} 満腹度 ${healthy.saturation}`,
    );
    check(
      "毒でないときは戻り値が偽（腹も体力も動かない）",
      !empty && healthy.hunger === 10 && healthy.saturation === 3 && healthy.health === MAX_HEALTH,
      `${empty} / 空腹 ${healthy.hunger} / 満腹度 ${healthy.saturation} / hp ${healthy.health}`,
    );
  }

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

  describe("食べる操作（Eating）");

  {
    const bread = { hunger: 5, saturation: 6, poison: false };
    const HELD = 81;
    const OTHER = 82;
    const full = (over: Partial<{ playing: boolean; held: number; canEat: boolean; isFood: boolean }> = {}) => ({
      playing: true,
      held: HELD,
      canEat: true,
      isFood: true,
      ...over,
    });
    /**
     * 押しっぱなしのまま n 秒進める。返るのは**「その間に起きた一番強い結果」**
     * （最後のフレームだけ見ると、食べ切ったあとの "none" に隠れる）。
     */
    const hold = (e: Eating, seconds: number, ctx = full()) => {
      let strongest = "none";
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        const step = e.advance(1 / 60, ctx);
        if (step === "done") strongest = "done";
        else if (step === "chew" && strongest === "none") strongest = "chew";
      }
      return strongest;
    };

    const eat = new Eating();
    check("何もしていなければ進まない", eat.advance(1, full()) === "none" && !eat.active);

    eat.begin(HELD);
    check("食べ始めたら active", eat.active);
    check("始めた瞬間には終わらない", eat.advance(0, full()) === "none");
    check(`${EAT_SECONDS} 秒の手前ではまだ終わらない`, hold(eat, EAT_SECONDS * 0.9) !== "done");
    check("食べ切ると done", hold(eat, EAT_SECONDS * 0.2) === "done");
    // **食べ切ったら必ず止める**（押しっぱなしでも 1 回ぶんずつ）。
    check("食べ切ったら止まる", !eat.active);
    check("押しっぱなしでも 2 個目は勝手に食べない", hold(eat, EAT_SECONDS * 2) === "none");

    // 咀嚼音。**この環境では食べる動きを描けないので、進んでいる手ごたえはこれだけ。**
    const chewing = new Eating();
    chewing.begin(HELD);
    let bites = 0;
    for (let i = 0; i < Math.round(EAT_SECONDS * 60); i++) {
      if (chewing.advance(1 / 60, full()) === "chew") bites++;
    }
    check("食べているあいだ何口か噛む", bites >= 2, `${bites} 口`);

    // 中断する条件。**どれも「食べかけは消費しない」**（`begin()` からやり直し）。
    for (const [label, ctx] of [
      ["手が変わったら中断", full({ held: OTHER })],
      ["画面が変わったら中断", full({ playing: false })],
      ["満腹になったら中断", full({ canEat: false })],
      ["食べ物でなくなったら中断", full({ isFood: false })],
    ] as const) {
      const e = new Eating();
      e.begin(HELD);
      hold(e, EAT_SECONDS * 0.5);
      check(label, e.advance(1 / 60, ctx) === "none" && !e.active);
    }

    const stopped = new Eating();
    stopped.begin(HELD);
    hold(stopped, EAT_SECONDS * 0.9);
    stopped.stop();
    stopped.begin(HELD);
    check("やめたら進み具合も戻る", hold(stopped, EAT_SECONDS * 0.5) !== "done");

    // 食べ切ったあとに何が戻るかは `Vitals.eat()`（ここは進み具合だけ）。
    const belly = new Vitals();
    belly.hunger = 10;
    belly.saturation = 0;
    belly.eat(bread);
    check("食べた結果は Vitals が持つ", belly.hunger === 15, `${belly.hunger}`);
  }

  describe("死亡画面の 1 行（deathMessage）");

  check("死因が出る", deathMessage("溶岩", 0) === "死因: 溶岩", deathMessage("溶岩", 0));
  // 死んだ場所が遠いと取りに戻れないので、山の数と猶予を必ず出す。
  check("落とした山の数と猶予も出る", deathMessage("モンスター", 3).includes("3 山") && deathMessage("モンスター", 3).includes("5 分"), deathMessage("モンスター", 3));
  check("何も落としていなければ触れない", !deathMessage("落下", 0).includes("山"), deathMessage("落下", 0));
  check("死因が分からなくても落ちない", deathMessage(null, 2).startsWith("　持ち物"), deathMessage(null, 2));
}
