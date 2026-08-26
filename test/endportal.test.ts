/**
 * エンドポータルの起動（TASKS 2-9）。
 *
 * **輪は手で並べず、`STRONGHOLD.build()` が実際に建てたものを使います。**
 * 手で 12 個並べると、建てる側と起動する側が食い違っていても両方とも緑になり、
 * **「地下 18 マスまで掘って 12 個嵌めたのに起動しない」**を見逃します。
 */

import {
  AIR,
  END_PORTAL,
  STONE,
  blockHardness,
  frameFacing,
  frameHasEye,
  isEndPortalFrame,
  isSolid,
} from "../src/blocks";
import { activate, eyeMessage, fitEye, ringAt, type EyeFit } from "../src/endportal";
import { STRONGHOLD } from "../src/stronghold";
import { Slab } from "./arena";
import { check, describe } from "./harness";

/** 部屋の床の高さ（`build()` の基準点）。 */
const FLOOR = 40;
/** 枠と輪の内側の高さ（床の 1 つ上）。 */
const RING_Y = FLOOR + 1;
/** 輪の内側は 3x3 なので 9 マス。**`endportal.ts` から引かずに数え直す。** */
const INSIDE = 9;

/** 要塞の部屋を 1 個建てた試験場（**本物の `build()` を通す**）。 */
function room(): Slab {
  const slab = new Slab();
  STRONGHOLD.build({ def: STRONGHOLD, x: 0, y: FLOOR, z: 0 }, (x, y, z, id) => {
    slab.setVoxel(x, y, z, id);
  });
  return slab;
}

/**
 * 建った枠の位置。**`RING_OFFSETS` を使わずに舐めて探す** ——
 * 同じ表を読んで数えると、表が壊れても両方いっしょに壊れて気付けない。
 */
function frames(slab: Slab): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = -6; z <= 6; z++) {
    for (let x = -6; x <= 6; x++) {
      if (isEndPortalFrame(slab.getVoxel(x, RING_Y, z))) out.push([x, RING_Y, z]);
    }
  }
  return out;
}

/** 中心 3x3 のうち、ポータルの面になっているマスの数。 */
function litCells(slab: Slab): number {
  let n = 0;
  for (let z = -1; z <= 1; z++) {
    for (let x = -1; x <= 1; x++) if (slab.getVoxel(x, RING_Y, z) === END_PORTAL) n++;
  }
  return n;
}

export function run(): void {
  describe("エンドポータルの起動");

  // --- 前提: 建った部屋が起動前の状態であること（先に「ちゃんと動いた」を出す） ---
  const slab = room();
  const spots = frames(slab);
  const eyed = spots.filter(([x, y, z]) => frameHasEye(slab.getVoxel(x, y, z))).length;
  console.log(
    `      建った部屋: 枠 ${spots.length} 個（アイ入り ${eyed}）  ` +
      `中心 3x3 のポータル ${litCells(slab)} マス`,
  );
  check("要塞が枠を 12 個建てている", spots.length === 12, `${spots.length} 個`);
  check("建った時点ではアイが 1 つも嵌まっていない", eyed === 0, `${eyed} 個`);
  check("建った時点では起動していない", litCells(slab) === 0, `${litCells(slab)} マス`);

  // --- 11 個では起動せず、12 個目で起動する ---
  const remaining: number[] = [];
  let litAt = -1;
  for (let i = 0; i < spots.length; i++) {
    const [x, y, z] = spots[i];
    const fit = fitEye(slab, x, y, z);
    if (fit.kind !== "fitted") {
      check(`${i + 1} 個目が嵌まる`, false, fit.kind);
      break;
    }
    remaining.push(fit.remaining);
    if (fit.lit > 0 && litAt < 0) litAt = i + 1;
  }
  console.log(`      残りの表示: ${remaining.join(" → ")}（${litAt} 個目で起動）`);
  check("嵌めるたびに残りが 1 ずつ減る", remaining.join(",") === "11,10,9,8,7,6,5,4,3,2,1,0", remaining.join(","));
  check("12 個目まで起動しない", litAt === 12, `${litAt} 個目で起動`);
  check("中心 3x3 がポータルの面になる", litCells(slab) === INSIDE, `${litCells(slab)} / ${INSIDE} マス`);

  // 枠そのものは面に化けない（輪ごと塗り潰していないか）。
  const survived = frames(slab).length;
  check("起動しても枠は 12 個のまま残る", survived === 12, `${survived} 個`);

  // 向きを嵌めるついでに決め直していないか（`endPortalFrame()` を通す意味）。
  const turned = spots.filter(([x, y, z], i) => {
    const before = frameFacing(room().getVoxel(...spots[i]));
    return frameFacing(slab.getVoxel(x, y, z)) !== before;
  }).length;
  check("嵌めても枠の向きは変わらない", turned === 0, `${turned} 個が向きを変えた`);

  outOfOrder();
  offAxis();
  edges();
  messages();
  blockRules();
}

