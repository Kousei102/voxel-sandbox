import { emptyState, type DimensionState } from "../src/dimensions";
import {
  applyRestore,
  buildSave,
  collectState,
  forgetEverything,
  forgetWorld,
  parseSeed,
  restoredValues,
  savedShape,
} from "../src/session";
import type { SaveData } from "../src/storage";
import { MAX_HEALTH, MAX_HUNGER } from "../src/vitals";
import type { EditMap } from "../src/world";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** `main.ts` が渡すものと同じ形の偽物（`serialize()` を持つ何か）。 */
function sources(edits: EditMap = new Map()) {
  return {
    world: { editsForSave: () => edits },
    drops: { serialize: () => [7, 3, 1, 2, 3] },
    furnaces: { serialize: () => ({ "1,2,3": [1] }) },
    chests: { serialize: () => undefined },
  };
}

function parts(
  shape: { dim?: string; top: DimensionState; others?: Record<string, DimensionState> },
  bedDim?: string,
) {
  return {
    seed: 4242,
    player: { position: { x: 1.5, y: 70.25, z: -2.5 }, yaw: 0.5, pitch: -0.25, flying: true },
    time: 0.75,
    creative: false,
    health: 12,
    hunger: 7,
    inventory: [1, 2],
    craft: undefined,
    volume: 0.4,
    bed: [3, 64, 5],
    bedDim,
    shape,
  };
}

