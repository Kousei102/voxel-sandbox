import type { BossBar } from "./boss";
import { HOTBAR_SIZE, isEmpty, type Inventory, type Slot } from "./inventory";
import { itemCssColor, itemName } from "./items";

/**
 * スロット 1 個分の中身を描く。インベントリ画面と共用。
 *
 * `showCount` を false にすると数字だけ出さない（**クリエイティブの一覧のため**。
 * 全部の枠に「64」が並ぶと読みづらいので、Minecraft と同じで数字は伏せる。
 * 何個来るかは `title`（ホバーの吹き出し）に出るので、情報は落ちない）。
 */
export function paintSlot(el: HTMLElement, slot: Slot | null, showCount = true): void {
  const filled = slot !== null && !isEmpty(slot);
  el.classList.toggle("filled", filled);
  const swatch = el.querySelector<HTMLElement>(".swatch");
  const count = el.querySelector<HTMLElement>(".count");
  const label = el.querySelector<HTMLElement>(".label");
  if (swatch) swatch.style.background = filled ? itemCssColor(slot.item) : "transparent";
  if (count) count.textContent = filled && showCount && slot.count > 1 ? String(slot.count) : "";
  if (label) label.textContent = filled ? itemName(slot.item) : "";
  el.title = filled ? `${itemName(slot.item)} x${slot.count}` : "";
}

export function slotMarkup(extra = ""): string {
  return (
    `${extra}<span class="swatch"></span><span class="count"></span><span class="label"></span>`
  );
}

/**
 * ハート・肉・気泡の数。体力 20 = ハート 10 個なので、1 個で 2 ぶん。
 * **空腹も同じ 0..20 なので、同じ数・同じ関数で描ける。**
 */
export const HEART_COUNT = 10;
const BUBBLE_COUNT = 10;

export type HeartState = "full" | "half" | "empty";

/**
 * 体力（または空腹）から 10 個ぶんの状態を出す。CSS は見た目しか検証できないので、
 * 「半分がいつ出るか」だけはここに切り出してテストで押さえる。
 * **空腹のために別の関数を作らないこと** —— 刻みが同じなので、増やすと片方だけ壊れる。
 */
export function heartStates(health: number, count = HEART_COUNT): HeartState[] {
  return Array.from({ length: count }, (_, i) => {
    const filled = health - i * 2;
    return filled >= 2 ? "full" : filled >= 1 ? "half" : "empty";
  });
}

/**
 * 通知の帯を自分で作って body の直下に置く。
 *
 * **メニューやインベントリのパネルの中に置かないこと。** それらは `class="hidden"` で
 * 丸ごと消えるので、プレイ中に出したはずの通知が見えず、メニューを開いた人にだけ
 * 遅れて見える（実際にそうなっていた）。index.html に書かずここで作っているのは、
 * 置き場所を間違えられないようにするため。
 */
function createStatusBar(): HTMLElement {
  const el = document.createElement("div");
  el.id = "status";
  document.body.appendChild(el);
  return el;
}

export class Hud {
  private readonly slots: HTMLElement[] = [];
  private readonly hearts: HTMLElement[] = [];
  private readonly meats: HTMLElement[] = [];
  private readonly bubbles: HTMLElement[] = [];
  private readonly debug = document.getElementById("debug") as HTMLElement;
  private readonly hud = document.getElementById("hud") as HTMLElement;
  private readonly crosshair = document.getElementById("crosshair") as HTMLElement;
  private readonly loading = document.getElementById("loading") as HTMLElement;
  private readonly status = createStatusBar();
  private readonly menu = document.getElementById("menu") as HTMLElement;
  private readonly vitals = document.getElementById("vitals") as HTMLElement;
  private readonly hungerRow = document.getElementById("hunger") as HTMLElement;
  private readonly bubbleRow = document.getElementById("bubbles") as HTMLElement;
  private readonly hurt = document.getElementById("hurt") as HTMLElement;
  private readonly bossBar = document.getElementById("bossbar") as HTMLElement;
  private readonly bossLabel = document.getElementById("bosslabel") as HTMLElement;
  private readonly bossFill = document.getElementById("bossfill") as HTMLElement;
  private readonly victory = document.getElementById("victory") as HTMLElement;
  private readonly victoryText = document.getElementById("victorytext") as HTMLElement;
  private statusTimer = 0;

  constructor(private readonly inventory: Inventory) {
    const hotbar = document.getElementById("hotbar") as HTMLElement;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.innerHTML = slotMarkup(`<span class="num">${i + 1}</span>`);
      hotbar.appendChild(slot);
      this.slots.push(slot);
    }

