import { emptyState, type DimensionState } from "../src/dimensions";
import { buildSave, collectState, restoredValues, savedShape } from "../src/session";
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

function parts(shape: { dim?: string; top: DimensionState; others?: Record<string, DimensionState> }) {
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
