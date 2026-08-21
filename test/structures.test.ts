import { AIR, BRICK, COBBLE } from "../src/blocks";
import { CHUNK_SIZE, CHUNK_VOLUME } from "../src/constants";
import {
  placementsFor,
  stampPlacements,
  type Placement,
  type Put,
  type StructureDef,
} from "../src/structures";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 3x3x3 のレンガの塊。**基準点を中心に置く**ので、`extent` は左右 1・上 2。
 * （`up` は基準点から上への広がりなので、真ん中に置くなら 2 段ぶん。）
 */
const CUBE: StructureDef = {
  name: "立方体",
  spacing: 2,
  chance: 1,
  extent: { x: 1, up: 2, z: 1 },
  salt: 0x51a1,
  build(place: Placement, put: Put) {
    for (let dy = 0; dy <= 2; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          put(place.x + dx, place.y + dy, place.z + dz, BRICK);
        }
      }
    }
  },
};

const CUBE_CELLS = 27;

/** たまにしか建たない版（割合を見るため）。 */
const RARE: StructureDef = { ...CUBE, name: "たまに", chance: 0.25, salt: 0x77c3 };

const SEED = 20260821;
/** 平らな地面。**高さを測った回数を数えられる**ようにしてある。 */
function flatGround(height = 40) {
  let calls = 0;
  return {
    at: (_x: number, _z: number) => {
      calls++;
      return height;
    },
    get calls() {
      return calls;
    },
  };
}

/** 構造物の全マスをワールド座標の文字列で返す（重なりや欠けを数えるため）。 */
function cellsOf(place: Placement): string[] {
  const out: string[] = [];
  place.def.build(place, (x, y, z) => out.push(`${x},${y},${z}`));
  return out;
}

