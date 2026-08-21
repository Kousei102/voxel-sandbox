import { CHUNK_SIZE } from "./constants";

/**
 * 構造物の器。**ネザー要塞・要塞・エンドの黒曜石の柱が全部これに乗ります。**
 *
 * `worldgen.ts` の `applyTrees()`（自分の列と隣接 8 列の木を毎回スタンプし直す）の一般化です。
 * **保留マップを持たず、毎回決定的に計算し直す**のが肝心 ——
 * チャンクはどの順番で・何度生成されてもよいので、
 * 「隣を先に作っておかないと欠ける」形にしてはいけません。
 *
 * **純粋です。** three も DOM も乱数（`Math.random`）も出てきません
 * （`test/structures.test.ts` が見張っています）。
 */

/** 構造物 1 個の置き場所。 */
export interface Placement {
  readonly def: StructureDef;
  /** 基準点（ワールド座標）。`build()` はここを原点に考える。 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** ブロックを 1 個書き込む。**チャンクの外なら黙って捨てられる。** */
export type Put = (x: number, y: number, z: number, id: number) => void;

/**
 * 基準点からの広がり（ワールド単位）。**これを小さく申告すると端が欠けます** ——
 * どのチャンクに掛かりうるかをこの値だけで決めているので、
 * `build()` がここより外へ書いても届きません。
 */
export interface Extent {
  /** ±X 方向。 */
  readonly x: number;
  /** 基準点から上へ。**下へは伸ばせない**（地面に建てるものなので）。 */
  readonly up: number;
  /** ±Z 方向。 */
  readonly z: number;
}

export interface StructureDef {
  readonly name: string;
  /**
   * 何列（チャンク）ごとに 1 個試すか。**この正方形のグリッド 1 マスに最大 1 個**で、
   * 場所はマスの中で散らします（規則正しく並ばないように）。
   */
  readonly spacing: number;
  /** 試したうち実際に建つ割合 0..1。1 なら必ず建つ。 */
  readonly chance: number;
  readonly extent: Extent;
  /** 同じ座標でも構造物ごとに違う場所へ散らすための種。**種類ごとに変えること。** */
  readonly salt: number;
  /** 地面からいくつ上に基準点を置くか（既定 1 = 地表の 1 つ上）。 */
  readonly lift?: number;
  /** 中身を書き込む。**`put` はチャンクの外を勝手に捨てる**ので、全体を素直に書けばよい。 */
  build(place: Placement, put: Put): void;
}

/** 座標から決まる 0..1 の擬似乱数。`worldgen.ts` の `hash2` と同じ形。 */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 負数でも下へ丸める割り算。**`Math.floor(a / b)` を素直に書くと -0.1 が 0 になる。** */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/**
 * そのチャンクに**重なりうる**構造物を、決定的に列挙する。
 *
 * **`ground` を呼ぶのは「建つと決まった 1 個につき 1 回」だけ**にしてあります ——
 * `heightAt()` は 1 列 256 回呼ばれるほど重いので、候補ごとに地面を測ると
 * チャンク生成の費用が跳ねます。**基準点 1 点の高さで構造物全体の高さが決まる**
 * （建物ごと地面に合わせる）のは Minecraft と同じ割り切りです。
 */
export function placementsFor(
  defs: readonly StructureDef[],
  seed: number,
  cx: number,
  cz: number,
  ground: (x: number, z: number) => number,
): Placement[] {
  const out: Placement[] = [];
  const loX = cx * CHUNK_SIZE;
  const hiX = loX + CHUNK_SIZE - 1;
  const loZ = cz * CHUNK_SIZE;
  const hiZ = loZ + CHUNK_SIZE - 1;

  for (const def of defs) {
    const cell = def.spacing * CHUNK_SIZE;
    // グリッドのマス g が届きうる範囲は [g*cell - extent, g*cell + cell - 1 + extent]。
    // これが [lo, hi] と重なる g だけを見る。
    const gxMin = floorDiv(loX - cell + 1 - def.extent.x, cell);
    const gxMax = floorDiv(hiX + def.extent.x, cell);
    const gzMin = floorDiv(loZ - cell + 1 - def.extent.z, cell);
    const gzMax = floorDiv(hiZ + def.extent.z, cell);

    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        if (hash2(gx, gz, seed ^ def.salt) >= def.chance) continue;
        // マスの中で散らす。**軸ごとに別の種を使うこと**（同じ種だと x と z が
        // 同じ値になり、構造物が斜めの線の上に並ぶ）。
        const x = gx * cell + Math.floor(hash2(gx, gz, seed ^ (def.salt + 1)) * cell);
        const z = gz * cell + Math.floor(hash2(gx, gz, seed ^ (def.salt + 2)) * cell);
        // ここで初めて地面を測る（建つと決まった 1 個につき 1 回）。
        const y = ground(x, z) + (def.lift ?? 1);
        out.push({ def, x, y, z });
      }
    }
  }
  return out;
}

/**
 * 列挙した構造物のうち、このチャンクに掛かる部分を `data` に書き込む。
 * 書き込んだマス数を返す。
 *
 * **列挙（`placementsFor`）と分けてあるのは費用のため。** 1 つの列は 8 段ぶん
 * `generateChunk` されるので、ここで毎回列挙すると**地面を測る回数が 8 倍**になります。
 * `worldgen.ts` は列のキャッシュ（`ColumnData`）に列挙結果を持たせて、列につき 1 回にしています
 * （木が `ColumnData.trees` に載っているのとまったく同じ形）。
 *
 * **隣のチャンクを作るときは同じ構造物をもう一度スタンプします。** 無駄に見えますが、
 * 保留マップを持たずに済むぶん「どの順に生成しても同じ地形」が無条件に成り立ちます。
 */
export function stampPlacements(
  places: readonly Placement[],
  cx: number,
  cy: number,
  cz: number,
  data: Uint8Array,
): number {
  if (places.length === 0) return 0;

  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  let written = 0;

  for (const place of places) {
    // 高さが掛からない段は `build()` ごと飛ばす（地面より上の段だけが仕事をする）。
    if (place.y > baseY + CHUNK_SIZE - 1) continue;
    if (place.y + place.def.extent.up < baseY) continue;

    place.def.build(place, (x, y, z, id) => {
      const lx = x - baseX;
      const ly = y - baseY;
      const lz = z - baseZ;
      if (lx < 0 || ly < 0 || lz < 0) return;
      if (lx >= CHUNK_SIZE || ly >= CHUNK_SIZE || lz >= CHUNK_SIZE) return;
      data[(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
      written++;
    });
  }
  return written;
}
