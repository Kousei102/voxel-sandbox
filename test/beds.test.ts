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
import { World } from "../src/world";
import { WorldGen } from "../src/worldgen";
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

    const beds = new Beds();
    check("記録が無ければ位置も出ない", beds.spawnPosition(world) === null);

    let changes = 0;
    beds.onChange = () => changes++;
    beds.set(1, floor, 1);
    check("記録すると合図が飛ぶ", changes === 1, `${changes} 回`);
    beds.set(1, floor, 1);
    check("同じ場所を記録し直しても合図は飛ばない", changes === 1, `${changes} 回`);

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
    const beds = new Beds();
    beds.set(12, 34, -56);
    const flat = beds.serialize();
    const back = new Beds();
    back.deserialize(flat);
    check(
      "セーブが往復する",
      back.spawnPoint?.x === 12 && back.spawnPoint?.y === 34 && back.spawnPoint?.z === -56,
      JSON.stringify(flat),
    );

    const empty = new Beds();
    check("記録が無ければキーごと省く", empty.serialize() === undefined);

    const broken = new Beds();
    broken.deserialize([1, 2] as number[]);
    check("欠けたセーブは黙って捨てる", broken.spawnPoint === null);
    broken.deserialize(undefined);
    check("セーブが無くても落ちない", broken.spawnPoint === null);

    const cleared = new Beds();
    cleared.set(1, 2, 3);
    cleared.clear();
    check("clear() で記録が消える", cleared.spawnPoint === null);
  }

  describe("寝る（振り分け）");

  check("昼はリスポーン地点だけ", sleepDecision(false, false) === "spawn-set");
  check("昼はモンスターが居ても同じ", sleepDecision(false, true) === "spawn-set");
  check("夜でモンスターが居なければ寝る", sleepDecision(true, false) === "slept");
  check("夜でもモンスターが居たら寝ない", sleepDecision(true, true) === "monsters");
}
