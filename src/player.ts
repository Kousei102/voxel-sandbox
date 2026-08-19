import { Euler, Vector3, type PerspectiveCamera } from "three";
import { AIR, WATER, isHotLiquid, isLiquid } from "./blocks";
import { PLAYER_SIZE, blockOverlapsBody, moveBody } from "./physics";
import type { World } from "./world";

const EYE = 1.62;

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.4;
const FLY_SPEED = 14;
const ACCEL_GROUND = 60;
const ACCEL_AIR = 14;
const GRAVITY = 30;
const JUMP_SPEED = 9.2;
const TERMINAL = 55;
const SWIM_SPEED = 4.5;

const scratch = new Vector3();

export class Player {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;
  /**
   * 体が浸かっている液体の ID（浸かっていなければ `AIR`）。
   * **物理はどの液体でも同じ**ので、速さも浮力も `inLiquid` を見る。
   * 水そのものを見るのは息・音のこもり・水しぶきだけ（`CLAUDE.md` の液体の項）。
   */
  liquid = AIR;
  /**
   * 走れるか。**毎フレーム外から入れる**（判断は `vitals.ts` の `canSprint`）。
   * ここで空腹を見に行かないこと —— 移動が体力の都合を知り始めると、
   * どちらもブラウザでしか確かめられなくなる。
   */
  canSprint = true;
  /** いま走っているか（消耗と足音の判断材料として外へ渡す）。 */
  sprinting = false;

  private readonly keys = new Set<string>();
  private readonly euler = new Euler(0, 0, 0, "YXZ");
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly wish = new Vector3();

  /** 液体に浸かっているか。**泳ぎ・浮力・速さはこちら。** */
  get inLiquid(): boolean {
    return this.liquid !== AIR;
  }

  /** 水に浸かっているか。**水しぶきの音と息はこちら**（溶岩で溺れさせないため）。 */
  get inWater(): boolean {
    return this.liquid === WATER;
  }

  /** 溶岩に浸かっているか。ダメージの判断は `vitals.ts`（ここは事実を渡すだけ）。 */
  get inLava(): boolean {
    return isHotLiquid(this.liquid);
  }

  constructor(private readonly camera: PerspectiveCamera) {}

  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys(): void {
    this.keys.clear();
  }

  look(dx: number, dy: number, sensitivity = 0.0022): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  toggleFly(): void {
    this.flying = !this.flying;
    if (this.flying) this.velocity.y = 0;
  }

  update(dt: number, world: World): void {
    const at = world.getVoxel(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.4),
      Math.floor(this.position.z),
    );
    this.liquid = isLiquid(at) ? at : AIR;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.wish.set(0, 0, 0);
    if (this.keys.has("KeyW")) this.wish.add(this.forward);
    if (this.keys.has("KeyS")) this.wish.sub(this.forward);
    if (this.keys.has("KeyD")) this.wish.add(this.right);
    if (this.keys.has("KeyA")) this.wish.sub(this.right);
    if (this.wish.lengthSq() > 0) this.wish.normalize();

    // 腹が減ると走れない（Minecraft と同じ）。飛行は空腹と関係ない。
    const holding = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const sprinting = holding && (this.flying || this.canSprint);
    this.sprinting = sprinting && !this.flying && this.wish.lengthSq() > 0;

    if (this.flying) {
      this.updateFly(dt, sprinting);
    } else {
      this.updateWalk(dt, sprinting);
    }

    // 段差を登れるかは、横に動かす前の状態で決まる（`moveBody` のコメント参照）
    moveBody(world, this, PLAYER_SIZE, dt, this.onGround && !this.flying);
    this.syncCamera();
  }

  /** カメラを目線の位置と向きに合わせる。メニュー表示中も背景を描くために使う。 */
  syncCamera(): void {
    this.camera.position.set(this.position.x, this.position.y + EYE, this.position.z);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  private updateFly(dt: number, sprinting: boolean): void {
    const speed = FLY_SPEED * (sprinting ? 2 : 1);
    let vy = 0;
    if (this.keys.has("Space")) vy += 1;
    if (this.keys.has("ControlLeft") || this.keys.has("KeyC")) vy -= 1;
    scratch.set(this.wish.x * speed, vy * speed, this.wish.z * speed);
    this.velocity.lerp(scratch, Math.min(1, dt * 14));
    this.onGround = false;
  }

  private updateWalk(dt: number, sprinting: boolean): void {
    const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (this.inLiquid ? 0.6 : 1);
    const accel = (this.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
    const targetX = this.wish.x * speed;
    const targetZ = this.wish.z * speed;
    this.velocity.x += Math.max(-accel, Math.min(accel, targetX - this.velocity.x));
    this.velocity.z += Math.max(-accel, Math.min(accel, targetZ - this.velocity.z));

    if (this.inLiquid) {
      this.velocity.y -= GRAVITY * 0.22 * dt;
      if (this.keys.has("Space")) this.velocity.y = SWIM_SPEED;
      this.velocity.y = Math.max(-8, Math.min(SWIM_SPEED, this.velocity.y));
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -TERMINAL) this.velocity.y = -TERMINAL;
      if (this.onGround && this.keys.has("Space")) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }

    if (this.onGround && this.wish.lengthSq() === 0) {
      // 摩擦
      const damp = Math.max(0, 1 - dt * 12);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }
  }

  /**
   * このブロックを置いたらプレイヤーと重なるか（設置の可否判定に使う）。
   * ブロックごとに形が違うので、足元の下付きハーフのように
   * 重ならない形なら置ける。
   */
  overlapsBlock(x: number, y: number, z: number, id: number): boolean {
    return blockOverlapsBody(x, y, z, id, this.position, PLAYER_SIZE);
  }
}
