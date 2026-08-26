import { Scene } from "three";
import { AIR, END_CRYSTAL, END_STONE, OBSIDIAN, isProp, isSolid, blockDef } from "../src/blocks";
import { columnOf } from "../src/constants";
import {
  CRYSTAL_COUNT,
  crystalState,
  crystalStates,
  liveCrystals,
  shatterCrystal,
} from "../src/crystals";
import { CRYSTAL_SPOTS, EndGen } from "../src/endgen";
import { dropOf } from "../src/items";
import { deserializeEdits, serializeEdits } from "../src/storage";
import { World } from "../src/world";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 10 個ぶんのクリスタルを並べた試験場（柱は要らない —— 見るのはそのマスだけ）。 */
function stocked(): Slab {
  const slab = new Slab();
  for (const spot of CRYSTAL_SPOTS) slab.setVoxel(spot.x, spot.y, spot.z, END_CRYSTAL);
  return slab;
}

export function run(): void {
  describe("エンドクリスタル");

  // --- 判断のファイルに、確かめられないものが紛れていないこと -----------------

  {
    const source = sourceOf("src/crystals.ts");
    const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
      source.includes(w),
    );
    check("crystals.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

    // **居場所は `endgen.ts` から引くこと。** 写して 2 か所に持つと、柱を動かしたときに
    // 「柱の無い所のクリスタルを探し続ける」形で静かに壊れる。
    check(
      "居場所は endgen.ts の表から引いている",
      source.includes('from "./endgen"') && source.includes("CRYSTAL_SPOTS"),
    );
    // 自前で輪を組み直していないこと（半径や本数の名前が出てこない）。
    const copied = ["PILLAR_RING", "PILLAR_HEIGHTS", "Math.cos("].filter((w) =>
      source.includes(w),
    );
    check("柱の輪を自分で組み直していない", copied.length === 0, copied.join(" "));
  }

  // --- ブロックとしての性質 -------------------------------------------------

  {
    const def = blockDef(END_CRYSTAL);
    console.log(
      `      エンドクリスタル: 硬さ ${def.hardness} / 明るさ ${def.emission} / ` +
        `箱 ${def.boxes.length} 個 / solid ${def.solid} / opaque ${def.opaque}`,
    );
    // **`solid` でないと飛び道具が素通りする**（`collisionBoxes()` が空の箱を返す）。
    // 矢で壊せることがクリア導線なので、ここは崩せない。
    check("solid（飛び道具が当たる）", isSolid(END_CRYSTAL));
    // 立方体でないので greedy の面マスクには載らない（`buildProps()` が積む）。
    check("立方体ではない（isProp）", isProp(END_CRYSTAL));
    check("すぐ壊せる（素手で数フレーム）", def.hardness > 0 && def.hardness < 0.5, `${def.hardness}`);
    check("自分で光る", def.emission > 0, `${def.emission}`);
    // **何も落とさないこと。** 拾えると、柱の上へ運び直してドラゴンの回復を戻せる。
    const drop = dropOf(END_CRYSTAL);
    check("壊しても何も落ちない", drop.item === 0 || drop.count === 0, `${drop.item} x ${drop.count}`);
  }

  // --- 生き死にを読む -------------------------------------------------------

  {
    const slab = stocked();
    const alive = liveCrystals(slab);
    console.log(`      並べた ${CRYSTAL_SPOTS.length} 個: 生きている ${alive.length}`);
    check("並べたぶんが全部生きている", alive.length === CRYSTAL_COUNT, `${alive.length}`);

    // 1 個砕く。
    const first = CRYSTAL_SPOTS[0];
    const broken = shatterCrystal(slab, first.x, first.y, first.z);
    const after = liveCrystals(slab);
    console.log(
      `      1 個砕いたあと: 生きている ${after.length} / 砕いたマス ` +
        `${slab.getVoxel(first.x, first.y, first.z)}（砕けた ID ${broken}）`,
    );
    check("砕くと消える", slab.getVoxel(first.x, first.y, first.z) === AIR);
    check("砕けたブロックの ID が返る", broken === END_CRYSTAL, `${broken}`);
    check("1 個減る", after.length === CRYSTAL_COUNT - 1, `${after.length}`);
    check("減ったのは砕いたぶん", !after.some((s) => s.x === first.x && s.z === first.z));

    // **2 度目は何も起きない。** 返り値で「起きたかどうか」を見分けられること
    // （見分けられないと、当てた弾を消すかどうかを呼ぶ側が決められない）。
    check("もう無いマスを砕いても何も起きない", shatterCrystal(slab, first.x, first.y, first.z) === AIR);
    // クリスタルでないマスも同じ。
    slab.setVoxel(0, 60, 0, OBSIDIAN);
    check("別のブロックは砕かない", shatterCrystal(slab, 0, 60, 0) === AIR);
    check("別のブロックは残る", slab.getVoxel(0, 60, 0) === OBSIDIAN);
  }

  {
    // **未読み込みの列を「砕けた」と読まないこと。** `getVoxel` は AIR を返すので、
    // `hasColumn` を見ないと、エンドに降りた直後に 10 個とも砕けたことになる
    // （かまどの `syncLit()` / ベッドの `moveToSpawn()` と同じ罠）。
    const slab = stocked();
    const hidden = CRYSTAL_SPOTS[3];
    slab.frozenColumns.add(`${columnOf(hidden.x)},${columnOf(hidden.z)}`);

    const states = crystalStates(slab);
    const counts = {
      alive: states.filter((s) => s.state === "alive").length,
      gone: states.filter((s) => s.state === "gone").length,
      unknown: states.filter((s) => s.state === "unknown").length,
    };
    console.log(
      `      1 列を未読み込みにしたとき: 生 ${counts.alive} / 砕 ${counts.gone} / ` +
        `不明 ${counts.unknown}`,
    );
    check("未読み込みの列は「不明」", crystalState(slab, hidden) === "unknown");
    check("「砕けた」と読まない", counts.gone === 0, `${counts.gone} 個`);
    // **不明は生きているに数えない**（数えると、着いた直後にドラゴンが回復し続ける）。
    check("不明は生きているに数えない", liveCrystals(slab).length === CRYSTAL_COUNT - 1);
    check("残りはちゃんと生きている", counts.alive === CRYSTAL_COUNT - 1, `${counts.alive} 個`);
  }

  // --- 本物のエンドで、砕いた記録が残ること ---------------------------------

  {
    // **これがモブ側に載せなかった理由そのもの。** ブロックなので `edits` に乗り、
    // セーブして開き直しても砕けたままになる（モブは保存しないので生き返る）。
    const seed = 12345;
    const spot = CRYSTAL_SPOTS[2];
    const world = new World(new Scene(), new EndGen(seed));
    world.primeAround(spot.x, spot.z, 1);

    const before = world.getVoxel(spot.x, spot.y, spot.z);
    const under = world.getVoxel(spot.x, spot.y - 1, spot.z);
    console.log(
      `      本物のエンド（種 ${seed}）: 柱 ${spot.x},${spot.z} の上 y${spot.y} は ` +
        `${before}（真下は ${under}）/ 生きている ${liveCrystals(world).length} 個`,
    );
    check("生成された世界にクリスタルが載っている", before === END_CRYSTAL, `${before}`);
    check("その真下は黒曜石の柱", under === OBSIDIAN, `${under}`);
    // **先に「読めている」ことを確かめる**（`rules/testing.md`）。列が届いていなければ
    // 下の「砕けた」は「まだ読めていない」と見分けが付かない。**残り 9 個は
    // 遠いので `unknown` のまま** —— 数で見ると、そちらと混ざって何も守れない。
    check("列が読み込まれている", world.hasColumn(columnOf(spot.x), columnOf(spot.z)));
    check("砕く前は生きている", crystalState(world, spot) === "alive");

    const broke = shatterCrystal(world, spot.x, spot.y, spot.z);
    check("本物の世界でも砕ける", broke === END_CRYSTAL);
    check("砕いたぶんが「砕けた」に変わる", crystalState(world, spot) === "gone");

    // セーブして開き直す。**同じ生成器なら、地形は作り直されて改変だけが載る。**
    const round = deserializeEdits(JSON.parse(JSON.stringify(serializeEdits(world.editsForSave()))));
    const reopened = new World(new Scene(), new EndGen(seed), round);
    // **砕いていないぶんも読み込むこと。** 読まないと `unknown` のままで、
    // 「戻っていない」のか「まだ見えていない」のか見分けが付かない。
    for (const other of CRYSTAL_SPOTS) reopened.primeAround(other.x, other.z, 1);

    const again = reopened.getVoxel(spot.x, spot.y, spot.z);
    const states = crystalStates(reopened);
    const gone = states.filter((s) => s.state === "gone");
    const alive = states.filter((s) => s.state === "alive").length;
    const unknown = states.filter((s) => s.state === "unknown").length;
    console.log(
      `      開き直したあと: 砕いたマス ${again} / 生 ${alive} / 砕 ${gone.length} / 不明 ${unknown}`,
    );
    check("砕いたクリスタルは読み込み直しても戻らない", again === AIR, `${again}`);
    check("全部の列が読めている", unknown === 0, `不明 ${unknown} 個`);
    // **砕いたのは 1 個だけ。** 改変が別のマスに化けていないこと。
    check("砕けているのは 1 個だけ", gone.length === 1, `${gone.length} 個`);
    check("砕けたのは砕いたマス", gone[0]?.spot.x === spot.x && gone[0]?.spot.z === spot.z);
    check("残りは全部生きている", alive === CRYSTAL_COUNT - 1, `${alive} 個`);
    // 地形そのものは作り直されていること（改変だけを持つ形が崩れていない）。
    check("島は作り直されている", reopened.getVoxel(0, 48, 0) === END_STONE);

    world.dispose();
    reopened.dispose();
  }
}