export function run(): void {
  describe("構造物の器");

  const ground = flatGround();

  // --- まず「実際に建った」ことを確かめる ---
  // これが 0 だと、以下の判定は全部「何も無いから通る」になる。
  const first = placementsFor([CUBE], SEED, 0, 0, ground.at);
  check(
    "チャンク (0,0) に掛かる構造物が列挙される",
    first.length > 0,
    `${first.length} 個 / 先頭 (${first[0]?.x}, ${first[0]?.y}, ${first[0]?.z})`,
  );

  // --- 高さを測る回数（ここが費用の肝） ---
  // `heightAt()` は 1 列 256 回呼ばれるほど重い。**建つと決まった 1 個につき 1 回**だけ。
  check(
    "地面を測るのは建つ 1 個につき 1 回だけ",
    ground.calls === first.length,
    `${ground.calls} 回 / 構造物 ${first.length} 個`,
  );

  const empty = flatGround();
  const emptyData = new Uint8Array(CHUNK_VOLUME);
  const wrote = stampPlacements(placementsFor([], SEED, 0, 0, empty.at), 0, 2, 0, emptyData);
  check(
    "構造物が 1 つも無ければ地面すら測らない",
    wrote === 0 && empty.calls === 0,
    `${empty.calls} 回`,
  );

  // --- 決定的か ---
  const a = new Uint8Array(CHUNK_VOLUME);
  const b = new Uint8Array(CHUNK_VOLUME);
  stampPlacements(placementsFor([CUBE], SEED, 0, 0, flatGround().at), 0, 2, 0, a);
  stampPlacements(placementsFor([CUBE], SEED, 0, 0, flatGround().at), 0, 2, 0, b);
  check("同じシード・同じチャンクなら何度でも同じ", a.every((v, i) => v === b[i]));

  const other = new Uint8Array(CHUNK_VOLUME);
  stampPlacements(placementsFor([CUBE], SEED + 1, 0, 0, flatGround().at), 0, 2, 0, other);
  check("シードが違えば違う場所に建つ", !other.every((v, i) => v === a[i]));

  // --- 列をまたいでも欠けない ---
  // **これがこの器の存在理由。** 区画を丸ごと生成して、
  // 構造物 1 個ぶんのマスが「全部・1 回ずつ」書かれることを見る。
  const written = new Map<string, number>();
  const seen = new Map<string, Placement>();
  const SPAN = 8;
  for (let cz = 0; cz < SPAN; cz++) {
    for (let cx = 0; cx < SPAN; cx++) {
      // **列挙は列につき 1 回**（`worldgen.ts` が `ColumnData` に持つのと同じ形）。
      const column = placementsFor([CUBE], SEED, cx, cz, flatGround().at);
      for (const place of column) seen.set(`${place.x},${place.y},${place.z}`, place);
      for (let cy = 0; cy < 8; cy++) {
        const data = new Uint8Array(CHUNK_VOLUME);
        stampPlacements(column, cx, cy, cz, data);
        const baseX = cx * CHUNK_SIZE;
        const baseY = cy * CHUNK_SIZE;
        const baseZ = cz * CHUNK_SIZE;
        for (let i = 0; i < data.length; i++) {
          if (data[i] === AIR) continue;
          const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
          const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
          const lx = i % CHUNK_SIZE;
          const key = `${baseX + lx},${baseY + ly},${baseZ + lz}`;
          written.set(key, (written.get(key) ?? 0) + 1);
        }
      }
    }
  }

  // 区画の内側（端に掛からない）構造物だけを見る。端のものは区画の外へはみ出す。
  const inner = [...seen.values()].filter(
    (p) =>
      p.x - 1 >= 0 &&
      p.z - 1 >= 0 &&
      p.x + 1 < SPAN * CHUNK_SIZE &&
      p.z + 1 < SPAN * CHUNK_SIZE,
  );
  check("区画の内側に構造物がある（この後の判定の前提）", inner.length > 0, `${inner.length} 個`);

  let missing = 0;
  let doubled = 0;
  for (const place of inner) {
    for (const key of cellsOf(place)) {
      const n = written.get(key) ?? 0;
      if (n === 0) missing++;
      if (n > 1) doubled++;
    }
  }
  check(
    "列をまたいでも 1 マスも欠けない",
    missing === 0,
    `${inner.length} 個 x ${CUBE_CELLS} マス中 ${missing} マス欠け`,
  );
  check("同じマスを 2 度書かない", doubled === 0, `${doubled} マス`);

  // **「またいだ」の判定を境目の座標で書かないこと。** 端の 1 マスだけを見ていたら、
  // 3 個の標本ではどれも当たらず 0 個で落ちた。**塊が別のチャンクに入ったか**で見る。
  const chunkOf = (v: number) => v >> 4;
  const straddling = inner.filter(
    (p) =>
      chunkOf(p.x - 1) !== chunkOf(p.x + 1) ||
      chunkOf(p.z - 1) !== chunkOf(p.z + 1) ||
      chunkOf(p.y) !== chunkOf(p.y + 2),
  ).length;
  check(
    "チャンクの境目にまたがった構造物が実際にあった",
    straddling > 0,
    `${straddling} 個 / 内側 ${inner.length} 個`,
  );

  // --- 間隔と割合 ---
  const cells = 24;
  let always = 0;
  let rare = 0;
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      // グリッドのマス 1 つを丸ごと含むチャンクを 1 個見れば、そのマスの分が出る
      const cx = gx * CUBE.spacing;
      const cz = gz * CUBE.spacing;
      always += placementsFor([CUBE], SEED, cx, cz, flatGround().at).filter(
        (p) => Math.floor(p.x / (CUBE.spacing * CHUNK_SIZE)) === gx &&
          Math.floor(p.z / (CUBE.spacing * CHUNK_SIZE)) === gz,
      ).length;
      rare += placementsFor([RARE], SEED, cx, cz, flatGround().at).filter(
        (p) => Math.floor(p.x / (RARE.spacing * CHUNK_SIZE)) === gx &&
          Math.floor(p.z / (RARE.spacing * CHUNK_SIZE)) === gz,
      ).length;
    }
  }
  const total = cells * cells;
  check("割合 1 ならグリッドのマスごとに必ず 1 個", always === total, `${always} / ${total}`);
  const ratio = rare / total;
  console.log(`      割合 0.25 の構造物: ${rare} / ${total} マス = ${(ratio * 100).toFixed(1)}%`);
  check("割合を下げると建つ数が減る", Math.abs(ratio - 0.25) < 0.05, `${(ratio * 100).toFixed(1)}%`);

  // --- 届かないところには書かない ---
  const far = new Uint8Array(CHUNK_VOLUME);
  const farWrote = stampPlacements(placementsFor([CUBE], SEED, 0, 0, flatGround(40).at), 0, 7, 0, far);
  check(
    "地面から遠い段には書き込まない（高さで先に落とす）",
    farWrote === 0,
    `y=112..127 に ${farWrote} マス`,
  );

  // --- 種類が違えば別の場所に散る ---
  // **`salt` が効いていることを、書き込んだ結果ではなく置き場所で見る。**
  // 「1 チャンクに両方のブロックが出たか」で見ると、たまたま片方が
  // このチャンクに掛からなかっただけで落ちる（実際そうなった）。
  const pillar: StructureDef = {
    ...CUBE,
    name: "丸石の柱",
    salt: 0x2b2b,
    build: (p, put) => put(p.x, p.y, p.z, COBBLE),
  };
  const cubeSpots = placementsFor([CUBE], SEED, 0, 0, flatGround().at).map((p) => `${p.x},${p.z}`);
  const pillarSpots = placementsFor([pillar], SEED, 0, 0, flatGround().at).map(
    (p) => `${p.x},${p.z}`,
  );
  check(
    "種類が違えば別の場所へ散る（salt が効いている）",
    cubeSpots.length > 0 &&
      pillarSpots.length > 0 &&
      cubeSpots.every((k) => !pillarSpots.includes(k)),
    `${cubeSpots[0]} と ${pillarSpots[0]}`,
  );

  // 2 種類を一緒に渡しても、両方のブロックがちゃんと出る（区画で見る）。
  const kinds = new Set<number>();
  for (let cz = 0; cz < 4; cz++) {
    for (let cx = 0; cx < 4; cx++) {
      const column = placementsFor([CUBE, pillar], SEED, cx, cz, flatGround().at);
      for (let cy = 2; cy < 4; cy++) {
        const data = new Uint8Array(CHUNK_VOLUME);
        stampPlacements(column, cx, cy, cz, data);
        for (const v of data) if (v !== AIR) kinds.add(v);
      }
    }
  }
  check(
    "2 種類を一緒に渡すと両方が出る",
    kinds.has(BRICK) && kinds.has(COBBLE),
    `出たブロック ${[...kinds].join(" ")}`,
  );

  sourceGuards();
}

