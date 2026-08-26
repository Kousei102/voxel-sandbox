import { AIR, BEDROCK, END_CRYSTAL, END_STONE, OBSIDIAN, isSolid } from "../src/blocks";
import { CHUNK_LAYERS, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from "../src/constants";
import {
  CRYSTAL_SPOTS,
  EDGE_MIN_REACH,
  END_SPAWN,
  EndGen,
  ISLAND_RADIUS,
  ISLAND_SURFACE,
  LANDING_RADIUS,
  NO_CRYSTAL,
  NO_PILLAR,
  PILLARS,
  PILLAR_COUNT,
  PILLAR_MAX_RADIUS,
  PILLAR_RING,
  crystalTopAt,
  pillarTopAt,
} from "../src/endgen";
import { WorldGen } from "../src/worldgen";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 1 つの列（16x16）を上から下まで作って 1 本の配列にする
 * （`nethergen.test.ts` と同じ並べ方）。
 */
function stack(gen: EndGen, cx: number, cz: number): Uint8Array {
  const all = new Uint8Array(WORLD_HEIGHT * CHUNK_SIZE * CHUNK_SIZE);
  const chunk = new Uint8Array(CHUNK_VOLUME);
  for (let cy = 0; cy < CHUNK_LAYERS; cy++) {
    chunk.fill(0);
    gen.generateChunk(cx, cy, cz, chunk);
    all.set(chunk, cy * CHUNK_VOLUME);
  }
  return all;
}

const at = (all: Uint8Array, lx: number, wy: number, lz: number) =>
  all[(wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];

/** その (x, z) の 1 マスを直に作って返す（列をまるごと作らずに 1 点だけ見たいとき）。 */
function voxel(gen: EndGen, wx: number, wy: number, wz: number): number {
  const shape = gen.shapeAt(wx, wz);
  return gen.blockAt(wy, shape.top, shape.bottom, shape.pillar, shape.crystal);
}

/** その列の一番上の地面（無ければ -1）。**柱は数えない**（島の上面が欲しいので）。 */
function surfaceOf(gen: EndGen, wx: number, wz: number): number {
  const shape = gen.shapeAt(wx, wz);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (gen.blockAt(y, shape.top, shape.bottom, shape.pillar, shape.crystal) === END_STONE) {
      return y;
    }
  }
  return -1;
}

/** その列の一番上の**固いもの**（柱もクリスタルも数える。無ければ -1）。 */
function topSolidOf(gen: EndGen, wx: number, wz: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (voxel(gen, wx, y, wz) !== AIR) return y;
  }
  return -1;
}

/** その列の一番上の**黒曜石**（＝柱の上面。無ければ -1）。 */
function topObsidianOf(gen: EndGen, wx: number, wz: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (voxel(gen, wx, y, wz) === OBSIDIAN) return y;
  }
  return -1;
}

