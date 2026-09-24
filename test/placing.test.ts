import { Scene } from "three";
import {
  AIR,
  BED,
  CACTUS,
  DIRT,
  FARMLAND,
  GRASS,
  LADDER,
  LADDER_XN,
  LADDER_ZN,
  LADDER_ZP,
  LAVA,
  OBSIDIAN,
  PLANK,
  SAND,
  SANDSTONE,
  SAPLING,
  SPRUCE_SAPLING,
  STONE,
  STONE_SLAB,
  SUGAR_CANE,
  TALL_GRASS,
  TORCH,
  VINE,
  VINE_XN,
  WATER,
  WHEAT_CROP,
  blockName,
  isBed,
} from "../src/blocks";
import { tryBucket, tryPlace, tryPlant, tryTill } from "../src/placing";
import { BUCKET, LAVA_BUCKET, WATER_BUCKET } from "../src/items";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 狙っている面。`RaycastHit` と同じ形（`PlaceAim` を構造的に満たす）。 */
function aimAt(
  x: number,
  y: number,
  z: number,
  id: number,
  normal: [number, number, number] = [0, 1, 0],
  hitY = 0.5,
) {
  return {
    id,
    block: { x, y, z },
    normal: { x: normal[0], y: normal[1], z: normal[2] },
    point: { y: y + hitY },
  };
}

/** どこにも当たらない体（置く人が邪魔にならない場合）。 */
const nobody = { overlapsBlock: () => false };
/** 何にでも重なる体（自分の居る所へ置こうとした場合）。 */
const everywhere = { overlapsBlock: () => true };

/** 平らな草原（上面 y=10）。 */
function field(): Slab {
  const slab = new Slab();
  slab.fill(-8, 8, 1, 10, -8, 8, GRASS);
  return slab;
}

