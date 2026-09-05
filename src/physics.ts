/**
 * AABB の当たり判定と移動。**プレイヤーもモブもここを通る。**
 *
 * もとは `player.ts` の中にあって寸法（0.6 x 1.8）を決め打ちしていた。
 * モブは寸法が違うので `BodySize` で受け取る形に切り出してある。
 * **切り出しの際に式も評価順も変えていない**（`test/physics.test.ts` が
 * 軌跡を数値で固定しているので、変えると落ちる）。
 *
 * three にも DOM にも触らないので、丸ごとヘッドレスで検証できる。
 */

import { Vector3 } from "three";
import { collisionBoxes } from "./blocks";
import type { World } from "./world";

const EPS = 1e-3;

export interface BodySize {
  /** 横幅の半分。 */
  readonly half: number;
  readonly height: number;
  /** 自動で登れる段差。0 なら登らない。 */
  readonly step: number;
}

/**
 * 動く箱。`Player` も `Mob` も**構造的に**これを満たすので、
 * どちらかを継承させたり implements させたりする必要はない。
 */
export interface PhysicsBody {
  readonly position: Vector3;
  readonly velocity: Vector3;
  onGround: boolean;
}

/**
 * プレイヤーの寸法。段差 0.6 はハーフブロック（0.5）と階段の 1 段は登れて、
 * 立方体（1.0）は登れない高さ。**これが無いと階段を置く意味が無くなる。**
 */
export const PLAYER_SIZE: BodySize = { half: 0.3, height: 1.8, step: 0.6 };

/**
 * 直近の `collides()` でぶつかった箱の範囲。軸ごとの押し戻し先になる。
 * `min` は最も手前の面、`max` は最も奥の面（複数にまたがったら、
 * どちらも押し出す側に安全な方をとる）。
 *
 * 呼ぶたびに配列を作るとフレームの最悪値に出るので、モジュール側に置いて使い回す。
 * **モブが何十体居ても安全なのは、`moveBody()` が 1 体ぶん走り切って再入しないから**
 * （`mesher.ts` が `mask` を使い回しているのと同じ理屈）。
 * だから `collides` も contact も外へ出さない。**押し戻しと `stepUp` の繋がりが
 * 1 つの関数の呼び出しの中に閉じている**ことが、この使い回しの前提になっている。
 */
const contactMin = [0, 0, 0];
const contactMax = [0, 0, 0];

/**
 * 箱がブロックの当たり判定と重なるか。重なった箱の範囲を `contactMin` / `contactMax` に残す。
 *
 * ブロックは 1x1x1 とは限らない（ハーフ・階段）ので、
 * **`isSolid` ではなく `collisionBoxes` を見ること。**
 */
function collides(world: World, x: number, y: number, z: number, size: BodySize): boolean {
  // 端がぴったり接しているだけの状態を「めり込み」と見ないよう、少し内側で見る
  const px0 = x - size.half + EPS;
  const px1 = x + size.half - EPS;
  const py0 = y + EPS;
  const py1 = y + size.height - EPS;
  const pz0 = z - size.half + EPS;
  const pz1 = z + size.half - EPS;

  contactMin[0] = contactMin[1] = contactMin[2] = Infinity;
  contactMax[0] = contactMax[1] = contactMax[2] = -Infinity;
  let hit = false;

  for (let by = Math.floor(py0); by <= Math.floor(py1); by++) {
    for (let bz = Math.floor(pz0); bz <= Math.floor(pz1); bz++) {
      for (let bx = Math.floor(px0); bx <= Math.floor(px1); bx++) {
        for (const b of collisionBoxes(world.getVoxel(bx, by, bz))) {
          const bx0 = bx + b[0];
          const by0 = by + b[1];
          const bz0 = bz + b[2];
          const bx1 = bx + b[3];
          const by1 = by + b[4];
          const bz1 = bz + b[5];
          if (bx1 <= px0 || bx0 >= px1) continue;
          if (by1 <= py0 || by0 >= py1) continue;
          if (bz1 <= pz0 || bz0 >= pz1) continue;
          hit = true;
          if (bx0 < contactMin[0]) contactMin[0] = bx0;
          if (by0 < contactMin[1]) contactMin[1] = by0;
          if (bz0 < contactMin[2]) contactMin[2] = bz0;
          if (bx1 > contactMax[0]) contactMax[0] = bx1;
          if (by1 > contactMax[1]) contactMax[1] = by1;
          if (bz1 > contactMax[2]) contactMax[2] = bz1;
        }
      }
    }
  }
  return hit;
}

/**
 * 段差を自動で登る。**これが無いとハーフブロックと階段はジャンプしないと上れず、
 * 階段を置く意味が無くなる。** 立方体は 1.0 あって `size.step` を超えるので、壁は登れないまま。
 *
 * 呼ぶのは横移動でぶつかった直後だけ。**直前の `collides()` が残した `contactMax` を見るので、
 * 間に別の `collides()` を挟まないこと。**
 */
function stepUp(world: World, p: Vector3, size: BodySize): boolean {
  const top = contactMax[1];
  if (top - p.y > size.step || top <= p.y) return false;

  const before = p.y;
  p.y = top;
  // 登った先の頭上が塞がっていたら、素直にぶつかったままにする
  if (collides(world, p.x, p.y, p.z, size)) {
    p.y = before;
    return false;
  }
  return true;
}

