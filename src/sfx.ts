import type { SoundGroup } from "./blocks";

/**
 * 音の「何を・いつ・どんな数値で鳴らすか」。
 *
 * **このファイルには WebAudio が出てこない。** `AudioContext` に触るのは `audio.ts` だけで、
 * あちらはここが出した数値をノードに貼るだけにしてある。おかげで音の判断
 * （足音の間隔、材質ごとの音色、音量）は丸ごとヘッドレスでテストできる。
 * 耳で確かめないと分からないのは音色そのものだけ。
 *
 * **判断を `audio.ts` や `main.ts` に書かないこと。**
 */

/** 鳴らす出来事。 */
export type Sfx =
  | "step"
  | "dig"
  | "break"
  | "place"
  | "land"
  | "hurt"
  | "death"
  | "splash"
  | "craft"
  /** 落ちたアイテムを拾った音（`drops.ts` が鳴らす）。 */
  | "pickup"
  /** モブの鳴き声・悲鳴・断末魔。**種類ごとの声色は音程の倍率で付ける**（`MOB_VOICE`）。 */
  | "mobsay"
  | "mobhurt"
  | "mobdeath";

/**
 * 音 1 つぶんの作り方。ノイズとトーンを混ぜてローパスに通し、包絡線で減衰させる。
 * **テクスチャと同じで、波形も実行時に作る**（外部アセットを使わない規約）。
 */
export interface SoundRecipe {
  /** トーンの高さ Hz。 */
  readonly freq: number;
  /** 鳴り終わりの高さの倍率。1 なら変わらない（< 1 で下がる、> 1 で上がる）。 */
  readonly sweep: number;
  /** ノイズの割合 0..1。1 なら完全にノイズ、0 なら完全にトーン。 */
  readonly noise: number;
  /** ローパスの角 Hz。低いほどこもって柔らかく聞こえる。 */
  readonly cutoff: number;
  /** 長さ（秒）。 */
  readonly duration: number;
  /** 音量 0..1（マスター音量とは別に掛かる）。 */
  readonly gain: number;
  /** 音程のばらつき ±割合。同じ音が続いても機械的に聞こえないように散らす。 */
  readonly spread: number;
}

/**
 * 材質ごとの音の素。マイクラ寄りに、**ノイズ主体**で作る
 * （柔らかいものほど `cutoff` を下げ、硬いものほど上げる）。
 */
const MATERIAL: Record<SoundGroup, { freq: number; cutoff: number; noise: number }> = {
  grass: { freq: 180, cutoff: 1100, noise: 0.95 },
  dirt: { freq: 150, cutoff: 800, noise: 0.9 },
  sand: { freq: 220, cutoff: 2600, noise: 1 },
  stone: { freq: 260, cutoff: 3200, noise: 0.75 },
  wood: { freq: 320, cutoff: 1800, noise: 0.55 },
  glass: { freq: 900, cutoff: 6000, noise: 0.35 },
  snow: { freq: 160, cutoff: 650, noise: 1 },
  // 布はいちばん柔らかい。cutoff を snow より下げ、ノイズだけにする。
  wool: { freq: 130, cutoff: 480, noise: 1 },
  none: { freq: 400, cutoff: 2000, noise: 0.7 },
};

/**
 * 出来事ごとの性格。`material` が true なら上の表を素に使い、
 * false なら自前の `freq` / `cutoff` / `noise` を使う（材質と関係ない音）。
 */
interface EventDef {
  readonly material: boolean;
  readonly duration: number;
  readonly gain: number;
  readonly spread: number;
  readonly sweep: number;
  /** material が true のときの倍率、false のときはそのままの値。 */
  readonly freq: number;
  readonly cutoff: number;
  readonly noise?: number;
}

