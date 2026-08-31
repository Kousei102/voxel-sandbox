import { Scene } from "three";
import {
  AIR,
  BED,
  BED_HEIGHT,
  COBBLE,
  FACE_XN,
  FACE_XP,
  FACE_YN,
  FACE_ZN,
  FACE_ZP,
  STONE,
  TALL_GRASS,
  WATER,
  bedPartner,
  blockName,
  isBed,
  isBedHead,
  placedVariant,
} from "../src/blocks";
import { Beds, clearBedPartner, placeBed, sleepDecision } from "../src/beds";
import { DIMENSIONS, NETHER, OVERWORLD } from "../src/dimensions";
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 置く材料。`placeSpot()` が返すものと同じ形（ベッドは `facing` だけを見る）。 */
function spotAt(x: number, y: number, z: number, facing: number) {
  return { x, y, z, support: FACE_YN, hitY: 0, facing };
}

/**
 * 平らな床を作った試験場。**本物の `World` を使う** —— ベッドは
 * `canPlaceAt`（支え）と `breakUnsupported`（床が消えたら壊れる）に乗っているので、
 * `Arena` のような読み取り専用の試験場では肝心の経路が通らない。
 *
 * 床の高さと、床の上の空きを返す。
 */
function flatWorld(): { world: World; floor: number } {
  const world = new World(new Scene(), new WorldGen(909091));
  world.primeAround(0.5, 0.5, 1);
  const surface = world.surfaceY(0, 0);
  // 石で 6x6 の平らな床を敷き、その上を 4 マスぶん空ける（頭上の判定に効く）
  for (let x = -1; x <= 4; x++) {
    for (let z = -1; z <= 4; z++) {
      world.setVoxel(x, surface, z, STONE);
      for (let y = 1; y <= 4; y++) world.setVoxel(x, surface + y, z, AIR);
    }
  }
  return { world, floor: surface + 1 };
}

