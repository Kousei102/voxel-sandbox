import { Scene } from "three";
import { AIR, END_PORTAL, END_STONE, OBSIDIAN, isSolid } from "../src/blocks";
import { columnOf } from "../src/constants";
import { END, OVERWORLD } from "../src/dimensions";
import {
  END_SPAWN,
  EXIT_PORTAL_SPOT,
  EndGen,
  ISLAND_SURFACE,
  LANDING_RADIUS,
} from "../src/endgen";
import {
  EXIT_PORTAL_CELLS,
  buildExitPortal,
  exitPortalState,
  syncExitPortal,
} from "../src/exitportal";
import { landOnGround, planTravel, portalAt } from "../src/portaltravel";
import { deserializeEdits, serializeEdits } from "../src/storage";
import { World } from "../src/world";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

export function run(): void {
  describe("出口ポータル（ドラゴンを倒した印）");

  // --- 判断のファイルに、確かめられないものが紛れていないこと -----------------

  {
    const source = sourceOf("src/exitportal.ts");
    const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
      source.includes(w),
    );
    check("exitportal.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

    // **居場所は `endgen.ts` から引くこと。** 写して 2 か所に持つと、島の形を
    // 変えたときに「面が崖の途中に建って踏めない」形で静かに壊れる。
    check(
      "居場所は endgen.ts の表から引いている",
      source.includes('from "./endgen"') && source.includes("EXIT_PORTAL_SPOT"),
    );
    const copied = ["ISLAND_SURFACE", "LANDING_RADIUS", "END_SPAWN"].filter((w) =>
      source.includes(w),
    );
    check("島の高さや半径を写していない", copied.length === 0, copied.join(" "));
  }

  // --- 面の形 ---------------------------------------------------------------

  {
    const ys = new Set(EXIT_PORTAL_CELLS.map((c) => c.y));
    const centre = EXIT_PORTAL_CELLS.filter(
      (c) => c.x === EXIT_PORTAL_SPOT.x && c.z === EXIT_PORTAL_SPOT.z,
    );
    const spread = EXIT_PORTAL_CELLS.map((c) =>
      Math.max(Math.abs(c.x - EXIT_PORTAL_SPOT.x), Math.abs(c.z - EXIT_PORTAL_SPOT.z)),
    );
    console.log(
      `      面 ${EXIT_PORTAL_CELLS.length} マス / 高さ ${[...ys].join(",")} / ` +
        `中心 (${EXIT_PORTAL_SPOT.x}, ${EXIT_PORTAL_SPOT.z}) から最大 ${Math.max(...spread)} マス`,
    );
    check("面は 3x3", EXIT_PORTAL_CELLS.length === 9, `${EXIT_PORTAL_CELLS.length} マス`);
    check("全部おなじ高さ（寝ている面）", ys.size === 1);
    check("中心のマスを含む", centre.length === 1);

    // **地面に埋めないこと。** `main.ts` が見るのは足元のマスなので、上面に埋めると
    // 上を歩いても踏んだことにならない。
    check(
      "面は地面の 1 つ上（立つ人の足元と同じ段）",
      EXIT_PORTAL_SPOT.y === ISLAND_SURFACE + 1,
      `y=${EXIT_PORTAL_SPOT.y} / 島の上面 ${ISLAND_SURFACE}`,
    );

    // **平らな所に収まっていること。** `LANDING_RADIUS` の外はうねるので、
    // はみ出すと面の下に段差ができて、踏めないマスが混じる。
    const reaches = EXIT_PORTAL_CELLS.map((c) => Math.hypot(c.x, c.z));
    check(
      "9 マスとも平らな所（LANDING_RADIUS の内側）",
      Math.max(...reaches) < LANDING_RADIUS,
      `いちばん遠いマス ${Math.max(...reaches).toFixed(2)} < ${LANDING_RADIUS}`,
    );

    // **出る場所と重ねないこと。** 重なると、降りた瞬間に面の中に立って引き返される。
    const onSpawn = EXIT_PORTAL_CELLS.some((c) => c.x === END_SPAWN.x && c.z === END_SPAWN.z);
    check("降りる場所（END_SPAWN）と重なっていない", !onSpawn);
  }

  // --- 建てる／読む ---------------------------------------------------------

  {
    const slab = new Slab();
    check("建てる前は「無い」", exitPortalState(slab) === "gone", exitPortalState(slab));

    // **倒していないうちは 1 マスも書かないこと。** 書くと、エンドに降りただけの人の
    // 目の前に帰り道が open する（ドラゴンを倒す意味が消える）。
    const quiet = syncExitPortal(slab, false);
    console.log(`      倒していないとき: 印 ${quiet} / 書かれたマス ${slab.filled}`);
    check("倒していなければ印は立たない", !quiet);
    check("倒していなければ 1 マスも書かない", slab.filled === 0, `${slab.filled} マス`);

    const marked = syncExitPortal(slab, true);
    const faces = EXIT_PORTAL_CELLS.filter((c) => slab.getVoxel(c.x, c.y, c.z) === END_PORTAL);
    const floors = EXIT_PORTAL_CELLS.filter((c) => slab.getVoxel(c.x, c.y - 1, c.z) === OBSIDIAN);
    console.log(
      `      倒したあと: 印 ${marked} / 面 ${faces.length} マス / 床 ${floors.length} マス`,
    );
    check("倒したら印が立つ", marked);
    check("9 マスとも面になる", faces.length === 9, `${faces.length} マス`);
    // **床を置くこと。** 面は通り抜けられるので、掘られていると踏んだ人が落ちる。
    check("面の下に床（黒曜石）ができる", floors.length === 9, `${floors.length} マス`);
    check("床は固体（立てる）", isSolid(OBSIDIAN));
    check("建ったら「建っている」", exitPortalState(slab) === "built", exitPortalState(slab));

    // 2 度目は何も増えない（毎フレーム呼ぶので、増えると `edits` が太り続ける）。
    const before = slab.filled;
    syncExitPortal(slab, true);
    check("何度呼んでも増えない", slab.filled === before, `${before} → ${slab.filled}`);
  }

  {
    // **穴あきの面を「建っている」と読まないこと。** 中心 1 マスだけで決めると、
    // 書き込みが途中で落ちた面が二度と埋まらない。
    const slab = new Slab();
    buildExitPortal(slab);
    const hole = EXIT_PORTAL_CELLS[0];
    slab.setVoxel(hole.x, hole.y, hole.z, AIR);
    check("1 マス欠けたら「無い」", exitPortalState(slab) === "gone", exitPortalState(slab));
    syncExitPortal(slab, true);
    check("次のフレームで埋め直す", exitPortalState(slab) === "built");
  }

  {
    // **未読み込みの列を「無い」と読まないこと。** `getVoxel` は AIR を返すので、
    // 読むと**倒した人のエンドにドラゴンがもう 1 体湧く**（クリスタルと同じ罠）。
    const slab = new Slab();
    buildExitPortal(slab);
    const hidden = EXIT_PORTAL_CELLS[0];
    slab.frozenColumns.add(`${columnOf(hidden.x)},${columnOf(hidden.z)}`);
    check("未読み込みの列は「不明」", exitPortalState(slab) === "unknown", exitPortalState(slab));
    check("不明のうちは印が立っているものとして扱う", syncExitPortal(slab, false));

    // 建てるほうも同じ。書けなかったぶんは持ち越して、列が届いてから建てる。
    const late = new Slab();
    late.frozenColumns.add(`${columnOf(hidden.x)},${columnOf(hidden.z)}`);
    syncExitPortal(late, true);
    console.log(`      未読み込みのまま倒したとき: 書かれたマス ${late.filled}`);
    check("読めない列には建てない", late.filled === 0, `${late.filled} マス`);
    late.frozenColumns.clear();
    syncExitPortal(late, true);
    check("列が届いたら建つ", exitPortalState(late) === "built", exitPortalState(late));
  }

  // --- 本物のエンドで、踏めて・帰れて・残ること -----------------------------

  {
    const seed = 4242;
    const world = new World(new Scene(), new EndGen(seed));
    world.primeAround(EXIT_PORTAL_SPOT.x, EXIT_PORTAL_SPOT.z, 1);

    // **先に「読めている」ことと「そこが地面」を確かめる**（`rules/testing.md`）。
    // 確かめずに建てると、下の「建った」は「AIR に書いた」と見分けが付かない。
    const loaded = EXIT_PORTAL_CELLS.every((c) => world.hasColumn(columnOf(c.x), columnOf(c.z)));
    const ground = EXIT_PORTAL_CELLS.map((c) => world.getVoxel(c.x, c.y - 1, c.z));
    const above = EXIT_PORTAL_CELLS.map((c) => world.getVoxel(c.x, c.y, c.z));
    console.log(
      `      本物のエンド（種 ${seed}）: 列が読めている ${loaded} / ` +
        `足元 ${[...new Set(ground)].join(",")} / 面の高さ ${[...new Set(above)].join(",")}`,
    );
    check("列が読み込まれている", loaded);
    check("9 マスとも足元が島の地面", ground.every((id) => id === END_STONE));
    check("9 マスとも空いている（柱もクリスタルも無い）", above.every((id) => id === AIR));
    check("建てる前は印が無い", exitPortalState(world) === "gone", exitPortalState(world));

    check("倒したら建つ", syncExitPortal(world, true) && exitPortalState(world) === "built");

    // **踏めること。** `main.ts` は足元のマスを `portalAt()` に通すだけなので、
    // ここが null だと**帰り道が無いまま印だけ立つ。**
    const here = portalAt(world.getVoxel(EXIT_PORTAL_SPOT.x, EXIT_PORTAL_SPOT.y, EXIT_PORTAL_SPOT.z));
    check("踏むとポータルとして見分けられる", here?.kind === "end", `${here?.kind}`);
    if (here) {
      const trip = planTravel(END, here, EXIT_PORTAL_SPOT.x + 0.5, EXIT_PORTAL_SPOT.y, EXIT_PORTAL_SPOT.z + 0.5);
      console.log(`      踏んだときの行き先: ${trip.to}（${trip.x}, ${trip.z}）`);
      check("行き先はオーバーワールド", trip.to === OVERWORLD, trip.to);
    }

    // **降りた所が面の中にならないこと。** なると、着いた瞬間に引き返されて島に立てない。
    const landing = landOnGround(world, END_SPAWN.x, END_SPAWN.z);
    const under = landing
      ? portalAt(
          world.getVoxel(
            Math.floor(landing.x),
            Math.floor(landing.y + 0.5),
            Math.floor(landing.z),
          ),
        )
      : null;
    const away = landing ? Math.hypot(landing.x - EXIT_PORTAL_SPOT.x, landing.z - EXIT_PORTAL_SPOT.z) : -1;
    console.log(
      `      降りる場所: ${landing ? `(${landing.x}, ${landing.y}, ${landing.z})` : "無い"} / ` +
        `出口まで ${away.toFixed(1)}m / 足元は ${under ? under.kind : "ポータルでない"}`,
    );
    check("降りる場所がある", !!landing);
    check("降りた足元は面ではない", under === null);
    check("出口は歩いて行ける距離にある", away > 1 && away < LANDING_RADIUS * 2, `${away.toFixed(1)}m`);

    // **セーブして開き直しても残ること。** これが「印をワールドに持たせた」理由そのもの
    // （`Mobs` 側の記憶は `clear()` で消えるので、次の読み込みでは湧き直す）。
    const round = deserializeEdits(JSON.parse(JSON.stringify(serializeEdits(world.editsForSave()))));
    const reopened = new World(new Scene(), new EndGen(seed), round);
    reopened.primeAround(EXIT_PORTAL_SPOT.x, EXIT_PORTAL_SPOT.z, 1);
    console.log(`      開き直したあと: ${exitPortalState(reopened)}`);
    check("読み込み直しても印は残る", exitPortalState(reopened) === "built");
    // 地形そのものは作り直されている（改変だけを持つ形が崩れていない）。
    check("島は作り直されている", reopened.getVoxel(0, ISLAND_SURFACE, 0) === END_STONE);

    world.dispose();
    reopened.dispose();
  }
}
