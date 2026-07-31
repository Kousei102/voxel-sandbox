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
  /** [item, count, ...] を 36 スロット分。空きは 0,0。 */
  inventory?: number[];
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
