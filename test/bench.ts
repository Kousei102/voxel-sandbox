import { Scene } from "three";
import { COBBLE } from "../src/blocks";
import { CHUNK_VOLUME, MAX_LIGHT } from "../src/constants";
import { Drops, MAX_DROPS } from "../src/drops";
import { buildChunkMesh, PAD_VOLUME, padIndex } from "../src/mesher";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";

const gen = new WorldGen(999);
const data = new Uint8Array(CHUNK_VOLUME);

let t = performance.now();
for (let i = 0; i < 200; i++) gen.generateChunk(i % 20, i % 8, Math.floor(i / 20), data);
console.log(`generateChunk   ${((performance.now() - t) / 200).toFixed(2)} ms/チャンク`);

// 地表付近の実データでメッシュ化を計測
const pad = new Uint8Array(PAD_VOLUME);
const lightPad = new Uint8Array(PAD_VOLUME).fill(MAX_LIGHT);
const blockPad = new Uint8Array(PAD_VOLUME);
gen.generateChunk(0, 2, 0, data);
for (let y = 0; y < 16; y++) {
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) pad[padIndex(x, y, z)] = data[(y * 16 + z) * 16 + x];
  }
}
let tris = 0;
t = performance.now();
for (let i = 0; i < 300; i++) tris = (buildChunkMesh(pad, lightPad, blockPad).opaque?.indices.length ?? 0) / 3;
console.log(`buildChunkMesh  ${((performance.now() - t) / 300).toFixed(2)} ms/チャンク (${tris} 三角形)`);

// **上の `gen` を使い回さないこと。** `WorldGen` は列ごとの結果をキャッシュするので、
// すでに 200 チャンク作った生成器を渡すと、ストリーミングの計測がキャッシュ当たりになる。
const world = new World(new Scene(), new WorldGen(999));
t = performance.now();
world.primeAround(0.5, 0.5, 1);
console.log(`primeAround     ${(performance.now() - t).toFixed(0)} ms (起動時に 1 度だけ)`);

let worst = 0;
let total = 0;
const frames = 900;
for (let i = 0; i < frames; i++) {
  const f = performance.now();
  world.update(0.5 + i * 0.3, 0.5);
  const dt = performance.now() - f;
  worst = Math.max(worst, dt);
  total += dt;
}
const stats = world.stats();
console.log(
  `world.update    平均 ${(total / frames).toFixed(2)} ms / 最悪 ${worst.toFixed(1)} ms ` +
    `(${frames} フレームで ${(frames * 0.3).toFixed(0)} ブロック移動)`,
);
console.log(`到達状態        ${stats.chunks} チャンク / ${stats.triangles.toLocaleString()} 三角形`);

// 落ちたアイテム。**`world.update()` の外**で回しているので、ここも別に測る
// （中に入れると、ドロップの退行とストリーミングの退行が区別できなくなる）。
// 満杯（MAX_DROPS 個）でも `world.update` の予算に対して誤差であることを見る。
// **プレイヤーが最後に居た所（x ≒ 270）に置くこと。** 原点付近の列はもう捨てられていて、
// そこに置くと `hasColumn` のガードで物理が丸ごと飛び、何も測らずに「速い」と出る。
// **間隔も MERGE_RADIUS より広く取ること**（近づけると 1 山にまとまって数が減る）。
const dropX = 0.5 + (frames - 1) * 0.3;
const drops = new Drops();
for (let i = 0; i < MAX_DROPS; i++) {
  drops.spawn(COBBLE, 1, dropX + (i % 16) * 2, 80, 0.5 + Math.floor(i / 16) * 2);
}
const dropCtx = { playerX: dropX, playerY: 80, playerZ: 0.5 };
const dropFrames = 600;
const dropTimes: number[] = [];
for (let i = 0; i < dropFrames; i++) {
  const f = performance.now();
  drops.update(1 / 60, world, dropCtx);
  dropTimes.push(performance.now() - f);
}
// **中央値と p99 で見る。** 最悪値は GC の単発スパイクを拾うだけで、
// 退行と区別が付かない（`test/world.test.ts` の `measureChunkCost` と同じ立場）。
dropTimes.sort((a, b) => a - b);
console.log(
  `drops.update    中央 ${dropTimes[dropFrames >> 1].toFixed(3)} ms /` +
    ` p99 ${dropTimes[Math.floor(dropFrames * 0.99)].toFixed(3)} ms /` +
    ` 最悪 ${dropTimes[dropFrames - 1].toFixed(2)} ms (${drops.count} 個)`,
);
console.log(`ヒープ          ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
