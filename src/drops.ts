/**
 * 落ちたアイテム。**判断は全部ここ。**
 *
 * `CLAUDE.md`「確かめられないものは、確かめられるものから切り離す」に合わせて、
 * three に触るのは `droprender.ts` だけにしてある。このファイルには
 * three の `Vector3` 以外の描画も、DOM も、`AudioContext` も出てこない
 * （見張りは `test/drops.test.ts`。モブの `mobs.ts` ↔ `mobrender.ts` と同じ形）。
 *
 * **モブと逆に、ドロップは保存する。** モブはシードから作り直せるが、ドロップは
 * 「プレイヤーがやったことの結果」で、`edits` と同じ性質のもの。再起動で消えると、
 * 集めた物が黙って消えたのと同じになる。
 *
 * **`world.setVoxel` は呼ばない。** `edits` はプレイヤーの操作でなければならず、
 * セーブがそれに乗っている（モブと同じ制約）。
 */

import { Vector3 } from "three";
import { WATER } from "./blocks";
import { columnOf } from "./constants";
import type { Inventory } from "./inventory";
import { NO_ITEM, itemStackLimit } from "./items";
import { PLAYER_SIZE, moveBody, type BodySize } from "./physics";
import type { Sfx } from "./sfx";
import { VOID_Y } from "./vitals";
import type { World } from "./world";

/**
 * 当たり判定。Minecraft と同じ 0.25 立方。
 * **`step` は 0**（段差を自分で登られると、坂を勝手に遡っていく）。
 */
export const DROP_SIZE: BodySize = { half: 0.125, height: 0.25, step: 0 };

/**
 * 見た目の立方体。**当たり判定と同じ大きさにすること** ——
 * ずれると、地面にめり込んで見えたり浮いて見えたりする。
 * `droprender.ts` がこの箱をそのまま積む（`buildBoxMesh`）。
 */
export const DROP_BOX: readonly number[] = [
  -DROP_SIZE.half,
  0,
  -DROP_SIZE.half,
  DROP_SIZE.half,
  DROP_SIZE.height,
  DROP_SIZE.half,
];

/**
 * 重力と終端速度。**`player.ts` / `mobs.ts` と同じ値を自前で持つ。**
 * `CLAUDE.md`「モブ」のとおり、速度の作り方（人は入力、モブは AI、ドロップは重力だけ）が
 * 違うので共有していない。**片方だけ変えないこと。**
 */
const GRAVITY = 30;
const TERMINAL = 55;
/**
 * 水中で浮き上がる速さ。**沈む向きにしないこと** ——
 * 沈むと水底に溜まって取りに行けなくなる（Minecraft でもアイテムは水に浮く）。
 * `mobs.ts` の `WATER_RISE` と同じ仕掛けで、水面まで来ると頭が出て `inWater` が落ちる。
 */
const WATER_RISE = 1.0;

/** 接地しているときの横方向の減衰。投げたものが永久に滑らないように。 */
const GROUND_DAMP = 6;
/** 空中での横方向の減衰。落ちながらもわずかに勢いを失う。 */
const AIR_DAMP = 0.4;

/**
 * 掘った・倒した直後に拾えるまでの間（秒）。0 にすると、掘った瞬間に
 * インベントリへ入って「落ちている」ことが見えない。
 */
export const PICKUP_DELAY = 0.5;
/**
 * **プレイヤーが自分で捨てたものの猶予（秒）。** これが無いと、Q を押した次の
 * フレームで自分が拾い直して何も起きない。Minecraft と同じ 2 秒。
 */
export const THROW_DELAY = 2;

/** 拾える横の距離。 */
const PICKUP_RADIUS = 1.1;
/** 拾える縦の余白（足元より下・頭より上に、これだけはみ出しても拾える）。 */
const PICKUP_MARGIN = 0.5;
/**
 * 1 個も入らなかったあと、次に試すまでの間（秒）。
 * **これが無いと、満杯のプレイヤーが山の上に立っているあいだ毎フレーム
 * `inventory.add()` を呼び続ける**（拾えないのは分かりきっているのに）。
 */
const PICKUP_RETRY = 0.6;

/** 同じアイテムどうしが 1 山にまとまる距離。 */
const MERGE_RADIUS = 0.6;
/**
 * 統合を回す間隔（秒）。**総当りなので毎フレームは回さない。**
 * 拾う判定のほうは毎フレーム回すこと —— 4Hz にすると、スプリント（8.4m/s）で
 * 1 回あたり 2.1m 進んでしまい、拾える半径 1.1m を飛び越える。
 */
