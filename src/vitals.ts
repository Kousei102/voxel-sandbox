/**
 * 体力・息・空腹・ダメージ。
 *
 * three にも DOM にも触らないので、丸ごとヘッドレスで検証できる。
 * **ダメージと空腹の判定はここに集めること**（描画側で条件を書くと、目で見るまで壊れに気付けない）。
 * 呼ぶ側が渡すのは「何が起きたか」（歩いた距離・掘った・殴った・食べた）だけで、
 * 「それで何がどれだけ減るか」は全部この中にある。
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

/** 空腹の上限。肉ゲージ 10 個ぶん（体力と同じ刻み）。 */
export const MAX_HUNGER = 20;
/** 新しく始めたときの満腹度。Minecraft と同じで、満腹でも溜めは少しだけ。 */
export const START_SATURATION = 5;
/**
 * 消耗がこれだけ溜まると、満腹度を 1 減らす（満腹度が無ければ空腹を 1 減らす）。
 * **満腹度が先に減ること** —— でないと、食べた直後にゲージが減り始めて
 * 「食べても意味が無い」ように見える。
 */
export const EXHAUST_LIMIT = 4;
/** 歩き 1m ぶんの消耗。水中もこちら。 */
export const EXHAUST_WALK = 0.01;
/** 走り 1m ぶんの消耗。歩きの 10 倍（Minecraft と同じ）。 */
export const EXHAUST_SPRINT = 0.1;
/** ブロックを 1 個掘るぶんの消耗。 */
export const EXHAUST_MINE = 0.005;
/** モブを 1 回殴るぶんの消耗。 */
export const EXHAUST_ATTACK = 0.1;
/** ダメージを受けたぶんの消耗。`damage()` の中で足すので呼ぶ側は要らない。 */
export const EXHAUST_HURT = 0.1;
/**
 * 体力を 1 回復するぶんの消耗。**`EXHAUST_LIMIT` より大きいこと** ——
 * 回復のほうが安いと、腹が減らないまま無限に回復できてしまう。
 */
export const EXHAUST_REGEN = 6;
/** これ未満の空腹では自然回復しない（Minecraft と同じ 18）。 */
export const REGEN_HUNGER = 18;
/** 空腹 0 のときのダメージ間隔 (秒)。 */
export const STARVE_INTERVAL = 4;
/**
 * 餓死ダメージが止まる体力。**0 にしないこと** ——
 * 「空腹だけでは死なないが、殴られれば一発」という取り決めで入れている
 * （Minecraft のノーマルと同じ）。
 */
export const STARVE_FLOOR = 1;
/** これ以下の空腹では走れない（Minecraft と同じ 6）。 */
export const SPRINT_HUNGER = 6;
/** 毒のダメージ間隔 (秒)。 */
export const POISON_INTERVAL = 1.5;
/**
 * 毒のダメージ回数。**長さ（秒）ではなく回数で持つこと。**
 * 「残り時間」と「次の 1 回まで」の 2 本を別々に足し引きすると、
 * 1/60 の誤差で最後の 1 回が落ちたり増えたりする。
 */
export const POISON_TICKS = 4;
/** 毒の長さ (秒)。表示とテスト用の目安。 */
export const POISON_SECONDS = POISON_TICKS * POISON_INTERVAL;
/** 毒が止まる体力。**餓死と同じで 0 にしないこと**（毒では死なない）。 */
export const POISON_FLOOR = 1;
/** 食べ切るまでの長さ (秒)。Minecraft と同じ。 */
export const EAT_SECONDS = 1.6;
/** 赤い明滅の長さ (秒)。 */
export const HURT_FLASH = 0.4;
/**
 * モブに殴られたときの無敵時間 (秒)。**これを `damage()` の既定にしないこと。**
 * 溺れは 1 秒ごと、奈落は 0.5 秒ごとにダメージを入れていて、`test/vitals.test.ts` が
 * その速さを見ている。一律に掛けると**奈落のダメージが黙って半分になる。**
 * モブのダメージは全部この窓を共有するので、ゾンビが何体居ても入る量に上限が付く。
 */
export const MOB_HURT_COOLDOWN = 0.5;

export type DamageCause = "落下" | "溺れ" | "奈落" | "モンスター" | "空腹" | "毒";

/**
 * 消耗が増える出来事。**数値は下の表に持つ**ので、呼ぶ側は種類を渡すだけ。
 * 移動ぶんは `update()` が距離から作るので、ここには無い。
 */
export type ExhaustKind = "mine" | "attack";

const EXHAUSTION: Record<ExhaustKind, number> = {
  mine: EXHAUST_MINE,
  attack: EXHAUST_ATTACK,
};

