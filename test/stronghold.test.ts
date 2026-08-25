import {
  AIR,
  STONE_BRICK,
  blockName,
  endPortalFrame,
  frameFacing,
  frameHasEye,
  isEndPortalFrame,
  isSolid,
  supportFace,
} from "../src/blocks";
import { CHUNK_SIZE, CHUNK_VOLUME } from "../src/constants";
import { projectileDef } from "../src/projectiles";
import {
  EYE_RISE,
  STRONGHOLD,
  STRONGHOLD_CHANCE,
  STRONGHOLD_DEPTH,
  STRONGHOLD_FRAMES,
  STRONGHOLD_HALF,
  STRONGHOLD_HEIGHT,
  STRONGHOLD_RING,
  STRONGHOLD_SEARCH,
  STRONGHOLD_SITE,
  STRONGHOLD_SPACING,
  eyeShot,
  nearestStronghold,
  strongholdDirection,
} from "../src/stronghold";
import { cellSize, placementsFor, siteAt, type StructureDef } from "../src/structures";
import { WorldGen } from "../src/worldgen";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 決まった位置から順に見ていくための標本（種と立ち位置の組）。 */
const SEEDS = [12345, 4242, 999, 20260825];

/** 立ち位置の標本。**原点だけで見ないこと** —— 原点はグリッドのマスの角なので、
 * 「マスの中で散らす」が効いていなくても通ってしまう（角に立つと必ず 4 マス等距離）。 */
const SPOTS: readonly [number, number][] = [
  [0.5, 0.5],
  [137.25, -412.75],
  [-903.5, 61.5],
  [2048.5, 2048.5],
  [-1777.5, -1234.5],
  [64.5, 383.5],
];

