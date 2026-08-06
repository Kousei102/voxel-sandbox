import { Color, DoubleSide, MeshBasicMaterial, type IUniform, type Scene } from "three";
import {
  AIR,
  BEDROCK,
  EMISSION,
  SKY_BLOCKERS,
  blockEmission,
  blocksSky,
  NO_SUPPORT,
  canSupport,
  isOpaque,
  oppositeFace,
  supportFace,
} from "./blocks";
import { Chunk, chunkKey, localIndex } from "./chunk";
import {
  CHUNK_BITS,
  CHUNK_LAYERS,
  CHUNK_MASK,
  CHUNK_SIZE,
  DATA_DISTANCE,
  GENERATE_BUDGET_MS,
  MAX_COLUMN_STEPS_PER_FRAME,
  MAX_LIGHT,
  MAX_MESHES_PER_FRAME,
  MESH_BUDGET_MS,
  RENDER_DISTANCE,
  UNLOAD_DISTANCE,
  WORLD_HEIGHT,
} from "./constants";
import {
  BLOCK_LIGHT,
  LightQueue,
  OFFSETS,
  SKY_LIGHT,
  propagateAdd,
  propagateRemove,
  type LightChannel,
} from "./lighting";
import { PAD_SIZE, PAD_VOLUME, buildChunkMesh } from "./mesher";
import { useTerrainLighting } from "./terrainshader";
import { WorldGen } from "./worldgen";

export type EditMap = Map<string, Map<number, number>>;

export interface WorldStats {
  chunks: number;
  queued: number;
  triangles: number;
}

export class World {
  readonly gen: WorldGen;
  private readonly chunks = new Map<string, Chunk>();
  /** ボクセルを生成済みの列。 */
  private readonly columns = new Set<string>();
  /** メッシュ化を依頼済みの列（描画距離に入った列だけ）。 */
  private readonly meshedColumns = new Set<string>();
  /** 生成途中の列 -> 次に作る段。 */
  private readonly partialColumns = new Map<string, number>();
  private readonly meshQueue: string[] = [];
  /** プレイヤーが置いた／壊したブロック。チャンクキー -> ローカル index -> ブロック ID。 */
  private readonly edits: EditMap = new Map();
  private readonly pad = new Uint8Array(PAD_VOLUME);
  private readonly skyPad = new Uint8Array(PAD_VOLUME);
  private readonly blockPad = new Uint8Array(PAD_VOLUME);
  private readonly neighbors: (Chunk | null)[] = new Array(27).fill(null);
  /** 列ごとの「空が見える一番下の高さ」16x16。 */
  private readonly skyHeights = new Map<string, Uint8Array>();
  private readonly addQueue = new LightQueue();
  private readonly removeQueue = new LightQueue();
  private columnQueue: Array<[number, number]> = [];
  private lastCenter: [number, number] = [Number.NaN, Number.NaN];
  private triangles = 0;

  /**
   * 支えを失って勝手に壊れたブロックの知らせ（`breakUnsupported`）。
   * **プレイヤーが直接壊したぶんでは鳴らない**（あちらは `main.ts` の `breakBlock` が落とす）。
   * `main.ts` が受けて地面にアイテムを落とす。
   */
  onAutoBreak?: (wx: number, wy: number, wz: number, id: number) => void;

  /** 昼夜の色。シェーダの uniform としてそのまま渡すので、中身だけ差し替える。 */
  private readonly daylight = { value: new Color(1, 1, 1) };

  private readonly opaqueMaterial = new MeshBasicMaterial({ vertexColors: true, fog: true });
  private readonly translucentMaterial = new MeshBasicMaterial({
    vertexColors: true,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });

  constructor(
    private readonly scene: Scene,
    seed: number,
    edits?: EditMap,
  ) {
    this.gen = new WorldGen(seed);
    if (edits) this.edits = edits;
    useTerrainLighting(this.opaqueMaterial, this.daylight);
    useTerrainLighting(this.translucentMaterial, this.daylight);
  }

  get seed(): number {
    return this.gen.seed;
  }

  /**
   * 昼夜による全体の明るさ。スカイライトにだけ掛かるので、
   * 焼き込んだ光量はそのままに、再メッシュ化なしで夜にできる。
   * **時刻ごとに頂点色を焼き直す実装にしないこと。**
   */
  setDaylight(tint: Color): void {
    this.daylight.value.copy(tint);
  }