/**
 * 食べ物 1 個ぶんの値。**`items.ts` の `FoodDef` と構造で合わせてある**
 * （型を import すると、体力の判定が持ち物の表に引きずられる）。
 */
export interface FoodValue {
  readonly hunger: number;
  readonly saturation: number;
  readonly poison: boolean;
}

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
  /** このフレームに水平方向へ動いた距離 (m)。空腹の消耗に使う。 */
  moved: number;
  /** 走っている（消耗が 10 倍）。 */
  sprinting: boolean;
}

/** 落差からダメージを求める。Minecraft と同じで 3 ブロックまでは無傷。 */
export function fallDamage(distance: number): number {
  return Math.max(0, Math.floor(distance - FALL_SAFE));
}

export class Vitals {
  health = MAX_HEALTH;
  /** 空腹 0..20。0 で餓死ダメージ、18 未満で自然回復が止まる。 */
  hunger = MAX_HUNGER;
  /** 満腹度。消耗はここから先に減る（空腹の値を超えられない）。 */
  saturation = START_SATURATION;
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
  /** まだ拾われていないダメージの死因。`takeDamage()` が読むと消える。 */
  private pending: DamageCause | null = null;
  private sinceDamage = REGEN_DELAY;
  private regenTimer = 0;
  private drownTimer = 0;
  private voidTimer = 0;
  /** 溜まった消耗。`EXHAUST_LIMIT` ごとに満腹度／空腹が 1 減る。 */
  private exhaustion = 0;
  private starveTimer = 0;
  /** 毒の残り回数。 */
  private poisonLeft = 0;
  private poisonTick = 0;

  get hearts(): number {
    return this.health / 2;
  }

  /** 息の残り 0..1。 */
  get airFraction(): number {
    return Math.max(0, Math.min(1, this.air / AIR_SECONDS));
  }

  /** 走れるか。**判断はここ。** `player.ts` は結果を受け取るだけ。 */
  get canSprint(): boolean {
    return this.hunger > SPRINT_HUNGER;
  }

  /** 食べられるか（満腹なら食べない。Minecraft と同じ）。 */
  get canEat(): boolean {
    return !this.dead && this.hunger < MAX_HUNGER;
  }

  /** 毒が回っているか（表示とテスト用）。 */
  get poisoned(): boolean {
    return this.poisonLeft > 0;
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
    // 痛い目に遭うと腹も減る（Minecraft と同じ）。呼ぶ側に書かせない。
    this.exhaustion += EXHAUST_HURT;
    this.sinceDamage = 0;
    this.regenTimer = 0;
    this.hurtFlash = 1;
    this.cause = cause;
    this.pending = cause;
    if (this.health === 0) this.dead = true;
    return true;
  }

  /**
   * このフレームで受けたダメージの死因。**読むと消える**（1 回だけ拾える）。
   *
   * 音・死亡画面はこれで拾うこと。**「フレームの前後で体力を比べる」書き方にしないこと** ——
   * ダメージを入れるのはプレイヤーの落下だけではなく、モブは `updateVitals()` より
   * 前に走る。前後を比べる形にすると、その差分が控えを取る前に済んでいて、
   * **ゾンビに殺されても死亡画面が出ない**（実際にそうなっていた）。
   * こちらは誰がいつ減らしても、次に拾った人が必ず 1 回受け取れる。
   */
  takeDamage(): DamageCause | null {
    const cause = this.pending;
    this.pending = null;
    return cause;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
  }

  /**
   * 消耗を足す。**数値ではなく種類を渡すこと**（表は `EXHAUSTION`）。
   * 移動ぶんは `update()` が距離から作るので、ここへ渡さない。
   */
  exhaust(kind: ExhaustKind): void {
    if (this.dead) return;
    this.exhaustion += EXHAUSTION[kind];
  }