export function run(): void {
  describe("要塞の方角（投げたエンダーアイ）");

  // --- まず「ちゃんと見つかった」ことを確かめる（この後の判定の前提） ---
  let found = 0;
  const distances: number[] = [];
  for (const seed of SEEDS) {
    for (const [x, z] of SPOTS) {
      const site = nearestStronghold(seed, x, z);
      if (!site) continue;
      found++;
      distances.push(site.distance);
    }
  }
  const total = SEEDS.length * SPOTS.length;
  distances.sort((a, b) => a - b);
  console.log(
    `      要塞まで ${distances.length ? distances[0].toFixed(0) : "-"}` +
      ` 〜 ${distances.length ? distances[distances.length - 1].toFixed(0) : "-"} マス` +
      `（中央 ${distances.length ? distances[distances.length >> 1].toFixed(0) : "-"}）` +
      ` / グリッド 1 マス ${cellSize(STRONGHOLD_SITE)} マス`,
  );
  check("どこに立っても要塞が見つかる", found === total, `${found} / ${total}`);

  // **必ず建つ側であること。** 割合を下げると「近くのマスに建たなかった」が起きて、
  // アイの指す先が 2 マス向こうのグリッドへ飛ぶ（クリア導線が細くなる）。
  check("要塞は必ず建つ（割合 1）", STRONGHOLD_CHANCE === 1, `${STRONGHOLD_CHANCE}`);

  // --- 本当に「いちばん近い」か（探す広さが足りているか） ---
  // **総当りと突き合わせる。** ここが `SEARCH` の広さを守っている唯一の判定。
  //
  //
  // **ただし、これは探す広さ（`STRONGHOLD_SEARCH`）を守れません。**
  // 2 を 1 に落としても答えが変わらないからです —— 手で選んだ 6 箇所でも、
  // 下の 1600 箇所の面舐めでも 1 件も違いが出ませんでした（実際に通しました）。
  // 「隣の隣のほうが近い」はマスの角のごく狭い所でしか起きません。
  // **広さを守っているのは、この下の「対角の最悪を超えている」のほうです。**
  const cell = cellSize(STRONGHOLD_SITE);
  const STEPS = 20;
  let swept = 0;
  let narrowMisses = 0;
  let mismatched = 0;
  let worstGap = 0;
  let worstDistance = 0;
  for (const seed of SEEDS) {
    // グリッド 2 マスぶんを等間隔に舐める（マスの角も真ん中も通る）。
    for (let iz = 0; iz < STEPS; iz++) {
      for (let ix = 0; ix < STEPS; ix++) {
        const x = (ix / STEPS) * cell * 2 - cell;
        const z = (iz / STEPS) * cell * 2 - cell;
        swept++;

        const truth = bruteNearest(seed, x, z, 6);
        const narrow = bruteNearest(seed, x, z, 1);
        if (!truth) continue;
        // ±1 では取りこぼす場所か（この後の判定に意味があることの裏取り）。
        if (!narrow || narrow.distance - truth.distance > 1e-6) narrowMisses++;

        const answer = nearestStronghold(seed, x, z);
        if (!answer) {
          mismatched++;
          continue;
        }
        worstDistance = Math.max(worstDistance, answer.distance);
        const gap = answer.distance - truth.distance;
        if (gap > 1e-6) {
          mismatched++;
          worstGap = Math.max(worstGap, gap);
        }
      }
    }
  }
  console.log(
    `      ${swept} 箇所を舐めて、いちばん遠くて ${worstDistance.toFixed(0)} マス` +
      `（マスの対角 ${(cell * Math.SQRT2).toFixed(0)} マスが上限）` +
      ` / ±1 マスだけでは取りこぼす所は ${narrowMisses} 箇所`,
  );
  check(
    "答えるのは総当りで探したいちばん近い要塞",
    mismatched === 0,
    mismatched ? `${mismatched} / ${swept} 箇所ずれ / 最大 ${worstGap.toFixed(1)} マス遠い` : "",
  );

  // **探す広さを守っているのはここ。**
  // 割合が 1 なので自分のマスにも必ず 1 個あり、そこまでは最悪でも対角の `√2 * cell`。
  // `|Δ|` マス離れたマスは近い側でも `(|Δ| - 1) * cell` 離れているので、
  // **`STRONGHOLD_SEARCH * cell ≥ √2 * cell` なら、その外に近いものは絶対に無い。**
  check(
    "探す広さがマスの対角の最悪を超えている",
    STRONGHOLD_SEARCH * cell >= cell * Math.SQRT2,
    `±${STRONGHOLD_SEARCH} マス = ${STRONGHOLD_SEARCH * cell} マス` +
      ` / 対角 ${(cell * Math.SQRT2).toFixed(0)} マス`,
  );
  // 上の理屈の前提（自分のマスにも必ず 1 個ある）を、実測でも裏取りしておく。
  check(
    "どこに立っても対角より近い所に要塞がある",
    worstDistance <= cell * Math.SQRT2,
    `いちばん遠くて ${worstDistance.toFixed(1)} マス`,
  );

  // --- 方角がその場所を向いているか ---
  let offBearing = 0;
  let worstDot = 1;
  for (const seed of SEEDS) {
    for (const [x, z] of SPOTS) {
      const site = nearestStronghold(seed, x, z);
      const bearing = strongholdDirection(seed, x, z);
      if (!site || !bearing) {
        offBearing++;
        continue;
      }
      const length = Math.hypot(bearing.dx, bearing.dz);
      const dot = (bearing.dx * (site.x - x) + bearing.dz * (site.z - z)) / site.distance;
      if (Math.abs(length - 1) > 1e-9 || dot < 1 - 1e-9) offBearing++;
      worstDot = Math.min(worstDot, dot);
    }
  }
  check(
    "向きは単位ベクトルで、いちばん近い要塞をまっすぐ指す",
    offBearing === 0,
    `内積のいちばん悪い値 ${worstDot.toFixed(6)}`,
  );

  // --- 建つ場所と食い違わないか（この周でいちばん大事な判定） ---
  // **投げたアイが指す先と、あとの周が実際に建てる場所は同じでなければならない。**
  // `STRONGHOLD_SITE` を広げただけの `StructureDef` を器に通して、
  // 出てきた置き場所が `nearestStronghold` の答えと一致するかを見る。
  const marker: StructureDef = {
    ...STRONGHOLD_SITE,
    name: "要塞（この判定のための仮の建物）",
    extent: { x: 0, up: 0, z: 0 },
    build: () => {},
  };
  const enumerated = new Set<string>();
  let columns = 0;
  const SEED = SEEDS[0];
  const SPAN = STRONGHOLD_SPACING * 2;
  for (let cz = 0; cz < SPAN; cz += STRONGHOLD_SPACING) {
    for (let cx = 0; cx < SPAN; cx += STRONGHOLD_SPACING) {
      columns++;
      for (const place of placementsFor([marker], SEED, cx, cz, () => 40)) {
        enumerated.add(`${place.x},${place.z}`);
      }
    }
  }
  check(
    "器が要塞を列挙する（この後の判定の前提）",
    enumerated.size > 0,
    `${columns} 列で ${enumerated.size} 個`,
  );

  // 列挙されたどの要塞も、その真上に立てば「いちばん近い要塞」として返ってくる。
  let disagreed = 0;
  for (const key of enumerated) {
    const [sx, sz] = key.split(",").map(Number);
    const site = nearestStronghold(SEED, sx + 0.5, sz + 0.5);
    if (!site || site.x !== sx || site.z !== sz) disagreed++;
  }
  check(
    "器が建てる場所と、アイが指す場所が一致する",
    disagreed === 0,
    `${enumerated.size} 個中 ${disagreed} 個ずれ`,
  );

  // 逆向きも見る（アイが指した先を器が知らない、が無いこと）。
  let unknown = 0;
  for (const seed of SEEDS) {
    for (const [x, z] of SPOTS) {
      const site = nearestStronghold(seed, x, z);
      if (!site) continue;
      const places = placementsFor(
        [marker],
        seed,
        site.x >> 4,
        site.z >> 4,
        () => 40,
      );
      if (!places.some((p) => p.x === site.x && p.z === site.z)) unknown++;
    }
  }
  check("アイが指した先を器も列挙する", unknown === 0, `${unknown} 件`);

  // --- 決定的か / 種が効いているか ---
  const twice = SEEDS.every((seed) =>
    SPOTS.every(([x, z]) => {
      const a = nearestStronghold(seed, x, z);
      const b = nearestStronghold(seed, x, z);
      return a?.x === b?.x && a?.z === b?.z;
    }),
  );
  check("同じ種・同じ場所なら何度でも同じ答え", twice);

  const moved = SPOTS.filter(([x, z]) => {
    const a = nearestStronghold(SEEDS[0], x, z);
    const b = nearestStronghold(SEEDS[1], x, z);
    return a && b && (a.x !== b.x || a.z !== b.z);
  }).length;
  check("種が違えば別の場所に建つ", moved === SPOTS.length, `${moved} / ${SPOTS.length} 箇所`);

  // ネザー要塞と同じ場所に建たない（`salt` が効いている）。
  check(
    "散らしの種がネザー要塞と別",
    STRONGHOLD_SITE.salt !== 0x4f5254,
    `0x${STRONGHOLD_SITE.salt.toString(16)}`,
  );

  eyeThrow();
  roomShape();
  roomInWorld();
  sourceGuards();
}

