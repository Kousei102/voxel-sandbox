import { isOpaque, lightCost } from "./blocks";

/**
 * スカイライトの伝播。
 *
 * 光源は「真上に遮るものが無いボクセル」で、そこから 6 方向へ 1 マスにつき 1（水中は 3）
 * 減衰しながら広がる。洞窟の中は光源から遠いので暗くなり、入口付近だけ光が染み込む。
 *
 * Minecraft のように「真下へは減衰なし」という特例は入れていない。特例が無い分、
 * ブロックを壊したり置いたりしたときの差分更新が素直な BFS だけで書ける。
 */

/** +X -X +Y -Y +Z -Z */
const OFFSETS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export interface LightAccess {
  getVoxel(x: number, y: number, z: number): number;
  getLight(x: number, y: number, z: number): number;
  setLight(x: number, y: number, z: number, value: number): void;
}

/**
 * BFS 用のキュー。配列を作り直さず、先頭位置だけ戻して使い回す
 * （1 回の再計算で数千件積むので、毎回の確保は避けたい）。
 */
export class LightQueue {
  private readonly xs: number[] = [];
  private readonly ys: number[] = [];
  private readonly zs: number[] = [];
  private readonly levels: number[] = [];
  private head = 0;
  private tail = 0;

  x = 0;
  y = 0;
  z = 0;
  level = 0;

  get size(): number {
    return this.tail - this.head;
  }

  reset(): void {
    this.head = 0;
    this.tail = 0;
  }

  push(x: number, y: number, z: number, level = 0): void {
    this.xs[this.tail] = x;
    this.ys[this.tail] = y;
    this.zs[this.tail] = z;
    this.levels[this.tail] = level;
    this.tail++;
  }

  next(): boolean {
    if (this.head >= this.tail) return false;
    this.x = this.xs[this.head];
    this.y = this.ys[this.head];
    this.z = this.zs[this.head];
    this.level = this.levels[this.head];
    this.head++;
    return true;
  }
}

/** キューに積まれたボクセルから、より暗い隣へ光を広げる。 */
export function propagateAdd(world: LightAccess, queue: LightQueue): number {
  let visited = 0;
  while (queue.next()) {
    visited++;
    const level = world.getLight(queue.x, queue.y, queue.z);
    if (level <= 1) continue;
    for (const [dx, dy, dz] of OFFSETS) {
      const nx = queue.x + dx;
      const ny = queue.y + dy;
      const nz = queue.z + dz;
      const id = world.getVoxel(nx, ny, nz);
      if (isOpaque(id)) continue;
      const target = level - lightCost(id);
      if (target > world.getLight(nx, ny, nz)) {
        world.setLight(nx, ny, nz, target);
        queue.push(nx, ny, nz);
      }
    }
  }
  return visited;
}

/**
 * 光源が消えた場所から、その光で照らされていた範囲を消していく。
 * 途中でより明るいボクセル（別の光源から来ている）に出会ったら、
 * そこは消さずに add 側へ回して、あとで塗り直させる。
 */
export function propagateRemove(
  world: LightAccess,
  removals: LightQueue,
  additions: LightQueue,
): void {
  while (removals.next()) {
    const level = removals.level;
    for (const [dx, dy, dz] of OFFSETS) {
      const nx = removals.x + dx;
      const ny = removals.y + dy;
      const nz = removals.z + dz;
      const neighbor = world.getLight(nx, ny, nz);
      if (neighbor === 0) continue;
      if (neighbor < level) {
        world.setLight(nx, ny, nz, 0);
        removals.push(nx, ny, nz, neighbor);
      } else {
        additions.push(nx, ny, nz);
      }
    }
  }
}

export { OFFSETS };
