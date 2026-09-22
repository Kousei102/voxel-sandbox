import {
  BRICK,
  CACTUS,
  CLAY,
  COAL_BLOCK,
  COBBLE,
  CRAFTING_TABLE,
  GRASS,
  ICE,
  LEAVES,
  NETHER_BRICK_FENCE,
  OBSIDIAN,
  SAPLING,
  SPRUCE_LEAVES,
  SPRUCE_SAPLING,
  STONE,
  SUGAR_CANE,
  TALL_GRASS,
  VINE,
  VINE_XN,
  VINE_ZN,
  VINE_ZP,
} from "../src/blocks";
import {
  BONE,
  BRICK_ITEM,
  BUCKET,
  CHARCOAL,
  CLAY_BALL,
  COAL,
  DIAMOND,
  DIAMOND_BOOTS,
  DIAMOND_CHESTPLATE,
  DIAMOND_HELMET,
  DIAMOND_LEGGINGS,
  FLINT,
  GOLD_BOOTS,
  GOLD_CHESTPLATE,
  GOLD_HELMET,
  GOLD_INGOT,
  GOLD_LEGGINGS,
  IRON_BOOTS,
  IRON_CHESTPLATE,
  IRON_HELMET,
  IRON_INGOT,
  IRON_LEGGINGS,
  LEATHER,
  LEATHER_BOOTS,
  LEATHER_CHESTPLATE,
  LEATHER_HELMET,
  LEATHER_LEGGINGS,
  MAX_ITEM_ID,
  ROTTEN_FLESH,
  SHEARS,
  STEAK,
  STICK,
  STRING,
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

  // **着られるのは革・鉄・金・ダイヤの 4 材質・16 種**（33b で金とダイヤが入った）。
  // ここが増える周は、`inventory.ts` の `armorPoints` と
  // `test/vitals.test.ts` の点数の表も一緒に動く周。
  //
  // **⚠ 数え方をゆるめたのではない。** 2026-09-16 に鉄が入るまでは材質が 1 つ
  // しか無かったので `armors.length === 4` と `new Set(slots).size === 4` で足りた
  // が、**材質が 2 つになると同じ部位が 2 つ出る**（頭が革と鉄で 2 つ）。だから
  // **「材質ごとに頭・胴・脚・足が 1 つずつ」へ数え直した** —— こちらのほうが
  // 強い（材質が何個に増えても、部位の抜けと重複の両方で落ちる）。
  // **33b では、その数え方のまま材質の列を 2 つ足しただけ**（判定は 1 つも
  // ゆるめていない。8 → 16 種・部位ごと 2 → 4 つは**材質が 4 つになったぶん**）。
  const armors = allArmorIds();
  const MATERIALS: [string, number[]][] = [
    ["革", [LEATHER_HELMET, LEATHER_CHESTPLATE, LEATHER_LEGGINGS, LEATHER_BOOTS]],
    ["鉄", [IRON_HELMET, IRON_CHESTPLATE, IRON_LEGGINGS, IRON_BOOTS]],
    ["金", [GOLD_HELMET, GOLD_CHESTPLATE, GOLD_LEGGINGS, GOLD_BOOTS]],
    ["ダイヤ", [DIAMOND_HELMET, DIAMOND_CHESTPLATE, DIAMOND_LEGGINGS, DIAMOND_BOOTS]],
  ];
  console.log(
    `      着られるアイテム: ${armors.length} 種 [` +
      `${armors.map((id) => `${id} ${itemName(id)} ${armorOf(id)?.slot} ${armorOf(id)?.defense} 点`).join(" / ")}]`,
  );
  check(
    "着られるのは 16 種（革 4 + 鉄 4 + 金 4 + ダイヤ 4。材質が 4 つになったので数え直した）",
    armors.length === 16,
    `${armors.length} 種`,
  );

  // **材質の中で部位が 4 つとも別**であること。同じ材質に同じ部位が 2 つあると、
  // `armorPoints` が「枠の並びと合っているか」で弾くので片方が永久に 0 点になる。
  const WANT: string[] = ["head", "chest", "legs", "feet"];
  for (const [material, pieces] of MATERIALS) {
    const slots = pieces.map((id) => armorOf(id)?.slot);
    console.log(`      ${material}の部位: ${pieces.map((id, i) => `${itemName(id)} ${slots[i]}`).join(" / ")}`);
    check(
      `${material}の 4 部位は頭・胴・脚・足が 1 つずつ`,
      new Set(slots).size === 4 && slots.every((slot, i) => slot === WANT[i]),
      slots.join(" / "),
    );
  }
  // **材質をまたぐと部位は重なる**（頭が革・鉄・金・ダイヤで 4 つ）。**それが正しい**
  // —— 16 種が 4 部位に 4 つずつ割れていることを、数のほうから 1 件で押さえる。
  const bySlot = WANT.map((slot) => armors.filter((id) => armorOf(id)?.slot === slot).length);
  console.log(`      部位ごとの種類数: ${WANT.map((slot, i) => `${slot} ${bySlot[i]}`).join(" / ")}`);
  check(
    "16 種は 4 部位に 4 つずつ（材質 4 つぶん。数え直したのであってゆるめていない）",
    bySlot.every((n) => n === 4),
    bySlot.join(" / "),
  );

  // **点数は本家のまま**（革 1 / 3 / 2 / 1 = 7・**鉄 2 / 6 / 5 / 2 = 15**・
  // **金 2 / 5 / 3 / 1 = 11**・**ダイヤ 3 / 8 / 6 / 3 = 20**）。
  // 合計だけを見ていると、内訳を入れ替えても（帽子 6 / 上着 2 でも）緑になるので両方を出す。
  //
  // **⚠ 金（11）は鉄（15）より弱い**のに要る枚数は同じ 24 枚で、**ダイヤ（20）は
  // `ARMOR_CAP` ちょうど**。どちらも本家のままなので、ここで点を足さないこと。
  const TOTALS: Record<string, [number[], number]> = {
    革: [[1, 3, 2, 1], 7],
    鉄: [[2, 6, 5, 2], 15],
    金: [[2, 5, 3, 1], 11],
    ダイヤ: [[3, 8, 6, 3], 20],
  };
  for (const [material, pieces] of MATERIALS) {
    const points = pieces.map((id) => armorOf(id)?.defense ?? 0);
    const total = points.reduce((sum, p) => sum + p, 0);
    const [want, wantTotal] = TOTALS[material];
    console.log(
      `      ${material}の点数: 帽子 ${points[0]} / 上着 ${points[1]} / ズボン ${points[2]}` +
        ` / 靴 ${points[3]} = 合計 ${total}`,
    );
    check(
      `${material}の点数は ${want.join(" / ")} で合計 ${wantTotal}`,
      points.every((p, i) => p === want[i]) && total === wantTotal,
      `${points.join(" / ")} = ${total}`,
    );
  }

  // **材料は着られないこと。** 表に入れると「材料を頭の枠に置くと固くなる」。
  check("革（材料）は着られない", armorOf(LEATHER) === null, String(armorOf(LEATHER)));
  check("鉄インゴット（材料）は着られない", armorOf(IRON_INGOT) === null, String(armorOf(IRON_INGOT)));
  check(
    "金インゴットとダイヤ（材料）も着られない",
    armorOf(GOLD_INGOT) === null && armorOf(DIAMOND) === null,
    `金 ${armorOf(GOLD_INGOT)} / ダイヤ ${armorOf(DIAMOND)}`,
  );

  // **全アイテムを引いて確かめること** —— `armorOf()` が undefined ではなく null を
  // 返す（`foodOf()` と同じ形）ことの足場でもある。
  const ids = allItemIds();
  const wearable = ids.filter((id) => armorOf(id) !== null);
  console.log(`      一覧の ${ids.length} 種のうち、armorOf() が非 null なのは ${wearable.length} 種`);
  check(
    "着られるのは表に載せた 16 種だけ（材質 4 つぶん。数え直したのであってゆるめていない）",
    wearable.length === 16 && wearable.every((id) => armors.includes(id)),
    wearable.map((id) => itemName(id)).join(", "),
  );
  check("表に無い番号（0 と 999）も null", armorOf(0) === null && armorOf(999) === null);

  // **上限そのものの突き合わせはツタの節へ移した**（`MAX_ITEM_ID` が 186 に伸びたので、
  // ここに `=== DIAMOND_BOOTS` を残すと `tsc` が TS2367 で落ちる。`rules/testing.md`）。
  // ここで見るのは「**金・ダイヤの 8 部位が一覧に出ているか**」そのもの —— 上限を
  // 伸ばし忘れるとここが先に落ちるので、見張りとしては同じだけ効く
  // （伸ばし忘れは型では止まらない。`rules/items-survival.md`）。
  const newest = [
    GOLD_HELMET, GOLD_CHESTPLATE, GOLD_LEGGINGS, GOLD_BOOTS,
    DIAMOND_HELMET, DIAMOND_CHESTPLATE, DIAMOND_LEGGINGS, DIAMOND_BOOTS,
  ];
  console.log(`      MAX_ITEM_ID ${MAX_ITEM_ID}（ダイヤの靴 ${DIAMOND_BOOTS}・鉄の靴 ${IRON_BOOTS}）`);
  check(
    "金・ダイヤの 8 部位がクリエイティブの一覧に出る（MAX_ITEM_ID がダイヤの靴を越えている）",
    newest.every((id) => ids.includes(id)),
    `MAX_ITEM_ID ${MAX_ITEM_ID} / 一覧に ${newest.filter((id) => ids.includes(id)).length} 個`,
  );

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
  // **どの材質も、素直な色は通らなかった。**
  // 革は**木の茶色**（革・パン・茶キノコ・はしご・本棚・焼き鳥がここに居る）、
  // 鉄は**無彩色の灰**（石・丸石・砂利・かまど・羊毛・紙・骨・粘土・バケツ・
  // 鉄インゴット・鉄と石の道具 10 本…で**既存 46 個**）が一覧でいちばん混んでいる帯で、
  // **鉄は明るさのどの帯でもいちばん遠い無彩色が 20.3 / 20.1 / 22.1 / 21.4**
  // （判定 20 のすぐ上）だった。だから**鉄は青を 18〜48 足した「鋼の青」**
  // （`TUNING.md` / `rules/items-survival.md`）。
  // **金は黄色い帯**（金インゴット・金のリンゴ・金鉱石・ブレイズロッド）、
  // **ダイヤは水色の帯**（ミルクバケツ・ガラス・氷・ダイヤ）で、どちらも 33b で
  // 測り直して通した 4 段。**4 材質とも上ほど明るい。**
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
    `      16 つ互いのいちばん近い隔たり: ${worstPair.toFixed(1)}` +
      `（材料の革 0x${itemColor(LEATHER).toString(16)} とは ` +
      `${armors.map((id) => dist(itemColor(id), itemColor(LEATHER)).toFixed(1)).join(" / ")}）`,
  );
  check(
    "16 部位は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    worstOther >= 20,
    `いちばん近くて ${worstOther.toFixed(1)}`,
  );
  check(
    "16 部位は互いにも見分けられる（材質をまたいでも。RGB で 20 以上）",
    worstPair >= 20,
    `いちばん近くて ${worstPair.toFixed(1)}`,
  );
  // **明るさの順が部位の順**（帽子がいちばん明るい）。入れ替わっても上の 2 件は
  // 緑のままなので、並びそのものを**材質ごとに** 1 件として見張る。
  const lum = (c: number): number =>
    0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
  for (const [material, pieces] of MATERIALS) {
    const ladder = pieces.map((id) => lum(itemColor(id)));
    console.log(`      ${material}の明るさ: ${ladder.map((v) => v.toFixed(0)).join(" > ")}`);
    check(
      `${material}は上ほど明るい（帽子 > 上着 > ズボン > 靴）`,
      ladder[0] > ladder[1] && ladder[1] > ladder[2] && ladder[2] > ladder[3],
      ladder.map((v) => v.toFixed(0)).join(" / "),
    );
  }

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
  // **上限そのものの突き合わせは粘土玉の節へ移した**（`MAX_ITEM_ID` が 169 に伸びたので、
  // ここに `=== SPRUCE_SAPLING` を残すと `tsc` が TS2367 で落ちる。`rules/testing.md`）。
  // ここで見るのは「**苗木 2 種が一覧に出ているか**」そのもの —— 上限を伸ばし忘れると
  // ここが先に落ちるので、見張りとしては同じだけ効く。
  check(
    "苗木 2 種がクリエイティブの一覧に出る（MAX_ITEM_ID がトウヒの苗木を越えている）",
    saplings.every((id) => ids.includes(id)),
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

  describe("粘土と粘土玉（一覧に出る色）");

  // **粘土玉は置けず・道具でもなく・食べ物でもない**（骨・木炭とまったく同じ扱い）。
  // `tool:` を付けると `mobs.ts` の `TOOL_ATTACK` に無い種類が入って
  // `attackDamage()` が NaN を返す（`rules/items-survival.md`）。
  console.log(
    `      粘土玉(${CLAY_BALL}) ${itemName(CLAY_BALL)} 0x${itemColor(CLAY_BALL).toString(16)}  置ける ` +
      `${placedBlock(CLAY_BALL) !== 0} / 道具 ${toolOf(CLAY_BALL) !== null} / 食べ物 ${foodOf(CLAY_BALL) !== null}` +
      ` / 1 枠 ${itemStackLimit(CLAY_BALL)} 個`,
  );
  check(
    "粘土玉は置けず・道具でもなく・食べ物でもない（1 枠 64 個）",
    placedBlock(CLAY_BALL) === 0 && toolOf(CLAY_BALL) === null && foodOf(CLAY_BALL) === null &&
      itemStackLimit(CLAY_BALL) === 64,
    `block ${placedBlock(CLAY_BALL)} / tool ${toolOf(CLAY_BALL)} / food ${foodOf(CLAY_BALL)} / stack ${itemStackLimit(CLAY_BALL)}`,
  );
  // **粘土ブロックのほうは置ける**（掘ると粘土玉になるので、戻すには 2x2 が要る）。
  check(
    "粘土ブロックは持って置ける（アイテムはブロックの for が作る）",
    ids.includes(CLAY) && placedBlock(CLAY) === CLAY &&
      toolOf(CLAY) === null && foodOf(CLAY) === null,
    `${itemName(CLAY)} → ${placedBlock(CLAY)}`,
  );
  // **上限そのものの突き合わせはレンガの節へ移した**（`MAX_ITEM_ID` が 170 に伸びたので、
  // ここに `=== CLAY_BALL` を残すと `tsc` が TS2367 で落ちる。`rules/testing.md`）。
  // ここで見るのは「**粘土 2 つが一覧に出ているか**」そのもの —— 上限を伸ばし忘れると
  // ここが先に落ちるので、見張りとしては同じだけ効く。
  check(
    "粘土と粘土玉がクリエイティブの一覧に出る（MAX_ITEM_ID が粘土玉を越えている）",
    ids.includes(CLAY) && ids.includes(CLAY_BALL),
    `MAX_ITEM_ID ${MAX_ITEM_ID} / 一覧に 粘土 ${ids.includes(CLAY)} 粘土玉 ${ids.includes(CLAY_BALL)}`,
  );

  // **灰青は一覧でとても混んでいる帯**（糸 0xb8bcc8・バケツ 0xb0b4bb・シアーズ 0xa8b8c0・
  // 石 0x8a8f96・氷 0x8fc4f2）。仕様書の見当（粘土 0xa4aab9 / 玉 0xb0b8cc）は
  // **バケツと 15.7 / 糸と 9.8** しか離れていなかったので、**測ってからずらしてある**
  // （`TUNING.md`）。**2 つとも、いちばん近い相手と隔たりを出してから**判定する
  // （骨・木炭・苗木と同じ形）。**互いも見ること** —— 一覧で隣り合って並ぶ。
  const clays = [CLAY, CLAY_BALL];
  let clayWorst = Infinity;
  const clayLines: string[] = [];
  for (const id of clays) {
    let best = Infinity;
    let who = "";
    for (const other of ids) {
      if (clays.includes(other)) continue;
      const gap = dist(itemColor(id), itemColor(other));
      if (gap < best) {
        best = gap;
        who = `${itemName(other)} 0x${itemColor(other).toString(16)}`;
      }
    }
    clayWorst = Math.min(clayWorst, best);
    clayLines.push(`${itemName(id)} 0x${itemColor(id).toString(16)} ↔ ${who} ${best.toFixed(1)}`);
  }
  // **灰青の帯の相手を名指しで出しておくこと** —— 一番近い 1 人だけだと、色を触ったときに
  // 「どちらへ寄せると詰まるか」が出力から読めない（木炭の暗い帯と同じ理由）。
  for (const other of [STRING, BUCKET, SHEARS, STONE, ICE])
    console.log(
      `      粘土 ↔ ${itemName(other)} 0x${itemColor(other).toString(16)}: ` +
        `ブロック ${dist(itemColor(CLAY), itemColor(other)).toFixed(1)} / ` +
        `玉 ${dist(itemColor(CLAY_BALL), itemColor(other)).toFixed(1)}`,
    );
  console.log(`      粘土の色のいちばん近い相手: ${clayLines.join(" / ")}`);
  const clayPair = dist(itemColor(CLAY), itemColor(CLAY_BALL));
  console.log(`      2 つどうしの隔たり: ${clayPair.toFixed(1)}`);
  check(
    "粘土と粘土玉は既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    clayWorst >= 20,
    `いちばん近くて ${clayWorst.toFixed(1)}`,
  );
  check(
    "粘土と粘土玉は互いにも見分けられる（RGB で 20 以上）",
    clayPair >= 20,
    `${clayPair.toFixed(1)}`,
  );

  describe("レンガ（アイテム 170・粘土玉を焼くと出る）");

  // **置けず・道具でもなく・食べ物でもない**（骨・木炭・粘土玉とまったく同じ扱い）。
  // `tool:` を付けると `mobs.ts` の `TOOL_ATTACK` に無い種類が入って
  // `attackDamage()` が NaN を返す（`rules/items-survival.md`）。
  // **置けるのは `blocks.ts` の `BRICK`(12) のほう** —— レンガは 2x2 で組む材料。
  console.log(
    `      レンガ(${BRICK_ITEM}) ${itemName(BRICK_ITEM)} 0x${itemColor(BRICK_ITEM).toString(16)}  置ける ` +
      `${placedBlock(BRICK_ITEM) !== 0} / 道具 ${toolOf(BRICK_ITEM) !== null} / 食べ物 ${foodOf(BRICK_ITEM) !== null}` +
      ` / 1 枠 ${itemStackLimit(BRICK_ITEM)} 個`,
  );
  check(
    "レンガは置けず・道具でもなく・食べ物でもない（1 枠 64 個）",
    placedBlock(BRICK_ITEM) === 0 && toolOf(BRICK_ITEM) === null && foodOf(BRICK_ITEM) === null &&
      itemStackLimit(BRICK_ITEM) === 64,
    `block ${placedBlock(BRICK_ITEM)} / tool ${toolOf(BRICK_ITEM)} / food ${foodOf(BRICK_ITEM)} / stack ${itemStackLimit(BRICK_ITEM)}`,
  );
  // **`MAX_ITEM_ID` そのものの突き合わせは鉄の防具の節へ移した**（上限が 174 に
  // 伸びたので、ここに残すと `tsc` が TS2367 で落ちる。`rules/testing.md`）。
  // ここで見るのは「レンガが一覧から落ちていないこと」の 1 点。
  check("レンガがクリエイティブの一覧に出る", ids.includes(BRICK_ITEM), `一覧に レンガ ${ids.includes(BRICK_ITEM)}`);

  // **赤茶は一覧でとても混んでいる帯**（革 0xa06a41・ステーキ 0x8f5230・作業台 0x9a6f3e・
  // 棒 0x9a7549・腐った肉 0x8a6b4f・革のズボン 0xb16e51）。素直な 0x9c5a3c は
  // **レンガブロック(12) の 0xa4553f と 9.9 しか離れません**（判定は 20）ので、
  // **測ってからずらしてある**（`TUNING.md`）。**いちばん近い相手と隔たりを
  // 出してから**判定する（骨・木炭・粘土と同じ形）。
  let brickBest = Infinity;
  let brickWho = "";
  for (const other of ids) {
    // **`BRICK`(12) は別の 1 件で見る**（下）—— 一覧で隣り合うのはこの 2 つなので、
    // まとめると「どちらが詰まったのか」が出力から読めない。
    if (other === BRICK_ITEM || other === BRICK) continue;
    const gap = dist(itemColor(BRICK_ITEM), itemColor(other));
    if (gap < brickBest) {
      brickBest = gap;
      brickWho = `${itemName(other)} 0x${itemColor(other).toString(16)}`;
    }
  }
  // **赤茶の帯の相手を名指しで出しておくこと** —— 一番近い 1 人だけだと、色を触ったときに
  // 「どちらへ寄せると詰まるか」が出力から読めない（木炭の暗い帯と同じ理由）。
  for (const other of [LEATHER, STEAK, CRAFTING_TABLE, STICK, ROTTEN_FLESH, LEATHER_LEGGINGS])
    console.log(
      `      レンガ ↔ ${itemName(other)} 0x${itemColor(other).toString(16)}: ` +
        `${dist(itemColor(BRICK_ITEM), itemColor(other)).toFixed(1)}`,
    );
  console.log(`      レンガの色のいちばん近い相手（12 を除く）: ${brickWho} ${brickBest.toFixed(1)}`);
  check(
    "レンガは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    brickBest >= 20,
    `いちばん近いのは${brickWho}で ${brickBest.toFixed(1)}`,
  );
  // **レンガブロック(12) との隔たりは別の 1 件。** 名前を分けても色が同じだと、
  // 一覧に並んだ 2 つが見分けられない（名前の対は `test/blocks.test.ts`）。
  const brickPair = dist(itemColor(BRICK_ITEM), itemColor(BRICK));
  console.log(
    `      レンガ 0x${itemColor(BRICK_ITEM).toString(16)} ↔ ` +
      `レンガブロック(12) 0x${itemColor(BRICK).toString(16)}: ${brickPair.toFixed(1)}`,
  );
  check(
    "レンガとレンガブロック(12) は一覧で見分けられる（RGB で 20 以上）",
    brickPair >= 20,
    `${brickPair.toFixed(1)}`,
  );

  describe("ツタ（アイテム 183・持って壁に掛けるブロック）");

  // **ブロックなので `items.ts` には 1 行も無い** —— `variantOf` が `AIR` なので
  // ブロック → アイテムの for が同じ番号のアイテムを作る（**手で足すと二重登録**）。
  // **184..186 は `variantOf: VINE` なのでアイテムを持たない。**
  console.log(
    `      ツタ(${VINE}) ${itemName(VINE)} 0x${itemColor(VINE).toString(16)}  置ける ` +
      `${placedBlock(VINE) === VINE} / 道具 ${toolOf(VINE) !== null} / 食べ物 ${foodOf(VINE) !== null}` +
      ` / 1 枠 ${itemStackLimit(VINE)} 個  向き違い ${[VINE_XN, VINE_ZP, VINE_ZN]
        .map((id) => `${id}:${ids.includes(id) ? "一覧に居る" : "無し"}`)
        .join(" ")}`,
  );
  check(
    "ツタは持って置けて・道具でも食べ物でもない（1 枠 64 個）",
    placedBlock(VINE) === VINE && toolOf(VINE) === null && foodOf(VINE) === null &&
      itemStackLimit(VINE) === 64,
    `block ${placedBlock(VINE)} / tool ${toolOf(VINE)} / food ${foodOf(VINE)} / stack ${itemStackLimit(VINE)}`,
  );
  // **向き違いが一覧に出ると「ツタ」が 4 個並ぶ。** ここが崩れると、置いて壊したときに
  // 別の番号のアイテムが手に入る形でも壊れる（共有帯は 1 本の番号列なので）。
  check(
    "184..186 は allItemIds() に出てこない（向き違いはアイテムを持たない）",
    [VINE_XN, VINE_ZP, VINE_ZN].every((id) => !ids.includes(id)),
    [VINE_XN, VINE_ZP, VINE_ZN].map((id) => `${id}:${ids.includes(id)}`).join(" "),
  );
  // **`MAX_ITEM_ID` そのものの突き合わせはここ**（金・ダイヤの防具の節から移した。
  // 上限が動くたびに、古い番号を残すと `tsc` が TS2367 で落ちる。`rules/testing.md`）。
  // **共有帯はブロックとアイテムで 1 本の番号列**なので、上限は**使った番号の
  // 最後**まで伸ばす —— ツタで 183 に止めると次に取る空き番号を数え違えた。
  // **いまの上限は石炭ブロック（ブロック 188）**（42 で伸びた。
  // **上限が 187 から動いたので数え直した** —— ツタの 3 件もネザーレンガの
  // フェンスも、そのまま上と一覧に残っている）。
  console.log(
    `      MAX_ITEM_ID ${MAX_ITEM_ID}（ツタの大元 ${VINE} / 向き違いの最後 ${VINE_ZN} / ` +
      `ネザーレンガのフェンス ${NETHER_BRICK_FENCE} / 石炭ブロック ${COAL_BLOCK}）`,
  );
  check(
    "MAX_ITEM_ID は石炭ブロック（188）まで伸びている（上限が動いたので数え直した）",
    MAX_ITEM_ID === COAL_BLOCK && ids.includes(VINE) &&
      ids.includes(NETHER_BRICK_FENCE) && ids.includes(COAL_BLOCK) && MAX_ITEM_ID > VINE_ZN,
    `MAX_ITEM_ID ${MAX_ITEM_ID} / 一覧に ツタ ${ids.includes(VINE)} / ` +
      `ネザーレンガのフェンス ${ids.includes(NETHER_BRICK_FENCE)} / ` +
      `石炭ブロック ${ids.includes(COAL_BLOCK)}`,
  );

  // **緑は一覧でいちばん混んでいる帯**（草 0x6aa84f・葉 0x3f7a3a・トウヒの葉
  // 0x2c5c3a・草むら 0x5e9c41・サボテン 0x5c9b47・苗木 2 種・エンダーアイ）。
  // **いちばん近い相手と隔たりを出してから**判定する（骨・木炭・レンガと同じ形）。
  let vineBest = Infinity;
  let vineWho = "";
  for (const other of ids) {
    if (other === VINE) continue;
    const gap = dist(itemColor(VINE), itemColor(other));
    if (gap < vineBest) {
      vineBest = gap;
      vineWho = `${itemName(other)} 0x${itemColor(other).toString(16)}`;
    }
  }
  // **緑の帯の相手を名指しで出しておくこと** —— 一番近い 1 人だけだと、色を触ったときに
  // 「どちらへ寄せると詰まるか」が出力から読めない（木炭の暗い帯と同じ理由）。
  for (const other of [LEAVES, SPRUCE_LEAVES, GRASS, TALL_GRASS, CACTUS, SAPLING])
    console.log(
      `      ツタ ↔ ${itemName(other)} 0x${itemColor(other).toString(16)}: ` +
        `${dist(itemColor(VINE), itemColor(other)).toFixed(1)}`,
    );
  console.log(`      ツタの色のいちばん近い相手: ${vineWho} ${vineBest.toFixed(1)}`);
  check(
    "ツタは既存のどのアイテムとも一覧で見分けられる（RGB で 20 以上）",
    vineBest >= 20,
    `いちばん近いのは${vineWho}で ${vineBest.toFixed(1)}`,
  );
}
