/**
 * 飛んでいるもの。**判断は全部ここ。**
 *
 * `CLAUDE.md`「確かめられないものは、確かめられるものから切り離す」に合わせて、
 * three に触るのは `projectilerender.ts` だけにしてある（`drops.ts` ↔ `droprender.ts` と
 * まったく同じ対の形。見張りは `test/projectiles.test.ts`）。
 *
 * **火球・矢・投げたエンダーアイ・ドラゴンのブレスが全部これに乗る。** 違うのは
 * `PROJECTILE_KINDS` の 1 行だけで、飛び方の実装は 1 本しかない。
 *
 * **ドロップと逆に、飛んでいるものは保存しない。** 読み込んだ瞬間に矢が刺さり直したり
 * 火球が飛んでくるより、消えているほうが安全側（モブと同じ筋）。
 *
 * **`world.setVoxel` は呼ばない。** `edits` はプレイヤーの操作でなければならず、
 * セーブがそれに乗っている（モブ・ドロップと同じ制約）。当たったマスは
 * `onHitBlock` で外へ渡すだけで、そこで何が起きるかは呼ぶ側が決める。
 *
 * **誰に当たったか（`ProjectileTarget`）も同じ形。** ここが持つのは「重なったか」
 * という形の話だけで、**何がどれだけ減るかは撃った側が弾に載せる**（`Shot.damage`）。
 * 表（`PROJECTILE_KINDS`）にダメージを書かないこと —— 同じ火球でも撃つ相手が
 * 変われば重みが変わるし、手応えの数値は撃つ側の判断（`mobs.ts` の表）だから。
 */

import { Vector3 } from "three";
import { AIR, isLiquid } from "./blocks";
import { columnOf } from "./constants";
import { blockOverlapsBody, type BodySize } from "./physics";
import { VOID_Y } from "./vitals";
import type { World } from "./world";

/**
 * 重力と終端速度。**`player.ts` / `mobs.ts` / `drops.ts` と同じ値を自前で持つ。**
 * `rules/mobs.md` のとおり、速度の作り方（人は入力、モブは AI、ドロップは重力だけ、
 * 飛び道具は撃った向き）が違うので共有していない。**片方だけ変えないこと。**
 */
const GRAVITY = 30;
const TERMINAL = 55;

/**
 * 1 回の当たり判定で進んでよい距離。**速いものほど細かく刻む。**
 * これが無いと、矢（40 m/s ＝ 1 フレーム 0.67m）が薄いブロックを
 * すり抜けて向こう側へ出る。
 */
const MAX_STEP = 0.2;

/**
 * 同時に飛べる数。**距離では消さない**（撃った先が見えない所で消えると、
 * 当たったのか消えたのか分からない）。有限に保つのは寿命とこの上限の 2 本。
 */
export const MAX_PROJECTILES = 64;

/** 液体の中での減速（1 秒あたり）。水に入った矢が飛び続けないように。 */
const LIQUID_DRAG = 6;
/** 液体の中で重力に掛かる倍率。**0 にしないこと** —— 水面に矢が浮いたまま残る。 */
const LIQUID_GRAVITY = 0.3;

/** 見た目の回転の速さ (rad/s)。**描画が読むだけ**（`drops.ts` の `SPIN_RATE` と同じ役)。 */
export const PROJECTILE_SPIN = 2.2;

export type ProjectileKind = "fireball" | "arrow" | "eye" | "breath";

/**
 * 撃った本人の印。**0 はプレイヤー**で、モブは自分の `id`（1 から）を使う。
 * 同じ印の相手には当たらない —— 口元・手元から出るので、見ないと必ず自分に当たる。
 */
export const PLAYER_OWNER = 0;

/**
 * 当たる相手（プレイヤーとモブ）。**位置は足元の中心**（`physics.ts` の約束）で、
 * 飛び道具だけが体の中心を持つ。**呼ぶ側が毎フレーム集めて渡す**ので、
 * ここは `mobs.ts` も `player.ts` も知らないままでいられる。
 */
