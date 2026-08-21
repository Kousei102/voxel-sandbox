import { readFileSync } from "node:fs";
import { AIR, BEDROCK, NO_SUPPORT, canSupport, oppositeFace, supportFace } from "../src/blocks";
import { WORLD_HEIGHT } from "../src/constants";
import { OFFSETS, SKY_LIGHT } from "../src/lighting";
import type { World } from "../src/world";

/**
 * `getVoxel` / `getLight` / `hasColumn` だけを持つ試験場。
 * 当たり判定・湧き・落ちたアイテムが `World` に聞くのはこの 3 つだけなので、
 * `World` を丸ごと立ち上げずに済む（`physics.test.ts` と同じ理由）。
 *
 * **`mobs.test.ts` と `drops.test.ts` で共有すること。** 写して 2 か所にすると、
 * 片方だけ直したときに「モブは正しいのにアイテムだけ落ちない」形の差が入り込む
 * （`test/geometry.ts` を共有しているのと同じ理由）。
 */
export class Arena {
  private readonly cells = new Map<number, number>();
  /** 一律のスカイライト。0 のままなら受動モブは 1 体も湧かない。 */
  sky = 0;
  block = 0;
  /**
   * ボクセルの用意できていない列。**ここに入れた列では物理を回してはいけない**
   * （`getVoxel` が AIR を返すので、回すと世界を突き抜けて落ちる）。
   * 空なら全部が用意済み。キーは `"cx,cz"`。
   */
  readonly missingColumns = new Set<string>();

  private key(x: number, y: number, z: number): number {
    return ((x + 512) * 1024 + (z + 512)) * 128 + y;
  }

  fill(
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
    id: number,
  ): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.cells.set(this.key(x, y, z), id);
      }
    }
  }

  getVoxel(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= WORLD_HEIGHT) return AIR;
    return this.cells.get(this.key(x, y, z)) ?? AIR;
  }

  getLight(_x: number, _y: number, _z: number, channel = SKY_LIGHT): number {
    return channel === SKY_LIGHT ? this.sky : this.block;
  }

  hasColumn(cx = 0, cz = 0): boolean {
    return !this.missingColumns.has(`${cx},${cz}`);
  }

  asWorld(): World {
    return this as unknown as World;
  }
}

/**
 * 書き込める試験場。**`PortalWorld` の 2 つ（`getVoxel` / `setVoxel`）だけ**を持つので、
 * 本物の `World` と取り違えようがない（`portals.ts` / `portaltravel.ts` / `beds.ts` は
 * どれも `World` を丸ごと受け取らない）。
 *
 * **`test/portals.test.ts` と `test/portaltravel.test.ts` で共有すること。**
 * 写して 2 か所にすると、片方だけ直したときに「点火は通るのに移動だけ落ちる」形の
 * 差が入り込む（`Arena` を共有しているのと同じ理由）。
 */
export class Slab {
  private readonly voxels = new Map<string, number>();
  /** 書き込みを断る列（未読み込みの列の代わり）。キーは `"cx,cz"`。 */
  readonly frozenColumns = new Set<string>();

  getVoxel(x: number, y: number, z: number): number {
    return this.voxels.get(`${x},${y},${z}`) ?? AIR;
  }

  setVoxel(x: number, y: number, z: number, id: number): boolean {
    if (this.frozenColumns.has(`${x >> 4},${z >> 4}`)) return false;
    this.voxels.set(`${x},${y},${z}`, id);
    return true;
  }

  /** 直方体を埋める（両端を含む）。 */
  fill(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, id: number): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.voxels.set(`${x},${y},${z}`, id);
      }
    }
  }

  /**
   * 支えのある所か。**`World.canPlaceAt()` と同じ式**（`supportFace` → 反対の面が
   * 埋まっているか）。写しているのはここ 1 か所だけで、見ている表は本物と同じ
   * （`blocks.ts` の `canSupport`）。
   */
  canPlaceAt(x: number, y: number, z: number, id: number): boolean {
    const face = supportFace(id);
    if (face === NO_SUPPORT) return true;
    const [dx, dy, dz] = OFFSETS[face];
    return canSupport(this.getVoxel(x + dx, y + dy, z + dz), oppositeFace(face));
  }

  /** 置いてあるマスの数（足場や枠が本当に書かれたかを数える）。 */
  get filled(): number {
    let n = 0;
    for (const id of this.voxels.values()) if (id !== AIR) n++;
    return n;
  }
}

/**
 * 決まった順で同じ数列を返す乱数。湧きと AI のテストを再現できるようにする。
 *
 * **1 本を回し続けること。** 1 件ごとに `seeded(...)` を作り直すと、
 * 線形合同法の 1 個目が種に引きずられて全部同じ側に転ぶ
 * （確率 0.6 のドロップが 200 回とも当たって通った実例がある）。
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * ソースを**コメントを落として**読む。見張りのテスト（`src/**` に何が書かれているか）は
 * これを通すこと。
 *
 * **生のまま探すと、自分で書いた説明が引っかかります。** 実際に 2 度踏みました ——
 * `portals.ts` に「次元の話は 1-6 でやる」と書いたら `dimension` に、
 * `world.ts` に「中で `new WorldGen()` していると」と書いたらその語に当たって、
 * **コードは正しいのにテストだけが赤く**なりました。
 */
export function sourceOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}
