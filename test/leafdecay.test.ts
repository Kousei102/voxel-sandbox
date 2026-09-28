/**
 * 原木が無くなると葉が消える（52a・`src/leafdecay.ts`）。**判断だけのファイル**なので、
 * 偽物のワールドを `Map` で書けば丸ごとヘッドレスで確かめられる（`test/crops.test.ts` と同じ形）。
 * 本物の `World` で消えるところは `test/blocks.test.ts` の「葉が消える」。
 *
 * **歩数は `LEAF_DECAY_DISTANCE` を import すること**（4 と書き写すと、値を変えたときに
 * テストだけが古い値で緑になる）。
 */

import { AIR, LEAVES, STONE, WOOD, isDecayingLeaf, sustainsLeaves } from "../src/blocks";
import type { TreeKind } from "../src/biomes";
import { CHUNK_BITS } from "../src/constants";
import { LEAF_DECAY_DISTANCE, decayedLeaves, type LeafWorld } from "../src/leafdecay";
import { sourceOf } from "./arena";
import { treeCells } from "../src/treeshape";
import { check, describe } from "./harness";

class FakeWorld implements LeafWorld {
  readonly cells = new Map<string, number>();
  readonly missing = new Set<string>();
  getVoxel(x: number, y: number, z: number): number {
    return this.cells.get(`${x},${y},${z}`) ?? AIR;
  }
  set(x: number, y: number, z: number, id: number): void {
    if (id === AIR) this.cells.delete(`${x},${y},${z}`);
    else this.cells.set(`${x},${y},${z}`, id);
  }
  hasColumn(cx: number, cz: number): boolean {
    return !this.missing.has(`${cx},${cz}`);
  }
  count(pred: (id: number) => boolean): number {
    let n = 0;
    for (const id of this.cells.values()) if (pred(id)) n++;
    return n;
  }
}

/** 根元 (x,0,z) に木を 1 本。形は `treeCells()` のまま（**木の形をここに書き写さない**）。 */
function plant(world: FakeWorld, kind: TreeKind, height: number, x: number, z: number): void {
  for (const c of treeCells(kind, height)) {
    const px = x + c.dx;
    const py = 10 + c.dy;
    const pz = z + c.dz;
    if (!c.overwrite && world.getVoxel(px, py, pz) !== AIR) continue;
    world.set(px, py, pz, c.id);
  }
}

/** 支えの原木から葉を伝った最短の歩数（届かなければ Infinity）。偽物の世界を全部なめる。 */
function leafDistances(world: FakeWorld): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier: [number, number, number][] = [];
  for (const [k, id] of world.cells) {
    if (sustainsLeaves(id)) frontier.push(k.split(",").map(Number) as [number, number, number]);
  }
  for (let step = 1; frontier.length > 0; step++) {
    const next: [number, number, number][] = [];
    for (const [x, y, z] of frontier) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const k = `${x + dx},${y + dy},${z + dz}`;
        if (dist.has(k) || !isDecayingLeaf(world.getVoxel(x + dx, y + dy, z + dz))) continue;
        dist.set(k, step);
        next.push([x + dx, y + dy, z + dz]);
      }
    }
    frontier = next;
  }
  return dist;
}

