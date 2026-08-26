/**
 * 弓の引きと放ち。**判断は全部ここ。**
 *
 * 掘る（`mining.ts` の `Mining`）・食べる（`vitals.ts` の `Eating`）とまったく同じ形で、
 * **押している間だけ進み、離した瞬間に結果が出る。** 中断する条件（手が変わった・
 * 矢が尽きた・画面が変わった）も全部このクラスに集めてある —— `main.ts` に散らすと、
 * 器や画面を足すたびに 1 つずつ抜ける（`Eating` で通った道）。
 *
 * **飛び道具そのものは `projectiles.ts` の仕事。** ここが決めるのは
 * 「放つかどうか」と「どれだけの重み（`damage`）を載せるか」だけで、
 * 飛び方（速さ・重力・寿命）は向こうの表が持つ。**表にダメージを書かない**という
 * 約束（`rules/projectiles.md`）の、撃つ側がこれ。
 *
 * **当たる側には 1 行も足していない。** 矢が誰かに当たれば `projectiles.onHitTarget` →
 * `mobs.hitByProjectile()`、ブロックに当たれば `onHitBlock` → `shatterCrystal()` に
 * もう繋がっている（`main.ts`）。**足したのは「撃つ側」だけ。**
 *
 * **three も DOM も乱数も出てこない**ので、丸ごとヘッドレスで確かめられる
 * （見張りは `test/bow.test.ts`）。アイテム ID も知らない —— 弓かどうかを決めるのは
 * `items.ts` の `isBow()`（`isBucket()` / `isFireStarter()` と同じ表 1 本）。
 */

/** 満引きまでの秒数。Minecraft と同じ。 */
export const DRAW_SECONDS = 1.0;

/**
 * 放てるようになる引きの割合。**これ未満では矢も減らない。**
 *
 * Minecraft は引きが浅くても矢が飛ぶ（そのぶん遅い）が、こちらは**速さが
 * `PROJECTILE_KINDS` の固定値**なので、真似ると「浅く連打するほど強い」になる
 * （矢 1 本 = 40m/s は変わらないまま、撃つ間隔だけが縮む）。
 * 速さを撃つ側から渡す形にするのは飛び道具の表の話なので、ここでは
 * **浅い引きは放たない**で揃えてある。
 */
export const MIN_POWER = 0.2;

/** 満引きのダメージ。Minecraft の弓（最大 9）と同じ。 */
export const MAX_ARROW_DAMAGE = 9;
/** 放てる最小のダメージ。**0 にしないこと**（当たっても何も起きない矢ができる）。 */
export const MIN_ARROW_DAMAGE = 1;

/**
 * 撃ち出す高さ（足元から）。**目の高さに合わせること** ——
 * 足元から出すと、狙ったつもりの矢が目の前の段差に刺さる。
 */
export const SHOOT_HEIGHT = 1.5;

/**
 * 満引きの合図の音程。**放つ音（`bow`）と同じ音を高くして鳴らす**
 * （モブの声色とまったく同じ仕掛け。`sfx.ts` の `recipeFor` の `pitch`）。
 * この環境では引く動きを描けないので、**満引きに達したことは音でしか分からない。**
 */
export const FULL_DRAW_PITCH = 1.6;

/** 引き具合 0..1。`DRAW_SECONDS` で 1（満引き）。 */
export function drawPower(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(1, seconds / DRAW_SECONDS);
}

/**
 * その引き具合で当たったときに減る量。**放てないなら 0。**
 *
 * 数値を丸めるのはここ 1 か所。`main.ts` や `projectiles.ts` で
 * `power * 9` を書き始めると、調整のときに探せなくなる（`TUNING.md`）。
 */
export function arrowDamage(power: number): number {
  if (!(power >= MIN_POWER)) return 0;
  return Math.max(MIN_ARROW_DAMAGE, Math.round(power * MAX_ARROW_DAMAGE));
}

/** 引いている 1 フレームの結果。 */
export type DrawStep =
  /** 何も起きていない（引いていない・まだ引いている途中）。 */
  | "none"
  /** 満引きに達した**その瞬間だけ**（合図の音を鳴らす）。 */
  | "full";

/** `Drawing.advance()` に渡す、そのフレームの事実。 */
export interface DrawContext {
  /** 操作を受け付けているか。 */
  readonly playing: boolean;
  /** いま手に持っているアイテム。**引き始めたものと違えば中断する。** */
  readonly held: number;
  /** 放つ矢があるか（クリエイティブは常に true）。 */
  readonly hasArrow: boolean;
}

/** 放った 1 本ぶん。**矢を減らすのも飛ばすのも呼ぶ側。** */
export interface Loosed {
  /** 引き具合 0..1（画面や音に使う）。 */
  readonly power: number;
  /** 当たった相手から減らす量（`Shot.damage` に載せる）。 */
  readonly damage: number;
}

/**
 * 引いている最中。**`Eating` とまったく同じ寿命**で、離す・画面が変わる・
 * 手が変わるたびに無かったことになる（矢は減らない）。
 */
export class Drawing {
  private timer = 0;
  private item = 0;
  private drawing = false;
  /** 満引きの合図をもう出したか。**出すのは 1 回だけ**（毎フレーム鳴らさない）。 */
  private announced = false;

  get active(): boolean {
    return this.drawing;
  }

  /** いまの引き具合 0..1。 */
  get power(): number {
    return this.drawing ? drawPower(this.timer) : 0;
  }

  /** 引き始める。**引き始めたアイテムを控える**（手が変わったら中断するため）。 */
  begin(item: number): void {
    this.drawing = true;
    this.timer = 0;
    this.item = item;
    this.announced = false;
  }

  /** やめる。**放たずに終わる**ので、矢は減らない。 */
  stop(): void {
    this.drawing = false;
    this.timer = 0;
    this.item = 0;
    this.announced = false;
  }

  advance(dt: number, at: DrawContext): DrawStep {
    if (!this.drawing) return "none";
    if (!at.playing || at.held !== this.item || !at.hasArrow) {
      this.stop();
      return "none";
    }

    this.timer += dt;
    if (this.announced || drawPower(this.timer) < 1) return "none";
    this.announced = true;
    return "full";
  }

  /**
   * 離した。放てるなら 1 本ぶんの値、引きが足りなければ null。
   *
   * **どちらの場合も必ず引きを終わらせる**（`Eating` が食べ切ったら止めるのと同じ）。
   * だから **2 回呼んでも 2 本は出ない** —— 離したのと画面が変わったのが
   * 同じフレームに来ることがある。
   */
  release(): Loosed | null {
    if (!this.drawing) return null;
    const power = drawPower(this.timer);
    this.stop();
    const damage = arrowDamage(power);
    return damage > 0 ? { power, damage } : null;
  }
}
