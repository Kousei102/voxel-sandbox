import { decideClick, decideKey, mobIsNearer, type KeyAction, type KeyFacts } from "../src/controls";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 並の状況（プレイ中・画面は閉じている・サバイバル）。違うところだけ上書きする。 */
function facts(over: Partial<KeyFacts> = {}): KeyFacts {
  return { screenOpen: false, playing: true, creative: false, ...over };
}

function describeAction(act: KeyAction): string {
  const index = "index" in act ? `(${act.index})` : "";
  return `${act.kind}${index}${act.prevent ? " +止める" : ""}`;
}

export function run(): void {
  describe("キーとマウスの振り分け");

  // --- 切り分け（`controls.ts` は判断だけを持つ。`use.ts` と同じ形） ---
  const source = sourceOf("src/controls.ts");
  const leaked = [
    "document.",
    "getElementById",
    "KeyboardEvent",
    "MouseEvent",
    "AudioContext",
    "Math.random(",
    "setVoxel",
    // 持ち物や世界を知り始めると、押した瞬間の判断がヘッドレスで確かめられなくなる。
    'from "three"',
    'from "./inventory"',
    'from "./world"',
  ].filter((name) => source.includes(name));
  check("controls.ts は判断だけを持つ（DOM も持ち物も知らない）", leaked.length === 0, leaked.join(" "));

  // もとは `main.ts` の `keydown` と `mousedown` にあった `if` の列。
  // **戻っていないこと**を語で見る（`use.ts` の `isBucket(` と同じ作法）。
  const main = sourceOf("src/main.ts");
  const backInMain = [
    'startsWith("Digit")',
    '=== "KeyE"',
    '=== "Escape"',
    '=== "KeyQ"',
    "target.distance <",
  ].filter((name) => main.includes(name));
  check("main.ts に振り分けが戻っていない", backInMain.length === 0, backInMain.join(" "));

  // --- 画面が開いている間（できるのは 3 つだけ） ---
  const open = facts({ screenOpen: true });
  const openTable: [string, string][] = [
    ["KeyE", "閉じる"],
    ["Escape", "閉じる"],
    ["KeyQ", "掴んだ山を捨てる"],
    ["Digit3", "ホットバーと入れ替え"],
    ["KeyW", "何もしない"],
    ["Space", "何もしない"],
    ["KeyF", "何もしない"],
  ];
  console.log("      画面が開いている間");
  for (const [code, name] of openTable) {
    console.log(`      ${code.padEnd(8)} ${name.padEnd(20)} ${describeAction(decideKey(code, open))}`);
  }
  check("E と Escape で閉じる", decideKey("KeyE", open).kind === "close" && decideKey("Escape", open).kind === "close");
  check("Q は掴んでいる山を捨てる", decideKey("KeyQ", open).kind === "discardHeld");
  {
    const swap = decideKey("Digit3", open);
    check(
      "数字キーはホットバーと入れ替え（0 起点に直る）",
      swap.kind === "swapHotbar" && swap.index === 2,
      describeAction(swap),
    );
  }
  // **移動の鍵を通さないこと。** 通すと、盤面を見ている間に歩き出す。
  const moved = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"].filter(
    (code) => decideKey(code, open).kind !== "none",
  );
  check("画面が開いている間は歩かない", moved.length === 0, moved.join(" "));
  // デバッグの鍵も通さない（盤面の裏でモブが湧く）。
  check("画面が開いている間はデバッグの鍵も効かない", decideKey("KeyM", open).kind === "none");

  // --- プレイ中 ---
  const play = facts();
  const playTable: [string, string][] = [
    ["Digit1", "1 番を選ぶ"],
    ["Digit9", "9 番を選ぶ"],
    ["KeyE", "手持ちを開く"],
    ["KeyQ", "選んだ山を捨てる"],
    ["KeyF", "飛ぶ／歩く"],
    ["KeyM", "モブを 1 体"],
    ["KeyN", "飛び道具を 1 つ"],
    ["F3", "F3 の表示"],
    ["Space", "跳ぶ"],
    ["KeyW", "前へ"],
  ];
  console.log("      プレイ中");
  for (const [code, name] of playTable) {
    console.log(`      ${code.padEnd(8)} ${name.padEnd(20)} ${describeAction(decideKey(code, play))}`);
  }
  {
    const first = decideKey("Digit1", play);
    const last = decideKey("Digit9", play);
    check(
      "数字キーは 1..9 がホットバーの 0..8",
      first.kind === "select" && first.index === 0 && last.kind === "select" && last.index === 8,
      `${describeAction(first)} / ${describeAction(last)}`,
    );
  }
  // **`Digit` は `switch` より先に見ること**（あとに回すと移動の鍵へ流れる）。
  check("数字キーは移動の鍵にならない", decideKey("Digit5", play).kind !== "move");
  // 0 は無い（ホットバーは 9 枠）。
  check("Digit0 は移動の鍵として流す", decideKey("Digit0", play).kind === "move");
  check("E は手持ちの画面", decideKey("KeyE", play).kind === "openInventory");
  check("クリエイティブの E は一覧", decideKey("KeyE", facts({ creative: true })).kind === "openCreative");
  check("Q は選んだ山を捨てる", decideKey("KeyQ", play).kind === "discardSelected");
  check("F3 は表示の切り替え", decideKey("F3", play).kind === "toggleDebug");
  check("W は移動の鍵として流す", decideKey("KeyW", play).kind === "move");

  // --- 既定の動きを止めるか（`prevent`） ---
  // **Space を止めること** —— 止めないと、跳ぶたびに画面が下へ飛ぶ。
  check("Space は移動の鍵だが既定は止める", decideKey("Space", play).kind === "move" && decideKey("Space", play).prevent);
  check("W では既定を止めない", !decideKey("KeyW", play).prevent);
  check("F3 は既定を止める（開発者ツールを開かせない）", decideKey("F3", play).prevent);
  check("数字キーでは既定を止めない", !decideKey("Digit1", play).prevent);

  // --- プレイ中でないとき ---
  const idle = facts({ playing: false });
  const alive = ["KeyE", "KeyQ", "KeyW", "Space", "F3", "Digit1"].filter(
    (code) => decideKey(code, idle).kind !== "none",
  );
  check("メニューを見ている間はどのキーも効かない", alive.length === 0, alive.join(" "));

  // --- マウス ---
  console.log("      マウス（0=左 1=中 2=右）");
  const clicks: [string, number, number, number, boolean][] = [
    // 名前, ボタン, モブまで, ブロックまで, クリエイティブ
    ["モブが手前", 0, 2, 4.5, false],
    ["ブロックが手前", 0, 4.5, 2, false],
    ["モブだけ（空を背にしている）", 0, 3, Infinity, false],
    ["何も無い", 0, Infinity, Infinity, false],
    ["クリエイティブで掘る", 0, Infinity, 2, true],
    ["中クリック", 1, Infinity, 2, false],
    ["中クリックで空を狙う", 1, Infinity, Infinity, false],
    ["右クリック", 2, Infinity, Infinity, false],
  ];
  for (const [name, button, mobDistance, blockDistance, creative] of clicks) {
    const act = decideClick(button, { creative, mobDistance, blockDistance });
    console.log(`      ${name.padEnd(28)} ${act}`);
  }
  const click = (button: number, mobDistance: number, blockDistance: number, creative = false) =>
    decideClick(button, { creative, mobDistance, blockDistance });

  // **手前にあるほうを取る。** 逆にすると、目の前のゾンビを殴れずに向こうの壁を掘る。
  check("モブが手前なら殴る", click(0, 2, 4.5) === "attack");
  check("ブロックが手前なら掘る", click(0, 4.5, 2) === "mine");
  // **狙っているブロックが無くても降りないこと**（空を背にしたモブを殴れなくなる）。
  check("空を背にしたモブも殴れる", click(0, 3, Infinity) === "attack");
  check("何も無ければ何も起きない", click(0, Infinity, Infinity) === "none");
  check("クリエイティブは 1 クリックで壊す", click(0, Infinity, 2, true) === "break");
  check("サバイバルは掘り始める（押しっぱなし）", click(0, Infinity, 2, false) === "mine");
  check("中クリックはスポイト", click(1, Infinity, 2) === "pick");
  check("狙う先が無ければスポイトは効かない", click(1, Infinity, Infinity) === "none");
  // 右クリックの先（11 通り）は `use.ts` の担当。ここは「右クリックだ」までしか言わない。
  check("右クリックは use.ts へ", click(2, Infinity, Infinity) === "use");
  check("知らないボタンは何も起きない", click(3, 1, 1) === "none");

  // --- 手前に居るのはモブか（左クリックと右クリックが共有する 1 本） ---
  // **式を 2 か所に書かないための関数**。`main.ts` が右クリック用に比較を書き直すと、
  // 殴れる間合いと刈れる間合いが食い違い、「殴れるのに刈れない羊」ができる。
  const nearer = (mobDistance: number, blockDistance: number) =>
    mobIsNearer({ creative: false, mobDistance, blockDistance });
  console.log(
    `      mobIsNearer: モブが手前 ${nearer(2, 4.5)} / ブロックが手前 ${nearer(4.5, 2)} / ` +
      `どちらも無い ${nearer(Infinity, Infinity)} / モブだけ ${nearer(3, Infinity)}`,
  );
  check("モブが手前なら true", nearer(2, 4.5));
  check("ブロックが手前なら false", !nearer(4.5, 2));
  // **狙う先が無くても降りないこと**（空を背にしたモブが殴れなくなる／刈れなくなる）。
  check("空を背にしたモブも手前あつかい", nearer(3, Infinity));
  check("どちらも無ければ false", !nearer(Infinity, Infinity));
  // 左クリックがこの 1 本に乗っていること（写した式が残っていたら、ここは合っても
  // `decideClick` だけ別の答えを返せる）。
  check(
    "左クリックの「殴る」も同じ 1 本に乗っている",
    [
      [2, 4.5],
      [4.5, 2],
      [3, Infinity],
      [Infinity, Infinity],
    ].every(([m, b]) => (click(0, m, b) === "attack") === nearer(m, b)),
  );
}
