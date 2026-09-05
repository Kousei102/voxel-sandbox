/**
 * **画面を PNG に撮る**（`npm run shot`）。GPU もブラウザも使わない。
 *
 * 撮れるのは three の `Scene` に載っているもの —— 地形・モブ・落ちたアイテム・構造物。
 * 塗るのは `tools/raster.ts` で、こちらは**どの場面を組むか**だけを持つ。
 *
 * ```
 * npm run shot                 # 全部の場面を shots/ へ
 * npm run shot -- terrain end  # 名前を選ぶ
 * npm run shot -- terrain --time 0.6 --size 960x600
 * ```
 *
 * **これはブラウザ確認の代わりにはならない。** `sky.ts` の天球 GLSL・フォグ・
 * DOM の画面（インベントリ・作業台）は写らないので、そこは今までどおり見てもらうこと。
 * 逆に、**面の欠け・裏返り・色・AO・光量・モブの形と部位の位置**はここで分かる。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import {
  AIR,
  BROWN_MUSHROOM,
  DIRT,
  FARMLAND,
  GRASS,
  RED_MUSHROOM,
  SUGAR_CANE,
  WATER,
  WHEAT_CROP,
  WHEAT_CROP_RIPE,
} from "../src/blocks";
import { DayNight } from "../src/daynight";
import { DIMENSIONS, END, NETHER, OVERWORLD, type DimensionId } from "../src/dimensions";
import { MOB_KINDS, Mobs } from "../src/mobs";
import { MobRenderer } from "../src/mobrender";
import { World } from "../src/world";
import { encodePng, render, stats } from "./raster";

const SEED = 4242;

interface Shot {
  readonly camera: PerspectiveCamera;
  readonly scene: Scene;
  readonly dayNight: DayNight;
  readonly note: string;
}

interface Setup {
  readonly width: number;
  readonly height: number;
  readonly time: number;
}

function makeWorld(dimension: DimensionId, radius: number): { scene: Scene; world: World } {
  const def = DIMENSIONS.find((d) => d.id === dimension)!;
  const scene = new Scene();
  const world = new World(scene, def.create((SEED ^ def.salt) >>> 0));
  world.primeAround(0.5, 0.5, radius);
  return { scene, world };
}

function look(setup: Setup, from: Vector3, at: Vector3): PerspectiveCamera {
  const camera = new PerspectiveCamera(70, setup.width / setup.height, 0.1, 400);
  camera.position.copy(from);
  camera.lookAt(at);
  return camera;
}

/**
 * 立てる場所を探す。**カメラを木や天井の中に埋めないため**の足場
 * （埋まると、面が内側からになって真っ黒な絵しか出ない）。
 * 頭上 3 マスが空いている所を上から探し、見つからなければ `from` をそのまま返す。
 */
function openSpot(world: World, x: number, z: number, from: number): number {
  for (let y = from; y > 4; y--) {
    if (world.getVoxel(x, y - 1, z) === AIR) continue;
    if ([0, 1, 2].every((d) => world.getVoxel(x, y + d, z) === AIR)) return y;
  }
  return from;
}

/**
 * 見晴らしの利く立ち位置を探す。**目の前が木の幹だと、毎回まっ暗な絵になる。**
 * `openSpot` で立てる高さを決め、そこから見る向きへ 12 マス空いている所を選ぶ。
 */
function clearSpot(world: World, dir: Vector3): Vector3 {
  for (let r = 0; r <= 16; r += 4) {
    for (const [dx, dz] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, -r]]) {
      const y = openSpot(world, dx, dz, world.surfaceY(dx, dz) + 4);
      // 頭上も空けること。木の下に立つと、葉で空も先も見えない絵になる。
      let clear = [1, 2, 3, 4, 5, 6].every((d) => world.getVoxel(dx, y + d, dz) === AIR);
      for (let s = 1; s <= 12 && clear; s++) {
        const x = Math.round(dx + dir.x * s);
        const z = Math.round(dz + dir.z * s);
        if (world.getVoxel(x, y + 1, z) !== AIR || world.getVoxel(x, y + 2, z) !== AIR) clear = false;
      }
      if (clear) return new Vector3(dx + 0.5, y + 1.6, dz + 0.5);
    }
  }
  return new Vector3(0.5, world.surfaceY(0, 0) + 1.6, 0.5);
}

