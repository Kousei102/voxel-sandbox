import { Color, Vector3 } from "three";
import { WATER, liquidFog } from "./blocks";
import { CHUNK_SIZE, DAY_LENGTH_SECONDS, NIGHT_BRIGHTNESS, RENDER_DISTANCE } from "./constants";

/**
 * 時刻から空の色・地形の明るさ・太陽と月の位置を決める。
 *
 * ここには three の Color と Vector3 しか出てこないので、丸ごとヘッドレスで検証できる。
 * 逆に言うと、時刻に関する計算は全部ここに置くこと（sky.ts 側は結果を貼るだけにする）。
 *
 * 時刻 t は [0, 1) で、0 = 日の出、0.25 = 南中、0.5 = 日没、0.75 = 真夜中。
 */

// 昼と夜の 2 枚を太陽の高さで混ぜ、地平線側にだけ夕焼けを足す。
const DAY_ZENITH = new Color(0x3f7fd0);
const DAY_HORIZON = new Color(0x9ec8e8);
const DAY_GROUND = new Color(0x4c5a63);
const NIGHT_ZENITH = new Color(0x060a16);
const NIGHT_HORIZON = new Color(0x141d33);
const NIGHT_GROUND = new Color(0x090c13);
const DUSK_ZENITH = new Color(0x5c4a86);
const DUSK_HORIZON = new Color(0xe8874a);

// 地形に掛ける色。夜は青く、朝夕は赤く寄せる。
const DAY_TINT = new Color(0xffffff);
const NIGHT_TINT = new Color(0x9fb4e8);
const DUSK_TINT = new Color(0xffb888);
/** 夕焼けを地形に乗せる強さ。空ほど強くすると地面が真っ赤になる。 */
const DUSK_TINT_STRENGTH = 0.45;

/**
 * 寝られる太陽の高さ。これより低ければ夜（夕暮れから夜明けまで）。
 * 0 ぴったりにすると日没・日の出のフレームで判定がばたつくので、少し下げてある。
 */
const SLEEP_ELEVATION = -0.05;

/** 寝て起きる時刻。0 = 日の出（Minecraft と同じ）。 */
export const WAKE_TIME = 0;

/** 太陽の高さ -1..+1。時刻だけで決まるので、`DayNight` を立てずに引ける。 */
export function sunElevation(t: number): number {
  return Math.sin(wrap01(t) * Math.PI * 2);
}

/**
 * その時刻に寝られるか（= 太陽が地平線より下か）。
 *
 * **時刻に関する判断はこのファイルに置くこと**（`CLAUDE.md` の決まり）。
 * `main.ts` に `time > 0.5` のような式を書くと、`sample()` の夜の定義と
 * 二重管理になって静かにずれる。
 */