export function run(): void {
  describe("葉が消える（52a・leafdecay.ts）");
  const d = LEAF_DECAY_DISTANCE;
  console.log(`      LEAF_DECAY_DISTANCE = ${d}`);

  // 1. 原木 1 本 + 葉の塊。原木を消すと葉が全部返る。
  {
    const w = new FakeWorld();
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) for (let y = 12; y <= 13; y++) w.set(x, y, z, LEAVES);
    for (let y = 10; y <= 12; y++) w.set(0, y, 0, WOOD);
    const before = decayedLeaves(w, 0, 10, 0);
    w.set(0, 12, 0, AIR);
    const leaves = w.count(isDecayingLeaf);
    const after = decayedLeaves(w, 0, 12, 0);
    console.log(`      塊: 葉 ${leaves} 枚 / 原木を 2 本残して見ると ${before.length} 枚 / 最後の原木 (0,12,0) を消すと ${after.length} 枚`);
    check("支えの原木が残っていれば 1 枚も返らない", before.length === 0, `${before.length} 枚`);
    check("原木の隣の段を消すと、葉が全部返る", after.length === leaves && leaves === 17, `${after.length} / ${leaves}`);
    const sorted = after.every((c, i) => i === 0 || after[i - 1][0] < c[0] || (after[i - 1][0] === c[0] &&
      (after[i - 1][1] < c[1] || (after[i - 1][1] === c[1] && after[i - 1][2] < c[2]))));
    check("返る順は x → y → z の昇順", sorted, after.slice(0, 3).map((c) => c.join(",")).join(" / "));
  }

  // 2. 一直線の葉の列で境目。別の原木から d 歩は残り、d+1 歩は返る。
  {
    const w = new FakeWorld();
    w.set(0, 10, 0, WOOD); // 切るほう（x=0）
    w.set(20, 10, 0, WOOD); // 残るほう。間は x=1..19 の葉の一列
    for (let x = 1; x <= 19; x++) w.set(x, 10, 0, LEAVES);
    w.set(0, 10, 0, AIR);
    // 切ったマスから d 歩（x=1..d）が候補。残る原木 (20) からは 20 - x 歩。
    // 候補を境目に掛けるため、残る原木を x = d + 1 + d に置き直した世界も作る。
    const w2 = new FakeWorld();
    const keep = 2 * d; // x=d の葉は keep - d = d 歩 → 残る / x=d-1 は d+1 歩 → 返る
    w2.set(keep, 10, 0, WOOD);
    for (let x = 1; x < keep; x++) w2.set(x, 10, 0, LEAVES);
    const got = decayedLeaves(w2, 0, 10, 0).map((c) => c[0]);
    console.log(`      一列: 原木を x=0 と x=${keep} に置き x=0 を消す → 返った x = [${got.join(",")}]（x=${d} は ${keep - d} 歩・x=${d - 1} は ${keep - d + 1} 歩）`);
    check(
      `残る原木から ${d} 歩の葉は残り、${d + 1} 歩の葉は返る`,
      !got.includes(d) && got.includes(d - 1) && got.length === d - 1,
      `[${got.join(",")}]`,
    );
    const far = decayedLeaves(w, 0, 10, 0).map((c) => c[0]);
    console.log(`      一列（原木 x=20）: 返った x = [${far.join(",")}]`);
    check(`候補は切ったマスから ${d} 歩まで（それより先の葉は調べない）`, far.length === d && Math.max(...far) === d, `[${far.join(",")}]`);
  }

  // 3. 葉を伝わない距離は数えない（直線 2 マスでも間が石なら支えにならない）。
  {
    const w = new FakeWorld();
    w.set(0, 10, 0, LEAVES); // 切ったマス (0,11,0) の真下の葉
    w.set(1, 10, 0, STONE);
    w.set(2, 10, 0, WOOD); // 直線 2 マスだが間が石
    const got = decayedLeaves(w, 0, 11, 0);
    console.log(`      石越し: 返った ${got.length} 枚`);
    check("原木まで直線 2 マスでも、間が石なら支えにならない（葉が返る）", got.length === 1, `${got.length} 枚`);
  }

  // 4. 切ったマスから葉で繋がっていない葉は候補に入らない（離して飾った葉は消えない）。
  {
    const w = new FakeWorld();
    w.set(0, 10, 0, LEAVES);
    w.set(0, 12, 3, LEAVES); // 原木から離して置いた飾り
    const got = decayedLeaves(w, 0, 11, 0).map((c) => c.join(","));
    console.log(`      飾り: 返った [${got.join(" ")}]`);
    check("切ったマスから葉で繋がっていない葉は返らない", got.length === 1 && got[0] === "0,10,0", got.join(" "));
  }

  // 5. 箱の列が 1 つでも未読み込みなら空。
  {
    const w = new FakeWorld();
    for (let x = -1; x <= 1; x++) w.set(x, 10, 0, LEAVES);
    const loaded = decayedLeaves(w, 0, 11, 0).length;
    w.missing.add(`${(0 - 2 * d) >> CHUNK_BITS},${0 >> CHUNK_BITS}`); // x = -8 の列（-1,0）
    const unloaded = decayedLeaves(w, 0, 11, 0).length;
    console.log(`      未読み込み: 揃っていれば ${loaded} 枚 / 箱の端の列を抜くと ${unloaded} 枚`);
    check("箱の列が 1 つ未読み込みなら 1 枚も返らない（消し損ねるほうが安全）", loaded === 3 && unloaded === 0, `${loaded} → ${unloaded}`);
  }

  // 6. 本物の木の形で退行しない。3 種 × 高さの全範囲で、どの葉も原木から d 歩以内。
  {
    const cases: [TreeKind, number[]][] = [["oak", [4, 5, 6]], ["birch", [4, 5, 6]], ["spruce", [6, 7, 8, 9]]];
    const rows: string[] = [];
    let worst = 0;
    let allGone = true;
    for (const [kind, heights] of cases) {
      for (const h of heights) {
        const w = new FakeWorld();
        plant(w, kind, h, 0, 0);
        const dist = leafDistances(w);
        const leaves = w.count(isDecayingLeaf);
        const max = Math.max(...dist.values());
        const reached = dist.size;
        worst = Math.max(worst, reached === leaves ? max : Infinity);
        // 生えたままなら何も消えない。幹を上から全部消すと、その木の葉が全部返る。
        let gone = 0;
        let early = 0;
        for (let y = h - 1; y >= 0; y--) {
          w.set(0, 10 + y, 0, AIR);
          const out = decayedLeaves(w, 0, 10 + y, 0);
          if (y > 0 && w.count(sustainsLeaves) > 0 && out.length > 0 && gone === 0) early = out.length;
          for (const [x, yy, z] of out) w.set(x, yy, z, AIR);
          gone += out.length;
        }
        if (gone !== leaves || w.count(isDecayingLeaf) !== 0) allGone = false;
        rows.push(`${kind}${h}: 葉 ${leaves} 最遠 ${max} 歩 / 幹を消して ${gone} 枚${early ? `（途中で ${early}）` : ""}`);
      }
    }
    console.log(`      ${rows.join("\n      ")}`);
    check(`本物の木（3 種 × 高さ全範囲）はどの葉も原木から ${d} 歩以内（最遠 ${worst}）`, worst <= d, `${worst}`);
    check("幹を上から全部消すと、その木の葉が全部返る", allGone, rows.join(" / "));
  }

  // 見張り: 乱数を使わない・ID を名指ししない（旗に聞く）。
  {
    const src = sourceOf("src/leafdecay.ts");
    const words: [string, RegExp][] = [
      ["Math.random(", /Math\.random\(/], ["LEAVES", /\bLEAVES\b/], ["WOOD", /\bWOOD\b/], ["World（LeafWorld 以外）", /\bWorld\b/],
    ];
    const bad = words.filter(([, re]) => re.test(src)).map(([w]) => w);
    console.log(`      leafdecay.ts に出てはいけない語: [${bad.join(" ")}]`);
    check("leafdecay.ts は乱数を使わず、葉・原木の ID も World も名指ししない", bad.length === 0, bad.join(" "));
  }
}
