import {
  AIR,
  BED,
  CHEST,
  CRAFTING_TABLE,
  DIRT,
  FACE_XP,
  FARMLAND,
  FURNACE,
  FURNACE_LIT,
  GRASS,
  STONE,
  TORCH,
  bedPartner,
  endPortalFrame,
} from "../src/blocks";
import {
  ARROW,
  BOW,
  BREAD,
  COOKED_PORK,
  ENDER_EYE,
  ENDER_PEARL,
  FLINT_AND_STEEL,
  NO_ITEM,
  SHEARS,
  WATER_BUCKET,
  WHEAT_SEEDS,
  WOOD_HOE,
} from "../src/items";
import { decideUse, type UseAction, type UseFacts } from "../src/use";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 狙っているブロック。`RaycastHit` が構造的に満たす形（`PlaceAim`）をそのまま作る。 */
function aimAt(id: number, x = 3, y = 11, z = 5) {
  return { id, block: { x, y, z }, normal: { x: 0, y: 1, z: 0 }, point: { y: y + 1 } };
}

/** 並の状況（サバイバル・腹は減っている・矢はある・刈れるモブは居ない）。違うところだけ上書きする。 */
function facts(held: number, over: Partial<UseFacts> = {}): UseFacts {
  return { held, creative: false, canEat: true, hasArrow: true, shearable: false, ...over };
}

/** 表に出すための短い説明（何が起きるか）。 */
function describeAction(act: UseAction): string {
  if (act.kind === "flash") return `flash「${act.message}」`;
  if (act.kind === "place") return `place(${act.base})`;
  if (act.kind === "bed") return `bed(${act.id})`;
  return act.kind;
}