export function canSleep(t: number): boolean {
  return sunElevation(t) < SLEEP_ELEVATION;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 負数でも [0, 1) に収める。 */
function wrap01(t: number): number {
  const w = t % 1;
  return w < 0 ? w + 1 : w;
}

/** 空とフォグに掛ける値。**色は使い回しの `Color`** なので、貼ったらすぐ使うこと。 */
export interface Environment {
  /**
   * 頭が**水**の中か。息（`vitals.ts`）と音のこもり（`audio.ts`）が見る。
   * **液体すべてに広げないこと** —— 溶岩の中で溺れ始める。
   */
  readonly headInWater: boolean;
  /** 頭が液体の中か。フォグと天球の塗り潰しはこちら（水でも溶岩でも掛かる）。 */
  readonly inLiquid: boolean;
  readonly fog: Color;
  readonly near: number;
  readonly far: number;
}

/** 使い回し。毎フレーム呼ばれるので `Color` を作り直さない。 */
const environment = { headInWater: false, inLiquid: false, fog: new Color(), near: 0, far: 0 };

/** 素の（液体に浸かっていないときの）フォグの掛かり始めと終わり。 */
const FOG_NEAR = RENDER_DISTANCE * CHUNK_SIZE * 0.55;
const FOG_FAR = RENDER_DISTANCE * CHUNK_SIZE * 0.98;

/**
 * 頭の位置のブロックと時刻から、フォグと天球の値を決める。
 *
 * **フォグの色は地平線と揃えること** —— ずれるとチャンクが湧いて出るのが見える。
 * どの色でどれだけ濃いかは `blocks.ts` の `fog`（`main.ts` は貼るだけ）。
 */
export function environmentFor(head: number, dayNight: DayNight): Environment {
  const env = environment;
  env.headInWater = head === WATER;

  const liquid = liquidFog(head);
  env.inLiquid = liquid !== null;
  if (liquid) {
    env.fog.setHex(liquid.color);
    // 水は夜に暗くなるが、溶岩は自分で光るので掛けない
    if (liquid.daylit) env.fog.multiplyScalar(dayNight.brightness);
    env.near = liquid.near;
    env.far = liquid.far;
  } else {
    env.fog.copy(dayNight.horizon);
    env.near = FOG_NEAR;
    env.far = FOG_FAR;
  }
  return env;
}

export class DayNight {
  /** 太陽の向き（単位ベクトル）。+X から昇って +Y を通り -X へ沈む。 */
  readonly sunDirection = new Vector3();
  /** 月の向き。常に太陽の真裏。 */
  readonly moonDirection = new Vector3();

  readonly zenith = new Color();
  readonly horizon = new Color();
  readonly ground = new Color();
  /** 地形のマテリアルに掛ける色。明るさ（brightness）を含んだ値。 */
  readonly tint = new Color();

  /** 太陽の高さ。-1（真夜中）〜 +1（南中）。 */
  elevation = 0;
  /** 昼らしさ。0 = 夜、1 = 昼。 */
  dayness = 0;
  /** 朝焼け・夕焼けの強さ。地平線に太陽があるとき 1。 */
  twilight = 0;
  /** 頂点カラーに掛ける明るさ。NIGHT_BRIGHTNESS 〜 1。 */
  brightness = 1;
  starOpacity = 0;
  sunOpacity = 0;
  moonOpacity = 0;
  /** 星ぼしの回転角 (rad)。太陽と同じく +Z 軸まわり。 */
  starAngle = 0;

  /** 止めると時刻が進まなくなる（メニューでのスクラブ用ではなく、デバッグ用）。 */
  paused = false;

  private t = 0;

  constructor(time = 0.05) {
    this.setTime(time);
  }

  get time(): number {
    return this.t;
  }

  setTime(time: number): void {
    this.t = wrap01(time);
    this.sample();
  }

  advance(dt: number): void {
    if (this.paused) return;
    this.setTime(this.t + dt / DAY_LENGTH_SECONDS);
  }

  /** "06:00" 形式。t = 0 を 06:00 とする（Minecraft と同じ割り当て）。 */
  clock(): string {
    const minutes = Math.floor(wrap01(this.t + 0.25) * 1440);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  private sample(): void {
    const angle = this.t * Math.PI * 2;
    this.sunDirection.set(Math.cos(angle), Math.sin(angle), 0);
    this.moonDirection.copy(this.sunDirection).negate();
    this.starAngle = angle;

    const h = this.sunDirection.y;
    this.elevation = h;
    // 太陽が地平線の少し下に来るまでは昼として扱う（沈んだ瞬間に暗転させない）。
    this.dayness = smoothstep(-0.18, 0.15, h);
    // 高度 0 付近だけで立つ山。真夜中は |h| = 1 なので 0 になる。
    this.twilight = 1 - smoothstep(0.02, 0.28, Math.abs(h));

    this.brightness = NIGHT_BRIGHTNESS + (1 - NIGHT_BRIGHTNESS) * this.dayness;

    this.zenith.lerpColors(NIGHT_ZENITH, DAY_ZENITH, this.dayness);
    this.zenith.lerp(DUSK_ZENITH, this.twilight * 0.5);
    this.horizon.lerpColors(NIGHT_HORIZON, DAY_HORIZON, this.dayness);
    this.horizon.lerp(DUSK_HORIZON, this.twilight);
    this.ground.lerpColors(NIGHT_GROUND, DAY_GROUND, this.dayness);

    this.tint.lerpColors(NIGHT_TINT, DAY_TINT, this.dayness);
    this.tint.lerp(DUSK_TINT, this.twilight * DUSK_TINT_STRENGTH);
    this.tint.multiplyScalar(this.brightness);

    // 星は日の出より先に消える。太陽・月は地平線をまたぐところで薄れる。
    this.starOpacity = 1 - smoothstep(-0.30, -0.02, h);
    this.sunOpacity = smoothstep(-0.16, -0.02, h);
    this.moonOpacity = smoothstep(-0.16, -0.02, -h);
  }
}
