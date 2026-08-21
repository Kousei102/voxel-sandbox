import { AIR, NETHER_PORTAL, NETHER_PORTAL_Z, OBSIDIAN } from "./blocks";

/**
 * ネザーポータルの枠の判定。**判断だけのファイル**で、three も DOM も出てこない
 * （`beds.ts` / `liquids.ts` と同じ形）。
 *
 * **ここで `OBSIDIAN` と名指ししてよい理由:** `liquids.ts` が液体の名前を名指しできないのは、
 * 「どの液体が固まるか」の表が `blocks.ts` にあって、そこに聞かないと液体を足したときに
 * 忘れるからです。ポータルの枠は**表ではなくポータルの規則そのもの**で、
 * 参照する場所もここ 1 か所しかありません。
 *
 * **このファイルは次元を知りません。** 枠の形と「火が点くか」だけを見て、
 * どこへ繋がるか・通ったらどうなるかは `dimensions.ts`（1-6）の仕事です。
 */

/** `beds.ts` と同じで、`World` を丸ごとではなく要る入口だけを受ける。 */
export interface PortalWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 枠の内側の大きさ（Minecraft と同じ）。**最小は 2x3** で、
 * 上限があるのは「枠の形を探す走査を必ず止めるため」でもあります。
 */
export const MIN_WIDTH = 2;
export const MIN_HEIGHT = 3;
export const MAX_WIDTH = 21;
export const MAX_HEIGHT = 21;

/** 面が伸びる向き。`"x"` なら薄いのは Z。 */
export type PortalAxis = "x" | "z";

export interface PortalFrame {
  readonly axis: PortalAxis;
  /** 内側の幅（横のマス数）。 */
  readonly width: number;
  /** 内側の高さ。 */
  readonly height: number;
  /** 内側のマス（ワールド座標）。**点火するとここがポータルの面になる。** */
  readonly cells: readonly (readonly [number, number, number])[];
}

/** その向きのポータルのブロック ID。 */
export function portalBlock(axis: PortalAxis): number {
  return axis === "x" ? NETHER_PORTAL : NETHER_PORTAL_Z;
}

/**
 * そのブロックがポータルの面なら、その向き。違えば null。
 *
 * **`portalBlock()` の逆。表をここ 1 か所にしておくこと** —— 2 か所に書くと、
 * 向きを足したときに「点くのに通れない」形で片方だけ残る。
 */
export function portalAxis(id: number): PortalAxis | null {
  if (id === NETHER_PORTAL) return "x";
  if (id === NETHER_PORTAL_Z) return "z";
  return null;
}

/**
 * 面の中の位置（`along` = 横、`up` = 縦）をワールド座標へ。
 * **向きの違いをここ 1 か所に閉じ込める**ので、下の走査は向きを知らずに書ける
 * （2 通りを書き写すと、片方だけ直したときに「X 向きは点くのに Z 向きは点かない」になる）。
 */
function mapper(axis: PortalAxis, x: number, y: number, z: number) {
  return (along: number, up: number): [number, number, number] =>
    axis === "x" ? [x + along, y + up, z] : [x, y + up, z + along];
}

/**
 * `from` から `d` 方向へ、空きマスが何マス続くか（`limit` で打ち切る）。
 * **上限を必ず渡すこと** —— 屋外で点けようとしたときに、空を延々と数えることになる。
 */
function openRun(
  world: PortalWorld,
  at: (along: number, up: number) => [number, number, number],
  along: number,
  up: number,
  dAlong: number,
  dUp: number,
  limit: number,
): number {
  let n = 0;
  while (n < limit) {
    const [wx, wy, wz] = at(along + dAlong * (n + 1), up + dUp * (n + 1));
    if (world.getVoxel(wx, wy, wz) !== AIR) break;
    n++;
  }
  return n;
}

/** その向きで枠が成立しているか。 */
function frameOn(
  world: PortalWorld,
  x: number,
  y: number,
  z: number,
  axis: PortalAxis,
): PortalFrame | null {
  const at = mapper(axis, x, y, z);

  // 火を点けたマスから四方へ、空きが続く範囲を測る。**上限より 1 多く数える**ので、
  // 大きすぎる枠は下の範囲チェックで落ちる（数え切れずに通ることがない）。
  const left = openRun(world, at, 0, 0, -1, 0, MAX_WIDTH);
  const right = openRun(world, at, 0, 0, 1, 0, MAX_WIDTH);
  const down = openRun(world, at, 0, 0, 0, -1, MAX_HEIGHT);
  const up = openRun(world, at, 0, 0, 0, 1, MAX_HEIGHT);

  const width = left + 1 + right;
  const height = down + 1 + up;
  if (width < MIN_WIDTH || width > MAX_WIDTH) return null;
  if (height < MIN_HEIGHT || height > MAX_HEIGHT) return null;

  // 内側が全部空いているか。**十字に測っただけでは足りない** ——
  // 測った 2 本の線を外れたところに石が残っていても気付けない。
  const cells: [number, number, number][] = [];
  for (let b = -down; b <= up; b++) {
    for (let a = -left; a <= right; a++) {
      const cell = at(a, b);
      if (world.getVoxel(cell[0], cell[1], cell[2]) !== AIR) return null;
      cells.push(cell);
    }
  }

  // 縁が黒曜石か。**角は見ない**（Minecraft と同じで、四隅は空いていてもよい）。
  for (let a = -left; a <= right; a++) {
    if (!isFrame(world, at(a, -down - 1))) return null;
    if (!isFrame(world, at(a, up + 1))) return null;
  }
  for (let b = -down; b <= up; b++) {
    if (!isFrame(world, at(-left - 1, b))) return null;
    if (!isFrame(world, at(right + 1, b))) return null;
  }

  return { axis, width, height, cells };
}

function isFrame(world: PortalWorld, [x, y, z]: [number, number, number]): boolean {
  return world.getVoxel(x, y, z) === OBSIDIAN;
}

/**
 * そのマスを囲む黒曜石の枠。無ければ null。
 *
 * **渡すのは枠の内側の空きマス**（火を点けようとしている場所）です。
 * 黒曜石そのものを渡しても見つかりません —— どの面に火を点けたかは呼ぶ側が知っているので、
 * 隣の空きマスへ移してから渡してください。
 *
 * **X 向きから先に見ます。** 両方の向きで成立する形（十字に組んだ枠）では
 * X 向きが勝ちますが、そこはゲームの手触りに関わらないので決め打ちにしてあります。
 */
export function findFrame(
  world: PortalWorld,
  x: number,
  y: number,
  z: number,
): PortalFrame | null {
  if (world.getVoxel(x, y, z) !== AIR) return null;
  return frameOn(world, x, y, z, "x") ?? frameOn(world, x, y, z, "z");
}

/**
 * 枠に火を点ける。**点いたマスの数**を返す（枠が無ければ 0）。
 *
 * **書き込みが失敗しても続けること。** 未読み込みの列では `setVoxel` が黙って
 * false を返すので、そこで打ち切ると枠の半分だけが光った状態になります。
 *
 * **火打石と打ち金を持っているかはここでは見ません。** 何が火種かは `items.ts` の
 * 表（`isFireStarter()`）で、`main.ts` がそれを聞いてからここを呼びます。
 */
export function ignite(world: PortalWorld, x: number, y: number, z: number): number {
  const frame = findFrame(world, x, y, z);
  if (!frame) return 0;

  const id = portalBlock(frame.axis);
  let lit = 0;
  for (const [cx, cy, cz] of frame.cells) {
    if (world.setVoxel(cx, cy, cz, id)) lit++;
  }
  return lit;
}