/** `structures.ts` を純粋なまま保つ。 */
function sourceGuards(): void {
  const source = sourceOf("src/structures.ts");
  const leaked = ["Mesh", "Scene", "document", "HTMLElement", "Math.random(", "AudioContext"].filter(
    (w) => source.includes(w),
  );
  check("structures.ts に描画・DOM・乱数が無い", leaked.length === 0, leaked.join(" "));

  // **どのブロックを置くかは構造物側の仕事。** 器がブロックを知り始めると、
  // 「ネザー要塞だけ特別扱い」がここに書かれ始める。
  check(
    "structures.ts がブロックを名指ししていない",
    !source.includes("./blocks"),
    source.includes("./blocks") ? "blocks.ts を import している" : "",
  );

  // 生成器の側は器を呼ぶだけ（列をまたぐ扱いを写さない）。
  // **呼び出しだけを数えること**（import の 1 件も数えて 2 回になった）。
  // 器の側で列をまたぐ扱いを持っているので、生成器はスタンプを 1 か所呼ぶだけでよい。
  const gen = sourceOf("src/worldgen.ts");
  const stamps = (gen.match(/stampPlacements\(/g) ?? []).length;
  check("worldgen.ts は器を呼ぶだけ", stamps === 1, `${stamps} か所`);

  // **列挙は列のキャッシュの中で 1 回だけ。** ここが増えると、1 つの列を 8 段ぶん
  // 生成するあいだに地面を測る回数がそのまま倍々になる。
  const enumerations = (gen.match(/placementsFor\(/g) ?? []).length;
  check("構造物の列挙は列につき 1 回だけ", enumerations === 1, `${enumerations} か所`);
}