/** `build()` の書き込みを、座標ごとに 1 個ずつ受け止める（チャンクの外も落とさない）。 */
function stamped(x = 0, y = 40, z = 0): Map<string, number> {
  const cells = new Map<string, number>();
  STRONGHOLD.build({ def: STRONGHOLD, x, y, z }, (px, py, pz, id) => {
    cells.set(`${px},${py},${pz}`, id);
  });
  return cells;
}

/** 要塞の部屋の形（`build()` を直に呼ぶ）。 */
function roomShape(): void {
  describe("要塞の部屋（エンドポータル）");

  const y0 = 40;
  const cells = stamped(0, y0, 0);
  const at = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`);
  const top = STRONGHOLD_HEIGHT + 1;

  // --- 申告した範囲の外へ書いていないか ---
  let outside = 0;
  let brick = 0;
  let air = 0;
  let frames = 0;
  for (const [key, id] of cells) {
    const [x, y, z] = key.split(",").map(Number);
    if (
      Math.abs(x) > STRONGHOLD.extent.x ||
      Math.abs(z) > STRONGHOLD.extent.z ||
      y < y0 ||
      y > y0 + STRONGHOLD.extent.up
    ) {
      outside++;
    }
    if (id === STONE_BRICK) brick++;
    if (id === AIR) air++;
    if (isEndPortalFrame(id)) frames++;
  }
  console.log(
    `      部屋 1 個: ${cells.size} マス（石レンガ ${brick} / 空 ${air} / 枠 ${frames}）  ` +
      `外側 ${STRONGHOLD_HALF * 2 + 1} 角  内側の高さ ${STRONGHOLD_HEIGHT}  深さ ${STRONGHOLD_DEPTH}`,
  );
  check("申告した extent の外へ書かない", outside === 0, `${outside} マス`);

  // --- 殻が閉じているか（穴が空いていると、土や水が流れ込んだように見える） ---
  let holes = 0;
  for (let dy = 0; dy <= top; dy++) {
    for (let dz = -STRONGHOLD_HALF; dz <= STRONGHOLD_HALF; dz++) {
      for (let dx = -STRONGHOLD_HALF; dx <= STRONGHOLD_HALF; dx++) {
        const wall =
          dy === 0 ||
          dy === top ||
          Math.abs(dx) === STRONGHOLD_HALF ||
          Math.abs(dz) === STRONGHOLD_HALF;
        if (!wall) continue;
        if (at(dx, y0 + dy, dz) !== STONE_BRICK) holes++;
      }
    }
  }
  check("床・天井・4 面の壁が石レンガで閉じている", holes === 0, `${holes} マス欠け`);

  // --- 中が空いているか（山の中に建っても掘らずに歩ける） ---
  let blocked = 0;
  for (let dy = 1; dy < top; dy++) {
    for (let dz = -STRONGHOLD_HALF + 1; dz <= STRONGHOLD_HALF - 1; dz++) {
      for (let dx = -STRONGHOLD_HALF + 1; dx <= STRONGHOLD_HALF - 1; dx++) {
        // 書かれていないマス（`undefined`）は無い —— 殻が中まで塗るので、
        // 抜けていたらそれ自体が欠けなので数える。
        const id = at(dx, y0 + dy, dz) ?? STONE_BRICK;
        // 空いているか、通り抜けられるもの（松明）か、枠（膝の高さ）ならよい。
        if (id === AIR || isEndPortalFrame(id) || !isSolid(id)) continue;
        blocked++;
      }
    }
  }
  check("中は歩ける（枠と松明のほかは空）", blocked === 0, `${blocked} マス`);

  // --- エンドポータルの輪 ---
  check(`枠がちょうど ${STRONGHOLD_FRAMES} 個`, frames === STRONGHOLD_FRAMES, `${frames} 個`);

  let eyed = 0;
  let outward = 0;
  const ringY = y0 + 1;
  for (let dz = -STRONGHOLD_RING; dz <= STRONGHOLD_RING; dz++) {
    for (let dx = -STRONGHOLD_RING; dx <= STRONGHOLD_RING; dx++) {
      const id = at(dx, ringY, dz);
      const corner =
        Math.abs(dx) === STRONGHOLD_RING && Math.abs(dz) === STRONGHOLD_RING;
      const onRing = Math.max(Math.abs(dx), Math.abs(dz)) === STRONGHOLD_RING && !corner;
      if (!onRing) continue;
      if (id === undefined || !isEndPortalFrame(id)) continue;
      if (frameHasEye(id)) eyed++;
      // 向きは中心を向くこと。面番号から 1 マス進んだ先が、いまより中心に近いか。
      const step: Record<number, [number, number]> = {
        0: [1, 0],
        1: [-1, 0],
        4: [0, 1],
        5: [0, -1],
      };
      const [sx, sz] = step[frameFacing(id)] ?? [0, 0];
      const now = Math.abs(dx) + Math.abs(dz);
      const then = Math.abs(dx + sx) + Math.abs(dz + sz);
      if (then >= now) outward++;
    }
  }
  check("枠は全部が輪の中心を向く", outward === 0, `${outward} 個が外を向く`);
  // **アイは嵌めないこと。** 嵌めた状態で建てると、探して集める工程が丸ごと消える。
  check("生成した枠にアイは嵌まっていない", eyed === 0, `${eyed} 個`);

  // 真ん中の 3x3 は空（起動するとここがポータルになる。TASKS 2-9）。
  let centre = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (at(dx, ringY, dz) !== AIR) centre++;
      // その下は床のまま（抜けていると、輪の中に立った人が落ちる）。
      if (at(dx, y0, dz) !== STONE_BRICK) centre++;
    }
  }
  check("輪の中の 3x3 は空で、その下は床", centre === 0, `${centre} マス`);

  // --- 松明（真っ暗な部屋にしない） ---
  const inner = STRONGHOLD_HALF - 1;
  const lights = [
    at(-inner, y0 + 3, 0),
    at(inner, y0 + 3, 0),
    at(0, y0 + 3, -inner),
    at(0, y0 + 3, inner),
  ];
  const wallTorches = lights.filter(
    (id) => id !== undefined && id !== AIR && supportFace(id) !== -1 && !isSolid(id),
  ).length;
  console.log(`      壁掛けの松明: ${lights.map((id) => blockName(id ?? AIR)).join(" / ")}`);
  check("壁に松明が 4 本ある", wallTorches === 4, `${wallTorches} 本`);
  // 支えの向きが壁の側でないと、読み込み直後に `breakUnsupported` で落ちる。
  const facingWall =
    supportFace(lights[0] ?? AIR) === 1 &&
    supportFace(lights[1] ?? AIR) === 0 &&
    supportFace(lights[2] ?? AIR) === 5 &&
    supportFace(lights[3] ?? AIR) === 4;
  check("松明の支えは背にした壁の側", facingWall);

  // --- 枠を作る入口が 1 つであること ---
  const states = new Set<number>();
  for (const facing of [0, 1, 4, 5]) {
    for (const eye of [false, true]) states.add(endPortalFrame(facing, eye));
  }
  check("向き 4 × アイの有無 2 で 8 通りある", states.size === 8, `${states.size} 通り`);
  check(
    "上下の向きでは枠にならない",
    endPortalFrame(2, false) === AIR && endPortalFrame(3, true) === AIR,
  );
}

/** 本当に地面の下に建つか（実際に生成してみる）。 */
function roomInWorld(): void {
  describe("要塞の部屋（生成）");

  const top = STRONGHOLD_HEIGHT + 1;

  // --- 岩盤を突き抜けないか（深さの上限を決めているのはここ） ---
  let lowest = Infinity;
  let sites = 0;
  const grounds: number[] = [];
  for (const seed of SEEDS) {
    const gen = new WorldGen(seed);
    for (let gx = -4; gx <= 4; gx++) {
      for (let gz = -4; gz <= 4; gz++) {
        const site = siteAt(STRONGHOLD_SITE, seed, gx, gz);
        if (!site) continue;
        sites++;
        const ground = gen.heightAt(site.x, site.z);
        grounds.push(ground);
        lowest = Math.min(lowest, ground - STRONGHOLD_DEPTH);
      }
    }
  }
  grounds.sort((a, b) => a - b);
  console.log(
    `      要塞 ${sites} 箇所の地面 ${grounds[0]} 〜 ${grounds[grounds.length - 1]}` +
      `（中央 ${grounds[grounds.length >> 1]}） / いちばん低い床 y=${lowest}`,
  );
  // y = 0 は岩盤。**そこより下に床を置くと、床が黙って欠けた部屋になる。**
  check("いちばん低い要塞でも床が岩盤より上", lowest >= 1, `y=${lowest}`);

  // --- 地面の下に埋まっているか（掘らないと入れないか） ---
  {
    let exposed = 0;
    let columns = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGen(seed);
      for (let gx = -3; gx <= 3; gx++) {
        for (let gz = -3; gz <= 3; gz++) {
          const site = siteAt(STRONGHOLD_SITE, seed, gx, gz);
          if (!site) continue;
          const ceiling = gen.heightAt(site.x, site.z) - STRONGHOLD_DEPTH + top;
          for (let dz = -STRONGHOLD_HALF; dz <= STRONGHOLD_HALF; dz++) {
            for (let dx = -STRONGHOLD_HALF; dx <= STRONGHOLD_HALF; dx++) {
              columns++;
              if (gen.heightAt(site.x + dx, site.z + dz) <= ceiling) exposed++;
            }
          }
        }
      }
    }
    const ratio = (exposed / columns) * 100;
    console.log(
      `      天井より地面が低い（＝外から見える）柱: ${exposed} / ${columns}` +
        `（${ratio.toFixed(2)}%）`,
    );
    // **0 は保証できません** —— 基準点 1 点の高さで建てる割り切りなので、
    // 崖の途中に当たれば露出します。ほぼ全部が埋まっていることだけを見ます。
    check("要塞はほぼ地面の下に埋まっている", ratio < 1, `${ratio.toFixed(2)}%`);
  }

  // --- 実際に生成して部屋を数える ---
  {
    let spanning = 0;
    let checked = 0;
    const lines: string[] = [];
    for (const seed of SEEDS) {
      const gen = new WorldGen(seed);
      const site = nearestStronghold(seed, 0.5, 0.5);
      if (!site) continue;
      const y0 = gen.heightAt(site.x, site.z) - STRONGHOLD_DEPTH;

      const found = new Map<string, number>();
      const chunk = new Uint8Array(CHUNK_VOLUME);
      const cx0 = (site.x - STRONGHOLD_HALF) >> 4;
      const cx1 = (site.x + STRONGHOLD_HALF) >> 4;
      const cz0 = (site.z - STRONGHOLD_HALF) >> 4;
      const cz1 = (site.z + STRONGHOLD_HALF) >> 4;
      const cy0 = y0 >> 4;
      const cy1 = (y0 + top) >> 4;
      const columns = (cx1 - cx0 + 1) * (cz1 - cz0 + 1) * (cy1 - cy0 + 1);
      if (columns > 1) spanning++;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          for (let cy = cy0; cy <= cy1; cy++) {
            chunk.fill(0);
            gen.generateChunk(cx, cy, cz, chunk);
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
              for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                  const id = chunk[(ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
                  if (id !== STONE_BRICK && !isEndPortalFrame(id)) continue;
                  found.set(
                    `${cx * CHUNK_SIZE + lx},${cy * CHUNK_SIZE + ly},${cz * CHUNK_SIZE + lz}`,
                    id,
                  );
                }
              }
            }
          }
        }
      }

      const brick = [...found.values()].filter((id) => id === STONE_BRICK).length;
      const frames = [...found.values()].filter((id) => isEndPortalFrame(id)).length;
      // 殻の 1 マスも欠けていないこと（チャンクをまたいでも同じ形が出る）。
      let missing = 0;
      for (let dy = 0; dy <= top; dy++) {
        for (let dz = -STRONGHOLD_HALF; dz <= STRONGHOLD_HALF; dz++) {
          for (let dx = -STRONGHOLD_HALF; dx <= STRONGHOLD_HALF; dx++) {
            const wall =
              dy === 0 ||
              dy === top ||
              Math.abs(dx) === STRONGHOLD_HALF ||
              Math.abs(dz) === STRONGHOLD_HALF;
            if (!wall) continue;
            if (found.get(`${site.x + dx},${y0 + dy},${site.z + dz}`) !== STONE_BRICK) missing++;
          }
        }
      }
      // 殻の枚数は形から出す（数を焼き付けると、部屋を広げたときに嘘になる）。
      const side = STRONGHOLD_HALF * 2 + 1;
      const inner = STRONGHOLD_HALF * 2 - 1;
      const expected = side * side * (top + 1) - inner * inner * (top - 1);
      const ok = brick === expected && frames === STRONGHOLD_FRAMES && missing === 0;
      lines.push(
        `${seed}: (${site.x}, ${site.z}) y=${y0} レンガ ${brick}/${expected} 枠 ${frames}` +
          ` チャンク ${columns} 個 欠け ${missing}${ok ? "" : " ← NG"}`,
      );
      checked++;
    }
    for (const line of lines) console.log(`      ${line}`);
    check("4 つの種すべてで最寄りの要塞を生成できた", checked === SEEDS.length, `${checked} 件`);
    const broken = lines.filter((l) => l.endsWith("NG"));
    check("どの要塞も欠けずに建つ", broken.length === 0, broken.join(" / "));
    // **1 チャンクに収まった要塞だけを見ていると、端の欠けを見逃す。**
    check("複数のチャンクにまたがる要塞が含まれている", spanning > 0, `${spanning} / ${checked} 件`);
  }

  // --- 生成の順に依らないか ---
  {
    const seed = SEEDS[0];
    const gen = new WorldGen(seed);
    const other = new WorldGen(seed);
    const site = nearestStronghold(seed, 0.5, 0.5);
    if (!site) return;
    const cx = site.x >> 4;
    const cz = site.z >> 4;
    const cy = (gen.heightAt(site.x, site.z) - STRONGHOLD_DEPTH) >> 4;
    const a = new Uint8Array(CHUNK_VOLUME);
    const b = new Uint8Array(CHUNK_VOLUME);
    // 片方は周りを先に作ってから、もう片方はいきなり真ん中を作る。
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) other.generateChunk(cx + dx, cy, cz + dz, b);
    }
    gen.generateChunk(cx, cy, cz, a);
    other.generateChunk(cx, cy, cz, b);
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    console.log(`      生成の順を変えて一致 ${same} / ${a.length}`);
    check("生成の順に依らない", same === a.length);
  }

  // --- 費用（要塞の掛かる段と掛からない段を、同じ土俵で比べる） ---
  {
    const seed = SEEDS[1];
    const gen = new WorldGen(seed);
    const buffer = new Uint8Array(CHUNK_VOLUME);
    const site = nearestStronghold(seed, 0.5, 0.5);
    if (!site) return;
    const band = (gen.heightAt(site.x, site.z) - STRONGHOLD_DEPTH) >> 4;
    const timeOf = (run: (i: number) => void) => {
      const times: number[] = [];
      for (let i = 0; i < 24; i++) {
        const t0 = performance.now();
        run(i);
        times.push(performance.now() - t0);
      }
      times.sort((x, y) => x - y);
      return times[times.length >> 1];
    };
    const cx = site.x >> 4;
    const cz = site.z >> 4;
    // **比べる相手は「同じ高さの段で、要塞から離れた列」**にすること。
    // 上の段と比べると、地面より上（ほぼ空気）と比べることになって差が読めない。
    // グリッドは 24 列ごとなので、12 列ずらせばマスの真ん中で必ず離れる。
    const withRoom = timeOf(() => gen.generateChunk(cx, band, cz, buffer));
    const without = timeOf(() => gen.generateChunk(cx + 12, band, cz + 12, buffer));
    console.log(
      `      チャンク 1 個: 要塞の掛かる列 ${withRoom.toFixed(3)}ms` +
        ` / 同じ高さで離れた列 ${without.toFixed(3)}ms`,
    );
    // 予算は 1 フレーム 3ms（`constants.ts` の `GENERATE_BUDGET_MS`）。
    check("要塞のぶんで予算を食い潰さない", withRoom < 1.5, `${withRoom.toFixed(3)}ms`);
  }
}

/** 投げたときの注文（`Shot`）そのもの。 */
function eyeThrow(): void {
  const seed = SEEDS[0];
  const [x, z] = SPOTS[1];
  const y = 72.6;
  const shot = eyeShot(seed, x, y, z);
  const site = nearestStronghold(seed, x, z);

  check("エンダーアイを投げる注文が出る", !!shot && !!site);
  if (!shot || !site) return;

  check("飛ばすのはエンダーアイ", shot.kind === "eye", shot.kind);
  // 表に「壁を抜ける」が無いと、要塞は地面の下なので投げた場所から動かない。
  check(
    "エンダーアイは壁を抜ける飛び道具のまま",
    projectileDef("eye").onBlock === "pass",
    projectileDef("eye").onBlock,
  );

  check(
    "投げ出す位置は渡した目の高さそのまま",
    shot.x === x && shot.y === y && shot.z === z,
    `(${shot.x}, ${shot.y}, ${shot.z})`,
  );

  // **視線ではなく要塞のほうを向くこと。** ここが逆だと、ただの飛び道具になる。
  const dot =
    (shot.dx * (site.x - x) + shot.dz * (site.z - z)) /
    Math.hypot(shot.dx, shot.dz) /
    site.distance;
  console.log(
    `      投げた向き (${shot.dx.toFixed(3)}, ${shot.dy.toFixed(3)}, ${shot.dz.toFixed(3)})` +
      ` / 要塞まで ${site.distance.toFixed(0)} マス`,
  );
  check("投げた向きが要塞のほうを向く", dot > 1 - 1e-9, `内積 ${dot.toFixed(6)}`);

  // **少し上を向くこと。** 0 だと丘の向こうへ行った先が見えない。
  check("少し上を向いて飛ぶ", shot.dy > 0 && shot.dy === EYE_RISE, `${shot.dy}`);
  check(
    "上向きは水平より小さい（真上に飛んでいかない）",
    EYE_RISE < 1,
    `${EYE_RISE}`,
  );

  // 撃ち手の印は既定（プレイヤー）のまま。**ダメージを載せないこと** ——
  // 案内役なので当たり判定ごと素通りする（`rules/projectiles.md`）。
  check("案内役なのでダメージを持たない", !shot.damage, `${shot.damage ?? 0}`);
}

/** `nearestStronghold` を広く総当りしたもの。**答え合わせ用。** */
function bruteNearest(
  seed: number,
  x: number,
  z: number,
  span: number,
): { x: number; z: number; distance: number } | null {
  const cell = cellSize(STRONGHOLD_SITE);
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  let best: { x: number; z: number; distance: number } | null = null;
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const site = siteAt(STRONGHOLD_SITE, seed, gx + dx, gz + dz);
      if (!site) continue;
      const distance = Math.hypot(site.x - x, site.z - z);
      if (!best || distance < best.distance) best = { ...site, distance };
    }
  }
  return best;
}

/** `stronghold.ts` を判断だけのファイルのまま保つ。 */
function sourceGuards(): void {
  const source = sourceOf("src/stronghold.ts");
  const leaked = [
    "Mesh",
    "Scene",
    "Vector3",
    "document",
    "HTMLElement",
    "Math.random(",
    "AudioContext",
  ].filter((w) => source.includes(w));
  check("stronghold.ts に描画・DOM・乱数が無い", leaked.length === 0, leaked.join(" "));

  // **`projectiles.ts` は型でしか使わないこと**（`mobs.ts` と同じ作法）。
  // 実体を掴むと「投げる」までここでやり始めて、飛び方の判断が 2 か所に散る。
  const imports = [...source.matchAll(/^import\s+(type\s+)?\{[^}]*\}\s+from\s+"\.\/projectiles"/gm)];
  check(
    "projectiles.ts は型でしか import していない",
    imports.length === 1 && !!imports[0][1],
    imports.length ? imports[0][0].trim() : "import が無い",
  );

  // **場所を決めるのは `structures.ts` の `siteAt()` 1 か所。** ここに座標のハッシュを
  // 写すと、建てる側（TASKS 2-8）と食い違っても気付けない（地面の下なので掘るまで分からない）。
  check(
    "置き場所のハッシュを写していない（siteAt に聞いている）",
    source.includes("siteAt(") && !source.includes("Math.imul("),
    source.includes("Math.imul(") ? "自前のハッシュがある" : "",
  );

  // `main.ts` が向きを自分で計算し始めていないか。
  const main = sourceOf("src/main.ts");
  check(
    "main.ts は方角を自分で決めていない",
    main.includes("eyeShot(") && !main.includes("nearestStronghold("),
    main.includes("nearestStronghold(") ? "main.ts が要塞を探している" : "",
  );

  // グリッドの間隔は 1 マス以上（0 にすると `cellSize` が 0 になって割り算が壊れる）。
  check(
    "グリッドの間隔が正の列数",
    Number.isInteger(STRONGHOLD_SPACING) && STRONGHOLD_SPACING >= 1,
    `${STRONGHOLD_SPACING} 列 = ${STRONGHOLD_SPACING * CHUNK_SIZE} マス`,
  );
}
