import { readFileSync } from "node:fs";
import {
  AIR,
  BLOCKS,
  GLASS,
  GRASS,
  PLANK_SLAB,
  PLANK_STAIRS,
  SAND,
  SNOW,
  STONE,
  STONE_SLAB,
  TALL_GRASS,
  WATER,
  WOOD,
  WOOL,
  blockName,
  blockSound,
} from "../src/blocks";
import {
  DEFAULT_VOLUME,
  DIG_STEP,
  DigCadence,
  STEP_DISTANCE,
  StepCadence,
  clampVolume,
  jitter,
  recipeFor,
  type Sfx,
} from "../src/sfx";
import { check, describe } from "./harness";

const EVENTS: Sfx[] = [
  "step",
  "dig",
  "break",
  "place",
  "land",
  "hurt",
  "death",
  "splash",
  "craft",
  "pickup",
  "mobsay",
  "mobhurt",
  "mobdeath",
];

/**
 * 値域を確かめる声色の幅。**両端で回すこと** ——
 * `recipeFor` は pitch を freq にも cutoff にも掛けるので、
 * 素の値だけ見ていると低い声が可聴域を割ったのに気付けない。
 */
const PITCHES = [0.7, 1, 1.4];

export function run(): void {
  describe("音（何をいつ鳴らすか）");

  // WebAudio はヘッドレスでは動かない。だから「判断」は sfx.ts に閉じ込めてあり、
  // AudioContext に触るのは audio.ts だけ。ここが崩れると、音まわりが丸ごと
  // 「ブラウザを開くまで確かめられないもの」になる。
  // コメントには出てくる（audio.ts との分担の説明）ので、落としてから見る
  const sfxSource = readFileSync("src/sfx.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const webAudio = ["AudioContext", "AudioNode", "createOscillator", "window."].filter((name) =>
    sfxSource.includes(name),
  );
  check("sfx.ts は WebAudio に触らない（ヘッドレスで確かめられる）", webAudio.length === 0, webAudio.join(" "));

  // --- 材質ごとの音 ---
  const groups = new Map<string, string[]>();
  for (const block of BLOCKS) {
    const list = groups.get(block.sound) ?? [];
    if (!list.includes(block.name)) list.push(block.name);
    groups.set(block.sound, list);
  }
  for (const [group, names] of [...groups].sort()) {
    console.log(`      ${group.padEnd(6)} ${names.length} 種: ${names.slice(0, 6).join(" ")}`);
  }
  check(
    "柔らかいものが石の音になっていない",
    blockSound(GRASS) === "grass" &&
      blockSound(SAND) === "sand" &&
      blockSound(WOOD) === "wood" &&
      blockSound(SNOW) === "snow" &&
      blockSound(GLASS) === "glass" &&
      blockSound(TALL_GRASS) === "grass",
    `${blockName(GRASS)}=${blockSound(GRASS)} / ${blockName(SAND)}=${blockSound(SAND)}`,
  );
  check(
    "ハーフと階段は元の材質の音を継ぐ",
    blockSound(STONE_SLAB) === blockSound(STONE) && blockSound(PLANK_STAIRS) === blockSound(PLANK_SLAB),
    `石ハーフ=${blockSound(STONE_SLAB)} / 板の階段=${blockSound(PLANK_STAIRS)}`,
  );
  check("空気と水は音を持たない", blockSound(AIR) === "none" && blockSound(WATER) === "none");
  // 羊毛は既定の "stone" のままだと「羊毛が石の音」で静かに間違える
  check(
    "羊毛は布の音（いちばん柔らかい）",
    blockSound(WOOL) === "wool" && recipeFor("step", "wool").cutoff < recipeFor("step", "snow").cutoff,
    `${blockSound(WOOL)} / ${recipeFor("step", "wool").cutoff}Hz < 雪 ${recipeFor("step", "snow").cutoff}Hz`,
  );

  // 材質で音が変わること。全部同じ数値になっていたら、材質を見ていない。
  const stepCutoffs = new Set(
    [GRASS, SAND, STONE, WOOD, SNOW, GLASS].map((id) => recipeFor("step", blockSound(id)).cutoff),
  );
  check("材質ごとに足音が違う", stepCutoffs.size === 6, `${[...stepCutoffs].join(" / ")} Hz`);
  check(
    "柔らかいほどこもる（草 < 石 < ガラス）",
    recipeFor("step", "grass").cutoff < recipeFor("step", "stone").cutoff &&
      recipeFor("step", "stone").cutoff < recipeFor("step", "glass").cutoff,
  );
  check(
    "壊す音は足音より大きく長い",
    recipeFor("break", "stone").gain > recipeFor("step", "stone").gain &&
      recipeFor("break", "stone").duration > recipeFor("step", "stone").duration,
    `破壊 ${recipeFor("break", "stone").gain} / 足音 ${recipeFor("step", "stone").gain}`,
  );

  // --- 数値の健全性 ---
  // 耳で確かめられないので、明らかにおかしい値（無音・爆音・鳴り止まない）を弾く。
  const bad: string[] = [];
  for (const event of EVENTS) {
    for (const group of ["grass", "stone", "wool", "none"] as const) {
      for (const pitch of PITCHES) {
        const r = recipeFor(event, group, pitch);
        const at = `${event}/${group}@${pitch}`;
        if (!(r.gain > 0 && r.gain <= 1)) bad.push(`${at} gain ${r.gain}`);
        if (!(r.duration > 0 && r.duration <= 1)) bad.push(`${at} duration ${r.duration}`);
        // 可聴域を大きく外れると、音が出ないか耳障りな超高音になる
        if (!(r.freq >= 20 && r.freq * Math.max(1, r.sweep) <= 12000)) bad.push(`${at} freq ${r.freq}`);
        if (!(r.cutoff >= 100 && r.cutoff <= 20000)) bad.push(`${at} cutoff ${r.cutoff}`);
        if (!(r.noise >= 0 && r.noise <= 1)) bad.push(`${at} noise ${r.noise}`);
        if (!(r.spread >= 0 && r.spread < 0.5)) bad.push(`${at} spread ${r.spread}`);
      }
    }
  }
  check(
    `${EVENTS.length} 種類の音の数値が ${PITCHES.length} 通りの声色すべてで妥当`,
    bad.length === 0,
    bad.join(" / "),
  );
  check(
    "声色は音程をそのまま動かす",
    Math.abs(recipeFor("mobsay", "none", 2).freq - recipeFor("mobsay").freq * 2) < 1e-9 &&
      recipeFor("mobsay", "none", 0.7).cutoff < recipeFor("mobsay").cutoff,
    `x1 ${recipeFor("mobsay").freq}Hz / x2 ${recipeFor("mobsay", "none", 2).freq}Hz`,
  );
  check("知らない材質を渡しても落ちない", recipeFor("step", "none").gain > 0);

  // 音程のばらつき。同じ音が続いても機械的に聞こえないように散らす。
  check(
    "ばらつきは ±spread に収まる",
    Math.abs(jitter(100, 0.1, 0) - 90) < 1e-9 &&
      Math.abs(jitter(100, 0.1, 1) - 110) < 1e-9 &&
      Math.abs(jitter(100, 0.1, 0.5) - 100) < 1e-9,
    `${jitter(100, 0.1, 0).toFixed(1)} 〜 ${jitter(100, 0.1, 1).toFixed(1)}`,
  );
  check("ばらつき 0 なら常に同じ高さ", jitter(440, 0, 0) === 440 && jitter(440, 0, 1) === 440);

  describe("足音の間隔");

  // 時間ではなく歩いた距離で刻む。だからスプリントすれば自然に足音も速くなる。
  const ground = { onGround: true, inWater: false, flying: false };
  const cadence = new StepCadence();
  let steps = 0;
  // 歩き（5.2 m/s）で 10 秒ぶん
  for (let i = 0; i < 600; i++) if (cadence.advance((5.2 * 1) / 60, ground)) steps++;
  const expected = (5.2 * 10) / STEP_DISTANCE;
  check(
    "歩いた距離ぶんだけ足音が鳴る",
    Math.abs(steps - expected) <= 1,
    `10 秒で ${steps} 歩（想定 ${expected.toFixed(1)}）`,
  );

  const sprint = new StepCadence();
  let sprintSteps = 0;
  for (let i = 0; i < 600; i++) if (sprint.advance((8.4 * 1) / 60, ground)) sprintSteps++;
  check(
    "スプリントすると足音も速くなる",
    sprintSteps > steps * 1.4,
    `歩き ${steps} 歩 / 走り ${sprintSteps} 歩`,
  );

  const air = new StepCadence();
  let airSteps = 0;
  for (let i = 0; i < 600; i++) {
    if (air.advance(0.1, { onGround: false, inWater: false, flying: false })) airSteps++;
  }
  check("空中では鳴らない", airSteps === 0, `${airSteps} 歩`);

  // 空中で溜めてしまうと、着地した瞬間に 1 歩ぶん鳴る（足音が着地音と重なる）
  const landing = new StepCadence();
  for (let i = 0; i < 100; i++) landing.advance(0.1, { onGround: false, inWater: false, flying: false });
  check("空中の移動を溜め込まない", !landing.advance(0.1, ground));

  const water = new StepCadence();
  let waterSteps = 0;
  for (let i = 0; i < 600; i++) {
    if (water.advance(0.1, { onGround: true, inWater: true, flying: false })) waterSteps++;
  }
  check("水中では鳴らない", waterSteps === 0, `${waterSteps} 歩`);

  const flight = new StepCadence();
  let flySteps = 0;
  for (let i = 0; i < 600; i++) {
    if (flight.advance(0.2, { onGround: true, inWater: false, flying: true })) flySteps++;
  }
  check("飛行中は鳴らない", flySteps === 0, `${flySteps} 歩`);

  // その場で足踏み（壁に押し付けている）ときは距離が進まないので鳴らない
  const stuck = new StepCadence();
  let stuckSteps = 0;
  for (let i = 0; i < 600; i++) if (stuck.advance(0, ground)) stuckSteps++;
  check("動いていなければ鳴らない", stuckSteps === 0, `${stuckSteps} 歩`);

  // ワープ（リスポーン）で距離が跳ねても、まとめて連発しない
  const teleport = new StepCadence();
  let burst = 0;
  if (teleport.advance(500, ground)) burst++;
  if (teleport.advance(0, ground)) burst++;
  check("ワープしても 1 回しか鳴らない", burst === 1, `${burst} 回`);

  describe("掘っている間のコツコツ音");

  const dig = new DigCadence();
  check("掘り始めはすぐ 1 回鳴る", dig.advance(0));
  let ticks = 0;
  // 1 ブロック掘り切るまで（進み具合 0..1）
  for (let i = 0; i < 100; i++) if (dig.advance(0.01)) ticks++;
  check(
    "1 ブロック掘るあいだに数回鳴る",
    ticks >= 3 && ticks <= 6,
    `${ticks} 回（間隔 ${DIG_STEP}）`,
  );

  const restart = new DigCadence();
  restart.advance(0);
  restart.advance(0.1);
  restart.reset();
  check("狙いを変えたら次の 1 回はすぐ鳴る", restart.advance(0));

  describe("音量");

  check("既定は無音ではない", DEFAULT_VOLUME > 0 && DEFAULT_VOLUME <= 1, `${DEFAULT_VOLUME}`);
  check("0..1 に丸める", clampVolume(-1) === 0 && clampVolume(5) === 1 && clampVolume(0.3) === 0.3);
  check(
    "壊れた値は既定に戻す",
    clampVolume(undefined) === DEFAULT_VOLUME &&
      clampVolume(NaN) === DEFAULT_VOLUME &&
      clampVolume("0.5") === DEFAULT_VOLUME,
  );
  check("0 にできる（音を完全に切れる）", clampVolume(0) === 0);
}