export function run(): void {
  describe("セーブの組み立て（session.ts）");

  // --- いま居る次元の持ち物 -------------------------------------------------

  {
    const edits: EditMap = new Map([["0,4,0", new Map([[17, 3]])]]);
    const state = collectState(sources(edits));
    check("改変がチャンクキーごとに平坦化される", JSON.stringify(state.edits) === '{"0,4,0":[17,3]}', JSON.stringify(state.edits));
    check("落とし物・かまど・チェストも同じ 1 か所で集まる", state.drops?.length === 5 && state.furnaces !== undefined);
    // **空のキーは省く**（`chests.serialize()` が undefined を返した場合）。
    check("空の器は undefined のまま", state.chests === undefined);
  }

  // --- 書き出す形 -----------------------------------------------------------

  {
    const save = buildSave(parts({ top: { edits: { "0,4,0": [17, 3] }, drops: [1], furnaces: undefined, chests: undefined } }));
    check("version は 1 のまま", save.version === 1, String(save.version));
    check("種はワールドの種（生成器の種ではない）", save.seed === 4242);
    check("位置と向きがそのまま入る", save.player.x === 1.5 && save.player.y === 70.25 && save.player.yaw === 0.5);
    check("飛行の状態も残る", save.player.flying === true);
    check("体力・空腹・音量が入る", save.health === 12 && save.hunger === 7 && save.volume === 0.4);
    check("リスポーン地点は上の階層", JSON.stringify(save.bed) === "[3,64,5]");
    // **地点の次元は `dim` と同じ作法**（オーバーワールドなら書かない）。
    // `beds.serializeDim()` が undefined を返すので、ここもキーごと消える。
    check("オーバーワールドで寝ていれば bedDim は出ない", save.bedDim === undefined, String(save.bedDim));
    check("オーバーワールドの改変は上の階層", JSON.stringify(save.edits) === '{"0,4,0":[17,3]}');
    // **オーバーワールドに居る限り、次元が入る前と同じ形**（`dim` も `dims` も出ない）。
    check("オーバーワールドでは dim も dims も出ない", save.dim === undefined && save.dims === undefined);
    const keys = Object.keys(save).filter((k) => save[k as keyof SaveData] !== undefined);
    check("空のキーは省かれる（craft）", !keys.includes("craft"), keys.join(" "));
  }

  {
    const nether: DimensionState = { edits: { "1,2,3": [4, 5] } };
    const save = buildSave(parts({ dim: "nether", top: emptyState(), others: { nether } }));
    check("別の次元に居ると dim が入る", save.dim === "nether", String(save.dim));
    check("預かっているぶんは dims の下", JSON.stringify(save.dims?.nether?.edits) === '{"1,2,3":[4,5]}');
    check("上の階層はオーバーワールドのまま空", Object.keys(save.edits).length === 0);
  }

  {
    // **地点は 1 つのまま**（`dims` の下に入れない）。増えるのは「どの次元の 1 点か」だけで、
    // ネザーで寝てオーバーワールドに戻っても、地点はネザーを指したまま上の階層に載る。
    const save = buildSave(parts({ top: emptyState() }, "nether"));
    check("ネザーで寝たら bedDim が入る", save.bedDim === "nether", String(save.bedDim));
    check("地点そのものは上の階層のまま", JSON.stringify(save.bed) === "[3,64,5]" && save.dims === undefined);
  }

  // --- 読み戻し -------------------------------------------------------------

  {
    const none = restoredValues(null);
    check("セーブが無ければ全部 null（既定のまま）", none.time === null && none.health === null && none.hunger === null);

    const broken = restoredValues({ time: Number.NaN, health: 0, hunger: undefined } as unknown as SaveData);
    check("壊れた時刻は触らない", broken.time === null);
    // **死んだまま保存されたら満タンで再開**（読み込み直後に死亡画面を出さない）。
    check("体力 0 は満タンで再開（null）", broken.health === null);
    check("空腹が無いセーブは満腹（null）", broken.hunger === null);

    const zero = restoredValues({ hunger: 0 } as SaveData);
    // **0 も受け取ること** —— 体力と違って、空腹 0 では死んでいない。
    check("空腹 0 は受け取る", zero.hunger === 0, String(zero.hunger));

    const over = restoredValues({ time: 0.5, health: 999, hunger: 999 } as SaveData);
    check("時刻はそのまま", over.time === 0.5);
    check("体力は上限で頭打ち", over.health === MAX_HEALTH, String(over.health));
    check("空腹も上限で頭打ち", over.hunger === MAX_HUNGER, String(over.hunger));
    const under = restoredValues({ hunger: -5 } as SaveData);
    check("負の空腹は 0 まで", under.hunger === 0, String(under.hunger));
  }

  {
    const shape = savedShape({
      dim: "nether",
      edits: { a: [1] },
      drops: [2],
      dims: { nether: { edits: {} } },
    } as unknown as SaveData);
    check("上の階層がオーバーワールドのぶんに振り分けられる", shape.top.edits?.a?.[0] === 1 && shape.top.drops?.[0] === 2);
    check("それ以外の次元は others へ", shape.others?.nether !== undefined);
    check("いま居る次元も渡る", shape.dim === "nether");
    const empty = savedShape(null);
    check("セーブが無くても形は返る", empty.dim === undefined && empty.top.edits === undefined);
  }

  // --- 読み込み直後に戻す（順番そのものが判断） -----------------------------

  {
    // `main.ts` が渡すものと同じ形の偽物。**何がどの順で呼ばれたか**を控える。
    const order: string[] = [];
    const targets = {
      dayNight: { setTime: (t: number) => order.push(`setTime(${t})`) },
      inventory: { deserialize: () => order.push("inventory") },
      craft: {
        deserialize: () => order.push("craft.deserialize"),
        returnAll: () => order.push("craft.returnAll"),
      },
      audio: { setVolume: (v: number) => order.push(`volume(${v})`) },
      vitals: { health: MAX_HEALTH, hunger: MAX_HUNGER },
    };
    const saved = {
      time: 0.3,
      health: 5,
      hunger: 6,
      creative: true,
      volume: 0.25,
      inventory: [1, 2],
      craft: [3, 4],
    } as unknown as SaveData;
    const result = applyRestore(saved, targets);
    console.log(`      戻した順: ${order.join(" → ")}`);
    // **盤面はインベントリのあとで返すこと。** 先に返すと、空のインベントリへ返してから
    // セーブぶんで上書きすることになり、開いたままタブを閉じた人の預かり物が消える。
    check(
      "盤面の預かり物はインベントリを入れたあとで返す",
      order.indexOf("inventory") < order.indexOf("craft.deserialize") &&
        order.indexOf("craft.deserialize") < order.indexOf("craft.returnAll"),
      order.join(" → "),
    );
    check("体力と空腹はセーブの値に戻る", targets.vitals.health === 5 && targets.vitals.hunger === 6);
    check("クリエイティブかどうかを返す（貼るのは main.ts）", result.creative);
    // 返したぶんは次の保存で `craft` のキーごと消えるので、保存の印を立てる合図が要る。
    check("預かり物があったことを返す", result.returned);
    check("音量は均してから渡る", order.includes("volume(0.25)"), order.join(" "));
  }

  {
    // セーブが無い（初回）。**体力も空腹も触らない**（満タンのまま）。
    const targets = {
      dayNight: { setTime: () => check("初回は時刻を触らない", false) },
      inventory: { deserialize: () => {} },
      craft: { deserialize: () => {}, returnAll: () => {} },
      audio: { setVolume: () => {} },
      vitals: { health: MAX_HEALTH, hunger: MAX_HUNGER },
    };
    const result = applyRestore(null, targets);
    check("初回はサバイバルで始まる", !result.creative);
    check("初回は預かり物なし", !result.returned);
    check("初回でも体力は満タンのまま", targets.vitals.health === MAX_HEALTH);
  }

  // --- 打ち込まれた種の読み方 -----------------------------------------------

  {
    check("数字はそのまま種になる", parseSeed(" 4242 ", 1) === 4242, String(parseSeed("4242", 1)));
    check("文字列は毎回同じ種になる", parseSeed("あ", 1) === parseSeed("あ", 2));
    check("違う文字列は違う種になる", parseSeed("あ", 1) !== parseSeed("い", 1));
    // **空欄なら時刻から**（押すたびに違うワールドになる）。
    check("空欄は時刻から作る", parseSeed("", 1) !== parseSeed("", 2));
    check("種は 32 ビットに収まる", parseSeed("99999999999", 1) >= 0);
  }

  // --- 別のワールドを始めるときの後始末 --------------------------------------

  {
    const called: string[] = [];
    const bag = {
      dims: { reset: () => called.push("dims") },
      beds: { clear: () => called.push("beds") },
      inventory: { clear: () => called.push("inventory") },
      craft: { discardAll: () => called.push("craft") },
      drops: { clear: () => called.push("drops") },
      furnaces: { clear: () => called.push("furnaces") },
      chests: { clear: () => called.push("chests") },
    };
    forgetWorld(bag);
    // **預かり物とリスポーン地点は必ず忘れる** —— 忘れると、前のワールドで別の次元に
    // 置いてきたものが新しいワールドに出てくる。
    check("作り直しでは預かり物と地点を忘れる", called.join(",") === "dims,beds", called.join(","));
    // **持ち物は消さない**（種を変えて作り直すだけで、集めたものは持ったまま）。
    check("作り直しでは持ち物を消さない", !called.includes("inventory"));

    called.length = 0;
    forgetEverything(bag);
    const missing = ["dims", "beds", "inventory", "craft", "drops", "furnaces", "chests"].filter(
      (name) => !called.includes(name),
    );
    // 1 つでも残すと、消したはずの持ち物が拾い直せる／移った先に置いてある。
    check("削除では器も地面も預かり物も全部空にする", missing.length === 0, missing.join(" "));
  }

  // --- 見張り ---------------------------------------------------------------

  {
    const source = sourceOf("src/session.ts");
    // 判断だけのファイル（`dimensions.ts` / `placing.ts` と同じ形）。
    for (const word of ["three", "document", "Mesh", "AudioContext", "localStorage"]) {
      check(`session.ts に ${word} が無い`, !source.includes(word));
    }
    // **`version` を上げないこと。** `load()` が弾くので、上げた瞬間に
    // 既存プレイヤーのワールドが全部読めなくなる（`rules/inventory-screen.md`）。
    check("version は 1 と書いてある", /version:\s*1\b/.test(source));
  }
}