export interface ProjectileTarget {
  /** 誰か。`Projectile.owner` と同じなら当たらない（0 はプレイヤー）。 */
  readonly owner: number;
  /** **足元の中心。** */
  readonly position: Vector3;
  readonly size: BodySize;
}

/**
 * 1 発ぶんの注文。**撃つ側（モブの表・弓）が値を決めて渡す。**
 * `mobs.ts` が `projectiles.ts` を import しないで済むように、`MobContext.shoot`
 * がこれを受け取る形にしてある（`onDrop` が `drops.ts` を知らないのと同じ筋）。
 */
export interface Shot {
  readonly kind: ProjectileKind;
  /** 撃ち出す位置（体の中心）。 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 向き。長さは問わない（表の速さに正規化する）。 */
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** 撃った本人。省略でプレイヤー。 */
  readonly owner?: number;
  /** 当たった相手から減らす量。**決めるのは撃つ側**（表には無い）。 */
  readonly damage?: number;
}

/**
 * ブロックに当たったときにどうなるか。
 *
 * - `vanish` — 消える（火球・ブレス）
 * - `stick` — その場に刺さって止まり、寿命まで残る（矢）
 * - `pass` — ブロックを見ない（エンダーアイ。Minecraft と同じで壁を抜けて飛ぶ）
 */
export type BlockHit = "vanish" | "stick" | "pass";

export interface ProjectileDef {
  readonly kind: ProjectileKind;
  readonly name: string;
  /**
   * 当たり判定の半径。**見た目の立方体もこの大きさ**（`projectilerender.ts` が
   * `boxOf()` をそのまま積む）—— ずれると、当たっていないのに当たって見える。
   */
  readonly half: number;
  /** 見た目の色（sRGB hex）。**描画が読むだけ。** */
  readonly color: number;
  /** 重力の倍率。**0 なら落ちない**（火球・エンダーアイはまっすぐ飛ぶ）。 */
  readonly gravityScale: number;
  /** 空気抵抗（1 秒あたり）。0 なら勢いが落ちない。 */
  readonly drag: number;
  /** 撃ち出す速さ (m/s)。 */
  readonly speed: number;
  /** 寿命 (秒)。これを過ぎると消える。 */
  readonly life: number;
  readonly onBlock: BlockHit;
  /**
   * 自分で光るか。**描画が読むだけ**で、真なら周りの明るさに関わらず明るく出る
   * （暗いネザーの通路で火球が見えないと、避けようがない）。
   */
  readonly glows: boolean;
  /**
   * 速度の向きへ体を向けるか。真なら矢のように進行方向を向き、
   * 偽なら向きを持たずに回る（火球・ブレス）。**描画が読むだけ。**
   */
  readonly aims: boolean;
}

/**
 * 飛び道具の表。**足すのはここに 1 行**で、飛び方の実装は増やさないこと。
 *
 * 当たったときに何が起きるか（ダメージの数値・爆発・ポータルの位置）は**ここに書かない。**
 * 手応えを決める数値はユーザーのもので（`LOOP.md` の停止条件 4）、
 * 当たった相手ごとの処理は呼ぶ側（`main.ts` と、それぞれのモブの周）が決める。
 */
