/**
 * セーブの互換性。**これが一番人に見えない事故**で、壊しても画面には何も出ず、
 * 既存プレイヤーのワールドが黙って消えるだけ（`load()` が null を返し、
 * 新しいワールドが始まる）。
 *
 * ここが押さえるのは 3 つ:
 *
 * 1. **`version` は 1 のまま。** `load()` が `version !== 1` を弾くので、
 *    上げた瞬間に既存のワールドが全部読めなくなる
 * 2. **今日の形が読めること。** 下の `V1_SAVE` は**凍らせた文字列**で、
 *    今のコードから作り直さない（作り直すと、形を変えたときに一緒に変わって何も守らない）
 * 3. **知らないキーがあっても読めること。** 次元（`dims`）のような
 *    新しいキーを足す側と、古いセーブを読む側の両方が壊れない形になっているか
 */

import { readFileSync } from "node:fs";
import { Beds } from "../src/beds";
import { Chests } from "../src/chests";
import { CraftScreen } from "../src/craftscreen";
import { NETHER, OVERWORLD } from "../src/dimensions";
import { Drops } from "../src/drops";
import { Crops } from "../src/crops";
import { Furnaces } from "../src/furnaces";
import { check, describe } from "./harness";
import { Inventory } from "../src/inventory";
import { countEdits, deserializeEdits, load } from "../src/storage";

/**
 * **凍らせたセーブ 1 件**（2026-08-18 の形）。ベッドまで入った全部入り。
 *
 * **ここを今のコードから生成し直さないこと。** 生成すると、形が変わったときに
 * 期待値も一緒に変わって、互換性を何も見なくなる。
 * 実物を貼り替えるときは「そのバージョンで実際に遊んだ localStorage の中身」にすること。
 */
const V1_SAVE = `{
  "version": 1,
  "seed": 12345,
  "player": { "x": 0.5, "y": 46.2, "z": 0.5, "yaw": 1.25, "pitch": -0.2, "flying": false },
  "time": 0.32,
  "creative": false,
  "health": 17,
  "hunger": 14,
  "volume": 0.7,
  "inventory": [3,64, 4,32, 0,0, 19,12, 0,0, 0,0, 0,0, 0,0, 0,0,
                0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
                0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
                0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 68,2],
  "craft": [10,4, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 7,1],
  "drops": [4,3, 12.5, 41.0, -8.5, 68,1, 13.5, 41.0, -8.5],
  "furnaces": { "3,2,-1": [15,2, 14,1, 0,0, 0.5, 4.0, 8.0] },
  "chests": { "5,40,7": [10,64, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
                         0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0,
                         0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0, 0,0] },
  "bed": [9, 41, -3],
  "edits": { "0,2,0": [0, 3, 17, 4], "-1,2,0": [255, 0] }
}`;

