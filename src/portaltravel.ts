/**
 * ポータルを通ったときに**どこへ出るか**。**判断だけのファイル**で、three も DOM も
 * 出てこない（`portals.ts` / `beds.ts` / `dimensions.ts` と同じ形）。
 *
 * `portals.ts` は枠の形と点火だけを見て次元を知らない。こちらは**次元の対応**
 * （ネザー ↔ オーバーワールド・1:8）と**出る場所**を持つ。分けてあるのは、
 * 枠の判定だけを使いたい所（点火）で次元の話を読まされないようにするため。
 *
 * **ここが落ちると「壁の中に湧く」「戻れない」形で壊れる。** どちらもブラウザを
 * 見るまで切り分けられないので、次の 4 つをヘッドレスで固定してある
 * （`test/portaltravel.test.ts`）:
 *
 * 1. **出す場所は必ず立てる場所**（足元が固体・頭の上が空き）。無ければ足場を作る
 * 2. **向こう側に枠が無ければ作る**（作れないと片道になる）
 * 3. **同じポータルで往復すると元の側の同じ枠に戻る**（毎回新しい枠が増えない）
 * 4. 溶岩の海の底や岩盤の中に出さない
 */

import { AIR, END_PORTAL, OBSIDIAN, isSolid } from "./blocks";
import { WORLD_HEIGHT } from "./constants";
import { END, NETHER, OVERWORLD, type DimensionId } from "./dimensions";
import { END_SPAWN } from "./endgen";
import { portalAxis, portalBlock, type PortalAxis, type PortalWorld } from "./portals";

/**
 * いま踏んでいるマスがどのポータルか。**種類ごとの違いはこの型で運ぶ**ので、
 * 呼ぶ側（`main.ts`）に「ネザーポータルなら…」という分岐が生えない。
 *
 * ネザーポータルだけ `axis` を持つのは、**向こう側に枠を建てるときに要る**から。
 * エンドの面は寝ていて向きが 1 つしか無く、枠も建てない（島の上に降ろすだけ）。
 */
export type PortalHere =
  | { readonly kind: "nether"; readonly axis: PortalAxis }
  | { readonly kind: "end" };

export type PortalKind = PortalHere["kind"];

/**
 * そのマスがポータルなら種類、違うなら null。**ここが唯一の見分け方**にしてある ——
 * `main.ts` が `id === END_PORTAL` と書き始めると、ポータルを足すたびに
 * 「踏んだか」「どこへ行くか」「どこに出るか」の 3 か所を直して回ることになる。
 */
export function portalAt(id: number): PortalHere | null {
  const axis = portalAxis(id);
  if (axis) return { kind: "nether", axis };
  return id === END_PORTAL ? { kind: "end" } : null;
}

/**
 * ポータルに立ってから移るまでの間（秒）。**0 にしないこと** ——
 * 入った瞬間に飛ぶと、間違って踏んだだけで次元が変わる。
 */
export const PORTAL_DELAY = 0.9;

/**
 * ポータルの面に立っている時間を数える掛け金。**判断はここ**で、`main.ts` は
 * 「いま面の中に居るか」を毎フレーム渡すだけ。
 *
 * **掛け金（`latch`）が肝心。** 出る場所は向こうの枠の中なので、無いと
 * 着いた瞬間に数え直して戻り、行ったり来たりを繰り返す。
 * いったんポータルの外へ出ると外れる。
 */
export class PortalGate {
  private timer = 0;
  private latched = false;

  /** 面の中に居るならその種類、居ないなら null。**移るなら true を返す。** */
  step(dt: number, here: PortalHere | null): boolean {
    if (!here) {
      this.timer = 0;
      this.latched = false;
      return false;
    }
    if (this.latched) return false;
    this.timer += dt;
    if (this.timer < PORTAL_DELAY) return false;
    this.timer = 0;
    return true;
  }

  /** 移った直後に掛ける（いったんポータルから出るまで、次は起きない）。 */
  latch(): void {
    this.latched = true;
    this.timer = 0;
  }

  /** 数えている途中の割合（0..1）。**画面に出す用**で、判断には使わない。 */
  get progress(): number {
    return Math.min(1, this.timer / PORTAL_DELAY);
  }
}

/** ネザーの 1 マスがオーバーワールドの何マスにあたるか（Minecraft と同じ 8）。 */
export const PORTAL_SCALE = 8;

/** 横に既にある枠を探す範囲。**行きで作った枠を帰りに見つけられる広さが要る。** */
export const SEARCH_RADIUS = 12;
/** 縦に探す範囲（出る高さの見当から上下へ）。 */
const SEARCH_HEIGHT = 24;