/** 嵌める順番に依らないこと（**逆順でも同じ結果**）。 */
function outOfOrder(): void {
  const slab = room();
  const spots = frames(slab).reverse();
  let litAt = -1;
  spots.forEach(([x, y, z], i) => {
    const fit = fitEye(slab, x, y, z);
    if (fit.lit > 0 && litAt < 0) litAt = i + 1;
  });
  check("逆順に嵌めても 12 個目で起動する", litAt === 12 && litCells(slab) === INSIDE, `${litAt} 個目`);
}

/**
 * **輪の中心は枠の向きからは決まりません。** 1 辺の 3 個は同じ向きを向いているので、
 * 「向きへ 2 マス進んだ先が中心」と書くと**角寄りの 8 個が別の場所を指します。**
 * だから最後の 1 個を角寄りの枠にして、そこからでも輪が見つかることを見る。
 */
function offAxis(): void {
  const slab = room();
  // 軸の上（|dx| か |dz| の片方が 0）でない枠 ＝ 1 辺の端の 2 個。
  const spots = frames(slab);
  const corner = spots.find(([x, , z]) => x !== 0 && z !== 0);
  if (!corner) {
    check("角寄りの枠がある", false, "見つからない");
    return;
  }
  const [cx, , cz] = corner;
  for (const [x, y, z] of spots) {
    if (x === cx && z === cz) continue;
    fitEye(slab, x, y, z);
  }
  check("角寄りを残しても起動前", litCells(slab) === 0, `${litCells(slab)} マス`);

  const fit = fitEye(slab, cx, RING_Y, cz);
  console.log(`      角寄りの枠 (${cx}, ${cz}) で仕上げ: ${fit.kind} / 点いた ${fit.lit} マス`);
  check("角寄りの枠からでも輪が見つかって起動する", fit.lit === INSIDE, `${fit.lit} マス`);

  // 中心も正しく求まっているか（ずれると隣に 3x3 が空く）。
  const ring = ringAt(slab, cx, RING_Y, cz);
  check(
    "求めた中心が輪の真ん中",
    ring?.x === 0 && ring?.z === 0 && ring?.missing === 0,
    ring ? `(${ring.x}, ${ring.z}) 残り ${ring.missing}` : "見つからない",
  );
}

