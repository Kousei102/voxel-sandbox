import { CHUNK_SIZE } from "../src/constants";
import { projectileDef } from "../src/projectiles";
import {
  EYE_RISE,
  STRONGHOLD_CHANCE,
  STRONGHOLD_SEARCH,
  STRONGHOLD_SITE,
  STRONGHOLD_SPACING,
  eyeShot,
  nearestStronghold,
  strongholdDirection,
} from "../src/stronghold";
import { cellSize, placementsFor, siteAt, type StructureDef } from "../src/structures";
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
  sourceGuards();
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