export const PROJECTILE_KINDS: readonly ProjectileDef[] = [
  {
    kind: "fireball",
    name: "火球",
    half: 0.25,
    color: 0xffa53a,
    gravityScale: 0,
    drag: 0,
    speed: 12,
    life: 8,
    onBlock: "vanish",
    glows: true,
    aims: false,
  },
  {
    kind: "arrow",
    name: "矢",
    half: 0.1,
    color: 0xc8b48c,
    gravityScale: 1,
    drag: 0.02,
    speed: 40,
    life: 60,
    onBlock: "stick",
    glows: false,
    aims: true,
  },
  {
    kind: "eye",
    name: "エンダーアイ",
    half: 0.15,
    color: 0x33a68c,
    gravityScale: 0,
    drag: 0,
    speed: 8,
    life: 12,
    // **壁を抜ける。** 要塞は地面の下にあるので、ブロックで止まると
    // 投げた場所から動かず、案内にならない。
    onBlock: "pass",
    glows: true,
    aims: false,
  },
  {
    kind: "breath",
    name: "ブレス",
    half: 0.35,
    color: 0xb05ce6,
    // わずかに落ちる。まっすぐ飛ばすと、地面に届かず頭上を素通りする。
    gravityScale: 0.12,
    drag: 1.5,
    speed: 6,
    life: 3,
    onBlock: "vanish",
    glows: true,
    aims: false,
  },
];

const BY_KIND = new Map<ProjectileKind, ProjectileDef>(
  PROJECTILE_KINDS.map((def) => [def.kind, def]),
);

export function projectileDef(kind: ProjectileKind): ProjectileDef {
  const def = BY_KIND.get(kind);
  if (!def) throw new Error(`知らない飛び道具: ${kind}`);
  return def;
}

/**
 * 見た目の立方体。**当たり判定と同じ大きさ**（`drops.ts` の `DROP_BOX` と同じ約束）。
 * **中心が原点**なので、`projectilerender.ts` は位置をそのまま貼れば向きも回せる。
 */
export function boxOf(kind: ProjectileKind): number[] {
  const h = projectileDef(kind).half;
  return [-h, -h, -h, h, h, h];
}

/**
 * 当たり判定の箱。**`position` は体の中心**なので、`physics.ts` の
 * 「足元の中心 + 高さ」の約束に直すときは `y - half` を渡すこと（`footOf()`）。
 */
function sizeOf(def: ProjectileDef): BodySize {
  return { half: def.half, height: def.half * 2, step: 0 };
}

export interface Projectile {
  readonly id: number;
  readonly kind: ProjectileKind;
  /** 撃った本人（`PLAYER_OWNER` はプレイヤー）。**この相手には当たらない。** */
  readonly owner: number;
  /** 当たった相手から減らす量。**撃った側が決めた値をそのまま運ぶだけ。** */
  readonly damage: number;
  /** **体の中心**（ドロップは足元の中心。飛び道具は回すので中心のほうが素直）。 */
  readonly position: Vector3;
  readonly velocity: Vector3;
  /** 見た目の向き。**速度から作った値を持たせる**（描画は読むだけ）。 */
  yaw: number;
  pitch: number;
  /** 見た目の回転位相。**描画が読むだけ。** */
  spin: number;
  /** 刺さって止まっている（`onBlock: "stick"` のものだけ）。 */
  stuck: boolean;
  /** 液体（水・溶岩）に浸かっている。 */
  inLiquid: boolean;
  /** 生まれてからの秒数。`def.life` で消える。 */
  age: number;
}

/**
 * 飛んでいるものの群れ。**毎フレームの駆動役をここに置くのが肝心。**
 * `main.ts` に散らすと、寿命・上限・当たり判定のような「静かに壊れる」判断が
 * DOM 込みでしか確かめられなくなる（`drops.ts` とまったく同じ理由）。
 */
export class Projectiles {
  readonly list: Projectile[] = [];
  private nextId = 1;

  /**
   * ブロックに当たった合図。**当たったマスの座標を渡すだけ**で、
   * そこで何が起きるか（火が付く・音が鳴る・矢が落ちる）は呼ぶ側が決める。
   */
  onHitBlock?: (projectile: Projectile, x: number, y: number, z: number) => void;
  /**
   * 相手に当たった合図。**当たったのは誰かを渡すだけ**で、いくつ減るか
   * （`projectile.damage`）をどう効かせるかは受け取る側（`mobs.ts`）が決める。
   */
  onHitTarget?: (projectile: Projectile, target: ProjectileTarget) => void;
  /** 寿命・奈落・上限で消えた合図（当たって消えたときは呼ばない）。 */
  onExpire?: (projectile: Projectile) => void;

