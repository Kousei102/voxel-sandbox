/**
 * 絵に撮る道具（`tools/raster.ts`）の見張り。
 *
 * **この道具が黙って壊れると、いちばん困る形で困る** —— 出てきた絵を見て
 * 「ゲームが壊れた」と読み違え、直っているものを直しにいくことになる。
 * だから**画素の値そのもの**を判定に置く（`mesher.test.ts` が三角形の数を置くのと同じ）。
 */

import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import { buildBoxMesh } from "../src/mobmesh";
import { LIGHT_ATTRIBUTE } from "../src/terrainshader";
import { encodePng, render, stats } from "../tools/raster";
import { check, describe } from "./harness";

const W = 64;
const H = 40;
const WHITE = new Color(1, 1, 1);
const BLACK = new Color(0, 0, 0);

/** 赤い箱 1 個。`buildBoxMesh` を通すので、巡回順も明暗も本物と同じ経路に乗る。 */
function redBox(reversed: boolean): Mesh {
  const arrays = buildBoxMesh([-0.5, 0, -0.5, 0.5, 1, 0.5], 0xff0000, (_hex, out) => out.set([1, 0, 0]));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(arrays.positions, 3));
  geometry.setAttribute("color", new BufferAttribute(arrays.colors, 4));
  geometry.setAttribute(LIGHT_ATTRIBUTE, new BufferAttribute(arrays.light, 2));
  const indices = reversed ? arrays.indices.slice().reverse() : arrays.indices;
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
}

function shoot(scene: Scene, from: [number, number, number] = [0, 0.5, 3]): Uint8Array {
  const camera = new PerspectiveCamera(70, W / H, 0.1, 100);
  camera.position.set(from[0], from[1], from[2]);
  camera.lookAt(0, 0.5, 0);
  return render(scene, camera, { width: W, height: H, daylight: WHITE, zenith: BLACK, horizon: BLACK });
}

/** 画面の真ん中の画素。 */
function middle(pixels: Uint8Array): [number, number, number] {
  const o = ((H >> 1) * W + (W >> 1)) * 3;
  return [pixels[o], pixels[o + 1], pixels[o + 2]];
}

export function run(): void {
  describe("絵に撮る（tools/raster.ts）");

  const scene = new Scene();
  scene.add(redBox(false));
  const pixels = shoot(scene);
  const [r, g, b] = middle(pixels);
  console.log(`      箱の正面の画素: (${r}, ${g}, ${b}) / 塗った三角形 ${stats().filled}`);

  // 赤 x 面の向きによる明暗（+Z 面は 0.86）x スカイライト最大（1.0）= 219。
  // **ここがずれたら、頂点カラーか光の合成か遠近の補間のどれかが壊れている。**
  check("正面の面が明暗込みで塗られる", r === 219 && g === 0 && b === 0, `(${r}, ${g}, ${b})`);
  // 箱は 12 三角形あるが、こちらを向いているのは +Z の 1 面だけ。
  // 残り 10 枚が塗られたら裏面カリングが効いていない（＝内側から見た面まで描いている）。
  check("裏を向いた面は塗らない（裏面カリング）", stats().filled === 2, `${stats().filled} 三角形`);

  // 巡回順を逆にすると表と裏が入れ替わる。**上から見て確かめること** ——
  // 前後の面は明暗が同じ（0.86）なので、正面から見ると裏返っても同じ赤が出て気付けない
  // （実際にそう書いて 1 度素通りした）。上下なら上面 1.0 と底面 0.5 で見分けられる。
  const top = middle(shoot(scene, [0, 3.2, 0.9]));
  const flipped = new Scene();
  flipped.add(redBox(true));
  const gone = middle(shoot(flipped, [0, 3.2, 0.9]));
  check("上から見ると上面（明暗 1.0）", top[0] === 255, `(${top.join(", ")})`);
  check("巡回順を逆にすると上面が消えて底面が見える", gone[0] === 128, `(${gone.join(", ")})`);

  // 半透明は下地と混ざること（水とガラスがこの経路）。
  const clear = new Scene();
  const glass = redBox(false);
  glass.material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
  clear.add(glass);
  const blended = middle(shoot(clear));
  check("半透明は下地と混ざる", blended[0] === 110, `赤 ${blended[0]}（不透明なら 219、素通しなら 0）`);

  const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 255, 0]));
  check("PNG の署名と長さ", png.subarray(1, 4).toString("ascii") === "PNG" && png.length > 40, `${png.length} バイト`);
}