  /**
   * 昼夜の色の uniform。モブのマテリアルにも `useTerrainLighting()` で渡す。
   *
   * **同じオブジェクトを共有すること**（値をコピーした別のオブジェクトにすると、
   * モブだけ足元のブロックと違う明るさになる瞬間ができる）。
   */
  daylightUniform(): IUniform<Color> {
    return this.daylight;
  }

  /**
   * その列のボクセルが生成済みか。
   *
   * **未生成の列では `getVoxel` が AIR を返す**（下の `getVoxel` を参照）ので、
   * 確かめずにモブを湧かせると空中に出て、あとから地形が生えて閉じ込められる。
   */
  hasColumn(cx: number, cz: number): boolean {
    return this.columns.has(`${cx},${cz}`);
  }

  // --- ボクセルアクセス -------------------------------------------------

  getVoxel(wx: number, wy: number, wz: number): number {
    if (wy < 0) return BEDROCK;
    if (wy >= WORLD_HEIGHT) return AIR;
    const chunk = this.chunks.get(
      chunkKey(wx >> CHUNK_BITS, wy >> CHUNK_BITS, wz >> CHUNK_BITS),
    );
    if (!chunk) return AIR;
    return chunk.data[localIndex(wx & CHUNK_MASK, wy & CHUNK_MASK, wz & CHUNK_MASK)];
  }

  setVoxel(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 1 || wy >= WORLD_HEIGHT) return false;
    const cx = wx >> CHUNK_BITS;
    const cy = wy >> CHUNK_BITS;
    const cz = wz >> CHUNK_BITS;
    this.ensureColumn(cx, cz);
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return false;

    const lx = wx & CHUNK_MASK;
    const ly = wy & CHUNK_MASK;
    const lz = wz & CHUNK_MASK;
    const index = localIndex(lx, ly, lz);
    const previous = chunk.data[index];
    if (previous === id) return false;
    // 支えの要るブロックは、支えの無い場所には置かせない。
    // ここで弾いておけば「松明には必ず支えがある」が構造的に保たれる。
    if (!this.canPlaceAt(wx, wy, wz, id)) return false;

    chunk.setIndex(index, id);
    this.recordEdit(cx, cy, cz, index, id);
    this.relightSkyEdit(wx, wy, wz, previous, id);
    this.relightBlockEdit(wx, wy, wz, id);
    this.prioritize(chunkKey(cx, cy, cz));

    // 境界に接するブロックは隣のチャンクの面も変える
    if (lx === 0) this.markDirty(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cy, cz);
    if (ly === 0) this.markDirty(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.markDirty(cx, cy + 1, cz);
    if (lz === 0) this.markDirty(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cy, cz + 1);

    this.breakUnsupported(wx, wy, wz, id);
    return true;
  }

  /**
   * そのブロックを (wx,wy,wz) に置けるだけの支えがあるか。
   * 支えの向きは `supportFace`（床置きの松明なら真下、壁掛けなら壁の側）。
   *
   * 支えが未読み込みの列にあると `getVoxel` が AIR を返して「置けない」になる。
   * プレイヤーの操作では支えは必ず「今クリックしたブロック」なので読み込み済みだし、
   * セーブの復元は `createChunk` が差分を直接書くのでここを通らない。
   * それ以外の経路から呼ぶなら、先に列が揃っているか確かめること。
   */
  canPlaceAt(wx: number, wy: number, wz: number, id: number): boolean {
    const face = supportFace(id);
    if (face === NO_SUPPORT) return true;
    const [dx, dy, dz] = OFFSETS[face];
    // 支えになる側から見ると、こちらを向いた面が埋まっている必要がある
    return canSupport(this.getVoxel(wx + dx, wy + dy, wz + dz), oppositeFace(face));
  }

  /**
   * 支えを失ったブロックを壊す。**`setVoxel` で支えでなくなったときに必ず呼ぶこと。**
   * 置く側（`canPlaceAt`）と対になっていて、片方だけ直すと壁の松明が空中に残る。
   *
   * 壊れたぶんは `onAutoBreak` で外へ知らせる（`main.ts` が地面に落とす）。
   * **`World` が `drops.ts` を知らないのが肝心** —— ここはストリーミングのファイルで、
   * 落とし物の判断（何を・いくつ・クリエイティブでは落とさない）を持たせる場所ではない。
   */
  private breakUnsupported(wx: number, wy: number, wz: number, id: number): void {
    for (let face = 0; face < OFFSETS.length; face++) {
      const [dx, dy, dz] = OFFSETS[face];
      const nx = wx + dx;
      const ny = wy + dy;
      const nz = wz + dz;
      const neighbor = this.getVoxel(nx, ny, nz);
      if (neighbor === AIR) continue;
      // 隣が「こちら側」に支えを求めているなら、今の中身で支えられるか見る
      if (supportFace(neighbor) !== oppositeFace(face)) continue;
      if (canSupport(id, face)) continue;
      // **壊す前に知らせること。** あとにすると、連鎖で更に壊れたぶんと順番が入れ替わる。
      this.onAutoBreak?.(nx, ny, nz, neighbor);
      this.setVoxel(nx, ny, nz, AIR);
    }
  }

