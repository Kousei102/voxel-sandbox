/**
 * 音を**実際に鳴らして**波形で見るテスト。
 *
 * この環境ではスピーカーが無いので、`OfflineAudioContext`（音声デバイスを使わず、
 * 波形を配列に書き出すだけの `AudioContext`）に鳴らして、出てきた数字を見る。
 * 実装は `node-web-audio-api`（devDependency）。**ブラウザと同じ仕様の実装**なので、
 * `exponentialRampToValueAtTime(0)` のような**仕様違反もちゃんと例外になる**
 * （自前の偽物を書くと、その手の間違いを素通しする）。
 *
 * **`sfx.ts` のテストとは見ているものが違う。** あちらは「どんな数値にするか」
 * （表そのもの）で、こちらは「その数値が本当に音になって出てくるか」。
 * `sfx.ts` が正しくても、`audio.ts` でノードを繋ぎ忘れれば無音になる ——
 * これまでその穴は耳でしか塞げなかった。
 *
 * **ノードをここで組まないこと。** 必ず `AudioEngine` に鳴らさせる
 * （ここで組むと、テストが自分の書いたものに合格するだけになる）。
 */

import type { OfflineAudioContext as OfflineCtor } from "node-web-audio-api";
import { AudioEngine } from "../src/audio";
import { DEFAULT_VOLUME, SFX_EVENTS, recipeFor } from "../src/sfx";
import { seeded } from "./arena";
import { check, describe, skip } from "./harness";

const RATE = 44100;
/** 一番長い音（`death` の 0.9 秒）より十分に長く取る。 */
const WINDOW = 2;
/** これ未満は聞こえないものとして扱う。包絡線の終端（1e-4）より上に置くこと。 */
const AUDIBLE = 1e-3;
/**
 * 1 発ごとに撒き直す種。**同じ呼び方なら同じ波形が出ること**が要る ——
 * 続きの乱数で鳴らすと音程のばらつきが乗って、音量だけを変えた 2 発が
 * 別の音になり、比べても意味がなくなる（実際それで「5 倍のはずが 3.97 倍」と出た）。
 */
const SEED = 20260819;

/**
 * 鳴らす準備。**`engine.resume()` より前に音量と水中を決めること** ——
 * `AudioContext` を作るときにその値でフィルタを組むので、あとから渡すと
 * 立ち上がりの 0.08 秒ぶんだけ違う音を測ることになる。
 */
/**
 * `node-web-audio-api` は**動的に読みます。** 中身はネイティブの `.node` で、
 * 読み込む瞬間に `libasound.so.2`（ALSA）を dlopen します —— 入っていない箱では
 * **例外ではなくプロセスごと落ちる**ので、静的 import のままだと
 * **音とは関係のない 1100 件までまとめて道連れ**になります（実際そうなりました）。
 * Routines は毎周まっさらな箱で走るので、ここは必ず動的のままにしてください。
 */
let Offline: typeof OfflineCtor | null = null;

function bench(seconds = WINDOW) {
  const ctx = new Offline!(1, Math.round(RATE * seconds), RATE);
  const engine = new AudioEngine(() => ctx as unknown as BaseAudioContext);
  return {
    engine,
    async wave(): Promise<Float32Array> {
      const buffer = await ctx.startRendering();
      return buffer.getChannelData(0) as unknown as Float32Array;
    },
  };
}

function peak(d: Float32Array, from = 0, to = d.length): number {
  let max = 0;
  for (let i = Math.max(0, from); i < Math.min(d.length, to); i++) {
    const v = Math.abs(d[i]);
    if (v > max) max = v;
  }
  return max;
}

function rms(d: Float32Array, from = 0, to = d.length): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, from); i < Math.min(d.length, to); i++) {
    sum += d[i] * d[i];
    n++;
  }
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

/**
 * 最後に聞こえた時刻（秒）。**見ているのは包絡線の長さ**で、ノードの `stop()` ではない
 * （`stop()` を忘れても包絡線が 1e-4 まで落ちるので、音としては止まって聞こえる。
 * 実際に `osc.stop()` を外して試したが、ここでは検出できなかった）。
 */
function tail(d: Float32Array): number {
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > AUDIBLE) return i / RATE;
  return 0;
}

/**
 * 明るさ。隣り合うサンプルの差は高い成分ほど大きくなるので、
 * その実効値を全体の実効値で割ると「どれだけ高い音を含むか」の目安になる
 * （こもった音ほど小さい）。**FFT を持ち込まずに `cutoff` の効きを見るため。**
 *
 * **「ノイズらしさ」も一緒に拾うので、`cutoff` だけの比較には使えない。**
 * ガラス（cutoff 6000・ノイズ 0.35）は石（3200・0.75）より数字が小さく出る ——
 * 高いところまで通っていても、中身がトーンなら差分は小さいため。
 * **比べるならノイズの割合が同じ材質どうしにすること。**
 */
