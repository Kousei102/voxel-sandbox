import { blockHardness, blockMinTier, blockTool, isBreakable } from "./blocks";
import { NO_ITEM, toolOf } from "./items";

/**
 * 採掘にかかる時間。Minecraft の式に合わせてある。
 *
 *   時間 = 硬さ × (適正なら 1.5 : そうでなければ 5) / 道具の速さ
 *
 * 例: 石(1.5) を素手で 7.5 秒、木のツルハシ(速さ 2)で 1.13 秒。
 * 「適正」とは道具の種類が合っていて、かつ階層が minTier 以上であること。
 * 種類だけ合っていて階層が足りない道具は、速くはなるが何も落とさない。
 */
export const HARVEST_FACTOR = 1.5;
export const MISMATCH_FACTOR = 5;

/** その道具でブロックを壊したときアイテムが出るか。 */
export function canHarvest(blockId: number, itemId: number): boolean {
  if (!isBreakable(blockId)) return false;
  const required = blockTool(blockId);
  if (required === null) return true;
  const tool = toolOf(itemId);
  if (blockMinTier(blockId) === 0) return true;
  return tool !== null && tool.kind === required && tool.tier >= blockMinTier(blockId);
}

/** 道具がブロックの種類に合っていれば速さの倍率、合っていなければ 1。 */
export function toolSpeed(blockId: number, itemId: number): number {
  const required = blockTool(blockId);
  const tool = toolOf(itemId);
  if (required === null || tool === null || tool.kind !== required) return 1;
  return tool.speed;
}

/** 秒。壊せないブロックは Infinity。 */
export function breakTime(blockId: number, itemId = NO_ITEM): number {
  if (!isBreakable(blockId)) return Number.POSITIVE_INFINITY;
  const hardness = blockHardness(blockId);
  if (hardness <= 0) return 0;
  const factor = canHarvest(blockId, itemId) ? HARVEST_FACTOR : MISMATCH_FACTOR;
  return (hardness * factor) / toolSpeed(blockId, itemId);
}

/**
 * 採掘の進行。狙う先を変えたら進み具合を捨てる（Minecraft と同じ）。
 * 描画側はここの progress を見るだけにして、判定を散らさない。
 */
export class Mining {
  /** 0..1。1 で破壊。 */
  progress = 0;
  /** 掘っている座標。掘っていなければ null。 */
  target: { x: number; y: number; z: number } | null = null;
  private blockId = 0;
  private itemId = NO_ITEM;

  /** ひび割れの段階 0..9（Minecraft と同じ 10 段階）。掘っていなければ -1。 */
  get stage(): number {
    if (!this.target || this.progress <= 0) return -1;
    return Math.min(9, Math.floor(this.progress * 10));
  }

  reset(): void {
    this.progress = 0;
    this.target = null;
  }

  /**
   * 掘り進める。壊し切ったら true を返す（呼び出し側がブロックを消す）。
   * 狙いが外れている・道具が変わった場合は進行をリセットする。
   */
  update(
    dt: number,
    target: { x: number; y: number; z: number } | null,
    blockId: number,
    itemId: number,
  ): boolean {
    if (!target || !isBreakable(blockId)) {
      this.reset();
      return false;
    }
    const moved =
      !this.target ||
      this.target.x !== target.x ||
      this.target.y !== target.y ||
      this.target.z !== target.z ||
      this.blockId !== blockId ||
      this.itemId !== itemId;
    if (moved) {
      this.progress = 0;
      this.target = { x: target.x, y: target.y, z: target.z };
      this.blockId = blockId;
      this.itemId = itemId;
    }

    const time = breakTime(blockId, itemId);
    this.progress += time <= 0 ? 1 : dt / time;
    if (this.progress < 1) return false;
    this.reset();
    return true;
  }
}