  get count(): number {
    return this.list.length;
  }

  /**
   * 1 つ撃つ。位置は体の中心、向きは**速度そのもの**（正規化して `def.speed` を掛ける）。
   *
   * 向きの長さが 0 なら撃たない（向きの無いものはその場に止まったまま
   * 寿命まで残るだけで、撃った本人には何も見えない）。
   */
  spawn(
    kind: ProjectileKind,
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    owner = PLAYER_OWNER,
    damage = 0,
  ): Projectile | null {
    const def = projectileDef(kind);
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(length) || length <= 0) return null;

    // 上限に達していたら、いちばん古いものから消す。**新しいほうを捨てないこと**
    // （撃った瞬間に消えると、外したのか出ていないのか分からない）。
    while (this.list.length >= MAX_PROJECTILES) {
      const [gone] = this.list.splice(this.oldestIndex(), 1);
      if (gone) this.onExpire?.(gone);
    }

    const scale = def.speed / length;
    const velocity = new Vector3(dx * scale, dy * scale, dz * scale);
    const projectile: Projectile = {
      id: this.nextId++,
      kind,
      owner,
      damage,
      position: new Vector3(x, y, z),
      velocity,
      yaw: 0,
      pitch: 0,
      // 位相を個体ごとに散らす（そろえると、連射した火球が同時に回って板に見える）。
      spin: (this.nextId * 1.31) % (Math.PI * 2),
      stuck: false,
      inLiquid: false,
      age: 0,
    };
    aimAt(projectile, def);
    this.list.push(projectile);
    return projectile;
  }

  /**
   * 視線の向きへ撃つ。**向きの規約は `player.ts` の forward と同じ**
   * （yaw 0 のとき前は -Z。`drops.throwOut()` と同じ式）。
   */
  launch(
    kind: ProjectileKind,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    owner = PLAYER_OWNER,
    damage = 0,
  ): Projectile | null {
    const horizontal = Math.cos(pitch);
    return this.spawn(
      kind,
      x,
      y,
      z,
      -Math.sin(yaw) * horizontal,
      Math.sin(pitch),
      -Math.cos(yaw) * horizontal,
      owner,
      damage,
    );
  }

  /**
   * 注文（`Shot`）を 1 発撃つ。**撃つ側は座標と向きと重みを渡すだけ**で、
   * 飛び方は表が決める。`MobContext.shoot` の受け口がこれ。
   */
  fire(shot: Shot): Projectile | null {
    return this.spawn(
      shot.kind,
      shot.x,
      shot.y,
      shot.z,
      shot.dx,
      shot.dy,
      shot.dz,
      shot.owner ?? PLAYER_OWNER,
      shot.damage ?? 0,
    );
  }

  /**
   * 1 つ取り除く。**当たった先が消えたときに使う**（エンドクリスタルを砕いた矢）。
   *
   * 無かったら false。**`onExpire` は呼ばない** —— 寿命でも上限でもなく、
   * 当たって役目を終えたぶんなので（当たって消えるものが `onExpire` を
   * 通らないのと同じ扱い）。
   *
   * **`onHitBlock` の中から呼んでよい。** `update()` の走査は後ろから回るので、
   * いま見ている番号を抜いても、まだ見ていない前側の並びは動かない
   * （`vanish` がその場で `splice` しているのとまったく同じ理屈）。
   */
  remove(projectile: Projectile): boolean {
    const at = this.list.indexOf(projectile);
    if (at < 0) return false;
    this.list.splice(at, 1);
    return true;
  }

  clear(): void {
    this.list.length = 0;
  }

  /**
   * 1 フレームぶん進める。
   *
   * **`world.update()` の外で回すこと。** チャンク生成の予算の下に入れると、
   * 飛び道具の退行とストリーミングの退行が `test/world.test.ts` の p99 で
   * 区別できなくなる（`mobs.update()` / `drops.update()` とまったく同じ理由）。
   */
  update(dt: number, world: World, targets: readonly ProjectileTarget[] = NO_TARGETS): void {
    // **後ろから回すこと。** 当たった・寿命が尽きたものはその場で list から抜ける。
    for (let i = this.list.length - 1; i >= 0; i--) {
      const projectile = this.list[i];
      const def = projectileDef(projectile.kind);

      projectile.age += dt;
      projectile.spin += PROJECTILE_SPIN * dt;
      if (projectile.age >= def.life) {
        this.list.splice(i, 1);
        this.onExpire?.(projectile);
        continue;
      }

      // 奈落に落ちたものは消す。**寿命任せにしないこと** ——
      // 世界の底から下はどこまでも空なので、落ち続ける矢が残る。
      if (projectile.position.y < VOID_Y) {
        this.list.splice(i, 1);
        this.onExpire?.(projectile);
        continue;
      }

      // 刺さったものは動かさない（寿命だけが進む）。
      if (projectile.stuck) continue;

      // ボクセルの無い列に居るあいだは動かさない。`getVoxel` が AIR を返すので、
      // そのまま飛ばすと壁を抜けていく（`mobs.ts` / `drops.ts` と同じガード）。
      if (
        !world.hasColumn(columnOf(projectile.position.x), columnOf(projectile.position.z))
      ) {
        continue;
      }

      this.step(projectile, def, world, dt, i, targets);
    }
  }

  /** 重力・抵抗・液体・当たり判定。 */
  private step(
    projectile: Projectile,
    def: ProjectileDef,
    world: World,
    dt: number,
    index: number,
    targets: readonly ProjectileTarget[],
  ): void {
    const velocity = projectile.velocity;

    projectile.inLiquid = isLiquid(
      world.getVoxel(
        Math.floor(projectile.position.x),
        Math.floor(projectile.position.y),
        Math.floor(projectile.position.z),
      ),
    );

    const gravity = GRAVITY * def.gravityScale * (projectile.inLiquid ? LIQUID_GRAVITY : 1);
    if (gravity > 0) {
      velocity.y -= gravity * dt;
      if (velocity.y < -TERMINAL) velocity.y = -TERMINAL;
    }

    const drag = def.drag + (projectile.inLiquid ? LIQUID_DRAG : 0);
    if (drag > 0) {
      const keep = Math.max(0, 1 - dt * drag);
      velocity.multiplyScalar(keep);
    }

    aimAt(projectile, def);

    if (def.onBlock === "pass") {
      // ブロックを見ない。**当たり判定ごと飛ばす**ので、要塞の上を歩いていても
      // エンダーアイが地面に刺さって止まることがない。
      // **相手にも当たらない** —— 案内役なので、通り道に立った人を撃ってしまう
      // 道理がない（`onBlock` に「素通り」を選ぶとはそういうこと）。
      projectile.position.addScaledVector(velocity, dt);
      return;
    }

    // 速いものほど細かく刻む。**1 回で進みすぎると薄い壁を抜ける。**
    const distance = velocity.length() * dt;
    const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
    const size = sizeOf(def);
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const before = projectile.position.clone();
      projectile.position.addScaledVector(velocity, stepDt);

      // **相手を先に見ること。** 壁を背にした相手に当てたとき、先にブロックを見ると
      // 同じ刻みで壁のほうが勝って、当たったのに何も起きない形になる。
      // **当たった相手には、刺さるもの（矢）も残らず消える** —— 体に刺さった矢を
      // 持ち歩かせる仕組みが無いので、壁と同じ扱いにすると宙に浮いた矢が残る。
      const target = hitTarget(projectile, def, targets);
      if (target) {
        this.list.splice(index, 1);
        this.onHitTarget?.(projectile, target);
        return;
      }

      const cell = blockedCell(world, projectile.position, size);
      if (!cell) continue;

      // **ぶつかった手前で止める。** めり込んだ位置に置くと、刺さった矢が
      // 壁の中に埋まって見えなくなる。
      projectile.position.copy(before);
      if (def.onBlock === "stick") {
        projectile.stuck = true;
        velocity.set(0, 0, 0);
        this.onHitBlock?.(projectile, cell[0], cell[1], cell[2]);
      } else {
        this.list.splice(index, 1);
        this.onHitBlock?.(projectile, cell[0], cell[1], cell[2]);
      }
      return;
    }
  }

  private oldestIndex(): number {
    let best = 0;
    for (let i = 1; i < this.list.length; i++) {
      if (this.list[i].age > this.list[best].age) best = i;
    }
    return best;
  }
}