/** 枠の内側（2x3）。`portals.ts` の `MIN_WIDTH` / `MIN_HEIGHT` と同じ最小の枠を作る。 */
const INNER_WIDTH = 2;
const INNER_HEIGHT = 3;

/** 岩盤のすぐ上には作らない。 */
const FLOOR_MARGIN = 2;
/** 天井（世界の上端）にめり込ませない余白。枠 5 段ぶん + 頭。 */
const ROOF_MARGIN = 8;

/**
 * そのポータルの行き先。**表はここ 1 本**にしてあるので、`main.ts` に
 * 「いまネザーなら…」という分岐が生えない（`test/ui.test.ts` が数えている）。
 *
 * **行き先は「いまどこに居るか」だけでは決まらない。** オーバーワールドには
 * ネザーポータルとエンドポータルの両方が建つので、**踏んだ面の種類**も要る。
 */
export function portalTarget(from: DimensionId, kind: PortalKind): DimensionId {
  if (kind === "end") return from === END ? OVERWORLD : END;
  return from === NETHER ? OVERWORLD : NETHER;
}

/**
 * 座標に掛ける倍率。**ネザーへ入るときは 1/8、戻るときは 8 倍。**
 * オーバーワールド同士（ありえないが）なら 1。
 */
export function linkScale(from: DimensionId, to: DimensionId): number {
  if (from === to) return 1;
  return to === NETHER ? 1 / PORTAL_SCALE : PORTAL_SCALE;
}

/** 行き先の座標（マス単位）。**倍率を掛けてから床に落とす**（負の側でもずれない）。 */
export function linkedSpot(x: number, z: number, scale: number): { x: number; z: number } {
  return { x: Math.floor(x * scale), z: Math.floor(z * scale) };
}

export interface Arrival {
  /** 立つ場所（足元。マスの中心）。 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 向こう側に枠を作ったか（false なら既にあった枠に出た）。 */
  readonly built: boolean;
}

/** そのマスがポータルの面か。**向きの表は `portals.ts` に 1 本だけ。** */
function isPortal(id: number): boolean {
  return portalAxis(id) !== null;
}

/**
 * 近くにある既存のポータルの面。**いちばん近いものを返す。**
 *
 * これが効かないと、往復するたびに新しい枠が建って世界が枠だらけになる。
 */
function findPortalNear(
  world: PortalWorld,
  tx: number,
  tz: number,
  yHint: number,
): [number, number, number] | null {
  const low = Math.max(1, yHint - SEARCH_HEIGHT);
  const high = Math.min(WORLD_HEIGHT - 2, yHint + SEARCH_HEIGHT);
  let best: [number, number, number] | null = null;
  let bestScore = Infinity;

  for (let z = tz - SEARCH_RADIUS; z <= tz + SEARCH_RADIUS; z++) {
    for (let x = tx - SEARCH_RADIUS; x <= tx + SEARCH_RADIUS; x++) {
      for (let y = low; y <= high; y++) {
        if (!isPortal(world.getVoxel(x, y, z))) continue;
        const dx = x - tx;
        const dz = z - tz;
        const dy = y - yHint;
        // 横を重く見る。**縦の差で選ぶと、真上の別の枠を選んでしまう。**
        const score = dx * dx + dz * dz + dy * dy * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = [x, y, z];
        }
      }
    }
  }
  return best;
}

/** その面の一番下まで降りる（足元が枠の底になるように）。 */
function bottomOf(world: PortalWorld, [x, y, z]: [number, number, number]): number {
  let low = y;
  while (low > 1 && isPortal(world.getVoxel(x, low - 1, z))) low--;
  return low;
}

/** その足元に立てるか（頭の上まで空いていて、溶岩でない）。 */
export function standable(world: PortalWorld, x: number, y: number, z: number): boolean {
  if (!isSolid(world.getVoxel(x, y - 1, z))) return false;
  for (let i = 0; i < 2; i++) {
    const id = world.getVoxel(x, y + i, z);
    if (id !== AIR && !isPortal(id)) return false;
  }
  return true;
}

