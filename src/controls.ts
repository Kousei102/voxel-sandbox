/**
 * **右クリック以外の入力の振り分け**（右クリックの中身は `use.ts` の `decideUse()`）。
 * 判断だけのファイルで、three も DOM も `World` も持ち物も出てこない。
 *
 * もとは `main.ts` の `keydown` と `mousedown` にあった `if` と `switch` の列。
 * **`use.ts` とまったく同じ理由でここに出してあります** —— 並び順そのものが判断で、
 * 崩れても型では止まらず、ブラウザを開いて実際に押すまで気付けません:
 *
 * - **画面（インベントリ・かまど・チェスト・クリエイティブ）が開いている間が先。**
 *   あとにすると、盤面に物を置くつもりの数字キーで**ホットバーが切り替わり**、
 *   `Q` は掴んでいる山ではなく**手に持っているブロック**を投げます
 * - **モブがブロックより手前なら殴る。** 逆にすると、モブの向こうのブロックを
 *   掘り始めてしまい、**目の前のゾンビを殴れません**
 * - **`Digit` は `switch` より先。** あとに回すと 1..9 が `player.setKey()` へ流れます
 *
 * ここが返すのは**注文だけ**で、画面を開く・音を鳴らす・持ち物を減らすのは `main.ts`。
 * だから「どの状況で何が起きるか」を丸ごとヘッドレスで確かめられます。
 */

/** キーを押した瞬間の事実。**`main.ts` は集めて渡すだけ**（判断はこの中）。 */
export interface KeyFacts {
  /** 画面（インベントリ・かまど・チェスト・クリエイティブ）が開いているか。 */
  readonly screenOpen: boolean;
  /** ポインタがロックされていて、プレイ中か。 */
  readonly playing: boolean;
  readonly creative: boolean;
}

/**
 * キーの注文。**`prevent` はブラウザの既定の動きを止めるか**で、
 * `main.ts` が `event.preventDefault()` を呼ぶかどうかそのものです
 * （`Space` で画面が下へ飛ぶ・`F3` で開発者ツールが開くのを止めます）。
 */
export type KeyAction =
  /** 何もしない（既定の動きも止めない）。 */
  | { readonly kind: "none"; readonly prevent: false }
  /** 画面を閉じる。 */
  | { readonly kind: "close"; readonly prevent: true }
  /** 画面の中で掴んでいる山を捨てる。 */
  | { readonly kind: "discardHeld"; readonly prevent: true }
  /** カーソルの下のスロットとホットバーの `index` 番目を入れ替える。 */
  | { readonly kind: "swapHotbar"; readonly index: number; readonly prevent: true }
  /** ホットバーの `index` 番目を選ぶ。 */
  | { readonly kind: "select"; readonly index: number; readonly prevent: false }
  /** 手持ちの画面を開く（2x2）。 */
  | { readonly kind: "openInventory"; readonly prevent: true }
  /** クリエイティブの一覧を開く。 */
  | { readonly kind: "openCreative"; readonly prevent: true }
  /** プレイ中の `Q`（選んでいる山を投げる）。 */
  | { readonly kind: "discardSelected"; readonly prevent: true }
  | { readonly kind: "toggleFly"; readonly prevent: false }
  /** デバッグ: 狙った所にモブを 1 体。 */
  | { readonly kind: "spawnMob"; readonly prevent: false }
  /** デバッグ: 視線の向きへ飛び道具を 1 つ。 */
  | { readonly kind: "spawnShot"; readonly prevent: false }
  | { readonly kind: "toggleDebug"; readonly prevent: true }
  /** 移動の鍵。`player.setKey()` へそのまま流す。 */
  | { readonly kind: "move"; readonly prevent: boolean };

const NOTHING: KeyAction = { kind: "none", prevent: false };

/** `Digit1`..`Digit9` なら 0..8、それ以外は -1。 */
function hotbarIndex(code: string): number {
  if (!code.startsWith("Digit")) return -1;
  const n = Number(code.slice(5));
  return n >= 1 && n <= 9 ? n - 1 : -1;
}

/**
 * キーを押したときに何をするかを決める。
 *
 * **画面が開いている間にできるのは 3 つだけ**（閉じる・捨てる・ホットバーへ入れ替える）。
 * 移動の鍵をここで通すと、画面を見ている間に歩き出します。
 */
