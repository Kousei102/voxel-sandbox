import {
  CACTUS,
  COBBLE,
  GRASS,
  LEAVES,
  OBSIDIAN,
  SAPLING,
  SPRUCE_LEAVES,
  SPRUCE_SAPLING,
  STONE,
  SUGAR_CANE,
  TALL_GRASS,
} from "../src/blocks";
import {
  BONE,
  CHARCOAL,
  COAL,
  FLINT,
  LEATHER,
  LEATHER_BOOTS,
  LEATHER_CHESTPLATE,
  LEATHER_HELMET,
  LEATHER_LEGGINGS,
  MAX_ITEM_ID,
  allArmorIds,
  allItemIds,
  armorOf,
  foodOf,
  itemColor,
  itemName,
  itemStackLimit,
  placedBlock,
  toolOf,
} from "../src/items";
import { check, describe } from "./harness";

export function run(): void {
  describe("防具の表（items.ts の ARMORS）");

  // **着られるのは革の 4 部位だけ**（鉄・金・ダイヤは番号を取っていない）。
  // ここが増える周は、`inventory.ts` の `armorPoints` と
  // `test/vitals.test.ts` の点数の表も一緒に動く周。
  const armors = allArmorIds();
  console.log(
    `      着られるアイテム: ${armors.length} 種 [` +
      `${armors.map((id) => `${id} ${itemName(id)} ${armorOf(id)?.slot} ${armorOf(id)?.defense} 点`).join(" / ")}]`,
  );
  check("着られるのは 4 種", armors.length === 4, `${armors.length} 種`);

  // **部位が 4 つとも別**であること。同じ部位が 2 つあると、`armorPoints` が
  // 「枠の並びと合っているか」で弾くので、片方が永久に 0 点になる。
  const slots = armors.map((id) => armorOf(id)?.slot);
  console.log(`      部位: ${slots.join(" / ")}`);
  check(
    "頭・胴・脚・足が 1 つずつ（重複なし）",
    new Set(slots).size === 4 &&
      armorOf(LEATHER_HELMET)?.slot === "head" &&
      armorOf(LEATHER_CHESTPLATE)?.slot === "chest" &&
      armorOf(LEATHER_LEGGINGS)?.slot === "legs" &&
      armorOf(LEATHER_BOOTS)?.slot === "feet",
    slots.join(" / "),
  );

  // **点数は本家のまま 1 / 3 / 2 / 1 = 合計 7。** 合計だけを見ていると、
  // 内訳を入れ替えても（帽子 3 / 上着 1 でも）緑になるので両方を出す。
  const points = [LEATHER_HELMET, LEATHER_CHESTPLATE, LEATHER_LEGGINGS, LEATHER_BOOTS].map(
    (id) => armorOf(id)?.defense ?? 0,
  );
  const total = points.reduce((sum, p) => sum + p, 0);
  console.log(`      点数: 帽子 ${points[0]} / 上着 ${points[1]} / ズボン ${points[2]} / 靴 ${points[3]} = 合計 ${total}`);
  check(
    "点数は 1 / 3 / 2 / 1 で合計 7",
    points[0] === 1 && points[1] === 3 && points[2] === 2 && points[3] === 1 && total === 7,
    `${points.join(" / ")} = ${total}`,
  );

  // **材料の革（132）は着られないこと。** 表に入れると「革を頭の枠に置くと固くなる」。
  check("革（材料）は着られない", armorOf(LEATHER) === null, String(armorOf(LEATHER)));

  // **全アイテムを引いて確かめること** —— `armorOf()` が undefined ではなく null を
  // 返す（`foodOf()` と同じ形）ことの足場でもある。
  const ids = allItemIds();
  const wearable = ids.filter((id) => armorOf(id) !== null);
  console.log(`      一覧の ${ids.length} 種のうち、armorOf() が非 null なのは ${wearable.length} 種`);
  check(
    "着られるのは表に載せた 4 種だけ",
    wearable.length === 4 && wearable.every((id) => armors.includes(id)),
    wearable.map((id) => itemName(id)).join(", "),
  );
  check("表に無い番号（0 と 999）も null", armorOf(0) === null && armorOf(999) === null);

  // **置けず・掘る道具でもなく・積めない。** `tool:` を付けると `TOOL_ATTACK` に
  // 無い種類が入って `attackDamage()` が NaN を返し、`wearForBreaking()` は掘る道具
  // として 1 を返す（`rules/items-survival.md` の「シアーズに `tool:` を持たせないこと」）。
  for (const id of armors) {
    console.log(
      `      ${itemName(id)}(${id}) 置ける ${placedBlock(id) !== 0} / 道具 ${toolOf(id) !== null}` +
        ` / 1 枠 ${itemStackLimit(id)} 個`,
    );
    check(
      `${itemName(id)}は置けず・掘る道具でもなく・1 枠 1 個`,
      placedBlock(id) === 0 && toolOf(id) === null && itemStackLimit(id) === 1,
      `block ${placedBlock(id)} / tool ${toolOf(id)} / stack ${itemStackLimit(id)}`,
    );
  }

  // --- 一覧に並ぶ色（互いとも、既存のどれとも見分けが付くこと）---------------
  // **木の茶色は一覧でいちばん混んでいる帯**（革・パン・茶キノコ・はしご・本棚・
  // 焼き鳥がここに居る）。素直な明るさの階段は真ん中が全部 20 を割るので、
  // **通る 4 段を探して選んだ値**（`TUNING.md`）。**上ほど明るい。**
  const dist = (a: number, b: number): number =>
    Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
  let worstOther = Infinity;
  let worstPair = Infinity;
  const lines: string[] = [];
  for (const id of armors) {
    let best = Infinity;
    let who = "";
    for (const other of ids) {
      if (armors.includes(other)) continue;
      const gap = dist(itemColor(id), itemColor(other));
      if (gap < best) {
        best = gap;
        who = itemName(other);
      }
    }
    worstOther = Math.min(worstOther, best);
    lines.push(`${itemName(id)} 0x${itemColor(id).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
  }
  for (let i = 0; i < armors.length; i++)
    for (let j = i + 1; j < armors.length; j++)
      worstPair = Math.min(worstPair, dist(itemColor(armors[i]), itemColor(armors[j])));
  console.log(`      色のいちばん近い相手: ${lines.join(" / ")}`);
  console.log(
    `      4 つ互いのいちばん近い隔たり: ${worstPair.toFixed(1)}` +
      `（材料の革 0x${itemColor(LEATHER).toString(16)} とは ` +
      `${armors.map((id) => dist(itemColor(id), itemColor(LEATHER)).toFixed(1)).join(" / ")}）`,
  );
  check(
    "4 部位は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    worstOther >= 20,
    `いちばん近くて ${worstOther.toFixed(1)}`,
  );
  check(
    "4 部位は互いにも見分けられる（RGB で 20 以上）",
    worstPair >= 20,
    `いちばん近くて ${worstPair.toFixed(1)}`,
  );
  // **明るさの順が部位の順**（帽子がいちばん明るい）。入れ替わっても上の 2 件は
  // 緑のままなので、並びそのものを 1 件として見張る。
  const lum = (c: number): number =>
    0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  const ladder = [LEATHER_HELMET, LEATHER_CHESTPLATE, LEATHER_LEGGINGS, LEATHER_BOOTS].map((id) =>
    lum(itemColor(id)),
  );
  console.log(`      明るさ: ${ladder.map((v) => v.toFixed(0)).join(" > ")}`);
  check(
    "上ほど明るい（帽子 > 上着 > ズボン > 靴）",
    ladder[0] > ladder[1] && ladder[1] > ladder[2] && ladder[2] > ladder[3],
    ladder.map((v) => v.toFixed(0)).join(" / "),
  );

  describe("骨（スケルトンの落とし物）");

  // **置けず・掘る道具でもなく・食べ物でもない**（革・糸・羽根とまったく同じ扱い）。
  // `tool:` を付けると `mobs.ts` の `TOOL_ATTACK` に無い種類が入って
  // `attackDamage()` が NaN を返す（`rules/items-survival.md`）。
  console.log(
    `      骨(${BONE}) ${itemName(BONE)} 0x${itemColor(BONE).toString(16)}  置ける ` +
      `${placedBlock(BONE) !== 0} / 道具 ${toolOf(BONE) !== null} / 食べ物 ${foodOf(BONE) !== null}` +
      ` / 1 枠 ${itemStackLimit(BONE)} 個`,
  );
  check(
    "骨は置けず・道具でもなく・食べ物でもない",
    placedBlock(BONE) === 0 && toolOf(BONE) === null && foodOf(BONE) === null &&
      itemStackLimit(BONE) === 64,
    `block ${placedBlock(BONE)} / tool ${toolOf(BONE)} / food ${foodOf(BONE)} / stack ${itemStackLimit(BONE)}`,
  );
  // **淡い暖色は一覧でいちばん混んでいる帯**（矢・鉄インゴット・砂・羽根・羊毛）。
  // 素直な 0xd8cfae は砂と 20.9 しか離れず、判定 20 のすぐ上だった —— だから
  // **いちばん近い相手と隔たりを出してから**判定する（`HANDOFF.md` の実測）。
  let boneBest = Infinity;
  let boneWho = "";
  for (const other of ids) {
    if (other === BONE) continue;
    const gap = dist(itemColor(BONE), itemColor(other));
    if (gap < boneBest) {
      boneBest = gap;
      boneWho = itemName(other);
    }
  }
  console.log(`      骨の色のいちばん近い相手: ${boneWho} ${boneBest.toFixed(1)}`);
  check(
    "骨は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    boneBest >= 20,
    `いちばん近いのは${boneWho}で ${boneBest.toFixed(1)}`,
  );

  describe("木炭（原木を焼くと出る燃料）");

  // **置けず・道具でもなく・食べ物でもない**（骨・革・糸・羽根とまったく同じ扱い）。
  // `tool:` を付けると `mobs.ts` の `TOOL_ATTACK` に無い種類が入って
  // `attackDamage()` が NaN を返す（`rules/items-survival.md`）。
  console.log(
    `      木炭(${CHARCOAL}) ${itemName(CHARCOAL)} 0x${itemColor(CHARCOAL).toString(16)}  置ける ` +
      `${placedBlock(CHARCOAL) !== 0} / 道具 ${toolOf(CHARCOAL) !== null} / 食べ物 ${foodOf(CHARCOAL) !== null}` +
      ` / 1 枠 ${itemStackLimit(CHARCOAL)} 個`,
  );
  check(
    "木炭は置けず・道具でもなく・食べ物でもない（1 枠 64 個）",
    placedBlock(CHARCOAL) === 0 && toolOf(CHARCOAL) === null && foodOf(CHARCOAL) === null &&
      itemStackLimit(CHARCOAL) === 64,
    `block ${placedBlock(CHARCOAL)} / tool ${toolOf(CHARCOAL)} / food ${foodOf(CHARCOAL)} / stack ${itemStackLimit(CHARCOAL)}`,
  );
  // **炭の暗い暖色は一覧でいちばん混んでいる帯**（火打石・ソウルサンド・ネザーレンガ・
  // 岩盤・石炭がここに居る）。素直な 0x403a36 は**火打石と 5.8 しか離れません** ——
  // だから**いちばん近い相手と隔たりを出してから**判定する（骨と同じ形）。
  let charcoalBest = Infinity;
  let charcoalWho = "";
  for (const other of ids) {
    if (other === CHARCOAL) continue;
    const gap = dist(itemColor(CHARCOAL), itemColor(other));
    if (gap < charcoalBest) {
      charcoalBest = gap;
      charcoalWho = itemName(other);
    }
  }
  // **暗い帯の相手を名指しで出しておくこと** —— 一番近い 1 人だけだと、色を触ったときに
  // 「どちらへ寄せると詰まるか」が出力から読めない。
  for (const other of [COAL, OBSIDIAN, STONE, COBBLE, FLINT])
    console.log(
      `      木炭 ↔ ${itemName(other)} 0x${itemColor(other).toString(16)}: ` +
        `${dist(itemColor(CHARCOAL), itemColor(other)).toFixed(1)}`,
    );
  console.log(`      木炭の色のいちばん近い相手: ${charcoalWho} ${charcoalBest.toFixed(1)}`);
  check(
    "木炭は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    charcoalBest >= 20,
    `いちばん近いのは${charcoalWho}で ${charcoalBest.toFixed(1)}`,
  );
  // **石炭とは別の番号**（本家と同じ。同じ枠には積めない）。**`CHARCOAL !== COAL` とは
  // 書かないこと** —— ID は数値リテラル型なので `tsc` が TS2367 で落ちます
  // （`rules/testing.md`）。**両方が一覧に並んでいて名前も色も別**、を見るのが正しい形。
  check(
    "木炭と石炭は一覧に 2 つ並ぶ（名前も色も別）",
    ids.includes(CHARCOAL) && ids.includes(COAL) &&
      itemName(CHARCOAL) !== itemName(COAL) &&
      dist(itemColor(CHARCOAL), itemColor(COAL)) >= 20,
    `${itemName(CHARCOAL)} / ${itemName(COAL)}・色の隔たり ${dist(itemColor(CHARCOAL), itemColor(COAL)).toFixed(1)}`,
  );

  describe("苗木 2 種（一覧に出る色）");

  // **ブロックなので `items.ts` には 1 行も無い** —— `variantOf` が `AIR` なので
  // ブロック → アイテムの for が同じ番号のアイテムを作る。**手で足すと二重登録。**
  // だから見るのは「**`MAX_ITEM_ID` を伸ばし忘れていないか**」の 1 点で、
  // 伸ばし忘れると `ITEMS` には入っているのに**クリエイティブの一覧にだけ出ない**
  // （置けるし掘れるので、型でも `typecheck` でも止まらない）。
  const saplings = [SAPLING, SPRUCE_SAPLING];
  console.log(
    `      苗木: ${saplings.map((id) => `${itemName(id)}(${id}) 0x${itemColor(id).toString(16)} 置ける ${placedBlock(id) === id}`).join(" / ")}` +
      `  MAX_ITEM_ID ${MAX_ITEM_ID}`,
  );
  check(
    "苗木 2 種がクリエイティブの一覧に出る（MAX_ITEM_ID がトウヒの苗木まで届いている）",
    MAX_ITEM_ID === SPRUCE_SAPLING && saplings.every((id) => ids.includes(id)),
    `MAX_ITEM_ID ${MAX_ITEM_ID} / 一覧に ${saplings.filter((id) => ids.includes(id)).length} 個`,
  );
  // **置けるブロックとして戻ってくること**（`variantOf` を書くと 0 になる）。
  check(
    "苗木 2 種は持って置ける（掘っても戻る）",
    saplings.every((id) => placedBlock(id) === id) &&
      saplings.every((id) => toolOf(id) === null && foodOf(id) === null),
    saplings.map((id) => `${itemName(id)} → ${placedBlock(id)}`).join(" / "),
  );

  // **緑は一覧でいちばん混んでいる帯**（草 0x6aa84f・葉 0x3f7a3a・トウヒの葉
  // 0x2c5c3a・草むら 0x5e9c41・サボテン 0x5c9b47・サトウキビ 0x9ad14f・小麦の種
  // 0x9aa85a・エンダーアイ 0x3fbf8c）。**いちばん近い相手と隔たりを出してから**判定する
  // （骨・木炭と同じ形）。**2 種どうしも見ること** —— 一覧で隣り合って並ぶので、
  // 近いと 2 つあることに気付けない。
  let sapWorst = Infinity;
  const sapLines: string[] = [];
  for (const id of saplings) {
    let best = Infinity;
    let who = "";
    for (const other of ids) {
      if (saplings.includes(other)) continue;
      const gap = dist(itemColor(id), itemColor(other));
      if (gap < best) {
        best = gap;
        who = `${itemName(other)} 0x${itemColor(other).toString(16)}`;
      }
    }
    sapWorst = Math.min(sapWorst, best);
    sapLines.push(`${itemName(id)} 0x${itemColor(id).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
  }
  // **緑の帯の相手を名指しで出しておくこと** —— 一番近い 1 人だけだと、色を触ったときに
  // 「どちらへ寄せると詰まるか」が出力から読めない（木炭の暗い帯と同じ理由）。
  for (const other of [GRASS, LEAVES, SPRUCE_LEAVES, TALL_GRASS, CACTUS, SUGAR_CANE])
    console.log(
      `      苗木 ↔ ${itemName(other)} 0x${itemColor(other).toString(16)}: ` +
        `オーク ${dist(itemColor(SAPLING), itemColor(other)).toFixed(1)} / ` +
        `トウヒ ${dist(itemColor(SPRUCE_SAPLING), itemColor(other)).toFixed(1)}`,
    );
  console.log(`      苗木の色のいちばん近い相手: ${sapLines.join(" / ")}`);
  const sapPair = dist(itemColor(SAPLING), itemColor(SPRUCE_SAPLING));
  console.log(`      2 種どうしの隔たり: ${sapPair.toFixed(1)}`);
  check(
    "苗木 2 種は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    sapWorst >= 20,
    `いちばん近くて ${sapWorst.toFixed(1)}`,
  );
  check(
    "苗木 2 種は互いにも見分けられる（RGB で 20 以上）",
    sapPair >= 20,
    `${sapPair.toFixed(1)}`,
  );
}