/** 次元ごとの空と昼夜の色。**器に色を直書きしないこと**（判断は `daynight.ts`）。 */
function skyOf(dimension: DimensionId, time: number): DayNight {
  const dayNight = new DayNight(time);
  dayNight.setDimension(dimension);
  return dayNight;
}

const SCENES: Record<string, (setup: Setup) => Shot> = {
  /** 地表を見渡す。木・草・水面・遠くの砂浜が入る画。 */
  terrain(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 5);
    const y = world.surfaceY(0, 0);
    return {
      scene,
      camera: look(setup, new Vector3(0.5, y + 12, 0.5), new Vector3(40, y - 4, 40)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `地表 y=${y}`,
    };
  },

  /** 目の高さ。**歩いているときに見える形**（AO とプロップの見え方はここで見る）。 */
  ground(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 4);
    const dir = new Vector3(0.7, 0, 0.7);
    const eye = clearSpot(world, dir);
    return {
      scene,
      camera: look(setup, eye, eye.clone().addScaledVector(dir, 20).setY(eye.y - 1)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `立ち位置 ${eye.x - 0.5},${eye.y - 1.6},${eye.z - 0.5}`,
    };
  },

  /** ネザーは天井のある次元。**地表 (surfaceY) は天井の上**なので、下の空洞まで降りる。 */
  nether(setup) {
    const { scene, world } = makeWorld(NETHER, 4);
    const y = openSpot(world, 0, 0, 100);
    return {
      scene,
      camera: look(setup, new Vector3(0.5, y + 2, 0.5), new Vector3(30, y, 30)),
      dayNight: skyOf(NETHER, setup.time),
      note: `足元 y=${y}`,
    };
  },

  end(setup) {
    const { scene, world } = makeWorld(END, 5);
    const y = world.surfaceY(0, 0);
    return {
      scene,
      camera: look(setup, new Vector3(0.5, y + 14, -40), new Vector3(0, y, 0)),
      dayNight: skyOf(END, setup.time),
      note: `地表 y=${y}`,
    };
  },

  /**
   * 水辺。**半透明の経路（`translucentMaterial`）が絵に出るのはここだけ。**
   * 水面が真っ黒／完全に見えないときは、混ぜ方か並べ替えを疑うこと。
   */
  water(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 5);
    // **いちばん広い水面を探すこと。** 1 マスの水たまりを見つけて終わりにすると、
    // 画のほとんどが岸になって半透明が写らない（実際に雪原を撮っていた）。
    let spot = new Vector3(0.5, world.surfaceY(0, 0) + 2, 0.5);
    let widest = 0;
    for (let dz = -72; dz <= 72; dz += 4) {
      for (let dx = -72; dx <= 72; dx += 4) {
        const y = world.surfaceY(dx, dz);
        if (world.getVoxel(dx, y - 1, dz) !== WATER) continue;
        let span = 0;
        while (span < 24 && world.getVoxel(dx + span, world.surfaceY(dx + span, dz) - 1, dz) === WATER) span++;
        if (span > widest) {
          widest = span;
          spot = new Vector3(dx - 6 + 0.5, y + 2, dz + 0.5);
        }
      }
    }
    return {
      scene,
      // 水面をかすめて見る。**真上から見ないこと**（水の下と重なって見えない）。
      camera: look(setup, spot, new Vector3(spot.x + widest + 8, spot.y - 2.5, spot.z)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `水面 ${Math.round(spot.x)},${Math.round(spot.y)},${Math.round(spot.z)}（幅 ${widest}）`,
    };
  },

  /**
   * 畑。**苗（`WHEAT_CROP`）と実った小麦（`WHEAT_CROP_RIPE`）を並べて撮る。**
   * 育つのに `GROW_SECONDS` 秒かかるので、**待たずに両方を見るにはここへ直に置く**しかない。
   * 見るのは 2 つ: 十字の板が耕地の上に立っているか / **2 色が見分けられるか**（`TUNING.md`）。
   */
  crops(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const half = 4;
    const pad = half + 3;
    // **高さはこのあたりで一番高い地表に合わせる。** 低いほうに合わせると、畑が
    // 隣の地面に埋まって 1 本も写らない（実際にそうなって撮り直した）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        // 平らな台を作る。地形なりだと苗の高さがばらけて、2 色の比べようがない。
        for (let h = y; h < y + 6; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 6; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        const inField = Math.abs(dx) <= half && Math.abs(dz) <= half;
        world.setVoxel(dx, y - 1, dz, inField ? FARMLAND : GRASS);
        // **左半分が苗・右半分が実り。** 交互に混ぜると、どちらの色かが絵から読めない。
        if (inField) world.setVoxel(dx, y, dz, dx < 0 ? WHEAT_CROP : WHEAT_CROP_RIPE);
      }
    }
    // **書き換えたらメッシュ化をもう一度流すこと。** `setVoxel()` は「汚れた」印を
    // 付けてキューに積むだけで、流すのは `primeAround()`（と `world.update()`）。
    // 忘れると**編集前の地形がそのまま写る** —— 撮り直すまで気付けない（実際に 1 度撮った）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // 目の高さから畑をかすめて見る（真上からだと十字の板が線にしか写らない）。
      // **台の縁に立たないこと。** 縁に立つと画の下半分が台の下（洞窟）になる。
      camera: look(setup, new Vector3(-pad + 2.5, y + 1.7, -pad + 2.5), new Vector3(3, y + 0.5, 3)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `畑 ${(half * 2 + 1) ** 2} マス（左 苗 ${WHEAT_CROP} / 右 実り ${WHEAT_CROP_RIPE}）y=${y}`,
    };
  },

  /**
   * キノコ（赤 139 / 茶 140）。**`terrain` と `ground` には写らない** ——
   * どちらも原点から見るが、この種の原点は平原（`BiomeDef.mushroom` が 0）で、
   * 森は +x / -z の側にある。**だから地形を書き換えず、生えている所を探して立つ。**
   *
   * 見るのは 3 つ: 十字の板に面の欠け・裏返りが無いか / **赤と茶が見分けられるか** /
   * **草むらと見分けられるか**（3 つとも `cross` の板 1 枚なので、色だけが手掛かり）。
   */
  mushrooms(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 5);
    // **赤と茶が両方入る所を選ぶこと。** 最初の 1 本のそばに立つと、
    // 片方の色しか写らずに「見分けられるか」を確かめられない。
    // **`surfaceY()` は「一番上のブロックの 1 つ上」を返す** ので、そこは必ず空気。
    // 生えものそのものを見るには 1 つ下げること（1 度そのまま撮って 1 本も見つからなかった）。
    const topOf = (x: number, z: number): number => world.getVoxel(x, world.surfaceY(x, z) - 1, z);
    let best: Vector3 | null = null;
    let most = 0;
    let bestNote = "";
    for (let x = -72; x <= 72; x += 2) {
      for (let z = -72; z <= 72; z += 2) {
        if (topOf(x, z) !== RED_MUSHROOM && topOf(x, z) !== BROWN_MUSHROOM) continue;
        let reds = 0;
        let browns = 0;
        for (let dx = -6; dx <= 6; dx++) {
          for (let dz = -6; dz <= 6; dz++) {
            const id = topOf(x + dx, z + dz);
            if (id === RED_MUSHROOM) reds++;
            if (id === BROWN_MUSHROOM) browns++;
          }
        }
        const both = Math.min(reds, browns) * 100 + reds + browns;
        if (both > most) {
          most = both;
          best = new Vector3(x, world.surfaceY(x, z) - 1, z);
          bestNote = `赤 ${reds} / 茶 ${browns}`;
        }
      }
    }
    const at = best ?? new Vector3(0, world.surfaceY(0, 0) - 1, 0);
    // **すぐそばの目の高さから見下ろす。** 遠くから撮ると、板 1 枚が 2〜3 画素になって
    // 色の違いが読めない（草むらとの見分けが確かめられない）。
    const eye = new Vector3(at.x + 6.5, at.y + 3.4, at.z + 6.5);
    return {
      scene,
      camera: look(setup, eye, new Vector3(at.x + 0.5, at.y + 0.4, at.z + 0.5)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: best
        ? `キノコ ${Math.round(at.x)},${Math.round(at.y)},${Math.round(at.z)}（13x13 に ${bestNote}）`
        : "**1 本も見つからない**（原点のまわりに森が無い種）",
    };
  },

  /**
   * 浜のサトウキビ。**`terrain` も `water` も浜を近くから写さない**ので、
   * 「砂の上に立っているか」「上端が立方体とそろっているか」はここでしか見られない。
   *
   * **原点のまわりに浜が無い種があるので、探す範囲を広げてある**（キノコの ±72 では
   * 1 本も見つからなかった）。**広げたぶん `makeWorld` の半径も上げること** ——
   * `world.getVoxel()` は**生成済みのチャンクしか読まない**ので、外は `AIR` が返る。
   */
  beach(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 12);
    // **`surfaceY()` は「一番上のブロックの 1 つ上」**なので、生えものは 1 つ下げて見る。
    const topOf = (x: number, z: number): number => world.getVoxel(x, world.surfaceY(x, z) - 1, z);
    let best: Vector3 | null = null;
    let most = 0;
    for (let x = -180; x <= 180; x += 2) {
      for (let z = -180; z <= 180; z += 2) {
        if (topOf(x, z) !== SUGAR_CANE) continue;
        let near = 0;
        for (let dx = -8; dx <= 8; dx += 2)
          for (let dz = -8; dz <= 8; dz += 2) if (topOf(x + dx, z + dz) === SUGAR_CANE) near++;
        if (near > most) {
          most = near;
          best = new Vector3(x, world.surfaceY(x, z) - 1, z);
        }
      }
    }
    const at = best ?? new Vector3(0, world.surfaceY(0, 0) - 1, 0);
    // **斜め上から見下ろす。** 目の高さで真横から撮ると、浜が細い帯なので
    // 画のほとんどが海と空になり、本数も散らばりも読めない。
    return {
      scene,
      camera: look(setup, new Vector3(at.x - 17, at.y + 11, at.z - 17), new Vector3(at.x + 0.5, at.y - 1, at.z + 0.5)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: best
        ? `サトウキビ ${Math.round(at.x)},${Math.round(at.y)},${Math.round(at.z)}（17x17 に ${most} 本）`
        : "**1 本も見つからない**（原点のまわりに浜が無い種）",
    };
  },

  /** 全種類のモブを 1 列に。**形と部位の位置**（振る腕・向き）を見るための画。 */
  mobs(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const y = world.surfaceY(0, 0);
    const mobs = new Mobs();
    const renderer = new MobRenderer(scene, world.daylightUniform());
    const spacing = 5;
    const span = (MOB_KINDS.length - 1) * spacing;
    MOB_KINDS.forEach((kind, i) => {
      const x = i * spacing - span / 2;
      // 足元は地面に合わせる（虚空に浮くと「湧いていない」と見分けがつかない）。
      mobs.spawn(kind, x, world.surfaceY(Math.round(x), 0), 0, Math.PI);
    });
    renderer.sync(mobs.list, world);
    return {
      scene,
      camera: look(setup, new Vector3(0, y + 3, span * 0.55), new Vector3(0, y + 1.5, 0)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `${mobs.count} 体: ${MOB_KINDS.join(" / ")}`,
    };
  },
};

