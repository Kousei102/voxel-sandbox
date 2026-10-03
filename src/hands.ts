/**
 * プレイヤーの**手でやること**の配線（右クリック・掘る・食べる・弓・捨てる）。
 * **`main.ts` から割った 2 本目の配線ファイル**で、ここも判断は持ちません ——
 * 何が起きるかは `use.ts` / `placing.ts` / `breaking.ts` / `durability.ts` / `bow.ts` /
 * `vitals.ts` の側にあり、ここは注文を受けて貼るだけです（`main.ts` と同じ作法）。
 *
 * **`main.ts` と同じく、テストは中身を import できません**（`view.ts` がトップレベルで
 * `WebGLRenderer` を作る）。見張りは `test/arena.ts` の `wiringSource()` が
 * `main.ts` とこのファイルを 1 本として読みます（`test/ui.test.ts` の一覧もそこを見る）。
 *
 * **器（`world` / `creative` / `hit` …）は `HandsHost` から毎回引くこと。** `world` は
 * 次元を移るたびに作り直されるので、コンストラクタで控えると前の世界を掘り続けます。
 */

import type { Vector3 } from "three";
import { AIR, END_PORTAL, END_PORTAL_FRAME, blockSound, type PlaceAim } from "./blocks";
import type { AudioEngine } from "./audio";
import { REACH } from "./constants";
import { type Beds, SLEEP_MONSTER_RADIUS, sleepDecision } from "./beds";
import { Drawing, FULL_DRAW_PITCH, SHOOT_HEIGHT } from "./bow";
import { tryBreak } from "./breaking";
import type { Chests } from "./chests";
import type { Crops } from "./crops";
import { type DayNight, WAKE_TIME, canSleep } from "./daynight";
import type { Dimensions } from "./dimensions";
import type { Drops } from "./drops";
import { breakMessage, wearForTill, wearForUse, wearSlot } from "./durability";
import { eyeMessage, fitEye } from "./endportal";
import type { Furnaces } from "./furnaces";
import type { Inventory } from "./inventory";
import { ARROW, BUCKET, CAKE_BITE_FOOD, MILK_BUCKET, NO_ITEM, emptyAfterEating, foodOf, itemName } from "./items";
import { Mining } from "./mining";
import type { Mob, MobContext, Mobs } from "./mobs";
import type { Panels } from "./panels";
import type { Player } from "./player";
import { tryBucket, tryIgnite, tryPlace, tryPlant, tryTill } from "./placing";
import { PLAYER_OWNER, type ProjectileKind, type Projectiles } from "./projectiles";
import { raycastVoxels, type RaycastHit } from "./raycast";
import { DigCadence, type Sfx } from "./sfx";
import { eyeShot } from "./stronghold";
import type { Hud } from "./ui";
import { decideUse } from "./use";
import { camera, crack } from "./view";
import { Eating, type Vitals } from "./vitals";
import type { World } from "./world";

/**
 * `main.ts` が渡すもの。**作り直される値（`world` / `creative` / `hit` / `worldSeed` /
 * `playing` / `panels`）は getter で渡すこと** —— 値で渡すと最初の 1 回に固まります。
 */
export interface HandsHost {
  readonly world: World;
  readonly creative: boolean;
  readonly playing: boolean;
  /** 狙っているブロック（毎フレーム `main.ts` の `frame()` が引き直す）。 */
  readonly hit: RaycastHit | null;
  /** ワールドの種。**`world.seed` ではない**（ネザーでは塩を混ぜたあとの値になる）。 */
  readonly worldSeed: number;
  /** 視線の向き（`frame()` が毎フレーム書き直す 1 本を共有する）。 */
  readonly lookDirection: Vector3;
  readonly inventory: Inventory;
  readonly hud: Hud;
  readonly audio: AudioEngine;
  readonly player: Player;
  readonly vitals: Vitals;
  readonly mobs: Mobs;
  readonly drops: Drops;
  readonly projectiles: Projectiles;
  readonly crops: Crops;
  readonly furnaces: Furnaces;
  readonly chests: Chests;
  readonly beds: Beds;
  readonly dims: Dimensions;
  readonly dayNight: DayNight;
  readonly panels: Panels;
  mobContext(): MobContext;
  /** セーブの印を立てる（`main.ts` の `saveDirty = true`）。 */
  markDirty(): void;
  /** メニューの時刻のつまみを今の時刻に合わせる（寝て朝になったとき）。 */
  syncTimeInput(): void;
}

