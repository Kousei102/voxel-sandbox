import { readFileSync } from "node:fs";
import {
  AIR,
  COBBLE,
  FURNACE,
  FURNACE_LIT,
  GLASS,
  IRON_ORE,
  PLANK,
  SAND,
  STONE,
  baseBlock,
  blockName,
} from "../src/blocks";
import { findRecipe } from "../src/crafting";
import { CraftScreen } from "../src/craftscreen";
import { Furnaces, litVoxel } from "../src/furnaces";
import { INVENTORY_SIZE, Inventory, isEmpty, type Slot } from "../src/inventory";
import {
  COAL,
  COOKED_CHICKEN,
  COOKED_PORK,
  IRON_INGOT,
  MAX_STACK,
  NO_ITEM,
  RAW_CHICKEN,
  RAW_PORK,
  WOOD_PICKAXE,
  dropOf,
  itemName,
} from "../src/items";
import {
  FUEL,
  SMELTING,
  SMELT_TIME,
  createFurnace,
  deserializeFurnace,
  fuelTimeOf,
  isFuel,
  isLit,
  isSmeltable,
  pendingResult,
  serializeFurnace,
  serializeFurnaceWear,
  tickFurnace,
  type FurnaceState,
} from "../src/smelting";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";


/** 材料と燃料を入れたかまど。 */
function loaded(input: number, inCount: number, fuel: number, fuelCount: number): FurnaceState {
  const state = createFurnace();
  state.input.item = input;
  state.input.count = inCount;
  state.fuel.item = fuel;
  state.fuel.count = fuelCount;
  return state;
}

/** dt 刻みで `seconds` 秒ぶん焼く。 */
function burn(state: FurnaceState, seconds: number, dt = 0.05): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) tickFurnace(state, dt);
}

function grid(items: number[][]): Slot[] {
  return items.flat().map((item) => ({ item, count: item === NO_ITEM ? 0 : 1 }));
}

