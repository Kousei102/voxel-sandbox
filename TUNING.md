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
| `daynight.ts` `SKY_STYLES.nether` の `brightness` | 1.0 | 目分量 | ネザーの地形の明るさ全体。**モブの湧きの明るさも同じ値を見る**ので、下げると暗所が増える |
| `daynight.ts` `SKY_STYLES.nether` の色 3 つ | 天頂 #2a0906 / 地平 #5a1a12 / 地面 #180504 | 目分量 | ネザーの空と**フォグ**の赤黒さ（フォグは地平線に追従） |
| `daynight.ts` `SKY_STYLES.end` の `brightness` と色 | 0.7 / 天頂 #0a0716・地平 #1d1236・地面 #06040e | 目分量 | エンドの暗さと紫の濃さ。**まだ行けない**ので、2-10 で実際に立ってから決める |

## モブ（ブレイズ）

| 場所 | いま | 出典 | 触ると |
| --- | --- | --- | --- |
| `mobs.ts` `BLAZE.maxHealth` | 20 | 本家 | 何回殴れば倒れるか（ダイヤの斧 5 で 4 回） |
| `mobs.ts` `BLAZE.speed` | 3.6 | 目分量 | **プレイヤーの歩き 5.2 より遅いこと。** 壁も崖も関係なく飛んでくるので、ゾンビ（4.6）に揃えると振り切れない |
| `mobs.ts` `BLAZE.drop.chance` | 0.5 | 本家 | ブレイズロッドの集まり方（エンダーアイまでの手間） |
| `mobs.ts` `FLY_HOVER` / `FLY_ABOVE` | 2.5 / 1.2 | 目分量 | 飛ぶモブが床から浮く高さ／追うときプレイヤーのどれだけ上に居るか。**1 以下にしないこと**（床の手すりに引っかかる） |
| `mobs.ts` `FLY_RISE` / `FLY_ACCEL` | 3 / 12 | 目分量 | 上下の動きの機敏さ。上げると壁をすぐ越えるが、ふわふわ感が消える |
| `mobs.ts` `BLAZE.damage` | 6 | 本家 | 近づかれたときの一撃（ゾンビの 3 倍）。**めったに届きません** —— 床から 2.5 浮くので、平地のプレイヤーとは `ATTACK_HEIGHT`(1.5) 以上離れる |
| `mobs.ts` `BLAZE.ranged.damage` | 5 | 本家 | 火球 1 発の重み（体力 20 なので 4 発で死ぬ） |
| `mobs.ts` `BLAZE.ranged.range` / `near` | 16 / 3 | 本家 / 目分量 | 撃ってくる間合い。`near` は「近すぎると撃たない」線（0 にすると足元へ撃って近接と二重取り） |
| `mobs.ts` `BLAZE.ranged.cooldown` | 3 秒 | 目分量 | 火球の間隔。**本家の 3 連射は入れていません**（1 発ずつ）。詰めると避けきれなくなる |
| `mobs.ts` `BLAZE.ranged.height` | 1.1 | 目分量 | 火球が出る高さ（足元から）。下げると自分の足場に当たる |

**近接ダメージは種類ごとに持つようになりました**（`MobDef.damage`。2-4b）。
`MOB_DAMAGE` は `ZOMBIE.damage` の別名なので、**新しいモブをそこへ繋がないこと。**

## これから足すもの（2-4b 以降）

**ループが数値を置いたらここへ行を足すこと。** 予定している出典は全部「本家」:

- ブレイズの火球: 5 / 発射の間 / 撃ち始める距離
- エンダーマン: 体力 40 / 近接 7 / テレポートの条件 / エンダーパール 0〜1 個
- 弓: 引き 1.0 秒 / 最大ダメージ 9
- エンダードラゴン: 体力 200 / ブレスのダメージ / クリスタルで回復する量