function brightness(d: Float32Array): number {
  let diff = 0;
  let n = 0;
  for (let i = 1; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a < AUDIBLE && Math.abs(d[i - 1]) < AUDIBLE) continue;
    diff += (d[i] - d[i - 1]) ** 2;
    n++;
  }
  if (n === 0) return 0;
  return Math.sqrt(diff / n) / (rms(d) || 1);
}

/** 1 発鳴らして波形を返す。 */
async function shot(
  play: (engine: AudioEngine) => void,
  before: (engine: AudioEngine) => void = () => {},
): Promise<Float32Array> {
  // **1 発ごとに撒き直す。** 続きの乱数で鳴らすと、比べたい 2 発が別の音になる。
  Math.random = seeded(SEED);
  const b = bench();
  b.engine.setVolume(DEFAULT_VOLUME);
  before(b.engine);
  b.engine.resume();
  play(b.engine);
  return b.wave();
}

export async function run(): Promise<void> {
  // **乱数を固定する。** `audio.ts` は音程のばらつきとノイズの切り出し位置に
  // `Math.random()` を使うので、そのままだと測るたびに数字が動く。
  // **定数にしないこと** —— ノイズの波形も `Math.random()` で作っているので、
  // 定数にすると白色ノイズが直流（= 無音）になり、全部の音が黙って痩せる。
  try {
    Offline = (await import("node-web-audio-api")).OfflineAudioContext;
  } catch (e) {
    skip(
      "音（波形）",
      `${(e as Error).message ?? e} —— ALSA が無い箱なら sudo apt-get install -y libasound2t64`,
    );
    return;
  }

  const realRandom = Math.random;
  Math.random = seeded(20260819);
  try {
    await body();
  } finally {
    Math.random = realRandom;
  }
}

