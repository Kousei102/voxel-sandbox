/**
 * **映すための器**（three と canvas だけ）。`main.ts` から出した「作って置くだけ」の部分で、
 * ここには**判断を書きません** —— いつ何を映すかは `main.ts`、色と明るさの決め方は
 * `daynight.ts`、形は `mesher.ts` / `mobmesh.ts` が持ちます。
 *
 * **この環境では WebGL コンテキストを作れない**ので（`CLAUDE.md`）、このファイルは
 * ヘッドレスでは import すらできません。`main.ts` と同じ「確かめられない側」なので、
 * **数値の判断が紛れ込んでいないか**だけを目で見て守ること。
 */

import {
  BoxGeometry,
  EdgesGeometry,
  Fog,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { CHUNK_SIZE, RENDER_DISTANCE } from "./constants";
import { CrackOverlay } from "./crack";
import { Sky } from "./sky";

/** 地平線の色。**フォグと空で同じ値を使うこと**（違うとチャンクの出現が見える）。 */
export const FOG_COLOR = 0x9ec8e8;

export const canvas = document.getElementById("viewport") as HTMLCanvasElement;
export const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

export const scene = new Scene();
/** 濃さは描画距離から決まる（近すぎると壁が霞み、遠すぎるとチャンクの縁が見える）。 */
export const fog = new Fog(
  FOG_COLOR,
  RENDER_DISTANCE * CHUNK_SIZE * 0.55,
  RENDER_DISTANCE * CHUNK_SIZE * 0.98,
);
scene.fog = fog;

export const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 2400);

export const sky = new Sky(FOG_COLOR);
scene.add(sky.object);

/** 狙っているブロックの枠。**大きさは `shapeBounds()` に合わせる**（`main.ts`）。 */
export const highlight = new LineSegments(
  new EdgesGeometry(new BoxGeometry(1.002, 1.002, 1.002)),
  new LineBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: 0.55, fog: false }),
);
highlight.visible = false;
scene.add(highlight);

export const crack = new CrackOverlay();
scene.add(crack.mesh);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});