/** 枠を建てる高さ（下段の内側のマス）。 */
function baseFor(world: PortalWorld, tx: number, tz: number, yHint: number, axis: PortalAxis): number {
  // **見当より上も見ること。** 水の底や岩の中から出るとき、空いているのは
  // 見当より上にしかない（見当から下だけ見ると、水没した所に出す）。
  const top = Math.min(yHint + SEARCH_HEIGHT, WORLD_HEIGHT - ROOF_MARGIN);
  let airOnly = -1;

  for (let y = top; y >= FLOOR_MARGIN; y--) {
    if (!openAt(world, tx, y, tz, axis)) continue;
    // 空いてはいる高さ（地面が見つからなかったときの落としどころ）。
    // **上から降りながら上書きする**ので、残るのはいちばん低い所 ——
    // 溶岩の海の上で、海面のすぐ上に足場を作れる（高い所に浮かせない）。
    airOnly = y;
    // **足元が固体のところ。** 溶岩の海の上でも、その底の地面まで降りない
    // （降りると溶岩の中に出ることになる。`openAt` が AIR しか許さないので降りられない）。
    if (isSolid(world.getVoxel(tx, y - 1, tz))) return y;
  }

  if (airOnly >= 0) return airOnly;
  return Math.max(FLOOR_MARGIN, Math.min(yHint, WORLD_HEIGHT - ROOF_MARGIN));
}

/** 枠の内側になる範囲が空いているか。**AIR だけを許す**（水や溶岩の中に建てない）。 */
function openAt(world: PortalWorld, tx: number, y: number, tz: number, axis: PortalAxis): boolean {
  for (let a = 0; a < INNER_WIDTH; a++) {
    for (let b = 0; b < INNER_HEIGHT + 1; b++) {
      const [x, wy, z] = place(tx, y, tz, axis, a, b);
      if (world.getVoxel(x, wy, z) !== AIR) return false;
    }
  }
  return true;
}

/** 枠の中の位置（`along` = 横、`up` = 縦）をワールド座標へ（`portals.ts` の `mapper` と同じ約束）。 */
function place(
  x: number,
  y: number,
  z: number,
  axis: PortalAxis,
  along: number,
  up: number,
): [number, number, number] {
  return axis === "x" ? [x + along, y + up, z] : [x, y + up, z + along];
}

/**
 * 枠を建てて火を点ける。**足場も一緒に作る**（浮いた枠に出ると、
 * 出た瞬間に落ちて何が起きたか分からない）。
 *
 * **書き込みが失敗しても続けること**（`portals.ts` の `ignite` と同じ理由）。
 */
export function buildPortal(
  world: PortalWorld,
  tx: number,
  base: number,
  tz: number,
  axis: PortalAxis,
): void {
  // 内側と、その周り 1 マスを空ける。**先に空けること** —— 岩の中に建てると
  // 枠の外側が埋まったままになり、出たあと動けない。
  for (let a = -1; a <= INNER_WIDTH; a++) {
    for (let b = -1; b <= INNER_HEIGHT; b++) {
      const [x, y, z] = place(tx, base, tz, axis, a, b);
      world.setVoxel(x, y, z, AIR);
    }
  }

  // 足場。枠の下と、その手前・奥（出てから歩ける場所）。
  for (let a = -1; a <= INNER_WIDTH; a++) {
    for (let side = -1; side <= 1; side++) {
      const [x, y, z] = place(tx, base - 1, tz, axis, a, 0);
      const px = axis === "x" ? x : x + side;
      const pz = axis === "x" ? z + side : z;
      world.setVoxel(px, y, pz, OBSIDIAN);
    }
  }

  // 枠。**角は置かない**（`portals.ts` が角を見ないので、置くと形が変わるだけ）。
  for (let a = 0; a < INNER_WIDTH; a++) {
    for (const b of [-1, INNER_HEIGHT]) {
      const [x, y, z] = place(tx, base, tz, axis, a, b);
      world.setVoxel(x, y, z, OBSIDIAN);
    }
  }
  for (let b = 0; b < INNER_HEIGHT; b++) {
    for (const a of [-1, INNER_WIDTH]) {
      const [x, y, z] = place(tx, base, tz, axis, a, b);
      world.setVoxel(x, y, z, OBSIDIAN);
    }
  }

  // 面。**`portals.ts` の `ignite` を通さない** —— あちらは「空きマスから枠を探す」
  // 側で、こちらは形が分かっているので直に置く（探し直すと、いま建てたばかりの
  // 枠を測り直すだけになる）。
  const id = portalBlock(axis);
  for (let a = 0; a < INNER_WIDTH; a++) {
    for (let b = 0; b < INNER_HEIGHT; b++) {
      const [x, y, z] = place(tx, base, tz, axis, a, b);
      world.setVoxel(x, y, z, id);
    }
  }
}

/**
 * 向こう側で出る場所。**既にある枠を探し、無ければ建てる。**
 *
 * `yHint` は出る高さの見当（こちら側の高さをそのまま渡してよい）。
 * `axis` は通ったポータルの向き —— **建てるときだけ使う**ので、
 * 既にある枠が違う向きでもかまわない。
 */