  /**
   * 食べる。**満腹度は空腹の値を超えられない**（Minecraft と同じ）ので、
   * 空腹が少ないうちに良いものを食べても溜めきれない。
   */
  eat(food: FoodValue): void {
    if (this.dead) return;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + food.saturation);
    if (food.poison) {
      this.poisonLeft = POISON_TICKS;
      this.poisonTick = 0;
    }
  }

  respawn(): void {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = START_SATURATION;
    this.air = AIR_SECONDS;
    this.dead = false;
    this.cause = null;
    this.hurtFlash = 0;
    this.lastFall = 0;
    this.airborne = false;
    this.iframe = 0;
    this.pending = null;
    this.sinceDamage = REGEN_DELAY;
    this.regenTimer = 0;
    this.drownTimer = 0;
    this.voidTimer = 0;
    this.exhaustion = 0;
    this.starveTimer = 0;
    this.poisonLeft = 0;
    this.poisonTick = 0;
  }

  update(dt: number, ctx: VitalsContext): void {
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt / HURT_FLASH);
    // 無敵時間は**クリエイティブでも死んでいても**減らす（下の早期 return より前）。
    // 止めると、モードを戻した瞬間に前の窓が残っていて 1 発ぶん素通りする。
    if (this.iframe > 0) this.iframe = Math.max(0, this.iframe - dt);

    if (ctx.invulnerable || this.dead) {
      // クリエイティブでは落差も息も消耗も溜めない（切り替えた直後に減らないように）。
      // **空腹そのものは減らさず残す** —— サバイバルへ戻したときに空腹だけ満タンに
      // なると、飛んで移動してから戻るのが最善手になる。
      this.airborne = false;
      this.peakY = ctx.y;
      this.air = AIR_SECONDS;
      this.drownTimer = 0;
      this.voidTimer = 0;
      this.exhaustion = 0;
      this.starveTimer = 0;
      this.poisonLeft = 0;
      this.poisonTick = 0;
      return;
    }

    this.updateFall(ctx);
    this.updateAir(dt, ctx);
    this.updateVoid(dt, ctx);
    this.updateHunger(dt, ctx);
    this.updatePoison(dt);
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

  /**
   * 空腹。**歩いた距離から消耗を作るのはここ**（呼ぶ側は距離を渡すだけ）。
   * 飛行中は減らさない（クリエイティブ以外で飛ぶのはデバッグ用なので、
   * ここで減ると「何もしていないのに減る」ように見える）。
   */
  private updateHunger(dt: number, ctx: VitalsContext): void {
    if (ctx.moved > 0 && !ctx.flying) {
      // 水中は走っても速くならないので、消耗も歩きと同じにする
      const rate = ctx.sprinting && !ctx.inWater ? EXHAUST_SPRINT : EXHAUST_WALK;
      this.exhaustion += ctx.moved * rate;
    }
    this.drainExhaustion();

    // 餓死ダメージ。**`STARVE_FLOOR` で止まる**ので、空腹だけでは死なない。
    if (this.hunger > 0 || this.health <= STARVE_FLOOR) {
      this.starveTimer = 0;
      return;
    }
    this.starveTimer += dt;
    while (this.starveTimer >= STARVE_INTERVAL && this.health > STARVE_FLOOR) {
      this.starveTimer -= STARVE_INTERVAL;
      this.damage(1, "空腹");
    }
  }

  /** 溜まった消耗を、満腹度 → 空腹の順に落とす。 */
  private drainExhaustion(): void {
    while (this.exhaustion >= EXHAUST_LIMIT) {
      this.exhaustion -= EXHAUST_LIMIT;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else if (this.hunger > 0) this.hunger -= 1;
      // 空腹 0 では溜め込まない。持ち越すと、食べた直後にゲージが一気に減る
      else this.exhaustion = 0;
    }
  }

  /**
   * 毒（腐った肉）。**`POISON_FLOOR` で止まるので毒では死なない。**
   * 体力が足りなくてダメージを見送っても回数は減らす（そうしないと、
   * 瀕死のあいだ毒が永久に残る）。
   */
  private updatePoison(dt: number): void {
    if (this.poisonLeft <= 0) return;
    this.poisonTick += dt;
    while (this.poisonTick >= POISON_INTERVAL && this.poisonLeft > 0) {
      this.poisonTick -= POISON_INTERVAL;
      this.poisonLeft -= 1;
      if (this.health > POISON_FLOOR) this.damage(1, "毒");
    }
  }

  /**
   * 自然回復。**空腹が `REGEN_HUNGER` 以上のときだけ。**
   *
   * 空腹が入るまでは無条件に回復していた（ピースフルの代用）。**その形に戻さないこと** ——
   * 腹が減っていても勝手に治るなら、食べる理由が無くなって空腹が飾りになる。
   * 1 回復するごとに `EXHAUST_REGEN` 積むので、**治すこと自体が食べ物を食う。**
   */
  private updateRegen(dt: number): void {
    this.sinceDamage += dt;
    if (this.health >= MAX_HEALTH || this.sinceDamage < REGEN_DELAY) return;
    if (this.hunger < REGEN_HUNGER) {
      this.regenTimer = 0;
      return;
    }
    this.regenTimer += dt;
    while (this.regenTimer >= REGEN_INTERVAL && this.health < MAX_HEALTH) {
      this.regenTimer -= REGEN_INTERVAL;
      this.health += 1;
      this.exhaustion += EXHAUST_REGEN;
    }
    this.drainExhaustion();
  }
}