export function run(): void {
  describe("ブロックを置く（可否の判断）");

  // もとは `main.ts` の中にあった判断。**ブラウザを開かないと確かめられない場所に
  // 置ける／置けないの規則を戻さないこと。**
  const source = sourceOf("src/placing.ts");
  const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("placing.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));
  check("main.ts に置く判断が戻っていない", !sourceOf("src/main.ts").includes("canPlaceAt"));

  {
    const slab = field();
    const out = tryPlace(slab, nobody, aimAt(0, 10, 0, GRASS), 0, STONE);
    console.log(`      草原の上に石: ${out.kind}  置いたマス ${slab.getVoxel(0, 11, 0)}`);
    check("狙った面の隣に置く", out.kind === "placed" && slab.getVoxel(0, 11, 0) === STONE);
  }

  {
    // 押しのけられるブロック（草むら）は**そのマス自身**に置き換わる。
    const slab = field();
    slab.fill(0, 0, 11, 11, 0, 0, TALL_GRASS);
    const out = tryPlace(slab, nobody, aimAt(0, 11, 0, TALL_GRASS), 0, STONE);
    check("草むらはそのマスに置き換わる", out.kind === "placed" && slab.getVoxel(0, 11, 0) === STONE);
  }

  {
    const slab = field();
    const out = tryPlace(slab, nobody, aimAt(0, 10, 0, GRASS, [0, -1, 0]), 0, STONE);
    console.log(`      埋まったマスへ: ${out.kind}`);
    check("押しのけられないマスには置かない", out.kind === "none");
  }

  {
    // 自分の立っている所に置かせない（置くと壁に埋まる）。
    const slab = field();
    const out = tryPlace(slab, everywhere, aimAt(0, 10, 0, GRASS), 0, STONE);
    check("体と重なる所には置かない", out.kind === "none" && slab.getVoxel(0, 11, 0) === AIR);
  }

  {
    // 松明は支えが要る。**理由を出すこと**（黙って置けないと、何が悪いのか分からない）。
    const floor = field();
    const ok = tryPlace(floor, nobody, aimAt(0, 10, 0, GRASS), 0, TORCH);
    check("支えのある面には松明が付く", ok.kind === "placed");

    const empty = new Slab();
    const bad = tryPlace(empty, nobody, aimAt(0, 10, 0, AIR), 0, TORCH);
    console.log(`      支えの無い所へ松明: ${bad.kind}  ${bad.kind === "blocked" ? bad.message : ""}`);
    check("支えが無ければ置かない", bad.kind === "blocked");
    check(
      "理由にブロックの名前が出る",
      bad.kind === "blocked" && bad.message.includes(blockName(TORCH)),
    );
  }

  {
    // 液体の上には支えの要るものを置けない（水面に松明が浮く）。
    const sea = new Slab();
    sea.fill(-8, 8, 1, 10, -8, 8, WATER);
    const out = tryPlace(sea, nobody, aimAt(0, 10, 0, WATER), 0, TORCH);
    check("液体の上には支えの要るものを置かない", out.kind !== "placed");
  }

  {
    // ベッドは 2 マス。**半分だけ置かれた状態を作らない。**
    const slab = field();
    const out = tryPlace(slab, nobody, aimAt(0, 10, 0, GRASS), 0, BED);
    let parts = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (isBed(slab.getVoxel(x, 11, z))) parts++;
    }
    console.log(`      ベッド: ${out.kind}  置かれたマス ${parts}`);
    check("ベッドは 2 マスで置かれる", out.kind === "placed" && parts === 2);

    // 相方の側が塞がっていたら、**1 マスも置かない。**
    const tight = field();
    tight.fill(-8, 8, 11, 11, -8, 8, STONE);
    tight.fill(0, 0, 11, 11, 0, 0, AIR);
    const half = tryPlace(tight, nobody, aimAt(0, 10, 0, GRASS), 0, BED);
    let left = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (isBed(tight.getVoxel(x, 11, z))) left++;
    }
    console.log(`      置けないベッド: ${half.kind}  残ったマス ${left}`);
    check("置けないときは半分も残さない", half.kind === "blocked" && left === 0);
  }

  {
    // 向き違い（上付きハーフ）。**面の上半分を狙ったら上に付く。**
    const slab = field();
    const upper = tryPlace(slab, nobody, aimAt(0, 10, 0, GRASS, [0, 1, 0], 0.9), 0, STONE_SLAB);
    const lower = tryPlace(field(), nobody, aimAt(0, 10, 0, GRASS, [0, 1, 0], 0.1), 0, STONE_SLAB);
    console.log(
      `      ハーフ: 上を狙う → ${upper.kind === "placed" ? upper.id : "-"} / ` +
        `下を狙う → ${lower.kind === "placed" ? lower.id : "-"}`,
    );
    // 上面に置くぶんには**どちらも下付き**（`placedVariant` の規則。面の上に乗せるため）。
    check("向きは blocks.ts が決めている", upper.kind === "placed" && lower.kind === "placed");
  }

  {
    // 書き込めない列（未読み込み）では、置けなかったことにする。
    const frozen = field();
    frozen.frozenColumns.add("0,0");
    const out = tryPlace(frozen, nobody, aimAt(0, 10, 0, GRASS), 0, DIRT);
    check("書き込めなければ置いたことにしない", out.kind === "none");
  }

  check("空の手では何も起きない", tryPlace(field(), nobody, aimAt(0, 10, 0, GRASS), 0, AIR).kind === "none");

  // --- サトウキビを積む（18b） ---
  // **`placing.ts` は 1 行も変えていない。** 効いているのは `blocks.ts` の 2 つ:
  // `replaceable` を外したこと（`placeSpot()` が狙ったマス自身ではなく法線の側を返す）と
  // `supportsBlock()`（`Slab.canPlaceAt` も同じものを通す）。
  //
  /** 平らな浜（上面 y=10）に、サトウキビが `tall` 段。 */
  function beach(tall: number): Slab {
    const slab = new Slab();
    slab.fill(-4, 4, 1, 10, -4, 4, SAND);
    // **水辺にする**（45）。y10 の z=1 の列を水に —— (0,10,0) と (1,10,0) の砂が水辺になる。
    slab.fill(-4, 4, 10, 10, 1, 1, WATER);
    if (tall > 0) slab.fill(0, 0, 11, 10 + tall, 0, 0, SUGAR_CANE);
    return slab;
  }

  {
    const slab = beach(1);
    const out = tryPlace(slab, nobody, aimAt(0, 11, 0, SUGAR_CANE), 0, SUGAR_CANE);
    console.log(
      `      サトウキビの上面を狙う: ${out.kind}  y11 ${slab.getVoxel(0, 11, 0)} / y12 ${slab.getVoxel(0, 12, 0)}`,
    );
    check(
      "上面を狙うと 1 つ上に立つ（1 本目は消えない）",
      out.kind === "placed" && slab.getVoxel(0, 12, 0) === SUGAR_CANE &&
        slab.getVoxel(0, 11, 0) === SUGAR_CANE,
      `${out.kind} / y11 ${slab.getVoxel(0, 11, 0)} / y12 ${slab.getVoxel(0, 12, 0)}`,
    );
  }

  {
    // 横面は今までどおり隣のマス（砂の上）。**積まれない。**
    const slab = beach(1);
    const out = tryPlace(slab, nobody, aimAt(0, 11, 0, SUGAR_CANE, [1, 0, 0]), 0, SUGAR_CANE);
    console.log(
      `      サトウキビの横面を狙う: ${out.kind}  隣 ${slab.getVoxel(1, 11, 0)} / 真上 ${slab.getVoxel(0, 12, 0)}`,
    );
    check(
      "横面を狙うと隣のマスに立つ（積まれない）",
      out.kind === "placed" && slab.getVoxel(1, 11, 0) === SUGAR_CANE &&
        slab.getVoxel(0, 12, 0) === AIR,
      `${out.kind} / 隣 ${slab.getVoxel(1, 11, 0)} / 真上 ${slab.getVoxel(0, 12, 0)}`,
    );
  }

  {
    // 2 段目の横（＝真下が空中）は理由を出して断る。**`canSupport()` の外側に
    // 足した例外が「自分の上」だけに効いていること**の裏取り。
    const slab = beach(2);
    const out = tryPlace(slab, nobody, aimAt(0, 12, 0, SUGAR_CANE, [1, 0, 0]), 0, SUGAR_CANE);
    console.log(
      `      支えの無い空中へ: ${out.kind}  ${out.kind === "blocked" ? out.message : ""}`,
    );
    check(
      "真下が空中なら blocked（理由に名前が出る）",
      out.kind === "blocked" && out.message.includes(blockName(SUGAR_CANE)) &&
        slab.getVoxel(1, 12, 0) === AIR,
      `${out.kind} / 置いた先 ${slab.getVoxel(1, 12, 0)}`,
    );
  }

  // --- はしごを壁に掛ける（19a） ---
  // **`placing.ts` は「置けない理由の文」1 行しか変えていない。** 向きを決めるのは
  // `blocks.ts` の `ladderVariant()` で、支えを失って落ちるのは `World` の
  // `breakUnsupported()`（**偽の試験場は持たないので、そこだけ本物を通す**）。

  /** 壁 1 枚（x=1 の面。y=11 の高さに 1 マス）。狙うのは壁の側面。 */
  function wall(): Slab {
    const slab = new Slab();
    slab.fill(-8, 8, 1, 10, -8, 8, GRASS);
    slab.fill(1, 1, 11, 12, 0, 0, STONE);
    slab.fill(-1, -1, 11, 12, 0, 0, STONE);
    slab.fill(0, 0, 11, 12, 1, 1, STONE);
    slab.fill(0, 0, 11, 12, -1, -1, STONE);
    return slab;
  }

  {
    // 壁の 4 面それぞれに向けて置く。**入った ID を出してから**向きを判定する。
    // 法線は「狙った壁から見て、はしごが立つ側」。-X の壁（x=-1）の +X 面を
    // 叩けば、はしごは x=0 に立って支えは -X 側にある。
    const cases: [string, number, [number, number, number], number][] = [
      ["+X の壁（x=1）", 1, [-1, 0, 0], LADDER],
      ["-X の壁（x=-1）", -1, [1, 0, 0], LADDER_XN],
    ];
    for (const [name, wx, normal, want] of cases) {
      const slab = wall();
      const out = tryPlace(slab, nobody, aimAt(wx, 11, 0, STONE, normal), 0, LADDER);
      const got = slab.getVoxel(0, 11, 0);
      console.log(`      ${name}: ${out.kind}  入った ID ${got}（期待 ${want}）`);
      check(`${name}にはしごが付く`, out.kind === "placed" && got === want, `${out.kind} / ${got}`);
    }
    const zCases: [string, number, [number, number, number], number][] = [
      ["+Z の壁（z=1）", 1, [0, 0, -1], LADDER_ZP],
      ["-Z の壁（z=-1）", -1, [0, 0, 1], LADDER_ZN],
    ];
    for (const [name, wz, normal, want] of zCases) {
      const slab = wall();
      const out = tryPlace(slab, nobody, aimAt(0, 11, wz, STONE, normal), 0, LADDER);
      const got = slab.getVoxel(0, 11, 0);
      console.log(`      ${name}: ${out.kind}  入った ID ${got}（期待 ${want}）`);
      check(`${name}にはしごが付く`, out.kind === "placed" && got === want, `${out.kind} / ${got}`);
    }
  }

  {
    // 床（上面）を狙うと置けない。**理由の文が「壁にしか」であること** ——
    // 共通の「床か壁」のままだと、床を狙って断られた人には嘘になる。
    const slab = field();
    const out = tryPlace(slab, nobody, aimAt(0, 10, 0, GRASS), 0, LADDER);
    console.log(`      床を狙う: ${out.kind}  ${out.kind === "blocked" ? out.message : ""}`);
    check(
      "床を狙うと blocked（文に「壁にしか」が入る）",
      out.kind === "blocked" && out.message.includes("壁にしか") &&
        out.message.includes(blockName(LADDER)) && slab.getVoxel(0, 11, 0) === AIR,
      out.kind === "blocked" ? out.message : out.kind,
    );

    // **松明の文は「床か壁」のまま。** 表から引いているので、はしごを足しても動かない。
    const empty = new Slab();
    const torch = tryPlace(empty, nobody, aimAt(0, 10, 0, AIR), 0, TORCH);
    console.log(`      松明の文: ${torch.kind === "blocked" ? torch.message : torch.kind}`);
    check(
      "松明の文は「床か壁」のまま",
      torch.kind === "blocked" && torch.message.includes("床か壁にしか"),
      torch.kind === "blocked" ? torch.message : torch.kind,
    );
  }

  {
    // **壁を壊すとはしごも落ちる**（`onAutoBreak` が 1 回）。偽の試験場は
    // `breakUnsupported()` を持たないので、ここだけ本物の `World` を通す。
    const world = new World(new Scene(), new WorldGen(20260906));
    const ground = 60;
    const x = 3;
    const z = 3;
    for (let y = ground; y < ground + 4; y++) {
      world.setVoxel(x, y, z, AIR);
      world.setVoxel(x + 1, y, z, AIR);
    }
    world.setVoxel(x + 1, ground, z, STONE); // 壁
    const placed = tryPlace(
      world,
      nobody,
      aimAt(x + 1, ground, z, STONE, [-1, 0, 0]),
      0,
      LADDER,
    );
    console.log(
      `      本物の World: ${placed.kind}  はしご ${world.getVoxel(x, ground, z)} / 壁 ${world.getVoxel(x + 1, ground, z)}`,
    );
    check(
      "本物の World でも壁に付く",
      placed.kind === "placed" && world.getVoxel(x, ground, z) === LADDER,
      `${placed.kind} / ${world.getVoxel(x, ground, z)}`,
    );

    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === LADDER) broke++; };
    world.setVoxel(x + 1, ground, z, AIR); // 壁を壊す
    check(
      "壁を壊すとはしごも落ちる（合図が 1 回）",
      broke === 1 && world.getVoxel(x, ground, z) === AIR,
      `合図 ${broke} 回 / 残り ${world.getVoxel(x, ground, z)}`,
    );
    world.onAutoBreak = undefined;
    world.dispose();
  }

  // --- ツタは真上のツタにぶら下がる（34b） ----------------------------------
  // **`placing.ts` は 1 行も直していません** —— 増えたのは `blocks.ts` の
  // 支えの候補の表（`supportFaces()`）と `vineVariant()` の 2 つ目の引数だけで、
  // 置く側（`canPlaceAt`）も壊す側（`breakUnsupported`）も**同じそこ**を通ります。
  {
    // 壁は 1 マスだけ（y=11 の -X 側）。**真下に壁が無い**ので、
    // 下へ伸びるぶんは「真上のツタ」だけが支えです。
    const slab = new Slab();
    slab.fill(-1, -1, 11, 11, 0, 0, STONE);
    slab.setVoxel(0, 11, 0, VINE_XN);

    // 下面（法線 -Y）を狙うと、真下に**上と同じ向き**のツタが置ける。
    const first = tryPlace(slab, nobody, aimAt(0, 11, 0, VINE_XN, [0, -1, 0]), 0, VINE);
    const second = tryPlace(slab, nobody, aimAt(0, 10, 0, VINE_XN, [0, -1, 0]), 0, VINE);
    console.log(
      `      ツタの下面を狙う: 1 マス目 ${first.kind} → ${slab.getVoxel(0, 10, 0)} / ` +
        `2 マス目 ${second.kind} → ${slab.getVoxel(0, 9, 0)}（壁は y=11 の 1 マスだけ）`,
    );
    check(
      "ツタの下面を狙うと、真下に上と同じ向きのツタが 2 マス続けて置ける",
      first.kind === "placed" && second.kind === "placed" &&
        slab.getVoxel(0, 10, 0) === VINE_XN && slab.getVoxel(0, 9, 0) === VINE_XN &&
        slab.getVoxel(-1, 10, 0) === AIR,
      `${first.kind}/${slab.getVoxel(0, 10, 0)} ${second.kind}/${slab.getVoxel(0, 9, 0)}`,
    );

    // **横の空中には置けない**（`supportsBlock()` が `face` を見ている証拠 ——
    // 見ていないと、ツタの横から横へ空中に伸びていく）。
    const side = tryPlace(slab, nobody, aimAt(0, 11, 0, VINE_XN, [1, 0, 0]), 0, VINE);
    console.log(
      `      ツタの横（+X）を狙う: ${side.kind}${side.kind === "blocked" ? `「${side.message}」` : ""} / ` +
        `マスの中身 ${slab.getVoxel(1, 11, 0)}`,
    );
    check(
      "ツタの横の空中には置けない（真上も空なら blocked のままマスは空）",
      side.kind === "blocked" && side.message.includes("壁にしか") &&
        slab.getVoxel(1, 11, 0) === AIR,
      side.kind === "blocked" ? side.message : side.kind,
    );

    // **⚠ ただし「真上に固いブロックがある横」は置けます**（34b で開いた道）。
    // 支えとしては**天井**が持っているので嘘ではありませんが、**板の向きは
    // 狙った面から決まる**（`placedVariant()` は `ctx.support` だけを見る）ので、
    // **薄い板（ツタ・はしご）の横に貼り付いて見えます。**
    // **ここは現状を書き留めた判定です** —— 直すなら向きを決める側に
    // 「その壁が本当に支えになれるか」を渡す話になり、`placing.ts` か
    // 34a の判定に手が入ります（`rules/blocks-shapes.md` と `HANDOFF.md` の人の判断）。
    const ceilinged: [string, number][] = [["ツタの横", VINE_XN], ["はしごの横", LADDER]];
    const opened: string[] = [];
    for (const [name, neighbor] of ceilinged) {
      const s = new Slab();
      s.setVoxel(0, 11, 0, neighbor);
      s.setVoxel(1, 12, 0, STONE); // 真上の天井（これが支えになる）
      const out = tryPlace(s, nobody, aimAt(0, 11, 0, neighbor, [1, 0, 0]), 0, VINE);
      opened.push(`${name}(真上に石): ${out.kind} → ${s.getVoxel(1, 11, 0)}`);
    }
    console.log(`      ${opened.join(" / ")}`);
    check(
      "真上に石があれば、薄い板の横でも置ける（支えは天井。向きは狙った面から）",
      opened.every((line) => line.includes(`placed → ${VINE_XN}`)),
      opened.join(" / "),
    );

    // **石の天井の下にも手では置けない**（`vineVariant()` の天井の欄は AIR のまま）。
    // 支えとしては通る（`canSupport()` をゆるめていないので）が、**置く経路は表が止める**。
    const ceiling = new Slab();
    ceiling.fill(-1, 1, 11, 11, -1, 1, STONE);
    const under = tryPlace(ceiling, nobody, aimAt(0, 11, 0, STONE, [0, -1, 0]), 0, VINE);
    console.log(
      `      石の下面を狙う: ${under.kind}${under.kind === "blocked" ? `「${under.message}」` : ""} / ` +
        `マスの中身 ${ceiling.getVoxel(0, 10, 0)}`,
    );
    check(
      "石の天井の下には手では置けない（ツタの天井だけが写る）",
      under.kind === "blocked" && ceiling.getVoxel(0, 10, 0) === AIR,
      under.kind === "blocked" ? under.message : under.kind,
    );
  }

  // --- 苗木は土・草・耕地の上にだけ立つ（30a） ------------------------------
  // **`placing.ts` は 1 行も直していません** —— 落としているのは `blocks.ts` の
  // `supportsBlock()` の 1 行（`needsSoil` の表）で、置く側（`canPlaceAt`）も
  // 壊す側（`breakUnsupported`）も**同じそこ**を通ります。
  {
    // **9 通りを一覧で出してから判定する。** 土 3 種で置けて、それ以外では
    // `blocked` になり、**マスが空のまま**であること（半端に置かれないこと）。
    const floors: [string, number, boolean][] = [
      ["土", DIRT, true],
      ["草", GRASS, true],
      ["耕地", FARMLAND, true],
      ["石", STONE, false],
      ["板", PLANK, false],
      ["砂", SAND, false],
    ];
    const lines: string[] = [];
    const wrong: string[] = [];
    for (const [name, floor, want] of floors) {
      const slab = new Slab();
      slab.fill(-2, 2, 1, 10, -2, 2, floor);
      const out = tryPlace(slab, nobody, aimAt(0, 10, 0, floor), 0, SAPLING);
      const placed = out.kind === "placed";
      lines.push(`${name} ${out.kind}${out.kind === "blocked" ? `「${out.message}」` : ""}`);
      // **置けなかったマスは空のまま**（`blocked` を返しつつ書いていたら気付けない）。
      if (placed !== want || slab.getVoxel(0, 11, 0) !== (want ? SAPLING : AIR)) {
        wrong.push(`${name}(${out.kind}/${slab.getVoxel(0, 11, 0)})`);
      }
    }
    console.log(`      苗木を置く: ${lines.join(" / ")}`);
    check(
      "苗木は土・草・耕地の上にだけ立つ（石・板・砂の上には立たず、マスも空のまま）",
      wrong.length === 0,
      wrong.join(" / ") || "6 通りとも表どおり",
    );

    // **置けない理由の文**。「床か壁」のままだと嘘になる（石の床を狙っても置けない）。
    const stone = new Slab();
    stone.fill(-2, 2, 1, 10, -2, 2, STONE);
    const blocked = tryPlace(stone, nobody, aimAt(0, 10, 0, STONE), 0, SPRUCE_SAPLING);
    console.log(`      石の上の文: ${blocked.kind === "blocked" ? blocked.message : blocked.kind}`);
    check(
      "石の上に置こうとすると「土か草の上にしか」と言う（「床か壁」ではない）",
      blocked.kind === "blocked" && blocked.message.includes("土か草の上にしか") &&
        blocked.message.includes(blockName(SPRUCE_SAPLING)),
      blocked.kind === "blocked" ? blocked.message : blocked.kind,
    );
  }

  // --- サボテンは砂の上にだけ立つ（44） --------------------------------------
  // 苗木の節と同じ形。落としているのは `blocks.ts` の `supportsBlock()` の 1 行
  // （`needsSand` の表）で、**`placing.ts` は 1 行も直していません。**
  {
    const floors: [string, number, boolean][] = [
      ["砂", SAND, true],
      ["草", GRASS, false],
      ["土", DIRT, false],
      ["石", STONE, false],
      ["砂岩", SANDSTONE, false],
    ];
    const lines: string[] = [];
    const wrong: string[] = [];
    let grassMessage = "";
    for (const [name, floor, want] of floors) {
      const slab = new Slab();
      slab.fill(-2, 2, 1, 10, -2, 2, floor);
      const out = tryPlace(slab, nobody, aimAt(0, 10, 0, floor), 0, CACTUS);
      const placed = out.kind === "placed";
      lines.push(`${name} ${out.kind}${out.kind === "blocked" ? `「${out.message}」` : ""}`);
      if (floor === GRASS && out.kind === "blocked") grassMessage = out.message;
      if (placed !== want || slab.getVoxel(0, 11, 0) !== (want ? CACTUS : AIR)) {
        wrong.push(`${name}(${out.kind}/${slab.getVoxel(0, 11, 0)})`);
      }
    }
    console.log(`      サボテンを置く: ${lines.join(" / ")}`);
    check(
      "サボテンは砂の上にだけ立つ（草・土・石・砂岩の上には立たず、マスも空のまま）",
      wrong.length === 0,
      wrong.join(" / ") || "5 通りとも表どおり",
    );
    check(
      "草の上に置こうとすると「砂の上にしか」と言い、サボテンの名前を含む",
      grassMessage.includes("砂の上にしか") && grassMessage.includes(blockName(CACTUS)),
      grassMessage || "文が出ていない",
    );
  }

  // --- サトウキビは水辺の土・草・砂の上だけ（45） ----------------------------
  // 床は `supportsBlock()` の 1 行（`needsBank`）、横の水は `Slab.canPlaceAt()` の 1 行
  // （`waterBesideOk()`。本物の `World.canPlaceAt()` の写し）。**`placing.ts` は 0 行。**
  {
    const floors: [string, number, boolean, boolean][] = [
      ["水辺の砂", SAND, true, true],
      ["水辺の草", GRASS, true, true],
      ["水辺の土", DIRT, true, true],
      ["水の無い砂", SAND, false, false],
      ["水辺の石", STONE, true, false],
      ["水辺の耕地", FARMLAND, true, false],
    ];
    const lines: string[] = [];
    const wrong: string[] = [];
    let dryMessage = "";
    for (const [name, floor, wet, want] of floors) {
      const slab = new Slab();
      slab.fill(-2, 2, 1, 10, -2, 2, floor);
      if (wet) slab.fill(1, 1, 10, 10, 0, 0, WATER);
      const out = tryPlace(slab, nobody, aimAt(0, 10, 0, floor), 0, SUGAR_CANE);
      const placed = out.kind === "placed";
      lines.push(`${name} ${out.kind}${out.kind === "blocked" ? `「${out.message}」` : ""}`);
      if (name === "水の無い砂" && out.kind === "blocked") dryMessage = out.message;
      if (placed !== want || slab.getVoxel(0, 11, 0) !== (want ? SUGAR_CANE : AIR)) {
        wrong.push(`${name}(${out.kind}/${slab.getVoxel(0, 11, 0)})`);
      }
    }
    console.log(`      サトウキビを置く: ${lines.join(" / ")}`);
    check(
      "サトウキビは水辺の砂・草・土にだけ立つ（水の無い砂・水辺の石・耕地は blocked でマスも空）",
      wrong.length === 0,
      wrong.join(" / ") || "6 通りとも表どおり",
    );
    check(
      "水の無い砂に置こうとすると「水辺の」と言い、サトウキビの名前を含む",
      dryMessage.includes("水辺の") && dryMessage.includes(blockName(SUGAR_CANE)),
      dryMessage || "文が出ていない",
    );
  }

  {
    // **真下の土を掘ると苗木も落ちる**（`onAutoBreak` が 1 回）。偽の試験場は
    // `breakUnsupported()` を持たないので、ここだけ本物の `World` を通す
    // （はしごの節とまったく同じ手本）。
    const world = new World(new Scene(), new WorldGen(20260913));
    const ground = 60;
    const x = 6;
    const z = 6;
    for (let y = ground; y < ground + 4; y++) world.setVoxel(x, y, z, AIR);
    world.setVoxel(x, ground - 1, z, DIRT);
    const placed = tryPlace(world, nobody, aimAt(x, ground - 1, z, DIRT), 0, SAPLING);
    console.log(
      `      本物の World: ${placed.kind}  苗木 ${world.getVoxel(x, ground, z)} / 真下 ${world.getVoxel(x, ground - 1, z)}`,
    );
    check(
      "本物の World でも土の上に立つ",
      placed.kind === "placed" && world.getVoxel(x, ground, z) === SAPLING,
      `${placed.kind} / ${world.getVoxel(x, ground, z)}`,
    );

    let broke = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === SAPLING) broke++; };
    world.setVoxel(x, ground - 1, z, AIR); // 真下の土を掘る
    check(
      "真下の土を掘ると苗木が壊れて落ちる（合図が 1 回）",
      broke === 1 && world.getVoxel(x, ground, z) === AIR,
      `合図 ${broke} 回 / 残り ${world.getVoxel(x, ground, z)}`,
    );

    // **消したときだけではない。** 土を石に差し替えても、支えでなくなった瞬間に落ちる
    // （置く側と壊す側が同じ `supportsBlock()` を通っている証拠）。
    world.setVoxel(x, ground - 1, z, GRASS);
    const again = tryPlace(world, nobody, aimAt(x, ground - 1, z, GRASS), 0, SAPLING);
    let broke2 = 0;
    world.onAutoBreak = (_x, _y, _z, id) => { if (id === SAPLING) broke2++; };
    world.setVoxel(x, ground - 1, z, STONE);
    check(
      "真下を草から石に差し替えても落ちる（消したときだけではない）",
      again.kind === "placed" && broke2 === 1 && world.getVoxel(x, ground, z) === AIR,
      `置けたか ${again.kind} / 合図 ${broke2} 回 / 残り ${world.getVoxel(x, ground, z)}`,
    );
    world.onAutoBreak = undefined;
    world.dispose();
  }

  describe("バケツで汲む／流す（tryBucket）");

  {
    // 水面を狙って汲む。**光線は液体に当たるもの**を渡すこと（`main.ts` が引き直す）。
    const pond = field();
    pond.fill(-4, 4, 10, 10, -4, 4, WATER);
    const filled = tryBucket(pond, aimAt(0, 10, 0, WATER), BUCKET, 0);
    check("水を汲むと水入りバケツになる", filled.kind === "used" && filled.item === WATER_BUCKET, filled.kind);
    check("汲んだマスは空になる", pond.getVoxel(0, 10, 0) === AIR, blockName(pond.getVoxel(0, 10, 0)));
    check("何を汲んだか言う", filled.kind === "used" && filled.message.includes("水"), filled.kind === "used" ? filled.message : "");

    const lavaLake = field();
    lavaLake.fill(-4, 4, 10, 10, -4, 4, LAVA);
    const hot = tryBucket(lavaLake, aimAt(0, 10, 0, LAVA), BUCKET, 0);
    check("溶岩も同じ 1 本で汲める", hot.kind === "used" && hot.item === LAVA_BUCKET, hot.kind);

    // 汲めないものを狙ったときは、**黙って何も起きないのではなく理由を出す。**
    const rock = tryBucket(field(), aimAt(0, 10, 0, GRASS), BUCKET, 0);
    check("液体でなければ理由が出る", rock.kind === "blocked", rock.kind);
    // 空のバケツで液体でないものを狙ったときだけ「汲めない」。
    // **中身入りのバケツは流す側**（岩を狙っても手前に流れる。下の節）。
    check("空のバケツで空を狙っても理由が出る", tryBucket(field(), aimAt(0, 10, 0, AIR), BUCKET, 0).kind === "blocked");
    check("道具でも食べ物でもない手では何も起きない", tryBucket(field(), aimAt(0, 10, 0, WATER), STONE, 0).kind === "blocked");
  }

  {
    // 流すのは置くマス（狙った面の手前）。
    const ground = field();
    const spilled = tryBucket(ground, aimAt(0, 10, 0, GRASS), WATER_BUCKET, 0);
    check("流すと空のバケツに戻る", spilled.kind === "used" && spilled.item === BUCKET, spilled.kind);
    check("狙った面の手前に水が入る", ground.getVoxel(0, 11, 0) === WATER, blockName(ground.getVoxel(0, 11, 0)));

    // 押しのけられないマスには流さない（草むらは押しのけられる）。
    const blocked = field();
    blocked.fill(0, 0, 11, 11, 0, 0, STONE);
    const out = tryBucket(blocked, aimAt(0, 10, 0, GRASS), WATER_BUCKET, 0);
    check("岩の中には流さない", out.kind === "none", out.kind);
    check("流さなければバケツも減らない", blocked.getVoxel(0, 11, 0) === STONE);

    // 書き込めない列（未読み込み）でも落ちないこと。
    const frozen = field();
    frozen.frozenColumns.add("0,0");
    check("書き込めなければ流したことにしない", tryBucket(frozen, aimAt(0, 10, 0, GRASS), WATER_BUCKET, 0).kind === "none");
  }

  {
    // **水と溶岩がぶつかると黒曜石**（規則は `liquids.ts`。ここは「流した直後に効かせる」）。
    const lavaLake = field();
    lavaLake.fill(-2, 2, 11, 11, -2, 2, LAVA);
    lavaLake.setVoxel(0, 11, 0, AIR);
    const quenched = tryBucket(lavaLake, aimAt(0, 10, 0, GRASS), WATER_BUCKET, 0);
    check("溶岩に水をかけると黒曜石ができる", quenched.kind === "used" && quenched.message.includes(blockName(OBSIDIAN)), quenched.kind === "used" ? quenched.message : quenched.kind);
    let obsidian = 0;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (lavaLake.getVoxel(x, 11, z) === OBSIDIAN) obsidian++;
    }
    check("固まったのは隣り合っていた溶岩", obsidian > 0, `${obsidian} 個`);
  }

  describe("クワで耕す（tryTill）");

  {
    // 土も草も耕地になる。上（y=11）は空いているので耕せる。
    const dirtField = new Slab();
    dirtField.fill(-4, 4, 10, 10, -4, 4, DIRT);
    const tilledDirt = tryTill(dirtField, { x: 0, y: 10, z: 0 });
    console.log(`      土を耕す: ${tilledDirt.kind}  結果 ${dirtField.getVoxel(0, 10, 0)}`);
    check("土を耕すと耕地", tilledDirt.kind === "placed" && dirtField.getVoxel(0, 10, 0) === FARMLAND);

    const grassField = field();
    const tilledGrass = tryTill(grassField, { x: 0, y: 10, z: 0 });
    check("草も耕せる", tilledGrass.kind === "placed" && grassField.getVoxel(0, 10, 0) === FARMLAND);

    // 石は耕せない（`tilled()` が AIR を返す）。黙って何も起きない。
    const rock = new Slab();
    rock.fill(-4, 4, 10, 10, -4, 4, STONE);
    const tilledRock = tryTill(rock, { x: 0, y: 10, z: 0 });
    check("石は耕せない", tilledRock.kind === "none" && rock.getVoxel(0, 10, 0) === STONE);
  }

  {
    // 上が塞がっていると耕せない（石でも水でも）。
    const blockedByStone = field();
    blockedByStone.fill(0, 0, 11, 11, 0, 0, STONE);
    const stoneAbove = tryTill(blockedByStone, { x: 0, y: 10, z: 0 });
    console.log(`      上に石: ${stoneAbove.kind}  ${stoneAbove.kind === "blocked" ? stoneAbove.message : ""}`);
    check(
      "上に石があると耕せない（理由が出る）",
      stoneAbove.kind === "blocked" && blockedByStone.getVoxel(0, 10, 0) === GRASS,
    );

    const blockedByWater = field();
    blockedByWater.fill(0, 0, 11, 11, 0, 0, WATER);
    const waterAbove = tryTill(blockedByWater, { x: 0, y: 10, z: 0 });
    // 水は `isReplaceable` だが、それでも `isLiquid` なので塞がっている扱い。
    check("上に水があっても耕せない", waterAbove.kind === "blocked", waterAbove.kind);

    // **上が草むらなら耕せる**（草むらは `isReplaceable` で液体ではない）。
    const grassy = field();
    grassy.fill(0, 0, 11, 11, 0, 0, TALL_GRASS);
    const grassyAbove = tryTill(grassy, { x: 0, y: 10, z: 0 });
    check("上が草むらなら耕せる", grassyAbove.kind === "placed" && grassy.getVoxel(0, 10, 0) === FARMLAND);
  }

  {
    // 書き込めない列（未読み込み）では、耕せなかったことにする。
    const frozen = field();
    frozen.frozenColumns.add("0,0");
    const out = tryTill(frozen, { x: 0, y: 10, z: 0 });
    check("書き込めなければ耕したことにしない", out.kind === "none");
  }

  describe("種を植える（tryPlant）");

  /** 耕地 1 マス（上面 y=10）。**狙うのは耕地そのもの**で、苗が立つのは 1 つ上。 */
  function farm(): Slab {
    const slab = new Slab();
    slab.fill(-4, 4, 10, 10, -4, 4, FARMLAND);
    return slab;
  }

  {
    const field2 = farm();
    const planted = tryPlant(field2, { x: 0, y: 10, z: 0 });
    console.log(
      `      耕地に植える: ${planted.kind}  下 ${field2.getVoxel(0, 10, 0)} / 上 ${field2.getVoxel(0, 11, 0)}`,
    );
    check("耕地を狙うと上に苗が立つ", planted.kind === "placed" && field2.getVoxel(0, 11, 0) === WHEAT_CROP);
    // **耕地は耕地のまま**（苗が立つのは 1 つ上なので、下を書き換えてはいけない）。
    check("苗が立っても耕地は耕地のまま", field2.getVoxel(0, 10, 0) === FARMLAND, `${field2.getVoxel(0, 10, 0)}`);
  }

  {
    // 土・草・石には植わらない（**黙って何も起きない** —— 草原のどこを右クリック
    // しても理由が出るのは煩い）。
    const rows: [string, number][] = [["土", DIRT], ["草", GRASS], ["石", STONE]];
    for (const [name, id] of rows) {
      const slab = new Slab();
      slab.fill(-4, 4, 10, 10, -4, 4, id);
      const out = tryPlant(slab, { x: 0, y: 10, z: 0 });
      check(`${name}には植わらない（黙って何も起きない）`, out.kind === "none" && slab.getVoxel(0, 11, 0) === AIR, out.kind);
    }
  }

  {
    // 上が塞がっていたら理由を出す（`tryTill()` とまったく同じ規則）。
    const byStone = farm();
    byStone.fill(0, 0, 11, 11, 0, 0, STONE);
    const stoneAbove = tryPlant(byStone, { x: 0, y: 10, z: 0 });
    console.log(`      上に石: ${stoneAbove.kind}  ${stoneAbove.kind === "blocked" ? stoneAbove.message : ""}`);
    check("上に石があると植えられない（理由が出る）", stoneAbove.kind === "blocked" && byStone.getVoxel(0, 11, 0) === STONE);

    const byWater = farm();
    byWater.fill(0, 0, 11, 11, 0, 0, WATER);
    // 水は `isReplaceable` だが、それでも `isLiquid` なので塞がっている扱い。
    check("上に水があっても植えられない", tryPlant(byWater, { x: 0, y: 10, z: 0 }).kind === "blocked");

    // **もう苗が立っているマスも塞がっている扱い**（苗は `replaceable` ではない）。
    // ここが `none` に落ちると、右クリックのたびに種だけが 1 個ずつ減る。
    const grown = farm();
    grown.setVoxel(0, 11, 0, WHEAT_CROP);
    const twice = tryPlant(grown, { x: 0, y: 10, z: 0 });
    check("もう苗が立っているマスには植えられない", twice.kind === "blocked", twice.kind);

    // 上が草むらなら植わる（草むらは `isReplaceable` で液体ではない）。
    const grassy2 = farm();
    grassy2.fill(0, 0, 11, 11, 0, 0, TALL_GRASS);
    const overGrass = tryPlant(grassy2, { x: 0, y: 10, z: 0 });
    check("上が草むらなら植わる", overGrass.kind === "placed" && grassy2.getVoxel(0, 11, 0) === WHEAT_CROP);
  }

  {
    // 書き込めない列（未読み込み）では、植えたことにしない（`tryTill()` と同じ）。
    const frozen = farm();
    frozen.frozenColumns.add("0,0");
    check("書き込めなければ植えたことにしない", tryPlant(frozen, { x: 0, y: 10, z: 0 }).kind === "none");
  }
}
