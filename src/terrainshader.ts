import type { Color, IUniform, MeshBasicMaterial } from "three";

/**
 * 地形マテリアルに「2 系統の光」の合成だけを足す。
 *
 * 頂点カラーには向きによる明暗と AO しか入っていない。明るさはここで
 * `max(スカイライト x 昼夜の色, ブロックライト)` として掛ける。max なので、
 * **夜でも洞窟でも松明の周りだけは暗くならない。**
 *
 * この 3 行だけが GLSL で、この環境では動かして確かめられない
 * （GLSL のコンパイルエラーは画面が真っ黒になる形でしか出ない）。
 * だから 1 ファイルに切り出して、差し込み位置が見つかったかどうかだけは
 * テストで押さえている。ここを増やすときも同じ形を保つこと。
 */

/** 頂点属性の名前。chunk.ts が付ける名前と必ず一致させる。 */
export const LIGHT_ATTRIBUTE = "voxelLight";

/** 昼夜の色を渡す uniform の名前。 */
export const DAYLIGHT_UNIFORM = "uDaylight";

export interface ShaderPatchTarget {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, IUniform>;
}

/**
 * 差し込む場所（three の shader chunk）と、差し込む中身の対。
 * three 側の名前が変わるとどれかが見つからなくなるので、そのときは例外にする。
 * 黙って無視すると、画面が真っ黒になるまで気付けない。
 */
const VERTEX_PATCHES: readonly (readonly [string, string])[] = [
  [
    "#include <common>",
    `#include <common>\nattribute vec2 ${LIGHT_ATTRIBUTE};\nvarying vec2 vVoxelLight;`,
  ],
  ["#include <begin_vertex>", `#include <begin_vertex>\nvVoxelLight = ${LIGHT_ATTRIBUTE};`],
];

const FRAGMENT_PATCHES: readonly (readonly [string, string])[] = [
  [
    "#include <common>",
    `#include <common>\nuniform vec3 ${DAYLIGHT_UNIFORM};\nvarying vec2 vVoxelLight;`,
  ],
  [
    "#include <color_fragment>",
    "#include <color_fragment>\n" +
      `diffuseColor.rgb *= max(vVoxelLight.x * ${DAYLIGHT_UNIFORM}, vec3(vVoxelLight.y));`,
  ],
];

function applyPatches(
  source: string,
  patches: readonly (readonly [string, string])[],
  where: string,
): string {
  let out = source;
  for (const [marker, replacement] of patches) {
    if (!out.includes(marker)) {
      throw new Error(`地形シェーダ: ${where} に ${marker} が見つかりません（three の更新で名前が変わった？）`);
    }
    out = out.replace(marker, replacement);
  }
  return out;
}

/** three が渡してくる shader を書き換える。onBeforeCompile から呼ぶ。 */
export function patchTerrainShader(shader: ShaderPatchTarget, daylight: IUniform<Color>): void {
  shader.uniforms[DAYLIGHT_UNIFORM] = daylight;
  shader.vertexShader = applyPatches(shader.vertexShader, VERTEX_PATCHES, "頂点シェーダ");
  shader.fragmentShader = applyPatches(shader.fragmentShader, FRAGMENT_PATCHES, "フラグメントシェーダ");
}

export function useTerrainLighting(material: MeshBasicMaterial, daylight: IUniform<Color>): void {
  material.onBeforeCompile = (shader) => patchTerrainShader(shader, daylight);
}
