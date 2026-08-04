import { Euler, Vector3, type PerspectiveCamera } from "three";
import { WATER, collisionBoxes } from "./blocks";
import type { World } from "./world";

const WIDTH = 0.6;
const HEIGHT = 1.8;
const EYE = 1.62;
const HALF = WIDTH / 2;
const EPS = 1e-3;

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.4;
const FLY_SPEED = 14;
const ACCEL_GROUND = 60;
const ACCEL_AIR = 14;
const GRAVITY = 30;
const JUMP_SPEED = 9.2;
const TERMINAL = 55;
const SWIM_SPEED = 4.5;
/**
 * 自動で登れる段差。ハーフブロック（0.5）と階段の 1 段は登れて、
 * 立方体（1.0）は登れない高さにしてある。
 */
const STEP_HEIGHT = 0.6;

const scratch = new Vector3();

export class Player {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  pitch = 0;
  flying = false;
  onGround = false;
  inWater = false;

  private readonly keys = new Set<string>();
  private readonly euler = new Euler(0, 0, 0, "YXZ");
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly wish = new Vector3();

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
    this.inWater = world.getVoxel(
      Math.floor(this.position.x),
      Math.floor(this.position.y + 0.4),
      Math.floor(this.position.z),
    ) === WATER;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.wish.set(0, 0, 0);
    if (this.keys.has("KeyW")) this.wish.add(this.forward);
    if (this.keys.has("KeyS")) this.wish.sub(this.forward);
    if (this.keys.has("KeyD")) this.wish.add(this.right);
    if (this.keys.has("KeyA")) this.wish.sub(this.right);
    if (this.wish.lengthSq() > 0) this.wish.normalize();

    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    if (this.flying) {
      this.updateFly(dt, sprinting);
    } else {
      this.updateWalk(dt, sprinting);
    }

