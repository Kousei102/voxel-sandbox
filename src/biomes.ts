import { DIRT, GRASS, SAND, SANDSTONE, SNOW, STONE } from "./blocks";
import { SEA_LEVEL } from "./constants";

/**
 * バイオームの判定。
 *
 * **気候（気温・湿度）と高さの役割を分けてある。** 気候だけで決まるものを
 * `classify()`、そこに高さの上書き（海・浜・高山）を掛けるものを `resolve()` にした。
 * 混ぜると「高さを決めるのにバイオームが要り、バイオームを決めるのに高さが要る」
 * という循環になるので、この分け方は崩さないこと。
 *
 * ここには three も DOM も出てこないので、丸ごとヘッドレスで検証できる。
 * **地表のブロックや木の生えやすさの判断を worldgen.ts 側に書かないこと。**
 */

export const OCEAN = 0;
export const BEACH = 1;
export const DESERT = 2;
export const PLAINS = 3;
export const FOREST = 4;
export const TAIGA = 5;
export const SNOWY = 6;
export const ALPINE = 7;
export const ALPINE_ROCK = 8;
export const SNOWY_BEACH = 9;

/** この高さ以上は山（気候によって雪か岩かが変わる）。 */
export const ALPINE_HEIGHT = 76;

/**
 * これより暖かいところでは雪が積もらない（山は岩肌、浜は砂のまま）。
 *
 * **`HOT` よりだいぶ低くしてあるのが肝心。** 砂漠（気温 > HOT）と雪のあいだに
 * かならず「雪の降りない土地」の帯が入るので、砂の隣が雪になることがなくなる。
 * 気温は 1 ブロックで最大 0.004 ほどしか動かないので、帯の幅は最低でも
 * (HOT - SNOW_TEMP) / 0.004 ≒ 45 ブロックある。
 */
const SNOW_TEMP = -0.02;

export type TreeKind = "oak" | "spruce" | "cactus";

export interface BiomeDef {
  readonly id: number;
  readonly name: string;
  /** 地表 1 ブロック。 */
  readonly surface: number;
  /** 地表の下 3 ブロック。 */
  readonly filler: number;
  /**
   * 木を 1 本試すたびに生える確率 0..1（1 列につき 6 回試す）。
   * 0 なら生えない。
   */
  readonly trees: number;
  readonly treeKind: TreeKind;
  /**
   * 地表 1 マスごとに草むらが生える確率 0..1。
   * 雪・砂・岩肌の上には生やさないので、地表が草のバイオームだけが 0 より大きい。
   */
  readonly grass: number;
  /**
   * 地表 1 マスごとにキノコ（赤か茶）が生える確率 0..1。
   *
   * **草むらより先に引く**（`worldgen.ts`）ので、`grass` とは独立した確率になる。
   * 木陰の生えものなので**森と針葉樹林だけ 0 より大きい** —— 砂・雪・岩肌の上に
   * 生えると、見た瞬間におかしいと分かる（`grass` とまったく同じ理由）。
   * **赤と茶の振り分けはここではなく `worldgen.ts` の 2 本目のハッシュ**（半々）。
   */
  readonly mushroom: number;
}

/**
 * 気温・湿度のしきい値は `fbm2` の実効レンジ **±0.6 の前提**で決めてある
 * （±1 ではない。CLAUDE.md「地形を触るとき」参照）。
 */
const HOT = 0.16;
const COLD = -0.16;
const DRY = 0.0;
const WET = 0.02;

export const BIOMES: readonly BiomeDef[] = [
  { id: OCEAN, name: "海", surface: SAND, filler: SAND, trees: 0, treeKind: "oak", grass: 0, mushroom: 0 },
  { id: BEACH, name: "浜", surface: SAND, filler: SAND, trees: 0, treeKind: "oak", grass: 0, mushroom: 0 },
  // 砂漠だけ木の代わりにサボテンが立つ
  { id: DESERT, name: "砂漠", surface: SAND, filler: SANDSTONE, trees: 0.35, treeKind: "cactus", grass: 0, mushroom: 0 },
  // 平原がいちばん草深い（Minecraft と同じで、森は木の下なので少なめ）。
  // **平原にキノコは生えない** —— 木陰の生えものなので、森と針葉樹林だけにしてある。
  { id: PLAINS, name: "平原", surface: GRASS, filler: DIRT, trees: 0.3, treeKind: "oak", grass: 0.3, mushroom: 0 },
  { id: FOREST, name: "森", surface: GRASS, filler: DIRT, trees: 0.8, treeKind: "oak", grass: 0.15, mushroom: 0.015 },
  { id: TAIGA, name: "針葉樹林", surface: GRASS, filler: DIRT, trees: 0.65, treeKind: "spruce", grass: 0.1, mushroom: 0.01 },
  { id: SNOWY, name: "雪原", surface: SNOW, filler: DIRT, trees: 0.15, treeKind: "spruce", grass: 0, mushroom: 0 },
  { id: ALPINE, name: "高山", surface: SNOW, filler: STONE, trees: 0, treeKind: "spruce", grass: 0, mushroom: 0 },
  // 暖かい土地の山。雪をかぶらないので、砂漠から生えた山も砂 → 岩肌になる。
  { id: ALPINE_ROCK, name: "岩山", surface: STONE, filler: STONE, trees: 0, treeKind: "oak", grass: 0, mushroom: 0 },
  { id: SNOWY_BEACH, name: "雪の浜", surface: SNOW, filler: SAND, trees: 0, treeKind: "spruce", grass: 0, mushroom: 0 },
];

/** 気候だけで決まるバイオーム。**高さを見ないこと**（循環する）。 */
export function classify(temperature: number, humidity: number): number {
  if (temperature > HOT) return humidity < DRY ? DESERT : PLAINS;
  if (temperature < COLD) return humidity > DRY ? TAIGA : SNOWY;
  return humidity > WET ? FOREST : PLAINS;
}

/**
 * 気候のバイオームに、高さによる上書き（海・浜・山）を掛けた最終結果。
 *
 * 気温も受け取るのは**雪が積もるかどうかを決めるため**だけ。
 * ここで気温から気候を決め直さないこと（それは `classify` の仕事）。
 */
export function resolve(climate: number, height: number, temperature: number): number {
  const snowy = temperature <= SNOW_TEMP;
  if (height < SEA_LEVEL) return OCEAN;
  if (height <= SEA_LEVEL + 1) return snowy ? SNOWY_BEACH : BEACH;
  if (height >= ALPINE_HEIGHT) return snowy ? ALPINE : ALPINE_ROCK;
  return climate;
}

export function biomeName(id: number): string {
  return BIOMES[id].name;
}

export function biomeDef(id: number): BiomeDef {
  return BIOMES[id];
}
