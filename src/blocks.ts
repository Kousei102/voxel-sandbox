import { Color } from "three";

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLE = 4;
export const SAND = 5;
export const WATER = 6;
export const WOOD = 7;
export const LEAVES = 8;
export const SNOW = 9;
export const PLANK = 10;
export const GLASS = 11;
export const BRICK = 12;
export const BEDROCK = 13;
export const COAL_ORE = 14;
export const IRON_ORE = 15;
export const GOLD_ORE = 16;
export const DIAMOND_ORE = 17;
export const CRAFTING_TABLE = 18;
export const TORCH = 19;

/**
 * 壁掛けの松明。名前の軸は**支えのある側**を指す
 * （`WALL_TORCH_XP` なら +X 側のブロックに付いていて、松明は -X へ張り出す）。
 *
 * 向きごとに別 ID にしてあるのは、ボクセルにメタデータを持たせないため
 * （データを `Uint8Array` のまま、mesher の統合キーもそのままにできる）。
 * プレイヤーから見れば 1 種類なので、名前もドロップも `TORCH` に揃えてある。
 */
export const WALL_TORCH_XP = 20;
export const WALL_TORCH_XN = 21;
export const WALL_TORCH_ZP = 22;
export const WALL_TORCH_ZN = 23;

/** バイオームで出るもの。 */
export const SANDSTONE = 24;
export const SPRUCE_WOOD = 25;
export const SPRUCE_LEAVES = 26;
export const CACTUS = 27;

/** ハーフブロック。上付きは向き違いなので 64 以降（下の ID の枠を参照）。 */
export const STONE_SLAB = 28;
export const COBBLE_SLAB = 29;
export const PLANK_SLAB = 30;
export const SANDSTONE_SLAB = 31;

/**
 * 草むら。地表に生える背の低い草で、**地面の「草」ブロック（`GRASS`）とは別物**。
 * 向きを持たないので枠は 1 個で足りる。
 */
export const TALL_GRASS = 32;

/**
 * 階段。材質ごとに 水平 4 向き × 上下 2 = 8 通りあるが、
 * **1..63 を使うのは大元（下付き・+X 向き）だけ**で、残り 7 つは 64 以降に置く。
 */
export const STONE_STAIRS = 33;
export const COBBLE_STAIRS = 34;
export const PLANK_STAIRS = 35;
export const SANDSTONE_STAIRS = 36;

/** 羊毛。羊を倒すと落ちる。いまのところ**置ける**ことがそのまま見返りになっている。 */
export const WOOL = 37;

/**
 * かまど。燃えている間だけ別 ID（`FURNACE_LIT`）に差し替えて、光らせる。
 *
 * **点火中の版も 1..63 に置くこと。** 立方体なので greedy の統合キー（`encodeFace` の
 * id 6 ビット）を通ります。64 以降は `isProp()` が true の向き違いだけの枠です。
 *
 * `variantOf` を `FURNACE` にしてあるので、**アイテムもドロップも名前も消えたかまどに揃います**
 * （松明の壁掛け版とまったく同じ仕掛け。点火中のかまどを掘っても、出るのはかまど 1 個）。
 */
export const FURNACE = 38;
export const FURNACE_LIT = 39;

/**
 * チェスト。**「位置ごとに状態を持つブロック」の 2 つ目**で、中身は `chests.ts` が
 * 位置ごとに持つ（ボクセルにはメタデータを持たせない）。
 *
 * かまどと違って**状態違いの ID を持たない** —— 開いているかどうかは画面の話で、
 * 見た目が変わらないため。だから 1..63 を 1 個しか使わない。
 */
export const CHEST = 40;

/**
 * ベッド。**1 個のブロックが 2 マスにまたがる初めての例**で、
 * 足側（赤い布）と枕側（白）の 2 ブロックで 1 台になる。
 *
 * 分けてあるのは `BlockDef` が面ごとに 3 色（上面・側面・下面）しか持てないからで、
 * **枕を白くできるのは 2 マスに分けたときだけ。** 状態の詰め方は階段とまったく同じで、
 * 大元（足側・+X 向き）だけが 1..63 に居て、残り 7 つは 64 以降。
 *
 * 2 マスが必ず揃っていることを保つのは `beds.ts`（置く・壊す・支えを失う の 3 経路）。
 * ここが持つのは**相方がどこに・どの ID で居るべきか**という形の話だけ。
 */
export const BED = 41;

/**
 * 溶岩。**水（`WATER`）とほとんど同じ作り**で、違うのは自分で光ることだけ。
 *
 * 半透明レイヤーに置いてある（`translucent: true`）のは、**中に入ったときに
 * 分かるようにするため。** 不透明にすると、溶岩の中からは裏面カリングで面が消えて
 * 世界がそのまま見えてしまい、浸かっていることが画面から分からない。
 *
 * `replaceable: true` なのも水と同じ。ここにブロックを置けないと、
 * 溶岩を埋めて渡ることも、黒曜石を作ることもできない。
 *
 * **ダメージはここには無い**（`vitals.ts` の仕事）。
 */
export const LAVA = 42;

/**
 * 黒曜石。**ネザーへの入口**で、水に触れた溶岩が固まってできる（規則は下の `quenched()`）。
 *
 * `minTier: TIER_DIAMOND` なので、**ダイヤのツルハシでしか持ち帰れない。**
 * 鉄のツルハシでも掘れて（速くなって）しまうが、何も落ちずに消える ——
 * これは `mining.ts` の既存の規則そのままで、ここに特例は書かない。
 *
 * 硬さは Minecraft と同じ 50。ダイヤのツルハシ（速さ 8）で
 * `50 * 1.5 / 8 ≒ 9.4 秒`かかる。**この遅さが「準備してから行く場所」の手触りを作る。**
 */
export const OBSIDIAN = 43;

/**
 * 砂利。**火打石の出どころ**で、掘ると 10% で火打石が出る（表は `items.ts` の `DROPS`）。
 *
 * 火打石が要るのは**火打石と打ち金 = ネザーポータルの点火**だけなので、
 * これが無いと黒曜石の枠を組んでも火が付かない。
 *
 * **砂と同じく支えを失うと落ちる**（`falls: true`。どのマスに効くかは `gravity.ts`）。
 */
export const GRAVEL = 44;

/**
 * ネザーの地面。**石より柔らかく、ツルハシなら素手の階層でも掘れる**（Minecraft と同じ）。
 * ネザーは足場を作りながら進む所なので、ここを石の硬さにすると往復が苦行になる。
 */
export const NETHERRACK = 45;
/**
 * ソウルサンド。**溶岩の海のほとりに出る。** 上を歩くと遅くなる仕掛けは
 * まだありません（速さの手触りはユーザーの判断なので、入れるときは相談すること）。
 */
export const SOUL_SAND = 46;
/** グロウストーン。**天井からぶら下がる光源**（松明より明るい）。 */
export const GLOWSTONE = 47;

/**
 * ネザーレンガ。**ネザー要塞の材料**（`fortress.ts`）で、地形には出てこない。
 *
 * **ネザーラック（0.4）よりずっと硬い 2.0 にしてある。** 要塞を通り抜けるのに
 * 掘るより歩いたほうが速い、という差が「建物である」ことを手で分からせる。
 */
export const NETHER_BRICK = 48;

/**
 * ネザーポータルの面。**黒曜石の枠の内側を埋める薄い板**で、通り抜けられる。
 *
 * 向きは 2 種類しかない（縦にしか立たないので、水平 4 向きは要らない）。
 * こちらが **X 向き**（面が X 方向に伸び、薄いのは Z）で、
 * もう一方は `NETHER_PORTAL_Z`（64 以降）。**どちらの向きになるかは
 * `portals.ts` が枠から決める**ので、ここは形と見た目だけを持つ。
 *
 * **半透明にしていません。** 立方体でないブロック（`isProp`）は
 * `mesher.ts` の `buildProps()` が**必ず不透明側のジオメトリに積む**ので、
 * `translucent: true` を書いても黙って無視されます（`rules/meshing-render.md`）。
 */
export const NETHER_PORTAL = 49;

/**
 * エンドストーン。**エンドの島の地面**（`endgen.ts`）で、オーバーワールドにもネザーにも湧かない。
 *
 * 硬さは Minecraft と同じ 3.0 で、**石（1.5）の倍**。ツルハシが要る（`minTier: TIER_WOOD`）。
 * 島は虚空に浮いているので、**ここが柔らかいと足元を掘り抜いて奈落に落ちる**のが
 * あっけなくなる —— 硬さそのものが「気軽に掘る場所ではない」という合図になっている。
 */
export const END_STONE = 50;

/**
 * エンドポータルの枠。**12 個を輪にして並べ、全部にエンダーアイを嵌めると起動する**
 * （嵌める操作そのものは TASKS 2-9。ここが持つのは形と状態だけ）。
 *
 * **壊せない**（`hardness` が無限）。クリア導線の唯一の出口なので、掘れると
 * 「起動させる前に枠を壊して詰む」が作れてしまう。Minecraft も壊せない。
 *
 * 状態は **向き 4 x エンダーアイの有無 2 = 8 通り**で、番号は階段・ベッドと同じ
 * `向きの添字 * 2 + もう 1 ビット`（もう 1 ビットの意味は「アイが嵌まっているか」）。
 * 大元（+X 向き・アイ無し）だけが 1..63 に居て、残り 7 個は 64 以降。
 *
 * **向きはまだ見た目に出ません**（4 向きとも同じ形・同じ色で、`BlockDef` は
 * 面ごとに 3 色しか持てない）。それでも持たせてあるのは、**輪の向きが正しいか**を
 * 建てた側の外から確かめられるようにするため（`test/stronghold.test.ts`）で、
 * ID を先に取っておかないと**あとから足すときに振り直しになる**（セーブが化ける）。
 */
export const END_PORTAL_FRAME = 51;

/**
 * エンドポータルの面。**枠 12 個すべてにエンダーアイを嵌めると、輪の内側 3x3 に
 * これが現れる**（起動の規則は `endportal.ts`）。
 *
 * ネザーポータルと違って**縦ではなく横に寝ている**ので、向きは 1 つしか要らない
 * （落ちて入る形。Minecraft と同じ）。**通り抜けられる**（`solid: false`）ので、
 * 起動したら踏み抜けます。
 *
 * **壊せない**（`hardness` が無限）。枠と同じ理由で、起動したあとに消せると
 * 「アイを 12 個使い切ったのに入れない」が作れてしまう。
 */
export const END_PORTAL = 52;

/**
 * 石レンガ。**要塞（`stronghold.ts`）の材料**で、地形には湧かない
 * （ネザーレンガがネザー要塞専用なのと同じ）。
 *
 * 硬さは丸石と同じ 2.0。**石（1.5）より硬い**ので、要塞の壁を掘り抜くより
 * 通路を歩いたほうが速い ——「建物である」ことが手で分かる差。
 */
export const STONE_BRICK = 53;

/**
 * エンドクリスタル。**エンドの黒曜石の柱の上に 1 個ずつ載る**
 * （居場所は `endgen.ts` の `CRYSTAL_SPOTS`、生き死には `crystals.ts`）。
 *
 * **モブでも独立した器でもなく、ブロックにしてある。** 理由は 2 つとも
 * 「壊せる」という一点に効く:
 *
 * - **壊した記録が `edits` に乗る** —— モブは保存しないので、モブ側に載せると
 *   壊したクリスタルが読み込み直しで生き返る（ドラゴンの回復がそのぶん戻る）
 * - **当たり判定が要らない** —— 掘るのも飛び道具（`projectiles.onHitBlock`）も
 *   もともとブロックに当たる。新しい `*render.ts` も 1 つも増えない
 *
 * **`solid: true` でなければ飛び道具が素通りする**（`collisionBoxes()` が
 * `solid` でないブロックに空の箱を返す）。矢で壊せることが要るので、ここは真。
 *
 * **すぐ壊せる（硬さ 0.2・素手）が、何も落ちない**（`items.ts` の `DROPS`）。
 * Minecraft では当たった瞬間に爆発して消えるので、それに寄せてある
 * （爆発そのものはまだ無い）。
 */
export const END_CRYSTAL = 54;

/**
 * ネザーレンガと石レンガのハーフ。**大元（下付き）だけが 1..63 の凍結した帯の残りを取る**
 * ——「アイテムとして持てるブロック」なので、アイテム ID と同じ番号でないと置けない。
 *
 * **上付きは 64..110 ではなく共有帯（166 / 167）** —— あの帯はもう満杯で凍結してある
 * （下の「ブロック ID の枠」）。`variantOf` があるのでアイテムは作られず、
 * 共有帯でもアイテムの番号と衝突しない。
 */
export const NETHER_BRICK_SLAB = 55;
export const STONE_BRICK_SLAB = 56;

/**
 * ブロック ID の枠は 3 帯に分かれている。**既存の ID は動かせない**（`localStorage` の
 * `edits` にブロック ID がそのまま入っているので、振り直すと保存済みの世界で
 * 別のブロックに化ける）ので、下の 2 帯は**歴史的な区切りとして凍結**してある。
 *
 * - **1..63（`LOW_BAND_MAX` まで・凍結）**: 立方体と、**アイテムとして持てる**ブロック。
 *   ここはアイテム ID と同じ番号を指す（`items.ts`）。**もう空きは無いものと思うこと。**
 * - **64..110（`VARIANT_BAND_MAX` まで・凍結）**: `variantOf` を持つ向き違い・状態違いだけ。
 *   アイテムを持たない（`items.ts` が `variantOf` のあるものを飛ばす）ので、
 *   同じ番号の**アイテム**（棒 64・鉱物・道具）と数字が重なっていても衝突しない。
 * - **111..255（`SHARED_ID_START` から）**: **ブロックとアイテムで 1 本の番号列。**
 *   立方体でも向き違いでもアイテムでも、次の空き番号を 1 つ取る。
 *   ここで番号を共有しておけば、「ブロック側では空きなのにアイテム側では埋まっている」
 *   という**片側だけ見て取ると壊れる**形を作らずに済む。
 *
 * **立方体が 63 で頭打ちだったのは `encodeFace` が id に 6 ビットしか割いていなかったから**で、
 * いまは 8 ビットある（`mesher.ts`）。天井の 255 はボクセルが `Uint8Array` であること
 * そのものなので、そちらは `Uint16Array` にしない限り動かない。
 *
 * **テストで押さえているのは 3 つ**（`test/blocks.test.ts`）: 全部 255 以下 /
 * 64..110 は `isProp` かつ `variantOf` あり / **111 以降で 1 つの番号を 2 つのものが
 * 取っていない**（ブロックとアイテムの両方を突き合わせる）。
 */
export const MAX_BLOCK_ID = 255;
/** 1..63 の帯の終わり。**アイテム ID と同じ番号**を指す（`items.ts` の `FIRST_NON_BLOCK`）。 */
export const LOW_BAND_MAX = 63;
/** 64..110 の帯の終わり。向き違い・状態違いだけが居る。 */
export const VARIANT_BAND_MAX = 110;
/** ここから上はブロックとアイテムで 1 本の番号列。**新しい番号はここから取ること。** */
export const SHARED_ID_START = VARIANT_BAND_MAX + 1;
const ID_LIMIT = MAX_BLOCK_ID + 1;

/**
 * 耕地。**土か草をクワで耕すとなる**（規則は下の `tilled()`）。
 *
 * **`variantOf: DIRT` にしてあります。** 点火中のかまど（`FURNACE_LIT`）とまったく同じ
 * 仕掛けで、(a) `items.ts` の for が `variantOf !== AIR` を飛ばすので**アイテムが
 * 作られず**（一覧にも持ち物にも出ない）、(b) `dropOf()` の既定が `baseBlock()` なので
 * **掘ると土が 1 個**落ちます。**耕地そのものは手に入りません。**
 */
export const FARMLAND = 116;

/**
 * 小麦の苗。**種を持って耕地を右クリックすると、その上に立つ**（`placing.ts` の
 * `tryPlant()`）。**まだ育ちません** —— 育つ仕掛け（`crops.ts`）は別のタスクです。
 *
 * **`variantOf` を自分自身に向けてあります。** `items.ts` の for は `variantOf !== AIR` を
 * 飛ばすので、これで**アイテムが作られません**（苗を持ち歩いて石の上に置けると、
 * 耕地に植える意味が消えます）。耕地の `variantOf: DIRT` と事情が違うのは、
 * **苗には大元にできる相手が居ない**からです（土でも耕地でもない）。
 *
 * そのぶん `dropOf()` の既定（`baseBlock()`）は**自分自身**を返し、アイテムの無い
 * 番号を落とします。だから**落ちるもの（種 1 個）は `items.ts` の `DROPS` に必ず
 * 1 行書くこと。**
 */
export const WHEAT_CROP = 121;

/**
 * 実った小麦。**苗（`WHEAT_CROP`）が `crops.ts` の `GROW_SECONDS` 秒で差し替わった姿**で、
 * 点火中のかまど（`FURNACE_LIT`）とまったく同じ「状態違いを別のブロック ID で表す」形です。
 *
 * **`variantOf: WHEAT_CROP`**（苗と違って、大元にできる相手が居ます）。だから
 * `items.ts` の for が飛ばして**アイテムも名前も増えません**が、そのぶん `dropOf()` の
 * 既定は**大元＝苗**を返すので、**落ちるもの（小麦 1 個）は `items.ts` の `DROPS` に
 * 必ず 1 行書くこと。** 書き忘れると、実らせても種しか採れません。
 *
 * **段階は 2 つだけ**にしてあります（本家は 8 段階 = ブロック ID 8 個）。
 * 番号は 1 つも戻せないので、色 1 つで「まだか・実ったか」を伝える線に揃えました。
 */
export const WHEAT_CROP_RIPE = 123;

/**
 * 鉱物をしまう立方体（鉄・金・ダイヤ）。**インゴット／ダイヤ 9 個で 1 個、崩すと 9 個**
 * （`crafting.ts` の 6 行）。本家と同じで、**倉庫の枠を 9 分の 1 にするためだけ**にあります。
 *
 * **`variantOf` を書かないこと**（既定の `AIR`）。そのおかげで
 * (a) `items.ts` の for が同じ番号のアイテムを自動で作り（**手で `item({...})` を
 * 足すと二重登録になります**）、(b) `dropOf()` の既定が自分を返すので
 * **掘ると自分が落ちます**（`items.ts` の `DROPS` に 1 行も要りません）。
 *
 * **`sound` も書きません** —— 既定の `"stone"` で通します（金属の音は無く、
 * 足すと `audio.ts` / `sfx.ts` の話になります）。
 */
export const IRON_BLOCK = 135;
export const GOLD_BLOCK = 136;
export const DIAMOND_BLOCK = 137;

/**
 * 赤キノコ・茶キノコ。**草むら（`TALL_GRASS`）とまったく同じ形**（十字の板 2 枚・
 * 通り抜けられる・空の光も止めない・硬さ 0）で、違うのは色と**生える場所**だけです
 * （森と針葉樹林。どれだけ生えるかは `biomes.ts` の `BiomeDef.mushroom`）。
 *
 * **`replaceable: true` を必ず付けること。** 付けないと、`worldgen.ts` の `stampTree()` が
 * `isReplaceable()` を見て葉を置くのをやめるので、**森の木の葉がキノコに弾かれて穴が空きます**
 * （草むらと同じ理由。小麦の苗が `replaceable` を持たないのとは事情が逆です）。
 *
 * **`variantOf` を書かないこと**（既定の `AIR`）。鉱物の立方体（135..137）と同じで、
 * (a) `items.ts` の for が同じ番号のアイテムを自動で作り（手で `item({...})` を足すと
 * 二重登録）、(b) `dropOf()` の既定が自分を返すので**掘ると自分が 1 個落ちます**
 * （`DROPS` に 1 行も要りません）。**`items.ts` の `MAX_ITEM_ID` だけは伸ばすこと。**
 */
export const RED_MUSHROOM = 139;
export const BROWN_MUSHROOM = 140;

