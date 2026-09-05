import type { ChestState, CraftSize, FurnaceState } from "./craftscreen";

/**
 * 画面（インベントリ・作業台・かまど・チェスト）の**開け閉ての手順だけ**。
 *
 * もとは `main.ts` の `openPanel()` と、それを呼ぶ 5 つの関数だった。
 * **手を止める → 出す → メニューを隠す → ロックを外す**の 4 手が揃っているかは、
 * `main.ts` に置いてあるあいだ**ブラウザを開くまで確かめられなかった**
 * （`CLAUDE.md` の「確かめられないものは、確かめられるものから切り離す」）。
 *
 * **DOM も three も `World` もここには入れないこと。** 受け口は `PanelHost` で、
 * 中身が何かは知らない（`boss.ts` が `BossFacts` で受けるのと同じ作法）。
 */

/**
 * 画面に頼むぶんだけ。中身は `inventoryui.ts` の `InventoryScreen` だが、
 * **import はしない**（型だけ `craftscreen.ts` から借りる。`use.ts` が
 * `ProjectileKind` を `import type` で取っているのと同じ形）。
 */
export interface PanelScreen {
  readonly isOpen: boolean;
  show(size: CraftSize): void;
  showCreative(): void;
  showFurnace(state: FurnaceState): void;
  showChest(state: ChestState): void;
  hide(): void;
}

/** 開け閉めのときに触る外の世界。**全部 `main.ts` 側の DOM への受け口**。 */
export interface PanelHost {
  readonly screen: PanelScreen;
  /** 掘りかけ・食べかけ・引きかけを無かったことにする（`breaking` は向こうの状態）。 */
  stopHands(): void;
  /** `ui.ts` の `hud.setPlaying()`。 */
  setPlaying(playing: boolean, menuVisible: boolean): void;
  /** `ui.ts` の `hud.refresh()`。 */
  refresh(): void;
  /** ポインタロックを取り直す（`requestLock()`）。 */
  lock(): void;
  /** ポインタロックを外す（`document.exitPointerLock()`）。 */
  unlock(): void;
}

export class Panels {
  constructor(private readonly host: PanelHost) {}

  /**
   * 画面を 1 つ開く。**開ける前に手を止めるのはどれも同じ**なのでここに集める
   * （写すと、画面を足したときに掘りかけ・食べかけが残る形で 1 つだけ抜ける）。
   *
   * **開いているあいだは二重に開かない。** 手を止め直すことも、
   * すでに開いている画面の中身を差し替えることもしない。
   *
   * クリア画面（`hud.showVictory()`）だけは `screen` の外に出るので、
   * `main.ts` がここへ直に注文を渡す。
   */
  open(show: () => void): void {
    const host = this.host;
    if (host.screen.isOpen) return;
    host.stopHands();
    show();
    host.setPlaying(false, false);
    host.unlock();
  }

  /** インベントリ（2）または作業台（3）。 */
  openInventory(size: CraftSize): void {
    this.open(() => this.host.screen.show(size));
  }

  /**
   * クリエイティブの一覧（`E`）。**器が要らない**のが他の 3 つとの違いで、
   * 並ぶものも押したときの規則も `craftscreen.ts` が持っている。
   */
  openCreative(): void {
    this.open(() => this.host.screen.showCreative());
  }

  /**
   * かまど。**中身を引くのは呼ぶ側**（`furnaces.at()`）—— ここが `world` を
   * 持った瞬間、画面の手順を確かめるのに世界を作る羽目になる。
   */
  openFurnace(state: FurnaceState): void {
    this.open(() => this.host.screen.showFurnace(state));
  }

  /** チェスト。かまどと同じで、**隣り合っているかを見るのは `chests.open()`**。 */
  openChest(state: ChestState): void {
    this.open(() => this.host.screen.showChest(state));
  }

  /**
   * 閉じてロックし直す。**開いているときだけ**（閉じているのに `hide()` を
   * 呼ぶと、ロックの取り直しが要らない場面で走って画面が飛ぶ）。
   */
  close(): void {
    const host = this.host;
    if (!host.screen.isOpen) return;
    host.screen.hide();
    host.refresh();
    host.lock();
  }
}

/**
 * ロックが外れたときにメインメニューを出すか。
 *
 * **`playing` は呼ぶ側**（`main.ts` の `pointerlockchange`）。ここが見るのは
 * 「別の画面がロックを外したのではないか」の 3 つだけで、**1 つ落とすと
 * その画面の上にメニューが重なって読めなくなる**（クリア画面で実際に踏んだ）。
 *
 * **受けるのは「閉じている／生きている」の側**（`!` は呼ぶ側に置いたまま）。
 * `test/ui.test.ts` が `main.ts` に `!hud.victoryOpen` が残っているかを
 * **文字列で**見張っていて、**あれはドラゴンを倒した人だけが踏む場所の見張り**
 * なので、こちらへ畳んでしまうと外しても誰も気付けなくなる。
 * ここは**畳まずに、3 つ揃っていることだけ**を持つ。
 */
export function menuVisibleWhenUnlocked(f: {
  readonly screenClosed: boolean;
  readonly alive: boolean;
  readonly victoryClosed: boolean;
}): boolean {
  return f.screenClosed && f.alive && f.victoryClosed;
}
