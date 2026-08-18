/**
 * ベッド。**「1 個のブロックが 2 マスにまたがる」初めての例**で、判断は全部ここにある。
 *
 * three にも DOM にも触らないので丸ごとヘッドレスで検証できる
 * （見張りは `test/beds.test.ts`）。かまど（`furnaces.ts`）・チェスト（`chests.ts`）と
 * 同じ「判断だけを持つ」ファイルだが、**あちらと違ってワールドを書き換える。**
 * ベッドを置く／壊すのはプレイヤーの操作そのもので、`edits` に乗るべきものだから。
 * その代わり `World` を丸ごと受け取らず、**使う 3 つの入口だけ**を受け取る。
 *
 * ここが守っているのは 1 つだけ: **足側と枕側が必ず揃っている。**
 * 崩れると「半分だけのベッド」が残り、相方を探す側が永久に見つけられなくなる。
 */

import {
  AIR,
  BED_HEIGHT,
  bedPartner,
  isBed,
  isReplaceable,
  isSolid,
  WATER,
  type PlaceSpot,
} from "./blocks";

/**
 * `World` のうち、ベッドが使う入口だけ。**丸ごと受け取らないこと** ——
 * ここに `World` が入ると、ストリーミングの都合（列の読み込み・メッシュ化）まで
 * 試験場に用意しなければならなくなる。
 */
