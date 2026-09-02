# 何をどこで数えるか（AUTODEV の A の周）

**`AUTODEV.md` の A-1 から切り出したもの。A の周（5〜8 タスクに 1 回）でだけ開きます。**
`AUTODEV.md` は毎周読まれて 200 行の上限があるので、こちらへ置いてあります。

**実装済みリストをファイルに持たないこと。** 腐って、同じものを 2 回足します。
**A の周でコードから数え直す**のが決まりで、出どころはこれだけです:

| ジャンル | 数える場所 |
| --- | --- |
| ブロック | `blocks.ts` の `BLOCKS`（`npm test` が種類と空きを出す） |
| アイテム・道具・食べ物 | `items.ts` の `ITEMS` / `FOODS` / `MAX_ITEM_ID` |
| レシピ・精錬 | `crafting.ts` の `RECIPES` / `smelting.ts` の表 |
| モブ | `mobs.ts` の `MobKind` と `MOBS`（ボスは `BOSSES`） |
| バイオーム・地形 | `biomes.ts` の表 / `worldgen.ts` / `nethergen.ts` / `endgen.ts` |
| 構造物 | `structures.ts` の `SiteRule` / `fortress.ts` / `stronghold.ts` |
| 効果・状態 | `vitals.ts`（体力・空腹・毒・炎上・溺れ） |
| 次元 | `dimensions.ts` の `DIMENSIONS` |

**実装済みかどうかはコードが唯一の根拠**です。README も `ROADMAP.md` も古いことがあります
（`ROADMAP.md` が根拠になるのは**これから取る ID の予約表**だけ）。