/**
 * 速度から見た目の向きを作る。**判断はここ**で、描画は `yaw` / `pitch` を読むだけ
 * （速度を描画側で見始めると、止まった矢の向きがその場で 0 に戻る）。
 */
function aimAt(projectile: Projectile, def: ProjectileDef): void {
  if (!def.aims) return;
  const v = projectile.velocity;
  const horizontal = Math.sqrt(v.x * v.x + v.z * v.z);
  if (horizontal <= 0 && v.y === 0) return;
  // `player.ts` の forward の逆算（yaw 0 のとき前は -Z）。
  projectile.yaw = Math.atan2(-v.x, -v.z);
  projectile.pitch = Math.atan2(v.y, horizontal);
}

/** 相手を渡さなかったとき用。**呼ぶたびに `[]` を作らない**（毎フレーム通る道）。 */
const NO_TARGETS: readonly ProjectileTarget[] = [];

/**
 * その位置で重なっている相手。無ければ null。
 *
 * **撃った本人には当たらない**（口元・手元から出るので、見ないと必ず自分に当たる）。
 * 箱どうしの重なりで見るだけ —— 相手は 1 フレームに数十体しか居ないので、
 * ブロックのように形（`blockOverlapsBody`）まで見る必要はない。
 *
 * **y の約束だけが違う。** 飛び道具は体の中心、相手は足元の中心（`physics.ts`）。
 */