export function run(): void {
  describe("精錬（判断の切り分け）");

  const smeltSource = sourceOf("src/smelting.ts");
  const furnaceSource = sourceOf("src/furnaces.ts");
  const leaks = ["document", "getElementById", "HTMLElement", 'from "three"', "AudioContext"].filter(
    (name) => smeltSource.includes(name) || furnaceSource.includes(name),
  );
  check("smelting.ts / furnaces.ts は DOM にも three にも触らない", leaks.length === 0, leaks.join(" "));

  // **かまどがワールドを書き換えないこと。** 点火中のブロック差し替えは main.ts の仕事で、
  // ここが崩れると「かまどが勝手に地形を書く」経路ができる（`drops.ts` と同じ制約）。
  check(
    "furnaces.ts は world を書き換えない",
    !furnaceSource.includes("setVoxel") && !furnaceSource.includes("./world"),
  );

  const uiSource = sourceOf("src/inventoryui.ts");
  check(
    "inventoryui.ts は smelting.ts を import しない",
    !uiSource.includes('from "./smelting"'),
    "精錬の判断が UI に漏れている",
  );

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(`      smelting.ts ${lines("src/smelting.ts")} 行 / furnaces.ts ${lines("src/furnaces.ts")} 行`);

  describe("精錬の表");

  console.log("      焼けるもの");
  for (const [input, result] of SMELTING) {
    console.log(`        ${itemName(input).padEnd(12)} → ${itemName(result.out)} x${result.count}`);
  }
  console.log("      燃料（1 個で焼ける数）");
  for (const [item, seconds] of FUEL) {
    console.log(`        ${itemName(item).padEnd(12)} ${seconds} 秒 = ${seconds / SMELT_TIME} 個`);
  }

  check("鉄鉱石 → 鉄インゴット", SMELTING.get(IRON_ORE)?.out === IRON_INGOT);
  check("砂 → ガラス", SMELTING.get(SAND)?.out === GLASS);
  check("丸石 → 石", SMELTING.get(COBBLE)?.out === STONE);
  check("生豚肉 → 焼き豚", SMELTING.get(RAW_PORK)?.out === COOKED_PORK);
  check("生鶏肉 → 焼き鳥", SMELTING.get(RAW_CHICKEN)?.out === COOKED_CHICKEN);

  // **木から作れる燃料を必ず残すこと。** 石炭が見つかる前に鉄を焼けないと、
  // かまどを作った意味が最初の数十分ぶん遅れる。
  check("木から作れる燃料がある", fuelTimeOf(PLANK) > 0, `板 ${fuelTimeOf(PLANK)} 秒`);
  check("石炭がいちばん長持ちする", fuelTimeOf(COAL) === Math.max(...FUEL.values()), `${fuelTimeOf(COAL)} 秒`);
  check("焼けないものは燃料でもない扱いにならない", fuelTimeOf(IRON_ORE) === 0);

  // 代用を本当に外したか。**片方だけ戻すと、精錬を飛ばせる抜け道になる。**
  check("鉄鉱石は鉱石のまま落ちる", dropOf(IRON_ORE).item === IRON_ORE, itemName(dropOf(IRON_ORE).item));
  check("砂 4 個ではガラスにならない", findRecipe(grid([[SAND, SAND], [SAND, SAND]]), 2) === null);

  const furnaceRecipe = findRecipe(
    grid([
      [COBBLE, COBBLE, COBBLE],
      [COBBLE, NO_ITEM, COBBLE],
      [COBBLE, COBBLE, COBBLE],
    ]),
    3,
  );
  check("丸石 8 個 → かまど", furnaceRecipe?.out === FURNACE, furnaceRecipe?.name ?? "無し");

  // 点火中の版はアイテムを持たず、掘ると普通のかまどが出る（松明の壁掛けと同じ仕掛け）。
  check("点火中のかまどは大元に寄る", baseBlock(FURNACE_LIT) === FURNACE, blockName(FURNACE_LIT));
  check("点火中のかまどを掘るとかまどが出る", dropOf(FURNACE_LIT).item === FURNACE);

  describe("かまどの焼け方");

  {
    // **先に「ちゃんと焼ける」ことを出す。** 焼けない試験場だと、
    // 「燃料が減らない」も「出来上がらない」も全部通ってしまう。
    const state = loaded(IRON_ORE, 3, COAL, 1);
    check("最初は火が消えている", !isLit(state));
    burn(state, 0.1);
    check("材料と燃料があれば点く", isLit(state), `残り ${state.burnLeft.toFixed(1)} 秒`);
    check("燃料を 1 個だけ食う", isEmpty(state.fuel), `${state.fuel.count} 個`);

    burn(state, SMELT_TIME);
    console.log(`      ${SMELT_TIME} 秒後: 出来 ${state.output.count} 個 / 材料 ${state.input.count} 個`);
    check("1 個焼き上がる", state.output.item === IRON_INGOT && state.output.count === 1);
    check("材料が 1 個減る", state.input.count === 2);

    burn(state, SMELT_TIME * 2);
    check("続けて焼ける", state.output.count === 3, `${state.output.count} 個`);
    check("材料を焼き切る", isEmpty(state.input));
  }

  {
    // 空焚きで燃料を食わないこと（Minecraft と同じ）。
    const empty = createFurnace();
    empty.fuel.item = COAL;
    empty.fuel.count = 5;
    burn(empty, 30);
    check("材料が無ければ燃料を食わない", empty.fuel.count === 5, `${empty.fuel.count} 個`);
    check("材料が無ければ火も点かない", !isLit(empty));

    // 焼けないものを入れても同じ。
    const junk = loaded(COOKED_PORK, 4, COAL, 5);
    burn(junk, 30);
    check("焼けないものでは燃料を食わない", junk.fuel.count === 5, `${junk.fuel.count} 個`);
  }

  {
    // **材料を抜いたら進み具合を戻すこと。** 引き継ぐと、入れ替えた瞬間に焼き上がる。
    const state = loaded(IRON_ORE, 1, COAL, 1);
    burn(state, SMELT_TIME * 0.8);
    const midway = state.cookLeft;
    state.input.item = NO_ITEM;
    state.input.count = 0;
    tickFurnace(state, 0.05);
    console.log(`      抜く前 残り ${midway.toFixed(1)} 秒 → 抜いた後 ${state.cookLeft.toFixed(1)} 秒`);
    check("抜く前は進んでいた", midway < SMELT_TIME * 0.5, `残り ${midway.toFixed(1)} 秒`);
    check("材料を抜くと進み具合が戻る", state.cookLeft === SMELT_TIME);

    // 入れ直しても即座には焼き上がらない
    state.input.item = SAND;
    state.input.count = 1;
    tickFurnace(state, 0.05);
    check("入れ直しても即焼き上がらない", isEmpty(state.output), `${state.output.count} 個`);
  }

  {
    // 出来上がりが満杯なら焼かない（焼いてから捨てることになってはいけない）。
    const state = loaded(IRON_ORE, 10, COAL, 5);
    state.output.item = IRON_INGOT;
    state.output.count = MAX_STACK;
    check("満杯なら焼く先が無い", pendingResult(state) === null);
    burn(state, SMELT_TIME * 2);
    check("満杯なら材料が減らない", state.input.count === 10, `${state.input.count} 個`);
    check("満杯なら燃料も減らない", state.fuel.count === 5, `${state.fuel.count} 個`);
    check("満杯を超えて増えない", state.output.count === MAX_STACK, `${state.output.count} 個`);
  }

  {
    // 燃料が尽きたら止まる。**先に、燃えている間は進むことを出しておく。**
    const state = loaded(IRON_ORE, 10, PLANK, 1);
    const fuelSeconds = fuelTimeOf(PLANK);
    burn(state, fuelSeconds + 1);
    console.log(`      板 1 枚（${fuelSeconds} 秒）で ${state.output.count} 個 焼けた`);
    check("燃料のぶんだけ焼ける", state.output.count === Math.floor(fuelSeconds / SMELT_TIME));
    check("燃料が尽きたら消える", !isLit(state));
    const madeSoFar = state.output.count;
    burn(state, SMELT_TIME * 3);
    check("燃料が無ければ増えない", state.output.count === madeSoFar, `${state.output.count} 個`);
  }

  describe("置いてあるかまど");

  {
    const furnaces = new Furnaces();
    const state = furnaces.at(4, 5, 6);
    check("同じ場所は同じかまど", furnaces.at(4, 5, 6) === state);
    check("違う場所は別のかまど", furnaces.at(4, 5, 7) !== state);
    check("無い場所は覗いても作らない", furnaces.peek(99, 99, 99) === null);

    state.input.item = IRON_ORE;
    state.input.count = 5;
    state.fuel.item = COAL;
    state.fuel.count = 2;
    state.output.item = IRON_INGOT;
    state.output.count = 3;

    // 壊したら中身を返すこと。返さないと集めたものが黙って消える。
    const spilled = furnaces.remove(4, 5, 6);
    const total = spilled.reduce((sum, s) => sum + s.count, 0);
    console.log(`      壊して出たもの: ${spilled.map((s) => `${itemName(s.item)} x${s.count}`).join(" / ")}`);
    check("壊すと中身が全部出る", spilled.length === 3 && total === 10, `${spilled.length} 種 ${total} 個`);
    check("壊したら消える", furnaces.peek(4, 5, 6) === null);
  }

  {
    // セーブの往復。
    const furnaces = new Furnaces();
    const a = furnaces.at(1, 2, 3);
    a.input.item = SAND;
    a.input.count = 7;
    a.fuel.item = COAL;
    a.fuel.count = 1;
    furnaces.at(-9, 40, -12).output.item = GLASS;
    furnaces.peek(-9, 40, -12)!.output.count = 4;
    // 空っぽのかまど（開いただけ）はセーブに残さない
    furnaces.at(50, 50, 50);

    const raw = furnaces.serialize()!;
    const keys = Object.keys(raw);
    console.log(`      ${furnaces.count} 台のうち ${keys.length} 台を保存（空は省く）`);
    check("空のかまどは保存しない", keys.length === 2, keys.join(" "));
    check("1 台 9 要素", raw[keys[0]].length === 9, `${raw[keys[0]].length} 要素`);

    const loadedFurnaces = new Furnaces();
    loadedFurnaces.deserialize(raw);
    const back = loadedFurnaces.peek(1, 2, 3);
    check("往復で台数が合う", loadedFurnaces.count === 2, `${loadedFurnaces.count} 台`);
    check(
      "往復で中身が合う",
      back?.input.item === SAND && back.input.count === 7 && back.fuel.item === COAL,
      `${back ? itemName(back.input.item) : "無し"} x${back?.input.count}`,
    );
    check("負の座標も戻る", loadedFurnaces.peek(-9, 40, -12)?.output.count === 4);

    const emptyLoad = new Furnaces();
    emptyLoad.deserialize(undefined);
    check("古いセーブ（キーなし）は 0 台", emptyLoad.count === 0);
    check("全部空なら undefined を返す", new Furnaces().serialize() === undefined);

    const storage = readFileSync("src/storage.ts", "utf8");
    check("SaveData の版が 1 のまま", storage.includes("version: 1") && storage.includes("version !== 1"));
    check("furnaces は省略可のキー", /furnaces\?:/.test(storage));
  }

  {
    // 点火中のブロック差し替え。**書き込みが失敗したら持ち越すこと** ——
    // 未読み込みの列で「合った」ことにすると、火が消えても光ったままになる。
    const furnaces = new Furnaces();
    const state = furnaces.at(0, 70, 0);
    state.input.item = IRON_ORE;
    state.input.count = 1;
    state.fuel.item = COAL;
    state.fuel.count = 1;
    furnaces.update(0.05);

    let asked = 0;
    furnaces.syncLit(() => {
      asked++;
      return false; // 列がまだ無い、を装う
    });
    check("点いたら差し替えを頼む", asked === 1, `${asked} 回`);

    asked = 0;
    furnaces.syncLit(() => {
      asked++;
      return false;
    });
    check("失敗したら次も頼む（持ち越す）", asked === 1, `${asked} 回`);

    let lastLit: boolean | null = null;
    furnaces.syncLit((_x, _y, _z, lit) => {
      lastLit = lit;
      return true;
    });
    check("成功したら点火中として渡る", lastLit === true);

    asked = 0;
    furnaces.syncLit(() => {
      asked++;
      return true;
    });
    check("合っていれば頼まない", asked === 0, `${asked} 回`);
  }

  {
    // **どの ID を書くかは `furnaces.ts` の `litVoxel()`**（`main.ts` に
    // `lit ? FURNACE_LIT : FURNACE` を書き戻さないため）。`AIR` は「書くものが無い」。
    check("消えているかまどを点ける", litVoxel(FURNACE, true) === FURNACE_LIT, blockName(litVoxel(FURNACE, true)));
    check("点いているかまどを消す", litVoxel(FURNACE_LIT, false) === FURNACE);
    check("もう合っていれば書かない", litVoxel(FURNACE_LIT, true) === AIR && litVoxel(FURNACE, false) === AIR);
    // 掘られた・上書きされたマスを書き換えないこと（**関係のないブロックがかまどに化ける**）。
    check("かまどでなければ書かない", litVoxel(STONE, true) === AIR, blockName(litVoxel(STONE, true)));
    check("空気にも書かない", litVoxel(AIR, true) === AIR);
    const main = sourceOf("src/main.ts");
    check("main.ts が点火中の ID を選んでいない", !main.includes("FURNACE_LIT"));
  }

  describe("かまどの画面");

  {
    const inventory = new Inventory();
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    state.output.item = IRON_INGOT;
    state.output.count = 5;
    screen.openFurnace(state);

    check("かまどモードになる", screen.mode === "furnace");
    check("盤面は 1 枠も使えない", !screen.usable(0) && !screen.usable(4));
    check("クラフトの出来上がりは出ない", screen.result() === null);
    check("作るボタンは効かない", screen.takeResult().changed === false);

    // 焼き上がりは取り出し専用。
    screen.press("output", 0, 0);
    check("焼き上がりは掴める", screen.held?.item === IRON_INGOT && screen.held.count === 5);
    const before = state.output.count;
    screen.press("output", 0, 0);
    check("掴んだまま焼き上がりへは戻せない", state.output.count === before && screen.held?.count === 5);

    // 材料と燃料の枠には置ける。**押しただけでは確定しない**（撫でて配るために
    // `release()` まで遅らせてある）ので、離すところまでやる。
    screen.press("input", 0, 0);
    check("押しただけでは動かない", isEmpty(state.input) && screen.held?.count === 5);
    screen.release();
    check("材料の枠には置ける", state.input.item === IRON_INGOT && state.input.count === 5);
    check("離したら手が空く", screen.held === null);
  }

  {
    // **閉じてもかまどの中身は返さない。** 盤面と寿命が違う（ワールドの持ち物）。
    const inventory = new Inventory();
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    state.input.item = IRON_ORE;
    state.input.count = 6;
    screen.openFurnace(state);
    screen.close();
    console.log(`      閉じたあと かまど ${state.input.count} 個 / 手元 ${inventory.count(IRON_ORE)} 個`);
    check("かまどの中身は残る", state.input.count === 6);
    check("インベントリへ返らない", inventory.count(IRON_ORE) === 0);
    check("閉じたらかまどモードを抜ける", screen.mode === "craft" && screen.furnace === null);
  }

  {
    // シフトクリックの行き先。焼けるものは材料へ、燃料は燃料へ。
    const inventory = new Inventory();
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    screen.openFurnace(state);

    inventory.add(IRON_ORE, 12);
    inventory.add(COAL, 3);
    // **先に「盤面のときは今までどおり動く」ことを確かめてから**、かまどの行き先を見る。
    screen.press("inv", 0, 0, { shift: true, double: false });
    screen.press("inv", 1, 0, { shift: true, double: false });
    console.log(
      `      材料 ${itemName(state.input.item)} x${state.input.count} /` +
        ` 燃料 ${itemName(state.fuel.item)} x${state.fuel.count}`,
    );
    check("焼けるものは材料の枠へ", state.input.item === IRON_ORE && state.input.count === 12);
    check("燃料は燃料の枠へ", state.fuel.item === COAL && state.fuel.count === 3);
    check("インベントリからは消える", inventory.count(IRON_ORE) === 0 && inventory.count(COAL) === 0);

    // 焼き上がりはシフトクリックでインベントリへ戻る。
    state.output.item = IRON_INGOT;
    state.output.count = 4;
    screen.press("output", 0, 0, { shift: true, double: false });
    check("焼き上がりはシフトで持ち帰れる", inventory.count(IRON_INGOT) === 4 && isEmpty(state.output));
  }

  {
    // 入りきらないぶんは枠に残す（黙って消さない）。
    const inventory = new Inventory();
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    state.input.item = IRON_ORE;
    state.input.count = MAX_STACK - 2;
    screen.openFurnace(state);
    inventory.add(IRON_ORE, 10);
    screen.press("inv", 0, 0, { shift: true, double: false });
    console.log(`      材料 ${state.input.count} 個 / 手元に ${inventory.count(IRON_ORE)} 個 残り`);
    check("上限まで入る", state.input.count === MAX_STACK, `${state.input.count} 個`);
    check("入らないぶんは手元に残る", inventory.count(IRON_ORE) === 8, `${inventory.count(IRON_ORE)} 個`);
  }

  {
    // 画面に出す文言。**判断はここ**（UI に書くと分岐だけテストが届かなくなる）。
    const screen = new CraftScreen(new Inventory());
    check("かまどを開いていなければ様子は無い", screen.furnaceStatus() === null);

    // 出た文言は全部ここに溜めて、最後に幅をまとめて見る。
    const seen: string[] = [];
    const status = () => {
      const text = screen.furnaceStatus()?.text ?? "";
      seen.push(text);
      return text;
    };

    const state = createFurnace();
    screen.openFurnace(state);
    check("空なら入れるよう促す", status() === "材料と燃料を入れる");

    state.input.item = COOKED_PORK;
    state.input.count = 1;
    check("焼けないものだと分かる", status() === "これは焼けません");

    state.input.item = IRON_ORE;
    check("燃料が無いと分かる", status() === "燃料がありません");

    state.fuel.item = COAL;
    state.fuel.count = 1;
    tickFurnace(state, 0.05);
    const lit = screen.furnaceStatus();
    console.log(`      点火中の表示: ${lit?.text}`);
    check("点いたら燃料の残りが出る", lit?.lit === true && lit.text.includes("燃料"));

    state.output.item = IRON_INGOT;
    state.output.count = MAX_STACK;
    state.burnLeft = 0;
    state.burnTotal = 0;
    check("満杯だと分かる", status() === "焼き上がりが満杯です");

    // 焼き上がりを空けてから燃料を替える（満杯の判定が先に出るので、順番を入れ替えないこと）。
    state.output.count = 0;
    state.fuel.item = IRON_INGOT;
    state.fuel.count = 1;
    check("燃えない燃料だと分かる", status() === "この燃料は燃えません");

    // 点火中は数字がいちばん伸びた形（焼き 100% / 燃料 300 秒）で測る。
    state.fuel.item = COAL;
    state.burnLeft = 300;
    state.burnTotal = 300;
    state.cookLeft = 0;
    status();

    // この文字はスロットの真下に浮かせてあるので（`style.css` の `#furnacehint`）、
    // 長くすると**左へ伸びて燃料の枠に重なります**。目で見るまで気付けない壊れ方なので、
    // 幅を数に落として押さえる。上限は CSS から出した値:
    // 燃料の枠の右端から焼き上がりの枠の中心まで 69px（gap 14 + 矢印 18 + gap 14 + 46/2）、
    // 中央揃えなので使えるのは左右あわせて 138px。字は 11px なので全角 12.5 文字ぶん。
    const LIMIT = 12.5;
    const width = (text: string) =>
      [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) < 0x100 ? 0.5 : 1), 0);
    const widest = seen.reduce((a, b) => (width(a) >= width(b) ? a : b), "");
    console.log(`      文言 ${seen.length} 通り / いちばん長いのは「${widest}」= 全角 ${width(widest)} 文字ぶん（上限 ${LIMIT}）`);
    check("どの文言も燃料の枠には届かない", width(widest) <= LIMIT, widest);
  }

  {
    // インベントリが満杯でも、かまどへのシフトクリックが暴れないこと。
    const inventory = new Inventory();
    inventory.add(STONE, MAX_STACK * INVENTORY_SIZE);
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    screen.openFurnace(state);
    const result = screen.press("inv", 0, 0, { shift: true, double: false });
    check("焼けも燃えもしないものは動かない", result.changed === false && isEmpty(state.input));
  }

  // --- かまどが傷を運ぶ -----------------------------------------------------

  describe("かまどが傷を運ぶ");

  {
    // **先に試験場が効いていることを出す。** 傷 30 の木のツルハシを材料の枠へ
    // つまんで置いたときに `damage` が見えていなければ、この下は全部素通りする。
    const inventory = new Inventory();
    inventory.add(WOOD_PICKAXE, 1, 30);
    const screen = new CraftScreen(inventory);
    const state = createFurnace();
    screen.openFurnace(state);
    screen.press("inv", 0, 0);
    screen.release();
    screen.press("input", 0, 0);
    screen.release();
    console.log(
      `      試験場: ${itemName(WOOD_PICKAXE)} をつまんで材料の枠へ → ${state.input.item} / 傷 ${state.input.damage}`,
    );
    check(
      "つまんで置いたぶんは傷ごと入る（試験場が効いている）",
      state.input.item === WOOD_PICKAXE && state.input.damage === 30,
      String(state.input.damage),
    );
  }

  {
    // **壊すと中身が傷ごと地面に出る**（`breaking.ts` が素通しする値）。
    const furnaces = new Furnaces();
    const state = furnaces.at(7, 8, 9);
    state.input.item = WOOD_PICKAXE;
    state.input.count = 1;
    state.input.damage = 21;
    state.fuel.item = COAL;
    state.fuel.count = 2;
    const spilled = furnaces.remove(7, 8, 9);
    console.log(`      壊した中身: ${spilled.map((s) => `${itemName(s.item)} x${s.count} 傷 ${s.damage}`).join(" / ")}`);
    const tool = spilled.find((s) => s.item === WOOD_PICKAXE);
    const coal = spilled.find((s) => s.item === COAL);
    check("壊すと傷ごと落ちる", tool?.damage === 21, String(tool?.damage));
    check("道具でないものの傷は 0", coal?.damage === 0, String(coal?.damage));
  }

  {
    // **セーブの往復で残る**（3 枠とも位置がずれないこと）。9 要素は増やさない。
    const state = createFurnace();
    state.input.item = WOOD_PICKAXE;
    state.input.count = 1;
    state.input.damage = 4;
    state.output.item = WOOD_PICKAXE;
    state.output.count = 1;
    state.output.damage = 58;
    const flat = serializeFurnace(state);
    const wear = serializeFurnaceWear(state) as number[];
    console.log(`      セーブ: furnaces ${flat.length} 要素 / furnaceWear ${JSON.stringify(wear)}`);
    check("furnaces の 9 要素は増えていない", flat.length === 9, String(flat.length));
    check(
      "furnaceWear は input / fuel / output の 3 要素",
      wear.length === 3 && wear[0] === 4 && wear[1] === 0 && wear[2] === 58,
      wear.join(" / "),
    );

    const back = deserializeFurnace(flat, wear);
    check(
      "往復しても位置ごと残る",
      back.input.damage === 4 && back.fuel.damage === 0 && back.output.damage === 58,
      `${back.input.damage} / ${back.fuel.damage} / ${back.output.damage}`,
    );
  }

  {
    // **全部新品なら `furnaceWear` のキーが出ない**（減らない物だけでも出ない）。
    const furnaces = new Furnaces();
    const plain = furnaces.at(0, 0, 0);
    plain.input.item = IRON_ORE;
    plain.input.count = 3;
    const fresh = furnaces.at(0, 0, 1);
    fresh.input.item = WOOD_PICKAXE;
    fresh.input.count = 1;
    check("全部新品ならキーごと出ない", furnaces.serializeWear() === undefined, JSON.stringify(furnaces.serializeWear()));

    // 傷んだ台が 1 つでもあれば、その台だけが載る（空の台と新品の台は載らない）。
    furnaces.at(0, 0, 2).input.item = WOOD_PICKAXE;
    furnaces.peek(0, 0, 2)!.input.count = 1;
    furnaces.peek(0, 0, 2)!.input.damage = 12;
    const wear = furnaces.serializeWear() as Record<string, number[]>;
    console.log(`      傷んだ台だけが載る: ${JSON.stringify(wear)}`);
    check("キーは furnaces と同じで、傷んだ台だけ", Object.keys(wear).join(" ") === "0,0,2", Object.keys(wear).join(" "));

    const restored = new Furnaces();
    restored.deserialize(furnaces.serialize(), wear);
    check("往復してもその台だけ傷が戻る", restored.peek(0, 0, 2)?.input.damage === 12, String(restored.peek(0, 0, 2)?.input.damage));
  }

  {
    // **キーが無い古いセーブは全部新品。** 壊れた値でも落ちず、最大以上は
    // `最大 - 1` に丸まる（丸めるのは `durability.ts` の `wornValue()`）。
    const old = deserializeFurnace([WOOD_PICKAXE, 1, 0, 0, 0, 0, 0, 0, SMELT_TIME]);
    check("古いセーブは全部新品", (old.input.damage ?? 0) === 0, String(old.input.damage));

    const broken = deserializeFurnace(
      [WOOD_PICKAXE, 1, WOOD_PICKAXE, 1, WOOD_PICKAXE, 1, 0, 0, SMELT_TIME],
      // 数でない値・負・最大以上を 1 度に通す。
      ["x" as unknown as number, -4, 9999],
    );
    const worn = [broken.input.damage ?? 0, broken.fuel.damage ?? 0, broken.output.damage ?? 0];
    console.log(`      壊れた値 ["x", -4, 9999] → ${worn.join(" / ")}`);
    check("数でない値・負は新品に落ちる", worn[0] === 0 && worn[1] === 0, worn.join(" / "));
    check("最大以上は 最大 - 1 に丸まる", worn[2] === 58, String(worn[2]));
  }

  {
    // **シフトクリックの経路（`moveInto`）も傷を運ぶ。** ただし**いまは道具で届きません** ——
    // 焼けるものにも燃料にも道具が 1 本も無いので、`quickMove` はかまどを素通りします。
    // 届く日（本家のように鉄の道具が焼けるようになった日）に黙って新品に戻らないよう、
    // **呼び出しの形**を見張っておく（`rules/testing.md` の「呼び出しの側も見ること」）。
    const tools = [WOOD_PICKAXE].filter((item) => isSmeltable(item) || isFuel(item));
    console.log(`      焼ける／燃える道具: ${tools.length} 本（0 本なら道具はかまどを素通りする）`);
    check("いまは道具が焼けも燃えもしない", tools.length === 0, tools.map(itemName).join(" "));

    const screen = sourceOf("src/craftscreen.ts");
    check(
      "moveInto() が傷を載せている",
      /function moveInto[\s\S]*?carryWear\(into, damageOf\(from\)\)/.test(screen),
      "かまどへのシフトクリックが新品に戻す",
    );
  }
}
