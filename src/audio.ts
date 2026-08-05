import type { SoundGroup } from "./blocks";
import { clampVolume, jitter, recipeFor, type Sfx, type SoundRecipe } from "./sfx";

/**
 * 音を出すところ。**`AudioContext` に触るのはこのファイルだけ。**
 *
 * 何をいつ鳴らすかは `sfx.ts` が数値で決めていて、ここはそれをノードに貼るだけ。
 * この環境（ヘッドレス）では音を鳴らして確かめられないので、`terrainshader.ts` の
 * GLSL と同じ扱いにしてある: **判断をこちらへ持ち込まないこと。**
 * 持ち込んだ時点で、耳で聞かないと確かめられない部分が増える。
 *
 * 音は 1 発ごとに「ノイズ + トーン → ローパス → 包絡線 → マスター」の短い経路を作って捨てる。
 * 使い回すのはノイズの波形（1 秒ぶん）だけで、これは実行時に乱数で作る
 * （外部アセットを使わない規約。`crack.ts` がテクスチャで同じことをしている）。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** 水中でこもらせるためのフィルタ。地上では素通し。 */
  private muffle: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = clampVolume(undefined);
  private underwater = false;

  /**
   * 最初のユーザー操作で呼ぶ。ブラウザの自動再生制限があるので、
   * **クリックより前に `AudioContext` を作っても音は出ない。**
   */
  resume(): void {
    if (!this.ctx) this.create();
    void this.ctx?.resume();
  }

  private create(): void {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const muffle = ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = this.underwater ? UNDERWATER_CUTOFF : OPEN_CUTOFF;
    muffle.connect(master);
    master.connect(ctx.destination);

    // 1 秒ぶんの白色ノイズ。全部の音がここから切り出して使う。
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.muffle = muffle;
    this.noiseBuffer = buffer;
  }

  /** マスター音量 0..1。0 で無音。 */
  setVolume(value: number): void {
    this.volume = clampVolume(value);
    if (this.master) this.master.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  /** 頭が水中にあるあいだ、全体をこもらせる。 */
  setUnderwater(on: boolean): void {
    if (this.underwater === on) return;
    this.underwater = on;
    if (!this.ctx || !this.muffle) return;
    this.muffle.frequency.setTargetAtTime(
      on ? UNDERWATER_CUTOFF : OPEN_CUTOFF,
      this.ctx.currentTime,
      0.08,
    );
  }

  /**
   * 出来事を鳴らす。材質で音が変わるものは `group`、声色が変わるものは `pitch` を渡す。
   * **どちらも素通しするだけ**（数値を決めるのは `mobs.ts`、掛け算は `sfx.ts`）。
   */
  play(sfx: Sfx, group: SoundGroup = "none", pitch = 1): void {
    if (this.volume <= 0) return;
    if (!this.ctx) return;
    this.emit(recipeFor(sfx, group, pitch));
  }

  private emit(recipe: SoundRecipe): void {
    const ctx = this.ctx;
    const buffer = this.noiseBuffer;
    const destination = this.muffle;
    if (!ctx || !buffer || !destination) return;

    const now = ctx.currentTime;
    const end = now + recipe.duration;
    const freq = jitter(recipe.freq, recipe.spread, Math.random());

    // 包絡線。立ち上がりを 0 にすると「プツッ」と鳴るので、ごく短い時間で開く。
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(recipe.gain, now + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(recipe.cutoff, now);
    filter.Q.value = 0.7;
    filter.connect(envelope);
    envelope.connect(destination);

    if (recipe.noise > 0) {
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      // 波形の切り出し位置をずらして、同じ音の繰り返しに聞こえないようにする
      noise.playbackRate.value = freq / 220;
      const gain = ctx.createGain();
      gain.gain.value = recipe.noise;
      noise.connect(gain);
      gain.connect(filter);
      noise.start(now, Math.random() * (buffer.duration - recipe.duration - 0.01));
      noise.stop(end);
    }

    if (recipe.noise < 1) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      if (recipe.sweep !== 1) osc.frequency.exponentialRampToValueAtTime(freq * recipe.sweep, end);
      const gain = ctx.createGain();
      gain.gain.value = 1 - recipe.noise;
      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(end);
    }
  }
}

/** 立ち上がりの時間（秒）。0 にするとクリックノイズが乗る。 */
const ATTACK = 0.005;
/** exponentialRamp は 0 にできないので、聞こえない値まで落とす。 */
const SILENCE = 0.0001;
/** 地上のローパス（実質素通し）と、水中のこもり具合。 */
const OPEN_CUTOFF = 20000;
const UNDERWATER_CUTOFF = 700;
