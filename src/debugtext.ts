/**
 * F3 のデバッグ表示（文字列を組み立てるだけ）。**`main.ts` から出した「判断」**で、
 * 何をどんな桁で並べるかはここが持つ。`ui.ts` は受け取った文字列を貼るだけ。
 *
 * three も DOM も出てこないのでヘッドレスで確かめられる（`test/debugtext.test.ts`）。
 * **受け取るのは器そのものではなく、必要な値を持つ何か**（`session.ts` と同じ作法）。
 */

import { blockName } from "./blocks";
import { CHUNK_BITS } from "./constants";
import { itemName, NO_ITEM } from "./items";
import { breakTime, canHarvest } from "./mining";
import { MAX_HEALTH, MAX_HUNGER } from "./vitals";

export interface DebugSources {
  readonly fps: number;
  readonly player: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly flying: boolean;
    readonly onGround: boolean;
    readonly inLiquid: boolean;
    /** 浸かっている液体のブロック ID（浸かっていなければ何でもよい）。 */
    readonly liquid: number;
  };
  readonly stats: { readonly chunks: number; readonly queued: number; readonly triangles: number };
  /** 改変したマスの数（`countEdits()` の結果）。 */
  readonly edits: number;
  readonly dayNight: { clock(): string; readonly brightness: number };
  readonly creative: boolean;
  /** いま居る次元の名前（`dims.nameOf()`）。 */
  readonly dimension: string;
  /**
   * バイオームの名前。**オーバーワールドの値**（種だけ同じ生成器から引く）なので、
   * ネザーに居るときも出るが、そこの地形とは関係ない。
   */
  readonly biome: string;
  readonly counts: {
    readonly mobs: number;
    readonly drops: number;
    readonly furnaces: number;
    readonly chests: number;
    readonly shots: number;
  };
  readonly vitals: {
    readonly health: number;
    readonly hunger: number;
    readonly poisoned: boolean;
    readonly airFraction: number;
    readonly burning: boolean;
  };
  /** 手に持っているアイテム（`inventory.selectedItem`）。 */
  readonly held: number;
  readonly hit: { readonly id: number; readonly block: { x: number; y: number; z: number } } | null;
}

/** F3 に出す文字列。改行 1 つが 1 行。 */
export function debugText(s: DebugSources): string {
  const { x, y, z } = s.player.position;
  const { counts, vitals, hit } = s;
  return [
    `${s.fps.toFixed(0)} fps`,
    `xyz ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`,
    `chunk ${Math.floor(x) >> CHUNK_BITS} ${Math.floor(z) >> CHUNK_BITS}` +
      `  loaded ${s.stats.chunks}  queue ${s.stats.queued}`,
    `tris ${s.stats.triangles.toLocaleString()}  edits ${s.edits}`,
    `time ${s.dayNight.clock()}  light ${(s.dayNight.brightness * 100).toFixed(0)}%` +
      `  ${s.creative ? "creative" : "survival"}  dim ${s.dimension}`,
    `biome ${s.biome}  mobs ${counts.mobs}  drops ${counts.drops}  furnaces ${counts.furnaces}` +
      `  chests ${counts.chests}  shots ${counts.shots}`,
    `hp ${vitals.health}/${MAX_HEALTH}  food ${vitals.hunger}/${MAX_HUNGER}` +
      `${vitals.poisoned ? " (毒)" : ""}  air ${(vitals.airFraction * 100).toFixed(0)}%`,
    stance(s),
    `hand ${s.held === NO_ITEM ? "-" : itemName(s.held)}`,
    `target ${hit ? `${blockName(hit.id)} (${hit.block.x}, ${hit.block.y}, ${hit.block.z})` : "-"}` +
      (hit ? `  ${formatBreakTime(hit.id, s.held)}` : ""),
  ].join("\n");
}

/** 立っているか・浸かっているか・燃えているか。 */
function stance(s: DebugSources): string {
  const { player, vitals } = s;
  const base = player.flying ? "fly" : player.onGround ? "ground" : "air";
  return (
    base +
    (player.inLiquid ? ` / ${blockName(player.liquid)}` : "") +
    (vitals.burning ? " / 炎上" : "")
  );
}

/** いま持っている道具で何秒かかるか。**掘れても落ちないことがある**ので、それも出す。 */
export function formatBreakTime(blockId: number, tool: number): string {
  const time = breakTime(blockId, tool);
  if (!Number.isFinite(time)) return "掘れない";
  return `${time.toFixed(2)}s${canHarvest(blockId, tool) ? "" : " (落ちない)"}`;
}
