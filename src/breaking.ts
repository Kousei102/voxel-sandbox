/**
 * **ブロックが壊れたときに何が起きるか。** `placing.ts`（置く側）の裏返しで、
 * three も DOM も出てこないのでヘッドレスで丸ごと確かめられます。
 *
 * もとは `main.ts` の `breakBlock()` と `world.onAutoBreak` にあった判断。
 * **壊れる経路は 2 つあり、どちらも同じ規則で落とす必要があります** ——
 * 掘って壊す（`tryBreak`）と、支えを失って勝手に壊れる（`autoBreak`）。
 * 片方だけ直すと、松明を掘ったときと床を掘ったときで落ちるものが食い違い、
 * **どちらが正しいのかブラウザでしか確かめられなくなります。**
 *
 * ここが返すのは**地面に出すもの**だけで、音・消耗・保存の印は `main.ts` の仕事。
 * **乱数も呼ぶ側が作ります**（`rollDrop()` と同じ約束。`rules/items-survival.md`）。
 */

import { AIR, CHEST, FURNACE, baseBlock } from "./blocks";
import { clearBedPartner } from "./beds";
import { wearForBreaking } from "./durability";
import { settleColumn } from "./gravity";
import { rollDrops } from "./items";
import { canHarvest } from "./mining";

/** **`World` を丸ごと受け取らない**（`beds.ts` / `placing.ts` と同じ作法）。 */
export interface BreakWorld {
  getVoxel(x: number, y: number, z: number): number;
  setVoxel(x: number, y: number, z: number, id: number): boolean;
}

/**
 * 位置ごとに中身を持つ器。**受け取るのは「取り除いて中身を返すもの」だけ**なので、
 * テストは偽物を並べるだけで書けます（`session.ts` と同じ作法）。
 */
export interface BreakContainers {
  readonly furnaces: {
    remove(x: number, y: number, z: number): { item: number; count: number; damage?: number }[];
  };
  readonly chests: {
    remove(x: number, y: number, z: number): { item: number; count: number; damage?: number }[];
  };
}

/** 地面に出す 1 山。**場所までここで決めます**（足元に埋まると拾いにくい）。 */
export interface Burst {
  readonly item: number;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * 器から出た道具の傷。**掘って出たものは必ず新品**なので、`harvest()` の側では
   * 付きません（省略 = 0）。**ここは器が返した値を素通しするだけ**で、
   * 何回で尽きるかも「道具かどうか」も知りません（決めるのは `durability.ts`）。
   */
  readonly damage?: number;
}

/** 掘るときの注文。 */
export interface BreakOrder {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 壊すブロックの ID。 */
  readonly id: number;
  /** 手に持っているもの（適正かどうかを `canHarvest()` が見る）。 */
  readonly tool: number;
  readonly creative: boolean;
  /** ドロップの抽選。**乱数は呼ぶ側が作ること。** */
  readonly roll: number;
}

export interface BreakOutcome {
  /** 書き込めたか。**未読み込みの列では黙って失敗する**ので、false なら何もしない。 */
  readonly broken: boolean;
  readonly drops: readonly Burst[];
  /** 掘った消耗を足すか（クリエイティブと、壊れなかったときは false）。 */
  readonly exhaust: boolean;
  /**
   * 手に持っている道具に付ける傷（0 か 1）。**決めるのは `durability.ts`**
   * （ここは聞いて載せるだけ。クリエイティブ・素手・硬さ 0 のブロックでは 0）。
   */
  readonly wear: number;
}

const NOTHING: BreakOutcome = { broken: false, drops: [], exhaust: false, wear: 0 };

/**
 * 掘り切ったブロックを消して、地面に出すものを決める。
 *
 * **器の中身とベッドの相方はクリエイティブでも扱います**（早い return より前）——
 * 中身は集めたアイテムで壊し方によって消えてよいものではなく、相方を残すと
 * 「半分だけのベッド」ができます（`rules/beds.md`）。
 */
