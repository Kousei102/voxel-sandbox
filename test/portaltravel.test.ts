import { LAVA, NETHERRACK, OBSIDIAN, STONE, WATER } from "../src/blocks";
import { NETHER, OVERWORLD } from "../src/dimensions";
import { portalBlock } from "../src/portals";
import {
  PORTAL_DELAY,
  PORTAL_SCALE,
  PortalGate,
  SEARCH_RADIUS,
  arrive,
  buildPortal,
  linkScale,
  linkedSpot,
  portalTarget,
  standable,
} from "../src/portaltravel";
import { Slab, sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 平らな石の大地（上面 y=40）。 */
function ground(id = STONE, top = 40): Slab {
  const slab = new Slab();
  slab.fill(-64, 64, 1, top, -64, 64, id);
  return slab;
}

export function run(): void {
  describe("ポータルを通る（次元の対応と出る場所）");

  const source = sourceOf("src/portaltravel.ts");
  const forbidden = ["Mesh", "document.", "AudioContext", "Math.random("].filter((w) =>
    source.includes(w),
  );
  check("portaltravel.ts は描画にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

  // --- 次元の対応 ---------------------------------------------------------

  check("オーバーワールドのポータルはネザーへ", portalTarget(OVERWORLD) === NETHER);
  check("ネザーのポータルはオーバーワールドへ", portalTarget(NETHER) === OVERWORLD);
  console.log(
    `      1:${PORTAL_SCALE}  ネザーへ ${linkScale(OVERWORLD, NETHER)} / 戻り ${linkScale(NETHER, OVERWORLD)}`,
  );
  check("ネザーへ入ると 1/8", linkScale(OVERWORLD, NETHER) === 1 / PORTAL_SCALE);
  check("戻ると 8 倍", linkScale(NETHER, OVERWORLD) === PORTAL_SCALE);

  {
    const into = linkedSpot(100, -37, linkScale(OVERWORLD, NETHER));
    const back = linkedSpot(into.x, into.z, linkScale(NETHER, OVERWORLD));
    console.log(`      (100, -37) → ネザー (${into.x}, ${into.z}) → 戻ると (${back.x}, ${back.z})`);
    check("ネザーでは 1/8 の座標になる", into.x === 12 && into.z === -5);
    // **負の側で切り上げないこと。** `Math.trunc` にすると -37/8 が -4 になり、
    // 戻ったときに 5 マスずれる（往復のたびにずれが積もる）。
    check("戻すと元の近くに戻る", Math.abs(back.x - 100) <= PORTAL_SCALE && Math.abs(back.z - -37) <= PORTAL_SCALE);
  }

  // --- 立てるかどうか -----------------------------------------------------

  {
    const slab = ground();
    check("地面の上には立てる", standable(slab, 0, 41, 0));
    check("地面の中には立てない", !standable(slab, 0, 40, 0));
    slab.fill(0, 0, 42, 42, 0, 0, STONE);
    check("頭がつかえる所には立てない", !standable(slab, 0, 41, 0));

    const air = new Slab();
    check("足場が無ければ立てない", !standable(air, 0, 41, 0));

    const lava = ground();
    lava.fill(0, 0, 41, 41, 0, 0, LAVA);
    check("溶岩の中には立てない", !standable(lava, 0, 41, 0));
  }

  // --- 向こう側に枠が無いとき（建てる） -----------------------------------

  {
    const slab = ground(NETHERRACK, 30);
    const spot = arrive(slab, 0, 0, 60, "x");
    console.log(
      `      枠が無い所へ: (${spot.x}, ${spot.y}, ${spot.z})  建てた ${spot.built}  置いたマス ${slab.filled}`,
    );
    check("枠が無ければ建てる", spot.built);
    // **地面の上に出すこと。** 60 の見当をそのまま使うと空中に置き去りになる。
    check("地面の上に出る", spot.y === 31, `y ${spot.y}`);
    check("出た所に立てる", standable(slab, Math.floor(spot.x), spot.y, Math.floor(spot.z)));
    check(
      "出た所がポータルの面の中",
      slab.getVoxel(Math.floor(spot.x), spot.y, Math.floor(spot.z)) === portalBlock("x"),
    );
    // 建てた枠が本物であること（`portals.ts` が読める形か）。
    check("足元は黒曜石", slab.getVoxel(0, 30, 0) === OBSIDIAN);
    check("枠の左右が黒曜石", slab.getVoxel(-1, 31, 0) === OBSIDIAN && slab.getVoxel(2, 31, 0) === OBSIDIAN);
    check("枠の上が黒曜石", slab.getVoxel(0, 34, 0) === OBSIDIAN);
    check("面が 2x3 で 6 マス", (() => {
      let lit = 0;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) {
        if (slab.getVoxel(a, 31 + b, 0) === portalBlock("x")) lit++;
      }
      return lit === 6;
    })());
  }

  {
    // 岩の中。**掘り出してから建てること** —— 埋まったまま出すと動けない。
    const solid = new Slab();
    solid.fill(-64, 64, 1, 90, -64, 64, NETHERRACK);
    const spot = arrive(solid, 0, 0, 50, "z");
    console.log(`      岩の中へ: (${spot.x}, ${spot.y}, ${spot.z})  建てた ${spot.built}`);
    check("岩の中でも建つ", spot.built);
    check("岩の中でも立てる", standable(solid, Math.floor(spot.x), spot.y, Math.floor(spot.z)));
    check("向きが渡したとおり", solid.getVoxel(0, spot.y, 0) === portalBlock("z"));
  }

  {
    // 溶岩の海の上。**海の底に出さないこと**（出た瞬間に焼け死ぬ）。
    const sea = new Slab();
    sea.fill(-64, 64, 1, 20, -64, 64, NETHERRACK);
    sea.fill(-64, 64, 21, 31, -64, 64, LAVA);
    const spot = arrive(sea, 0, 0, 40, "x");
    console.log(`      溶岩の海の上へ: y ${spot.y}（海面 31）  建てた ${spot.built}`);
    check("溶岩の海より上に出る", spot.y > 31, `y ${spot.y}`);
    check("足場を作って立たせる", standable(sea, 0, spot.y, 0));
  }

  {
    // 水の中も同じ（沈んだ所に出すと息が続かない）。
    const sea = ground(STONE, 20);
    sea.fill(-64, 64, 21, 40, -64, 64, WATER);
    const spot = arrive(sea, 0, 0, 30, "x");
    console.log(`      水の中へ: y ${spot.y}（水面 40）`);
    check("水没した所には出さない", spot.y > 40, `y ${spot.y}`);
  }

  // --- 向こう側に枠があるとき（探して出る） -------------------------------

  {
    const slab = ground(NETHERRACK, 30);
    // 少し離れた所に枠を建てておく。
    buildPortal(slab, 6, 31, 4, "x");
    const before = slab.filled;
    const spot = arrive(slab, 0, 0, 31, "x");
    console.log(
      `      近くの枠へ: (${spot.x}, ${spot.y}, ${spot.z})  建てた ${spot.built}  ` +
        `置いたマス ${before} → ${slab.filled}`,
    );
    check("既にある枠に出る", !spot.built);
    check("枠を建て増さない", slab.filled === before);
    check("出るのは枠の中", slab.getVoxel(Math.floor(spot.x), spot.y, Math.floor(spot.z)) === portalBlock("x"));
    // **面の一番下に出すこと。** 上の段に出すと、出た瞬間に落ちる。
    check("面の一番下に出る", spot.y === 31, `y ${spot.y}`);
  }

  {
    // 遠すぎる枠は使わない（世界の反対側の枠に吸い込まれない）。
    const slab = ground(NETHERRACK, 30);
    buildPortal(slab, SEARCH_RADIUS + 8, 31, 0, "x");
    const spot = arrive(slab, 0, 0, 31, "x");
    console.log(`      ${SEARCH_RADIUS + 8} マス先の枠: 建てた ${spot.built}`);
    check("探す範囲の外の枠は使わない", spot.built);
  }

  // --- 往復（ここが本題） -------------------------------------------------

  {
    // オーバーワールドの枠 → ネザー → 戻る、を座標だけで追う。
    const over = ground(STONE, 40);
    const nether = ground(NETHERRACK, 30);
    buildPortal(over, 100, 41, -37, "x");

    // 1 回目: ネザーへ。枠が無いので建つ。
    const toNether = linkedSpot(100.5, -37.5, linkScale(OVERWORLD, NETHER));
    const first = arrive(nether, toNether.x, toNether.z, 41, "x");
    check("行きは枠を建てる", first.built);

    // 戻る。**元の枠に戻ること**（新しい枠を建てない）。
    const back = linkedSpot(first.x, first.z, linkScale(NETHER, OVERWORLD));
    const home = arrive(over, back.x, back.z, first.y, "x");
    console.log(
      `      往復: 家 (100, -37) → ネザー (${first.x}, ${first.z}) → 戻り (${home.x}, ${home.z})  ` +
        `建て直し ${home.built}`,
    );
    check("戻ると元の枠に出る（建て直さない）", !home.built);
    check("戻り先が元の枠のマス", Math.abs(home.x - 100.5) < 2 && Math.abs(home.z - -37.5) < 2);

    // もう 1 往復。**2 回目も同じ枠**（毎回増えるなら、ここで建つ）。
    const again = arrive(nether, toNether.x, toNether.z, 41, "x");
    check("2 回目のネザー行きも同じ枠", !again.built);
    check("同じ場所に出る", again.x === first.x && again.z === first.z && again.y === first.y);
  }

  describe("ポータルに立っている時間（掛け金）");

  {
    const gate = new PortalGate();
    // 面の外では何も起きない。
    let fired = 0;
    for (let i = 0; i < 120; i++) if (gate.step(1 / 60, null)) fired++;
    check("ポータルの外では移らない", fired === 0);

    // 面の中に立ち続けると、待ち時間ぶんで 1 回だけ起きる。
    let steps = 0;
    while (!gate.step(1 / 60, "x") && steps < 600) steps++;
    console.log(`      待ち時間 ${PORTAL_DELAY}s ＝ ${steps + 1} フレーム（60fps）`);
    check("待つと移る", steps < 600);
    check("待ち時間ぶん待たされる", Math.abs((steps + 1) / 60 - PORTAL_DELAY) < 0.05);

    // **出た先は枠の中。** 掛け金を掛けたら、外へ出るまで二度と起きない。
    gate.latch();
    let again = 0;
    for (let i = 0; i < 600; i++) if (gate.step(1 / 60, "x")) again++;
    check("掛け金が掛かっていると、立ったままでは移らない", again === 0, `${again} 回`);

    // いったん外へ出ると外れる。
    gate.step(1 / 60, null);
    let back = 0;
    for (let i = 0; i < 600; i++) if (gate.step(1 / 60, "x")) back++;
    console.log(`      出てから入り直すと ${back} 回（600 フレーム）`);
    check("外へ出れば掛け金が外れる", back > 0);
  }

  {
    // **踏んだだけでは移らない。** 0 秒にすると、間違って触った瞬間に次元が変わる。
    const gate = new PortalGate();
    let fired = 0;
    for (let i = 0; i < 20; i++) {
      if (gate.step(1 / 60, "x")) fired++;
      gate.step(1 / 60, null); // 1 フレームごとに出入りする（走り抜ける）
    }
    console.log(`      走り抜けた 20 回: ${fired} 回移った  途中の進み ${gate.progress.toFixed(2)}`);
    check("通り抜けるだけでは移らない", fired === 0);
    check("待ち時間は 0 ではない", PORTAL_DELAY > 0);
  }

  {
    // 未読み込みの列では書き込みが黙って失敗する。**そこで落ちないこと。**
    const frozen = ground(NETHERRACK, 30);
    frozen.frozenColumns.add("0,0");
    const spot = arrive(frozen, 0, 0, 31, "x");
    console.log(`      書き込めない列: 建てた ${spot.built}  y ${spot.y}`);
    check("書き込めなくても落ちない", spot.built);
  }
}