function parse(argv: readonly string[]): { names: string[]; setup: Setup; out: string } {
  const names: string[] = [];
  let width = 640;
  let height = 400;
  let time = 0.25; // 既定は南中（0 = 日の出、0.25 = 南中）
  let out = "shots";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--size") {
      const [w, h] = argv[++i].split("x");
      width = Number(w);
      height = Number(h);
    } else if (a === "--time") {
      time = Number(argv[++i]);
    } else if (a === "--out") {
      out = argv[++i];
    } else if (a.startsWith("--")) {
      throw new Error(`知らない指定: ${a}`);
    } else {
      names.push(a);
    }
  }
  return { names: names.length > 0 ? names : Object.keys(SCENES), setup: { width, height, time }, out };
}

const { names, setup, out } = parse(process.argv.slice(2));
mkdirSync(out, { recursive: true });
for (const name of names) {
  const build = SCENES[name];
  if (!build) throw new Error(`知らない場面: ${name}（${Object.keys(SCENES).join(" / ")}）`);
  const t0 = performance.now();
  const shot = build(setup);
  const pixels = render(shot.scene, shot.camera, {
    width: setup.width,
    height: setup.height,
    daylight: shot.dayNight.tint,
    zenith: shot.dayNight.zenith,
    horizon: shot.dayNight.horizon,
  });
  const path = `${out}/${name}.png`;
  writeFileSync(path, encodePng(setup.width, setup.height, pixels));
  const s = stats();
  console.log(
    `${path}  ${shot.note}  時刻 ${shot.dayNight.clock()}  ` +
      `メッシュ ${s.meshes} / 三角形 ${s.triangles.toLocaleString()} / 塗った ${s.filled.toLocaleString()}  ` +
      `${Math.round(performance.now() - t0)}ms`,
  );
  // 三角形が 1 枚も塗られていないのは、カメラが壁に埋まっているか裏を向いている。
  if (s.filled === 0) console.log("  ※ 1 枚も塗っていない。カメラの位置か向きを疑うこと");
}
