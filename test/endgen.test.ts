import { AIR, BEDROCK, END_STONE, isSolid } from "../src/blocks";
import { CHUNK_LAYERS, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from "../src/constants";
import {
  END_SPAWN,
  EndGen,
  ISLAND_RADIUS,
  ISLAND_SURFACE,
  LANDING_RADIUS,
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
  return gen.blockAt(wy, shape.top, shape.bottom);
}

/** その列の一番上の地面（無ければ -1）。 */
function surfaceOf(gen: EndGen, wx: number, wz: number): number {
  const shape = gen.shapeAt(wx, wz);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (gen.blockAt(y, shape.top, shape.bottom) === END_STONE) return y;
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
    const cut = (y: number) => gen.blockAt(y, top, bottom);
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
    check("虚空の列は全部空", gen.blockAt(0, -1, 0) === AIR && gen.blockAt(64, -1, 0) === AIR);
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

  // --- 実際に作ってみる ---------------------------------------------------

  {
    const gen = new EndGen(12345);
    const columns: Uint8Array[] = [];
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) columns.push(stack(gen, cx, cz));
    }

    let others = 0;
    let stone = 0;
    let floating = 0;
    for (const all of columns) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          // その列の地面は 1 続きの塊であること（浮いた板が離れて出ない）。
          let runs = 0;
          let prev = AIR;
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            const id = at(all, lx, y, lz);
            if (id === END_STONE) stone++;
            else if (id !== AIR) others++;
            if (isSolid(id) && !isSolid(prev)) runs++;
            prev = id;
          }
          if (runs > 1) floating++;
        }
      }
    }
    console.log(
      `      原点まわり 9 列: エンドストーン ${stone} マス / それ以外の地面 ${others} マス / ` +
        `2 段になった列 ${floating}`,
    );
    check("エンドストーン以外の地面が無い", others === 0, `${others} マス`);
    check("地面が生成される", stone > 0);
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
