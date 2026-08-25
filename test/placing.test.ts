import {
  AIR,
  BED,
  DIRT,
  GRASS,
  LAVA,
  OBSIDIAN,
  STONE,
  STONE_SLAB,
  TALL_GRASS,
  TORCH,
  WATER,
  blockName,
  isBed,
} from "../src/blocks";
import { tryBucket, tryPlace } from "../src/placing";
import { BUCKET, LAVA_BUCKET, WATER_BUCKET } from "../src/items";
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
}
