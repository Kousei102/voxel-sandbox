import { AIR, BEDROCK, GLOWSTONE, LAVA, NETHERRACK, SOUL_SAND, isSolid } from "../src/blocks";
import { CHUNK_LAYERS, CHUNK_SIZE, CHUNK_VOLUME, WORLD_HEIGHT } from "../src/constants";
import { NETHER_LAVA_LEVEL, NetherGen } from "../src/nethergen";
import { WorldGen } from "../src/worldgen";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 1 つの列（16x16）を上から下まで作って 1 本の配列にする。
 * 添字は `(wy * 16 + lz) * 16 + lx`（チャンクの `localIndex` と同じ並びのまま積む）。
 */
function stack(gen: NetherGen, cx: number, cz: number): Uint8Array {
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

export function run(): void {
  describe("ネザーの地形");

  // 生成器を差し替えるだけで別の次元になる形（`rules/meshing-render.md`）。
  // three にも DOM にも触らないので、丸ごとヘッドレスで確かめられる。
  const source = sourceOf("src/nethergen.ts");
  const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("nethergen.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

  // --- 断面（`blockAt` を直に呼ぶ） ---------------------------------------

  {
    const gen = new NetherGen(12345);
    const floor = 24;
    const ceiling = 96;
    const cut = (y: number) => gen.blockAt(y, floor, ceiling, false, 0);
    console.log(
      `      床 ${floor} / 溶岩面 ${NETHER_LAVA_LEVEL} / 天井の下面 ${ceiling} の断面: ` +
        `y0 ${cut(0)}  y20 ${cut(20)}  y30 ${cut(30)}  y40 ${cut(40)}  y96 ${cut(96)}  y127 ${cut(127)}`,
    );
    check("底は岩盤", cut(0) === BEDROCK);
    check("天井のてっぺんは岩盤", cut(WORLD_HEIGHT - 1) === BEDROCK);
    check("床の中はネザーラック", cut(20) === NETHERRACK && cut(floor) === NETHERRACK);
    // **溶岩の海は平ら。** 床が海面より低い所だけが埋まる。
    check("床より上・海面より下は溶岩", cut(floor + 1) === LAVA && cut(NETHER_LAVA_LEVEL) === LAVA);
    check("海面より上は空", cut(NETHER_LAVA_LEVEL + 1) === AIR && cut(60) === AIR);
    check("天井の下面から上はネザーラック", cut(ceiling) === NETHERRACK && cut(110) === NETHERRACK);

    // ソウルサンドは床の一番上だけ（1 つ下は普通の地面）。
    check(
      "ソウルサンドは床の表面だけ",
      gen.blockAt(floor, floor, ceiling, true, 0) === SOUL_SAND &&
        gen.blockAt(floor - 1, floor, ceiling, true, 0) === NETHERRACK,
    );
    // グロウストーンは天井の下面からぶら下がる（上に積まない）。
    check(
      "グロウストーンは天井の下面にぶら下がる",
      gen.blockAt(ceiling, floor, ceiling, false, 2) === GLOWSTONE &&
        gen.blockAt(ceiling + 1, floor, ceiling, false, 2) === GLOWSTONE &&
        gen.blockAt(ceiling + 2, floor, ceiling, false, 2) === NETHERRACK,
    );
    // **岩盤が先。** あとに回すと、天井が高い列で世界の外側の面が光る。
    check(
      "天井が世界の上端まで来ても岩盤が勝つ",
      gen.blockAt(WORLD_HEIGHT - 1, floor, WORLD_HEIGHT - 4, false, 4) === BEDROCK,
    );
  }

  // --- 実際に作ってみる ---------------------------------------------------

  const gen = new NetherGen(12345);
  const columns: Uint8Array[] = [];
  const SPAN = 4;
  for (let cx = 0; cx < SPAN; cx++) {
    for (let cz = 0; cz < SPAN; cz++) columns.push(stack(gen, cx, cz));
  }
  const spots = SPAN * SPAN * CHUNK_SIZE * CHUNK_SIZE;

  {
    let floorBad = 0;
    let ceilBad = 0;
    let openBad = 0;
    let standable = 0;
    let seaColumns = 0;
    let landColumns = 0;
    let minOpen = WORLD_HEIGHT;

    for (const all of columns) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          if (at(all, lx, 0, lz) !== BEDROCK) floorBad++;
          if (at(all, lx, WORLD_HEIGHT - 1, lz) !== BEDROCK) ceilBad++;

          // 上から降りてきて、最初に地面でなくなる所が天井の下面。
          let ceiling = WORLD_HEIGHT - 1;
          while (ceiling > 0 && isSolid(at(all, lx, ceiling, lz))) ceiling--;
          // 下から昇って、最初に地面でなくなる所が床の上。
          let floor = 0;
          while (floor < WORLD_HEIGHT && isSolid(at(all, lx, floor, lz))) floor++;

          const open = ceiling - floor + 1;
          if (open < minOpen) minOpen = open;
          // **歩ける高さが要る。** 天井と床がくっつくと、そこは通れない壁になる。
          if (open < 8) openBad++;

          if (at(all, lx, NETHER_LAVA_LEVEL, lz) === LAVA) seaColumns++;
          else landColumns++;

          // 足元が地面で頭 2 マスが空いている所（立てる場所）。
          if (
            !isSolid(at(all, lx, floor, lz)) &&
            at(all, lx, floor, lz) !== LAVA &&
            at(all, lx, floor + 1, lz) === AIR
          ) {
            standable++;
          }
        }
      }
    }

    console.log(
      `      ${spots} 列: 溶岩の海 ${((seaColumns / spots) * 100).toFixed(1)}% / ` +
        `陸 ${((landColumns / spots) * 100).toFixed(1)}%  立てる所 ${((standable / spots) * 100).toFixed(1)}%  ` +
        `いちばん狭い所の高さ ${minOpen}`,
    );
    check("どの列も底が岩盤", floorBad === 0, `${floorBad} 列`);
    check("どの列も天井のてっぺんが岩盤（空が見えない）", ceilBad === 0, `${ceilBad} 列`);
    check("どの列にも歩ける高さがある", openBad === 0, `${openBad} 列`);
    // **海と陸が両方あること。** 全部海なら渡れないし、全部陸なら溶岩の海が無い。
    check("溶岩の海がある", seaColumns > spots * 0.05, `${seaColumns} 列`);
    check("陸もある", landColumns > spots * 0.2, `${landColumns} 列`);
    check("立てる所が半分以上ある", standable > spots * 0.5, `${standable} / ${spots}`);
  }

  {
    // 明かりの出どころ。**グロウストーンは必ず天井にくっついていること**
    // （浮いていると、天井から離れた所に光る箱が浮かぶ）。
    let glow = 0;
    let floating = 0;
    let soul = 0;
    let soulBuried = 0;
    for (const all of columns) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
            const id = at(all, lx, y, lz);
            if (id === GLOWSTONE) {
              glow++;
              const above = at(all, lx, y + 1, lz);
              if (above !== GLOWSTONE && above !== NETHERRACK && above !== BEDROCK) floating++;
            } else if (id === SOUL_SAND) {
              soul++;
              // ほとりの地面なので、上は空か溶岩のはず（埋まっていたら見えない）。
              const above = at(all, lx, y + 1, lz);
              if (above !== AIR && above !== LAVA) soulBuried++;
            }
          }
        }
      }
    }
    console.log(
      `      グロウストーン ${glow} マス（浮き ${floating}） / ソウルサンド ${soul} マス（埋没 ${soulBuried}）`,
    );
    check("グロウストーンが生成される", glow > 0);
    check("グロウストーンは天井から生えている", floating === 0, `${floating} マス`);
    check("ソウルサンドが生成される", soul > 0);
    check("ソウルサンドは地表にある", soulBuried === 0, `${soulBuried} マス`);
  }

  {
    // 同じ種なら同じ地形（セーブは種しか持たない。ここが崩れると、
    // 開き直すたびにネザーの形が変わって、置いたものが宙に浮く）。
    const again = new NetherGen(12345);
    const other = new NetherGen(999);
    const a = stack(gen, 1, 1);
    const b = stack(again, 1, 1);
    const c = stack(other, 1, 1);
    let same = 0;
    let differs = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) same++;
      if (a[i] !== c[i]) differs++;
    }
    console.log(`      同じ種で一致 ${same} / ${a.length}  違う種との差 ${differs} マス`);
    check("同じ種なら同じ地形", same === a.length);
    check("種が違えば違う地形", differs > a.length * 0.05, `${differs} マス`);
  }

  {
    // 速さ。**オーバーワールドと同じ土俵で測って比べる**（この箱の速さは日によって
    // 変わるので、絶対値だけで判定しない）。
    const over = new WorldGen(4242);
    const nether = new NetherGen(4242);
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
    // 列のキャッシュに当たらないよう、毎回違う列を作る。
    const overCost = timeOf((i) => over.generateChunk(100 + i, 2, 100 + i, buffer));
    const netherCost = timeOf((i) => nether.generateChunk(100 + i, 2, 100 + i, buffer));
    console.log(
      `      チャンク 1 個: ネザー ${netherCost.toFixed(3)}ms / オーバーワールド ${overCost.toFixed(3)}ms`,
    );
    // 予算は 1 フレーム 3ms（`constants.ts` の `GENERATE_BUDGET_MS`）。
    // **オーバーワールドより高くつくなら、そこで気付けるようにしておく。**
    check("生成がオーバーワールドより重くない", netherCost <= overCost * 1.5, `${netherCost.toFixed(3)}ms`);
  }
}