export function run(): void {
  describe("右クリックの振り分け");

  // --- 切り分け（`use.ts` は判断だけを持つ） ---
  const source = sourceOf("src/use.ts");
  const leaked = [
    "Mesh",
    "Material",
    "document.",
    "getElementById",
    "AudioContext",
    "Math.random(",
    // 書き込むのは `placing.ts` / `beds.ts` の仕事。ここは注文を返すだけ。
    "setVoxel",
    "World",
    // 持ち物を知り始めると、「矢があるか」が 2 か所になる。
    "Inventory",
    "Projectiles",
  ].filter((name) => source.includes(name));
  check("use.ts は判断だけを持つ（描画・持ち物・書き込みに触らない）", leaked.length === 0, leaked.join(" "));

  // もとは `main.ts` の `useOrPlace()` にあった 11 通りの `if` の列。
  // **戻っていないこと**を語で見る（`placing.ts` の `canPlaceAt` と同じ作法）。
  const main = sourceOf("src/main.ts");
  const backInMain = [
    "isBucket(",
    "isBow(",
    "isFireStarter(",
    "isEndPortalFrame(",
    "ENDER_EYE",
    // 刈るかどうかも同じ（`main.ts` が持ってよいのは「刈れるモブが手前に居る」という
    // 事実だけで、どれがシアーズかは `items.ts` の表 1 本）。
    "isShears(",
    // クワかどうかも同じ（`decideUse()` が振り分けを済ませて `till` の注文だけを渡す）。
    "isHoe(",
    // 種かどうかも同じ（`plant` の注文だけが `main.ts` に届く）。
    "isSeed(",
  ].filter((name) => main.includes(name));
  check("main.ts に振り分けが戻っていない", backInMain.length === 0, backInMain.join(" "));

  // --- 11 通りの表（触ったときに壊れ方が見えるように出す） ---
  const table: [string, ReturnType<typeof aimAt> | null, UseFacts][] = [
    ["作業台を狙う", aimAt(CRAFTING_TABLE), facts(STONE)],
    ["消えているかまど", aimAt(FURNACE), facts(STONE)],
    ["点火中のかまど", aimAt(FURNACE_LIT), facts(STONE)],
    ["チェスト", aimAt(CHEST), facts(STONE)],
    ["ベッドの足側", aimAt(BED), facts(STONE)],
    ["ベッドの枕側", aimAt(bedPartner(BED)?.id ?? BED), facts(STONE)],
    ["水入りバケツ（空を向く）", null, facts(WATER_BUCKET)],
    ["アイで枠を狙う", aimAt(endPortalFrame(FACE_XP, false)), facts(ENDER_EYE)],
    ["アイで地面を狙う", aimAt(GRASS), facts(ENDER_EYE)],
    ["火打石と打ち金", aimAt(STONE), facts(FLINT_AND_STEEL)],
    ["弓（矢あり）", null, facts(BOW)],
    ["弓（矢なし）", null, facts(BOW, { hasArrow: false })],
    ["焼き豚（腹が減っている）", null, facts(COOKED_PORK)],
    ["焼き豚（満腹）", null, facts(COOKED_PORK, { canEat: false })],
    ["石を置く", aimAt(GRASS), facts(STONE)],
    ["素手で地面を狙う", aimAt(GRASS), facts(NO_ITEM)],
    ["素手で空を向く", null, facts(NO_ITEM)],
    ["クワで土を狙う", aimAt(DIRT), facts(WOOD_HOE)],
    ["クワで作業台を狙う", aimAt(CRAFTING_TABLE), facts(WOOD_HOE)],
    ["クワだけ（空を向く）", null, facts(WOOD_HOE)],
    ["種で耕地を狙う", aimAt(FARMLAND), facts(WHEAT_SEEDS)],
    ["種で作業台を狙う", aimAt(CRAFTING_TABLE), facts(WHEAT_SEEDS)],
    ["種だけ（空を向く）", null, facts(WHEAT_SEEDS)],
    // パンも焼き豚と同じ `foodOf()` 1 本を通る（`use.ts` に「パン」とは書かれていない）。
    ["パン（腹が減っている）", null, facts(BREAD)],
    ["パン（満腹）", null, facts(BREAD, { canEat: false })],
  ];
  console.log("      狙い / 手                        起きること");
  const got = new Map<string, UseAction>();
  for (const [name, aim, f] of table) {
    const act = decideUse(aim, f);
    got.set(name, act);
    console.log(`      ${name.padEnd(28)}  ${describeAction(act)}`);
  }
  const kindOf = (name: string): string => got.get(name)?.kind ?? "(無い)";

  check("作業台は 3x3 の画面", kindOf("作業台を狙う") === "craft");
  // 点火中も同じ 1 台。**大元の ID で見ないと、焼いている最中だけ開かなくなる。**
  check(
    "かまどは点火中でも開く",
    kindOf("消えているかまど") === "furnace" && kindOf("点火中のかまど") === "furnace",
    kindOf("点火中のかまど"),
  );
  check("チェストは開く", kindOf("チェスト") === "chest");
  // 足側でも枕側でも同じ 1 台。**叩いたマスをそのまま渡すこと**（相方は `beds.ts` が辿る）。
  check(
    "ベッドは足側でも枕側でも同じ扱い",
    kindOf("ベッドの足側") === "bed" && kindOf("ベッドの枕側") === "bed",
  );
  {
    const head = got.get("ベッドの枕側");
    check(
      "叩いたベッドの ID がそのまま渡る（相方を辿るのは beds.ts）",
      head?.kind === "bed" && head.id === bedPartner(BED)?.id,
      head?.kind === "bed" ? `${head.id}` : head?.kind,
    );
  }

  // --- 順番そのものが判断（並べ替えると静かに壊れる 2 つ） ---
  // **嵌めるほうが先。** 逆にすると、枠を狙っても手からアイが飛んでいって
  // 永久に嵌まらない（枠は地下 18 マスなので、掘り当てるまで気付けない）。
  check(
    "枠を狙ったアイは嵌める（投げない）",
    kindOf("アイで枠を狙う") === "fitEye",
    kindOf("アイで枠を狙う"),
  );
  check("枠以外を狙ったアイは投げる", kindOf("アイで地面を狙う") === "throwEye");
  // アイが嵌まっている枠を叩いても嵌める側（減らさない判断は `endportal.ts`）。
  check(
    "アイの嵌まった枠も嵌める側に行く",
    decideUse(aimAt(endPortalFrame(FACE_XP, true)), facts(ENDER_EYE)).kind === "fitEye",
  );
  // **器が先。** 作業台の上に立ってブロックを置こうとしても、開くほうが勝つ
  // （置ける先を探し始めると、作業台が開けなくなる）。
  check(
    "器を狙っているあいだは置かない",
    decideUse(aimAt(CRAFTING_TABLE), facts(TORCH)).kind === "craft",
  );
  // **バケツは食べ物より先。** どちらも右クリックだが、バケツは 1 回で終わる。
  check("バケツは狙う先が無くても使う", kindOf("水入りバケツ（空を向く）") === "bucket");
  check(
    "バケツは器より後（かまどを狙ったら開く）",
    decideUse(aimAt(FURNACE), facts(WATER_BUCKET)).kind === "furnace",
  );

  // --- 狙う先が要るもの・要らないもの ---
  // **`aim` が無くても食べられること**（空を向いたまま食べられないのはおかしい）。
  check("空を向いても食べられる", kindOf("焼き豚（腹が減っている）") === "eat");
  // **食べ物を足しても `use.ts` は 1 行も増えない** —— `foodOf()` の表に載るだけで
  // 右クリックが「食べる」に来る（アイテムの名前を書き始めた瞬間にこれが崩れます）。
  check("パンも同じ経路で食べられる", kindOf("パン（腹が減っている）") === "eat", kindOf("パン（腹が減っている）"));
  check("空を向いても弓は引ける", kindOf("弓（矢あり）") === "draw");
  // 火種は「どのマスに点けるか」が要るので、狙う先が無ければ何も起きない。
  check("火種は狙う先が無ければ何も起きない", decideUse(null, facts(FLINT_AND_STEEL)).kind === "none");
  check("火種は狙っていれば点ける", kindOf("火打石と打ち金") === "ignite");
  check("空を向いてブロックを持っても何も起きない", kindOf("素手で空を向く") === "none");

  // --- 断る理由は必ず出す（黙って何も起きないのは「壊れた」と区別が付かない） ---
  {
    const noArrow = got.get("弓（矢なし）");
    check(
      "矢が無ければ理由を出す（引かない）",
      noArrow?.kind === "flash" && noArrow.message.includes("矢"),
      describeAction(noArrow ?? { kind: "none" }),
    );
    const full = got.get("焼き豚（満腹）");
    check(
      "満腹なら理由を出す（食べない）",
      full?.kind === "flash" && full.message.includes("お腹"),
      describeAction(full ?? { kind: "none" }),
    );
    const fullBread = got.get("パン（満腹）");
    check(
      "パンでも満腹なら理由を出す",
      fullBread?.kind === "flash" && fullBread.message.includes("お腹"),
      describeAction(fullBread ?? { kind: "none" }),
    );
  }

  // --- クリエイティブ ---
  // 矢はクリエイティブぶんを呼ぶ側で込みにする（`bow.ts` の `DrawContext` と同じ約束）。
  check(
    "クリエイティブでも矢が無ければ引けない（込みにするのは呼ぶ側）",
    decideUse(null, facts(BOW, { creative: true, hasArrow: false })).kind === "flash",
  );
  // **クリエイティブでは食べない**（減らないので満腹のまま食べ続けられる）。
  check(
    "クリエイティブでは食べない",
    decideUse(null, facts(COOKED_PORK, { creative: true })).kind === "none",
  );
  check(
    "パンもクリエイティブでは食べない",
    decideUse(null, facts(BREAD, { creative: true })).kind === "none",
    decideUse(null, facts(BREAD, { creative: true })).kind,
  );

  // --- 置く ---
  {
    const put = got.get("石を置く");
    check(
      "置くときは何を置くかまで決まっている",
      put?.kind === "place" && put.base === STONE,
      describeAction(put ?? { kind: "none" }),
    );
    // 素手（や置けないアイテム）でも `place` に落ちる。**置けるかどうかは `placing.ts`** の
    // 仕事なので、ここで弾かない（弾くと、可否の判断が 2 か所に分かれる）。
    const bare = got.get("素手で地面を狙う");
    check(
      "置けないものは AIR として渡す（可否は placing.ts）",
      bare?.kind === "place" && bare.base === AIR,
      describeAction(bare ?? { kind: "none" }),
    );
    // 置くマスと向きを決めるのに要るので、狙った面をそのまま運ぶこと。
    check(
      "狙った面がそのまま置く側へ渡る",
      put?.kind === "place" && put.aim.block.x === 3 && put.aim.normal.y === 1,
    );
  }

  // --- シアーズ（刈れるモブが手前に居るときだけ） ---
  // 「刈れるか」（`mobs.canShear()`）も「手前か」（`controls.mobIsNearer()`）も
  // 呼ぶ側が込みにして渡す（`hasArrow` とまったく同じ約束）。
  {
    const rows: [string, UseFacts, ReturnType<typeof aimAt> | null][] = [
      ["シアーズ + 刈れる羊", facts(SHEARS, { shearable: true }), null],
      ["シアーズだけ（羊が居ない）", facts(SHEARS), aimAt(GRASS)],
      ["シアーズだけ（空を向く）", facts(SHEARS), null],
      ["シアーズで作業台（羊が手前）", facts(SHEARS, { shearable: true }), aimAt(CRAFTING_TABLE)],
      ["石 + 刈れる羊", facts(STONE, { shearable: true }), aimAt(GRASS)],
      ["焼き豚 + 刈れる羊", facts(COOKED_PORK, { shearable: true }), null],
      ["水入りバケツ + 刈れる羊", facts(WATER_BUCKET, { shearable: true }), null],
    ];
    for (const [name, f, aim] of rows) {
      console.log(`      ${name.padEnd(28)}  ${describeAction(decideUse(aim, f))}`);
    }
    const kind = (i: number): string => decideUse(rows[i][2], rows[i][1]).kind;
    check("シアーズ + 刈れるモブが手前 → 刈る", kind(0) === "shear", kind(0));
    // 羊が居なければ今までどおり（置ける物でなければ `place(AIR)`）。
    check("刈れるモブが居なければ今までどおり", kind(1) === "place" && kind(2) === "none", `${kind(1)} / ${kind(2)}`);
    // **器より先**（あとにすると、作業台の前に立った羊だけ刈れない）。
    check("刈るのは器より先", kind(3) === "shear", kind(3));
    // **別のアイテムからは何も奪わないこと**（`place` も `eat` も `bucket` も今までどおり）。
    check(
      "シアーズ以外は刈らない（置く・食べる・汲むを奪わない）",
      kind(4) === "place" && kind(5) === "eat" && kind(6) === "bucket",
      `${kind(4)} / ${kind(5)} / ${kind(6)}`,
    );
  }

  // --- クワ（耕す。器の次・バケツより前） ---
  check("クワ + 土 → till", kindOf("クワで土を狙う") === "till", kindOf("クワで土を狙う"));
  {
    const till = got.get("クワで土を狙う");
    check(
      "耕すマスがそのまま渡る（可否は placing.ts）",
      till?.kind === "till" && till.at.x === 3 && till.at.z === 5,
      till?.kind === "till" ? `(${till.at.x},${till.at.y},${till.at.z})` : till?.kind,
    );
  }
  // **器が先。** 作業台を狙っているあいだはクワを持っていても開くほうが勝つ。
  check("クワ + 作業台 → craft（器が先）", kindOf("クワで作業台を狙う") === "craft", kindOf("クワで作業台を狙う"));
  // 狙う先が無ければ何も起きない（どのマスを耕すか決まらない）。
  check("クワだけ（aim なし）→ none", kindOf("クワだけ（空を向く）") === "none", kindOf("クワだけ（空を向く）"));
  // 別のアイテムを持って土を狙っても今までどおり（置く側へ落ちる）。
  check(
    "別のアイテム + 土 → 今までどおり（置く）",
    decideUse(aimAt(DIRT), facts(STONE)).kind === "place",
    decideUse(aimAt(DIRT), facts(STONE)).kind,
  );

  // --- 種（植える。クワの次・バケツより前） ---
  check("種 + 耕地 → plant", kindOf("種で耕地を狙う") === "plant", kindOf("種で耕地を狙う"));
  {
    const plant = got.get("種で耕地を狙う");
    check(
      "植えるマス（狙った耕地）がそのまま渡る（可否は placing.ts）",
      plant?.kind === "plant" && plant.at.x === 3 && plant.at.y === 11 && plant.at.z === 5,
      plant?.kind === "plant" ? `(${plant.at.x},${plant.at.y},${plant.at.z})` : plant?.kind,
    );
  }
  // **器が先。** 作業台の上に耕地は無いが、並びが崩れたときにここで出る。
  check("種 + 作業台 → craft（器が先）", kindOf("種で作業台を狙う") === "craft", kindOf("種で作業台を狙う"));
  // 狙う先が無ければ何も起きない（どのマスに植えるか決まらない）。
  check("種だけ（aim なし）→ none", kindOf("種だけ（空を向く）") === "none", kindOf("種だけ（空を向く）"));
  // **土を狙っても `plant` に来る**（可否は `placing.ts` の仕事で、ここで弾かない）。
  check(
    "種 + 土 → plant（耕地かどうかは placing.ts が見る）",
    decideUse(aimAt(DIRT), facts(WHEAT_SEEDS)).kind === "plant",
    decideUse(aimAt(DIRT), facts(WHEAT_SEEDS)).kind,
  );
  // 種を持っていないときの耕地は今までどおり（置く側へ落ちる）。
  check(
    "別のアイテム + 耕地 → 今までどおり（置く）",
    decideUse(aimAt(FARMLAND), facts(STONE)).kind === "place",
    decideUse(aimAt(FARMLAND), facts(STONE)).kind,
  );

  // --- 落とし物のアイテムは何も起きない（投げるのは Q） ---
  check("エンダーパールは右クリックでは何も起きない", decideUse(null, facts(ENDER_PEARL)).kind === "none");
  check(
    "エンダーパールを持っていても置く側に落ちる（狙っていれば）",
    decideUse(aimAt(GRASS), facts(ENDER_PEARL)).kind === "place",
  );
  // 矢そのものは持っていても置けない（`ARROW` は松明と違ってブロックを持たない）。
  check("矢は置けない（AIR として渡る）", (() => {
    const act = decideUse(aimAt(GRASS), facts(ARROW));
    return act.kind === "place" && act.base === AIR;
  })());
}
