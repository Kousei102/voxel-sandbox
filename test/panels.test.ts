import { createChest } from "../src/chests";
import type { ChestState, CraftSize, FurnaceState } from "../src/craftscreen";
import { Panels, menuVisibleWhenUnlocked, type PanelHost, type PanelScreen } from "../src/panels";
import { createFurnace } from "../src/smelting";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 画面（インベントリ・作業台・かまど・チェスト・クリア画面）の**開け閉めの手順**。
 *
 * もとは `main.ts` にあったので、**手を止める → 出す → メニューを隠す →
 * ロックを外す**の 4 手が揃っているかは**ブラウザを開くまで確かめられなかった**。
 * 出したので、4 経路ともここで見られる（`CLAUDE.md` の背骨）。
 *
 * 見るのは**呼ぶ順と、呼ばないこと**の 2 つだけ。**画面の中身は見ない**
 * （それは `craftscreen.ts` の担当）。
 */
export function run(): void {
  describe("画面の開け閉め（panels.ts）");

  /** 呼ばれた順を控える偽物。`isOpen` は本物と同じく `show*` で立ち、`hide()` で降りる。 */
  function fakeHost(): { host: PanelHost; log: string[] } {
    const log: string[] = [];
    let open = false;
    const screen: PanelScreen = {
      get isOpen() {
        return open;
      },
      show(size: CraftSize) {
        open = true;
        log.push(`show(${size})`);
      },
      showCreative() {
        open = true;
        log.push("showCreative");
      },
      showFurnace(state: FurnaceState) {
        open = true;
        log.push(`showFurnace(残り ${state.burnLeft} 秒)`);
      },
      showChest(state: ChestState) {
        open = true;
        log.push(`showChest(${state.slots.length})`);
      },
      hide() {
        open = false;
        log.push("hide");
      },
    };
    const host: PanelHost = {
      screen,
      stopHands: () => log.push("stopHands"),
      setPlaying: (playing, menuVisible) => log.push(`setPlaying(${playing},${menuVisible})`),
      refresh: () => log.push("refresh"),
      lock: () => log.push("lock"),
      unlock: () => log.push("unlock"),
    };
    return { host, log };
  }

  // かまど・チェストの中身は**呼ぶ側が引いたもの**（`furnaces.at()` / `chests.open()`）。
  // ここは受け取って渡すだけなので、空の器を 1 つずつ作って渡す。
  const furnace = createFurnace();
  const chest = createChest();

  // --- 1. どれも、開ける前に手を止める ---------------------------------------

  {
    // 4 経路を 1 本ずつ開き、**`stopHands` が `show*` より前に来るか**を見る。
    // 写して書くと、画面を足したときに掘りかけ・食べかけが残る形で 1 つだけ抜ける。
    const opens: [string, (p: Panels) => void, string][] = [
      ["インベントリ", (p) => p.openInventory(2), "show(2)"],
      ["クリエイティブ", (p) => p.openCreative(), "showCreative"],
      ["かまど", (p) => p.openFurnace(furnace), "showFurnace(残り 0 秒)"],
      ["チェスト", (p) => p.openChest(chest), "showChest(27)"],
    ];
    const bad: string[] = [];
    for (const [name, open, shown] of opens) {
      const { host, log } = fakeHost();
      open(new Panels(host));
      console.log(`      ${name}: ${log.join(" → ")}`);
      const stopped = log.indexOf("stopHands");
      const showed = log.indexOf(shown);
      if (stopped !== 0 || showed !== 1) bad.push(name);
    }
    check("4 つの画面はどれも、開ける前に手を止める", bad.length === 0, bad.join(" / "));
  }

  // --- 2. 開いているあいだは二重に開かない -----------------------------------

  {
    // 2 回目は**何も起きない**こと。手を止め直すのも、中身を差し替えるのも駄目
    // （かまどを開いたままチェストを叩いても、かまどが出たままになる）。
    const { host, log } = fakeHost();
    const panels = new Panels(host);
    panels.openInventory(2);
    const afterFirst = log.length;
    panels.openChest(chest);
    panels.openCreative();
    console.log(`      1 回目のあと ${afterFirst} 件 / 2 回叩いたあと ${log.length} 件`);
    console.log(`      ${log.join(" → ")}`);
    check(
      "開いているあいだは二重に開かない（手も止め直さない）",
      log.length === afterFirst,
      log.slice(afterFirst).join(" / "),
    );
  }

  // --- 3. 開けるとロックが外れ、閉じるとロックし直す --------------------------

  {
    // **開けたら `unlock`、閉じたら `lock`。** どちらかを落とすと、画面の中で
    // 見回しが動く／閉じても操作が戻らない、という形でしか気付けない。
    const { host, log } = fakeHost();
    const panels = new Panels(host);
    panels.openInventory(3);
    const opened = [...log];
    panels.close();
    console.log(`      開ける: ${opened.join(" → ")}`);
    console.log(`      閉じる: ${log.slice(opened.length).join(" → ")}`);
    check(
      "開けるとロックが外れ、閉じるとロックし直す",
      opened.at(-1) === "unlock" && log.at(-1) === "lock" && log.includes("refresh"),
      log.join(" / "),
    );
    // メニューは開けた時点で隠れていること（`setPlaying(false,false)`）。
    check("開けるあいだにメニューを出さない", opened.includes("setPlaying(false,false)"));
  }

  // --- 4. 閉じるのは開いているときだけ ---------------------------------------

  {
    // 閉じているのに `hide()` を呼ぶと、**ロックの取り直しが要らない場面で走る**
    // （タイトル画面で Esc を叩くと勝手にロックを掴みに行く）。
    const { host, log } = fakeHost();
    const panels = new Panels(host);
    panels.close();
    panels.close();
    console.log(`      閉じたまま 2 回閉じた: ${log.length} 件 [${log.join(" → ")}]`);
    check("閉じるのは開いているときだけ（閉じているのに hide() を呼ばない）", log.length === 0);
  }

  // --- 5. ロックが外れたときメニューを出すか ---------------------------------

  {
    // `main.ts` の `pointerlockchange` から出した 3 つ。**`playing` は呼ぶ側**で、
    // `!` も呼ぶ側に置いたまま（`test/ui.test.ts` の見張りを残すため。下の注記）。
    type Facts = { screenClosed: boolean; alive: boolean; victoryClosed: boolean };
    const open: Facts = { screenClosed: true, alive: true, victoryClosed: true };
    const cases: [string, Facts, boolean][] = [
      ["どれも閉じている", open, true],
      ["画面が開いている", { ...open, screenClosed: false }, false],
      ["死んでいる", { ...open, alive: false }, false],
      ["クリア画面", { ...open, victoryClosed: false }, false],
    ];
    const wrong: string[] = [];
    for (const [name, facts, want] of cases) {
      const got = menuVisibleWhenUnlocked(facts);
      console.log(`      ${name}: ${got ? "メニューを出す" : "出さない"}`);
      if (got !== want) wrong.push(name);
    }
    check(
      "ロックが外れたときメニューを出すのは、画面も死亡もクリアも閉じているときだけ",
      wrong.length === 0,
      wrong.join(" / "),
    );
  }

  // --- 見張り: 確かめられないものが紛れ込んでいないこと -----------------------

  {
    // `panels.ts` に DOM・three・`World` が入った瞬間、開け閉めを確かめるのに
    // ブラウザか世界が要るようになる（`CLAUDE.md` の対の表）。
    const source = sourceOf("src/panels.ts");
    const leaked = ["document", "HTMLElement", "Mesh", "new World"].filter((w) => source.includes(w));
    console.log(`      panels.ts に紛れているもの: ${leaked.length} 件`);
    check("panels.ts が判断だけでできている", leaked.length === 0, leaked.join(" "));

    // 出したのに `main.ts` にも書き戻した、を止める。
    const main = sourceOf("src/main.ts");
    const backInMain = ["function openPanel(", "function closeInventory("].filter((w) =>
      main.includes(w),
    );
    check("main.ts に開け閉めが戻っていない", backInMain.length === 0, backInMain.join(" "));
    check("main.ts は出した手順を呼び直している", main.includes("panels.open"));
  }
}
