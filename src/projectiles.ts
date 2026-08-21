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
    );
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
  update(dt: number, world: World): void {
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

      this.step(projectile, def, world, dt, i);
    }
  }

  /** 重力・抵抗・液体・当たり判定。 */
  private step(
    projectile: Projectile,
    def: ProjectileDef,
    world: World,
    dt: number,
    index: number,
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