/**
 * 軸ごとに動かして、めり込んだら接触面まで戻す。`body.onGround` を書き換える。
 *
 * `canStep` は呼ぶ側が決める（プレイヤーなら「接地していて飛行していない」）。
 * **切り出す前は `stepUp()` の中で `onGround && !flying` を毎回見ていたが、
 * `onGround` が書かれるのは X・Z のあとの Y 相だけで、飛行側は `move()` を呼ぶ前に
 * `onGround = false` にしている。だから頭で 1 回決めるのと完全に同じ結果になる。**
 *
 * 戻り値は**横で押し戻されたか**（段差で登れたぶんは入らない ＝「登れない壁に当たった」）。
 * モブがジャンプするかどうかの唯一の材料。プレイヤーは見ない（跳ぶかどうかは人が決める）。
 * **押し戻しそのものは 1 行も変えていない**ので、`test/physics.test.ts` の軌跡は動かない。
 */
export function moveBody(
  world: World,
  body: PhysicsBody,
  size: BodySize,
  dt: number,
  canStep: boolean,
): boolean {
  const p = body.position;
  const v = body.velocity;
  let blocked = false;

  p.x += v.x * dt;
  if (collides(world, p.x, p.y, p.z, size) && !(canStep && stepUp(world, p, size))) {
    p.x = v.x > 0 ? contactMin[0] - size.half - EPS : contactMax[0] + size.half + EPS;
    v.x = 0;
    blocked = true;
  }

  p.z += v.z * dt;
  if (collides(world, p.x, p.y, p.z, size) && !(canStep && stepUp(world, p, size))) {
    p.z = v.z > 0 ? contactMin[2] - size.half - EPS : contactMax[2] + size.half + EPS;
    v.z = 0;
    blocked = true;
  }

  const wasFalling = v.y <= 0;
  p.y += v.y * dt;
  if (collides(world, p.x, p.y, p.z, size)) {
    if (wasFalling) {
      // ぶつかった箱のうち一番高い上面に立つ（ハーフブロックなら半分の高さ）
      p.y = contactMax[1];
      body.onGround = true;
    } else {
      p.y = contactMin[1] - size.height - EPS;
    }
    v.y = 0;
  } else if (wasFalling) {
    // 足元に何も無ければ落下中
    body.onGround = collides(world, p.x, p.y - EPS * 4, p.z, size);
  }

  return blocked;
}

/**
 * この位置に置いた箱が地形と重なるか。**モブを湧かせる場所の空きの判定に使う。**
 * `collisionBoxes` を見るので、ハーフや階段の中には湧かない。
 */
export function boxBlocked(
  world: World,
  x: number,
  y: number,
  z: number,
  size: BodySize,
): boolean {
  return collides(world, x, y, z, size);
}

/**
 * そのブロックを置いたら箱と重なるか（設置の可否判定に使う）。
 * ブロックごとに形が違うので、足元の下付きハーフのように重ならない形なら置ける。
 */
export function blockOverlapsBody(
  bx: number,
  by: number,
  bz: number,
  id: number,
  position: Vector3,
  size: BodySize,
): boolean {
  for (const b of collisionBoxes(id)) {
    if (
      bx + b[3] > position.x - size.half &&
      bx + b[0] < position.x + size.half &&
      by + b[4] > position.y &&
      by + b[1] < position.y + size.height &&
      bz + b[5] > position.z - size.half &&
      bz + b[2] < position.z + size.half
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 体の箱と重なる**マス**に、`match` を満たすブロックがあるか。
 *
 * **これは幾何だけで、何を探しているかは知らない**（述語は呼ぶ側が渡す）。
 * `collides()` と違って**ブロックの当たり箱ではなくマスそのもの**を見る ——
 * サボテンの箱は 1/16 細く、押し戻された体は `contactMin - half - EPS` で
 * **マスの中へ 0.0615 だけ入る**ので、これでちょうど「押し付けられている」だけが真になる。
 *
 * `collides()` と同じ EPS のぶん内側で見るので、**面がぴったり接しているだけ**
 * （隣のマスに立っている・サボテンの上に立っている）は偽。
 */
export function bodyTouches(
  world: World,
  position: Vector3,
  size: BodySize,
  match: (id: number) => boolean,
): boolean {
  const px0 = position.x - size.half + EPS;
  const px1 = position.x + size.half - EPS;
  const py0 = position.y + EPS;
  const py1 = position.y + size.height - EPS;
  const pz0 = position.z - size.half + EPS;
  const pz1 = position.z + size.half - EPS;

  for (let by = Math.floor(py0); by <= Math.floor(py1); by++) {
    for (let bz = Math.floor(pz0); bz <= Math.floor(pz1); bz++) {
      for (let bx = Math.floor(px0); bx <= Math.floor(px1); bx++) {
        if (match(world.getVoxel(bx, by, bz))) return true;
      }
    }
  }
  return false;
}

/**
 * 足元 `maxDrop` ブロック以内にある足場の上面。無ければ `-Infinity`。
 * **崖から落ちないモブ**に使う（「豚が全部穴に落ちた」は実際に起きる）。
 */
export function groundBelow(
  world: World,
  x: number,
  y: number,
  z: number,
  size: BodySize,
  maxDrop: number,
): number {
  for (let drop = 0; drop <= maxDrop; drop++) {
    // 高さ 0 の薄い板で足元だけを見る（体の高さぶん見ると天井を拾ってしまう）
    if (collides(world, x, y - drop - EPS * 4, z, { half: size.half, height: EPS * 8, step: 0 })) {
      return contactMax[1];
    }
  }
  return -Infinity;
}