export function arrive(
  world: PortalWorld,
  tx: number,
  tz: number,
  yHint: number,
  axis: PortalAxis,
): Arrival {
  const found = findPortalNear(world, tx, tz, yHint);
  if (found) {
    const y = bottomOf(world, found);
    return { x: found[0] + 0.5, y, z: found[2] + 0.5, built: false };
  }

  const base = baseFor(world, tx, tz, yHint, axis);
  buildPortal(world, tx, base, tz, axis);
  return { x: tx + 0.5, y: base, z: tz + 0.5, built: true };
}

/** エンドで降りる場所を探す広さ（マス）。**`primeAround(_, _, 1)` の 1 列ぶんに収めること。** */
export const END_SEARCH = 8;

/** その列の一番上の立てる高さ。無ければ -1。**上から降りる**ので、屋根の上ではなく地面に降りる。 */
function topStand(world: PortalWorld, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 2; y >= 1; y--) {
    if (standable(world, x, y, z)) return y;
  }
  return -1;
}

/**
 * 島の上に降ろす。**エンドがこれ**（枠も足場も建てない）。
 *
 * **枠を建てないのが肝心。** エンドには帰りのポータルがまだ無いので
 * （本家もドラゴンを倒すまで出口は開かない）、`arrive()` を使い回すと
 * **島の真ん中に黒曜石の枠が生えて、そこからネザーへ行けてしまう。**
 *
 * 狙った列に地面が無ければ、**近い順に `END_SEARCH` マスまで**探す。
 * 見つからなければ null（呼ぶ側が保険の高さに落とす）。
 */
export function landOnGround(world: PortalWorld, tx: number, tz: number): Arrival | null {
  let best: Arrival | null = null;
  let bestScore = Infinity;
  for (let z = tz - END_SEARCH; z <= tz + END_SEARCH; z++) {
    for (let x = tx - END_SEARCH; x <= tx + END_SEARCH; x++) {
      const score = (x - tx) * (x - tx) + (z - tz) * (z - tz);
      if (score >= bestScore) continue;
      const y = topStand(world, x, z);
      if (y < 0) continue;
      bestScore = score;
      best = { x: x + 0.5, y, z: z + 0.5, built: false };
    }
  }
  return best;
}

/**
 * 1 回ぶんの旅程。**「どの次元へ」「どのマスを目指すか」がここで決まりきる**ので、
 * `main.ts` は受け取った値を貼るだけで済む。
 */
export interface Trip {
  readonly to: DimensionId;
  /** 通ったポータル（出る場所の決め方が種類で変わる）。 */
  readonly here: PortalHere;
  /** 行き先で目指すマス。 */
  readonly x: number;
  readonly z: number;
  /** 出る高さの見当。 */
  readonly yHint: number;
}

/**
 * 通ったポータルから旅程を決める。**次元の対応も座標の移し方もこの 1 本。**
 *
 * - ネザー ↔ オーバーワールドは **1:8 で座標を移す**（`linkScale`）
 * - エンドは **島の中心に固定**（`endgen.ts` の `END_SPAWN`）。
 *   掛け算で移すと、要塞が原点から遠いときに**島の外の虚空に出て即死する**
 * - エンドから戻るときも掛け算をしない（島の中心は原点なので、掛けても意味が無い）
 */
export function planTravel(
  from: DimensionId,
  here: PortalHere,
  x: number,
  y: number,
  z: number,
): Trip {
  const to = portalTarget(from, here.kind);
  if (here.kind === "end") {
    // **行きだけ場所が決まっている。** 帰り（エンド → オーバーワールド）は
    // いまの座標をそのまま使う（島の中心は原点なので、原点のあたりに出る）。
    const spot = to === END ? END_SPAWN : { x: Math.floor(x), z: Math.floor(z), y: Math.floor(y) };
    return { to, here, x: spot.x, z: spot.z, yHint: spot.y };
  }
  const spot = linkedSpot(x, z, linkScale(from, to));
  return { to, here, x: spot.x, z: spot.z, yHint: Math.floor(y) };
}

/**
 * 旅程どおりに出る場所を決める。**種類で分かれるのはここ 1 か所だけ。**
 *
 * ネザーポータルは「探して、無ければ建てる」（`arrive`）、
 * エンドポータルは「島の上に降ろす」（`landOnGround`）。
 */
export function arriveThrough(world: PortalWorld, trip: Trip): Arrival {
  if (trip.here.kind === "nether") {
    return arrive(world, trip.x, trip.z, trip.yHint, trip.here.axis);
  }
  return (
    landOnGround(world, trip.x, trip.z) ?? {
      x: trip.x + 0.5,
      y: trip.yHint,
      z: trip.z + 0.5,
      built: false,
    }
  );
}