export function run(): void {
  describe("ベッド（形と相方）");

  check("ベッドの大元は 1..63（アイテムとして持てる）", BED === 41, `ID ${BED}`);

  const facings = [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN];
  const faceNames = ["+X", "-X", "+Z", "-Z"];

  // 向き 4 通りの足側と枕側。**足側は必ず「置いた人が向いている先に枕」**。
  const feet = facings.map((f) => placedVariant(BED, spotAt(0, 0, 0, f)));
  console.log(
    `      足側 ${feet.join(" ")} / 枕側 ${feet
      .map((id) => bedPartner(id)?.id ?? 0)
      .join(" ")}`,
  );

  check("向き 4 通りの足側が全部違う ID", new Set(feet).size === 4, feet.join(" "));
  check("向き +X の足側が大元", feet[0] === BED);
  check("足側は全部ベッド", feet.every(isBed));
  check("足側はどれも枕側ではない", feet.every((id) => !isBedHead(id)));
  check(
    "枕側は全部ベッドで、枕側と判定される",
    feet.every((id) => {
      const p = bedPartner(id);
      return p !== null && isBed(p.id) && isBedHead(p.id);
    }),
  );

  // **不変条件: 相方の相方は自分。** ここが崩れると、どちらから辿るかで結果が変わる。
  check(
    "相方の相方は自分（足 → 枕 → 足）",
    feet.every((id) => {
      const head = bedPartner(id);
      if (!head) return false;
      const back = bedPartner(head.id);
      return back !== null && back.id === id && back.dx === -head.dx && back.dz === -head.dz;
    }),
  );

  // 枕は「置いた人が向いている先」にある。向きの表がずれるとここで落ちる。
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  check(
    "枕は向いている先の 1 マス",
    feet.every((id, i) => {
      const p = bedPartner(id);
      return p !== null && p.dx === steps[i][0] && p.dz === steps[i][1];
    }),
    faceNames.join(" "),
  );

  check("ベッドでないブロックは相方を持たない", bedPartner(STONE) === null && bedPartner(AIR) === null);
  check("ベッドの名前は足側も枕側も同じ", blockName(BED) === blockName(bedPartner(BED)?.id ?? 0), blockName(BED));
  check(
    "ベッドの高さは歩いて乗れる（PLAYER_SIZE.step 0.6 未満）",
    BED_HEIGHT < 0.6,
    `${BED_HEIGHT}`,
  );

  describe("ベッド（置く）");

  {
    const { world, floor } = flatWorld();
    // **先に「置ける床である」ことを確かめる。** これを出さずに「置けない」判定だけを
    // 並べると、床が無いだけで通ってしまう（偽陽性）。
    check("試験場の床には普通のブロックが置ける", world.setVoxel(1, floor, 1, COBBLE));
    world.setVoxel(1, floor, 1, AIR);

    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    const partner = bedPartner(id);
    check("ベッドを置ける", placeBed(world, spotAt(1, floor, 1, FACE_XP), id));
    check("足側が書かれる", world.getVoxel(1, floor, 1) === id, blockName(world.getVoxel(1, floor, 1)));
    check(
      "枕側が向いている先に書かれる",
      partner !== null && world.getVoxel(1 + partner.dx, floor, 1 + partner.dz) === partner.id,
    );
  }

  // 向き 4 通りとも 2 マスが揃う（表の並びが 1 か所でもずれると落ちる）
  {
    const { world, floor } = flatWorld();
    let ok = 0;
    facings.forEach((facing, i) => {
      const x = 1;
      const z = 1;
      const id = placedVariant(BED, spotAt(x, floor + i, z, facing));
      const partner = bedPartner(id);
      // 段ごとに置いて、隣の向きと干渉させない
      for (let dx = -1; dx <= 2; dx++) {
        for (let dz = -1; dz <= 2; dz++) world.setVoxel(x + dx, floor + i - 1, z + dz, STONE);
      }
      if (!placeBed(world, spotAt(x, floor + i, z, facing), id)) return;
      if (world.getVoxel(x, floor + i, z) !== id) return;
      if (!partner || world.getVoxel(x + partner.dx, floor + i, z + partner.dz) !== partner.id) return;
      ok++;
    });
    check("向き 4 通りとも 2 マスが揃う", ok === 4, `${ok}/4`);
  }

  {
    const { world, floor } = flatWorld();
    // 枕側になるマスを塞ぐ
    world.setVoxel(2, floor, 1, COBBLE);
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    check("相方のマスが塞がっていたら置けない", placeBed(world, spotAt(1, floor, 1, FACE_XP), id) === false);
    check("そのとき足側にも何も書かれない", world.getVoxel(1, floor, 1) === AIR, blockName(world.getVoxel(1, floor, 1)));
  }

  {
    const { world, floor } = flatWorld();
    // 枕側の床を抜く
    world.setVoxel(2, floor - 1, 1, AIR);
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    check("相方の床が無かったら置けない", placeBed(world, spotAt(1, floor, 1, FACE_XP), id) === false);
    check("そのとき足側にも何も書かれない", world.getVoxel(1, floor, 1) === AIR);
  }

  {
    const { world, floor } = flatWorld();
    world.setVoxel(2, floor, 1, WATER);
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    check("相方のマスが水なら置けない", placeBed(world, spotAt(1, floor, 1, FACE_XP), id) === false);
    check("そのとき足側にも何も書かれない", world.getVoxel(1, floor, 1) === AIR);
  }

  {
    const { world, floor } = flatWorld();
    // 草むらは押しのけて置ける（`isReplaceable`）
    world.setVoxel(1, floor, 1, TALL_GRASS);
    world.setVoxel(2, floor, 1, TALL_GRASS);
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    check("草むらは押しのけて置ける", placeBed(world, spotAt(1, floor, 1, FACE_XP), id));
  }

  describe("ベッド（壊す）");

  // 足側を壊す → 枕側も消える
  {
    const { world, floor } = flatWorld();
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    const partner = bedPartner(id)!;
    placeBed(world, spotAt(1, floor, 1, FACE_XP), id);
    world.setVoxel(1, floor, 1, AIR);
    check("足側を壊すと相方も消える", clearBedPartner(world, 1, floor, 1, id) === 1);
    check("2 マスとも空気", world.getVoxel(1, floor, 1) === AIR && world.getVoxel(1 + partner.dx, floor, 1 + partner.dz) === AIR);
  }

  // 枕側を壊す → 足側も消える
  {
    const { world, floor } = flatWorld();
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    const partner = bedPartner(id)!;
    placeBed(world, spotAt(1, floor, 1, FACE_XP), id);
    const hx = 1 + partner.dx;
    const hz = 1 + partner.dz;
    world.setVoxel(hx, floor, hz, AIR);
    check("枕側を壊すと相方も消える", clearBedPartner(world, hx, floor, hz, partner.id) === 1);
    check("2 マスとも空気", world.getVoxel(1, floor, 1) === AIR && world.getVoxel(hx, floor, hz) === AIR);
  }

  // 揃っていないときは触らない（関係ないブロックを消さない）
  {
    const { world, floor } = flatWorld();
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    const partner = bedPartner(id)!;
    world.setVoxel(1, floor, 1, id);
    world.setVoxel(1 + partner.dx, floor, 1 + partner.dz, COBBLE);
    check("相方が期待した ID でなければ何もしない", clearBedPartner(world, 1, floor, 1, id) === 0);
    check("関係ないブロックは残る", world.getVoxel(1 + partner.dx, floor, 1 + partner.dz) === COBBLE);
  }

  // 支えを失う経路。**`onAutoBreak` に相方の始末を繋いでいることまで見る**
  // （`main.ts` の繋ぎと同じ形をここで組む）。
  {
    const { world, floor } = flatWorld();
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    const partner = bedPartner(id)!;
    placeBed(world, spotAt(1, floor, 1, FACE_XP), id);
    const hx = 1 + partner.dx;
    const hz = 1 + partner.dz;

    let dropped = 0;
    world.onAutoBreak = (x, y, z, broken) => {
      clearBedPartner(world, x, y, z, broken);
      dropped++;
    };
    // 枕側の下の床を掘る
    world.setVoxel(hx, floor - 1, hz, AIR);
    check("枕側の床を掘ると枕側が消える", world.getVoxel(hx, floor, hz) === AIR, blockName(world.getVoxel(hx, floor, hz)));
    check("足側も一緒に消える", world.getVoxel(1, floor, 1) === AIR, blockName(world.getVoxel(1, floor, 1)));
    check("落とす合図は 1 回だけ（ベッドは 1 個）", dropped === 1, `${dropped} 回`);
  }

  describe("リスポーン地点");

  {
    const { world, floor } = flatWorld();
    const id = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    placeBed(world, spotAt(1, floor, 1, FACE_XP), id);

    const beds = new Beds(OVERWORLD);
    check("記録が無ければ位置も出ない", beds.spawnPosition(world) === null);

    let changes = 0;
    beds.onChange = () => changes++;
    beds.set(1, floor, 1, OVERWORLD);
    check("記録すると合図が飛ぶ", changes === 1, `${changes} 回`);
    beds.set(1, floor, 1, OVERWORLD);
    check("同じ場所を記録し直しても合図は飛ばない", changes === 1, `${changes} 回`);
    beds.set(1, floor, 1, NETHER);
    check("同じマスでも次元が違えば記録し直す", changes === 2, `${changes} 回`);
    beds.set(1, floor, 1, OVERWORLD);

    const at = beds.spawnPosition(world);
    check("ベッドの上に立つ位置が出る", at !== null && at.y === floor + BED_HEIGHT + 0.05, at ? `y=${at.y}` : "null");
    check("マスの中央に立つ", at !== null && at.x === 1.5 && at.z === 1.5, at ? `${at.x},${at.z}` : "null");

    // 頭上が埋まっていたら使わない（壁の中でリスポーンして即死しないため）
    world.setVoxel(1, floor + 1, 1, COBBLE);
    check("頭上が埋まっていたら使わない", beds.spawnPosition(world) === null);
    world.setVoxel(1, floor + 1, 1, AIR);
    check("空けば また使える", beds.spawnPosition(world) !== null);

    // ベッドが壊されていたら使わない
    world.setVoxel(1, floor, 1, AIR);
    check("ベッドが消えていたら使わない", beds.spawnPosition(world) === null);
    check("記録そのものは残る（知らせるため）", beds.spawnPoint !== null);
  }

  {
    // **叩いたマスから足側を割り出すのは `beds.ts`**（`main.ts` に相方を辿らせない）。
    // 枕側で覚えると、相方を辿らずに「ベッドがまだあるか」を見られなくなる。
    const { world, floor } = flatWorld();
    const foot = placedVariant(BED, spotAt(1, floor, 1, FACE_XP));
    placeBed(world, spotAt(1, floor, 1, FACE_XP), foot);
    const head = bedPartner(foot);

    const fromFoot = new Beds(OVERWORLD);
    fromFoot.setFrom(1, floor, 1, foot, OVERWORLD);
    check("足側を叩いたらそのマス", JSON.stringify([fromFoot.spawnPoint?.x, fromFoot.spawnPoint?.z]) === "[1,1]");

    const fromHead = new Beds(OVERWORLD);
    if (head) fromHead.setFrom(1 + head.dx, floor, 1 + head.dz, head.id, OVERWORLD);
    check(
      "枕側を叩いても足側を覚える",
      fromHead.spawnPoint?.x === 1 && fromHead.spawnPoint?.z === 1,
      `${fromHead.spawnPoint?.x},${fromHead.spawnPoint?.z}`,
    );
    // 覚えた先がベッドとして読めること（**足側でなければ `spawnPosition()` が null になる**）。
    check("枕側から覚えても使える地点になる", fromHead.spawnPosition(world) !== null);
    check("次元も一緒に覚える", fromHead.spawnPoint?.dim === OVERWORLD);

    const main = sourceOf("src/main.ts");
    check("main.ts が相方を辿っていない", !main.includes("isBedHead("));
  }

  {
    const beds = new Beds(OVERWORLD);
    beds.set(12, 34, -56, OVERWORLD);
    const flat = beds.serialize();
    const back = new Beds(OVERWORLD);
    back.deserialize(flat, beds.serializeDim());
    check(
      "セーブが往復する",
      back.spawnPoint?.x === 12 && back.spawnPoint?.y === 34 && back.spawnPoint?.z === -56,
      JSON.stringify(flat),
    );

    const empty = new Beds(OVERWORLD);
    check("記録が無ければキーごと省く", empty.serialize() === undefined);

    const broken = new Beds(OVERWORLD);
    broken.deserialize([1, 2] as number[]);
    check("欠けたセーブは黙って捨てる", broken.spawnPoint === null);
    broken.deserialize(undefined);
    check("セーブが無くても落ちない", broken.spawnPoint === null);

    const cleared = new Beds(OVERWORLD);
    cleared.set(1, 2, 3, OVERWORLD);
    cleared.clear();
    check("clear() で記録が消える", cleared.spawnPoint === null);
  }

  describe("リスポーン地点の次元");

  // `bedDim` は**オーバーワールドなら省く**（`SaveData.dim` と同じ作法）。
  // ここが崩れると、オーバーワールドだけで遊んでいる人のセーブの形が変わる。
  {
    const here = new Beds(OVERWORLD);
    here.set(1, 2, 3, OVERWORLD);
    check("既定の次元ならキーごと省く", here.serializeDim() === undefined, String(here.serializeDim()));

    const there = new Beds(OVERWORLD);
    there.set(1, 2, 3, NETHER);
    check("別の次元なら名前を書く", there.serializeDim() === NETHER, String(there.serializeDim()));

    const old = new Beds(OVERWORLD);
    old.deserialize([9, 40, -3]);
    check(
      "bedDim の無い古いセーブはオーバーワールド",
      old.spawnPoint?.dim === OVERWORLD,
      String(old.spawnPoint?.dim),
    );
    check("戻る次元もオーバーワールド", old.respawnDimension() === OVERWORLD);

    const restored = new Beds(OVERWORLD);
    restored.deserialize([9, 40, -3], NETHER);
    check("bedDim があればその次元", restored.spawnPoint?.dim === NETHER, String(restored.spawnPoint?.dim));
    check("戻る次元もネザー", restored.respawnDimension() === NETHER);

    const junk = new Beds(OVERWORLD);
    junk.deserialize([9, 40, -3], "");
    check("空の次元名は既定に落とす", junk.spawnPoint?.dim === OVERWORLD, String(junk.spawnPoint?.dim));

    const none = new Beds(OVERWORLD);
    check("記録が無ければ戻る先は既定", none.respawnDimension() === OVERWORLD);
    check("既定の次元は名前で引ける", none.homeDimension === OVERWORLD);
  }

  // **綴りのずれの見張り。** `beds.ts` は `dimensions.ts` を import しない
  // （生成器を引き連れてくる）ので、文字列で受けている。`daynight.ts` と同じ形。
  {
    const known = new Set(DIMENSIONS.map((d) => d.id));
    check("次元の綴りが表と一致する", known.has(OVERWORLD) && known.has(NETHER), [...known].join(" / "));
  }

  // **ユーザーがブラウザで見つけた不具合（2-4c）の 4 通り。**
  // 「地点の記録」×「死んだ場所」で、戻る次元と行き先が決まる。
  // **`main.ts` と同じ順に並べてある**: 次元を決める → その次元へ戻る →
  // その次元のワールドでベッドのマスを読む（逆にすると、未読み込みの列で
  // 生きているベッドを「壊されている」と誤読する）。
  {
    const over = flatWorld();
    const nether = flatWorld();
    // **2 つの次元で別のマスに置くこと。** 同じマスに置くと、間違った次元を読んでも
    // ベッドが見つかってしまい、「行き先の次元を間違えた」を見逃す（実際に見逃した）。
    placeBed(over.world, spotAt(1, over.floor, 1, FACE_XP), placedVariant(BED, spotAt(1, over.floor, 1, FACE_XP)));
    placeBed(nether.world, spotAt(3, nether.floor, 3, FACE_XP), placedVariant(BED, spotAt(3, nether.floor, 3, FACE_XP)));

    const worlds: Record<string, World> = { [OVERWORLD]: over.world, [NETHER]: nether.world };

    /**
     * `main.ts` の `moveToSpawn()` とまったく同じ並び（`main.ts` がこれを呼んでいることの
     * 見張りは `test/ui.test.ts` の routed）。**戻る次元を先に決めて、そのワールドを読む。**
     */
    function respawn(beds: Beds, diedIn: string): { dim: string; onBed: boolean } {
      // (1) 戻る次元を決めて、そこへ移る（`returnToDimension()`）
      let dim = beds.respawnDimension();
      // (2) 移った先のワールドでベッドのマスを読む
      const plan = beds.respawnPlan(worlds[dim] ?? worlds[diedIn]);
      // (3) ベッドが壊されていたら、さらに既定の次元へ落とす
      if (!plan.at) dim = plan.dim;
      return { dim, onBed: plan.at !== null };
    }

    const noBed = new Beds(OVERWORLD);
    const r1 = respawn(noBed, NETHER);
    check("(1) 記録無し × ネザーで死ぬ → オーバーワールドの初期位置", r1.dim === OVERWORLD && !r1.onBed, JSON.stringify(r1));

    const overPoint = new Beds(OVERWORLD);
    overPoint.set(1, over.floor, 1, OVERWORLD);
    const r2 = respawn(overPoint, NETHER);
    check("(2) オーバーワールドのベッド × ネザーで死ぬ → そのベッド", r2.dim === OVERWORLD && r2.onBed, JSON.stringify(r2));

    const netherPoint = new Beds(OVERWORLD);
    netherPoint.set(3, nether.floor, 3, NETHER);
    const r3 = respawn(netherPoint, NETHER);
    // **これが退行の見張り。** 次元を持たせる前から正しく動いていた唯一の組み合わせ。
    check("(3) ネザーのベッド × ネザーで死ぬ → そのベッド（前から正しい。壊さないこと）", r3.dim === NETHER && r3.onBed, JSON.stringify(r3));

    const r4 = respawn(netherPoint, OVERWORLD);
    check("(4) ネザーのベッド × オーバーワールドで死ぬ → ネザーのベッド", r4.dim === NETHER && r4.onBed, JSON.stringify(r4));

    // ベッドが壊されていたら**既定の次元**へ（いま居る次元に落とすと、ネザーで
    // ベッドを壊してから死んだときに天井の岩盤の上に戻る）。
    nether.world.setVoxel(3, nether.floor, 3, AIR);
    const r5 = respawn(netherPoint, NETHER);
    check("(5) ネザーのベッドが壊されていた → オーバーワールドの初期位置", r5.dim === OVERWORLD && !r5.onBed, JSON.stringify(r5));
    check("(5) 記録そのものは残る", netherPoint.spawnPoint?.dim === NETHER);
  }

  describe("寝る（振り分け）");

  check("昼はリスポーン地点だけ", sleepDecision(false, false) === "spawn-set");
  check("昼はモンスターが居ても同じ", sleepDecision(false, true) === "spawn-set");
  check("夜でモンスターが居なければ寝る", sleepDecision(true, false) === "slept");
  check("夜でもモンスターが居たら寝ない", sleepDecision(true, true) === "monsters");
}