/**
 * サトウキビ。**キノコとまったく同じ形の生えもの**（十字の板 2 枚・通り抜けられる・
 * 硬さ 0・`replaceable: true`・`supportFace: FACE_YN`）で、違うのは色と**生える場所**
 * （浜だけ。どれだけ生えるかは `biomes.ts` の `BiomeDef.cane`）と**箱の上端**だけです。
 *
 * **箱は `CANE_BOX`（上端 1）** —— `CROSS_BOX` は上端 0.8 なので、上へ積むと継ぎ目が空きます。
 *
 * **自分の上には自分を積めます**（`stacksOnSelf: true`。18b）。`canSupport()` は `def.solid` と
 * 「面がマスいっぱい」の両方を見るので、**十字の箱はどう書いても支えになれません**
 * （`rules/blocks-shapes.md`）。だから支えの判定は `canSupport()` の**外側**の
 * `supportsBlock()` が持ちます。**`canSupport()` の側をゆるめて通さないこと** ——
 * あれは壁掛けの松明とベッドの足場です。
 *
 * **`replaceable` は付けません**（18a では付いていました）。付いていると `placeSpot()` が
 * 狙ったマス自身を返すので、**上面を狙っても 1 本目に重なって永久に積めません**
 * （`setVoxel` が「同じ値」で false を返す）。外すと法線の側（＝真上）が返るので、
 * `placing.ts` に 1 行も書かずに積めます。**葉より強くなる**ぶん、積んだ列の途中を
 * 木の葉に抜かれて上が浮くこともありません（18a が `replaceable` を付けた理由
 * ——「浜へ張り出した森の葉が欠ける」—— は実測で 0 件でした。`docs/autodev-log.md`）。
 *
 * **`variantOf` を書かないこと**（既定の `AIR`）。キノコ（139 / 140）と同じで、
 * (a) `items.ts` の for が同じ番号のアイテムを自動で作り（手で `item({...})` を足すと
 * 二重登録）、(b) `dropOf()` の既定が自分を返すので**掘ると自分が 1 個落ちます**
 * （`DROPS` に 1 行も要りません）。**`items.ts` の `MAX_ITEM_ID` だけは伸ばすこと。**
 */
export const SUGAR_CANE = 143;

/**
 * 生成でサトウキビが立つ段数の上限（本家と同じ 3）。**手で積む高さに上限はありません**
 * —— 本家も 3 で止まるのは「伸びる」ほうだけです（18c もこの値を見ます）。
 * **`worldgen.ts` に数値を書かないこと**（2 か所に持つと、片方だけ変えたときに
 * 「生成は 4 段なのに伸びるのは 3 段まで」という形で静かに食い違います）。
 */
export const CANE_HEIGHT_MAX = 3;

/**
 * サボテンが立つ段数の上限（本家と同じ 3）。**生成も、置いたぶんが伸びるのも同じ値**を
 * 見ます（37・2026-09-20）。**`treeshape.ts` にリテラルの 3 を書かないこと**
 * （`CANE_HEIGHT_MAX` とまったく同じ理由 —— 2 か所に持つと、片方だけ変えたときに
 * 「生成は 4 段なのに伸びるのは 3 段まで」という形で静かに食い違います）。
 *
 * **手で積む高さに上限はありません** —— 本家も 3 で止まるのは「伸びる」ほうだけです。
 */
export const CACTUS_HEIGHT_MAX = 3;

/**
 * はしご。**壁掛けの松明（`WALL_TORCH_*`）とまったく同じ形**で、違うのは
 * 見た目（`model: "boxes"` の薄い板）と、**床にも天井にも付かない**ところだけです。
 *
 * `LADDER` が大元で、**アイテム 145 もこれ**（`variantOf` を書かないので、
 * ブロック → アイテムの for が同じ番号のアイテムを作ります）。146..148 は
 * `variantOf: LADDER` を持つので**アイテムが作られず**、掘ると `baseBlock()` = 145 が
 * 落ちます（`items.ts` に 0 行）。**`MAX_ITEM_ID` だけは伸ばすこと。**
 *
 * **まだ登れません**（掴まる物理は 19b）。`solid: false` なので通り抜けます。
 *
 * **`replaceable` も `stacksOnSelf` も付けないこと** —— 前者は狙ったマス自身に
 * 置かれてしまい、後者は壁の無い所へ積み上がります。
 */
export const LADDER = 145;
export const LADDER_XN = 146;
export const LADDER_ZP = 147;
export const LADDER_ZN = 148;

/**
 * 本棚。**板 6 + 本 3 で 1 個**（`crafting.ts`）。**普通の立方体**で、形も当たり判定も
 * 石ブロックと同じです（`boxes` も `model` も書きません）。
 *
 * **壊すと本が 3 個だけ**落ちます（`items.ts` の `DROPS` の 1 行。本家と同じで
 * **板 6 個は戻りません**）。だから `variantOf` は既定の `AIR` のまま ——
 * (a) `items.ts` の for が同じ番号のアイテムを自動で作り（**手で `item({...})` を
 * 足すと二重登録**）、(b) 落ちるものだけを `DROPS` で上書きします。
 * **`items.ts` の `MAX_ITEM_ID` は伸ばすこと。**
 *
 * **自然生成しません**（`worldgen.ts` にも `biomes.ts` にも 0 行）。作って置くだけの
 * ブロックなので、**`npm run shot` の既存の場面には 1 枚も写りません** ——
 * はしごと同じ理由で `tools/shot.ts` に `bookshelf` の場面を持っています。
 *
 * **色は上面・下面が木口（`0xd0a878`）、側面が本の背（`0x9c5064`）**です。
 * 一覧に出るのは `itemColor()` が写す **`top` だけ**なので、側面は隔たりの判定に入りません。
 *
 * **エンチャントの話はまだありません**（経験値もエンチャント台も見送り済み）。
 * いまのところ「置ける立方体と、本 3 個の入れ物」でしかありません。
 */
export const BOOKSHELF = 152;

/**
 * クモの巣。**中に居ると動きが鈍り、刃物（剣かシアーズ）で壊すと糸が 1 個**落ちます。
 *
 * **形は草むら・キノコと同じ `model: "cross"` / `CROSS_BOX`** で、`solid: false` なので
 * 体は通り抜けます（鈍るのは速さだけ）。**支えは要りません**（`supportFace` は既定の
 * `NO_SUPPORT`）—— 本家と同じで宙に浮きます。**`replaceable` は付けないこと** ——
 * 付けると、置いた巣の上にブロックを置いた拍子に黙って消えます。
 *
 * **旗は 2 つに割れています。1 つにまとめないこと**（氷やツタは片方だけ要ります）:
 *
 * - **`sticky`（`isSticky()`）** —— 中に居ると鈍る。**どれだけ鈍るかは持ちません**
 *   （`COBWEB_SPEED_SCALE` / `COBWEB_FALL_SPEED` は `player.ts` のもの。`spiky` が
 *   痛さを持たないのとまったく同じ線）
 * - **`bladed`（`isBladed()`）** —— 刃物でだけ落ちる。**`tool: "sword"` と書かないこと** ——
 *   書くと剣がこのブロックの採掘道具になって速く掘れます（`ToolKind` のコメント）。
 *   **何が刃物かは `items.ts` の `isBlade()`**、**どこで効くかは `mining.ts` の
 *   `canHarvest()` の 1 行**です
 *
 * **自然生成しません**（要塞や廃坑に湧かせるのは別の周）。作って置くものでもなく、
 * **手に入るのはクリエイティブの一覧からだけ**です（本家にレシピはありません）。
 */
export const COBWEB = 154;

/**
 * ケーキ。**小麦 3 + 砂糖 2 + 卵 1 + ミルクバケツ 3 の 3x3**（`crafting.ts`）。
 * **まだかじれません** —— 置けるところまでが 24a で、かじる 7 回は 24b の仕事です。
 *
 * **形は `model: "boxes"` の `CAKE_BOX`**（本家と同じ 1/16 の縁・高さ 8/16）。
 * ベッドと同じで **`solid: true`（歩いて乗れる）/ `supportFace: FACE_YN`（床が要る・
 * 床が消えたら壊れる）**で、**`replaceable` も `stacksOnSelf` も `variantOf` も
 * 付けません**（前 2 つは置いたケーキが黙って消える／宙に積み上がる。3 つ目は
 * アイテムが作られなくなる）。
 *
 * **壊すと何も落ちません**（`items.ts` の `DROPS` に `NO_ITEM` の 1 行。ガラスと同じで、
 * **素手でもツルハシでも 0 個**）。本家と同じで、置いたら食べるしかありません。
 *
 * **アイテム 155 は `items.ts` の for が自動で作ります**（`variantOf` が `AIR` なので。
 * 手で `item({...})` を足すと二重登録）。**`MAX_ITEM_ID` だけは伸ばすこと。**
 *
 * **自然生成しません**（`worldgen.ts` にも `biomes.ts` にも 0 行）。だから
 * **`npm run shot` の既存の場面には 1 枚も写りません** —— 本棚・クモの巣と同じ理由で
 * `tools/shot.ts` に `cake` の場面を持っています。
 */
export const CAKE = 155;

/**
 * 氷。**半透明の立方体で、上を歩くと滑り、壊すと水に戻ります。**
 *
 * **普通の立方体です**（`opaque: false` と `translucent: true` 以外は既定のまま。
 * `solid` も `replaceable` も `variantOf` も `supportFace` も持ちません）。
 * **`blocksSky` は書かないこと** —— 既定は `opaque`（false）で、書くと
 * **氷の下の海が真っ暗**になります（凍った海は 25b）。
 *
 * **旗は 2 つに割れています。1 つにまとめないこと**（クモの巣のコメントの逆側）:
 *
 * - **`slippery`（`isSlippery()`）** —— 上に立つと滑る。**どれだけ滑るかは持ちません**
 *   （`ICE_FRICTION` / `ICE_ACCEL_SCALE` は `player.ts` のもの。`sticky` が
 *   どれだけ鈍るかを持たないのとまったく同じ線）。**`sticky` と 1 つにしないこと** ——
 *   氷は鈍らせず滑らせるだけ、クモの巣は滑らせず鈍らせるだけです
 * - **`breaksInto`（`remainsAfterBreak()`）** —— 壊したあとに残るブロック。既定は `AIR` で、
 *   **氷だけが `WATER`**。**どのマスに効くかは `breaking.ts` の `tryBreak()` の
 *   `setVoxel` 1 か所**（`isSlippery()` と同じで、ここは座標を知りません）
 *
 * **壊すと何も落ちません**（`items.ts` の `DROPS` に `NO_ITEM` の 1 行。ガラス・ケーキと
 * 同じで、**素手でもツルハシでも 0 個**）。本家の「シルクタッチでだけ持ち帰れる」は
 * まだ無いので、置いた氷は壊すと水になって消えます。
 *
 * **自然生成しません**（`worldgen.ts` にも `biomes.ts` にも 0 行）—— 凍った海は **25b** で、
 * `biomes.ts` に「凍った海」を 1 つ足す周です。だから**既存の場面には 1 枚も写りません**
 * （本棚・クモの巣・ケーキと同じ理由で `tools/shot.ts` に `ice` の場面を持っています）。
 */
export const ICE = 156;

/**
 * フェンス（26a・置けて跳び越えられないところまで）。**棒 6 本で 2 個**（`crafting.ts`）。
 *
 * **`BlockDef.collision` を持つ唯一のブロックです。** 見た目と狙いの形（`boxes` =
 * `FENCE_BOXES`）は**上端 1.0** なのに、当たり判定（`collision` =
 * `FENCE_COLLISION_BOX`）だけが**マスいっぱい × 高さ 1.5**。本家と同じで、
 * **60fps では跳んでも越えられません**（実測 1.4883 m。**余裕は 0.0117 しか
 * ありません**）。**刻みが粗いと越えられます** —— 跳躍の到達は
 * `9.2²/(2×30) + 9.2×dt/2` なので **dt ≥ 0.0194（およそ 52fps 未満）で 1.5 を超え**、
 * `main.ts` の刻みは 0.05 で頭打ちです（`TUNING.md`。**人が決める話**）。
 *
 * - **`boxes` のほうを 1.5 にしないこと** —— 狙う判定も選択枠も 1.5 になり、
 *   **空中を狙っているのにフェンスに当たります**（`rules/blocks-shapes.md` の 1.）
 * - **当たり判定を柱の太さ（0.25）にしないこと** —— `collisionBoxes()` は座標を
 *   知らないので腕を隣で出し分けられず、柱だけだと**列のあいだを歩いて抜けられます**
 * - **1 マスより高い箱が下から届くように、`physics.ts` の `collides()` が 1 段下も
 *   見ます。** どのブロックが高いかは `isTallCollision()`（表 1 本）で、
 *   **手で旗を書かず `collision` の最大 y > 1 から立てること**
 *
 * **腕は繋がる側だけ描きます**（26b）。相手は `fenceConnects()` の表 1 本
 * （フェンスどうしと、立方体で `solid` かつ `opaque` なもの）で、
 * **`mesher.ts` の `case "fence"` が `FENCE_POST_BOX` / `FENCE_ARMS` を積みます。**
 * **狙う判定と選択枠は 9 箱のまま**なので、繋がっていない側からも狙えます。
 *
 * **`supportFace` を書きません**（本家どおり宙に浮きます）。**`blocksSky` も
 * 書きません**（既定で false。フェンスの下は暗くなりません）。壊すと自分が 1 個
 * （`DROPS` は 0 行 —— 既定が `baseBlock()`）。
 *
 * **アイテム 157 は `items.ts` の for が自動で作ります**（`variantOf` が `AIR` なので。
 * 手で `item({...})` を足すと二重登録）。**`MAX_ITEM_ID` だけは伸ばすこと。**
 *
 * **自然生成しません**（`worldgen.ts` にも `biomes.ts` にも 0 行）—— だから
 * **`npm run shot` の既存の場面には 1 枚も写りません**（本棚・クモの巣・ケーキ・氷と
 * 同じ理由で `tools/shot.ts` に `fence` の場面を持っています）。
 */
export const FENCE = 157;

/**
 * 苗木 2 種（30a・落ちて植わるところまで）。**オークの葉から 5%・トウヒの葉から 5%**
 * で落ち（`items.ts` の `DROPS`）、**土・草・耕地の上にだけ立ちます。**
 *
 * **まだ育ちません**（木になるのは 30b）。`crops.ts` にも `worldgen.ts` にも 0 行なので、
 * 植えた苗木はそのまま残るだけです。
 *
 * **形は小麦の苗（`WHEAT_CROP`）とまったく同じ**（十字の板 2 枚・通り抜けられる・
 * 硬さ 0・`sound: "grass"`・`supportFace: FACE_YN`）で、違うのは 2 つだけ:
 *
 * - **色**（一覧に出るのは `top` だけ。緑は一覧でいちばん混んでいる帯なので、
 *   `test/items.test.ts` がいちばん近い相手との隔たりを出してから判定します）
 * - **`variantOf` を書かない** —— 苗（121）は自分自身に向けているので**アイテムが
 *   作られません**が、苗木は**掘ったら戻ってきてほしい**ので既定の `AIR` のまま。
 *   `items.ts` の for が同じ番号のアイテムを作り、`dropOf()` の既定（`baseBlock()`）が
 *   自分を 1 個落とします（**`DROPS` に 1 行も要りません**）。
 *   **`items.ts` の `MAX_ITEM_ID` だけは伸ばすこと。**
 *
 * **`replaceable` は付けないこと**（苗と同じ理由 —— 植えた苗木の上にブロックを置いた
 * 拍子に黙って消えます）。**`stacksOnSelf` も付けないこと**（苗木の上に苗木は立ちません）。
 *
 * **土の上だけ**は `needsSoil` の表 1 本で、効くのは `supportsBlock()` の 1 行だけです
 * （上の `BlockDef.needsSoil`）。置けない理由の文も `supportHint()` が表から出すので、
 * **「床か壁」のままにしないこと**（嘘になります）。
 *
 * **自然生成しません**（`worldgen.ts` にも `biomes.ts` にも 0 行）。だから
 * **`npm run shot` の既存の場面には 1 枚も写りません** —— 本棚・クモの巣・ケーキ・氷・
 * フェンスと同じ理由で `tools/shot.ts` に `sapling` の場面を持っています。
 */
export const SAPLING = 164;
export const SPRUCE_SAPLING = 165;

/**
 * 粘土（32a）。**海の底にまだら（4x4 の塊）で湧く普通の立方体**で、特別なのは
 * **落とすもの**だけです（`items.ts` の `DROPS` で**粘土玉 4 個**。雪とまったく同じ対）。
 *
 * **そのままでは手に入りません。** 掘ると粘土玉になるので、戻すには
 * **粘土玉 4 個の 2x2**（`crafting.ts`）が必ず対で要ります —— 無いと二度と置けません。
 *
 * **どこに湧くかは `biomes.ts` の `BiomeDef.floorPatch`**（海と凍った海だけ非 null）。
 * **`VEINS` には 1 行も足していません** —— あの表が効くのは `depth > 3`（石の中）で、
 * 海底の砂の下には 1 マスも出ないので、掘り当てられない粘土になります。
 *
 * 音は砂利と同じ粒の音（本家の粘土も砂利と同じ音のグループ）。**`falls` は付けません**
 * （本家の粘土は落ちません。砂・砂利との違いはここだけ）。
 */
export const CLAY = 168;

/**
 * ツタ（34a 壁掛け + 34b 下へ垂れる）。**はしご（145..148）とほぼ同じ
 * 「壁掛け 4 向き」**で、違うのは**色・厚さ（1/16。はしごの 3/16 より薄い）・
 * 硬さ・音**と、**刃物でだけ落ちる（`bladed`）**、**真上のツタにぶら下がれる
 * （`hangsBelow`。34b）**ところです。
 *
 * `VINE` が大元で、**アイテム 183 もこれ**（`variantOf` を書かないので、ブロック →
 * アイテムの for が同じ番号のアイテムを作ります）。184..186 は `variantOf: VINE` を
 * 持つので**アイテムが作られず**、掘ると `baseBlock()` = 183 が落ちます
 * （`items.ts` の `DROPS` に 0 行）。**`MAX_ITEM_ID` だけは伸ばすこと。**
 *
 * **旗は 2 つ**（どちらも表 1 本。数値は 1 つも持ちません）:
 *
 * - **`climbable`（`isClimbable()`）** —— はしごと同じで登れる。
 *   **どれだけ速いかは `player.ts` の `LADDER_CLIMB_SPEED`**
 * - **`bladed`（`isBladed()`）** —— 刃物（剣かシアーズ）でだけ落ちる。
 *   **`tool: "sword"` と書かないこと** —— 書くと剣が採掘道具になって速く掘れます。
 *   **何が刃物かは `items.ts` の `isBlade()`**、効くのは `mining.ts` の
 *   `canHarvest()` の 1 行（どちらも ±0 行）
 *
 * **3 つ目の旗が `hangsBelow`**（34b）—— **真上の同じツタが 2 つ目の支えの候補**に
 * なります（`supportFaces()` が `[壁, FACE_YP]` を返す）。**`replaceable` も
 * `stacksOnSelf` も `needsSoil` も付けないこと** —— `replaceable` は `placeSpot()` が
 * 狙ったマス自身を返して置けなくなり、`stacksOnSelf` は **`supportFace` の向きの
 * 自分**を見るので**真下ではなく横に**伸びます（だから 34b は別の旗で足しました）。
 * **森の葉から自然に生えるのは 34c**（`worldgen.ts` にまだ 1 行もありません）。
 */
export const VINE = 183;
export const VINE_XN = 184;
export const VINE_ZP = 185;
export const VINE_ZN = 186;

