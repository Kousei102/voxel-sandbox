import { HOTBAR_SIZE, isEmpty, type Inventory, type Slot } from "./inventory";
import { itemCssColor, itemName } from "./items";

/** スロット 1 個分の中身を描く。インベントリ画面と共用。 */
export function paintSlot(el: HTMLElement, slot: Slot | null): void {
  const filled = slot !== null && !isEmpty(slot);
  el.classList.toggle("filled", filled);
  const swatch = el.querySelector<HTMLElement>(".swatch");
  const count = el.querySelector<HTMLElement>(".count");
  const label = el.querySelector<HTMLElement>(".label");
  if (swatch) swatch.style.background = filled ? itemCssColor(slot.item) : "transparent";
  if (count) count.textContent = filled && slot.count > 1 ? String(slot.count) : "";
  if (label) label.textContent = filled ? itemName(slot.item) : "";
  el.title = filled ? `${itemName(slot.item)} x${slot.count}` : "";
}

export function slotMarkup(extra = ""): string {
  return (
    `${extra}<span class="swatch"></span><span class="count"></span><span class="label"></span>`
  );
}

/** ハートと気泡の数。体力 20 = ハート 10 個なので、1 個で 2 ぶん。 */
export const HEART_COUNT = 10;
const BUBBLE_COUNT = 10;

export type HeartState = "full" | "half" | "empty";

/**
 * 体力からハート 10 個の状態を出す。CSS は見た目しか検証できないので、
 * 「半分のハートがいつ出るか」だけはここに切り出してテストで押さえる。
 */
export function heartStates(health: number, count = HEART_COUNT): HeartState[] {
  return Array.from({ length: count }, (_, i) => {
    const filled = health - i * 2;
    return filled >= 2 ? "full" : filled >= 1 ? "half" : "empty";
  });
}

export class Hud {
  private readonly slots: HTMLElement[] = [];
  private readonly hearts: HTMLElement[] = [];
  private readonly bubbles: HTMLElement[] = [];
  private readonly debug = document.getElementById("debug") as HTMLElement;
  private readonly hud = document.getElementById("hud") as HTMLElement;
  private readonly crosshair = document.getElementById("crosshair") as HTMLElement;
  private readonly loading = document.getElementById("loading") as HTMLElement;
  private readonly status = document.getElementById("status") as HTMLElement;
  private readonly menu = document.getElementById("menu") as HTMLElement;
  private readonly vitals = document.getElementById("vitals") as HTMLElement;
  private readonly bubbleRow = document.getElementById("bubbles") as HTMLElement;
  private readonly hurt = document.getElementById("hurt") as HTMLElement;
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
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const bubble = document.createElement("span");
      bubble.className = "bubble";
      this.bubbleRow.appendChild(bubble);
      this.bubbles.push(bubble);
    }
    this.refresh();
  }

  /**
   * 体力・息・被弾の表示。
   * health は 0..20、air は 0..1、flash は 0..1（被弾直後ほど赤い）。
   */
  setVitals(health: number, air: number, flash: number, show: boolean): void {
    this.vitals.classList.toggle("hidden", !show);
    const states = heartStates(health);
    for (let i = 0; i < HEART_COUNT; i++) {
      this.hearts[i].className = states[i] === "empty" ? "heart" : `heart ${states[i]}`;
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

  flash(message: string): void {
    this.status.textContent = message;
    this.statusTimer = 3;
  }

  tick(dt: number): void {
    if (this.statusTimer > 0) {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) this.status.textContent = "";
    }
  }
}