    const heartRow = document.getElementById("hearts") as HTMLElement;
    for (let i = 0; i < HEART_COUNT; i++) {
      const heart = document.createElement("span");
      heart.className = "heart";
      heartRow.appendChild(heart);
      this.hearts.push(heart);
    }
    for (let i = 0; i < HEART_COUNT; i++) {
      const meat = document.createElement("span");
      meat.className = "meat";
      this.hungerRow.appendChild(meat);
      this.meats.push(meat);
    }
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const bubble = document.createElement("span");
      bubble.className = "bubble";
      this.bubbleRow.appendChild(bubble);
      this.bubbles.push(bubble);
    }
    this.refresh();
  }

  /**
   * 体力・空腹・息・被弾の表示。
   * health と hunger は 0..20、air は 0..1、flash は 0..1（被弾直後ほど赤い）。
   * **クリエイティブでは `#vitals` ごと消える**ので、ここに分岐は要らない。
   */
  setVitals(health: number, hunger: number, air: number, flash: number, show: boolean): void {
    this.vitals.classList.toggle("hidden", !show);
    const states = heartStates(health);
    for (let i = 0; i < HEART_COUNT; i++) {
      this.hearts[i].className = states[i] === "empty" ? "heart" : `heart ${states[i]}`;
    }
    // 空腹も 0..20 の同じ刻みなので、ハートと同じ関数で描ける
    const meats = heartStates(hunger);
    for (let i = 0; i < HEART_COUNT; i++) {
      this.meats[i].className = meats[i] === "empty" ? "meat" : `meat ${meats[i]}`;
    }
    // 気泡は水中でだけ出す（Minecraft と同じ）
    const drowning = air < 1;
    this.bubbleRow.classList.toggle("hidden", !drowning);
    const left = Math.ceil(air * BUBBLE_COUNT);
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      this.bubbles[i].classList.toggle("empty", i >= left);
    }
    this.hurt.style.opacity = show ? String(flash * 0.55) : "0";
  }

  /**
   * ボスの体力バー。**null で消える。**
   *
   * **ここに判断を書かないこと**（`boss.ts` の `bossBarState()` が決める）。
   * 「体力が 0 なら消す」「割合はいくつか」をこちらに書くと、
   * **ドラゴンを倒しに行くまで確かめられない**場所に判断が戻る。
   */
  setBoss(bar: BossBar | null): void {
    this.bossBar.classList.toggle("hidden", bar === null);
    if (!bar) return;
    this.bossLabel.textContent = bar.label;
    this.bossFill.style.width = `${bar.fraction * 100}%`;
  }

  /** クリア画面を出す。**1 行は `boss.ts` の `victoryMessage()`**（ここは貼るだけ）。 */
  showVictory(message: string): void {
    this.victoryText.textContent = message;
    this.victory.classList.remove("hidden");
  }

  hideVictory(): void {
    this.victory.classList.add("hidden");
  }

  /**
   * クリア画面が出ているか。**メインメニューを出さないための判定に使う**
   * （死亡画面の `vitals.dead` と同じ役目。両方出ると重なって読めない）。
   */
  get victoryOpen(): boolean {
    return !this.victory.classList.contains("hidden");
  }

  /** インベントリの中身が変わったら呼ぶ。 */
  refresh(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      paintSlot(this.slots[i], this.inventory.slots[i]);
      this.slots[i].classList.toggle("active", i === this.inventory.selected);
    }
  }

  setPlaying(playing: boolean, menuVisible: boolean): void {
    this.hud.classList.toggle("hidden", !playing);
    this.crosshair.classList.toggle("hidden", !playing);
    this.menu.classList.toggle("hidden", !menuVisible);
  }

  toggleDebug(): void {
    this.debug.style.display = this.debug.style.display === "none" ? "" : "none";
  }

  setDebug(text: string): void {
    this.debug.textContent = text;
  }

  setLoading(on: boolean): void {
    this.loading.classList.toggle("on", on);
  }

  /** 画面下に数秒だけ出す通知。プレイ中でもメニュー中でも見える。 */
  flash(message: string): void {
    this.status.textContent = message;
    this.status.classList.add("on");
    this.statusTimer = 3;
  }

  tick(dt: number): void {
    if (this.statusTimer > 0) {
      this.statusTimer -= dt;
      // 文字は残したまま透明にする（消してから薄れると途中で空になる）
      if (this.statusTimer <= 0) this.status.classList.remove("on");
    }
  }
}