/**
 * ネザーレンガのフェンス（41・本家 Beta 1.9）。**2 つ目のフェンス**で、
 * **形も当たり判定も `FENCE`(157) とまったく同じ配列を指します**
 * （`FENCE_BOXES` / `FENCE_COLLISION_BOX`）。**写して 2 本目を作らないこと** ——
 * 数値が 2 か所になると、片方だけ直したときに静かに食い違います。
 *
 * **157 から変えたのは 3 つだけ**:
 *
 * - **色**（一覧に出るのは `top` だけ。下の「色」）
 * - **`tool: "pickaxe"` と `minTier: TIER_WOOD`**（元のネザーレンガ 48 の写し。
 *   **斧ではありません** —— 本家も石の仲間で、**素手では落ちません**）
 * - **`sound` を書かない**（既定が `"stone"`。48 も書いていません）
 *
 * **色は `0x6e3746`。** 素直な写し（48 の `0x392229`）は**一覧で隔たり 0.0**、
 * 少し明るくした `0x4a2b33` でも**ソウルサンド(46) と 17.1** で判定（20）を割ります。
 * 暗い赤紫へ寄せた `0x6e3746` なら**いちばん近いネザーラック(45) から 25.6**
 * （フェンス 157 からは 96.1・ネザーレンガ 48 からは 64.0。`TUNING.md`）。
 *
 * **`mesher.ts` も `fenceConnects()` も `isTallCollision()` も ±0 行です** ——
 * どちらも表 1 本（`model === "fence"` と `collision` の最大 y）に聞くので、
 * **`id === FENCE` の形を書き足さないこと**（157 の上のコメントがそのまま掛かります）。
 *
 * **⚠ 本家では木のフェンスとネザーレンガのフェンスは繋がりませんが、ここでは繋がります。**
 * `fenceConnects()` は「フェンスならどれでも」の表 1 本で、材質の分岐を入れると
 * **`mesher.ts` とテストの表の 2 か所に材質が漏れます**（直すならそれだけで 1 周）。
 *
 * **レシピはネザーレンガ 6 個 → 6 本**（本家 Beta 1.9 と同じ。木のフェンスの
 * 棒 6 → **2 本**を写さないこと）。**ネザーレンガそのもののレシピはありません** ——
 * 要塞から掘るだけです。**自然生成もしません**（`fortress.ts` に 0 行）。
 *
 * **アイテム 187 は `items.ts` の for が自動で作ります**（`variantOf` を書かないので）。
 * **`MAX_ITEM_ID` だけは手で伸ばすこと。**
 */
export const NETHER_BRICK_FENCE = 187;

/**
 * 石炭ブロック（本家 1.6.1）。**石炭 9 個で 1 個、崩すと 9 個**（`crafting.ts` の 2 行）で、
 * **鉱物をしまう立方体（135..137）とまったく同じ形**です —— 倉庫の枠を 9 分の 1 に
 * するためのもの。違うのは **`smelting.ts` の `FUEL` に 1 行ある**ことだけで、
 * **800 秒 = 80 個ぶん**（本家と同じ。石炭 10 個ぶんなので、しまうと 1 個ぶん得になる）。
 *
 * **`variantOf` を書かないこと**（既定の `AIR`）。135..137 と同じで
 * (a) `items.ts` の for が同じ番号のアイテムを作り（**手で `item({...})` を足すと
 * 二重登録**）、(b) `dropOf()` の既定が自分を返すので**掘ると自分が落ちます**
 * （`DROPS` に 1 行も要りません）。**`sound` も書きません**（既定の `"stone"`）。
 *
 * **硬さ 5・ツルハシ・`minTier: TIER_WOOD` は本家の値そのまま** ——
 * 鉄（135）が `TIER_STONE` なのに対しこちらは木で足ります。**素手では 1 個も落ちません。**
 *
 * **上面の色は `0x100f0f`（本家の写しのまま）。** 一覧でいちばん近いのは**石炭(65)
 * `0x23262b` から 40.9**（判定は 20。黒曜石(43) 42.2・石炭鉱石(14) 108.8）。
 * **⚠ 135..137 の「色は材料の色をそのまま写す」を写さないこと** ——
 * 石炭の `0x23262b` を置くと**隔たり 0.0** で落ちます（`TUNING.md`）。
 *
 * **⚠ 側面 `0x070707` と下面 `0x050505` を分けて書いてあるのは、135..137 の 3 つとの
 * 唯一の違いです。** 面ごとの明暗（`FACE_SHADE` の 1.0 / 0.86 / 0.74）は**色に掛け算**
 * なので、`top` 1 色だけだと上面 16 に対して側面が 13〜12 にしかならず、
 * **絵では真っ黒な塊に潰れて立方体に見えません**（2026-09-22 に撮って実測）。
 * **黒曜石(43) が同じ形で 3 面を書き分けています** —— あちらは上面 35 / 側面 23 で
 * 差が 12 あり、絵で角が読めます。ここも側面を下げて**差 10** を作ってあります。
 * **`itemColor()` が写すのは `top` だけ**なので、一覧の隔たり 40.9 は動きません
 * （`rules/blocks-shapes.md` の「一覧に出るのは `top` だけ」）。
 *
 * **自然生成も `SMELTING` も `DROPS` も ±0 行です**（掘って出るのは石炭鉱石 14 だけ）。
 * **アイテム 188 は `items.ts` の for が自動で作ります** —— **`MAX_ITEM_ID` だけは
 * 手で伸ばすこと。**
 */
export const COAL_BLOCK = 188;

/** 上付きハーフ。見た目と当たり判定だけが違うので、大元は下付きのハーフ。 */
export const STONE_SLAB_TOP = 64;
export const COBBLE_SLAB_TOP = 65;
export const PLANK_SLAB_TOP = 66;
export const SANDSTONE_SLAB_TOP = 67;

/**
 * ネザーレンガと石レンガの上付きハーフ。**64..110 が満杯で凍結したあとに足した材質**なので、
 * 上の 4 つと違って共有帯から取っている（大元は 55 / 56）。
 * **`variantOf` があるのでアイテムは作られない** —— だから共有帯でも番号は衝突しない。
 */
export const NETHER_BRICK_SLAB_TOP = 166;
export const STONE_BRICK_SLAB_TOP = 167;

/**
 * 階段の向き違い。材質ごとに 7 個ずつ連番で取る（大元は 1..63 側）。
 * 個別に名前は付けない。引くのは `stairVariant()`（`placedVariant` から）。
 */
const FIRST_STAIR_VARIANT = 68;
const STAIR_VARIANTS_PER_MATERIAL = 7;

/**
 * ベッドの向き違い。**足側 4 向き + 枕側 4 向きで 8 通り**あり、大元（足側・+X）だけが
 * 1..63 に居るので、ここから 7 個を連番で取る。個別に名前は付けない
 * （引くのは `placedVariant()` と `bedPartner()`）。
 */
const FIRST_BED_VARIANT = 96;

/**
 * ネザーポータルの **Z 向き**（面が Z 方向に伸び、薄いのは X）。
 * 大元は `NETHER_PORTAL`（X 向き）なので、アイテムもドロップも名前も増えない。
 */
export const NETHER_PORTAL_Z = 103;

/**
 * エンドポータルの枠の状態違い。**向き 4 x アイの有無 2 で 8 通り**あり、
 * 大元（+X 向き・アイ無し）だけが 1..63 に居るので、ここから 7 個を連番で取る。
 * 個別に名前は付けない（引くのは `endPortalFrame()`）。
 */
const FIRST_FRAME_VARIANT = 104;

/**
 * 道具の種類。**`BlockDef.tool`（掘るのに向いた種類）と `ItemDef.tool` が共有します。**
 *
 * **`"sword"` はどのブロックの適正でもありません**（`BlockDef.tool` に書かないこと）。
 * 書いた瞬間、剣がそのブロックの採掘道具になって速く掘れるようになります ——
 * 剣は「殴るための道具」で、掘る速さは素手と同じ（`ItemDef.tool.speed` が 1）です。
 */
export type ToolKind = "pickaxe" | "axe" | "shovel" | "sword" | "hoe";

/**
 * 音の材質グループ。足音・破壊・設置の音はここから作る（`sfx.ts` の表）。
 * **既定は "stone" なので、柔らかいものには必ず書くこと。**
 * 書き忘れても音が鳴らなくなるわけではなく「石の音がする」ので、
 * `npm test` が全ブロックの割り当てを一覧で出す。
 */
export type SoundGroup =
  | "grass"
  | "dirt"
  | "sand"
  | "stone"
  | "wood"
  | "glass"
  | "snow"
  | "wool"
  | "none";

/**
 * 面の番号。`0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z`（CLAUDE.md の規約）。
 * `lighting.ts` の `OFFSETS` はこの順に並べてあり、テストで一致を確かめている。
 */
export const FACE_XP = 0;
export const FACE_XN = 1;
export const FACE_YP = 2;
export const FACE_YN = 3;
export const FACE_ZP = 4;
export const FACE_ZN = 5;
/** 支えが要らないブロックの `supportFace`。 */
export const NO_SUPPORT = -1;

/** 反対側の面。番号は対で並べてあるので下位ビットを反転するだけ。 */
export function oppositeFace(face: number): number {
  return face ^ 1;
}

/** 軸に平行な単位ベクトルから面番号を求める。 */
export function faceFromNormal(dx: number, dy: number, dz: number): number {
  if (dx !== 0) return dx > 0 ? FACE_XP : FACE_XN;
  if (dy !== 0) return dy > 0 ? FACE_YP : FACE_YN;
  return dz > 0 ? FACE_ZP : FACE_ZN;
}

/**
 * 描き方。"cube" は greedy meshing で統合される 1x1x1 の箱。
 * それ以外（松明など）は統合せず、mesher の専用パスが形を組む。
 *
 * "boxes" は `boxes` に並べた箱をそのまま描く（ハーフ・階段・サボテン）。
 * **見た目と当たり判定が同じ形になる**ので、片方だけ直して食い違うことがない。
 *
 * "fence" だけが**隣のマスを見て形が変わる**（柱は常に、腕は繋がる側だけ）。
 * **`boxes` は 9 箱のまま**で、狙う判定と選択枠は今までどおりそこを引く ——
 * 減らすと**繋がっていない側から狙えなくなる**（見た目だけの話に留めること）。
 */
export type BlockModel = "cube" | "torch" | "boxes" | "cross" | "fence";

/**
 * ブロック 1 個の中の箱 `[x0,y0,z0,x1,y1,z1]` の並び（1 ブロック = 1.0）。
 *
 * これが**そのブロックの形**で、3 つの用途を兼ねる:
 * 狙う判定（`raycast`）・当たり判定（`solid` なブロックだけ）・
 * `model === "boxes"` なら見た目。**1 か所にしておけば食い違わない。**
 */
export type BoxList = readonly (readonly number[])[];

/** 立方体の当たり判定。 */
export const FULL_BOX: BoxList = [[0, 0, 0, 1, 1, 1]];
/** 通り抜けられるブロック（空気・水・松明・草）。 */
const NO_BOX: BoxList = [];
/** ハーフブロックの下半分・上半分。 */
export const SLAB_BOTTOM_BOX: BoxList = [[0, 0, 0, 1, 0.5, 1]];
export const SLAB_TOP_BOX: BoxList = [[0, 0.5, 0, 1, 1, 1]];
/** サボテンは立方体より 1/16 ずつ細い（Minecraft と同じ）。 */
export const CACTUS_BOX: BoxList = [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]];
/**
 * 草むら。`model: "cross"` はこの箱の**中心で板 2 枚を交差させる**ので、
 * 見た目の大きさもここで決まる（狙う判定・選択枠と同じ形になる）。
 */
export const CROSS_BOX: BoxList = [[0.1, 0, 0.1, 0.9, 0.8, 0.9]];
/**
 * サトウキビ。**`CROSS_BOX` と横幅は同じで、上端だけがマスいっぱい（0.8 → 1）。**
 * 草むらや苗と違って**上へ積み上がるもの**なので、上端を 0.8 のままにすると
 * 2 本目を載せたときに**継ぎ目が 0.2 マス空きます**（積めるようにするのは 18b）。
 */
export const CANE_BOX: BoxList = [[0.1, 0, 0.1, 0.9, 1, 0.9]];
/**
 * はしご。**壁に貼り付く厚さ 3/16 の板**（本家と同じ厚み）で、向きごとに 4 つ。
 * 添字ではなく名前で持つのは、`LADDER_BY_SUPPORT` が**支えの面**で引くのに対して
 * こちらは**そのブロックの形**だから（同じ 4 向きでも意味が別）。
 *
 * `[minX,minY,minZ,maxX,maxY,maxZ]` で、**支えのある側に貼り付く** ——
 * `supportFace: FACE_XP`（+X 側に壁）なら板も +X 側の端に寄る。
 */
const LADDER_THICKNESS = 0.1875;
export const LADDER_BOX_XP: BoxList = [[1 - LADDER_THICKNESS, 0, 0, 1, 1, 1]];
export const LADDER_BOX_XN: BoxList = [[0, 0, 0, LADDER_THICKNESS, 1, 1]];
export const LADDER_BOX_ZP: BoxList = [[0, 0, 1 - LADDER_THICKNESS, 1, 1, 1]];
export const LADDER_BOX_ZN: BoxList = [[0, 0, 0, 1, 1, LADDER_THICKNESS]];
/**
 * ツタ。**はしごとまったく同じ持ち方の 4 向き**で、違うのは厚さだけ ——
 * **1/16（本家と同じ）で、はしごの 3/16 より薄い**。
 *
 * **`LADDER_BOX_*` を撒かないこと** —— 厚さが変わったときに片方だけ動いて、
 * 絵でしか気付けない形で食い違う（`LADDER_THICKNESS` と同じで名前で持つ）。
 */
const VINE_THICKNESS = 0.0625;
export const VINE_BOX_XP: BoxList = [[1 - VINE_THICKNESS, 0, 0, 1, 1, 1]];
export const VINE_BOX_XN: BoxList = [[0, 0, 0, VINE_THICKNESS, 1, 1]];
export const VINE_BOX_ZP: BoxList = [[0, 0, 1 - VINE_THICKNESS, 1, 1, 1]];
export const VINE_BOX_ZN: BoxList = [[0, 0, 0, 1, 1, VINE_THICKNESS]];
/**
 * ベッドの高さ。本家と同じ 9/16。**`PLAYER_SIZE.step`（0.6）より低いこと** ——
 * 超えると歩いて乗れなくなり、寝床の縁で跳ばされる。
 * リスポーン位置（ベッドの上に立たせる）でも使うので export してある。
 */
export const BED_HEIGHT = 0.5625;
export const BED_BOX: BoxList = [[0, 0, 0, 1, BED_HEIGHT, 1]];
/**
 * ケーキ。**本家と同じで縁が 1/16 ずつ内側・高さは 8/16**（皿の上に乗っている形）。
 *
 * **`BED_BOX` と違って横も痩せている**ので、サボテン（`CACTUS_BOX`）と同じく
 * **`canSupport()` が通りません**（`box[u] = 0.0625 > 0`）—— 上に松明もベッドも
 * 付きませんが、**`solid: true` なので歩いて乗れます**（0.5 は `STEP_HEIGHT` の
 * 0.6 より低いので、そのまま登れる。ハーフと同じ）。
 *
 * **かじった回数で高さが変わるのは 24b の仕事**です（位置ごとの状態）。
 * **段階をブロック ID で表さないこと** —— 6 個の番号が消えます（`crops.ts` と同じ線）。
 */
export const CAKE_BOX: BoxList = [[0.0625, 0, 0.0625, 0.9375, 0.5, 0.9375]];

/**
 * フェンス（157）の**見た目と狙いの形**。本家と同じ 16 分の 1 刻みで、
 * **柱 1 本 + 腕 4 方向 x 2 段 = 9 個**。上端は柱の 1.0（当たり判定の 1.5 ではない）。
 *
 * 柱は 6/16 角（0.375..0.625）。腕は**柱の外側からマスの端まで**伸ばし、
 * 幅は 0.4375..0.5625（2/16）、高さは下段 0.375..0.5625・上段 0.75..0.9375。
 *
 * **見た目の腕は繋がる側だけ**（26b。`mesher.ts` の `case "fence"` が
 * `FENCE_POST_BOX` と `FENCE_ARMS` から組む）。**この `FENCE_BOXES` は 9 箱のまま**で、
 * **狙う判定（`raycast`）と選択枠が引くのはこちら** —— 腕を減らすと
 * **繋がっていない側から狙えなくなります。**
 * **当たり判定はこれでもなく `FENCE_COLLISION_BOX`**（`BlockDef.collision`）です。
 */
const FENCE_POST = 0.375;
const FENCE_ARM_LOW: readonly number[] = [0.375, 0.5625];
const FENCE_ARM_HIGH: readonly number[] = [0.75, 0.9375];
const FENCE_ARM_HALF: readonly number[] = [0.4375, 0.5625];

/** フェンスの柱（1 箱）。**繋がる相手が 1 つも無くてもこれだけは描く。** */
export const FENCE_POST_BOX: readonly number[] =
  [FENCE_POST, 0, FENCE_POST, 1 - FENCE_POST, 1, 1 - FENCE_POST];

/** 腕 1 方向ぶん。隣のマスは `dx` / `dz`、`boxes` は `[下段, 上段]` の 2 箱。 */
export interface FenceArm {
  readonly dx: number;
  readonly dz: number;
  readonly boxes: BoxList;
}

/** 腕を 1 本作る。**幅は伸びる軸と直交する側**（+X の腕は Z 方向に 2/16）。 */
function fenceArm(dx: number, dz: number, y0: number, y1: number): readonly number[] {
  const [near, far] = [FENCE_ARM_HALF[0], FENCE_ARM_HALF[1]];
  if (dx !== 0) {
    return dx > 0
      ? [1 - FENCE_POST, y0, near, 1, y1, far]
      : [0, y0, near, FENCE_POST, y1, far];
  }
  return dz > 0
    ? [near, y0, 1 - FENCE_POST, far, y1, 1]
    : [near, y0, 0, far, y1, FENCE_POST];
}

/**
 * 腕 4 方向。**並びは `FENCE_BOXES` の +X / -X / +Z / -Z と同じ**
 * （`test/blocks.test.ts` が `shape[0]` を柱として見ている）。
 */
export const FENCE_ARMS: readonly FenceArm[] = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
].map(({ dx, dz }) => ({
  dx,
  dz,
  boxes: [
    fenceArm(dx, dz, FENCE_ARM_LOW[0], FENCE_ARM_LOW[1]),
    fenceArm(dx, dz, FENCE_ARM_HIGH[0], FENCE_ARM_HIGH[1]),
  ],
}));

/** **柱 1 + 下段 4 + 上段 4 の 9 箱**（並びは 26a のまま。値も 1 つも変えていない）。 */
export const FENCE_BOXES: BoxList = [
  FENCE_POST_BOX,
  ...FENCE_ARMS.map((arm) => arm.boxes[0]),
  ...FENCE_ARMS.map((arm) => arm.boxes[1]),
];

/**
 * フェンス（157）の**当たり判定だけ**の形。**マスいっぱい x 高さ 1.5** で、
 * 見た目（`FENCE_BOXES`・上端 1.0）とは**わざと違えてあります**（本家と同じ）。
 *
 * **柱の太さ（0.25）にしないこと** —— `collisionBoxes()` は座標を知らないので
 * 腕を隣で出し分けられず、柱だけだと**フェンスの列のあいだを歩いて抜けられます。**
 * **1.5 は 60fps の跳躍の到達（実測 1.4883 m）より 0.0117 だけ高いだけ**なので、
 * `JUMP_SPEED` / `GRAVITY` を触るなら一緒に見直すこと（`TUNING.md`）。
 */
export const FENCE_COLLISION_BOX: BoxList = [[0, 0, 0, 1, 1.5, 1]];

/** 道具の階層。0 = 素手、1 = 木、2 = 石、3 = 鉄、4 = ダイヤ。 */
export const TIER_HAND = 0;
export const TIER_WOOD = 1;
export const TIER_STONE = 2;
export const TIER_IRON = 3;
export const TIER_DIAMOND = 4;