export function tryBreak(
  world: BreakWorld,
  containers: BreakContainers,
  order: BreakOrder,
): BreakOutcome {
  const { x, y, z, id, creative } = order;
  if (!world.setVoxel(x, y, z, AIR)) return NOTHING;
  // 掘って空けたマスの真上に砂・砂利が積まれていたら、そのぶんだけ 1 つずつ下がる。
  settleColumn(world, x, y, z);

  const drops: Burst[] = [];

  // かまどを壊したら中身も出す。点火中も同じ 1 台なので、大元の ID で見る。
  if (baseBlock(id) === FURNACE) {
    for (const held of containers.furnaces.remove(x, y, z)) {
      drops.push({
        item: held.item,
        count: held.count,
        damage: held.damage,
        x: x + 0.5,
        y: y + 0.5,
        z: z + 0.5,
      });
    }
  }
  // チェストも同じ。
  if (id === CHEST) {
    for (const held of containers.chests.remove(x, y, z)) {
      drops.push({
        item: held.item,
        count: held.count,
        damage: held.damage,
        x: x + 0.5,
        y: y + 0.5,
        z: z + 0.5,
      });
    }
  }

  // ベッドは 2 マスで 1 台。**どちらを壊しても相方も消す。**
  // ドロップは下の 1 本の経路だけを通るので、**出るベッドは 1 個**。
  clearBedPartner(world, x, y, z, id);

  if (creative) return { broken: true, drops, exhaust: false, wear: 0 };

  // **傷も落ちる／落ちないに関わらず付く**（消耗と同じで、掘った労力そのもの。
  // 適正でない道具で削っても道具は傷む）。**いくつ付くかは `durability.ts`。**
  const wear = wearForBreaking(id, order.tool, creative);
  // **消耗は落ちる／落ちないに関わらず足す**（掘った労力そのものなので、
  // 適正でない道具で削っても腹は減る）。
  if (!canHarvest(id, order.tool)) return { broken: true, drops, exhaust: true, wear };
  drops.push(...harvest(id, order.roll, x, y, z, 0.35));
  return { broken: true, drops, exhaust: true, wear };
}

/**
 * 支えを失って勝手に壊れたぶん。**壊した本人が居なくても落ちます**
 * （`World.onAutoBreak`。そのマス自身は `world.ts` が消している途中）。
 *
 * **道具は見ません** —— 松明のように「支えが消えたから落ちた」ものに
 * 適正な道具も何もないので、`tryBreak()` の `canHarvest()` は通しません。
 */
export function autoBreak(
  world: BreakWorld,
  x: number,
  y: number,
  z: number,
  id: number,
  creative: boolean,
  roll: number,
): readonly Burst[] {
  // **ここでは settleColumn() を呼ばない。** 呼ばれる時点で `world.ts` の
  // `breakUnsupported` はまだそのマスを消している途中（ブロックがまだ残っている）
  // なので、上を見ても空振りするだけ。積み直しは元の `setVoxel` の側で片付く。
  // **ベッドの相方はクリエイティブでも消すこと**（下の return より前）。
  // 相方のぶんは落とさない —— 出るベッドは 1 台につき 1 個。
  clearBedPartner(world, x, y, z, id);
  if (creative) return [];
  return harvest(id, roll, x, y, z, 0.25);
}

/**
 * **何が何山落ちるかは `items.ts` の `rollDrops()`**（ここは確率の比較を持たない）。
 *
 * **山が 2 つでも同じ場所に貼るだけ**でよい —— 地面での散らばりは `drops.ts` の
 * `burst()` が乱数で付けるので、ここで並べて置こうとしないこと。
 */
function harvest(id: number, roll: number, x: number, y: number, z: number, dy: number): Burst[] {
  return rollDrops(id, roll).map((drop) => ({
    item: drop.item,
    count: drop.count,
    x: x + 0.5,
    y: y + dy,
    z: z + 0.5,
  }));
}