const MERGE_TICK = 0.25;

/** 消えるまでの寿命（秒）。Minecraft と同じ 5 分。 */
export const DESPAWN_AGE = 300;

/**
 * 同時に存在できる数。**距離では消さない**ぶん、ここと寿命の 2 本で有限に抑える。
 * （離れただけで持ち物が消えるのは、黙った削除と同じ。）
 *
 * 効いているのは物理の費用ではなく**ドローコール**（1 山 1 メッシュなので、
 * この数がそのまま増える）。まとめて 1 本にする（インスタンス化）ことはできるが、
 * この環境で描けないものを一気に増やすことになるので、まずはこの形で出す。
 */
export const MAX_DROPS = 128;

/** 掘ったブロックから飛び出す勢い。 */
const BURST_SPEED = 1.6;
const BURST_LIFT = 2.4;
/** Q で投げる勢い。歩いて追いつける程度に留める。 */
const THROW_SPEED = 6;
const THROW_LIFT = 2.6;

/** 見た目の回転の速さ (rad/s)。 */
export const SPIN_RATE = 1.4;
/** 上下の揺れ幅（ブロック）。 */
const BOB_HEIGHT = 0.08;

/**
 * 位相から上下の揺れを出す。**0 以上しか返さない** ——
 * 負まで振ると、地面に置いたアイテムが床にめり込む。
 * 回転と同じ位相を使うので、揺れと回りがそろう。
 */
export function dropBob(spin: number): number {
  return (BOB_HEIGHT * (1 - Math.cos(spin))) / 2;
}

export interface Drop {
  readonly id: number;
  item: number;
  count: number;
  /** 足元の中心。`PhysicsBody` を構造的に満たすので `moveBody()` にそのまま渡せる。 */
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
  inWater: boolean;
  /** これが 0 になるまで拾えない。 */
  pickupDelay: number;
  /** 生まれてからの秒数。`DESPAWN_AGE` で消える。 */
  age: number;
  /** 見た目の回転位相。**描画が読むだけ**（`droprender.ts`）。 */
  spin: number;
}

/** 落ちたアイテムの周りの状況。`main.ts` から毎フレーム渡す。 */
export interface DropContext {
  readonly playerX: number;
  readonly playerY: number;
  readonly playerZ: number;
  /** 拾い先。渡さなければ誰も拾わない（テストと、遊んでいない間）。 */
  readonly inventory?: Inventory;
}

/**
 * 落ちたアイテムの群れ。**毎フレームの駆動役をここに置くのが肝心。**
 * `main.ts` に散らすと、拾う距離・猶予・寿命・統合のような「静かに壊れる」判断が
 * DOM 込みでしか確かめられなくなる。
 */
export class Drops {
  readonly list: Drop[] = [];
  private nextId = 1;
  private mergeTimer = 0;

  /** 拾った受け取り口。`mobs.onSound` と同じで、`main.ts` は `audio` へ素通しする。 */
  onSound?: (sfx: Sfx) => void;
  /** 中身が変わった合図（インベントリの再描画とセーブの印）。 */
  onChange?: () => void;

  get count(): number {
    return this.list.length;
  }

  /** 地面のアイテムの総数（テストの不変条件で使う）。 */
  get totalItems(): number {
    let total = 0;
    for (const drop of this.list) total += drop.count;
    return total;
  }

  /**
   * 1 山置く。位置は足元の中心。
   * **`count` は上限を超えていてもそのまま持つ**（拾うときにインベントリ側で分かれる）。
   */
  spawn(
    item: number,
    count: number,
    x: number,
    y: number,
    z: number,
    options: { vx?: number; vy?: number; vz?: number; delay?: number } = {},
  ): Drop | null {
    if (item === NO_ITEM || count <= 0) return null;
    // 上限に達していたら、いちばん古いものから消す。**新しいほうを捨てないこと**
    // （掘ったばかりの物が出た瞬間に消えると、何が起きたか分からない）。
    while (this.list.length >= MAX_DROPS) this.list.splice(this.oldestIndex(), 1);

    const drop: Drop = {
      id: this.nextId++,
      item,
      count,
      position: new Vector3(x, y, z),
      velocity: new Vector3(options.vx ?? 0, options.vy ?? 0, options.vz ?? 0),
      onGround: false,
      inWater: false,
      pickupDelay: options.delay ?? PICKUP_DELAY,
      age: 0,
      // 位相を個体ごとに散らす。そろえると、並んだアイテムが軍隊のように同時に揺れる。
      spin: (this.nextId * 1.31) % (Math.PI * 2),
    };
    this.list.push(drop);
    this.onChange?.();
    return drop;
  }