export interface BlockDef {
  readonly id: number;
  readonly name: string;
  /** top / side / bottom の色（sRGB hex）。 */
  readonly top: number;
  readonly side: number;
  readonly bottom: number;
  /** 光を通さない = 隣接面を隠し、AO を落とす。 */
  readonly opaque: boolean;
  /**
   * 真上から来るスカイライトを止めるか。既定は「不透明なら止める」。
   *
   * ハーフや階段は `opaque: false`（立方体でないブロックの決まり）だが、
   * これを止めないとハーフで葺いた屋根の下が昼のまま明るくなる。
   */
  readonly blocksSky: boolean;
  /** 半透明レイヤーで描く。 */
  readonly translucent: boolean;
  /** プレイヤーが衝突する。 */
  readonly solid: boolean;
  /**
   * ここにブロックを置くと、確認なしに上書きされるか（空気・水・草むら）。
   * **置く側（`main.ts`）と、木の枝葉を書き込む側（`worldgen.ts`）が同じ判定を使う。**
   * 分かれていると「草むらの上に葉が乗らず、木に穴が空く」ような形で静かに壊れる。
   */
  readonly replaceable: boolean;
  readonly alpha: number;
  /** 硬さ。Minecraft と同じ尺度で、素手・適正道具なしなら hardness * 5 秒かかる。 */
  readonly hardness: number;
  /** 採掘が速くなる道具。null なら何で掘っても同じ。 */
  readonly tool: ToolKind | null;
  /** これ未満の階層の道具で掘ると、時間はかかるのに何も落ちない。 */
  readonly minTier: number;
  /** 自分で出す光の量 0..15。0 なら光らない。スカイライトとは別の系統。 */
  readonly emission: number;
  /**
   * 液体（水・溶岩）。**この 1 つで 3 か所の振る舞いが決まる。**
   *
   * - 狙う光線が素通りする（`raycast.ts`）—— だから溶岩湖の向こうを狙うと
   *   **底の石の上に置かれる**。素通りしないと、手前の溶岩そのものが置き場になる
   * - 支えが要るブロック（松明）を差し込めない（`main.ts`）
   * - 頭が浸かるとフォグが掛かる（下の `fog`）
   *
   * **`id === WATER` と書かないこと。** 3 か所に散らすと、液体を足したときに
   * 必ずどれか 1 つを忘れる（実際、溶岩を足したときに 3 つとも忘れていた）。
   */
  readonly liquid: boolean;
  /**
   * 浸かると焼ける液体（溶岩）。**`id === LAVA` と書かないこと** ——
   * 焼けるかどうかを見る場所はプレイヤー・モブ・（この先の）ネザーの生き物と
   * 増えていくので、`liquid` と同じく表 1 本に聞く。
   * どれだけ焼けるかは持たない（数値は `vitals.ts` / `mobs.ts` のもの）。
   */
  readonly hot: boolean;
  /**
   * 支えを失うと下まで落ちて積み直す（砂・砂利）。**`id === SAND` と書かないこと** ——
   * `liquid` / `hot` と同じ表 1 本（`fallsDown()`）に聞く。**どのマスに効くかは
   * `gravity.ts`**（`breaking.ts` / `placing.ts` が書き込んだあとに 1 行呼ぶ）。
   */
  readonly falls: boolean;
  /**
   * 触れているあいだ刺さるブロック（サボテン）。**`id === CACTUS` と書かないこと** ——
   * `liquid` / `hot` / `falls` と同じく表 1 本（`isSpiky()`）に聞く。
   * **どれだけ痛いかは持たない**（数値は `vitals.ts` のもの。`hot` が焼ける量を
   * 持たないのと同じ）。**どのマスに効くかは `player.ts`**（体の箱と重なるマスを
   * `physics.ts` の `bodyTouches()` で走査する）。
   */
  readonly spiky: boolean;
  /**
   * 体が重なっているあいだ登れるブロック（はしご）。**`id === LADDER` と書かないこと** ——
   * `liquid` / `hot` / `falls` / `spiky` と同じく表 1 本（`isClimbable()`）に聞く。
   * ツタや足場を足すときも、ここに旗を 1 つ足すだけで済む形にしてある。
   * **どれだけ速いかは持たない**（`LADDER_CLIMB_SPEED` は `player.ts` のもの）。
   * **どのマスに効くかは `player.ts`**（体の箱と重なるマスを `bodyTouches()` で走査する）。
   */
  readonly climbable: boolean;
  /**
   * 体が重なっているあいだ動きが鈍るブロック（クモの巣）。**`id === COBWEB` と
   * 書かないこと** —— `liquid` / `hot` / `falls` / `spiky` / `climbable` と同じく
   * 表 1 本（`isSticky()`）に聞く。**どれだけ鈍るかは持たない**
   * （`COBWEB_SPEED_SCALE` と `COBWEB_FALL_SPEED` は `player.ts` のもの）。
   * **どのマスに効くかは `player.ts`**（体の箱と重なるマスを `bodyTouches()` で走査する）。
   */
  readonly sticky: boolean;
  /**
   * 刃物（剣・シアーズ）で壊したときだけ落ちるブロック（クモの巣）。
   * **`tool: "sword"` で表さないこと** —— `BlockDef.tool` は「掘るのに向いた種類」の
   * 表なので、書くと剣がそのブロックの採掘道具になって速く掘れる（`ToolKind` の
   * コメント）。**何が刃物かは持たない**（`items.ts` の `isBlade()`）。
   * **`sticky` と 1 つの旗にまとめないこと** —— 氷は鈍らせるだけ、ツタは刃物だけ、と
   * 片方しか要らないものがこの先に来る。
   */
  readonly bladed: boolean;
  /**
   * 上に立つと滑るブロック（氷）。**`id === ICE` と書かないこと** ——
   * `spiky` / `climbable` / `sticky` / `bladed` と同じく表 1 本（`isSlippery()`）に聞く。
   * **どれだけ滑るかは持たない**（`ICE_FRICTION` と `ICE_ACCEL_SCALE` は `player.ts` の
   * もの）。**どのマスに効くかは `player.ts`**（足元のマスを `physics.ts` の
   * `bodyStandsOn()` で走査する。`sticky` が体と重なるマスを見るのとは別の走査）。
   *
   * **`sticky` と 1 つの旗にまとめないこと** —— 氷は滑らせるだけ・クモの巣は
   * 鈍らせるだけで、**片方しか要らないものが両側に居る**（`bladed` のコメントの逆側）。
   */
  readonly slippery: boolean;
  /**
   * 壊したあとにそのマスへ残るブロック。既定は `AIR`（普通は空くだけ）で、
   * **氷だけが `WATER`**。**`id === ICE` と書かないこと** ——
   * 引くのは `remainsAfterBreak()` 1 本で、**どのマスに効くかは `breaking.ts` の
   * `tryBreak()` の `setVoxel` 1 か所**（`autoBreak()` は通らない —— 支えを失って
   * 勝手に壊れるマスを消すのは `world.ts` のほう）。
   */
  readonly breaksInto: number;
  /** 頭が浸かったときのフォグ。液体だけが持つ。 */
  readonly fog: LiquidFog | null;
  /** 足音・破壊・設置の音の材質。既定は "stone"。 */
  readonly sound: SoundGroup;
  readonly model: BlockModel;
  /**
   * ブロックの形。既定は立方体 1 個。当たり判定は `solid` なブロックだけがこれを使う
   * （松明は形を持つが `solid: false` なので通り抜ける）。
   */
  readonly boxes: BoxList;
  /**
   * **当たり判定だけの形。** 既定は `boxes` そのもの（`def()` が入れる）なので、
   * ふつうのブロックは**見た目・狙い・当たりの 3 つが同じ形**のままです
   * （`rules/blocks-shapes.md` の「形は 3 つの用途を兼ねる」）。
   *
   * **書いてよいのはフェンス（157）だけ** —— 見た目と狙いは上端 1.0 なのに
   * 当たり判定だけ 1.5 で、本家と同じ「跳んでも越えられない」を作ります。
   * **`boxes` のほうを 1.5 にしないこと**（狙う判定も選択枠も 1.5 になり、
   * **空中を狙っているのにフェンスに当たります**）。
   *
   * **引くのは `collisionBoxes()` だけ** —— `shapeBoxes()` と `shapeBounds()` は
   * 今までどおり `boxes` を見ます。**`?:` の任意の項目にしないこと** ——
   * 足し忘れが黙って `undefined` になり、そのブロックだけ通り抜けられます。
   * **1 マスより高い箱を持つかどうかは `isTallCollision()`**（この `collision` の
   * 最大 y から立てた表。手で旗を書くと必ず食い違います）。
   */
  readonly collision: BoxList;
  /**
   * 支えとして固いブロックが要る向き（面番号）。`NO_SUPPORT` なら要らない。
   * 床置きの松明は `FACE_YN`（真下）、壁掛けは付いている壁の側。
   * **その向きのブロックが消えたら、このブロックも壊れる**（`world.setVoxel`）。
   */
  readonly supportFace: number;
  /**
   * 自分の上に自分を積めるか（サトウキビ）。**`supportFace` と対で効きます** ——
   * 支えは真下のままで、そこに自分が居てもよくなるだけです。
   *
   * **`canSupport()` の側をゆるめる代わりではありません。** 十字の箱は
   * どう書いても支えになれない（`rules/blocks-shapes.md`）ので、この 1 つを
   * **`canSupport()` の外側**の `supportsBlock()` が見ます。置く側
   * （`World.canPlaceAt`）と壊す側（`World.breakUnsupported`）が**同じ
   * `supportsBlock()` を通すこと** —— 片方だけにすると、積めるのに下を壊しても
   * 上が落ちない形で静かに壊れます。
   */
  readonly stacksOnSelf: boolean;
  /**
   * 真下が「土」でなければ立てないか（苗木）。**`stacksOnSelf` とまったく同じ場所
   * （`supportsBlock()`）で効きます** —— `canSupport()` を通ったうえで、更に土かどうかで
   * 落とすだけです。**`canSupport()` の側を触らないこと**（あれは壁掛けの松明と
   * ベッドの足場で、ゆるめると松明が草むらに刺さります。`rules/blocks-shapes.md`）。
   *
   * `supportsBlock()` は置く側（`World.canPlaceAt`）と壊す側
   * （`World.breakUnsupported`）の両方が通るので、**真下の土を掘れば苗木も勝手に
   * 壊れて落ちます**（1 行で両方が済みます）。
   */
  readonly needsSoil: boolean;
  /**
   * **真上の同じブロックにもぶら下がれるか**（ツタ。34b）。`supportFace` の壁は
   * そのままで、**支えの候補が 2 つになるだけ**です（`supportFaces()` の表が
   * `[supportFace, FACE_YP]` を返し、`canPlaceAt()` は**どれか 1 つ**を満たせば通す）。
   *
   * **`stacksOnSelf` は代わりになりません** —— あちらは `supportFace` の向きの
   * 自分を見るので、`VINE_XN`（壁が -X）に付けると**真下ではなく -X 側**の
   * ツタに付きます（34a の申し送り）。
   *
   * 効くのは `supportsBlock()` の 1 行（**`face === FACE_YN` を必ず見ること** ——
   * 見ないと横のツタにも貼り付きます）と `supportFaces()` の表だけで、
   * **`canSupport()` は 1 文字も触りません**（壁掛けの松明とベッドの足場）。
   */
  readonly hangsBelow: boolean;
  /**
   * 「土」の側か（土・草・耕地）。**`needsSoil` の相手**で、引くのは `isSoil()` だけ。
   * **`id === DIRT || id === GRASS` と書かないこと** —— 土を増やしたときに
   * 片方だけ直し忘れます（`isLiquid()` / `isSpiky()` と同じ表 1 本の形）。
   */
  readonly soil: boolean;
  /**
   * 見た目だけが違う別置き版なら、その大元のブロック。0 なら大元そのもの。
   * アイテムもドロップも名前も大元に揃うので、置き方を増やしても
   * アイテム欄が増えない。
   */
  readonly variantOf: number;
}

/**
 * 液体に頭まで浸かったときのフォグ。**数値をここに置くのは、`main.ts` を配線のままに
 * 保つため**（`main.ts` は「頭がどのブロックの中か」を引いて、この値を貼るだけ）。
 */
export interface LiquidFog {
  readonly color: number;
  readonly near: number;
  readonly far: number;
  /**
   * 昼夜の明るさを掛けるか。**水は掛ける**（夜の水中は暗い）が、
   * **溶岩は掛けない** —— 自分で光っているので、夜に暗くなるとおかしい。
   */
  readonly daylit: boolean;
}

/** 壊せないブロックの硬さ。 */
const UNBREAKABLE = Number.POSITIVE_INFINITY;

/** 松明の明るさ。Minecraft と同じ 14（自分のマスが 14 で、そこから 1 ずつ減る）。 */
export const TORCH_LIGHT = 14;

/**
 * ネザーポータルの明るさ。Minecraft と同じ 11。**松明（14）より暗い**ので、
 * 洞窟の奥に組んだポータルだけでは足元まで照らせない。
 */
export const PORTAL_LIGHT = 11;

/**
 * ポータルの面の厚み。**枠の中心に立てる**ので、前後に 3/8 ずつ空く。
 * 当たり判定は持たない（`solid: false`）が、狙う判定はこの箱で行う。
 */
export const PORTAL_BOX_X: BoxList = [[0, 0, 0.375, 1, 1, 0.625]];
export const PORTAL_BOX_Z: BoxList = [[0.375, 0, 0, 0.625, 1, 1]];

/**
 * エンドポータルの明るさ。Minecraft と同じ 15（溶岩と同じで、これ以上は無い）。
 * **枠より上には何も無いので、起動すると部屋がここだけで明るくなる。**
 */
export const END_PORTAL_LIGHT = 15;

/**
 * 溶岩の明るさ。Minecraft と同じ 15（`MAX_LIGHT` と同じで、これ以上は無い）。
 * **松明より明るい**ので、溶岩の見える洞窟は松明を持たずに歩ける。
 */
export const LAVA_LIGHT = 15;

/** 床置きと壁掛けで共通の見た目と性質。違うのは supportFace と variantOf だけ。 */
const TORCH_COLORS = { top: 0xffd267, side: 0x6f4d2a, bottom: 0x6f4d2a };
const TORCH_OPTS = {
  opaque: false,
  solid: false,
  hardness: 0,
  emission: TORCH_LIGHT,
  model: "torch" as const,
  sound: "wood" as const,
};

/**
 * はしごの 4 向きで共通の見た目と性質。違うのは `boxes` と `supportFace` と
 * `variantOf` だけ（松明の `TORCH_COLORS` / `TORCH_OPTS` と同じ持ち方）。
 *
 * **`blocksSky` を書かないこと** —— 既定は `opaque`（false）なので、
 * はしごを掛けた縦穴の底が昼のまま暗くならずに済む。
 */
const LADDER_COLORS = { top: 0xc9a063, side: 0xa8823f, bottom: 0x8a6a3f };
const LADDER_OPTS = {
  opaque: false,
  solid: false,
  hardness: 0.4,
  tool: "axe" as const,
  sound: "wood" as const,
  model: "boxes" as const,
  // 4 向きが一度にこれを持つ（向き違いも `LADDER_OPTS` を撒いているため）。
  // **`VINE_OPTS` へ撒かないこと** —— ツタは厚さも音も硬さも違い、旗も
  // `bladed` が 1 つ多い（2026-09-17 の 34a で、別の定数として足した）。
  climbable: true,
};

/**
 * ツタの 4 向きで共通の見た目と性質（34a）。**`LADDER_OPTS` とは別の定数**で、
 * 違うのは**硬さ 0.2（はしごの 0.4 より柔らかい）・音（草）・`bladed` の旗**の 3 つ。
 * `boxes` と `supportFace` と `variantOf` だけが向きごとに違うのは、はしごと同じ持ち方。
 *
 * **`blocksSky` を書かないこと**（既定は `opaque` = false）—— 壁に貼っただけの薄い板で
 * 屋根にはならないので、止めても見えるところは変わらず、下のマスが暗くなるだけ損をする。
 *
 * **`tool: "axe"` は「掘る速さ」の表**で、落ちるかどうかは `bladed` の側が決めます
 * （斧で速く掘れるが 1 個も落ちない、が正しい形）。
 */
const VINE_COLORS = { top: 0x306d18, side: 0x2a5e15, bottom: 0x24500f };
const VINE_OPTS = {
  opaque: false,
  solid: false,
  hardness: 0.2,
  tool: "axe" as const,
  sound: "grass" as const,
  model: "boxes" as const,
  climbable: true,
  bladed: true,
  // **真上の同じツタにもぶら下がれる**（34b）。**4 つの `def()` に手で書かず、
  // ここ 1 か所に置くこと** —— 1 向きだけ落とすと、その向きだけ垂れません。
  // 支えの候補が `[壁, FACE_YP]` の 2 つになるだけで、**`supportFace` は壁のまま**。
  hangsBelow: true,
};

function def(
  id: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">> = {},
): BlockDef {
  const opaque = opts.opaque ?? true;
  const solid = opts.solid ?? true;
  // **当たり判定の既定は「形そのもの」。** 一度ここで束ねてから両方に入れるので、
  // `collision` を書かないブロックでは 2 つが必ず同じ配列になる（食い違えない）。
  const boxes = opts.boxes ?? FULL_BOX;
  return {
    id,
    name,
    top: colors.top,
    side: colors.side ?? colors.top,
    bottom: colors.bottom ?? colors.side ?? colors.top,
    opaque,
    blocksSky: opts.blocksSky ?? opaque,
    translucent: opts.translucent ?? false,
    solid,
    replaceable: opts.replaceable ?? false,
    alpha: opts.alpha ?? 1,
    hardness: opts.hardness ?? 0,
    tool: opts.tool ?? null,
    minTier: opts.minTier ?? TIER_HAND,
    liquid: opts.liquid ?? false,
    hot: opts.hot ?? false,
    falls: opts.falls ?? false,
    spiky: opts.spiky ?? false,
    climbable: opts.climbable ?? false,
    sticky: opts.sticky ?? false,
    bladed: opts.bladed ?? false,
    slippery: opts.slippery ?? false,
    breaksInto: opts.breaksInto ?? AIR,
    fog: opts.fog ?? null,
    emission: opts.emission ?? 0,
    sound: opts.sound ?? "stone",
    model: opts.model ?? "cube",
    boxes,
    collision: opts.collision ?? boxes,
    supportFace: opts.supportFace ?? NO_SUPPORT,
    stacksOnSelf: opts.stacksOnSelf ?? false,
    needsSoil: opts.needsSoil ?? false,
    hangsBelow: opts.hangsBelow ?? false,
    soil: opts.soil ?? false,
    variantOf: opts.variantOf ?? AIR,
  };
}

/** ハーフブロックは材質ごとに下付き（大元）と上付き（向き違い）の 2 つ。 */
function slabPair(
  bottomId: number,
  topId: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">>,
): BlockDef[] {
  const shared = {
    ...opts,
    // 立方体でないので opaque は false。ただし屋根として光は止める
    opaque: false,
    blocksSky: true,
    model: "boxes" as const,
  };
  return [
    def(bottomId, name, colors, { ...shared, boxes: SLAB_BOTTOM_BOX }),
    def(topId, name, colors, { ...shared, boxes: SLAB_TOP_BOX, variantOf: bottomId }),
  ];
}

/**
 * 置く向きになれる**水平の 4 面だけ**をこの順に 0..3 へ詰めたもの。
 * **階段とベッドで共有する**（同じ表を 2 か所に書くと、片方だけ並べ替えたときに
 * 「階段は合っているのにベッドだけ向きが逆」という形で静かに壊れる）。
 *
 * 状態の番号はどちらも `向きの添字 * 2 + (もう 1 ビット)` で、**0 が大元**。
 * もう 1 ビットの意味は階段が「上下反転」、ベッドが「枕側」。
 */
const HORIZONTAL_FACINGS: readonly number[] = [FACE_XP, FACE_XN, FACE_ZP, FACE_ZN];
/** 面番号 -> 上の並びでの添字。上下の面は置く向きにならないので -1。 */
const HORIZONTAL_FACING_INDEX = new Int8Array([0, 1, -1, -1, 2, 3]);
/** 水平の向きから、その向きへ 1 マス進むずれ。添字は上の並びと同じ。 */
const HORIZONTAL_STEP: readonly (readonly number[])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const STAIR_STATES = HORIZONTAL_FACINGS.length * 2;
/** `[大元の ID * 8 + 状態]` -> 実際に置くブロック。0 なら階段の大元ではない。 */
const STAIRS_BY_STATE = new Uint8Array(ID_LIMIT * STAIR_STATES);