    this.move(world, dt);
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
    const speed = (sprinting ? SPRINT_SPEED : WALK_SPEED) * (this.inWater ? 0.6 : 1);
    const accel = (this.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
    const targetX = this.wish.x * speed;
    const targetZ = this.wish.z * speed;
    this.velocity.x += Math.max(-accel, Math.min(accel, targetX - this.velocity.x));
    this.velocity.z += Math.max(-accel, Math.min(accel, targetZ - this.velocity.z));

    if (this.inWater) {
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

  /** 軸ごとに動かして、めり込んだら接触面まで戻す。 */
  private move(world: World, dt: number): void {
    const p = this.position;

    p.x += this.velocity.x * dt;
    if (collides(world, p) && !this.stepUp(world, p)) {
      p.x = this.velocity.x > 0 ? hitMin[0] - HALF - EPS : hitMax[0] + HALF + EPS;
      this.velocity.x = 0;
    }

    p.z += this.velocity.z * dt;
    if (collides(world, p) && !this.stepUp(world, p)) {
      p.z = this.velocity.z > 0 ? hitMin[2] - HALF - EPS : hitMax[2] + HALF + EPS;
      this.velocity.z = 0;
    }

    const wasFalling = this.velocity.y <= 0;
    p.y += this.velocity.y * dt;
    if (collides(world, p)) {
      if (wasFalling) {
        // ぶつかった箱のうち一番高い上面に立つ（ハーフブロックなら半分の高さ）
        p.y = hitMax[1];
        this.onGround = true;
      } else {
        p.y = hitMin[1] - HEIGHT - EPS;
      }
      this.velocity.y = 0;
    } else if (wasFalling) {
      // 足元に何も無ければ落下中
      this.onGround = collides(world, scratch.copy(p).setY(p.y - EPS * 4));
    }
  }

  /**
   * 半ブロックまでの段差を自動で登る。**これが無いとハーフブロックと階段は
   * ジャンプしないと上れず、階段を置く意味が無くなる。**
   * 立方体は 1.0 あって `STEP_HEIGHT` を超えるので、壁は登れないまま。
   *
   * 呼ぶのは横移動でぶつかった直後だけ。`collides()` が残した `hitMax` を見るので、
   * **間に別の `collides()` を挟まないこと。**
   */
  private stepUp(world: World, p: Vector3): boolean {
    if (!this.onGround || this.flying) return false;
    const top = hitMax[1];
    if (top - p.y > STEP_HEIGHT || top <= p.y) return false;

    const before = p.y;
    p.y = top;
    // 登った先の頭上が塞がっていたら、素直にぶつかったままにする
    if (collides(world, p)) {
      p.y = before;
      return false;
    }
    return true;
  }

  /**
   * このブロックを置いたらプレイヤーと重なるか（設置の可否判定に使う）。
   * ブロックごとに形が違うので、足元の下付きハーフのように
   * 重ならない形なら置ける。
   */
  overlapsBlock(x: number, y: number, z: number, id: number): boolean {
    const p = this.position;
    for (const b of collisionBoxes(id)) {
      if (
        x + b[3] > p.x - HALF &&
        x + b[0] < p.x + HALF &&
        y + b[4] > p.y &&
        y + b[1] < p.y + HEIGHT &&
        z + b[5] > p.z - HALF &&
        z + b[2] < p.z + HALF
      ) {
        return true;
      }
    }
    return false;
  }
}

/**
 * 直近の `collides()` でぶつかった箱の範囲。軸ごとの押し戻し先になる。
 * `hitMin` は最も手前の面、`hitMax` は最も奥の面（複数にまたがったら、
 * どちらも押し出す側に安全な方をとる）。
 *
 * 呼ぶたびに配列を作るとフレームの最悪値に出るので、モジュール側に置いて使い回す。
 */
const hitMin = [0, 0, 0];
const hitMax = [0, 0, 0];

/**
 * プレイヤーの AABB がブロックの当たり判定の箱と重なるか。
 * ブロックは 1x1x1 とは限らない（ハーフ・階段）ので、
 * **`isSolid` ではなく `collisionBoxes` を見ること。**
 */
function collides(world: World, p: Vector3): boolean {
  // 端がぴったり接しているだけの状態を「めり込み」と見ないよう、少し内側で見る
  const px0 = p.x - HALF + EPS;
  const px1 = p.x + HALF - EPS;
  const py0 = p.y + EPS;
  const py1 = p.y + HEIGHT - EPS;
  const pz0 = p.z - HALF + EPS;
  const pz1 = p.z + HALF - EPS;

  hitMin[0] = hitMin[1] = hitMin[2] = Infinity;
  hitMax[0] = hitMax[1] = hitMax[2] = -Infinity;
  let hit = false;

  for (let y = Math.floor(py0); y <= Math.floor(py1); y++) {
    for (let z = Math.floor(pz0); z <= Math.floor(pz1); z++) {
      for (let x = Math.floor(px0); x <= Math.floor(px1); x++) {
        for (const b of collisionBoxes(world.getVoxel(x, y, z))) {
          const bx0 = x + b[0];
          const by0 = y + b[1];
          const bz0 = z + b[2];
          const bx1 = x + b[3];
          const by1 = y + b[4];
          const bz1 = z + b[5];
          if (bx1 <= px0 || bx0 >= px1) continue;
          if (by1 <= py0 || by0 >= py1) continue;
          if (bz1 <= pz0 || bz0 >= pz1) continue;
          hit = true;
          if (bx0 < hitMin[0]) hitMin[0] = bx0;
          if (by0 < hitMin[1]) hitMin[1] = by0;
          if (bz0 < hitMin[2]) hitMin[2] = bz0;
          if (bx1 > hitMax[0]) hitMax[0] = bx1;
          if (by1 > hitMax[1]) hitMax[1] = by1;
          if (bz1 > hitMax[2]) hitMax[2] = bz1;
        }
      }
    }
  }
  return hit;
}