  /**
   * 掘ったブロック・倒したモブから飛び出す 1 山。**マスの中心から少しだけ跳ねる。**
   * 真下に置くと、掘った本人の足元に埋まって見えない。
   */
  burst(item: number, count: number, x: number, y: number, z: number, random = Math.random): Drop | null {
    const angle = random() * Math.PI * 2;
    const speed = BURST_SPEED * (0.4 + random() * 0.6);
    return this.spawn(item, count, x, y, z, {
      vx: Math.cos(angle) * speed,
      vy: BURST_LIFT,
      vz: Math.sin(angle) * speed,
    });
  }

  /**
   * プレイヤーが捨てた 1 山を視線の向きへ投げる。
   * **猶予（`THROW_DELAY`）をここで決めるのが肝心** —— 呼ぶ側に選ばせると、
   * 捨てた瞬間に拾い直す経路がいつか混ざる。
   */
  throwOut(
    item: number,
    count: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
  ): Drop | null {
    // 向きの規約は `player.ts` の forward と同じ（yaw 0 のとき前は -Z）。
    const horizontal = Math.cos(pitch);
    return this.spawn(item, count, x, y, z, {
      vx: -Math.sin(yaw) * horizontal * THROW_SPEED,
      vy: Math.sin(pitch) * THROW_SPEED + THROW_LIFT,
      vz: -Math.cos(yaw) * horizontal * THROW_SPEED,
      delay: THROW_DELAY,
    });
  }

  clear(): void {
    this.list.length = 0;
    this.mergeTimer = 0;
  }

  /**
   * 1 フレームぶん進める。
   *
   * **`world.update()` の外で回すこと。** チャンク生成の予算の下に入れると、
   * ドロップの退行とストリーミングの退行が `test/world.test.ts` の p99 で
   * 区別できなくなる（`mobs.update()` とまったく同じ理由）。
   */
  update(dt: number, world: World, ctx: DropContext): void {
    this.mergeTimer += dt;
    const merging = this.mergeTimer >= MERGE_TICK;
    if (merging) this.mergeTimer = 0;

    let picked = false;

    // **後ろから回すこと。** 拾われた・寿命が尽きた山はその場で list から抜ける。
    for (let i = this.list.length - 1; i >= 0; i--) {
      const drop = this.list[i];

      drop.age += dt;
      if (drop.age >= DESPAWN_AGE) {
        this.list.splice(i, 1);
        this.onChange?.();
        continue;
      }
      if (drop.pickupDelay > 0) drop.pickupDelay = Math.max(0, drop.pickupDelay - dt);
      drop.spin += SPIN_RATE * dt;

      // 奈落に落ちたものは消す。**寿命任せにしないこと** ——
      // 世界の底から下はどこまでも空なので、5 分間ずっと落ち続ける山が残る。
      if (drop.position.y < VOID_Y) {
        this.list.splice(i, 1);
        this.onChange?.();
        continue;
      }

      // ボクセルの無い列に居るあいだは動かさない。`getVoxel` が AIR を返すので、
      // そのまま物理を回すと世界を突き抜けて落ちていく（`mobs.ts` と同じガード）。
      if (!world.hasColumn(columnOf(drop.position.x), columnOf(drop.position.z))) continue;

      this.step(drop, world, dt);

      if (this.tryPickup(drop, i, ctx)) picked = true;
    }

    if (merging) this.mergeAll();
    // **音は 1 フレームに 1 回まで。** 山が重なった所へ歩き込むと一度に何個も拾うので、
    // 1 山ずつ鳴らすと音が潰れて割れる。
    if (picked) this.onSound?.("pickup");
  }