export interface BedWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
  canPlaceAt(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 寝るのを断るモンスターの距離。**寝る側の規則なのでここに置く**
 * （`mobs.ts` は距離を渡されて「居るか」を答えるだけ）。Minecraft と同じ 8。
 */
export const SLEEP_MONSTER_RADIUS = 8;

/** リスポーンしたときに立たせる高さ。ベッドの上面から少しだけ浮かせる。 */
const SPAWN_CLEARANCE = 0.05;
/** リスポーン地点として使うのに必要な、足側の上の空きマス数（プレイヤーは 1.8 の高さ）。 */
const SPAWN_HEADROOM = 2;

/**
 * そのマスにベッドの半分を書けるか。押しのけてよいブロック（空気・草むら）だけを許し、
 * **水は弾く** —— `main.ts` が支えの要るブロック全部に掛けているのと同じ規則で、
 * ここでは 2 マスの両方に掛ける。
 */
function freeForBed(world: Pick<BedWorld, "getVoxel">, x: number, y: number, z: number): boolean {
  const at = world.getVoxel(x, y, z);
  return at !== WATER && isReplaceable(at);
}

/**
 * ベッドを 2 マスに置く。置けたら true。
 *
 * **先に 2 マスとも確かめてから書くこと。** 片方だけ書いてから諦めると、
 * 相方の居ない半分が残る。支えの判定は写さず `canPlaceAt` に聞く
 * （松明と同じ 1 本の規則に乗せておけば、床の扱いが食い違わない）。
 */
export function placeBed(world: BedWorld, spot: PlaceSpot, id: number): boolean {
  const partner = bedPartner(id);
  if (!partner) return false;

  const hx = spot.x + partner.dx;
  const hy = spot.y;
  const hz = spot.z + partner.dz;

  // **2 マスに同じ条件を掛けること。** 片方だけ水を弾くと、枕だけが水に浮いた
  // ベッドができる（水は `replaceable` なので、確かめないと素通りする）。
  if (!freeForBed(world, spot.x, spot.y, spot.z)) return false;
  if (!freeForBed(world, hx, hy, hz)) return false;
  if (!world.canPlaceAt(spot.x, spot.y, spot.z, id)) return false;
  if (!world.canPlaceAt(hx, hy, hz, partner.id)) return false;

  if (!world.setVoxel(spot.x, spot.y, spot.z, id)) return false;
  if (!world.setVoxel(hx, hy, hz, partner.id)) {
    // ここへは来ない見込みだが、来たときに半分だけ残すより戻すほうが安全側。
    world.setVoxel(spot.x, spot.y, spot.z, AIR);
    return false;
  }
  return true;
}

/**
 * ベッドの半分を壊したとき、**相方も消す。** 消した相方の数を返す（0 か 1）。
 *
 * 渡すのは「いま壊した／これから消える」マスとその ID。そのマス自身は呼ぶ側が
 * 消しているか、消える途中（`World.onAutoBreak`）なのでここでは触らない。
 *
 * **相方のマスが期待した ID でなければ何もしない** —— 揃っていない状況で
 * 関係のないブロックを消さないため。
 */
export function clearBedPartner(world: BedWorld, x: number, y: number, z: number, id: number): number {
  const partner = bedPartner(id);
  if (!partner) return 0;
  const px = x + partner.dx;
  const pz = z + partner.dz;
  if (world.getVoxel(px, y, pz) !== partner.id) return 0;
  return world.setVoxel(px, y, pz, AIR) ? 1 : 0;
}

/** 右クリックしたときに起きること。**この 3 分岐を `main.ts` に書かないこと。** */
export type SleepResult =
  /** 昼なので、リスポーン地点を記録するだけ。 */
  | "spawn-set"
  /** 夜だが近くにモンスターが居る。地点は記録して、時刻は動かさない。 */
  | "monsters"
  /** 夜明けまで寝た。 */
  | "slept";

/**
 * 寝られるかの振り分け。**リスポーン地点はどの結果でも記録する**
 * （寝られなかったからといって、地点だけ取り損なう理由が無い）。
 */
export function sleepDecision(canSleepNow: boolean, monstersNear: boolean): SleepResult {
  if (!canSleepNow) return "spawn-set";
  return monstersNear ? "monsters" : "slept";
}

/** リスポーン地点。ベッドの**足側**のマスを覚える。 */
export interface BedPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * リスポーン地点 1 点。**ベッドが壊されても記録は消さない** ——
 * 消えたかどうかは戻るときに `spawnPosition()` が確かめる（Minecraft と同じ形で、
 * 「ベッドが無くなっていました」と知らせられる）。
 */
export class Beds {
  private point: BedPoint | null = null;

  /** 記録が変わった合図（セーブの印に使う）。 */
  onChange?: () => void;

  get spawnPoint(): BedPoint | null {
    return this.point;
  }

  set(x: number, y: number, z: number): void {
    if (this.point && this.point.x === x && this.point.y === y && this.point.z === z) return;
    this.point = { x, y, z };
    this.onChange?.();
  }

  clear(): void {
    this.point = null;
  }

  /**
   * リスポーンして立つ位置。使えないなら null（呼ぶ側がワールドの初期位置に落とす）。
   *
   * **列を読み込んでから呼ぶこと。** 未読み込みだと `getVoxel` が AIR を返すので、
   * 生きているベッドを「壊されている」と誤読する（`furnaces.ts` の `syncLit` と同じ罠）。
   *
   * 見るのは 2 つ:
   * - そのマスにまだベッドがあるか（掘られていないか）
   * - ベッドの上に頭のぶんの空きがあるか（**壁の中に湧いて即死しないため**）
   *
   * 本家のような周囲の探索はしない。ワールドの初期位置と同じで
   * 「3 マス以上の高さがある所を前提にする」線に揃えてある。
   */
  spawnPosition(world: Pick<BedWorld, "getVoxel">): { x: number; y: number; z: number } | null {
    const at = this.point;
    if (!at) return null;
    if (!isBed(world.getVoxel(at.x, at.y, at.z))) return null;
    for (let i = 1; i <= SPAWN_HEADROOM; i++) {
      if (isSolid(world.getVoxel(at.x, at.y + i, at.z))) return null;
    }
    return {
      x: at.x + 0.5,
      y: at.y + BED_HEIGHT + SPAWN_CLEARANCE,
      z: at.z + 0.5,
    };
  }

  /** `[x, y, z]`。記録が無ければ `undefined` を返してキーごと省く（`chests.ts` と同じ作法）。 */
  serialize(): number[] | undefined {
    const at = this.point;
    return at ? [at.x, at.y, at.z] : undefined;
  }

  /** セーブから戻す。**壊れた値は黙って捨てる**（読めないより、無いほうがまし）。 */
  deserialize(raw: readonly number[] | undefined): void {
    this.point = null;
    if (!Array.isArray(raw) || raw.length < 3) return;
    if (!raw.slice(0, 3).every((v) => typeof v === "number" && Number.isFinite(v))) return;
    this.point = { x: raw[0], y: raw[1], z: raw[2] };
  }
}
