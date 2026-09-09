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
  BOOKSHELF,
  BROWN_MUSHROOM,
  CAKE,
  COBWEB,
  DIRT,
  FARMLAND,
  FENCE,
  GLASS,
  GRASS,
  ICE,
  LADDER,
  LADDER_XN,
  LADDER_ZN,
  LADDER_ZP,
  PLANK,
  PLANK_SLAB,
  RED_MUSHROOM,
  STONE,
  SUGAR_CANE,
  TALL_GRASS,
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

  /**
   * はしご。**自然には 1 マスも生えない**（置くものなので）ので、`crops` と同じで
   * **ここへ直に置く**しかない。見るのは 3 つ:
   * 板が壁に貼り付いているか / **裏返っていないか**（壁の中に埋まって見えない）/
   * 4 向きとも同じ厚さで出ているか。
   */
  ladders(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 6;
    // **平らな台を作る**（`crops` と同じ理由。地形なりだと柱が斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **真ん中に石の柱を 4 段。その 4 面に 1 本ずつ掛ける。** 1 面だけだと
    // 「向きが 1 つ合っている」しか分からず、表を並べ替えたときに気付けない。
    for (let h = y; h < y + 4; h++) world.setVoxel(0, h, 0, STONE);
    for (let h = y; h < y + 4; h++) {
      world.setVoxel(1, h, 0, LADDER_XN); // 柱の +X 側の面 → 支えは -X
      world.setVoxel(-1, h, 0, LADDER); // 柱の -X 側の面 → 支えは +X
      world.setVoxel(0, h, 1, LADDER_ZN);
      world.setVoxel(0, h, -1, LADDER_ZP);
    }
    // **石の柱をもう 1 本、1 面だけに掛けて並べること。** 4 面に掛けた柱だけだと
    // 木の柱に見えて、**板が立方体より細いのか**（＝厚さ 3/16 で石に貼り付いて
    // いるのか）が絵から読めない。こちらは石の面が残るので厚さが比べられる。
    //
    // **掛けるのはカメラから見て「奥行きのある側」の面**（ここでは +X）。
    // 広く写る +Z の面に掛けると、残る石は**横 4〜5 画素の細い帯**にしかならず
    // （2026-09-06 に画素を数えて分かった）、比べるものを置いた意味が消える。
    // +X に掛ければ広い面が石のまま残り、板は**厚みの側**が見えて 3/16 が読める。
    for (let h = y; h < y + 4; h++) {
      world.setVoxel(4, h, 0, STONE);
      world.setVoxel(5, h, 0, LADDER_XN); // 柱の +X 側の面 → 支えは -X
    }
    // **書き換えたらメッシュ化をもう一度流すこと**（`crops` と同じ。忘れると
    // 編集前の地形がそのまま写る）。
    world.primeAround(0.5, 0.5, 3);
    const at = new Vector3(0, y, 0);
    return {
      scene,
      // **すぐそばの斜めから。** 遠いと板 1 枚が数画素になって、厚さも継ぎ目も読めない
      // （キノコの節と同じ罠。1 度 6.5 マス離れて撮って何も分からなかった）。
      camera: look(setup, new Vector3(at.x + 5.5, at.y + 3.6, at.z + 6.5), new Vector3(at.x + 2, at.y + 1.6, at.z + 0.5)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `柱 0,${y},0 の 4 面に 1 本ずつ（145 / 146 / 147 / 148）+ 裸の石の柱 4,${y},0`,
    };
  },

  /**
   * 本棚（152）。**はしごと同じで自然には 1 個も生えない**（作って置くものなので）ので、
   * `ladders` と同じで**ここへ直に置く**しかない。見るのは 3 つ:
   * 面が欠けていないか / **上面（木口 0xd0a878）と側面（本の背 0x9c5064）が
   * 入れ替わっていないか** / **板と見分けが付くか**（0xb18a56 と 55.6 離してある）。
   */
  bookshelf(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 6;
    // **平らな台を作る**（`ladders` と同じ理由。地形なりだと壁が斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **本棚 3x2 の壁を立て、その左に板 3x2 の壁を並べる。**
    // 板を隣に置くのは、**「木の茶」どうしで見分けが付くか**が絵からしか読めないため
    // （数値の隔たりは `test/blocks.test.ts` が測っているが、目で見るのは別）。
    // **2 段に積むこと** —— 1 段だと上面が地面すれすれで、木口の色がほとんど写らない。
    for (let dx = 0; dx < 3; dx++) {
      for (let h = y; h < y + 2; h++) {
        world.setVoxel(dx, h, 0, BOOKSHELF);
        world.setVoxel(dx - 4, h, 0, PLANK);
      }
    }
    // **1 個だけ離して置くこと。** 壁にすると側面どうしが接して隠れるので、
    // **6 面のうち 3 面が同時に見える単体**が「上面と側面が入れ替わっていないか」の足場。
    world.setVoxel(1, y, 4, BOOKSHELF);
    // **書き換えたらメッシュ化をもう一度流すこと**（`ladders` と同じ）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // **斜め上から。** 真横だと上面（木口）が 1 画素も写らず、入れ替わりに気付けない。
      camera: look(setup, new Vector3(3.5, y + 3.4, 7.5), new Vector3(0, y + 0.8, 1.5)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `本棚の壁 3x2（0..2,${y},0）+ 単体 1,${y},4 / 比べる板の壁 3x2（-4..-2,${y},0）`,
    };
  },

  /**
   * クモの巣（154）。**本棚・はしごと同じで自然には 1 個も生えない**（この周では
   * 湧かせていない）ので、ここへ直に置くしかない。見るのは 3 つ:
   * **十字の板 2 枚が組まれているか**（`model: "cross"` の発行点は草むらと同じ）/
   * **色 0xc8c8dc が石や雪と見分けられるか** / **宙に浮いた 1 個が欠けないか**
   * （`supportFace` が `NO_SUPPORT` なので、支えの無い所に置ける）。
   */
  cobweb(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 6;
    // **平らな台を作る**（`bookshelf` と同じ理由。地形なりだと巣が斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **3x2 の壁**（洞窟の入口を塞いだ形）と、**その左に草むらを 3 本**。
    // 草むらを隣に並べるのは、**同じ十字がどう組まれるか**を見比べるため
    // （形が同じで色だけが違う、というのが絵からしか読めない）。
    for (let dx = 0; dx < 3; dx++) {
      for (let h = y; h < y + 2; h++) world.setVoxel(dx, h, 0, COBWEB);
      world.setVoxel(dx - 4, y, 0, TALL_GRASS);
    }
    // **宙に浮いた 1 個**（支えが要らないことの足場）と、**石の隣の 1 個**（色の見比べ）。
    world.setVoxel(1, y + 4, 3, COBWEB);
    world.setVoxel(4, y, 3, STONE);
    world.setVoxel(4, y + 1, 3, COBWEB);
    // **書き換えたらメッシュ化をもう一度流すこと**（`bookshelf` と同じ）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // **すぐそばの斜めから**（`ladders` と同じ。遠いと十字の板が数画素に潰れる）。
      camera: look(setup, new Vector3(3.5, y + 3.4, 8), new Vector3(0, y + 1.2, 1)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `巣の壁 3x2（0..2,${y},0）/ 宙に浮いた 1 個 1,${y + 4},3 / 石の上 4,${y + 1},3 / 比べる草むら 3 本（-4..-2,${y},0）`,
    };
  },

  /**
   * ケーキ（155）。**本棚・クモの巣と同じで自然には 1 個も生えない**（本家にも
   * 湧かない）ので、ここへ直に置くしかない。見るのは 4 つ:
   * **`model: "boxes"` の箱 1 個が縁 1/16・高さ 8/16 で出ているか**（ハーフより低く、
   * 横も痩せている）/ **上面（薄紅 0xffd0e4）と側面（スポンジ 0xe8c9a0）と
   * 下面（0xd9b98a）が入れ替わっていないか** / **隣の下付きハーフと高さで見分けが
   * 付くか**（0.5 で同じ高さ・横幅だけが違う）/ **面が欠けたり裏返ったりしないか。**
   */
  cake(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 6;
    // **平らな台を作る**（`bookshelf` と同じ理由。地形なりだとケーキが斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **1 個だけ離して置くこと**（本棚と同じ）—— 並べると側面どうしが接して、
    // 「上面と側面が入れ替わっていないか」を見る足場が消える。
    world.setVoxel(0, y, 0, CAKE);
    // **石の台の上にもう 1 個。** 縁の 1/16 が台からはみ出さずに引っ込んで見えるか
    // （`CACTUS_BOX` と同じ痩せ方で、`FULL_BOX` との差はここにしか出ない）。
    world.setVoxel(3, y, 0, STONE);
    world.setVoxel(3, y + 1, 0, CAKE);
    // **比べる下付きハーフを隣に。** 高さが同じ 0.5 なので、**横が痩せていること**
    // だけが違いになる（数値は `test/blocks.test.ts` が見るが、目で見るのは別）。
    world.setVoxel(-3, y, 0, PLANK_SLAB);
    // **書き換えたらメッシュ化をもう一度流すこと**（`bookshelf` と同じ）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // **すぐそばの斜め上から。** 真横だと上面（薄紅）が 1 画素も写らず、
      // 入れ替わりにも高さ 8/16 にも気付けない。
      camera: look(setup, new Vector3(1.2, y + 1.9, 4.2), new Vector3(0.2, y + 0.4, 0)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `ケーキ 0,${y},0 / 石の上 3,${y + 1},0 / 比べる板ハーフ -3,${y},0`,
    };
  },

  /**
   * 氷（156）。**本棚・クモの巣・ケーキと同じで自然には 1 個も生えない**（凍った海は
   * 25b）ので、ここへ直に置くしかない。見るのは 4 つ:
   * **半透明（`alpha` 0.6）の下が透けているか** —— そのために**板を 7x7 で敷き、
   * その下を 1 段掘って市松の目印を置いてある**（`water` の「1 マスの水たまりで
   * 終わりにしない」と同じ理由。1 個だけ置くと、透けているのか下が地面なのか
   * 絵から読めない）/ **隣に並べたガラス（0xa9d8e8・`alpha` 0.3）と見分けが付くか**
   * （色 34.3 の隔たりと、濃さの違いが両方出る）/ **石の上の 1 個で面が
   * 欠けたり裏返ったりしないか** / **7x7 の板の内側の面が出ていないか**
   * （同じ半透明どうしが接する所。出ると格子が浮いて見える）。
   */
  ice(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 7;
    // **平らな台を作る**（`cake` と同じ理由。地形なりだと板が斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **7x7 の板を地面と面一に敷き、その下を 1 段空けて市松の目印を置く。**
    // 透けているかどうかは、**下に「氷でないもの」が写って初めて**分かる。
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        world.setVoxel(dx, y - 1, dz, ICE);
        world.setVoxel(dx, y - 2, dz, AIR);
        world.setVoxel(dx, y - 3, dz, (dx + dz) % 2 === 0 ? STONE : PLANK);
      }
    }
    // **比べるガラスを隣に。** 同じ半透明でも `alpha` が 0.3 と 0.6 で違うので、
    // **空を背にして並べる**と濃さの差と色の差の両方が 1 枚に出る。
    world.setVoxel(5, y, 0, ICE);
    world.setVoxel(7, y, 0, GLASS);
    // **石の上の 1 個**（面の欠けと裏返りを見る足場。下が不透明なので縁が読める）。
    world.setVoxel(-5, y, 0, STONE);
    world.setVoxel(-5, y + 1, 0, ICE);
    // **書き換えたらメッシュ化をもう一度流すこと**（`cake` と同じ）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // **斜め上から板を見下ろす。** 真横だと板の下（市松）が 1 画素も写らない。
      camera: look(setup, new Vector3(4.5, y + 4.2, 8.5), new Vector3(0, y - 1, 0)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `氷の板 7x7（-3..3,${y - 1},-3..3。下は 1 段空けて市松）/ 空を背にした氷 5,${y},0 ↔ ガラス 7,${y},0 / 石の上 -5,${y + 1},0`,
    };
  },

  /**
   * フェンス（157）。**本棚・クモの巣・ケーキ・氷と同じで自然には 1 個も生えない**ので、
   * ここへ直に置くしかない。見るのは 4 つ:
   * **腕が繋がる側だけに出ているか**（26b。**1 本だけ置いたものは柱だけ**・
   * **角は 2 方向だけ**・**石の横は石の側 1 本だけ**）/
   * **柱（6/16 角・上端 1.0）と腕 2 段（下 6..9/16・上 12..15/16）の高さが
   * 入れ替わっていないか** / **面が欠けたり裏返ったりしないか** /
   * **当たり判定の 1.5 が絵に出ていないこと**（見た目はマスの 1.0 で止まる ——
   * `boxes` のほうを 1.5 にすると、ここで柱が隣のマスへ突き抜けて見える）。
   *
   * **直線・角・1 本だけ・石の上・石の横の 5 通りを並べる**（`ice` の「板 7x7 と
   * 1 個」と同じ理由。1 本だけだと、繋がったときに腕が重なるのか離れるのかが
   * 絵から読めない）。**石の横が 26b の要**で、フェンス以外の立方体にも
   * 腕が伸びることは**ここでしか絵に出ない**（石の上は縦なので腕が出ない）。
   */
  fence(setup) {
    const { scene, world } = makeWorld(OVERWORLD, 3);
    const pad = 7;
    // **平らな台を作る**（`cake` / `ice` と同じ理由。地形なりだと斜面に埋まる）。
    let y = 0;
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) y = Math.max(y, world.surfaceY(dx, dz));
    }
    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        for (let h = y; h < y + 8; h++) world.setVoxel(dx, h, dz, AIR);
        for (let h = y - 4; h < y; h++) world.setVoxel(dx, h, dz, DIRT);
        world.setVoxel(dx, y - 1, dz, GRASS);
      }
    }
    // **直線 5 本**（-2..2 の x 方向）。腕が隣と繋がって 1 本の柵に見えるか。
    for (let dx = -2; dx <= 2; dx++) world.setVoxel(dx, y, 0, FENCE);
    // **角**（直線の端から Z 方向へ 2 本）。曲がり角で腕が 2 方向だけ残るのが 26b で、
    // **いまは 4 方向とも出る**ので、そこが絵に出る。
    for (let dz = 1; dz <= 2; dz++) world.setVoxel(2, y, dz, FENCE);
    // **1 本だけ離して置く。** ここが「腕 4 本が宙に飛び出して見える」かどうかの
    // 足場（人に見てもらう所。`HANDOFF.md`）。
    world.setVoxel(-5, y, 3, FENCE);
    // **石の台の上にもう 1 本。** 下が不透明なので、柱の縁と腕の付け根が読める。
    world.setVoxel(-5, y, -3, STONE);
    world.setVoxel(-5, y + 1, -3, FENCE);
    // **石の立方体の「横」に 1 本。** 26b で繋がる相手は**フェンスだけではない**
    // （立方体で solid かつ opaque なら繋がる）ので、**石側の腕 1 本だけが出る**のが
    // ここに写る。石の「上」（-5,-3）は縦なので腕が 1 本も出ない ——
    // **横に並べないと、この道は絵に 1 画素も出ない。**
    world.setVoxel(-3, y, 2, STONE);
    world.setVoxel(-2, y, 2, FENCE);
    // **比べる下付きハーフを隣に**（高さ 0.5）。柱の 1.0 と腕の 2 段が、
    // ハーフの上端とどう並ぶかで高さの入れ替わりが読める。
    world.setVoxel(-3, y, -3, PLANK_SLAB);
    // **書き換えたらメッシュ化をもう一度流すこと**（`cake` / `ice` と同じ）。
    world.primeAround(0.5, 0.5, 3);
    return {
      scene,
      // **斜め上から、5 通りが全部入る所まで下がる。** 真横だと腕の 2 段が重なって
      // 1 本に見え、真上だと柱の高さ（1.0）が 1 画素も写らない。
      // **26a の (1.5, 4.6) では角（2,1..2）が画面の外**で、「角では 2 方向だけ」が
      // 1 画素も写らなかった（撮って `Read` で見て詰めた。撮り直しは安い）。
      camera: look(setup, new Vector3(3.4, y + 2.3, 6.0), new Vector3(-1.6, y + 0.6, 0.4)),
      dayNight: skyOf(OVERWORLD, setup.time),
      note: `直線 -2..2,${y},0 / 角 2,${y},1..2 / 1 本だけ -5,${y},3 / 石の上 -5,${y + 1},-3 / 石の横 -2,${y},2（石 -3,${y},2）/ 比べる板ハーフ -3,${y},-3`,
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