  /** 重力・水・当たり判定。 */
  private step(drop: Drop, world: World, dt: number): void {
    drop.inWater =
      world.getVoxel(
        Math.floor(drop.position.x),
        Math.floor(drop.position.y + DROP_SIZE.height * 0.5),
        Math.floor(drop.position.z),
      ) === WATER;

    if (drop.inWater) {
      drop.velocity.y += (WATER_RISE - drop.velocity.y) * Math.min(1, dt * 6);
    } else {
      drop.velocity.y -= GRAVITY * dt;
      if (drop.velocity.y < -TERMINAL) drop.velocity.y = -TERMINAL;
    }

    const damp = Math.max(0, 1 - dt * (drop.onGround ? GROUND_DAMP : AIR_DAMP));
    drop.velocity.x *= damp;
    drop.velocity.z *= damp;

    // 段差は登らせない（`canStep` は false）。
    moveBody(world, drop, DROP_SIZE, dt, false);
  }

  /**
   * 拾う。**入りきらなかったぶんは地面に残す** —— 山ごと消すと、
   * インベントリが満杯の人が掘った物を静かに失う。
   */
  private tryPickup(drop: Drop, index: number, ctx: DropContext): boolean {
    const inventory = ctx.inventory;
    if (!inventory || drop.pickupDelay > 0) return false;

    const dx = drop.position.x - ctx.playerX;
    const dz = drop.position.z - ctx.playerZ;
    if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) return false;
    if (drop.position.y + DROP_SIZE.height < ctx.playerY - PICKUP_MARGIN) return false;
    if (drop.position.y > ctx.playerY + PLAYER_SIZE.height + PICKUP_MARGIN) return false;

    const left = inventory.add(drop.item, drop.count);
    if (left >= drop.count) {
      // 1 個も入らなかった。次に試すまで少し待つ（毎フレーム聞き直さない）。
      drop.pickupDelay = PICKUP_RETRY;
      return false;
    }

    drop.count = left;
    if (left <= 0) {
      this.list.splice(index, 1);
    } else {
      // 部分回収。残りをその場に置いたまま、次の問い合わせまで間を空ける。
      drop.pickupDelay = PICKUP_RETRY;
    }
    this.onChange?.();
    return true;
  }

  /**
   * 同じアイテムの近い山を 1 つにまとめる。**合計は変えない。**
   * 積める上限（`itemStackLimit`）を超えるぶんは元の山に残す。
   */
  private mergeAll(): void {
    let changed = false;
    for (let i = this.list.length - 1; i > 0; i--) {
      const a = this.list[i];
      // 上限は相手ごとに変わらないので、内側のループから出しておく。
      const limit = itemStackLimit(a.item);
      for (let j = i - 1; j >= 0; j--) {
        const b = this.list[j];
        if (b.item !== a.item) continue;
        const room = limit - b.count;
        if (room <= 0) continue;
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        if (dx * dx + dy * dy + dz * dz > MERGE_RADIUS * MERGE_RADIUS) continue;

        const move = Math.min(room, a.count);
        b.count += move;
        a.count -= move;
        // 受け取った側の猶予は長いほうに合わせる（投げたばかりの山を、
        // 足元の古い山に吸わせて即座に拾い直せてしまうのを防ぐ）。
        b.pickupDelay = Math.max(b.pickupDelay, a.pickupDelay);
        changed = true;
        if (a.count <= 0) {
          this.list.splice(i, 1);
          break;
        }
      }
    }
    if (changed) this.onChange?.();
  }

  private oldestIndex(): number {
    let best = 0;
    for (let i = 1; i < this.list.length; i++) {
      if (this.list[i].age > this.list[best].age) best = i;
    }
    return best;
  }

  /**
   * セーブ用の平坦配列。1 山につき `[item, count, x, y, z]` の 5 要素。
   *
   * **`age` と `pickupDelay` は持たない。** 読み込み直後に足元の物が消えるより、
   * 5 分の猶予が戻るほうが安全側（`storage.ts` の `drops` のコメントも参照）。
   */
  serialize(): number[] {
    const flat: number[] = [];
    for (const drop of this.list) {
      if (drop.count <= 0) continue;
      flat.push(
        drop.item,
        drop.count,
        round2(drop.position.x),
        round2(drop.position.y),
        round2(drop.position.z),
      );
    }
    return flat;
  }

  /** セーブから戻す。**壊れた値は黙って飛ばす**（読めないより、欠けるほうがまし）。 */
  deserialize(flat: number[] | undefined): void {
    this.clear();
    if (!Array.isArray(flat)) return;
    for (let i = 0; i + 4 < flat.length; i += 5) {
      const [item, count, x, y, z] = flat.slice(i, i + 5);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      this.spawn(item, count, x, y, z);
    }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
