import { STORAGE_KEY } from "./constants";
import type { EditMap } from "./world";

export interface SaveData {
  version: 1;
  seed: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean };
  /** 時刻 [0, 1)。0 = 日の出。古いセーブには無いので省略可。 */
  time?: number;
  creative?: boolean;
  /** 体力 0..20。0 以下や欠けているときは満タンで再開する。 */
  health?: number;
  /**
   * 空腹 0..20。欠けているときは満腹で再開する（空腹が無かった頃のセーブ）。
   * **満腹度は持たない** —— 読み込み直後に少しだけ得をするが、
   * 「腹が減ったまま再開して即餓死」より安全側。
   */
  hunger?: number;
  /** [item, count, ...] を 36 スロット分。空きは 0,0。 */
  inventory?: number[];
  /**
   * クラフト盤面 9 + 掴んでいる山 1 を [item, count, ...] の 20 要素で。空なら省略。
   * **盤面のスナップショットではなく「まだインベントリに戻していない預かり物」**なので、
   * 読み込み側は中身をインベントリへ返すだけ（盤面の大きさは持たない）。
   */
  craft?: number[];
  /** 音量 0..1。古いセーブには無いので省略可（既定に戻る）。 */
  volume?: number;
  /**
   * 落ちたアイテム。`[item, count, x, y, z]` を 1 山につき 5 要素で。空なら省略。
   *
   * **モブと違って保存する。** モブはシードから作り直せるが、落ちたアイテムは
   * プレイヤーが掘って出したものそのもので、作り直せない（`edits` と同じ性質）。
   * 消すと「集めた物が黙って消えた」になる。
   *
   * 寿命と拾えるまでの猶予は持たない。読み込み直後に足元の物が消えるより、
   * 5 分の猶予が戻るほうが安全側（`drops.ts` の `serialize` を参照）。
   */
  drops?: number[];
  /**
   * 置いてあるかまど。`"x,y,z"` -> 中身 3 枠 x 2 + タイマー 3 の 9 要素。空なら省略。
   *
   * **地形の差分（`edits`）とは別に持つ。** `edits` はブロック ID だけの表で、
   * 1 マスに 1 個の数しか入らない。中身を持つブロック（チェスト・醸造台）を
   * 足すときも、ここと同じ「位置をキーにした省略可のキー」に並べること。
   */
  furnaces?: Record<string, number[]>;
  /**
   * 置いてあるチェスト。`"x,y,z"` -> 中身 27 枠 x 2 の 54 要素。空なら省略。
   * **かまどとまったく同じ形**（「位置ごとに状態を持つブロック」を足すときはここに並べる）。
   */
  chests?: Record<string, number[]>;
  /** チャンクキー -> [localIndex, blockId, ...] の平坦な配列。 */
  edits: Record<string, number[]>;
}

export function serializeEdits(edits: EditMap): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [key, map] of edits) {
    if (map.size === 0) continue;
    const flat: number[] = [];
    for (const [index, id] of map) flat.push(index, id);
    out[key] = flat;
  }
  return out;
}

export function deserializeEdits(raw: Record<string, number[]> | undefined): EditMap {
  const edits: EditMap = new Map();
  if (!raw) return edits;
  for (const [key, flat] of Object.entries(raw)) {
    if (!Array.isArray(flat)) continue;
    const map = new Map<number, number>();
    for (let i = 0; i + 1 < flat.length; i += 2) map.set(flat[i], flat[i + 1]);
    edits.set(key, map);
  }
  return edits;
}

export function save(data: SaveData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed?.version !== 1 || typeof parsed.seed !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage が使えない環境では何もしない */
  }
}

export function countEdits(edits: EditMap): number {
  let total = 0;
  for (const map of edits.values()) total += map.size;
  return total;
}