/** `load()` は `localStorage` を直に読む。Node には無いので最小の器を置く。 */
function withStorage(raw: string | null, fn: () => void): void {
  const store = new Map<string, string>();
  if (raw !== null) store.set("voxel-sandbox:v1", raw);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  try {
    fn();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

/** キーを 1 つ抜いたセーブの文字列。 */
function without(key: string): string {
  const parsed = JSON.parse(V1_SAVE) as Record<string, unknown>;
  delete parsed[key];
  return JSON.stringify(parsed);
}

export function run(): void {
  describe("セーブの互換性 (v1)");

  // --- version は 1 のまま ------------------------------------------------

  // `SaveData.version` の型は `1` なので、上げようとすれば型でも落ちる。
  // ただし型は `as SaveData` で握りつぶせるので、**振る舞いのほうでも見ておく。**
  const source = readFileSync("src/storage.ts", "utf8");
  check("SaveData.version の型が 1 のまま", /version:\s*1;/.test(source));

  withStorage(V1_SAVE.replace('"version": 1', '"version": 2'), () => {
    check("version が 1 でないセーブは読まない", load() === null);
  });

  // --- 今日の形が読める ---------------------------------------------------

  withStorage(V1_SAVE, () => {
    const saved = load();
    check("凍らせた v1 のセーブが読める", saved !== null);
    if (!saved) return;

    check("seed", saved.seed === 12345, String(saved.seed));
    check("player の位置", saved.player.y === 46.2, String(saved.player.y));
    check("time", saved.time === 0.32, String(saved.time));
    check("health / hunger", saved.health === 17 && saved.hunger === 14);
    check("volume", saved.volume === 0.7, String(saved.volume));

    // 差分は「チャンクキー -> [index, id, ...]」。ここが崩れると地形の改変が消える。
    const edits = deserializeEdits(saved.edits);
    check("edits の件数", countEdits(edits) === 3, `${countEdits(edits)} 件`);
    check("edits の中身", edits.get("0,2,0")?.get(17) === 4);

    // 位置ベースの平坦配列は、**位置がずれると別のアイテムに化ける。**
    // どれも「読み込んだら元の数が戻る」ところまで見る。
    const inventory = new Inventory();
    inventory.deserialize(saved.inventory);
    check("インベントリ 0 番", inventory.slots[0].item === 3 && inventory.slots[0].count === 64);
    check("インベントリ 3 番（松明 12）", inventory.slots[3].count === 12);
    check("インベントリ 35 番（末尾が消えていない）", inventory.slots[35].item === 68);

    // `craft` は盤面のスナップショットではなく「まだ返していない預かり物」。
    // 読み込みは deserialize -> returnAll の順（順番厳守）。
    const craft = new CraftScreen(inventory);
    craft.deserialize(saved.craft);
    craft.returnAll();
    const planks = inventory.slots.find((s) => s.item === 10);
    check("craft の預かり物がインベントリへ戻る", planks?.count === 4, String(planks?.count));

    const drops = new Drops();
    drops.deserialize(saved.drops);
    check("落ちたアイテム 2 山", drops.list.length === 2, `${drops.list.length} 山`);

    const furnaces = new Furnaces();
    furnaces.deserialize(saved.furnaces);
    check("かまど 1 台", furnaces.count === 1, `${furnaces.count} 台`);

    const chests = new Chests();
    chests.deserialize(saved.chests);
    check("チェスト 1 個", chests.count === 1, `${chests.count} 個`);

    const beds = new Beds(OVERWORLD);
    beds.deserialize(saved.bed, saved.bedDim);
    check("リスポーン地点", beds.spawnPoint?.x === 9 && beds.spawnPoint?.z === -3);
    // **凍らせた v1 には `bedDim` が無い**（ネザーが入る前のセーブ）。
    // 既定に落ちないと、古いワールドの人が死んだ瞬間にネザーへ飛ばされる。
    check(
      "bedDim の無い古いセーブはオーバーワールドとして読める",
      beds.spawnPoint?.dim === OVERWORLD && beds.respawnDimension() === OVERWORLD,
      String(beds.spawnPoint?.dim),
    );
  });

  // **`bedDim` は省略可のキーとして足したもの**（`version` は 1 のまま）。
  // 書いてあれば効き、無ければ既定に落ちる、の両方をここで見る。
  withStorage(V1_SAVE.replace('"bed": [9, 41, -3],', '"bed": [9, 41, -3], "bedDim": "nether",'), () => {
    const saved = load();
    check("bedDim を足しても v1 として読める", saved !== null && saved.bedDim === NETHER, String(saved?.bedDim));
    const beds = new Beds(OVERWORLD);
    beds.deserialize(saved?.bed, saved?.bedDim);
    check("bedDim があれば その次元へ戻る", beds.respawnDimension() === NETHER, beds.respawnDimension());
  });

  // **`crops` も省略可のキーとして足したもの**（`version` は 1 のまま）。
  // **凍らせた v1 には無い**ので、書いてあれば効き、無ければ空、の両方をここで見る
  // （畑を作っていない人のセーブは、育つ苗が入る前と 1 バイトも変わらない）。
  withStorage(V1_SAVE.replace('"bed": [9, 41, -3],', '"bed": [9, 41, -3], "crops": { "2,41,3": 45.5 },'), () => {
    const saved = load();
    check("crops を足しても v1 として読める", saved !== null, String(saved === null));
    const crops = new Crops();
    crops.deserialize(saved?.crops);
    console.log(`      読み戻した苗: ${crops.count} 本 / 育ち ${crops.peek(2, 41, 3)} 秒`);
    check("苗の育ち具合が読み戻せる", crops.count === 1 && crops.peek(2, 41, 3) === 45.5, `${crops.peek(2, 41, 3)}`);
  });

  withStorage(V1_SAVE, () => {
    // **`crops` の無い古いセーブは畑が 0 本**（`deserialize(undefined)` が空にする）。
    const crops = new Crops();
    crops.deserialize(load()?.crops);
    check("crops の無い古いセーブは畑が 0 本", crops.count === 0, `${crops.count} 本`);
  });

  // --- 省略可のキーは 1 つずつ抜いても読める -------------------------------

  // 次元（`dims`）のような新しいキーもこの形に揃えること
  // （**省略可・無ければ既定**。`SaveData.version` は上げない）。
  const optional = [
    "time", "creative", "health", "hunger", "inventory",
    "craft", "volume", "drops", "furnaces", "chests", "bed",
  ];
  const dropped: string[] = [];
  for (const key of optional) {
    withStorage(without(key), () => {
      if (load() === null) dropped.push(key);
    });
  }
  check(
    `省略可のキーは 1 つずつ抜いても読める（${optional.length} 個）`,
    dropped.length === 0,
    dropped.join(" "),
  );

  // 必須の 2 つは抜けたら読まない（壊れたセーブで遊び始めないため）。
  for (const key of ["seed", "player"]) {
    withStorage(without(key), () => {
      const saved = load();
      // player は `load()` が見ていないので通る。seed だけが弾かれる。
      check(
        `${key} が無いとき`,
        key === "seed" ? saved === null : saved !== null,
        key === "seed" ? "読まない" : "読む（使う側が既定に落とす）",
      );
    });
  }

  // --- 次元つきのセーブ ---------------------------------------------------

  // **オーバーワールドは上の階層のまま**（`edits` / `drops` / `furnaces` / `chests`）で、
  // `dims` に入るのはそれ以外の次元だけ。この形なので、上の V1_SAVE がそのまま読める。
  // 振り分けそのものの検証は `test/dimensions.test.ts`。
  const withDims = JSON.parse(V1_SAVE) as Record<string, unknown>;
  withDims.dim = "nether";
  withDims.dims = { nether: { edits: { "0,2,0": [0, 45] }, drops: [45, 2, 1.5, 33, 1.5] } };
  withStorage(JSON.stringify(withDims), () => {
    const saved = load();
    check("次元つきのセーブが読める", saved !== null);
    check("dim が読める", saved?.dim === "nether", String(saved?.dim));
    check(
      "dims の中身が読める",
      countEdits(deserializeEdits(saved?.dims?.nether?.edits)) === 1,
      JSON.stringify(saved?.dims),
    );
    // **上の階層は動かさない。** ここが別の次元のぶんに入れ替わると、
    // 次元を知らないコードで開いたときにネザーの地形がオーバーワールドに貼られる。
    check("上の階層はオーバーワールドのまま", countEdits(deserializeEdits(saved?.edits)) === 3);
  });

  // --- 知らないキーがあっても読める（前方互換） ---------------------------

  // ループが新しいキーを足したあとのセーブを、**足す前のコードが読めるか**。
  // ここが通らないと、ブランチを行き来した人のワールドが消える。
  const future = JSON.parse(V1_SAVE) as Record<string, unknown>;
  future.somethingNew = 42;
  withStorage(JSON.stringify(future), () => {
    const saved = load();
    check("知らないキーがあっても読める", saved !== null);
    check("知らないキーがあっても edits は無事", countEdits(deserializeEdits(saved?.edits)) === 3);
  });

  withStorage(null, () => {
    check("セーブが無ければ null", load() === null);
  });

  withStorage("{ こわれている", () => {
    check("壊れた JSON は null（例外にしない）", load() === null);
  });
}
