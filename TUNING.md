# あとで決める数値（手触りの預かり表）

**クリアまで通すのが先で、難度と手触りは後から一括で調整する**とユーザーと決めました
（`LOOP.md` の「3.5」）。ループは**本家 Minecraft の値をそのまま暫定で置き、ここに 1 行足します。**

## 書き方

| 列 | 中身 |
| --- | --- |
| 場所 | ファイルと定数名（**judgment のファイルに置くこと**。`main.ts` や `*render.ts` に散らさない） |
| いま | 現在の値 |
| 出典 | **本家** = Minecraft と同じ / **目分量** = このプロジェクトで決めた |
| 触ると | 変えたときに何が変わるか（1 行） |

**行を消さないこと。** 調整が済んだ行は「済」を頭に付けます（何をどう決めたかが残ります）。
ユーザーが実際に遊んで決めるのはこの表で、**ここに無い数値は「決めた覚えがない数値」**です。

---

## 戦闘・ダメージ

| 場所 | いま | 出典 | 触ると |
| --- | --- | --- | --- |
| `vitals.ts` `MAX_HEALTH` | 20 | 本家 | 全部の被弾の重み |
| `vitals.ts` `LAVA_DAMAGE` / `LAVA_INTERVAL` | 4 / 0.5 秒 | 本家 | 溶岩に触れたときの致死性。**防具が無いので実質 19 入る** |
| `vitals.ts` `BURN_SECONDS` | 15 秒 | 本家 | 溶岩から出たあとの炎上の長さ |
| `vitals.ts` `DROWN_DAMAGE` / `AIR_SECONDS` | 2 / 15 秒 | 本家 | 溺れの厳しさ |
| `vitals.ts` `VOID_DAMAGE` | 8 | 目分量 | 奈落の即死性 |
| `vitals.ts` `FALL_SAFE` | 3 | 本家 | 落下で痛くならない高さ |
| `vitals.ts` `MOB_HURT_COOLDOWN` | 0.5 秒 | 本家 | モブが何体居ても入る量の上限 |
| `mobs.ts` `MOB_DAMAGE` / `MOB_ATTACK_COOLDOWN` | 2 / 1 秒 | 本家（ゾンビ・イージー相当） | 敵に殴られる速さ |
| `mobs.ts` `HOSTILE_SIGHT` / `ATTACK_RANGE` | 18 / 1.4 | 目分量 | 敵に追われ始める距離 |
| `mobs.ts` `TOOL_ATTACK` / `TIER_ATTACK` | 斧 3・ツルハシ 2・シャベル 1 / 階層 +0.5 | 目分量 | 殴り返す強さ（本家より単純） |
| `mobs.ts` `PLAYER_ATTACK_COOLDOWN` | 0.5 秒 | 目分量 | 連打の効き |

## モブ

| 場所 | いま | 出典 | 触ると |
| --- | --- | --- | --- |
| `mobs.ts` `PIG.maxHealth` / `speed` | 10 / 1.7 | 本家 | 豚の硬さと逃げ足 |
| `mobs.ts` `SHEEP.maxHealth` / `speed` | 8 / 1.5 | 本家 | 羊の硬さ |
| `mobs.ts` `ZOMBIE.maxHealth` / `speed` | 12 / 4.6 | 目分量（本家は 20 / 遅い） | **速い**ので本家より怖い。真っ先に見る行 |
| `mobs.ts` `ZOMBIE.drop.chance` | 0.6 | 目分量 | 腐った肉の出やすさ |
| `mobs.ts` `PASSIVE_SKY_MIN` / `HOSTILE_LIGHT_MAX` | 9 / 7 | 本家 | どこに湧くか（松明の意味） |

## 空腹

| 場所 | いま | 出典 | 触ると |
| --- | --- | --- | --- |
| `vitals.ts` `EXHAUST_LIMIT` ほか消耗の表 | 4 / 歩き 0.01 / 走り 0.1 | 本家 | 腹の減る速さ全体 |
| `vitals.ts` `REGEN_HUNGER` | 18 | 本家 | 自然回復に要る満腹度 |
| `vitals.ts` `STARVE_FLOOR` / `POISON_FLOOR` | 1 / 1 | **ユーザーと決めた**（ノーマル相当） | 餓死・毒死するかどうか |
| `vitals.ts` `SPRINT_HUNGER` | 6 | 本家 | 走れなくなる線 |
| `vitals.ts` `EAT_SECONDS` | 1.6 | 本家 | 食べる長さ |

## 世界・探索

| 場所 | いま | 出典 | 触ると |
| --- | --- | --- | --- |
| `fortress.ts` `FORTRESS_SPACING` / `FORTRESS_CHANCE` | 6 列 / 0.6 | 目分量 | ネザー要塞の見つけやすさ（いま原点から 25〜34 マス） |
| `portaltravel.ts` `PORTAL_DELAY` | 0.9 秒 | 本家 | ポータルに立ってから移るまでの間 |
| `portaltravel.ts` `SEARCH_RADIUS` | 12 | 目分量 | 戻ったときに元の枠へ出る範囲 |
| `portaltravel.ts` `PORTAL_SCALE` | 8 | 本家 | ネザーの 1 歩が地上の何歩か |
| `drops.ts` `DESPAWN_AGE` / `MAX_DROPS` | 300 秒 / 128 | 本家 / 目分量 | 死んだ場所に戻る猶予 |
| `items.ts` 砂利 → 火打石 | 10% | 本家 | 火打石と打ち金までの手間 |
| `worldgen.ts` `VEINS` の `veinChance` | 鉱石ごと | 目分量 | 鉱石の見つけやすさ（ダイヤ 0.003） |

## これから足すもの（2-4 以降）

**ループが数値を置いたらここへ行を足すこと。** 予定している出典は全部「本家」:

- ブレイズ: 体力 20 / 火球 5 / 発射の間 / ブレイズロッド 0〜1 個
- エンダーマン: 体力 40 / 近接 7 / テレポートの条件 / エンダーパール 0〜1 個
- 弓: 引き 1.0 秒 / 最大ダメージ 9
- エンダードラゴン: 体力 200 / ブレスのダメージ / クリスタルで回復する量