async function body(): Promise<void> {
  describe("音（実際に鳴らして波形で見る）");

  console.log("      音        ピーク  実効値  鳴り終わり / 長さ  明るさ");
  let silent = 0;
  let overrun = 0;
  // **鳴った本数を数えること。** 例外で飛ばした音は「無音 0 件」に数えられないので、
  // これが無いと全部落ちているのに下の 2 件が ok で出る（数えた母数を必ず出す）。
  let rendered = 0;
  const thrown: string[] = [];
  for (const sfx of SFX_EVENTS) {
    const recipe = recipeFor(sfx, "stone");
    // **1 件ずつ捕まえること。** WebAudio は仕様違反（0 への exponentialRamp、
    // 負のオフセットなど）を例外で返すので、素通しすると 1 件目で全部が止まって
    // 残りの音が 1 つも見られなくなる（harness は落ちても数えるだけの作り）。
    let d: Float32Array;
    try {
      d = await shot((e) => e.play(sfx, "stone"));
    } catch (err) {
      thrown.push(`${sfx}: ${(err as Error).message}`);
      continue;
    }
    rendered++;
    const end = tail(d);
    // 包絡線が落ち切るまでの遅れと、フィルタの余韻ぶんだけ余裕を見る
    const late = end > recipe.duration + 0.05;
    if (peak(d) < AUDIBLE) silent++;
    if (late) overrun++;
    console.log(
      `      ${sfx.padEnd(9)} ${peak(d).toFixed(3).padStart(6)} ${rms(d).toFixed(4).padStart(7)}` +
        `  ${end.toFixed(3)} / ${recipe.duration.toFixed(2)} 秒${late ? " ←" : "  "}` +
        `  ${brightness(d).toFixed(3).padStart(6)}`,
    );
  }
  check(`${SFX_EVENTS.length} 種類すべてが例外を出さずに鳴る`, thrown.length === 0, thrown.join(" / "));
  const all = rendered === SFX_EVENTS.length;
  check("どれも無音でない", all && silent === 0, `${rendered}/${SFX_EVENTS.length} 本を測って 無音 ${silent} 件`);
  check("どれも長さぶんで鳴り止む（余韻が残らない）", all && overrun === 0, `${rendered}/${SFX_EVENTS.length} 本を測って はみ出し ${overrun} 件`);

  // --- 音量 ---
  // **0 で完全に切れること**（`CLAUDE.md`「音」。好みが分かれるので必ず切れる手段を残す）。
  const muted = await shot((e) => e.play("break", "stone"), (e) => e.setVolume(0));
  check("音量 0 では 1 サンプルも鳴らない", peak(muted) === 0, `ピーク ${peak(muted)}`);

  const quietWave = await shot((e) => e.play("break", "stone"), (e) => e.setVolume(0.2));
  const loudWave = await shot((e) => e.play("break", "stone"), (e) => e.setVolume(1));
  const ratio = peak(loudWave) / peak(quietWave);
  console.log(`      音量 0.2 → ${peak(quietWave).toFixed(4)} / 1.0 → ${peak(loudWave).toFixed(4)}（${ratio.toFixed(2)} 倍）`);
  check("音量がそのまま大きさに掛かる（5 倍）", Math.abs(ratio - 5) < 0.3, `${ratio.toFixed(2)} 倍`);

  // --- 水中のこもり ---
  // `main.ts` の `underwater` が渡ってくる先。**ここが繋がっていないと、
  // 水に潜っても音が変わらない**（画面と違って、切れているかどうかが目で分からない）。
  const dry = await shot((e) => e.play("step", "stone"));
  const wet = await shot((e) => e.play("step", "stone"), (e) => e.setUnderwater(true));
  console.log(
    `      明るさ: 地上 ${brightness(dry).toFixed(3)} → 水中 ${brightness(wet).toFixed(3)}` +
      ` / 実効値 ${rms(dry).toFixed(4)} → ${rms(wet).toFixed(4)}`,
  );
  check("水中では高い成分が削られる", brightness(wet) < brightness(dry) * 0.8, `${brightness(wet).toFixed(3)} < ${brightness(dry).toFixed(3)}`);
  check("水中でも無音にはならない", peak(wet) > AUDIBLE, `ピーク ${peak(wet).toFixed(4)}`);

  // --- 材質の柔らかさが波形に出るか ---
  // `sfx.ts` の `cutoff` が**本当に効いているか**。表の数字が正しくても、
  // フィルタを繋ぎ忘れれば全部同じ音で鳴る。
  //
  // **ノイズの割合が同じ 3 つで比べること**（羊毛・雪・砂はどれもノイズ 1）。
  // 石やガラスを混ぜると `cutoff` ではなくノイズの割合を測ることになる
  // （ガラスは cutoff 6000 なのに、トーン寄りなので石より数字が小さい）。
  const onWool = await shot((e) => e.play("step", "wool"));
  const onSnow = await shot((e) => e.play("step", "snow"));
  const onSand = await shot((e) => e.play("step", "sand"));
  console.log(
    `      足音の明るさ（ノイズ 100% の 3 つ）: 羊毛 ${brightness(onWool).toFixed(3)}` +
      ` / 雪 ${brightness(onSnow).toFixed(3)} / 砂 ${brightness(onSand).toFixed(3)}` +
      `（cutoff 480 / 650 / 2600Hz）`,
  );
  check(
    "cutoff が低い材質ほどこもって鳴る（羊毛 < 雪 < 砂）",
    brightness(onWool) < brightness(onSnow) && brightness(onSnow) < brightness(onSand),
  );

  const onStone = await shot((e) => e.play("step", "stone"));

  // 咀嚼は「食べている手ごたえ」を出す唯一の音（この環境では動きを描けない）。
  // `sfx.test.ts` は表の cutoff で見ているので、こちらは出てきた音で見る。
  const chew = await shot((e) => e.play("eat"));
  check("咀嚼は足音よりこもった音で鳴る", brightness(chew) < brightness(onStone), `${brightness(chew).toFixed(3)} < ${brightness(onStone).toFixed(3)}`);

  // --- 声色 ---
  // `mobs.ts` が渡す音程の倍率。**掛け忘れると全部のモブが同じ声で鳴く。**
  const low = await shot((e) => e.play("mobsay", "none", 0.7));
  const high = await shot((e) => e.play("mobsay", "none", 1.4));
  console.log(`      鳴き声の明るさ: 低い声 ${brightness(low).toFixed(3)} / 高い声 ${brightness(high).toFixed(3)}`);
  check("声色（音程の倍率）が波形に出る", brightness(high) > brightness(low), `${brightness(high).toFixed(3)} > ${brightness(low).toFixed(3)}`);

  // --- 鳴らす前 ---
  // `AudioContext` を作れない環境（自動再生制限・古いブラウザ）でも落ちないこと。
  const deaf = new AudioEngine(() => null);
  deaf.setVolume(DEFAULT_VOLUME);
  deaf.resume();
  let threw = false;
  try {
    for (const sfx of SFX_EVENTS) deaf.play(sfx, "stone");
    deaf.setUnderwater(true);
  } catch {
    threw = true;
  }
  check("AudioContext を作れなくても落ちない（音無しで動き続ける）", !threw);
}