/**
 * 階段の形。**下半分いっぱいのハーフ＋その上に半分ぶんの段**という 2 個の箱で、
 * `facing` の側が高くなる（歩いてくる人から見て、向こう側が高い）。
 * 上下反転版は y を入れ替えるだけ。
 */
function stairBoxes(facing: number, top: boolean): BoxList {
  const slab = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
  const step = top ? [0, 0, 0, 1, 0.5, 1] : [0, 0.5, 0, 1, 1, 1];
  const axis = facing < FACE_YP ? 0 : 2;
  if ((facing & 1) === 0) step[axis] = 0.5;
  else step[axis + 3] = 0.5;
  return [slab, step];
}

/**
 * 階段 1 材質ぶん（8 個）の定義。大元だけが `base`（1..63）で、
 * 残り 7 個は `firstVariant` から連番の 64 以降。名前もアイテムも大元に寄せる。
 */
function stairSet(
  base: number,
  firstVariant: number,
  name: string,
  colors: { top: number; side?: number; bottom?: number },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">>,
): BlockDef[] {
  const defs: BlockDef[] = [];
  for (let state = 0; state < STAIR_STATES; state++) {
    const id = state === 0 ? base : firstVariant + state - 1;
    STAIRS_BY_STATE[base * STAIR_STATES + state] = id;
    defs.push(
      def(id, name, colors, {
        ...opts,
        // 立方体でないので opaque は false。ただし屋根として空の光は止める（ハーフと同じ）
        opaque: false,
        blocksSky: true,
        model: "boxes",
        boxes: stairBoxes(HORIZONTAL_FACINGS[state >> 1], (state & 1) === 1),
        variantOf: state === 0 ? AIR : base,
      }),
    );
  }
  return defs;
}

/**
 * ベッドの状態の数（足側 4 向き + 枕側 4 向き）。
 * 状態の番号は `向きの添字 * 2 + (枕側 ? 1 : 0)` で、**0 が大元**（足側・+X 向き）。
 */
const BED_STATES = HORIZONTAL_FACINGS.length * 2;
/** `[状態]` -> 実際のブロック ID。大元が 1 個で、残り 7 個は 64 以降。 */
const BEDS_BY_STATE = new Uint8Array(BED_STATES);
/** ブロック ID -> ベッドの状態。ベッドでなければ -1。 */
const BED_STATE_OF = new Int8Array(ID_LIMIT).fill(-1);

/**
 * ベッド 1 台ぶん（8 個）の定義。**足側と枕側で色だけが違う。**
 *
 * 枕側は全部 `variantOf: BED` なので、アイテム・ドロップ・名前は「ベッド」1 つに揃う
 * （壁掛け松明・点火中のかまどとまったく同じ仕掛け）。
 *
 * `supportFace: FACE_YN` にしてあるので、**床が要ることと、床が消えたら壊れることは
 * `world.canPlaceAt` / `breakUnsupported` がそのまま面倒を見る。** 2 マスが揃っている
 * ことだけを `beds.ts` が保つ。
 */
function bedSet(
  foot: { top: number; side?: number; bottom?: number },
  head: { top: number; side?: number; bottom?: number },
): BlockDef[] {
  const shared = {
    hardness: 0.2,
    // 柔らかいので "wool"。書き忘れると石の音がする
    sound: "wool" as const,
    // 立方体でないので opaque は false。**屋根材ではないので blocksSky は既定の false**
    // （止めても見えるところは変わらず、崖の縁で下のマスが暗くなるだけ損をする）
    opaque: false,
    solid: true,
    model: "boxes" as const,
    boxes: BED_BOX,
    supportFace: FACE_YN,
  };
  const defs: BlockDef[] = [];
  for (let state = 0; state < BED_STATES; state++) {
    const id = state === 0 ? BED : FIRST_BED_VARIANT + state - 1;
    BEDS_BY_STATE[state] = id;
    BED_STATE_OF[id] = state;
    defs.push(
      def(id, "ベッド", (state & 1) === 1 ? head : foot, {
        ...shared,
        variantOf: state === 0 ? AIR : BED,
      }),
    );
  }
  return defs;
}

/**
 * エンドポータルの枠の高さ。Minecraft と同じ 13/16。
 * **`STEP_HEIGHT`(0.6) より高いので、歩いて乗り越えられず跳ぶことになる** ——
 * 輪の中へ落ちる形になり、起動した瞬間に踏むのと同じになる。
 */
export const FRAME_HEIGHT = 0.8125;
const FRAME_BOX: BoxList = [[0, 0, 0, 1, FRAME_HEIGHT, 1]];
/**
 * エンドポータルの面。**枠と同じ高さで寝かせる**（`FRAME_HEIGHT` を写さないこと）——
 * 1 にすると、膝までの枠の輪から板だけが飛び出して見える。
 */
const END_PORTAL_BOX: BoxList = [[0, 0, 0, 1, FRAME_HEIGHT, 1]];
/** アイを嵌めた版。**上面の真ん中に小さい箱がひとつ乗るだけ**（形で嵌まったと分かる）。 */
const FRAME_EYE_BOX: BoxList = [
  [0, 0, 0, 1, FRAME_HEIGHT, 1],
  [0.25, FRAME_HEIGHT, 0.25, 0.75, 1, 0.75],
];

/**
 * エンドクリスタルの形。**下すぼまり → 太い胴 → 細い頭**の 3 段で、
 * 軸に平行な箱だけで八面体の輪郭に寄せてある（`model: "boxes"` は箱をそのまま積む）。
 *
 * **1x1x1 にしないこと。** 柱の上面と同じ太さだと、上に何か載っているのか
 * 柱がもう 1 段伸びているのかが遠目に分からない。
 */
const END_CRYSTAL_BOX: BoxList = [
  [0.375, 0, 0.375, 0.625, 0.3125, 0.625],
  [0.1875, 0.3125, 0.1875, 0.8125, 0.6875, 0.8125],
  [0.375, 0.6875, 0.375, 0.625, 1, 0.625],
];

/** 枠の状態の数（向き 4 x アイの有無 2）。番号は `向きの添字 * 2 + (アイ ? 1 : 0)`。 */
const FRAME_STATES = HORIZONTAL_FACINGS.length * 2;
/** `[状態]` -> 実際のブロック ID。大元が 1 個で、残り 7 個は 64 以降。 */
const FRAMES_BY_STATE = new Uint8Array(FRAME_STATES);
/** ブロック ID -> 枠の状態。枠でなければ -1。 */
const FRAME_STATE_OF = new Int8Array(ID_LIMIT).fill(-1);

/**
 * エンドポータルの枠 8 個ぶんの定義。**アイ無しとアイ入りで色と箱だけが違う。**
 *
 * アイ入りは `variantOf: END_PORTAL_FRAME` なので、名前もアイテムもドロップも
 * 「エンドポータル枠」1 つに揃う（壁掛け松明・点火中のかまどと同じ仕掛け）。
 */
function endPortalFrameSet(): BlockDef[] {
  const shared = {
    // 立方体でないので opaque は false。**屋根としては光を止める**（地下の部屋なので
    // 効き目は薄いが、ハーフ・階段と同じ扱いに揃えておく）
    opaque: false,
    blocksSky: true,
    solid: true,
    // **壊せない。** 掘れると、起動する前に枠を壊して詰められる
    hardness: UNBREAKABLE,
    model: "boxes" as const,
  };
  const plain = { top: 0x8f9b74, side: 0x6d7357, bottom: 0x5c6149 };
  // アイを嵌めた側は上面だけ緑に光る色へ（`ENDER_EYE` のアイテム色と同じ）。
  const eyed = { top: 0x3fbf8c, side: 0x6d7357, bottom: 0x5c6149 };

  const defs: BlockDef[] = [];
  for (let state = 0; state < FRAME_STATES; state++) {
    const id = state === 0 ? END_PORTAL_FRAME : FIRST_FRAME_VARIANT + state - 1;
    const eye = (state & 1) === 1;
    FRAMES_BY_STATE[state] = id;
    FRAME_STATE_OF[id] = state;
    defs.push(
      def(id, "エンドポータル枠", eye ? eyed : plain, {
        ...shared,
        boxes: eye ? FRAME_EYE_BOX : FRAME_BOX,
        variantOf: state === 0 ? AIR : END_PORTAL_FRAME,
      }),
    );
  }
  return defs;
}

/** ポータルの 2 向き。形以外はまったく同じなので、1 か所で作る。 */
function portalPair(): BlockDef[] {
  const shared = {
    opaque: false,
    solid: false,
    // 薄い板なので空の光も止めない（草むらと同じ）。
    blocksSky: false,
    hardness: 0,
    emission: PORTAL_LIGHT,
    sound: "glass" as const,
    model: "boxes" as const,
  };
  const colors = { top: 0x8a4fd8, side: 0x6f2fbe, bottom: 0x8a4fd8 };
  return [
    def(NETHER_PORTAL, "ネザーポータル", colors, { ...shared, boxes: PORTAL_BOX_X }),
    def(NETHER_PORTAL_Z, "ネザーポータル", colors, {
      ...shared,
      boxes: PORTAL_BOX_Z,
      variantOf: NETHER_PORTAL,
    }),
  ];
}