export function run(): void {
  describe("エンドの地形");

  const source = sourceOf("src/endgen.ts");
  const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("endgen.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

  // --- 断面（`blockAt` を直に呼ぶ） ---------------------------------------

  {
    const gen = new EndGen(12345);
    const top = 48;
    const bottom = 31;
    const cut = (y: number) => gen.blockAt(y, top, bottom, NO_PILLAR, NO_CRYSTAL);
    console.log(
      `      上面 ${top} / 下面 ${bottom} の断面: ` +
        `y0 ${cut(0)}  y${bottom - 1} ${cut(bottom - 1)}  y${bottom} ${cut(bottom)}  ` +
        `y${top} ${cut(top)}  y${top + 1} ${cut(top + 1)}  y127 ${cut(127)}`,
    );
    check("上面と下面のあいだがエンドストーン", cut(bottom) === END_STONE && cut(top) === END_STONE);
    check("下面より下は空", cut(bottom - 1) === AIR && cut(0) === AIR);
    check("上面より上は空", cut(top + 1) === AIR && cut(127) === AIR);
    // **岩盤を置かないこと。** 底を塞ぐと、落ちた人が世界の底に立ってしまい、
    // 虚空の意味（落ちたら死ぬ）がまるごと消える。
    check("底に岩盤が無い", cut(0) !== BEDROCK && cut(1) !== BEDROCK);
    // 虚空の列は上から下まで空。
    check(
      "虚空の列は全部空",
      gen.blockAt(0, -1, 0, NO_PILLAR, NO_CRYSTAL) === AIR &&
        gen.blockAt(64, -1, 0, NO_PILLAR, NO_CRYSTAL) === AIR,
    );
    // **虚空の列には柱も置かない。** `pillarTopAt()` は島の形を知らないので、
    // 「柱が立っていることになっている虚空の列」を渡されても何も置いてはいけない
    // （置くと、島の外に黒曜石の柱が浮く）。
    check(
      "虚空の列には柱も立たない",
      gen.blockAt(70, -1, 0, ISLAND_SURFACE + 20, NO_CRYSTAL) === AIR &&
        gen.blockAt(50, -1, 0, ISLAND_SURFACE + 20, NO_CRYSTAL) === AIR,
    );
    // **クリスタルも同じ**（`crystalTopAt()` も島の形を知らない）。虚空の列に
    // 置くと、島の外の空中にクリスタルだけが浮く。
    check(
      "虚空の列にはクリスタルも載らない",
      gen.blockAt(ISLAND_SURFACE + 21, -1, 0, ISLAND_SURFACE + 20, ISLAND_SURFACE + 21) === AIR,
    );
  }

  // --- 島がある。そして島だけがある ---------------------------------------

  {
    // **出る場所が地面の上であること。** ここが崩れると、ポータルを通った人が
    // 虚空に出て即死する（`portaltravel.ts` の `arriveThrough` はここを目指す）。
    const rows: string[] = [];
    let bad = 0;
    for (const seed of [12345, 4242, 999, 777, 31337]) {
      const gen = new EndGen(seed);
      const surface = surfaceOf(gen, END_SPAWN.x, END_SPAWN.z);
      const headroom =
        voxel(gen, END_SPAWN.x, surface + 1, END_SPAWN.z) === AIR &&
        voxel(gen, END_SPAWN.x, surface + 2, END_SPAWN.z) === AIR;
      if (surface < 0 || !headroom || surface + 1 !== END_SPAWN.y) bad++;
      rows.push(`${seed}:y${surface}`);
    }
    console.log(`      出る場所 (${END_SPAWN.x}, ${END_SPAWN.z}) の地面: ${rows.join(" / ")}`);
    check("どの種でも出る場所が地面の上にある", bad === 0, `${bad} / 5 種`);
    check("出る場所の高さが `END_SPAWN.y` と合っている", END_SPAWN.y === ISLAND_SURFACE + 1);
  }

  {
    // **出る所のまわりは平ら。** 崖の途中に出ると、出た瞬間に落ちる。
    const gen = new EndGen(12345);
    let uneven = 0;
    let standable = 0;
    let spots = 0;
    for (let z = -LANDING_RADIUS; z <= LANDING_RADIUS; z++) {
      for (let x = -LANDING_RADIUS; x <= LANDING_RADIUS; x++) {
        if (Math.hypot(x, z) > LANDING_RADIUS) continue;
        spots++;
        const surface = surfaceOf(gen, x, z);
        if (surface !== ISLAND_SURFACE) uneven++;
        if (voxel(gen, x, surface + 1, z) === AIR && voxel(gen, x, surface + 2, z) === AIR) {
          standable++;
        }
      }
    }
    console.log(
      `      出る所のまわり ${spots} マス: 高さの違うもの ${uneven} / 立てる ${standable}`,
    );
    check("出る所のまわりが平ら", uneven === 0, `${uneven} マス`);
    check("出る所のまわりが全部立てる", standable === spots, `${standable} / ${spots}`);
  }

  {
    // **島は有限。** 遠くが虚空でないと、エンドが「ただの平原」になる。
    const gen = new EndGen(12345);
    const far = [
      [ISLAND_RADIUS * 3, 0],
      [0, ISLAND_RADIUS * 3],
      [-ISLAND_RADIUS * 4, ISLAND_RADIUS * 4],
      [600, -600],
    ];
    let solid = 0;
    for (const [x, z] of far) {
      for (let y = 0; y < WORLD_HEIGHT; y++) if (voxel(gen, x, y, z) !== AIR) solid++;
    }
    console.log(`      島から離れた ${far.length} 列: 地面 ${solid} マス`);
    check("島の外は上から下まで虚空", solid === 0, `${solid} マス`);
  }

  {
    // 島の広がり方（触ったときに壊れ方が見えるように、実測を出しておく）。
    const gen = new EndGen(12345);
    let land = 0;
    let stone = 0;
    let minTop = WORLD_HEIGHT;
    let maxTop = -1;
    let minBottom = WORLD_HEIGHT;
    let thin = 0;
    const span = Math.ceil(ISLAND_RADIUS * 1.5);
    for (let z = -span; z <= span; z++) {
      for (let x = -span; x <= span; x++) {
        const shape = gen.shapeAt(x, z);
        if (shape.top < 0) continue;
        land++;
        const thickness = shape.top - shape.bottom + 1;
        stone += thickness;
        if (thickness < 3) thin++;
        minTop = Math.min(minTop, shape.top);
        maxTop = Math.max(maxTop, shape.top);
        minBottom = Math.min(minBottom, shape.bottom);
      }
    }
    const disc = Math.PI * ISLAND_RADIUS * ISLAND_RADIUS;
    console.log(
      `      島: 地面の列 ${land}（半径 ${ISLAND_RADIUS} の円 ${disc.toFixed(0)} の ` +
        `${((land / disc) * 100).toFixed(0)}%） エンドストーン ${stone} マス  ` +
        `上面 ${minTop}〜${maxTop} / いちばん深い下面 ${minBottom}  厚み 3 未満 ${thin} 列`,
    );
    check("島がある", land > disc * 0.5, `${land} 列`);
    check("薄すぎる所が無い", thin === 0, `${thin} 列`);
    // **世界の底（0）にも上端（127）にも刺さらないこと。**
    check("島が世界の底に刺さらない", minBottom > 1, `下面 ${minBottom}`);
    check("島が世界の上端に届かない", maxTop < WORLD_HEIGHT - 2, `上面 ${maxTop}`);
  }

  {
    // **ふちが揺れていること**（真円だと、遠くから見て人工物に見える）。
    // **面積では見られない** —— 真円でも面積は半径 48 の円ちょうどになるので、
    // 「円の何 % か」の判定は真円をそのまま通してしまう。ふちの半径そのものを測る。
    const gen = new EndGen(12345);
    let min = Infinity;
    let max = -Infinity;
    for (let deg = 0; deg < 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      const reach = gen.reachAt(
        Math.cos(rad) * ISLAND_RADIUS,
        Math.sin(rad) * ISLAND_RADIUS,
      );
      min = Math.min(min, reach);
      max = Math.max(max, reach);
    }
    console.log(
      `      ふちの半径: ${min.toFixed(1)}〜${max.toFixed(1)}（目安 ${ISLAND_RADIUS}。` +
        `振れ幅 ${(max - min).toFixed(1)} マス）`,
    );
    check("ふちが揺れている（真円でない）", max - min > ISLAND_RADIUS * 0.1, `振れ幅 ${(max - min).toFixed(1)}`);
    // 揺れすぎると、出る場所（島の中心）まで虚空になる。
    check("ふちが中心まで食い込まない", min > LANDING_RADIUS * 2, `いちばん狭い所 ${min.toFixed(1)}`);
  }

  // --- 黒曜石の柱 ---------------------------------------------------------

  {
    // 表そのもの。**位置も高さも種に依らない**ので、ここは 1 度出せば足りる。
    const rows = PILLARS.map(
      (p) => `(${p.x},${p.z}) r${p.radius} h${p.height}→y${p.top}`,
    );
    console.log(`      柱 ${PILLARS.length} 本: ${rows.join(" / ")}`);
    check("本数が `PILLAR_COUNT` と合っている", PILLARS.length === PILLAR_COUNT, `${PILLARS.length} 本`);
    const tallest = Math.max(...PILLARS.map((p) => p.top));
    check("いちばん高い柱が世界の上端に届かない", tallest < WORLD_HEIGHT - 2, `y${tallest}`);
    check(
      "上面の高さが `ISLAND_SURFACE + height` と合っている",
      PILLARS.every((p) => p.top === ISLAND_SURFACE + p.height),
    );
    check(
      "太さが `PILLAR_MAX_RADIUS` を超えない",
      PILLARS.every((p) => p.radius <= PILLAR_MAX_RADIUS),
    );

    // **高さが同じ柱ばかりだと輪が壁に見える**（本家は 12〜39 でばらばら）。
    const heights = PILLARS.map((p) => p.height);
    const spread = Math.max(...heights) - Math.min(...heights);
    // 隣どうしが単調に増える／減るだけだと、輪がぐるりと一周する坂になる。
    let monotone = 0;
    for (let i = 0; i < PILLARS.length; i++) {
      const a = heights[i];
      const b = heights[(i + 1) % PILLARS.length];
      const c = heights[(i + 2) % PILLARS.length];
      if ((b - a > 0) === (c - b > 0)) monotone++;
    }
    console.log(`      高さ: ${heights.join(" ")}（振れ幅 ${spread} / 同じ向きに続く所 ${monotone}）`);
    check("高さがばらけている", spread >= 20, `振れ幅 ${spread}`);
    check("輪が一周する坂になっていない", monotone <= PILLARS.length / 2, `${monotone} 箇所`);
  }

  {
    // **柱が虚空に浮かないこと。** 実測した最小のふち（ある種で 39.1）で線を引くと
    // 別の種で浮くので、**式のほう**（`EDGE_MIN_REACH`）を判定に置く。
    const outer = Math.max(...PILLARS.map((p) => Math.hypot(p.x, p.z) + p.radius));
    const inner = Math.min(...PILLARS.map((p) => Math.hypot(p.x, p.z) - p.radius));
    console.log(
      `      柱の輪: 内 ${inner.toFixed(1)}〜外 ${outer.toFixed(1)}  ` +
        `（島の最小のふち ${EDGE_MIN_REACH.toFixed(1)} / 出る所 ${LANDING_RADIUS}）`,
    );
    check("柱の外側が島の最小のふちの内側にある", outer < EDGE_MIN_REACH, `${outer.toFixed(1)}`);
    // **出る所（`LANDING_RADIUS`）に柱を立てないこと** —— 出た瞬間に柱の中に埋まる。
    check("柱が出る所に掛からない", inner > LANDING_RADIUS, `内 ${inner.toFixed(1)}`);

    // 柱どうしがくっつくと、輪ではなく壁になる。
    let closest = Infinity;
    for (let i = 0; i < PILLARS.length; i++) {
      for (let j = i + 1; j < PILLARS.length; j++) {
        const a = PILLARS[i];
        const b = PILLARS[j];
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius);
      }
    }
    console.log(`      柱どうしのいちばん狭い隙間: ${closest.toFixed(1)} マス`);
    check("柱どうしが繋がっていない", closest > 1, `${closest.toFixed(1)} マス`);
  }

  {
    // **走査の帯（`PILLAR_NEAR` / `PILLAR_FAR`）が答えを変えないこと。**
    // `PILLAR_RING ± PILLAR_MAX_RADIUS` で決め打ちにすると、柱の中心が
    // マスに丸めてあるぶんだけ**ふちが 1 マス欠ける**（欠けた所から中が見える）。
    const span = Math.ceil(PILLAR_RING + PILLAR_MAX_RADIUS + 3);
    let columns = 0;
    let differs = 0;
    for (let z = -span; z <= span; z++) {
      for (let x = -span; x <= span; x++) {
        // 帯を通さない総当り（表を全部見る）。
        let brute = NO_PILLAR;
        for (const p of PILLARS) {
          const dx = x - p.x;
          const dz = z - p.z;
          if (dx * dx + dz * dz <= p.radius * p.radius) {
            brute = p.top;
            break;
          }
        }
        if (brute !== NO_PILLAR) columns++;
        if (pillarTopAt(x, z) !== brute) differs++;
      }
    }
    console.log(
      `      柱の列 ${columns} マス（${(span * 2 + 1) ** 2} マスを総当りと突き合わせ）: ` +
        `食い違い ${differs}`,
    );
    check("柱の列がある", columns > 0, `${columns} マス`);
    check("帯で早く切っても答えが変わらない", differs === 0, `${differs} マス`);
  }

  {
    // **実際に建てて確かめる。** 5 種とも、10 本すべてについて
    // 「根元から上面まで隙間なく黒曜石」「上面が平ら」「上に 2 マス空いている」。
    const rows: string[] = [];
    let floatingBase = 0;
    let gaps = 0;
    let uneven = 0;
    let noHeadroom = 0;
    let checked = 0;
    for (const seed of [12345, 4242, 999, 777, 31337]) {
      const gen = new EndGen(seed);
      let worstBase = Infinity;
      for (const pillar of PILLARS) {
        for (let dz = -pillar.radius; dz <= pillar.radius; dz++) {
          for (let dx = -pillar.radius; dx <= pillar.radius; dx++) {
            if (dx * dx + dz * dz > pillar.radius * pillar.radius) continue;
            const x = pillar.x + dx;
            const z = pillar.z + dz;
            const shape = gen.shapeAt(x, z);
            checked++;
            // 島がその列に無ければ、柱は 1 マスも建たない（＝浮いた柱）。
            if (shape.top < 0) {
              floatingBase++;
              continue;
            }
            worstBase = Math.min(worstBase, shape.top);
            // 根元（島の上面の 1 つ上）から上面まで隙間なく黒曜石。
            for (let y = shape.top + 1; y <= pillar.top; y++) {
              if (
                gen.blockAt(y, shape.top, shape.bottom, shape.pillar, shape.crystal) !== OBSIDIAN
              ) {
                gaps++;
              }
            }
            // **黒曜石の上面**で見ること（`topSolidOf` は中心の列でクリスタルを拾う）。
            if (topObsidianOf(gen, x, z) !== pillar.top) uneven++;
            // 上に 2 マス空いていること。**真ん中の 1 マスだけはクリスタルが載る**
            // （そこも空だと、載せる場所が無いのに空いていることになる）。
            const centre = x === pillar.x && z === pillar.z;
            const above = voxel(gen, x, pillar.top + 1, z);
            const wanted = centre ? END_CRYSTAL : AIR;
            if (above !== wanted || voxel(gen, x, pillar.top + 2, z) !== AIR) noHeadroom++;
          }
        }
      }
      rows.push(`${seed}:根元の最低 y${worstBase}`);
    }
    console.log(
      `      柱の列 ${checked} マス（5 種 x 10 本）: 浮いた根元 ${floatingBase} / ` +
        `隙間 ${gaps} / 上面が凸凹 ${uneven} / 頭上が塞がっている ${noHeadroom}`,
    );
    console.log(`      島の上面（柱の根元）: ${rows.join(" / ")}`);
    check("どの種でも柱が虚空に浮かない", floatingBase === 0, `${floatingBase} マス`);
    check("根元から上面まで隙間が無い", gaps === 0, `${gaps} マス`);
    check("柱の上面が平ら", uneven === 0, `${uneven} マス`);
    check("柱の上が空いていて、真ん中にだけクリスタルが載る", noHeadroom === 0, `${noHeadroom} マス`);
  }

  // --- エンドクリスタル ---------------------------------------------------

  {
    // **居場所は柱から引いていること。** 写して 2 か所に持つと、柱を動かしたときに
    // 柱の無い所にクリスタルが浮く（空中なので、下から見上げるまで気付けない）。
    let offPillar = 0;
    let wrongHeight = 0;
    for (const spot of CRYSTAL_SPOTS) {
      const pillar = PILLARS.find((p) => p.x === spot.x && p.z === spot.z);
      if (!pillar) offPillar++;
      else if (spot.y !== pillar.top + 1) wrongHeight++;
    }
    console.log(
      `      クリスタル ${CRYSTAL_SPOTS.length} 個 / 柱 ${PILLAR_COUNT} 本: ` +
        `柱の上に無い ${offPillar} / 高さ違い ${wrongHeight}  ` +
        `y ${Math.min(...CRYSTAL_SPOTS.map((s) => s.y))}〜${Math.max(
          ...CRYSTAL_SPOTS.map((s) => s.y),
        )}`,
    );
    check("柱 1 本につきクリスタル 1 個", CRYSTAL_SPOTS.length === PILLAR_COUNT);
    check("どれも柱の中心に載っている", offPillar === 0, `${offPillar} 個`);
    check("どれも柱の上面のすぐ上", wrongHeight === 0, `${wrongHeight} 個`);
  }

  {
    // `crystalTopAt()` と表が食い違わないこと。**柱の中心の 1 列だけ**が返る
    // （太い柱でも、上に載るのは 1 個）。
    let differs = 0;
    let hits = 0;
    const span = PILLAR_RING + PILLAR_MAX_RADIUS + 2;
    for (let z = -span; z <= span; z++) {
      for (let x = -span; x <= span; x++) {
        const spot = CRYSTAL_SPOTS.find((s) => s.x === x && s.z === z);
        const want = spot ? spot.y : NO_CRYSTAL;
        if (spot) hits++;
        if (crystalTopAt(x, z) !== want) differs++;
      }
    }
    console.log(
      `      ${(span * 2 + 1) ** 2} マスを表と突き合わせ: 載る列 ${hits} / 食い違い ${differs}`,
    );
    check("クリスタルの載る列は柱の本数ぶんだけ", hits === PILLAR_COUNT, `${hits} 列`);
    check("crystalTopAt が表と一致する", differs === 0, `${differs} マス`);
  }

  {
    // **実際に建てて確かめる。** 5 種とも 10 個が載り、種を変えても同じ場所。
    let missing = 0;
    let checked = 0;
    let strays = 0;
    for (const seed of [12345, 4242, 999, 777, 31337]) {
      const gen = new EndGen(seed);
      for (const spot of CRYSTAL_SPOTS) {
        checked++;
        if (voxel(gen, spot.x, spot.y, spot.z) !== END_CRYSTAL) missing++;
        // 真下は柱（黒曜石）であること —— 空中に浮いていない。
        if (voxel(gen, spot.x, spot.y - 1, spot.z) !== OBSIDIAN) strays++;
      }
    }
    console.log(
      `      5 種 x ${PILLAR_COUNT} 個 = ${checked} 個: 載っていない ${missing} / ` +
        `真下が柱でない ${strays}`,
    );
    check("どの種でもクリスタルが載る", missing === 0, `${missing} 個`);
    check("どれも柱の上に載っている（浮いていない）", strays === 0, `${strays} 個`);
  }

  {
    // **柱は種に依らない。** 位置も高さも固定なので、種を変えても同じ所に建つ
    // （ドラゴンの戦場（2-13）が誰のワールドでも同じ形になる、という取り決め）。
    const a = new EndGen(12345);
    const b = new EndGen(999);
    let same = 0;
    let total = 0;
    const span = PILLAR_RING + PILLAR_MAX_RADIUS + 2;
    for (let z = -span; z <= span; z += 1) {
      for (let x = -span; x <= span; x += 1) {
        if (pillarTopAt(x, z) === NO_PILLAR) continue;
        total++;
        if (topSolidOf(a, x, z) === topSolidOf(b, x, z)) same++;
      }
    }
    console.log(`      柱の列 ${total} マス: 種 12345 と 999 で上面が一致 ${same}`);
    check("柱は種が違っても同じ高さに建つ", same === total, `${same} / ${total}`);
  }

  // --- 実際に作ってみる ---------------------------------------------------

  {
    const gen = new EndGen(12345);
    const columns: Uint8Array[] = [];
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) columns.push(stack(gen, cx, cz));
    }

    let others = 0;
    let stone = 0;
    let obsidian = 0;
    let crystals = 0;
    let floating = 0;
    for (const all of columns) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          // その列の地面は 1 続きの塊であること（浮いた板が離れて出ない）。
          // **柱もここに乗る** —— 島の上面から生やすので、根元に隙間ができれば
          // 「2 段になった列」として出る。
          let runs = 0;
          let prev = AIR;
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            const id = at(all, lx, y, lz);
            if (id === END_STONE) stone++;
            else if (id === OBSIDIAN) obsidian++;
            else if (id === END_CRYSTAL) crystals++;
            else if (id !== AIR) others++;
            if (isSolid(id) && !isSolid(prev)) runs++;
            prev = id;
          }
          if (runs > 1) floating++;
        }
      }
    }
    console.log(
      `      原点まわり 9 列: エンドストーン ${stone} マス / 黒曜石 ${obsidian} マス / ` +
        `クリスタル ${crystals} マス / それ以外の地面 ${others} マス / ` +
        `2 段になった列 ${floating}`,
    );
    check("エンドストーン・黒曜石・クリスタル以外の地面が無い", others === 0, `${others} マス`);
    check("地面が生成される", stone > 0);
    check("柱が実際に生成される", obsidian > 0, `${obsidian} マス`);
    check("島は 1 枚（浮いた板が無い）", floating === 0, `${floating} 列`);
  }

  {
    // 同じ種なら同じ地形（セーブは種しか持たない。ここが崩れると、開き直すたびに
    // 島の形が変わって、置いたものが宙に浮く）。
    const gen = new EndGen(12345);
    const again = new EndGen(12345);
    const other = new EndGen(999);
    // **島の中と、ふちを跨ぐ所の両方を見ること。** 中だけだと上面のうねりしか比べられず、
    // ふちだけだと（どちらの種でも虚空の所が多くて）差が出にくい。
    const columns: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 0],
    ];
    let total = 0;
    let same = 0;
    let differs = 0;
    for (const [cx, cz] of columns) {
      const a = stack(gen, cx, cz);
      const b = stack(again, cx, cz);
      const c = stack(other, cx, cz);
      total += a.length;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) same++;
        if (a[i] !== c[i]) differs++;
      }
    }
    console.log(
      `      ${columns.length} 列: 同じ種で一致 ${same} / ${total}  違う種との差 ${differs} マス`,
    );
    check("同じ種なら同じ地形", same === total);
    check("種が違えば違う地形", differs > 0, `${differs} マス`);
  }

  {
    // 速さ。**オーバーワールドと同じ土俵で測って比べる**（この箱の速さは日によって
    // 変わるので、絶対値だけで判定しない）。
    const over = new WorldGen(4242);
    const end = new EndGen(4242);
    const buffer = new Uint8Array(CHUNK_VOLUME);
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
    // 列のキャッシュに当たらないよう、毎回違う列を作る（島の上を通る所で測る）。
    const overCost = timeOf((i) => over.generateChunk(100 + i, 2, 100 + i, buffer));
    const endCost = timeOf((i) => end.generateChunk(i - 12, 2, i - 12, buffer));
    console.log(
      `      チャンク 1 個: エンド ${endCost.toFixed(3)}ms / オーバーワールド ${overCost.toFixed(3)}ms`,
    );
    check("生成がオーバーワールドより重くない", endCost <= overCost * 1.5, `${endCost.toFixed(3)}ms`);
  }
}
