import { Scene } from "three";
import { CHUNK_VOLUME, MAX_LIGHT } from "../src/constants";
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

const world = new World(new Scene(), 999);
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
console.log(`ヒープ          ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