export function decideKey(code: string, facts: KeyFacts): KeyAction {
  if (facts.screenOpen) {
    if (code === "KeyE" || code === "Escape") return { kind: "close", prevent: true };
    if (code === "KeyQ") return { kind: "discardHeld", prevent: true };
    const slot = hotbarIndex(code);
    // 行き先はカーソルの下のスロット。それを覚えているのは `craftscreen.ts` 側。
    if (slot >= 0) return { kind: "swapHotbar", index: slot, prevent: true };
    return NOTHING;
  }

  if (!facts.playing) return NOTHING;

  // **`switch` より先に見ること**（あとに回すと 1..9 が移動の鍵へ流れます）。
  const slot = hotbarIndex(code);
  if (slot >= 0) return { kind: "select", index: slot, prevent: false };

  switch (code) {
    case "KeyE":
      // クリエイティブでは全アイテムの一覧。**作業台は今までどおり 3x3 のクラフト画面**
      // （あちらは右クリックなので `use.ts` の担当）。
      return facts.creative
        ? { kind: "openCreative", prevent: true }
        : { kind: "openInventory", prevent: true };
    case "KeyQ":
      // 落としたものは地面に残るので拾い直せる（`drops.ts`）。
      // Ctrl（または Shift）で山ごと捨てるかどうかは `inventory.ts` の `bulkDiscard()`。
      return { kind: "discardSelected", prevent: true };
    case "KeyF":
      return { kind: "toggleFly", prevent: false };
    case "KeyM":
      return { kind: "spawnMob", prevent: false };
    case "KeyN":
      return { kind: "spawnShot", prevent: false };
    case "F3":
      return { kind: "toggleDebug", prevent: true };
    case "Space":
      // 移動の鍵だが、既定の動き（画面が下へ飛ぶ）は止める。
      return { kind: "move", prevent: true };
    default:
      return { kind: "move", prevent: false };
  }
}

/** マウスのボタンを押した瞬間の事実。距離は呼ぶ側が測る（光線も `mobs.pick()` も外）。 */
export interface ClickFacts {
  readonly creative: boolean;
  /** **手前のモブまでの距離。居なければ `Infinity`。** */
  readonly mobDistance: number;
  /** **狙っているブロックまでの距離。無ければ `Infinity`。** */
  readonly blockDistance: number;
}

/**
 * マウスの注文。**`use` は右クリック**で、その先の 12 通りは `use.ts` が決めます。
 * ここが分けるのは「殴る／掘る／スポイト／右クリック」の 4 つだけ。
 */
export type ClickAction =
  | "none"
  /** モブを殴る。 */
  | "attack"
  /** クリエイティブの 1 クリック 1 個。 */
  | "break"
  /** サバイバルの押しっぱなし（掘り始める）。 */
  | "mine"
  /** 中クリックのスポイト。 */
  | "pick"
  /** 右クリック（`decideUse()` へ）。 */
  | "use";

/**
 * **手前に居るのはモブか（狙っているブロックより近いか）。**
 *
 * 左クリック（殴る／掘る）と右クリック（刈る／置く）が**同じ 1 本を呼びます** ——
 * `main.ts` に距離の比較を書き始めると、殴れる間合いと刈れる間合いが食い違い、
 * 「殴れるのに刈れない羊」がブラウザを開くまで分かりません。
 *
 * 距離はどちらも視点からの距離で測ること。
 */
export function mobIsNearer(facts: ClickFacts): boolean {
  return facts.mobDistance < facts.blockDistance;
}

/**
 * マウスのボタンを押したときに何をするかを決める。
 *
 * **狙っているブロックが無くても降りないこと** —— 何も無い所の向こうにモブが居ます
 * （空を背にしたゾンビを殴れなかったのがこれ）。
 */
export function decideClick(button: number, facts: ClickFacts): ClickAction {
  if (button === 0) {
    // **手前にあるほうを取る**（式は `mobIsNearer()` の 1 本。2 か所に書かない）。
    if (mobIsNearer(facts)) return "attack";
    if (facts.blockDistance === Infinity) return "none";
    return facts.creative ? "break" : "mine";
  }
  // スポイトは狙っているブロックが要る（何を吸うか決まらない）。
  if (button === 1) return facts.blockDistance === Infinity ? "none" : "pick";
  if (button === 2) return "use";
  return "none";
}