/** 端の扱い（もう嵌まっている・輪でない・未読み込み・内側にブロック）。 */
function edges(): void {
  // (1) もう嵌まっている枠を叩いても、もう 1 個は減らない。
  const slab = room();
  const spots = frames(slab);
  for (const [x, y, z] of spots.slice(0, 3)) fitEye(slab, x, y, z);
  const again = fitEye(slab, ...spots[0]);
  check("嵌まっている枠を叩いても嵌め直さない", again.kind === "already" && again.lit === 0, again.kind);

  // (2) 起動したあとに叩いても、面は増えない（冪等）。
  for (const [x, y, z] of spots) fitEye(slab, x, y, z);
  const after = fitEye(slab, ...spots[5]);
  check(
    "起動後にもう一度叩いても面は増えない",
    after.lit === 0 && litCells(slab) === INSIDE,
    `点いた ${after.lit} / 合計 ${litCells(slab)}`,
  );

  // (3) 輪になっていない枠 1 個。**残りは -1**（数に意味が無い）。
  const lone = room();
  const [lx, , lz] = frames(lone)[0];
  lone.setVoxel(lx + 1, RING_Y, lz, AIR);
  const broken = fitEye(lone, lx, RING_Y, lz);
  check(
    "輪が欠けていれば起動せず、残りも数えない",
    broken.kind === "fitted" && broken.lit === 0 && broken.remaining === -1,
    `${broken.kind} / 残り ${broken.remaining}`,
  );

  // (4) 枠でないマスを叩いても何も起きない。
  const none = fitEye(lone, 0, RING_Y, 0);
  check("枠でなければ何も起きない", none.kind === "none", none.kind);

  // (5) 未読み込みの列（書き込みを断る）では嵌まらない。
  const frozen = room();
  const [fx, , fz] = frames(frozen)[0];
  frozen.frozenColumns.add(`${fx >> 4},${fz >> 4}`);
  const before = frozen.getVoxel(fx, RING_Y, fz);
  const blocked = fitEye(frozen, fx, RING_Y, fz);
  check(
    "未読み込みの列では嵌まらず、枠も変わらない",
    blocked.kind === "none" && frozen.getVoxel(fx, RING_Y, fz) === before,
    blocked.kind,
  );

  // (6) 輪の内側にブロックが置いてあっても起動する。**止められると詰む** ——
  // 枠は壊せないので、アイを 12 個使い切ったあとに入れなくなる。
  const stuffed = room();
  stuffed.setVoxel(0, RING_Y, 0, STONE);
  for (const [x, y, z] of frames(stuffed)) fitEye(stuffed, x, y, z);
  check("内側に置かれたブロックごと起動する", litCells(stuffed) === INSIDE, `${litCells(stuffed)} マス`);

  // (7) `activate()` を単体で 2 度呼んでも、2 度目は 0 マス。
  const twice = activate(stuffed, 0, RING_Y, 0);
  check("同じ輪をもう一度点けても増えない", twice === 0, `${twice} マス`);
}

/** 画面に出す 1 行（**`main.ts` に書き分けを戻さないため**）。 */
function messages(): void {
  const say = (fit: EyeFit) => eyeMessage(fit);
  const lines = [
    say({ kind: "none", lit: 0, remaining: -1 }),
    say({ kind: "fitted", lit: 0, remaining: 5 }),
    say({ kind: "fitted", lit: 0, remaining: -1 }),
    say({ kind: "already", lit: 0, remaining: 3 }),
    say({ kind: "fitted", lit: 9, remaining: 0 }),
  ];
  console.log(`      文言: ${lines.map((l) => `「${l}」`).join(" ")}`);
  check("何も起きなければ何も出さない", lines[0] === "", lines[0]);
  check("残りの個数を出す", lines[1].includes("5"), lines[1]);
  check("輪が揃っていなければ個数を出さない", !/\d/.test(lines[2]), lines[2]);
  check("嵌まっている枠は別の文言", lines[3] !== lines[1] && lines[3] !== "", lines[3]);
  check("起動したら起動と出す", lines[4].includes("起動"), lines[4]);
}

/** ポータルの面そのものの決まり（通り抜けられて、壊せない）。 */
function blockRules(): void {
  check("エンドポータルは通り抜けられる", !isSolid(END_PORTAL), `solid ${isSolid(END_PORTAL)}`);
  check(
    "エンドポータルは壊せない",
    !Number.isFinite(blockHardness(END_PORTAL)),
    `硬さ ${blockHardness(END_PORTAL)}`,
  );
}
