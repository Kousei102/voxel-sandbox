import {
  LEATHER,
  LEATHER_BOOTS,
  LEATHER_CHESTPLATE,
  LEATHER_HELMET,
  LEATHER_LEGGINGS,
  allArmorIds,
  allItemIds,
  armorOf,
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
}