function hitTarget(
  projectile: Projectile,
  def: ProjectileDef,
  targets: readonly ProjectileTarget[],
): ProjectileTarget | null {
  const half = def.half;
  const p = projectile.position;
  for (const target of targets) {
    if (target.owner === projectile.owner) continue;
    const size = target.size;
    if (Math.abs(p.x - target.position.x) > half + size.half) continue;
    if (Math.abs(p.z - target.position.z) > half + size.half) continue;
    if (p.y + half < target.position.y) continue;
    if (p.y - half > target.position.y + size.height) continue;
    return target;
  }
  return null;
}

/** `blockOverlapsBody()` に渡す足元の位置。呼ぶたびに作らないよう使い回す。 */
const foot = new Vector3();

/**
 * その位置の箱が重なっているマス。無ければ null。
 *
 * **`boxBlocked()` ではなく自前で走査している**のは、当たった**マスの座標**が要るから
 * （`physics.ts` は真偽しか返さない）。判定そのものは `blockOverlapsBody()` に聞くので、
 * ハーフや階段の形もそのまま効く。
 */
function blockedCell(
  world: World,
  position: Vector3,
  size: BodySize,
): [number, number, number] | null {
  foot.set(position.x, position.y - size.half, position.z);
  const minX = Math.floor(position.x - size.half);
  const maxX = Math.floor(position.x + size.half);
  const minY = Math.floor(foot.y);
  const maxY = Math.floor(foot.y + size.height);
  const minZ = Math.floor(position.z - size.half);
  const maxZ = Math.floor(position.z + size.half);

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const id = world.getVoxel(x, y, z);
        if (id === AIR) continue;
        if (blockOverlapsBody(x, y, z, id, foot, size)) return [x, y, z];
      }
    }
  }
  return null;
}
