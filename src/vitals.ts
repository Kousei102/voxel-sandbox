/**
 * 体力・息・ダメージ。
 *
 * three にも DOM にも触らないので、丸ごとヘッドレスで検証できる。
 * **ダメージの判定はここに集めること**（描画側で条件を書くと、目で見るまで壊れに気付けない）。
 *
 * 空腹はまだ無い。食料源（作物・動物）が無い状態で空腹だけ入れると回復手段が無く
 * 餓死するだけになるため、代わりに Minecraft のピースフルと同じ自然回復を入れてある。
 */

/** 体力の上限。ハート 10 個ぶん。 */
export const MAX_HEALTH = 20;
/** この落差までは無傷（Minecraft と同じ 3 ブロック）。 */
export const FALL_SAFE = 3;
/** 息が続く時間 (秒)。 */
export const AIR_SECONDS = 15;
/** 息が切れてからのダメージ (毎秒)。 */
export const DROWN_DAMAGE = 2;
/** この高さより下は奈落。 */
export const VOID_Y = -5;
/** 奈落のダメージ (毎秒)。 */
export const VOID_DAMAGE = 8;
/** 被弾からこの秒数が経つと回復が始まる。 */
export const REGEN_DELAY = 5;
/** 回復 1 ぶんの間隔 (秒)。 */
export const REGEN_INTERVAL = 2;
/** 赤い明滅の長さ (秒)。 */
export const HURT_FLASH = 0.4;
/**
 * モブに殴られたときの無敵時間 (秒)。**これを `damage()` の既定にしないこと。**
 * 溺れは 1 秒ごと、奈落は 0.5 秒ごとにダメージを入れていて、`test/vitals.test.ts` が
 * その速さを見ている。一律に掛けると**奈落のダメージが黙って半分になる。**
 * モブのダメージは全部この窓を共有するので、ゾンビが何体居ても入る量に上限が付く。
 */
export const MOB_HURT_COOLDOWN = 0.5;

export type DamageCause = "落下" | "溺れ" | "奈落" | "モンスター";

export interface VitalsContext {
  y: number;
  onGround: boolean;
  /** 体が水に浸かっている（落下を打ち消す）。 */
  inWater: boolean;
  /** 頭まで水中（息が減る）。 */
  headInWater: boolean;
  flying: boolean;
  /** クリエイティブ。何も受けない。 */
  invulnerable: boolean;
}

/** 落差からダメージを求める。Minecraft と同じで 3 ブロックまでは無傷。 */
export function fallDamage(distance: number): number {
  return Math.max(0, Math.floor(distance - FALL_SAFE));
}

export class Vitals {
  health = MAX_HEALTH;
  air = AIR_SECONDS;
  dead = false;
  cause: DamageCause | null = null;
  /** 0..1。被弾直後の赤い明滅に使う。 */
  hurtFlash = 0;

  /** 直近の落下で受けた落差（テストと表示用）。 */
  lastFall = 0;

  private airborne = false;
  private peakY = 0;
  /** 無敵時間の残り (秒)。`cooldown` を渡すダメージだけが読み書きする。 */
  private iframe = 0;
  private sinceDamage = REGEN_DELAY;
  private regenTimer = 0;
  private drownTimer = 0;
  private voidTimer = 0;

  get hearts(): number {
    return this.health / 2;
  }

  /** 息の残り 0..1。 */
  get airFraction(): number {
    return Math.max(0, Math.min(1, this.air / AIR_SECONDS));
  }

  /**
   * ダメージを入れる。入ったら true。
   *
   * `cooldown` を渡したときだけ無敵時間を使う。**既定の 0 のままにしておくこと** ——
   * 落下・溺れ・奈落は引数を渡さないので `iframe` を読みも書きもせず、
   * 挙動が構造的に変わらない（一律の窓を掛けると奈落のダメージが半分になる）。
   */
  damage(amount: number, cause: DamageCause, cooldown = 0): boolean {
    if (this.dead || amount <= 0) return false;
    if (cooldown > 0) {
      if (this.iframe > 0) return false;
      this.iframe = cooldown;
    }
    this.health = Math.max(0, this.health - amount);
    this.sinceDamage = 0;
    this.regenTimer = 0;
    this.hurtFlash = 1;
    this.cause = cause;
    if (this.health === 0) this.dead = true;
    return true;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  respawn(): void {
    this.health = MAX_HEALTH;
    this.air = AIR_SECONDS;
    this.dead = false;
    this.cause = null;
    this.hurtFlash = 0;
    this.lastFall = 0;
    this.airborne = false;
    this.iframe = 0;
    this.sinceDamage = REGEN_DELAY;
    this.regenTimer = 0;
    this.drownTimer = 0;
    this.voidTimer = 0;
  }

  update(dt: number, ctx: VitalsContext): void {
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt / HURT_FLASH);
    // 無敵時間は**クリエイティブでも死んでいても**減らす（下の早期 return より前）。
    // 止めると、モードを戻した瞬間に前の窓が残っていて 1 発ぶん素通りする。
    if (this.iframe > 0) this.iframe = Math.max(0, this.iframe - dt);

    if (ctx.invulnerable || this.dead) {
      // クリエイティブでは落差も息も溜めない（切り替えた直後に死なないように）
      this.airborne = false;
      this.peakY = ctx.y;
      this.air = AIR_SECONDS;
      this.drownTimer = 0;
      this.voidTimer = 0;
      return;
    }

    this.updateFall(ctx);
    this.updateAir(dt, ctx);
    this.updateVoid(dt, ctx);
    this.updateRegen(dt);
  }

  /** 空中に居るあいだの最高到達点を覚えておき、着地したときの落差でダメージを出す。 */
  private updateFall(ctx: VitalsContext): void {
    const grounded = ctx.onGround || ctx.flying || ctx.inWater;
    if (grounded) {
      if (this.airborne) {
        this.lastFall = Math.max(0, this.peakY - ctx.y);
        // 水に落ちた場合と飛行に切り替えた場合はダメージ無し
        if (ctx.onGround && !ctx.inWater && !ctx.flying) {
          this.damage(fallDamage(this.lastFall), "落下");
        }
        this.airborne = false;
      }
      this.peakY = ctx.y;
      return;
    }
    if (!this.airborne) {
      this.airborne = true;
      this.peakY = ctx.y;
    }
    this.peakY = Math.max(this.peakY, ctx.y);
  }

  private updateAir(dt: number, ctx: VitalsContext): void {
    if (!ctx.headInWater) {
      this.air = AIR_SECONDS;
      this.drownTimer = 0;
      return;
    }
    this.air = Math.max(0, this.air - dt);
    if (this.air > 0) return;
    this.drownTimer += dt;
    while (this.drownTimer >= 1 && !this.dead) {
      this.drownTimer -= 1;
      this.damage(DROWN_DAMAGE, "溺れ");
    }
  }

  private updateVoid(dt: number, ctx: VitalsContext): void {
    if (ctx.y >= VOID_Y) {
      this.voidTimer = 0;
      return;
    }
    this.voidTimer += dt;
    while (this.voidTimer >= 0.5 && !this.dead) {
      this.voidTimer -= 0.5;
      this.damage(VOID_DAMAGE / 2, "奈落");
    }
  }

  private updateRegen(dt: number): void {
    this.sinceDamage += dt;
    if (this.health >= MAX_HEALTH || this.sinceDamage < REGEN_DELAY) return;
    this.regenTimer += dt;
    while (this.regenTimer >= REGEN_INTERVAL && this.health < MAX_HEALTH) {
      this.regenTimer -= REGEN_INTERVAL;
      this.health += 1;
    }
  }
}