  // --- 光 ---------------------------------------------------------------

  getLight(wx: number, wy: number, wz: number, channel: LightChannel = SKY_LIGHT): number {
    // 世界の天井より上は空だけが最大光量。ブロックライトはどこにも無い。
    if (wy >= WORLD_HEIGHT) return channel === SKY_LIGHT ? MAX_LIGHT : 0;
    if (wy < 0) return 0;
    const chunk = this.chunks.get(chunkKey(wx >> CHUNK_BITS, wy >> CHUNK_BITS, wz >> CHUNK_BITS));
    if (!chunk) return 0;
    const array = channel === SKY_LIGHT ? chunk.skyLight : chunk.blockLight;
    return array[localIndex(wx & CHUNK_MASK, wy & CHUNK_MASK, wz & CHUNK_MASK)];
  }

  setLight(wx: number, wy: number, wz: number, channel: LightChannel, value: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = wx >> CHUNK_BITS;
    const cy = wy >> CHUNK_BITS;
    const cz = wz >> CHUNK_BITS;
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (!chunk) return;
    const lx = wx & CHUNK_MASK;
    const ly = wy & CHUNK_MASK;
    const lz = wz & CHUNK_MASK;
    const array = channel === SKY_LIGHT ? chunk.skyLight : chunk.blockLight;
    if (array[localIndex(lx, ly, lz)] === value) return;
    array[localIndex(lx, ly, lz)] = value;
    if (channel === BLOCK_LIGHT && value > 0) chunk.hasBlockLight = true;

    this.markRelit(chunk, cx, cy, cz);
    // 境界のボクセルの明るさは隣チャンクの面の色にも効く
    if (lx === 0) this.markRelitAt(cx - 1, cy, cz);
    if (lx === CHUNK_SIZE - 1) this.markRelitAt(cx + 1, cy, cz);
    if (ly === 0) this.markRelitAt(cx, cy - 1, cz);
    if (ly === CHUNK_SIZE - 1) this.markRelitAt(cx, cy + 1, cz);
    if (lz === 0) this.markRelitAt(cx, cy, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markRelitAt(cx, cy, cz + 1);
  }

  /**
   * 明るさが変わったチャンクをメッシュ化待ちに積む。
   * すでに dirty なものは積み直さない（BFS 中に数千回呼ばれるので O(1) で済ませる）。
   */
  private markRelit(chunk: Chunk, cx: number, cy: number, cz: number): void {
    if (chunk.dirty) return;
    chunk.dirty = true;
    if (this.meshedColumns.has(`${cx},${cz}`)) this.meshQueue.push(chunkKey(cx, cy, cz));
  }

  private markRelitAt(cx: number, cy: number, cz: number): void {
    const chunk = this.chunks.get(chunkKey(cx, cy, cz));
    if (chunk) this.markRelit(chunk, cx, cy, cz);
  }

  /**
   * 列 1 本ぶんの初期光量を求める。列のボクセルが出揃ってから呼ぶこと。
   *
   * 1 列 = 32,768 ボクセルあるので、ここは必ずチャンクの配列を直接なめる。
   * 1 マスずつ getVoxel を通すと map の探索だけで数 ms かかる。
   */
  private lightColumn(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const sky = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const column: (Chunk | null)[] = [];
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      column.push(this.chunks.get(chunkKey(cx, cy, cz)) ?? null);
    }

    // 下から上へ走査して、遮蔽ブロックを見つけるたびに上書きする（最後に残るのが一番上）。
    // 同じ走査のついでに光源も拾う（1 列 32,768 ボクセルを 2 度なめたくない）。
    const emitters: number[] = [];
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      const chunk = column[cy];
      if (!chunk) continue;
      const baseY = cy * CHUNK_SIZE;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const rowBase = ly * CHUNK_SIZE * CHUNK_SIZE;
        const height = baseY + ly + 1;
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
          const id = chunk.data[rowBase + i];
          if (SKY_BLOCKERS[id] === 1) sky[i] = height;
          // i は列内の (lz * 16 + lx)。あとで座標に戻すので、高さと組で覚えておく
          if (EMISSION[id] > 0) emitters.push(i, baseY + ly);
        }
      }
    }

    let maxSky = 0;
    let minSky = WORLD_HEIGHT;
    for (const height of sky) {
      if (height > maxSky) maxSky = height;
      if (height < minSky) minSky = height;
    }
    this.skyHeights.set(key, sky);

    // 空が見える高さより上は最大光量、それ以下は 0 から始める
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      const chunk = column[cy];
      if (!chunk) continue;
      const baseY = cy * CHUNK_SIZE;
      if (baseY >= maxSky) {
        chunk.skyLight.fill(MAX_LIGHT);
      } else if (baseY + CHUNK_SIZE <= minSky) {
        chunk.skyLight.fill(0);
      } else {
        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
          const wy = baseY + ly;
          const rowBase = ly * CHUNK_SIZE * CHUNK_SIZE;
          for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
            chunk.skyLight[rowBase + i] = wy >= sky[i] ? MAX_LIGHT : 0;
          }
        }
      }
      chunk.dirty = true;
    }

    this.seedColumnLight(cx, cz, sky, maxSky);
    this.seedColumnBlockLight(cx, cz, emitters);
  }

  /**
   * 列のブロックライトを作る。光源はプレイヤーが置いた松明だけなので、ふつうは
   * emitters が空で、隣の列にも光が無いので何もせずに終わる。
   */
  private seedColumnBlockLight(cx: number, cz: number, emitters: readonly number[]): void {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    this.addQueue.reset();
    for (let i = 0; i < emitters.length; i += 2) {
      const at = emitters[i];
      const wx = baseX + (at & CHUNK_MASK);
      const wz = baseZ + (at >> CHUNK_BITS);
      const wy = emitters[i + 1];
      this.setLight(wx, wy, wz, BLOCK_LIGHT, blockEmission(this.getVoxel(wx, wy, wz)));
      this.addQueue.push(wx, wy, wz);
    }

    // 隣の列に既にある光を、この列へ流し込む
    this.seedBlockWall(cx - 1, cz, CHUNK_SIZE - 1, -1);
    this.seedBlockWall(cx + 1, cz, 0, -1);
    this.seedBlockWall(cx, cz - 1, -1, CHUNK_SIZE - 1);
    this.seedBlockWall(cx, cz + 1, -1, 0);

    if (this.addQueue.size > 0) propagateAdd(this, this.addQueue, BLOCK_LIGHT);
  }

  /**
   * 隣の列の面 1 枚から、光っているマスを種にする（ブロックライト版）。
   * 光源が無い列がほとんどなので、hasBlockLight が立っていない段はまるごと飛ばす。
   */
  private seedBlockWall(cx: number, cz: number, fixedX: number, fixedZ: number): void {
    if (!this.columns.has(`${cx},${cz}`)) return;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      const chunk = this.chunks.get(chunkKey(cx, cy, cz));
      if (!chunk || !chunk.hasBlockLight) continue;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const lx = fixedX < 0 ? i : fixedX;
          const lz = fixedZ < 0 ? i : fixedZ;
          if (chunk.blockLight[localIndex(lx, ly, lz)] > 0) {
            this.addQueue.push(baseX + lx, cy * CHUNK_SIZE + ly, baseZ + lz);
          }
        }
      }
    }
  }

  /**
   * 横へ広げる必要がある光だけをキューに積んで拡散させる。
   *
   * 積むのは (1) この列の光源のうち、隣のマスが暗い高さにあるもの と
   * (2) 隣接する列の境界 1 マスにある光。(2) が無いと、あとから読み込まれた列に
   * 既存の列から光が流れ込まない。全部の光源を積むと数万件になるので、
   * 「隣が暗い可能性がある高さ」だけに絞る。
   */
  private seedColumnLight(
    cx: number,
    cz: number,
    sky: Uint8Array,
    maxSky: number,
  ): void {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const west = this.skyHeights.get(`${cx - 1},${cz}`);
    const east = this.skyHeights.get(`${cx + 1},${cz}`);
    const north = this.skyHeights.get(`${cx},${cz - 1}`);
    const south = this.skyHeights.get(`${cx},${cz + 1}`);

    /** 隣のマスの「空が見える高さ」。未生成の列は自分の列の最大値で代用する。 */
    const neighborSky = (lx: number, lz: number): number => {
      if (lx < 0) return west ? west[lz * CHUNK_SIZE + CHUNK_SIZE - 1] : maxSky;
      if (lx >= CHUNK_SIZE) return east ? east[lz * CHUNK_SIZE] : maxSky;
      if (lz < 0) return north ? north[(CHUNK_SIZE - 1) * CHUNK_SIZE + lx] : maxSky;
      if (lz >= CHUNK_SIZE) return south ? south[lx] : maxSky;
      return sky[lz * CHUNK_SIZE + lx];
    };

    this.addQueue.reset();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const top = sky[lz * CHUNK_SIZE + lx];
        // 隣がこの高さより高ければ、そこは暗いので光を渡す必要がある
        let ceiling = top;
        const around = [
          neighborSky(lx - 1, lz),
          neighborSky(lx + 1, lz),
          neighborSky(lx, lz - 1),
          neighborSky(lx, lz + 1),
        ];
        for (const height of around) {
          if (height - 1 > ceiling) ceiling = height - 1;
        }
        if (ceiling >= WORLD_HEIGHT) ceiling = WORLD_HEIGHT - 1;
        for (let y = top; y <= ceiling; y++) this.addQueue.push(baseX + lx, y, baseZ + lz);
      }
    }

    // 隣の列の壁面（この列に接する 1 マス）で光っているところ
    this.seedWall(cx - 1, cz, CHUNK_SIZE - 1, -1, maxSky);
    this.seedWall(cx + 1, cz, 0, -1, maxSky);
    this.seedWall(cx, cz - 1, -1, CHUNK_SIZE - 1, maxSky);
    this.seedWall(cx, cz + 1, -1, 0, maxSky);

    propagateAdd(this, this.addQueue);
  }

  /**
   * 隣の列の面 1 枚を走査して、光っているマスを種にする。
   * lx か lz のどちらかを -1 にすると、その軸は 0..15 を全部見る。
   */
  private seedWall(cx: number, cz: number, fixedX: number, fixedZ: number, ceiling: number): void {
    if (!this.columns.has(`${cx},${cz}`)) return;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      const baseY = cy * CHUNK_SIZE;
      if (baseY > ceiling) break;
      const chunk = this.chunks.get(chunkKey(cx, cy, cz));
      if (!chunk) continue;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const wy = baseY + ly;
        if (wy > ceiling) break;
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const lx = fixedX < 0 ? i : fixedX;
          const lz = fixedZ < 0 ? i : fixedZ;
          if (chunk.skyLight[localIndex(lx, ly, lz)] > 0) {
            this.addQueue.push(baseX + lx, wy, baseZ + lz);
          }
        }
      }
    }
  }

  /** ブロックを置いた／壊したときに、その周辺のスカイライトを作り直す。 */
  private relightSkyEdit(wx: number, wy: number, wz: number, before: number, after: number): void {
    const sky = this.skyHeights.get(`${wx >> CHUNK_BITS},${wz >> CHUNK_BITS}`);
    if (!sky) return;
    const index = (wz & CHUNK_MASK) * CHUNK_SIZE + (wx & CHUNK_MASK);
    const height = sky[index];

    this.addQueue.reset();
    this.removeQueue.reset();

    if (blocksSky(after) && wy >= height) {
      // 空への口が塞がった: そこから下の光源が消える
      for (let y = height; y <= wy; y++) {
        const level = this.getLight(wx, y, wz, SKY_LIGHT);
        if (level === 0) continue;
        this.setLight(wx, y, wz, SKY_LIGHT, 0);
        this.removeQueue.push(wx, y, wz, level);
      }
      sky[index] = wy + 1;
    } else if (!blocksSky(after) && blocksSky(before) && wy === height - 1) {
      // 一番上の蓋が外れた: 新しい高さまでが光源になる
      let next = 0;
      for (let y = wy; y >= 0; y--) {
        if (blocksSky(this.getVoxel(wx, y, wz))) {
          next = y + 1;
          break;
        }
      }
      sky[index] = next;
      for (let y = next; y <= wy; y++) {
        this.setLight(wx, y, wz, SKY_LIGHT, MAX_LIGHT);
        this.addQueue.push(wx, y, wz);
      }
    }

    if (isOpaque(after)) {
      const level = this.getLight(wx, wy, wz, SKY_LIGHT);
      if (level > 0) {
        this.setLight(wx, wy, wz, SKY_LIGHT, 0);
        this.removeQueue.push(wx, wy, wz, level);
      }
    } else {
      // 掘った穴には周りから光が流れ込む
      for (const [dx, dy, dz] of OFFSETS) this.addQueue.push(wx + dx, wy + dy, wz + dz);
    }

    propagateRemove(this, this.removeQueue, this.addQueue, SKY_LIGHT);
    propagateAdd(this, this.addQueue, SKY_LIGHT);
  }

  /**
   * ブロックライトの差分更新。スカイライトと違って光源の位置がブロックそのものなので、
   * 「今そこにある光をいったん全部消してから、改めて広げ直す」だけで済む。
   *
   * 消す BFS を先に回すこと。増やす側だけでは、松明を壊したときに光が残る。
   */
  private relightBlockEdit(wx: number, wy: number, wz: number, after: number): void {
    const emit = blockEmission(after);
    const current = this.getLight(wx, wy, wz, BLOCK_LIGHT);
    // 光源でもなく、そこも周りも暗いなら、何をしてもブロックライトは変わらない。
    // 松明を置かない限りここで抜けるので、ふだんの設置・破壊に余計な費用が乗らない。
    if (emit === 0 && current === 0 && !this.hasBlockLightAround(wx, wy, wz)) return;

    this.addQueue.reset();
    this.removeQueue.reset();

    if (current > 0) {
      this.setLight(wx, wy, wz, BLOCK_LIGHT, 0);
      this.removeQueue.push(wx, wy, wz, current);
      propagateRemove(this, this.removeQueue, this.addQueue, BLOCK_LIGHT);
    }

    if (emit > 0) {
      this.setLight(wx, wy, wz, BLOCK_LIGHT, emit);
      this.addQueue.push(wx, wy, wz);
    } else if (!isOpaque(after)) {
      for (const [dx, dy, dz] of OFFSETS) this.addQueue.push(wx + dx, wy + dy, wz + dz);
    }

    propagateAdd(this, this.addQueue, BLOCK_LIGHT);
  }

  /** 隣 6 マスのどれかにブロックライトがあるか（無ければ差分更新を丸ごと省ける）。 */
  private hasBlockLightAround(wx: number, wy: number, wz: number): boolean {
    for (const [dx, dy, dz] of OFFSETS) {
      if (this.getLight(wx + dx, wy + dy, wz + dz, BLOCK_LIGHT) > 0) return true;
    }
    return false;
  }

  private recordEdit(cx: number, cy: number, cz: number, index: number, id: number): void {
    const key = chunkKey(cx, cy, cz);
    let map = this.edits.get(key);
    if (!map) {
      map = new Map();
      this.edits.set(key, map);
    }
    map.set(index, id);
  }

  private markDirty(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    chunk.dirty = true;
    this.prioritize(key);
  }

  private prioritize(key: string): void {
    const at = this.meshQueue.indexOf(key);
    if (at >= 0) this.meshQueue.splice(at, 1);
    this.meshQueue.unshift(key);
  }

  // --- 生成とメッシュ化 -------------------------------------------------

  private createChunk(cx: number, cy: number, cz: number): void {
    const key = chunkKey(cx, cy, cz);
    if (this.chunks.has(key)) return;
    const chunk = new Chunk(cx, cy, cz);
    this.gen.generateChunk(cx, cy, cz, chunk.data);
    const stored = this.edits.get(key);
    if (stored) {
      for (const [index, id] of stored) chunk.data[index] = id;
    }
    chunk.recountSolid();
    this.chunks.set(key, chunk);
  }

  /** 縦 1 列（CHUNK_LAYERS 個）をその場で生成する。生成済みなら何もしない。 */
  ensureColumn(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (this.columns.has(key)) return;
    for (let cy = this.partialColumns.get(key) ?? 0; cy < CHUNK_LAYERS; cy++) {
      this.createChunk(cx, cy, cz);
    }
    this.partialColumns.delete(key);
    this.columns.add(key);
    this.lightColumn(cx, cz);
  }

  /**
   * 列を 1 段だけ生成する。1 列 8 段をまとめて作ると 1 フレームに 7ms 近く食うので、
   * ストリーミング中は段単位に割って時間予算に収める。列が揃ったら true。
   */
  private generateColumnStep(cx: number, cz: number): boolean {
    const key = `${cx},${cz}`;
    if (this.columns.has(key)) return true;
    const cy = this.partialColumns.get(key) ?? 0;
    this.createChunk(cx, cy, cz);
    if (cy + 1 >= CHUNK_LAYERS) {
      this.partialColumns.delete(key);
      this.columns.add(key);
      this.lightColumn(cx, cz);
      return true;
    }
    this.partialColumns.set(key, cy + 1);
    return false;
  }

  /** 描画対象になった列のチャンクをメッシュ化待ちに積む。 */
  private requestMesh(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    if (this.meshedColumns.has(key)) return;
    this.meshedColumns.add(key);
    for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
      const chunk = this.chunks.get(chunkKey(cx, cy, cz));
      if (chunk && chunk.solidCount > 0) this.meshQueue.push(chunkKey(cx, cy, cz));
    }
  }

  private meshChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk || !chunk.dirty) return;

    // 面の可視判定と AO には隣接列のボクセルが要る。まだ無ければ生成を待って後回しにする
    // （ここで同期生成すると 1 フレームに数十 ms のスパイクが出る）。
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.columns.has(`${chunk.cx + dx},${chunk.cz + dz}`)) {
          this.meshQueue.push(key);
          return;
        }
      }
    }

    this.fillPad(chunk);
    const { opaque, translucent } = buildChunkMesh(this.pad, this.skyPad, this.blockPad);

    this.triangles -= countTriangles(chunk);
    const opaqueMesh = chunk.applyMesh(opaque, chunk.opaqueMesh, this.opaqueMaterial, 0);
    if (opaqueMesh && !opaqueMesh.parent) this.scene.add(opaqueMesh);
    chunk.opaqueMesh = opaqueMesh;

    const translucentMesh = chunk.applyMesh(
      translucent,
      chunk.translucentMesh,
      this.translucentMaterial,
      1,
    );
    if (translucentMesh && !translucentMesh.parent) this.scene.add(translucentMesh);
    chunk.translucentMesh = translucentMesh;
    this.triangles += countTriangles(chunk);

    chunk.dirty = false;
  }

  /** チャンク本体＋周囲 1 ブロックを 18^3 の配列に詰める。 */
  private fillPad(chunk: Chunk): void {
    const { cx, cy, cz } = chunk;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const slot = (dy + 1) * 9 + (dz + 1) * 3 + (dx + 1);
          this.neighbors[slot] = this.chunks.get(chunkKey(cx + dx, cy + dy, cz + dz)) ?? null;
        }
      }
    }

    const pad = this.pad;
    const skyPad = this.skyPad;
    const blockPad = this.blockPad;
    for (let y = -1; y <= CHUNK_SIZE; y++) {
      const ry = y < 0 ? 0 : y >= CHUNK_SIZE ? 2 : 1;
      const ly = (y + CHUNK_SIZE) & CHUNK_MASK;
      const below = cy + (ry - 1) < 0;
      const outside = below ? BEDROCK : AIR;
      const outsideLight = below ? 0 : MAX_LIGHT;
      for (let z = -1; z <= CHUNK_SIZE; z++) {
        const rz = z < 0 ? 0 : z >= CHUNK_SIZE ? 2 : 1;
        const lz = (z + CHUNK_SIZE) & CHUNK_MASK;
        for (let x = -1; x <= CHUNK_SIZE; x++) {
          const rx = x < 0 ? 0 : x >= CHUNK_SIZE ? 2 : 1;
          const lx = (x + CHUNK_SIZE) & CHUNK_MASK;
          const source = this.neighbors[ry * 9 + rz * 3 + rx];
          const index = localIndex(lx, ly, lz);
          const target = ((y + 1) * PAD_SIZE + (z + 1)) * PAD_SIZE + (x + 1);
          pad[target] = source ? source.data[index] : outside;
          skyPad[target] = source ? source.skyLight[index] : outsideLight;
          blockPad[target] = source ? source.blockLight[index] : 0;
        }
      }
    }
  }

  // --- フレームごとの更新 -----------------------------------------------

  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX) >> CHUNK_BITS;
    const pcz = Math.floor(playerZ) >> CHUNK_BITS;
    if (pcx !== this.lastCenter[0] || pcz !== this.lastCenter[1]) {
      this.lastCenter = [pcx, pcz];
      this.rebuildColumnQueue(pcx, pcz);
      this.unloadFar(pcx, pcz);
    }

    // 生成もメッシュ化も 1 件が数 ms かかるので、時間で区切って次のフレームへ回す
    const start = performance.now();
    let steps = 0;
    while (this.columnQueue.length > 0 && steps < MAX_COLUMN_STEPS_PER_FRAME) {
      if (performance.now() - start >= GENERATE_BUDGET_MS) break;
      const next = this.columnQueue[this.columnQueue.length - 1];
      if (this.generateColumnStep(next[0], next[1])) {
        this.columnQueue.pop();
        const dx = next[0] - pcx;
        const dz = next[1] - pcz;
        if (dx * dx + dz * dz <= RENDER_DISTANCE * RENDER_DISTANCE) {
          this.requestMesh(next[0], next[1]);
        }
      }
      steps++;
    }

    let meshed = 0;
    while (this.meshQueue.length > 0 && meshed < MAX_MESHES_PER_FRAME) {
      if (performance.now() - start >= GENERATE_BUDGET_MS + MESH_BUDGET_MS) break;
      const key = this.meshQueue.shift();
      if (key) this.meshChunk(key);
      meshed++;
    }
  }

  /** 近い順に取り出せるよう、遠い順に並べて末尾から pop する。 */
  private rebuildColumnQueue(pcx: number, pcz: number): void {
    const queue: Array<[number, number]> = [];
    const renderSq = RENDER_DISTANCE * RENDER_DISTANCE;
    for (let dz = -DATA_DISTANCE; dz <= DATA_DISTANCE; dz++) {
      for (let dx = -DATA_DISTANCE; dx <= DATA_DISTANCE; dx++) {
        const distance = dx * dx + dz * dz;
        // 描画する円盤を 1 マス膨らませた範囲。メッシュ化には隣接 8 列が要るので、
        // 単純に半径を +1 した円盤では角の列が漏れて永久に待たされる。
        const nearest = Math.max(0, Math.abs(dx) - 1) ** 2 + Math.max(0, Math.abs(dz) - 1) ** 2;
        if (nearest > renderSq) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (this.columns.has(`${cx},${cz}`)) {
          // 生成済みでも、近づいて描画対象に入った列はメッシュ化が要る
          if (distance <= renderSq) this.requestMesh(cx, cz);
          continue;
        }
        queue.push([cx, cz]);
      }
    }
    queue.sort(
      (a, b) =>
        (b[0] - pcx) ** 2 + (b[1] - pcz) ** 2 - ((a[0] - pcx) ** 2 + (a[1] - pcz) ** 2),
    );
    this.columnQueue = queue;
  }

  private unloadFar(pcx: number, pcz: number): void {
    // 生成途中で置き去りになった列も対象にする
    for (const key of [...this.columns, ...this.partialColumns.keys()]) {
      const comma = key.indexOf(",");
      const cx = Number(key.slice(0, comma));
      const cz = Number(key.slice(comma + 1));
      const dx = cx - pcx;
      const dz = cz - pcz;
      if (dx * dx + dz * dz <= UNLOAD_DISTANCE * UNLOAD_DISTANCE) continue;
      for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
        const ck = chunkKey(cx, cy, cz);
        const chunk = this.chunks.get(ck);
        if (chunk) {
          this.triangles -= countTriangles(chunk);
          chunk.dispose();
          this.chunks.delete(ck);
        }
      }
      this.columns.delete(key);
      this.meshedColumns.delete(key);
      this.partialColumns.delete(key);
      this.skyHeights.delete(key);
    }
  }

  /** 初回スポーン時に手前だけ同期生成して、足場がない状態を避ける。 */
  primeAround(x: number, z: number, radius = 1): void {
    const pcx = Math.floor(x) >> CHUNK_BITS;
    const pcz = Math.floor(z) >> CHUNK_BITS;
    // メッシュ化には隣接列が要るので、1 リング広くボクセルを用意してから依頼する
    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        this.ensureColumn(pcx + dx, pcz + dz);
      }
    }
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.requestMesh(pcx + dx, pcz + dz);
      }
    }
    const budget = this.meshQueue.length;
    for (let i = 0; i < budget; i++) {
      const key = this.meshQueue.shift();
      if (key) this.meshChunk(key);
    }
  }

  /** 地表の少し上。スポーン位置を決めるのに使う。 */
  surfaceY(x: number, z: number): number {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const id = this.getVoxel(x, y, z);
      if (id !== AIR) return y + 1;
    }
    return 1;
  }

  stats(): WorldStats {
    return {
      chunks: this.chunks.size,
      queued: this.meshQueue.length + this.columnQueue.length,
      triangles: this.triangles,
    };
  }

  editsForSave(): EditMap {
    return this.edits;
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) chunk.dispose();
    this.chunks.clear();
    this.columns.clear();
    this.meshedColumns.clear();
    this.meshQueue.length = 0;
    this.columnQueue = [];
    this.opaqueMaterial.dispose();
    this.translucentMaterial.dispose();
  }
}

function countTriangles(chunk: Chunk): number {
  let total = 0;
  for (const mesh of [chunk.opaqueMesh, chunk.translucentMesh]) {
    const index = mesh?.geometry.getIndex();
    if (index) total += index.count / 3;
  }
  return total;
}
