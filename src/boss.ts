/**
 * ボスを倒したことが**画面で伝わる**ぶんの判断。**判断は全部ここ。**
 *
 * 中身は 2 つだけ:
 *
 * 1. **体力バー** —— いつ出す・いつ消す・何割か（`bossBarState()`）
 * 2. **クリア画面** —— いつ出す（`VictoryWatch`）・何と出す（`victoryMessage()`）
 *
 * **ボスの表も AI も `mobs.ts`**（`BOSSES` / `MobDef`）で、こちらはそこから来た値を
 * 画面に出せる形へ均すだけ。**`ui.ts` は貼るだけ**にすること —— 割合の計算や
 * 「居なくなったら消す」をあちらに書くと、ドラゴンを倒すまで確かめられない場所に
 * 判断が戻る（`vitals.ts` の `deathMessage()` と `ui.ts` の関係とまったく同じ）。
 *
 * **three も DOM も乱数も出てこない**ので丸ごとヘッドレスで確かめられる
 * （見張りは `test/boss.test.ts`）。`mobs.ts` も import しない —— 受け取るのは
 * 器そのものではなく**必要な値を持つ何か**（`BossFacts`。`session.ts` と同じ作法）で、
 * `Mobs.activeBoss()` が返すものと**構造で合わせてある**
 * （`vitals.ts` の `FoodValue` と `items.ts` の `FoodDef` と同じ形。
 * 食い違えばテストの型検査で止まる）。
 */

/** 体力バーの材料。**`Mobs.activeBoss()` が返すものと構造で合わせてある。** */
export interface BossFacts {
  readonly name: string;
  readonly health: number;
  readonly maxHealth: number;
}

/** 体力バーに貼るもの。**`ui.ts` はこの 2 つを貼るだけ。** */
export interface BossBar {
  /**
   * 「エンダードラゴン　132 / 200」。**残りの数を必ず出すこと** —— 棒だけだと、
   * クリスタルの回復と矢のダメージが釣り合っているのかが目では分からない。
   */
  readonly label: string;
  /** 帯の長さ 0..1。 */
  readonly fraction: number;
}

/**
 * 体力バーを出すかどうかと、その中身。出さないなら null。
 *
 * **消す条件を `ui.ts` に写さないこと。** 消すのは 3 通り:
 *
 * 1. **その次元にボスが居ない**（`Mobs.activeBoss()` が null）——
 *    エンドを離れた・まだ湧いていない・倒した、が全部これで消える
 * 2. **体力が尽きている** —— 倒れたモブは次のフレームに `list` から抜けるので、
 *    残しておくと**空の帯が 1 フレームちらつく**
 * 3. **最大体力が 0 以下**（表が壊れている）—— 割ると NaN になり、
 *    帯の幅が `NaN%` になって**黙って消える**（何も出ないので原因が分からない）
 */
export function bossBarState(boss: BossFacts | null): BossBar | null {
  if (!boss || boss.maxHealth <= 0 || boss.health <= 0) return null;
  const fraction = Math.min(1, boss.health / boss.maxHealth);
  // **切り上げること。** 残り 0.4 を「0」と出すと、まだ生きているのに
  // 倒したように見える（回復で削り切れていないのか分からなくなる）。
  return { label: `${boss.name}　${Math.ceil(boss.health)} / ${boss.maxHealth}`, fraction };
}

/**
 * クリア画面の 1 行。**`vitals.ts` の `deathMessage()` とまったく同じ形。**
 *
 * **帰り道を必ず出すこと** —— 倒した合図（出口ポータル）は島の中心の脇に
 * 音も通知もなく建つので、書かないと「倒したのに何も起きていない」ように見える。
 */
export function victoryMessage(name: string | null): string {
  return `${name ?? "ボス"}を倒しました　出口ポータルが開いています（踏むと帰れます）`;
}

/**
 * クリア画面を**倒した瞬間だけ**出すための見張り。
 *
 * **「印が立っている」で出さないこと。** エンドの出口ポータルは `edits` に乗る
 * （＝読み込み直しても残る）ので、印で出す形にすると**倒したあとエンドへ
 * 入り直すたびにクリア画面が出る。** 渡すのは `Mobs.bossDefeated()`
 * （この読み込みのあいだの記憶）で、false → true に変わった 1 回だけ true を返す。
 *
 * **戻し方を別に持たない。** 次元を移る・ワールドを作り直すと `mobs.clear()` が
 * 走って `bossDefeated()` が false に戻るので、この見張りも同じ経路で戻る
 * （`reset()` を足すと、呼び忘れた場所だけが二度と出ない形を作れる）。
 */
export class VictoryWatch {
  private seen = false;

  /** 倒したか（`Mobs.bossDefeated()`）を毎フレーム渡す。立ち上がりで 1 回だけ true。 */
  update(defeated: boolean): boolean {
    if (defeated === this.seen) return false;
    this.seen = defeated;
    return defeated;
  }
}
