import { PALETTE, blockName, cssColor } from "./blocks";

export class Hud {
  private readonly slots: HTMLElement[] = [];
  private readonly debug = document.getElementById("debug") as HTMLElement;
  private readonly hud = document.getElementById("hud") as HTMLElement;
  private readonly crosshair = document.getElementById("crosshair") as HTMLElement;
  private readonly loading = document.getElementById("loading") as HTMLElement;
  private readonly status = document.getElementById("status") as HTMLElement;
  private selected = 0;
  private statusTimer = 0;

  constructor() {
    const hotbar = document.getElementById("hotbar") as HTMLElement;
    PALETTE.forEach((id, i) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.innerHTML =
        `<span class="num">${i + 1}</span>` +
        `<span class="swatch" style="background:${cssColor(id)}"></span>` +
        `<span class="label">${blockName(id)}</span>`;
      hotbar.appendChild(slot);
      this.slots.push(slot);
    });
    this.select(0);
  }

  get selectedBlock(): number {
    return PALETTE[this.selected];
  }

  select(index: number): void {
    this.selected = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
    this.slots.forEach((slot, i) => slot.classList.toggle("active", i === this.selected));
  }

  selectBlock(id: number): void {
    const index = PALETTE.indexOf(id);
    if (index >= 0) this.select(index);
  }

  cycle(delta: number): void {
    this.select(this.selected + delta);
  }

  setPlaying(playing: boolean): void {
    this.hud.classList.toggle("hidden", !playing);
    this.crosshair.classList.toggle("hidden", !playing);
    (document.getElementById("menu") as HTMLElement).classList.toggle("hidden", playing);
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