export const BLOCKS: readonly BlockDef[] = [
  def(AIR, "Air", { top: 0x000000 }, { opaque: false, solid: false, alpha: 0, replaceable: true, sound: "none" }),
  // **`soil: true` の 3 つ**（草・土と、下の耕地）。苗木がこの上にだけ立つ
  // （`needsSoil` の相手。`isSoil()` が引く表 1 本）。
  def(GRASS, "草", { top: 0x6aa84f, side: 0x7a6444, bottom: 0x6b533a }, { hardness: 0.6, tool: "shovel", sound: "grass", soil: true }),
  def(DIRT, "土", { top: 0x6b533a }, { hardness: 0.5, tool: "shovel", sound: "dirt", soil: true }),
  def(STONE, "石", { top: 0x8a8f96 }, { hardness: 1.5, tool: "pickaxe", minTier: TIER_WOOD }),
  def(COBBLE, "丸石", { top: 0x767b82 }, { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }),
  def(SAND, "砂", { top: 0xd8c99a }, { hardness: 0.5, tool: "shovel", sound: "sand", falls: true }),
  def(
    WATER,
    "水",
    { top: 0x2f6ec4 },
    // 水面より下を光源にしないことで、深いほど暗い水中になる
    {
      opaque: false,
      blocksSky: true,
      translucent: true,
      solid: false,
      replaceable: true,
      sound: "none",
      alpha: 0.72,
      hardness: UNBREAKABLE,
      liquid: true,
      // 22 マス先まで見える。夜は暗くなる（daylit）。
      fog: { color: 0x1b4f8c, near: 0.1, far: 22, daylit: true },
    },
  ),
  def(WOOD, "原木", { top: 0x8a6a3f, side: 0x5f4526 }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(LEAVES, "葉", { top: 0x3f7a3a }, { hardness: 0.2, sound: "grass" }),
  def(SNOW, "雪", { top: 0xeef3f7, side: 0xdde5ec, bottom: 0x8a8f96 }, { hardness: 0.2, tool: "shovel", sound: "snow" }),
  def(PLANK, "板", { top: 0xb18a56 }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(
    GLASS,
    "ガラス",
    { top: 0xa9d8e8 },
    { opaque: false, translucent: true, alpha: 0.3, hardness: 0.3, sound: "glass" },
  ),
  // **表示名は「レンガブロック」**（32b）。アイテムの「レンガ」（`items.ts` の
  // `BRICK_ITEM` = 170）と一覧で並んで出るので、同じ名前だと 2 つあることが分からない
  // （本家の日本語も「レンガ」と「レンガブロック」で分けてある）。
  // **ID は 12 のまま** —— セーブに入るのは番号なので、名前を変えても既存のセーブは動かない。
  def(BRICK, "レンガブロック", { top: 0xa4553f }, { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD }),
  def(BEDROCK, "岩盤", { top: 0x2b2f35 }, { hardness: UNBREAKABLE }),
  // 鉱石は面ごとに 1 色しか持てないので、石の灰色に鉱石の色を寄せた 1 色で表している
  def(COAL_ORE, "石炭鉱石", { top: 0x4a4d53 }, { hardness: 3, tool: "pickaxe", minTier: TIER_WOOD }),
  def(IRON_ORE, "鉄鉱石", { top: 0xb08a6a }, { hardness: 3, tool: "pickaxe", minTier: TIER_STONE }),
  def(GOLD_ORE, "金鉱石", { top: 0xd8b64a }, { hardness: 3, tool: "pickaxe", minTier: TIER_IRON }),
  def(
    DIAMOND_ORE,
    "ダイヤ鉱石",
    { top: 0x59c8c8 },
    { hardness: 3, tool: "pickaxe", minTier: TIER_IRON },
  ),
  def(
    CRAFTING_TABLE,
    "作業台",
    { top: 0x9a6f3e, side: 0x7d5730, bottom: 0xb18a56 },
    { hardness: 2.5, tool: "axe", sound: "wood" },
  ),
  // top = 炎の色、side = 柄の色。mesher の松明パスがこの 2 色を使い分ける。
  def(TORCH, "松明", TORCH_COLORS, { ...TORCH_OPTS, supportFace: FACE_YN }),
  // 壁掛けの 4 向き。見た目と支えの向きだけが違うので、大元は TORCH。
  def(WALL_TORCH_XP, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_XP,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_XN, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_XN,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_ZP, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_ZP,
    variantOf: TORCH,
  }),
  def(WALL_TORCH_ZN, "松明", TORCH_COLORS, {
    ...TORCH_OPTS,
    supportFace: FACE_ZN,
    variantOf: TORCH,
  }),
  def(SANDSTONE, "砂岩", { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 }, {
    hardness: 0.8,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  def(SPRUCE_WOOD, "トウヒの原木", { top: 0x6b4f33, side: 0x3f2d1c }, { hardness: 2, tool: "axe", sound: "wood" }),
  def(SPRUCE_LEAVES, "トウヒの葉", { top: 0x2c5c3a }, { hardness: 0.2, sound: "grass" }),
  // 立方体より少し細いので、松明と同じ専用パスで描く。
  // opaque を true にすると、細いぶん隣の面が消えて地面が透けて見える。
  def(CACTUS, "サボテン", { top: 0x5c9b47, side: 0x4e8b3c, bottom: 0x3f7331 }, {
    opaque: false,
    hardness: 0.4,
    sound: "grass",
    model: "boxes",
    boxes: CACTUS_BOX,
    supportFace: FACE_YN,
    // 触れているあいだ刺さる。**上に立つぶんは痛くない**（箱の上面を削ると
    // 積んだサボテンの継ぎ目に出るので、そこは本家と違えてある。`TUNING.md`）
    spiky: true,
    // **自分の上には自分を積める**（37。サトウキビ = 18b とまったく同じ 1 行）。
    // ここが無いと `supportsBlock(CACTUS, FACE_YP, CACTUS)` が false のままで、
    // **`crops.ts` が伸ばそうとした `setVoxel` が `canPlaceAt()` に黙って落とされます。**
    // **`canSupport()` の側は触らないこと** —— サボテンの箱は 1/16 細いので
    // 「上面が端まで埋まっている」を満たせず（`test/blocks.test.ts` の
    // 「サボテンは細いので支えにならない」）、あれは松明とベッドの足場です。
    // **`replaceable` も付けないこと**（付けると `placeSpot()` が狙ったマス自身を
    // 返して永久に積めません。`rules/blocks-shapes.md`）。
    stacksOnSelf: true,
  }),

  // 草むら。通り抜けられて、上にブロックを置けば消える（Minecraft と同じ）。
  // 立方体でないので opaque: false、薄いので空の光も止めない（blocksSky も false）。
  def(TALL_GRASS, "草むら", { top: 0x5e9c41 }, {
    opaque: false,
    solid: false,
    replaceable: true,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
  }),

  // 羊のドロップ。柔らかいので sound は "wool"（書き忘れると石の音がする）。
  def(WOOL, "羊毛", { top: 0xe8e4dc, side: 0xe2ded5, bottom: 0xd8d3c9 }, {
    hardness: 0.8,
    sound: "wool",
  }),

  // かまど。上面に石の縁、側面が焚口。点火中は側面を炎の色にして emission を持たせる。
  // **色を変えるだけで済むのは、面ごとに色を持てる（top / side / bottom）から。**
  def(FURNACE, "かまど", { top: 0x74736e, side: 0x5d5c58, bottom: 0x6a6964 }, {
    hardness: 3.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  def(FURNACE_LIT, "かまど", { top: 0x74736e, side: 0xd8863a, bottom: 0x6a6964 }, {
    hardness: 3.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
    // 松明（14）より少し暗い。かまどだけで洞窟を照らし切らない程度。
    emission: 13,
    variantOf: FURNACE,
  }),

  // チェスト。木なので斧が適正で、音も "wood"（既定の "stone" のままだと
  // 木の箱から石の音がする）。上面だけ留め金の色を明るくして、向きが無くても
  // 「上から開ける物」に見えるようにしてある。
  def(CHEST, "チェスト", { top: 0xa9803f, side: 0x8a6631, bottom: 0x6f5227 }, {
    hardness: 2.5,
    tool: "axe",
    sound: "wood",
  }),

  // ベッド。足側は赤い布に木の縁、枕側は白。**上面の色で足と枕を見分ける**ので、
  // 側面もそれぞれに寄せてある（上から見ても横から見ても向きが分かる）。
  ...bedSet(
    { top: 0xa8322c, side: 0x8c2a25, bottom: 0x8a6a3f },
    { top: 0xecebe4, side: 0xd8d5cb, bottom: 0x8a6a3f },
  ),

  // ハーフブロック。硬さと道具は元の材質に合わせる。
  ...slabPair(STONE_SLAB, STONE_SLAB_TOP, "石ハーフ", { top: 0x8a8f96 }, {
    hardness: 1.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...slabPair(COBBLE_SLAB, COBBLE_SLAB_TOP, "丸石ハーフ", { top: 0x767b82 }, {
    hardness: 2,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...slabPair(PLANK_SLAB, PLANK_SLAB_TOP, "板ハーフ", { top: 0xb18a56 }, {
    hardness: 2,
    tool: "axe",
    sound: "wood",
  }),
  ...slabPair(
    SANDSTONE_SLAB,
    SANDSTONE_SLAB_TOP,
    "砂岩ハーフ",
    { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 },
    { hardness: 0.8, tool: "pickaxe", minTier: TIER_WOOD },
  ),
  // **色も硬さも道具も元の材質の写し**（ネザーレンガ 48 / 石レンガ 53）。
  // ずらすと、同じ材質で建てた壁と屋根で色が食い違う。
  ...slabPair(
    NETHER_BRICK_SLAB,
    NETHER_BRICK_SLAB_TOP,
    "ネザーレンガハーフ",
    { top: 0x392229, side: 0x2f1c22, bottom: 0x27171d },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),
  ...slabPair(
    STONE_BRICK_SLAB,
    STONE_BRICK_SLAB_TOP,
    "石レンガハーフ",
    { top: 0x7d8288, side: 0x757a80, bottom: 0x6d7278 },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),

  // 階段。硬さと道具はハーフと同じで元の材質に合わせる。
  ...stairSet(STONE_STAIRS, FIRST_STAIR_VARIANT, "石の階段", { top: 0x8a8f96 }, {
    hardness: 1.5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),
  ...stairSet(
    COBBLE_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL,
    "丸石の階段",
    { top: 0x767b82 },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),
  ...stairSet(
    PLANK_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL * 2,
    "板の階段",
    { top: 0xb18a56 },
    { hardness: 2, tool: "axe", sound: "wood" },
  ),
  ...stairSet(
    SANDSTONE_STAIRS,
    FIRST_STAIR_VARIANT + STAIR_VARIANTS_PER_MATERIAL * 3,
    "砂岩の階段",
    { top: 0xd3c193, side: 0xc9b487, bottom: 0xbca877 },
    { hardness: 0.8, tool: "pickaxe", minTier: TIER_WOOD },
  ),

  // 溶岩。水と同じ半透明の液体で、違うのは自分で光ること（`emission`）だけ。
  // 光は昼夜に影響されない系統なので、洞窟の底でも夜でも同じ明るさで照らす。
  def(
    LAVA,
    "溶岩",
    { top: 0xe0601a, side: 0xc24d0f, bottom: 0xa63f0b },
    {
      opaque: false,
      blocksSky: true,
      translucent: true,
      solid: false,
      replaceable: true,
      sound: "none",
      alpha: 0.94,
      hardness: UNBREAKABLE,
      emission: LAVA_LIGHT,
      liquid: true,
      hot: true,
      // **水よりずっと濃く、昼夜で暗くならない。** 溶岩に浸かったことが
      // 画面から分からないと、ダメージだけ食らって理由が分からない。
      fog: { color: 0xd4551a, near: 0.05, far: 2.2, daylit: false },
    },
  ),
  // 黒曜石。**普通の立方体で、特別なのは硬さと階層だけ。**
  def(
    OBSIDIAN,
    "黒曜石",
    { top: 0x231a33, side: 0x1b1428, bottom: 0x140f1e },
    { hardness: 50, tool: "pickaxe", minTier: TIER_DIAMOND },
  ),
  // 砂利。**シャベルで掘る立方体で、特別なのは落とすものだけ**（`items.ts` の `DROPS`）。
  // 音は砂と同じ粒の音にしてある（専用の材質グループは作っていない）。
  def(
    GRAVEL,
    "砂利",
    { top: 0x8d8580, side: 0x847c77, bottom: 0x7b736e },
    { hardness: 0.6, tool: "shovel", sound: "sand", falls: true },
  ),

  // ネザーの 3 つ。**どれも普通の立方体**で、特別なのはグロウストーンが光ることだけ。
  // 地形の作り方は `nethergen.ts`（`rules/worldgen.md` の「ネザー」）。
  def(
    NETHERRACK,
    "ネザーラック",
    { top: 0x7a3230, side: 0x6e2c2a, bottom: 0x5f2523 },
    // **石（1.5）より柔らかい 0.4。** 掘り進んで足場を作る所なので、
    // ここを石と同じにすると往復が苦行になる。
    { hardness: 0.4, tool: "pickaxe" },
  ),
  def(
    SOUL_SAND,
    "ソウルサンド",
    { top: 0x51392c, side: 0x4a3428, bottom: 0x422e24 },
    { hardness: 0.5, tool: "shovel", sound: "sand" },
  ),
  def(
    GLOWSTONE,
    "グロウストーン",
    { top: 0xf6d888, side: 0xe7c46d, bottom: 0xd9b45c },
    // **溶岩と同じ最大の明るさ**（Minecraft も 15）。ネザーの天井がこれで照らされる。
    { hardness: 0.3, tool: "pickaxe", emission: LAVA_LIGHT, sound: "glass" },
  ),
  // ネザー要塞の材料。**地形には湧かない**（`fortress.ts` が建てるときだけ出る）。
  def(
    NETHER_BRICK,
    "ネザーレンガ",
    { top: 0x392229, side: 0x2f1c22, bottom: 0x27171d },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),

  // ネザーポータルの面（X 向き / Z 向き）。**違うのは箱の向きと `variantOf` だけ。**
  // 通り抜けられる（`solid: false`）ので、当たり判定には出てこない。
  // **すぐ壊せる（hardness 0）が、何も落ちない**（`items.ts` の `DROPS`）——
  // 枠を壊したら消える仕組みはまだ無いので、消す手段をひとつ残しておく。
  ...portalPair(),

  // エンドの島の地面（`endgen.ts`）。**普通の立方体**で、特別なのは硬さだけ。
  def(
    END_STONE,
    "エンドストーン",
    { top: 0xdfe1a4, side: 0xd6d89b, bottom: 0xc8ca8d },
    // Minecraft と同じ 3.0（石の倍）。**虚空に浮いた島の床**なので、
    // 掘り抜いて落ちるまでに手間が掛かるほうがよい。
    { hardness: 3, tool: "pickaxe", minTier: TIER_WOOD },
  ),

  // 要塞（`stronghold.ts`）の材料。**地形には湧かない**（ネザーレンガと同じ扱い）。
  def(
    STONE_BRICK,
    "石レンガ",
    { top: 0x7d8288, side: 0x757a80, bottom: 0x6d7278 },
    { hardness: 2, tool: "pickaxe", minTier: TIER_WOOD },
  ),
  // エンドポータルの枠 8 通り（向き 4 x アイの有無 2）。**壊せない。**
  ...endPortalFrameSet(),

  // エンドポータルの面。**枠 12 個にアイが揃うと輪の内側 3x3 に現れる**
  // （規則は `endportal.ts`）。ネザーポータルと違って寝ているので向きは 1 つだけ。
  // **壊せない** —— 消せると、アイを 12 個使い切ったのに入れない状態が作れる。
  def(
    END_PORTAL,
    "エンドポータル",
    { top: 0x2a1d52, side: 0x1a1136, bottom: 0x120b26 },
    {
      opaque: false,
      solid: false,
      // 薄く寝た面なので、屋根としては数えない（ネザーポータルと同じ扱い）。
      blocksSky: false,
      hardness: UNBREAKABLE,
      emission: END_PORTAL_LIGHT,
      sound: "glass",
      model: "boxes",
      boxes: END_PORTAL_BOX,
    },
  ),

  // エンドの柱の上に載るクリスタル（居場所は `endgen.ts` の `CRYSTAL_SPOTS`、
  // 生き死には `crystals.ts`）。**`solid: true` でないと飛び道具が素通りする。**
  // すぐ壊せて何も落ちない（`items.ts` の `DROPS`）。
  def(
    END_CRYSTAL,
    "エンドクリスタル",
    { top: 0xf0e6ff, side: 0xc27ae0, bottom: 0x8a4fb0 },
    {
      opaque: false,
      // 柱の上に載るだけなので、屋根としては数えない（真下は柱そのもの）。
      blocksSky: false,
      hardness: 0.2,
      emission: END_PORTAL_LIGHT,
      sound: "glass",
      model: "boxes",
      boxes: END_CRYSTAL_BOX,
    },
  ),

  // 耕地。**土と同じ音**（柔らかい）で、硬さだけ少し軽くしてある。
  // `variantOf: DIRT` なので、アイテムにならず掘ると土が落ちる（上のコメント）。
  def(
    FARMLAND,
    "耕地",
    { top: 0x59422d, side: 0x6b533a, bottom: 0x6b533a },
    { hardness: 0.6, tool: "shovel", sound: "dirt", variantOf: DIRT, soil: true },
  ),

  // 小麦の苗。草むらとまったく同じ形（十字の板 2 枚・通り抜けられる・空の光も止めない）で、
  // 違うのは 3 つだけ: **`replaceable` を付けない**（上書きして置けると、植えた苗の上に
  // ブロックを置いた拍子に消える）/ **`supportFace: FACE_YN`**（下の耕地を掘ると
  // 一緒に壊れて種が落ちる）/ **`variantOf` が自分自身**（アイテムを作らせない。上のコメント）。
  def(WHEAT_CROP, "小麦の苗", { top: 0x6f8f3f }, {
    opaque: false,
    solid: false,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
    variantOf: WHEAT_CROP,
  }),

  // 実った小麦。**苗とまったく同じ形で、違うのは色と `variantOf` の向き先だけ。**
  // `replaceable` を付けないこと —— 付けると、実った畑の上にブロックを置いた拍子に
  // 収穫できないまま消える（苗と同じ理由）。
  def(WHEAT_CROP_RIPE, "実った小麦", { top: 0xd8c26a }, {
    opaque: false,
    solid: false,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
    variantOf: WHEAT_CROP,
  }),

  // 鉱物をしまう立方体 3 つ（上のコメント）。**色はインゴット・ダイヤのアイテム色を
  // そのまま写してある**ので、一覧で山と立方体が同じ色に並ぶ。硬さと `minTier` は本家の値
  // （鉄と金の `minTier` が食い違うのは本家どおり —— 金は鉄のツルハシが要る）。
  def(IRON_BLOCK, "鉄ブロック", { top: 0xd8d2c8 }, {
    hardness: 5,
    tool: "pickaxe",
    minTier: TIER_STONE,
  }),
  def(GOLD_BLOCK, "金ブロック", { top: 0xf2d15c }, {
    hardness: 3,
    tool: "pickaxe",
    minTier: TIER_IRON,
  }),
  def(DIAMOND_BLOCK, "ダイヤブロック", { top: 0x4fe3d8 }, {
    hardness: 5,
    tool: "pickaxe",
    minTier: TIER_IRON,
  }),

  // キノコ 2 種（上のコメント）。**草むらの定義をそのまま写したもの**で、色だけが違う。
  // 3 つとも `cross` の板 1 枚なので、**色が近いと絵で見分けが付かない**
  // （`test/blocks.test.ts` が草むらを含めた 3 色の隔たりを見張っている）。
  def(RED_MUSHROOM, "赤キノコ", { top: 0xc9403a }, {
    opaque: false,
    solid: false,
    replaceable: true,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
  }),
  def(BROWN_MUSHROOM, "茶キノコ", { top: 0xb5835a }, {
    opaque: false,
    solid: false,
    replaceable: true,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
  }),

  // サトウキビ（上のコメント）。キノコの定義から違うのは 3 つ:
  // **色** / **箱（`CANE_BOX`。上端が 0.8 ではなく 1）** / **積める（`stacksOnSelf`）**。
  // **`replaceable` は付けないこと** —— 付けると `placeSpot()` が狙ったマス自身を
  // 返すので、上面を狙っても 1 本目に重なって永久に積めない（上のコメント）。
  def(SUGAR_CANE, "サトウキビ", { top: 0x9ad14f }, {
    opaque: false,
    solid: false,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CANE_BOX,
    supportFace: FACE_YN,
    stacksOnSelf: true,
  }),

  // はしご（上のコメント）。**壁掛けの松明と同じ形**で、違うのは見た目
  // （`model: "boxes"` の薄い板）と、**床にも天井にも付かない**ところだけ。
  // 大元（145）も向き違い（146..148）も**同じ性質**で、違うのは箱と supportFace。
  def(LADDER, "はしご", LADDER_COLORS, {
    ...LADDER_OPTS,
    boxes: LADDER_BOX_XP,
    supportFace: FACE_XP,
  }),
  def(LADDER_XN, "はしご", LADDER_COLORS, {
    ...LADDER_OPTS,
    boxes: LADDER_BOX_XN,
    supportFace: FACE_XN,
    variantOf: LADDER,
  }),
  def(LADDER_ZP, "はしご", LADDER_COLORS, {
    ...LADDER_OPTS,
    boxes: LADDER_BOX_ZP,
    supportFace: FACE_ZP,
    variantOf: LADDER,
  }),
  def(LADDER_ZN, "はしご", LADDER_COLORS, {
    ...LADDER_OPTS,
    boxes: LADDER_BOX_ZN,
    supportFace: FACE_ZN,
    variantOf: LADDER,
  }),

  // ツタ（上のコメント）。**はしごの 4 行とまったく同じ形**で、違うのは
  // 撒く定数（`VINE_OPTS`）と箱だけ。大元（183）も向き違い（184..186）も同じ性質。
  // **`replaceable` も `stacksOnSelf` も `needsSoil` も書かないこと**（上のコメント）。
  def(VINE, "ツタ", VINE_COLORS, {
    ...VINE_OPTS,
    boxes: VINE_BOX_XP,
    supportFace: FACE_XP,
  }),
  def(VINE_XN, "ツタ", VINE_COLORS, {
    ...VINE_OPTS,
    boxes: VINE_BOX_XN,
    supportFace: FACE_XN,
    variantOf: VINE,
  }),
  def(VINE_ZP, "ツタ", VINE_COLORS, {
    ...VINE_OPTS,
    boxes: VINE_BOX_ZP,
    supportFace: FACE_ZP,
    variantOf: VINE,
  }),
  def(VINE_ZN, "ツタ", VINE_COLORS, {
    ...VINE_OPTS,
    boxes: VINE_BOX_ZN,
    supportFace: FACE_ZN,
    variantOf: VINE,
  }),

  // 本棚（上のコメント）。**鉱物の立方体 3 つとまったく同じ形の定義**で、違うのは
  // 色・硬さ・道具だけ。**`boxes` も `model` も `variantOf` も書かないこと** ——
  // 既定のまま（`opaque` / `solid` が true・`FULL_BOX`・`model: "cube"`）が普通の立方体。
  // `minTier` も既定（`TIER_HAND`）なので**素手でも壊せて、本 3 個が落ちる**。
  def(BOOKSHELF, "本棚", { top: 0xd0a878, side: 0x9c5064, bottom: 0xd0a878 }, {
    hardness: 1.5,
    tool: "axe",
    sound: "wood",
  }),

  // クモの巣（上のコメント）。**キノコの定義から違うのは 4 つ**:
  // **色** / **硬さ（0 ではなく 1.2）** / **旗 2 つ（`sticky` と `bladed`）** /
  // **支えが要らない（`supportFace` を書かない = `NO_SUPPORT`。宙に浮く）**。
  // **`replaceable` は付けないこと**（置いた巣が黙って消える）。
  // **`tool` は書かないこと** —— 刃物かどうかは `bladed` の側で見る。
  def(COBWEB, "クモの巣", { top: 0xc8c8dc }, {
    opaque: false,
    solid: false,
    hardness: 1.2,
    sound: "wool",
    model: "cross",
    boxes: CROSS_BOX,
    sticky: true,
    bladed: true,
  }),

  // ケーキ（上のコメント）。**ベッドの定義から違うのは 3 つ**:
  // **箱（`CAKE_BOX`。横も 1/16 ずつ痩せている）** / **硬さ 0.5** / **向き違いが無い**。
  // **`blocksSky` は既定（`opaque` = false のまま）** —— 屋根材ではないので、
  // 止めても見えるところは変わらず、崖の縁で下のマスが暗くなるだけ損をする（ベッドと同じ）。
  // **`replaceable` も `stacksOnSelf` も `variantOf` も書かないこと**（上のコメント）。
  // **色**: 上面は**生クリームに赤い実が散った平均**（1 面 1 色なので、白と赤が
  // 混ざった薄紅になる）。**素直なクリーム色は使えない** —— 白っぽい一覧が
  // 羊毛・羽根（0xe8e4dc）・卵（0xf7f0e0）・シチュー（0xf0dcb4）で混んでいて、
  // 0xf2ded2 は羊毛から **15.4** しか離れない（判定は 20）。赤みへ寄せて 31.5。
  // **一覧に出るのは `top` だけ**なので、側面（スポンジ）と下面は隔たりに入らない。
  def(CAKE, "ケーキ", { top: 0xffd0e4, side: 0xe8c9a0, bottom: 0xd9b98a }, {
    opaque: false,
    solid: true,
    hardness: 0.5,
    sound: "wool",
    model: "boxes",
    boxes: CAKE_BOX,
    supportFace: FACE_YN,
  }),

  // 氷（上のコメント）。**ガラスの定義から違うのは 4 つ**:
  // **色** / **`alpha` が濃い（0.3 ではなく 0.6。下が透けるが水面ほどは見えない）** /
  // **硬さ 0.5 と `tool: "pickaxe"`（`minTier` は書かない = 木のツルハシで掘れる）** /
  // **旗 2 つ（`slippery` と `breaksInto: WATER`）**。
  // **`blocksSky` は書かないこと**（既定は `opaque` = false。書くと 25b で氷の下の海が真っ暗）。
  // **`solid` も `replaceable` も `variantOf` も `supportFace` も付けないこと**（普通の立方体）。
  // **色**: 一覧に出るのは `top` だけで、いちばん近いのはガラス（0xa9d8e8）。
  // 水色へ寄せて 34.3 離してある（判定は 20。`TUNING.md`）。
  def(ICE, "氷", { top: 0x8fc4f2 }, {
    opaque: false,
    translucent: true,
    alpha: 0.6,
    hardness: 0.5,
    tool: "pickaxe",
    sound: "glass",
    slippery: true,
    breaksInto: WATER,
  }),

  // フェンス（上のコメント）。**ケーキの定義から違うのは 5 つ**:
  // **`model: "fence"`（隣を見て腕を出し分ける唯一の形。26b）** /
  // **箱（`FENCE_BOXES`。柱 1 + 腕 8 の 9 個）** / **`collision` を持つ（当たり判定
  // だけマスいっぱい x 1.5）** / **硬さ 2・斧・木の音** / **支えが要らない
  // （`supportFace` を書かない = `NO_SUPPORT`。宙に浮く）**。
  // **`blocksSky` は書かないこと**（既定は `opaque` = false。本家どおり下は暗くならない）。
  // **`replaceable` も `stacksOnSelf` も `variantOf` も `spiky` も `sticky` も
  // 付けないこと**（置いたフェンスが黙って消える／宙に積み上がる／アイテムが作られない）。
  // **色**: 一覧に出るのは `top` だけで、**板（0xb18a56）は使えない** ——
  // 木の茶色は一覧でいちばん混んでいる帯で、板からは 7.1 しか離れない（判定は 20）。
  // 灰緑へ寄せた `0x988a5e` なら板から 26.2（`TUNING.md`）。
  def(FENCE, "フェンス", { top: 0x988a5e }, {
    opaque: false,
    solid: true,
    hardness: 2,
    tool: "axe",
    sound: "wood",
    model: "fence",
    boxes: FENCE_BOXES,
    collision: FENCE_COLLISION_BOX,
  }),

  // ネザーレンガのフェンス（上のコメント）。**157 の定義から変えたのは 3 つだけ**:
  // **色** / **`tool: "pickaxe"` と `minTier: TIER_WOOD`**（元のネザーレンガ 48 の
  // 写し。**斧ではない**）/ **`sound` を書かない**（既定が `"stone"`。48 も同じ）。
  // **`boxes` と `collision` は 157 と同じ配列を指すこと** —— 写して 2 本目を作ると、
  // 片方だけ直したときに見た目と当たり判定が静かに食い違う。
  // **`blocksSky` / `replaceable` / `stacksOnSelf` / `variantOf` / `supportFace` /
  // `spiky` / `sticky` は 1 つも書かないこと**（157 の上のコメントがそのまま掛かる）。
  // **色**: 素直な写し（48 の 0x392229）は一覧で**隔たり 0.0**、`0x4a2b33` でも
  // ソウルサンド(46) と 17.1 で判定（20）を割る。暗い赤紫へ寄せた `0x6e3746` なら
  // いちばん近いネザーラック(45) から 25.6（`TUNING.md`）。
  def(NETHER_BRICK_FENCE, "ネザーレンガのフェンス", { top: 0x6e3746 }, {
    opaque: false,
    solid: true,
    hardness: 2,
    tool: "pickaxe",
    minTier: TIER_WOOD,
    model: "fence",
    boxes: FENCE_BOXES,
    collision: FENCE_COLLISION_BOX,
  }),

  // 石炭ブロック（上のコメント）。**135..137 の 3 つとまったく同じ並び**で、
  // `opaque` / `solid` / `model` / `sound` は 1 つも書かない（既定の不透明な立方体・石の音）。
  // **色だけは材料の写しにしていない** —— 石炭(65) の `0x23262b` を置くと一覧の
  // 隔たりが 0.0 になるので、上面は本家の写し `0x100f0f` のまま（`TUNING.md`）。
  // **側面と下面を分けて書いてあるのは黒曜石と同じ理由**（上のコメント）。
  def(COAL_BLOCK, "石炭ブロック", { top: 0x100f0f, side: 0x070707, bottom: 0x050505 }, {
    hardness: 5,
    tool: "pickaxe",
    minTier: TIER_WOOD,
  }),

  // 苗木 2 種（上のコメント）。**小麦の苗（`WHEAT_CROP`）の定義をそのまま写したもの**で、
  // 違うのは 3 つだけ: **色** / **`variantOf` を書かない**（書くとアイテムが作られず、
  // 掘っても戻らない）/ **`needsSoil: true`**（土・草・耕地の上にだけ立つ）。
  // **`replaceable` も `stacksOnSelf` も付けないこと**（置いた苗木が黙って消える／
  // 苗木の上に苗木が立つ）。**色**: 緑は一覧でいちばん混んでいる帯
  // （草 0x6aa84f・葉 0x3f7a3a・トウヒの葉 0x2c5c3a・草むら 0x5e9c41・サボテン 0x5c9b47・
  // サトウキビ 0x9ad14f）なので、**明るい黄緑**と**暗い青緑**に振り分けてある
  // （オークはいちばん近い草から 35.0、トウヒは葉から 36.1。互いは 102.6。`TUNING.md`）。
  def(SAPLING, "オークの苗木", { top: 0x7fbf5f }, {
    opaque: false,
    solid: false,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
    needsSoil: true,
  }),
  def(SPRUCE_SAPLING, "トウヒの苗木", { top: 0x2f7f5a }, {
    opaque: false,
    solid: false,
    hardness: 0,
    sound: "grass",
    model: "cross",
    boxes: CROSS_BOX,
    supportFace: FACE_YN,
    needsSoil: true,
  }),

  // 粘土（上のコメント）。**砂利の定義をほぼそのまま写した普通の立方体**で、違うのは
  // 2 つだけ: **色** / **`falls` を書かない**（本家の粘土は落ちません）。
  // **色は測って選んだ値**（灰青の帯はシアーズ 0xa8b8c0・バケツ 0xb0b4bb・糸 0xb8bcc8・
  // 石 0x8a8f96 で混んでいて、素直な 0xa4aab9 は**バケツと 15.7 しか離れません**。
  // 判定は 20 で、この値でいちばん近いのは**シアーズで 26.1**。`test/items.test.ts`）。
  // 落とすものは `items.ts` の `DROPS` の 1 行（粘土玉 4 個）。
  def(CLAY, "粘土", { top: 0x9da3b5 }, { hardness: 0.6, tool: "shovel", sound: "sand" }),
];


/**
 * クリエイティブでホットバーに並ぶブロック。
 * **ホットバーは 9 枠しかないので、ここも 9 個までにすること**（溢れた分は黙って消える）。
 */
export const PALETTE: readonly number[] = [
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  PLANK,
  GLASS,
  CRAFTING_TABLE,
  TORCH,
];

const scratch = new Color();

/** 面ごとの色を線形空間の RGB として引くためのテーブル: [blockId][face][0..2]。 */
const FACE_COLORS = (() => {
  // face 順: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  // 添字はブロック ID そのもの。向き違いの ID は 64 以降に飛ぶので、
  // 表は「定義の個数」ではなく **ID の上限**で確保する（以下の表も同じ）。
  const table = new Float32Array(ID_LIMIT * 6 * 3);
  for (const b of BLOCKS) {
    const hexes = [b.side, b.side, b.top, b.bottom, b.side, b.side];
    for (let f = 0; f < 6; f++) {
      scratch.setHex(hexes[f]);
      const o = (b.id * 6 + f) * 3;
      table[o] = scratch.r;
      table[o + 1] = scratch.g;
      table[o + 2] = scratch.b;
    }
  }
  return table;
})();

export function faceColor(id: number, face: number, out: Float32Array): void {
  const o = (id * 6 + face) * 3;
  out[0] = FACE_COLORS[o];
  out[1] = FACE_COLORS[o + 1];
  out[2] = FACE_COLORS[o + 2];
}

/** UI 用の CSS カラー。 */
export function cssColor(id: number): string {
  return "#" + blockDef(id).top.toString(16).padStart(6, "0");
}

/**
 * 判定は 1 チャンクあたり数万回走るので、オブジェクトのプロパティではなく
 * 添字 1 回で引ける表にしておく。
 */
const OPAQUE = new Uint8Array(ID_LIMIT);
/** 1 = このブロックがあると、その下は「空に露出している」とは見なさない。 */
export const SKY_BLOCKERS = new Uint8Array(ID_LIMIT);
const LIGHT_COST = new Uint8Array(ID_LIMIT);
/** ブロック自身が出す光。列の走査で 1 ボクセルごとに引くので、表にしておく。 */
export const EMISSION = new Uint8Array(ID_LIMIT);
/** 1 = greedy meshing の対象外（専用の形で描く）。 */
const PROP = new Uint8Array(ID_LIMIT);
const SUPPORT_FACE = new Int8Array(ID_LIMIT);
/** 1 = ここに置くと上書きされる（空気・水・草むら）。 */
const REPLACEABLE = new Uint8Array(ID_LIMIT);
/** 1 = 液体。狙う光線が 1 ボクセルごとに引くので表にしておく。 */
const LIQUID = new Uint8Array(ID_LIMIT);
/** 1 = 浸かると焼ける液体。プレイヤーもモブも毎フレーム引く。 */
const HOT = new Uint8Array(ID_LIMIT);
/** 1 = 支えを失うと下まで落ちる（砂・砂利）。どのマスに効くかは `gravity.ts`。 */
const FALLS = new Uint8Array(ID_LIMIT);
/** 1 = 触れていると刺さる（サボテン）。どのマスに効くかは `player.ts`。 */
const SPIKY = new Uint8Array(ID_LIMIT);
/** 1 = 重なっているあいだ登れる（はしご）。どのマスに効くかは `player.ts`。 */
const CLIMBABLE = new Uint8Array(ID_LIMIT);
/** 1 = 重なっているあいだ動きが鈍る（クモの巣）。どのマスに効くかは `player.ts`。 */
const STICKY = new Uint8Array(ID_LIMIT);
/** 1 = 刃物で壊したときだけ落ちる（クモの巣）。引くのは `mining.ts` の `canHarvest()`。 */
const BLADED = new Uint8Array(ID_LIMIT);
/** 1 = 上に立つと滑る（氷）。どのマスに効くかは `player.ts`。 */
const SLIPPERY = new Uint8Array(ID_LIMIT);
/** 壊したあとにそのマスへ残るブロック（既定は空気。氷だけが水）。引くのは `breaking.ts`。 */
const BREAKS_INTO = new Uint8Array(ID_LIMIT);
/** 1 = 自分の上に自分を積める（サトウキビ）。引くのは `supportsBlock()` だけ。 */
const STACKS_ON_SELF = new Uint8Array(ID_LIMIT);
/** 1 = 真下が土でないと立てない（苗木）。引くのは `supportsBlock()` と `supportHint()`。 */
const NEEDS_SOIL = new Uint8Array(ID_LIMIT);
/** 1 = 真上の同じブロックにもぶら下がれる（ツタ）。引くのは `supportFaces()` と `supportsBlock()`。 */
const HANGS_BELOW = new Uint8Array(ID_LIMIT);
/** 1 = 「土」の側（土・草・耕地）。`NEEDS_SOIL` の相手で、引くのは `isSoil()` だけ。 */
const SOIL = new Uint8Array(ID_LIMIT);
/**
 * 1 = 当たり判定が 1 マスより高い（フェンス）。**手で旗を書かず、`collision` の
 * 最大 y > 1 から立てる**（2 か所に書くと必ず食い違う）。引くのは `physics.ts` の
 * `collides()` で、**1 段下の層でここが偽のマスを飛ばす**ため
 * （毎フレーム体ごとに 3 回走るので、箱を回す前にここで弾く）。
 */
const TALL_COLLISION = new Uint8Array(ID_LIMIT);
const VARIANT_OF = new Uint8Array(ID_LIMIT);
/** ID から定義を引く表。ID が飛び飛びなので、BLOCKS の並びとは別に持つ。 */
const BY_ID: BlockDef[] = [];
for (const block of BLOCKS) {
  BY_ID[block.id] = block;
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  SKY_BLOCKERS[block.id] = block.blocksSky ? 1 : 0;
  LIGHT_COST[block.id] = block.id === WATER ? 3 : 1;
  EMISSION[block.id] = block.emission;
  PROP[block.id] = block.model === "cube" ? 0 : 1;
  SUPPORT_FACE[block.id] = block.supportFace;
  REPLACEABLE[block.id] = block.replaceable ? 1 : 0;
  LIQUID[block.id] = block.liquid ? 1 : 0;
  HOT[block.id] = block.hot ? 1 : 0;
  FALLS[block.id] = block.falls ? 1 : 0;
  SPIKY[block.id] = block.spiky ? 1 : 0;
  CLIMBABLE[block.id] = block.climbable ? 1 : 0;
  STICKY[block.id] = block.sticky ? 1 : 0;
  BLADED[block.id] = block.bladed ? 1 : 0;
  SLIPPERY[block.id] = block.slippery ? 1 : 0;
  BREAKS_INTO[block.id] = block.breaksInto;
  STACKS_ON_SELF[block.id] = block.stacksOnSelf ? 1 : 0;
  NEEDS_SOIL[block.id] = block.needsSoil ? 1 : 0;
  HANGS_BELOW[block.id] = block.hangsBelow ? 1 : 0;
  SOIL[block.id] = block.soil ? 1 : 0;
  // **`solid` なブロックだけ**（通り抜けられるブロックの箱は当たり判定に使われない）。
  TALL_COLLISION[block.id] =
    block.solid && block.collision.some((b) => b[4] > 1) ? 1 : 0;
  VARIANT_OF[block.id] = block.variantOf;
}
// 定義の無い ID を引くと undefined が伝播して原因が遠くに出るので、ここで落とす
for (let id = 0; id < ID_LIMIT; id++) {
  if (BY_ID[id]) continue;
  BY_ID[id] = BY_ID[AIR];
}

/** 支えが 1 つも要らないブロックの `supportFaces()`。**毎回新しい配列を作らないこと。** */
const NO_SUPPORT_FACES: readonly number[] = [];
/**
 * 「支えの候補」の表（面番号の配列）。**ふつうは `supportFace` の 1 つだけ**で、
 * **`hangsBelow` のブロック（ツタ）だけが `[壁, FACE_YP]` の 2 つ**を持ちます。
 * 支えの要らないブロックは空の配列（`NO_SUPPORT_FACES`）。
 *
 * **`SUPPORT_FACE` から立てること**（手で 2 本目の表を書くと食い違います。
 * `TALL_COLLISION` を `collision` から立てているのと同じ形）。引くのは
 * `World.canPlaceAt()` / `World.breakUnsupported()` / `Slab.canPlaceAt()` で、
 * **どれか 1 つを満たせば置ける**のがこの表の意味です。
 *
 * **1 フレームに何度も引くので、配列は作り置きして使い回すこと。**
 */
const SUPPORT_FACES: readonly (readonly number[])[] = (() => {
  const table: (readonly number[])[] = [];
  for (let id = 0; id < ID_LIMIT; id++) {
    const faces: number[] = [];
    if (SUPPORT_FACE[id] !== NO_SUPPORT) faces.push(SUPPORT_FACE[id]);
    if (HANGS_BELOW[id] === 1 && SUPPORT_FACE[id] !== FACE_YP) faces.push(FACE_YP);
    table[id] = faces.length === 0 ? NO_SUPPORT_FACES : faces;
  }
  return table;
})();

/**
 * 下付きハーフ → 上付きハーフ。定義から引き出しているので、材質を足しても
 * ここに書き足す必要はない（`slabPair` が対で定義する）。
 */
const SLAB_TOP_BY_BOTTOM = new Uint8Array(ID_LIMIT);
for (const block of BLOCKS) {
  if (block.boxes === SLAB_TOP_BOX && block.variantOf !== AIR) {
    SLAB_TOP_BY_BOTTOM[block.variantOf] = block.id;
  }
}

/** ID から定義を引く。定義の無い ID は空気として扱う。 */
export function blockDef(id: number): BlockDef {
  return BY_ID[id] ?? BY_ID[AIR];
}

/**
 * ブロックの形。狙う判定（`raycast`）と、`model === "boxes"` の見た目に使う。
 * 空気は形を持たない。
 */
export function shapeBoxes(id: number): BoxList {
  return id === AIR ? NO_BOX : blockDef(id).boxes;
}

/**
 * ブロックの形を囲む箱 `[x0,y0,z0,x1,y1,z1]` を `out` に入れる。
 * 選択枠とひび割れの表示に使う（形の無いブロックは立方体として扱う）。
 */
export function shapeBounds(id: number, out: number[]): void {
  const boxes = shapeBoxes(id);
  if (boxes.length === 0) {
    out[0] = out[1] = out[2] = 0;
    out[3] = out[4] = out[5] = 1;
    return;
  }
  out[0] = out[1] = out[2] = 1;
  out[3] = out[4] = out[5] = 0;
  for (const box of boxes) {
    for (let a = 0; a < 3; a++) {
      if (box[a] < out[a]) out[a] = box[a];
      if (box[a + 3] > out[a + 3]) out[a + 3] = box[a + 3];
    }
  }
}

/**
 * 当たり判定の箱。通り抜けられるブロック（水・松明・草）は空。
 *
 * **`boxes` ではなく `collision` を引くこと** —— 既定では同じ配列だが、
 * フェンスだけは見た目（上端 1.0）と当たり判定（1.5）が違う。
 * **`shapeBoxes()` / `shapeBounds()` は今までどおり `boxes`。**
 */
export function collisionBoxes(id: number): BoxList {
  const def = blockDef(id);
  return def.solid ? def.collision : NO_BOX;
}

/**
 * 当たり判定が 1 マスより高いか（フェンス）。**`id === FENCE` と書かないこと** ——
 * `isSlippery()` などと同じ表 1 本（`collision` の最大 y から立てたもの）に聞く。
 *
 * **引くのは `physics.ts` の `collides()` だけ**で、1 段下の層をここで弾く。
 * **走査を全部のブロックへ広げないこと** —— `collides()` は毎フレーム体ごとに
 * 3 回走るので、箱を回す前にこの表 1 回で落とす。
 */
export function isTallCollision(id: number): boolean {
  return TALL_COLLISION[id] === 1;
}

/**
 * フェンスの腕がその隣へ伸びるか（26b）。**繋がるのはフェンスどうしと、
 * 立方体で `solid` かつ `opaque` なブロック**（石・土・葉・板…）だけ。
 *
 * **`id === FENCE` と書かないこと** —— `isTallCollision()` と同じ理由で、
 * 石のフェンスを足したときに 2 か所へ書くことになる。
 *
 * **`mesher.ts` に「どのブロックと繋がるか」を書かないこと。** あちらは
 * この表に聞いて `FENCE_ARMS` の 2 箱を積むだけで、判断はここ 1 か所にある。
 * 繋がる相手を増やすなら**ここと `test/blocks.test.ts` の表を同じ周で**直すこと。
 */
export function fenceConnects(id: number): boolean {
  if (blockModel(id) === "fence") return true;
  // 立方体だけ（ハーフ・階段・松明・草は腕が宙に浮くので繋がない）。
  // ガラス・水・氷は `opaque: false` でここに落ちる。
  const def = blockDef(id);
  return !isProp(id) && def.solid && def.opaque;
}

/**
 * 「支えのある向き」から松明のブロックを選ぶ表。天井（+Y 側に支え）には付かない。
 * 添字は面番号なので、並び順を FACE_* と合わせること。
 */
const TORCH_BY_SUPPORT: readonly number[] = [
  WALL_TORCH_XP,
  WALL_TORCH_XN,
  AIR, // 天井からはぶら下げられない（Minecraft と同じ）
  TORCH,
  WALL_TORCH_ZP,
  WALL_TORCH_ZN,
];

/**
 * 「支えのある向き」からはしごのブロックを選ぶ表。**壁の 4 面だけ** ——
 * 床（真下に支え）にも天井（真上に支え）にも付かない（Minecraft と同じ）。
 *
 * **`TORCH_BY_SUPPORT` を写して書き換えたものではなく、別の表**です
 * （松明は床に立つのではしごとは 1 マス違う。片方を並べ替えたときに
 * もう片方が黙って壊れないよう、共有しないこと）。添字は面番号。
 */
const LADDER_BY_SUPPORT: readonly number[] = [
  LADDER,
  LADDER_XN,
  AIR, // 天井から吊り下げられない
  AIR, // 床には立たない（松明との唯一の違い）
  LADDER_ZP,
  LADDER_ZN,
];

/**
 * 「支えのある向き」からツタのブロックを選ぶ表。**壁の 4 面だけ** ——
 * 床にも「ツタでない天井」にも付かない。
 *
 * **`LADDER_BY_SUPPORT` を写して書き換えたものではなく、別の表**です
 * （松明とはしごを分けてあるのと同じ理由。共有すると、片方を並べ替えたときに
 * もう片方が黙って壊れます）。添字は面番号。
 *
 * **真上のツタにぶら下がるぶん（34b）はこの表には入っていません** ——
 * 天井の欄は `AIR` のままで、**`vineVariant()` が `FACE_YP` だけ表を引かずに
 * 上と同じ向きを写します**（`hangsBelow` の旗と `supportFaces()` の表が相方）。
 */
const VINE_BY_SUPPORT: readonly number[] = [
  VINE,
  VINE_XN,
  AIR, // ツタでない天井には付かない（真上がツタなら `vineVariant()` が写す。34b）
  AIR, // 床には立たない（はしごと同じ）
  VINE_ZP,
  VINE_ZN,
];

export function isOpaque(id: number): boolean {
  return OPAQUE[id] === 1;
}

/** 光がこのブロックを 1 マス進むときの減衰量。不透明ブロックはそもそも通さない。 */
export function lightCost(id: number): number {
  return LIGHT_COST[id];
}

export function blocksSky(id: number): boolean {
  return SKY_BLOCKERS[id] === 1;
}

/** そのブロック自身が出す光の量 0..15。 */
export function blockEmission(id: number): number {
  return EMISSION[id];
}

/**
 * 立方体ではないブロックか。true なら greedy meshing の面マスクには載せず、
 * mesher の専用パスが形を組む。
 */
export function isProp(id: number): boolean {
  return PROP[id] === 1;
}

/**
 * そのマスにブロックを置いたとき、断らずに上書きしてよいか。
 * 空気・水と、草むらのような薄い植物がこれにあたる。
 */
export function isReplaceable(id: number): boolean {
  return REPLACEABLE[id] === 1;
}

/**
 * 液体か（水・溶岩）。**狙う側（`raycast.ts`）と置く側（`main.ts`）と
 * フォグ（`main.ts`）が同じこれを見ること。**
 *
 * 素通りさせるのが肝心で、これが効いていないと**液体の向こうを狙ったときに
 * 手前の液体そのものが置き場になる**（底の地面の上に置かれない）。
 */
export function isLiquid(id: number): boolean {
  return LIQUID[id] === 1;
}

/**
 * 浸かると焼ける液体か（溶岩）。**プレイヤーもモブも同じこれを見ること。**
 * どれだけ焼けるかは持たない —— 数値は `vitals.ts`（プレイヤー）と
 * `mobs.ts`（モブ）がそれぞれ持つ。
 */
export function isHotLiquid(id: number): boolean {
  return HOT[id] === 1;
}

/**
 * 冷たい液体に触れた熱い液体は固まるか。**触れた側（`id`）が何になるかを返し、
 * 何も起きないなら `id` をそのまま返す。**
 *
 * **表に聞くだけで、どちらが水でどちらが溶岩かは書かない**（`id === LAVA` と
 * 書き始めると、液体を足したときに必ず片方を忘れる）。「熱い液体 + 熱くない液体」で
 * 決めているので、あとから冷たい液体が増えてもこの 1 行のままでよい。
 *
 * **この関数は座標を知らない。** どのマスに効くか（置いたマス自身と隣の 6 マス）は
 * `liquids.ts` の仕事で、`main.ts` は呼ぶだけ。
 */
export function quenched(id: number, neighbour: number): number {
  const cools = isLiquid(neighbour) && !isHotLiquid(neighbour);
  return isHotLiquid(id) && cools ? OBSIDIAN : id;
}

/**
 * 土か草をクワで耕すと何になるか。**純粋・座標を知らない**（`quenched()` と同じ形）。
 * 耕せないブロックなら `AIR`（＝耕地にならない）を返す。
 *
 * **上のマスが塞がっていないかは見ない。** どのマスに効くか（上を確かめて書き込む）は
 * `placing.ts` の `tryTill()` の仕事。
 */
export function tilled(id: number): number {
  return id === DIRT || id === GRASS ? FARMLAND : AIR;
}

/**
 * 支えを失うと下まで落ちて積み直すか（砂・砂利）。**`id === SAND` と書かないこと** ——
 * `isLiquid()` / `isHotLiquid()` と同じ表 1 本に聞く。座標は知らない。
 * どのマスに効くかは `gravity.ts` の仕事。
 */
export function fallsDown(id: number): boolean {
  return FALLS[id] === 1;
}

/**
 * 触れているあいだ刺さるか（サボテン）。**`id === CACTUS` と書かないこと** ——
 * `isLiquid()` / `isHotLiquid()` / `fallsDown()` と同じ表 1 本に聞く。座標は知らない。
 * **どのマスに効くか**（体の箱と重なるマス）は `player.ts` が
 * `physics.ts` の `bodyTouches()` で走査する。**どれだけ痛いかは `vitals.ts`。**
 */
export function isSpiky(id: number): boolean {
  return SPIKY[id] === 1;
}

/**
 * 体が重なっているあいだ登れるか（はしご）。**`id === LADDER` と書かないこと** ——
 * `isLiquid()` / `isHotLiquid()` / `fallsDown()` / `isSpiky()` と同じ表 1 本に聞く。
 * 座標は知らない。**どのマスに効くか**（体の箱と重なるマス）は `player.ts` が
 * `physics.ts` の `bodyTouches()` で走査する。**どれだけ速いかも `player.ts`。**
 */
export function isClimbable(id: number): boolean {
  return CLIMBABLE[id] === 1;
}

/**
 * 体が重なっているあいだ動きが鈍るか（クモの巣）。**`id === COBWEB` と書かないこと** ——
 * `isSpiky()` / `isClimbable()` と同じ表 1 本に聞く。座標は知らない。
 * **どのマスに効くか**（体の箱と重なるマス）は `player.ts` が
 * `physics.ts` の `bodyTouches()` で走査する。**どれだけ鈍るかも `player.ts`。**
 */
export function isSticky(id: number): boolean {
  return STICKY[id] === 1;
}

/**
 * 刃物（剣・シアーズ）で壊したときだけ落ちるか（クモの巣）。
 * **`id === COBWEB` と書かないこと** —— `isSpiky()` / `isSticky()` と同じ表 1 本に聞く。
 * **何が刃物かは知らない**（`items.ts` の `isBlade()`）。
 * 引くのは `mining.ts` の `canHarvest()` の 1 行だけ。
 */
export function isBladed(id: number): boolean {
  return BLADED[id] === 1;
}

/**
 * 上に立つと滑るか（氷）。**`id === ICE` と書かないこと** ——
 * `isSpiky()` / `isClimbable()` / `isSticky()` と同じ表 1 本に聞く。座標は知らない。
 * **どのマスに効くか**（足元のマス）は `player.ts` が `physics.ts` の
 * `bodyStandsOn()` で走査する。**どれだけ滑るかも `player.ts`。**
 */
export function isSlippery(id: number): boolean {
  return SLIPPERY[id] === 1;
}

/**
 * そのブロックを壊したあと、マスに残るブロック。既定は `AIR` で、**氷だけが `WATER`**。
 * **`id === ICE` と書かないこと** —— `isSlippery()` と同じ表 1 本に聞く。
 * **どのマスに効くかは `breaking.ts` の `tryBreak()` の `setVoxel` 1 か所**
 * （座標も、そこに何が置けるかも知らない）。
 */
export function remainsAfterBreak(id: number): number {
  return BREAKS_INTO[id];
}

/** 頭がそのブロックの中にあるときのフォグ。液体でなければ null。 */
export function liquidFog(id: number): LiquidFog | null {
  return blockDef(id).fog;
}

export function blockModel(id: number): BlockModel {
  return blockDef(id).model;
}

/** 足音・破壊・設置の音の材質。実際の音作りは `sfx.ts`。 */
export function blockSound(id: number): SoundGroup {
  return blockDef(id).sound;
}

/**
 * 支えが要る向き（面番号）。要らなければ `NO_SUPPORT`。
 * この向きのブロックが `canSupport` でなくなったら、このブロックも壊れる。
 */
export function supportFace(id: number): number {
  return SUPPORT_FACE[id];
}

/**
 * 支えの候補（面番号）。**どれか 1 つを満たせば置ける**ので、置く側
 * （`World.canPlaceAt`）も壊す側（`World.breakUnsupported`）も**この for を回すこと**
 * （`supportFace()` 1 本を見るとツタが真上のツタにぶら下がれません。34b）。
 *
 * ふつうは `supportFace()` の 1 つだけで、**ツタだけが `[壁, FACE_YP]` の 2 つ**。
 * 支えの要らないブロックは空の配列（**`NO_SUPPORT` との比較を呼ぶ側に書かせない**）。
 *
 * **返る配列は作り置きなので、書き換えないこと。**
 */
export function supportFaces(id: number): readonly number[] {
  return SUPPORT_FACES[id];
}

/**
 * 真上の同じブロックにもぶら下がれるか（ツタ）。**`id === VINE` と書かないこと** ——
 * `stacksOnSelf()` / `needsSoil()` と同じで、表 1 本に聞く。
 */
export function hangsBelow(id: number): boolean {
  return HANGS_BELOW[id] === 1;
}

/**
 * 松明を「支えが face の向きにある」場所へ置くときのブロック。置けないなら AIR。
 * 置き方を増やしたいだけなら、ここと TORCH_BY_SUPPORT を触れば済む。
 */
export function torchVariant(face: number): number {
  return TORCH_BY_SUPPORT[face] ?? AIR;
}

/**
 * はしごを「支えが face の向きにある」場所へ置くときのブロック。置けないなら AIR。
 * `torchVariant()` と同じ形だが、**表は別**（上のコメント）。
 */
export function ladderVariant(face: number): number {
  return LADDER_BY_SUPPORT[face] ?? AIR;
}

/**
 * ツタを「支えが face の向きにある」場所へ置くときのブロック。置けないなら AIR。
 * `ladderVariant()` と同じ形だが、**表は別**（上のコメント）。
 *
 * **天井（`FACE_YP`）だけは表を引きません**（34b）—— ツタは**真上のツタ**に
 * ぶら下がれるので、上と**同じ向きをそのまま写します**（壁の無い所で向きを
 * 選び直すと、垂れた列の途中で板の側が入れ替わります）。
 * **`VINE_BY_SUPPORT` の天井の欄は `AIR` のまま**にしてあるので、
 * `supporter` を渡さない呼び方（既定の `AIR`）は今までどおり「天井には付かない」です。
 */
export function vineVariant(face: number, supporter: number = AIR): number {
  if (face === FACE_YP) return baseBlock(supporter) === VINE ? supporter : AIR;
  return VINE_BY_SUPPORT[face] ?? AIR;
}

/**
 * 「どこになら付けられるか」の言い分け。**表から引くこと** ——
 * `base === LADDER` と書くと、置き方を増やしたときに文だけが嘘になります。
 *
 * 見るのは**真下を支えにしたときに置けるか**の 1 点だけ。床に置けないもの
 * （はしご）は「壁」、置けるもの（松明）は今までどおり「床か壁」。
 *
 * **床の種類まで選ぶもの（苗木）は「土か草の上」。** 「床か壁」のままにすると
 * 嘘になる（石の床を狙っても置けない）ので、**ここも表（`needsSoil()`）から出す。**
 */
export function supportHint(base: number): string {
  if (needsSoil(base)) return "土か草の上";
  const onFloor = placedVariant(base, { support: FACE_YN, hitY: 0, facing: FACE_XP });
  return onFloor === AIR ? "壁" : "床か壁";
}

/** 別置き版なら大元のブロック、そうでなければ自分自身。 */
export function baseBlock(id: number): number {
  return VARIANT_OF[id] || id;
}

/**
 * `face` の側が平らに埋まっていて、松明などの支えになれるか。
 *
 * ハーフブロックは形の半分しか無いので、**下付きの上面には松明が付かない**
 * （上付きの上面と、床としての下面には付く）。立方体だけが 6 面とも支えになる。
 */
export function canSupport(id: number, face: number): boolean {
  const def = blockDef(id);
  if (!def.solid) return false;
  const axis = face >> 1;
  const positive = (face & 1) === 0;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  for (const box of def.boxes) {
    // その面がブロックの端まで達していて、面いっぱいに広がっていること
    if (positive ? box[axis + 3] < 1 : box[axis] > 0) continue;
    if (box[u] > 0 || box[u + 3] < 1 || box[v] > 0 || box[v + 3] < 1) continue;
    return true;
  }
  return false;
}

/**
 * 自分の上に自分を積めるブロックか（サトウキビ）。**`id === SUGAR_CANE` と
 * 書かないこと** —— `isLiquid()` / `fallsDown()` / `isSpiky()` と同じ表 1 本に聞く。
 */
export function stacksOnSelf(id: number): boolean {
  return STACKS_ON_SELF[id] === 1;
}

/**
 * 真下が土でないと立てないブロックか（苗木）。**`id === SAPLING` と書かないこと** ——
 * `stacksOnSelf()` と同じで、表 1 本に聞く（苗木を増やしても分岐が増えない）。
 */
export function needsSoil(id: number): boolean {
  return NEEDS_SOIL[id] === 1;
}

/** 苗木が立てる「土」か（土・草・耕地）。**表 1 本**（`needsSoil()` の相手）。 */
export function isSoil(id: number): boolean {
  return SOIL[id] === 1;
}

/**
 * `supporter` は、`face` の側に `id` を置くだけの支えになれるか。
 * **置く側（`World.canPlaceAt`）と壊す側（`World.breakUnsupported`）は必ずこれを通すこと。**
 *
 * ふつうは `canSupport()` そのものだが、**自分の上には自分を置いてよい**という
 * 例外がここに 1 行だけある（サトウキビ）。十字の箱はどう書いても `canSupport()` を
 * 通れない（`rules/blocks-shapes.md`）ので、**あちらをゆるめる代わりに外側で足す** ——
 * `canSupport()` は壁掛けの松明とベッドの足場なので、ゆるめると松明が草むらに刺さる。
 */
export function supportsBlock(supporter: number, face: number, id: number): boolean {
  if (supporter === id && stacksOnSelf(id)) return true;
  // **狭めるほうの例外がもう 1 つ**（苗木）。`canSupport()` を通ったうえで、
  // 土（土・草・耕地）でなければ落とす —— 石でも板でも立ってしまうのを止める。
  // **壊す側もここを通る**ので、真下の土を掘れば苗木も一緒に壊れて落ちる。
  if (needsSoil(id) && !isSoil(supporter)) return false;
  // **広げるほうの例外がもう 1 つ**（ツタ。34b）。真上の同じツタにはぶら下がれる ——
  // **`face` を必ず見ること**（見ないと横のツタにも貼り付いて、空中へ横に伸びます）。
  // `baseBlock()` で比べるのは、向き違い 4 つが混ざった列でもぶら下がれるようにするため。
  if (face === FACE_YN && hangsBelow(id) && baseBlock(supporter) === baseBlock(id)) return true;
  return canSupport(supporter, face);
}

/** 置くときに向きが変わるブロックを決める材料。 */
export interface PlaceContext {
  /** 新しいマスから見て、支えになるブロックがある向き（面番号）。 */
  readonly support: number;
  /** 狙った点の、ブロック内での高さ 0..1。 */
  readonly hitY: number;
  /**
   * 支えになっているブロック（`support` の側の中身）。**省略可**にしてあるのは、
   * **必須にすると `placedVariant()` を呼ぶ既存の呼び出しが全部落ちる**ため
   * （テストに 49 か所あります）。いま見ているのはツタだけで、
   * **真上のツタにぶら下がるときに「上と同じ向き」を写す**のに使います（34b）。
   */
  readonly supporter?: number;
  /** 置く人が向いている水平の向き（面番号）。階段はこちら側が高くなる。 */
  readonly facing: number;
}

/**
 * ハーフ・階段の上下。上の面を叩けば下付き、下の面を叩けば上付き、
 * 横の面なら叩いた高さで決まる。**ハーフと階段で同じ規則にすること**
 * （片方だけ変えると、同じ操作なのに結果が違って混乱する）。
 */
function placedUpper(ctx: PlaceContext): boolean {
  if (ctx.support === FACE_YN) return false;
  if (ctx.support === FACE_YP) return true;
  return ctx.hitY > 0.5;
}

/** 見ている向き（`yaw`）を水平の面番号にまるめる。階段の向きを決めるのに使う。 */
export function faceFromYaw(yaw: number): number {
  // player.ts の前方ベクトルと同じ取り方
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz)
    ? fx > 0
      ? FACE_XP
      : FACE_XN
    : fz > 0
      ? FACE_ZP
      : FACE_ZN;
}

/** 実際に置くマスと、その向きを決める材料。 */
export interface PlaceSpot extends PlaceContext {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** `placeSpot()` に渡す「狙っているもの」。`RaycastHit` がそのまま当てはまる。 */
export interface PlaceAim {
  readonly id: number;
  readonly block: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly point: { readonly y: number };
}

/**
 * 狙っている面から、ブロックを置くマスと向きを決める。
 *
 * ふつうは狙ったブロックの隣（法線の側）だが、**草むらのように押しのけられる
 * ブロックを狙ったときは、そのマス自身に置く。** 隣に置くと、草が残ったまま
 * 横にブロックが生える。
 *
 * **判定はここに集約すること**（`main.ts` に書くと DOM 込みでしか確かめられない）。
 */
export function placeSpot(aim: PlaceAim, facing: number): PlaceSpot {
  if (isReplaceable(aim.id)) {
    // 支えは真下（草が生えていた地面）。狙った面をそのまま支えにすると、
    // 横から狙ったときに何も無い側を支えにしてしまう。
    return {
      x: aim.block.x,
      y: aim.block.y,
      z: aim.block.z,
      support: FACE_YN,
      hitY: 0,
      // **真下の中身は `PlaceAim` に入っていない**（`placeSpot()` は世界を読まない）。
      // 草むらを狙ったときの支えは地面なので、ツタの「上と同じ向き」には要らない。
      supporter: AIR,
      facing,
    };
  }
  return {
    x: aim.block.x + aim.normal.x,
    y: aim.block.y + aim.normal.y,
    z: aim.block.z + aim.normal.z,
    // 狙ったブロックは新しいマスから見て法線の逆側にある
    support: faceFromNormal(-aim.normal.x, -aim.normal.y, -aim.normal.z),
    hitY: aim.point.y - Math.floor(aim.point.y),
    // **狙ったブロックがそのまま支え**（隣に置くので、法線の逆側 = 狙ったマス）。
    supporter: aim.id,
    facing,
  };
}

/**
 * 置き方で見た目が変わるブロックの、実際に置く ID。置けないなら `AIR`。
 *
 * **置き方の判定はここに集約すること**（`main.ts` に散らすと、
 * 置く側と壊す側で条件が食い違っても気付けない）。
 */
export function placedVariant(base: number, ctx: PlaceContext): number {
  if (base === TORCH) return torchVariant(ctx.support);
  if (base === LADDER) return ladderVariant(ctx.support);
  // **ツタだけは支えの中身も渡す**（真上のツタなら上と同じ向きを写す。34b）。
  if (base === VINE) return vineVariant(ctx.support, ctx.supporter ?? AIR);
  // ベッドは置く人が向いている先が枕になるので、**クリックしたマスは必ず足側**。
  // 上下の反転は無いので `placedUpper()` は通さない。
  if (base === BED) {
    const index = HORIZONTAL_FACING_INDEX[ctx.facing];
    return BEDS_BY_STATE[(index < 0 ? 0 : index) * 2];
  }
  const upper = SLAB_TOP_BY_BOTTOM[base];
  if (upper !== AIR) return placedUpper(ctx) ? upper : base;
  // 状態 0 には大元自身が入っているので、これで「階段の大元か」が分かる
  if (STAIRS_BY_STATE[base * STAIR_STATES] === base) {
    const index = HORIZONTAL_FACING_INDEX[ctx.facing];
    // 置く人が向いている側が高くなる（歩いてきてそのまま登れる向き）
    const state = (index < 0 ? 0 : index) * 2 + (placedUpper(ctx) ? 1 : 0);
    return STAIRS_BY_STATE[base * STAIR_STATES + state];
  }
  return base;
}

/** ベッドの半分（足側でも枕側でも）か。 */
export function isBed(id: number): boolean {
  return BED_STATE_OF[id] >= 0;
}

/** ベッドの枕側か。足側と AIR は false。 */
export function isBedHead(id: number): boolean {
  const state = BED_STATE_OF[id];
  return state >= 0 && (state & 1) === 1;
}

/**
 * ベッドのもう半分が**どこに・どの ID で**居るべきか。ベッドでなければ null。
 *
 * 足側なら向いている先に枕、枕側ならその逆に足。**不変条件は「相方の相方は自分」**
 * （テストで固定してある）。2 マスを揃えて置く・壊すのは `beds.ts` の仕事で、
 * ここが持つのは形の話だけ。
 */
export function bedPartner(id: number): { dx: number; dz: number; id: number } | null {
  const state = BED_STATE_OF[id];
  if (state < 0) return null;
  const head = (state & 1) === 1;
  const [sx, sz] = HORIZONTAL_STEP[state >> 1];
  // 足側から見て向いている先が枕。枕側から見れば逆向きに足がある。
  const sign = head ? -1 : 1;
  return { dx: sx * sign, dz: sz * sign, id: BEDS_BY_STATE[state ^ 1] };
}

/**
 * エンドポータルの枠 1 個。`facing` は**輪の中心を向く水平の面番号**で、
 * `eye` はエンダーアイが嵌まっているか。水平でない向きを渡したら `AIR`。
 *
 * **枠を書き出す唯一の入口。** `stronghold.ts` が輪を並べるときも、
 * アイを嵌める周（TASKS 2-9）も、必ずここを通すこと ——
 * 状態の番号（`向きの添字 * 2 + アイ`）を写すと、片方だけ並べ替えたときに
 * 「輪はできているのにアイだけ別の向きに嵌まる」形で静かに壊れる。
 */
export function endPortalFrame(facing: number, eye: boolean): number {
  const index = HORIZONTAL_FACING_INDEX[facing];
  if (index === undefined || index < 0) return AIR;
  return FRAMES_BY_STATE[index * 2 + (eye ? 1 : 0)];
}

/** エンドポータルの枠か（アイの有無・向きを問わない）。 */
export function isEndPortalFrame(id: number): boolean {
  return FRAME_STATE_OF[id] >= 0;
}

/** その枠にエンダーアイが嵌まっているか。枠でなければ false。 */
export function frameHasEye(id: number): boolean {
  const state = FRAME_STATE_OF[id];
  return state >= 0 && (state & 1) === 1;
}

/** その枠が向いている水平の面番号。枠でなければ `NO_SUPPORT`。 */
export function frameFacing(id: number): number {
  const state = FRAME_STATE_OF[id];
  return state < 0 ? NO_SUPPORT : HORIZONTAL_FACINGS[state >> 1];
}

export function isTranslucent(id: number): boolean {
  return blockDef(id).translucent;
}

export function isSolid(id: number): boolean {
  return blockDef(id).solid;
}

export function blockName(id: number): string {
  return blockDef(id).name;
}

export function blockHardness(id: number): number {
  return blockDef(id).hardness;
}

export function blockTool(id: number): ToolKind | null {
  return blockDef(id).tool;
}

export function blockMinTier(id: number): number {
  return blockDef(id).minTier;
}

/** 壊せるか。水と岩盤は掘れない。 */
export function isBreakable(id: number): boolean {
  return id !== AIR && Number.isFinite(blockDef(id).hardness);
}