export class Hands {
  /** 左ボタンを押しっぱなしで掘り進めている最中（サバイバル）。 */
  breaking = false;
  readonly mining = new Mining();
  readonly digCadence = new DigCadence();
  readonly eating = new Eating();
  /** 弓を引いている最中。**引きの長さも放つかどうかも `bow.ts`**（掘る・食べると同じ形）。 */
  readonly drawing = new Drawing();

  constructor(private readonly h: HandsHost) {}

  /**
   * 掘りかけ・食べかけ・引きかけを、まとめて無かったことにする。
   * **画面を開く・死ぬ・ポインタが外れる**の 3 経路が同じ形で止まる
   * （写すと、手ごたえのあるものを足したときに 1 つだけ止め忘れる）。
   */
  stopHands(): void {
    this.breaking = false;
    this.mining.reset();
    this.eating.stop();
    this.drawing.stop();
  }

  /**
   * 右クリック。**何が起きるかの振り分けは `use.ts` の `decideUse()`**（17 通りの
   * 並び順そのものが判断なので、ここに戻さないこと）。ここは注文を受けて貼るだけ。
   *
   * `m` は**手前に居るモブ**（居なければ null。どちらが手前かは `mobIsNearer()`）。
   */
  useOrPlace(m: { mob: Mob } | null): void {
    const { inventory, creative, mobs, vitals, hud, panels, furnaces, chests, world } = this.h;
    const held = inventory.selectedItem;
    const hasArrow = creative || inventory.has(ARROW);
    // 「刈れるか」「搾れるか」は `mobs.ts`、「手前か」は `controls.ts`。込みにするのは呼ぶ側の仕事。
    const shearable = m !== null && mobs.canShear(m.mob);
    const milkable = m !== null && mobs.canMilk(m.mob);
    const act = decideUse(this.h.hit, { held, creative, canEat: vitals.canEatFood(foodOf(held)), canEatCake: vitals.canEatFood(CAKE_BITE_FOOD), hasArrow, shearable, milkable });
    switch (act.kind) {
      case "flash": hud.flash(act.message); return;
      case "shear": if (m) this.shearMob(m.mob); return;
      case "milk": this.swapBucket(MILK_BUCKET, "splash", "ミルクを搾った"); return;
      case "drink": this.swapBucket(BUCKET, "eat", vitals.drinkMilk() ? "毒が消えた" : "ミルクを飲んだ"); return;
      case "craft": panels.openInventory(3); return;
      case "furnace": panels.openFurnace(furnaces.at(act.at.x, act.at.y, act.at.z)); return;
      case "chest": panels.openChest(chests.open(world, act.at.x, act.at.y, act.at.z)); return;
      case "bed": this.sleepOrSetSpawn(act.at.x, act.at.y, act.at.z, act.id); return;
      case "till": this.tillAt(act.at.x, act.at.y, act.at.z); return;
      case "plant": this.plantAt(act.at.x, act.at.y, act.at.z); return;
      case "fertilize": this.fertilizeAt(act.at.x, act.at.y, act.at.z); return;
      case "bucket": this.useBucket(act.item); return;
      case "fitEye": this.fitEndPortalEye(act.at.x, act.at.y, act.at.z); return;
      case "throwEye": this.throwEye(); return;
      case "throw": this.throwItem(act.projectile); return;
      case "ignite": this.igniteAt(act.aim); return;
      case "draw": this.drawing.begin(act.item); return;
      case "eat": this.eating.begin(act.item); return;
      case "eatCake": this.eatCakeAt(act.at.x, act.at.y, act.at.z); return;
      case "place": this.placeHeld(act.aim, act.base); return;
      default: return;
    }
  }