const EVENTS: Record<Sfx, EventDef> = {
  // 足音は短く小さく。1 歩ごとに鳴るので、少しでも大きいとうるさい。
  step: { material: true, duration: 0.09, gain: 0.22, spread: 0.12, sweep: 1, freq: 1, cutoff: 1 },
  // 掘っている間のコツコツ。足音より高く、さらに小さく。
  dig: { material: true, duration: 0.07, gain: 0.16, spread: 0.15, sweep: 1, freq: 1.1, cutoff: 1.1 },
  // 壊した瞬間。低めで長く、少し下がりながら消える。
  break: { material: true, duration: 0.26, gain: 0.45, spread: 0.08, sweep: 0.7, freq: 0.8, cutoff: 1.3 },
  place: { material: true, duration: 0.13, gain: 0.4, spread: 0.06, sweep: 0.9, freq: 0.9, cutoff: 1.1 },
  land: { material: true, duration: 0.16, gain: 0.32, spread: 0.05, sweep: 0.8, freq: 0.7, cutoff: 0.8 },

  // 材質と関係ない音。痛みは下がる、クラフトは上がる、と向きで意味を付ける。
  hurt: { material: false, duration: 0.3, gain: 0.5, spread: 0.05, sweep: 0.55, freq: 300, cutoff: 1800, noise: 0.5 },
  death: { material: false, duration: 0.9, gain: 0.55, spread: 0, sweep: 0.35, freq: 260, cutoff: 1400, noise: 0.35 },
  splash: { material: false, duration: 0.35, gain: 0.4, spread: 0.1, sweep: 1.6, freq: 500, cutoff: 3500, noise: 0.95 },
  craft: { material: false, duration: 0.18, gain: 0.3, spread: 0, sweep: 1.5, freq: 660, cutoff: 5000, noise: 0.05 },
  // 拾った瞬間の「ポッ」。**歩いているだけで何度も鳴るので、いちばん短く小さく。**
  // クラフトと同じ「上がる」向きにして、失う音（hurt）と取り違えないようにする。
  pickup: { material: false, duration: 0.1, gain: 0.24, spread: 0.18, sweep: 1.7, freq: 820, cutoff: 5200, noise: 0.08 },

  // モブの声。トーン寄り（noise 低め）にしないと「声」に聞こえない。
  // 高さは種類ごとの倍率で散らすので、ここは真ん中の 1 種類だけ持つ。
  mobsay: { material: false, duration: 0.36, gain: 0.3, spread: 0.14, sweep: 0.85, freq: 320, cutoff: 2200, noise: 0.35 },
  mobhurt: { material: false, duration: 0.2, gain: 0.42, spread: 0.1, sweep: 0.6, freq: 380, cutoff: 2600, noise: 0.4 },
  mobdeath: { material: false, duration: 0.6, gain: 0.48, spread: 0.05, sweep: 0.4, freq: 300, cutoff: 2000, noise: 0.35 },
};

/**
 * その出来事を、その材質・その声色で鳴らすときの数値。
 *
 * `pitch` は音程の倍率で、**モブの種類ごとの声色をこれ 1 つで付ける**
 * （種類ごとに `Sfx` を増やすと出来事 × 種類で膨らむし、`SoundGroup` を流用すると
 * 「ブロックの材質」という意味が壊れる）。倍率は `cutoff` にも掛ける ——
 * 低い声だけ明るくこもらない、という不自然さが出ないように。
 */
export function recipeFor(sfx: Sfx, group: SoundGroup = "none", pitch = 1): SoundRecipe {
  const event = EVENTS[sfx];
  const base = MATERIAL[group] ?? MATERIAL.none;
  return {
    freq: (event.material ? base.freq * event.freq : event.freq) * pitch,
    cutoff: (event.material ? base.cutoff * event.cutoff : event.cutoff) * pitch,
    noise: event.material ? base.noise : (event.noise ?? 0.5),
    sweep: event.sweep,
    duration: event.duration,
    gain: event.gain,
    spread: event.spread,
  };
}

/** 音程のばらつきを掛けた高さ。`random` は 0..1（テストでは固定値を渡す）。 */
export function jitter(freq: number, spread: number, random: number): number {
  return freq * (1 + (random * 2 - 1) * spread);
}

/** 1 歩ぶんの距離（ブロック）。歩きでおよそ 0.4 秒に 1 歩。 */
export const STEP_DISTANCE = 1.9;

/**
 * 足音の間隔。**時間ではなく歩いた距離で刻む。**
 * こうしておくと、スプリントすれば自然に足音も速くなるし、
 * 壁に押し付けて足踏みしても鳴らない（距離が進まないため）。
 */
export class StepCadence {
  private travelled = 0;

  /** 水平に動いた距離を渡す。足音を鳴らすべきなら true。 */
  advance(distance: number, ctx: { onGround: boolean; inWater: boolean; flying: boolean }): boolean {
    // 空中・水中・飛行中は鳴らさない。溜めもしない（着地した瞬間に鳴ってしまう）
    if (!ctx.onGround || ctx.inWater || ctx.flying) {
      this.travelled = 0;
      return false;
    }
    this.travelled += distance;
    if (this.travelled < STEP_DISTANCE) return false;
    // 引き算ではなく 0 に戻す。ワープした（= 距離が跳ねた）ときに連発しない
    this.travelled = 0;
    return true;
  }

  reset(): void {
    this.travelled = 0;
  }
}

/** コツコツ音 1 回ぶんの採掘の進み具合。1 ブロック掘るあいだに 4〜5 回鳴る。 */
export const DIG_STEP = 0.22;

/** 掘っている間のコツコツ音の間隔。進み具合で刻むので、硬い石ほどゆっくり鳴る。 */
export class DigCadence {
  private since = DIG_STEP;

  /** 進んだ割合（0..1 の増分）を渡す。鳴らすべきなら true。 */
  advance(progress: number): boolean {
    this.since += progress;
    if (this.since < DIG_STEP) return false;
    this.since = 0;
    return true;
  }

  /** 狙いを変えた・掘るのをやめたとき。次に掘り始めたらすぐ 1 回鳴る。 */
  reset(): void {
    this.since = DIG_STEP;
  }
}

/** 音量の既定値。0 で無音。 */
export const DEFAULT_VOLUME = 0.6;

/** セーブから読んだ音量を 0..1 に丸める（壊れた値は既定に戻す）。 */
export function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}
