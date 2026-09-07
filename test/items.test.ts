import { allArmorIds, allItemIds, armorOf, itemName } from "../src/items";
import { check, describe } from "./harness";

export function run(): void {
  describe("防具の表（items.ts の ARMORS）");

  // **この周は着られる物が 1 つもありません**（枠と減り方だけを先に入れた周）。
  // ここが 0 でなくなる周は、`inventory.ts` の `armorPoints` と
  // `test/vitals.test.ts` の点数の表も一緒に動く周です。
  const armors = allArmorIds();
  console.log(`      着られるアイテム: ${armors.length} 種 [${armors.join(", ")}]`);
  check("着られる物はまだ 1 つも無い", armors.length === 0, `${armors.length} 種`);

  // **全アイテムを引いて確かめること** —— 表が空でも `armorOf()` が
  // undefined ではなく null を返す（`foodOf()` と同じ形）ことの足場。
  const ids = allItemIds();
  const wearable = ids.filter((id) => armorOf(id) !== null);
  console.log(`      一覧の ${ids.length} 種のうち、armorOf() が非 null なのは ${wearable.length} 種`);
  check(
    "どのアイテムを引いても null が返る",
    wearable.length === 0,
    wearable.map((id) => itemName(id)).join(", ") || "1 つも無い",
  );
  check("表に無い番号（0 と 999）も null", armorOf(0) === null && armorOf(999) === null);
}