  /**
   * 投げたエンダーアイ。向きは `stronghold.ts` の `eyeShot()`。**種は `worldSeed`** ——
   * `world.seed` はネザーだと塩を混ぜたあとの値で、渡すと別の場所を指す。
   */
  private throwEye(): void {
    const shot = eyeShot(this.h.worldSeed, camera.position.x, camera.position.y, camera.position.z);
    if (shot) this.h.projectiles.fire(shot);
    else this.h.hud.flash("要塞の見当が付きません");
  }

  /**
   * 手のものを投げる（卵・雪玉）。**何が飛ぶかは `items.ts` の表、どう飛ぶかは
   * `projectiles.ts` の表**で、ここは目線の高さから飛ばして 1 個減らすだけ。
   * **`damage` を渡さない**（既定の 0。卵は当たっても何も起きない）。
   */
  private throwItem(kind: ProjectileKind): void {
    const { player } = this.h;
    const at = player.position;
    this.h.projectiles.launch(kind, at.x, at.y + SHOOT_HEIGHT, at.z, player.yaw, player.pitch, PLAYER_OWNER);
    if (!this.h.creative) this.h.inventory.consumeSelected(1);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * 手に持っているものに傷を付ける。**何回で尽きるかも文言も `durability.ts`**
   * （ここは渡された回数を貼るだけで、64 も 384 も知りません）。
   */
  wearHeld(uses: number): void {
    const worn = wearSlot(this.h.inventory.selectedSlot, uses);
    if (worn !== NO_ITEM) this.h.hud.flash(breakMessage(worn));
  }

  /**
   * 羊を刈る。**何が何個出るか・いつまた刈れるかは `mobs.ts` の表**（ここは貼るだけ）。
   * **刈れたときだけ**減らす（`mobs.shear()` の戻り値の中でだけ呼ぶ）—— 空振りで減ると、
   * 刈れない羊を撫でているうちにシアーズが尽きる。
   */
  private shearMob(mob: Mob): void {
    if (!this.h.mobs.shear(mob, this.h.mobContext())) return;
    this.wearHeld(wearForUse(this.h.inventory.selectedItem, this.h.creative));
    this.h.hud.refresh();
  }

  /**
   * 手のバケツの中身を入れ替える（搾る・飲む）。**クリエイティブでも入れ替える** ——
   * 中身そのものがアイテムなので、入れ替えないとミルクが手に入らない（`useBucket()` と同じ）。
   */
  private swapBucket(item: number, sound: Sfx, message: string): void {
    this.h.inventory.setSelected(item, 1);
    this.h.audio.play(sound);
    this.h.hud.flash(message);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** 火種で火を点ける。**どのマスに点くかも枠の判定も `placing.ts` / `portals.ts`。** */
  private igniteAt(aim: PlaceAim): void {
    const lit = tryIgnite(this.h.world, aim);
    if (lit.kind === "blocked") this.h.hud.flash(lit.message);
    if (lit.kind !== "placed") return;
    this.h.audio.play("place", "stone");
    // **点いたときだけ**火種が減る（早期 return より後ろ）。帯が減るので描き直す。
    this.wearHeld(wearForUse(this.h.inventory.selectedItem, this.h.creative));
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** クワで耕す。**どのマスが耕地になるかも上が塞がっているかも `placing.ts` の `tryTill()`。** */
  private tillAt(x: number, y: number, z: number): void {
    const tilling = tryTill(this.h.world, { x, y, z });
    if (tilling.kind === "blocked") this.h.hud.flash(tilling.message);
    if (tilling.kind !== "placed") return;
    this.h.audio.play("place", "dirt");
    // **耕したときだけ**クワが減る（早期 return より後ろ）。
    this.wearHeld(wearForTill(this.h.inventory.selectedItem, this.h.creative));
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** 種を植える。**可否も書き込みも `placing.ts` の `tryPlant()`。傷は付かない**（種は道具ではない）。 */
  private plantAt(x: number, y: number, z: number): void {
    const { crops } = this.h;
    const planted = tryPlant(this.h.world, { x, y, z });
    if (planted.kind === "blocked") this.h.hud.flash(planted.message);
    if (planted.kind !== "placed") return;
    this.h.audio.play("place", blockSound(planted.id));
    crops.plant(x, y + 1, z); // 育つのは苗の立ったマス（狙ったのは 1 つ下の耕地）
    if (!this.h.creative) this.h.inventory.consumeSelected(1);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** 骨粉をかける。**実るかどうかは `crops.ts` の `fertilize()`。** 実ったときだけ減る。 */
  private fertilizeAt(x: number, y: number, z: number): void {
    if (!this.h.crops.fertilize(x, y, z, this.h.world)) return;
    this.h.audio.play("place", "grass");
    if (!this.h.creative) this.h.inventory.consumeSelected(1);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** ケーキを 1 口かじる。**何口目で消えるかは `crops.ts` の `bite()`、戻る量は `items.ts`。** */
  private eatCakeAt(x: number, y: number, z: number): void {
    if (this.h.crops.bite(x, y, z, this.h.world) === "absent") return;
    this.h.vitals.eat(CAKE_BITE_FOOD);
    this.h.audio.play("eat");
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /** 手に持っているものを置く。**置けるかどうかと書き込みは `placing.ts`。** */
  private placeHeld(aim: PlaceAim, base: number): void {
    const { world, player, crops } = this.h;
    const placed = tryPlace(world, player, aim, player.yaw, base);
    if (placed.kind === "blocked") return this.h.hud.flash(placed.message);
    if (placed.kind !== "placed") return;
    this.h.audio.play("place", blockSound(placed.id));
    crops.notePlaced(placed.at, placed.id, world); // 置いたものを覚える（何が伸びるかは crops.ts）
    if (!this.h.creative) this.h.inventory.consumeSelected(1);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * 枠にエンダーアイを嵌める。**嵌まるか・揃ったら起動するか・何と出すかは
   * 全部 `endportal.ts`**（ここは減らして貼るだけ）。
   */
  private fitEndPortalEye(x: number, y: number, z: number): void {
    const fit = fitEye(this.h.world, x, y, z);
    const message = eyeMessage(fit);
    if (message) this.h.hud.flash(message);
    // **`already` ではアイを減らさない**（嵌まっている枠を叩いても損しない）。
    if (fit.kind !== "fitted") return;
    if (!this.h.creative) this.h.inventory.consumeSelected(1);
    this.h.audio.play("place", blockSound(fit.lit > 0 ? END_PORTAL : END_PORTAL_FRAME));
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * バケツで汲む／流す。**判断は `placing.ts` の `tryBucket()`。**
   *
   * **ここだけ光線を引き直す。** 普段の光線は液体を素通りするので
   * （溶岩湖の向こうを狙えるように）、そのままでは水面を狙えず汲めない。
   */
  private useBucket(held: number): void {
    const { world } = this.h;
    const target = raycastVoxels(world, camera.position, this.h.lookDirection, REACH, true);
    if (!target) return;

    const used = tryBucket(world, target, held, this.h.player.yaw);
    if (used.kind === "blocked") this.h.hud.flash(used.message);
    if (used.kind !== "used") return;

    // **クリエイティブでも中身は入れ替える**（`placing.ts` の `BucketOutcome`）。
    this.h.inventory.setSelected(used.item, 1);
    // 水の音を借りている（溶岩用の音はまだ無い）。
    this.h.audio.play("splash");
    this.h.hud.flash(used.message);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * ベッドを右クリックしたとき。**判断は `beds.ts` の `sleepDecision()` と
   * `daynight.ts` の `canSleep()`** にあるので、ここは事実を集めて結果を貼るだけ。
   *
   * リスポーン地点は**どの結果でも記録する**（寝られなかったからといって、
   * 地点だけ取り損なう理由が無い）。覚えるのは必ず**足側**のマス —— 枕側を覚えると、
   * 相方を辿らずに「ベッドがまだあるか」を見られなくなる。
   */
  private sleepOrSetSpawn(x: number, y: number, z: number, id: number): void {
    const { beds, dayNight, hud } = this.h;
    // **枕側を叩いても足側を覚える**（割り出すのは `beds.ts`）。どの次元で寝たかも
    // 一緒に（覚えないと、ネザーで死んだ人がオーバーワールドの列を読んで岩盤の上に湧く）。
    beds.setFrom(x, y, z, id, this.h.dims.current);
    this.h.markDirty();

    const result = sleepDecision(
      canSleep(dayNight.time),
      this.h.mobs.hostileNear(x + 0.5, y, z + 0.5, SLEEP_MONSTER_RADIUS),
    );
    if (result === "slept") {
      dayNight.setTime(WAKE_TIME);
      this.h.syncTimeInput();
      hud.flash("おはようございます");
      return;
    }
    hud.flash(
      result === "monsters"
        ? "近くにモンスターがいます。リスポーン地点にしました"
        : "ここをリスポーン地点にしました",
    );
  }

  /**
   * 掘り切ったときの処理。**何が落ちるか・器の中身をどうするか・相方のベッドは
   * `breaking.ts` の `tryBreak()`**（支えを失って壊れる経路と同じ規則を通すため）。
   * ここは音を鳴らして、返ってきた山を地面に置くだけ。
   */
  breakBlock(x: number, y: number, z: number, blockId: number, tool: number): void {
    const { furnaces, chests, creative } = this.h;
    const result = tryBreak(
      this.h.world,
      { furnaces, chests },
      { x, y, z, id: blockId, tool, creative, roll: Math.random(), extraRoll: Math.random() },
    );
    if (!result.broken) return;
    this.h.markDirty();
    this.h.audio.play("break", blockSound(blockId));
    this.digCadence.reset();
    for (const out of result.drops) this.h.drops.burst(out.item, out.count, out.x, out.y, out.z, out.damage);
    // 掘ると腹が減る。**どれだけ減るかは `vitals.ts`**（ここは種類を渡すだけ）。
    if (result.exhaust) this.h.vitals.exhaust("mine");
    // 道具に傷が付く。**いくつ付くか・壊れたかは `durability.ts`**（ここは戻り値を見るだけ）。
    this.wearHeld(result.wear);
    this.h.hud.refresh();
  }

  /**
   * プレイ中の `Q`。落としたものは地面に残るので拾い直せる（`drops.ts`）。
   * 目線の高さから投げる。猶予（拾い直さない時間）は `drops.ts` が決める。
   */
  discardSelected(bulk: boolean): void {
    const { player } = this.h;
    const thrown = this.h.inventory.discardSelected(bulk);
    if (!thrown) return;
    this.h.drops.throwOut(
      thrown.item,
      thrown.count,
      player.position.x,
      player.position.y + 1.2,
      player.position.z,
      player.yaw,
      player.pitch,
      thrown.damage,
    );
    this.h.hud.flash(`${itemName(thrown.item)} x${thrown.count} を落としました`);
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * 食べ進める。**掘るのとまったく同じ形**（押している間だけ進み、離すと消える）。
   *
   * この環境では食べる動きを描けないので、進んでいる手ごたえは咀嚼音だけ。
   * **鳴らす間隔は `sfx.ts` の `EatCadence`**、戻る量は `items.ts`、
   * 食べられるかは `vitals.ts` が持っていて、ここには数値を書かない。
   */
  updateEating(dt: number): void {
    const { inventory, vitals, hud } = this.h;
    const held = inventory.selectedItem;
    const food = foodOf(held);
    const step = this.eating.advance(dt, { playing: this.h.playing, held, canEat: vitals.canEatFood(food), isFood: food !== null });
    if (step === "chew") this.h.audio.play("eat");
    if (step !== "done" || !food) return;

    vitals.eat(food);
    inventory.consumeSelected(1);
    // 器つきの食べ物は空の器が手の中に戻る。**何が戻るかは `items.ts` の `EMPTIES`**。
    const empty = emptyAfterEating(held);
    if (empty !== NO_ITEM) inventory.setSelected(empty, 1);
    hud.flash(`${itemName(held)} を食べました`);
    hud.refresh();
    this.h.markDirty();
  }

  /** 弓を引き進める。**手ごたえは満引きの合図の音だけ**（引く動きは描けない。判断は `bow.ts`）。 */
  updateDrawing(dt: number): void {
    const { inventory } = this.h;
    const facts = { playing: this.h.playing, held: inventory.selectedItem, hasArrow: this.h.creative || inventory.has(ARROW) };
    if (this.drawing.advance(dt, facts) === "full") this.h.audio.play("bow", "none", FULL_DRAW_PITCH);
  }

  /** 弓を離した。**放つかどうかとダメージは `bow.ts`**（ここは矢を 1 本減らして飛ばすだけ）。 */
  loose(): void {
    const { inventory, player, creative } = this.h;
    const shot = this.drawing.release();
    if (!shot || (!creative && !inventory.consume(ARROW, 1))) return;
    const at = player.position;
    this.h.projectiles.launch("arrow", at.x, at.y + SHOOT_HEIGHT, at.z, player.yaw, player.pitch, PLAYER_OWNER, shot.damage);
    this.h.audio.play("bow");
    // **矢が飛んだときだけ**弓が減る（引きが足りない・矢が無いときは上で戻っている）。
    this.wearHeld(wearForUse(inventory.selectedItem, creative));
    this.h.hud.refresh();
    this.h.markDirty();
  }

  /**
   * 死んだら持ち物を全部その場に落とす。落とした山の数を返す。
   *
   * **どれを落とすかは `inventory.takeAll()`**（不変条件は「落とした合計 = 元の総数」）で、
   * ここは落とす場所を決めるだけ。**リスポーンより前に呼ぶこと。**
   *
   * **奈落で死んだぶんは消えます**（Minecraft と同じ。ユーザーと決めた線）——
   * `drops.ts` が `y < VOID_Y` の山を寿命を待たずに捨てるので、ここに例外は書きません。
   * かまど・チェストの中身と違い、**5 分（`DESPAWN_AGE`）で消えます。**
   */
  dropOnDeath(): number {
    const { player } = this.h;
    const lost = this.h.inventory.takeAll();
    for (const stack of lost) {
      // 死体の位置から少し上に散らす（足元に埋まると拾いにくい）
      this.h.drops.burst(stack.item, stack.count, player.position.x, player.position.y + 0.6, player.position.z, stack.damage);
    }
    if (lost.length > 0) this.h.hud.refresh();
    return lost.length;
  }

  /** 掘り進める。ひび割れの表示もここでまとめて更新する。 */
  updateMining(dt: number): void {
    const { hit } = this.h;
    if (!this.h.playing || !this.breaking || !hit) {
      this.mining.reset();
      this.digCadence.reset();
      crack.setStage(-1);
      return;
    }

    const tool = this.h.inventory.selectedItem;
    const { x, y, z } = hit.block;
    const blockId = hit.id;
    // 狙いを変えると進み具合は 0 に戻るので、増えたぶんだけを渡す
    const before = this.mining.progress;
    if (this.mining.update(dt, hit.block, blockId, tool)) {
      this.breakBlock(x, y, z, blockId, tool);
    } else if (this.digCadence.advance(Math.max(0, this.mining.progress - before))) {
      // 掘っている間のコツコツ音。進み具合で刻むので、硬いブロックほど間隔が空く
      this.h.audio.play("dig", blockSound(blockId));
    }

    const target = this.mining.target;
    // **`this.h.hit` を引き直すこと**（掘り切ると `breakBlock()` の中で狙いが変わりうる）。
    if (target) crack.setStage(this.mining.stage, target.x, target.y, target.z, this.h.hit?.id ?? AIR);
    else crack.setStage(-1);
  }
}
