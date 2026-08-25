import {
  BoxGeometry,
  EdgesGeometry,
  Fog,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  AIR,
  CHEST,
  CRAFTING_TABLE,
  FURNACE,
  FURNACE_LIT,
  PALETTE,
  baseBlock,
  blockName,
  blockSound,
  bedPartner,
  isBed,
  isBedHead,
  shapeBounds,
} from "./blocks";
import { AudioEngine } from "./audio";
import { biomeName } from "./biomes";
import {
  AUTOSAVE_INTERVAL,
  CHUNK_SIZE,
  REACH,
  RENDER_DISTANCE,
  columnOf,
} from "./constants";
import {
  Beds,
  SLEEP_MONSTER_RADIUS,
  clearBedPartner,
  sleepDecision,
} from "./beds";
import { Chests } from "./chests";
import { CrackOverlay } from "./crack";
import { CraftScreen } from "./craftscreen";
import { DayNight, WAKE_TIME, canSleep, environmentFor } from "./daynight";
import { Dimensions, emptyState, type DimensionState } from "./dimensions";
import { Drops, type DropContext } from "./drops";
import { DropRenderer } from "./droprender";
import { Furnaces } from "./furnaces";
import { Inventory, bulkDiscard } from "./inventory";
import { InventoryScreen } from "./inventoryui";
import {
  NO_ITEM,
  foodOf,
  isBucket,
  isFireStarter,
  itemName,
  placedBlock,
  rollDrop,
} from "./items";
import { debugMob, nextShot } from "./debugspawn";
import { debugText } from "./debugtext";
import { Mining, canHarvest } from "./mining";
import { MobRenderer } from "./mobrender";
import { Mobs, type MobContext } from "./mobs";
import { Player } from "./player";
import { tryBucket, tryIgnite, tryPlace } from "./placing";
import { portalAxis, type PortalAxis } from "./portals";
import {
  PortalGate,
  arrive,
  linkScale,
  linkedSpot,
  portalTarget,
} from "./portaltravel";
import { PROJECTILE_KINDS, Projectiles } from "./projectiles";
import { ProjectileRenderer } from "./projectilerender";
import { raycastVoxels, type RaycastHit } from "./raycast";
import { DigCadence, Footsteps, clampVolume } from "./sfx";
import { Sky } from "./sky";
import { buildSave, collectState, restoredValues, savedShape } from "./session";
import { clearSave, countEdits, deserializeEdits, load, save, type SaveData } from "./storage";
import { Hud } from "./ui";
import { Eating, VOID_Y, Vitals, deathMessage } from "./vitals";
import { World } from "./world";
import { WorldGen } from "./worldgen";
import { hashSeed } from "./noise";

const FOG_COLOR = 0x9ec8e8;
/** 新しいワールドを始める時刻（朝）。 */
const NEW_WORLD_TIME = 0.05;
const SPAWN_X = 0.5;
const SPAWN_Z = 0.5;
/** かまどの画面を描き直す間隔 (秒)。数字が動くだけなので、これで十分。 */
const FURNACE_UI_INTERVAL = 0.25;

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new Scene();
const fog = new Fog(FOG_COLOR, RENDER_DISTANCE * CHUNK_SIZE * 0.55, RENDER_DISTANCE * CHUNK_SIZE * 0.98);
scene.fog = fog;

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 2400);

const sky = new Sky(FOG_COLOR);
scene.add(sky.object);
const dayNight = new DayNight();

const highlight = new LineSegments(
  new EdgesGeometry(new BoxGeometry(1.002, 1.002, 1.002)),
  new LineBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: 0.55, fog: false }),
);
highlight.visible = false;
scene.add(highlight);

const crack = new CrackOverlay();
scene.add(crack.mesh);

const inventory = new Inventory();
const hud = new Hud(inventory);
// 判断は craft、描画とマウスの配線は screen。
// **画面が出ている間の状態変更は screen 経由**（craft を直接触ってよいのはセーブと読み込みだけ）。
const craft = new CraftScreen(inventory);
const screen = new InventoryScreen(craft);
const mining = new Mining();
const vitals = new Vitals();
const player = new Player(camera);

// 音。鳴らすかどうかの判断は sfx.ts、実際に鳴らすのは audio.ts。
// ここは「起きたこと」を渡すだけにして、条件を書かない。
const audio = new AudioEngine();
const footsteps = new Footsteps();
const digCadence = new DigCadence();
const eating = new Eating();
/**
 * 空腹の消耗と足音に使う、前のフレームの位置。
 * **飛ばしたら（リスポーン・ワールド作り直し）必ず `resetFootprint()` を呼ぶこと** ——
 * 呼ばないと数百 m 歩いたことになって、着いた瞬間に腹が減る。
 */
let lastFootX = 0;
let lastFootZ = 0;

const deathScreen = document.getElementById("death") as HTMLElement;
const deathCause = document.getElementById("deathcause") as HTMLElement;

let world!: World;
/**
 * オーバーワールドの生成器。**`World` は生成器を外から渡してもらう形**になったので
 * （`ChunkSource`）、作るのはこちらの仕事。
 *
 * `world` とは別に持っているのは、**バイオームがオーバーワールドにしか無い話**だから
 * （F3 の表示で使う）。`ChunkSource` に `biomeAt` を足すと、ネザーの生成器にも
 * 意味の無い実装を書くことになる。
 */
let overworld!: WorldGen;
/**
 * ワールドの種。**`world.seed` を使わないこと** —— あちらは生成器の種なので、
 * ネザーに居るあいだは混ぜたあとの値になっていて、そのまま保存すると
 * **次に開いたとき別の世界になる。**
 */
let worldSeed = 0;
/**
 * モブ。**`mobRender` は `world` と一緒に作り直す**（昼夜の uniform は `World` が
 * 持っていて、ワールドを作り直すと別のオブジェクトになるため）。
 */
const mobs = new Mobs();
let mobRender!: MobRenderer;
/**
 * 落ちたアイテム。**モブと違って保存する**（`storage.ts` の `drops`）。
 * `dropRender` は `mobRender` と同じ理由で `world` と一緒に作り直す。
 */
const drops = new Drops();
let dropRender!: DropRenderer;
/**
 * 飛んでいるもの（火球・矢・エンダーアイ・ブレス）。**落とし物と違って保存しない**
 * （読み込んだ瞬間に矢が刺さり直すより、消えているほうが安全側）。
 * `projectileRender` は `dropRender` と同じ理由で `world` と一緒に作り直す。
 */
const projectiles = new Projectiles();
let projectileRender!: ProjectileRenderer;
/** `N` で出す飛び道具の順番（4 種類を順ぐりに出すためだけの目印）。 */
let debugShot = -1;
/**
 * 置いてあるかまど。**「位置ごとに状態を持つブロック」の初めての例。**
 * モブや落とし物と違って `world` の外にあるので、ワールドを作り直しても
 * 明示的に空にすること（`startWorld`）。
 */
const furnaces = new Furnaces();
/**
 * 置いてあるチェスト。かまどと同じ器だが、**毎フレーム進めるものが無い**ので
 * `update(dt)` は持たない（`furnaces.update()` に相当する呼び出しが要らない）。
 */
const chests = new Chests();
/**
 * リスポーン地点。**「位置ごとに状態を持つブロック」ではなく、地点 1 つだけ**を持つ
 * （ベッドそのものは `edits` に入っている）。かまど・チェストと同じで `world` の外なので、
 * ワールドを作り直したら明示的に空にすること（`startWorld`）。
 */
const beds = new Beds();
/**
 * 次元。**いま居ない次元の持ち物（`edits` / 落とし物 / かまど / チェスト）を預かる器**で、
 * 判断は全部 `dimensions.ts` にある（ここは値を集めて貼るだけ）。
 *
 * いま登録されているのはオーバーワールドだけなので、**保存の形は今までと変わらない**
 * （`dim` も `dims` も出ない）。ポータルで移る配線は行き先ができてから。
 */
const dims = new Dimensions();
let playing = false;
/**
 * 一度でもプレイに入ったか。**タイトル画面の見回し（`frame()`）を止める合図**で、
 * これだけのために持っている（セーブしない。読み込み直しでタイトルに戻るのは正しい）。
 */
let everPlayed = false;
let saveDirty = false;
let autosaveTimer = 0;
let hit: RaycastHit | null = null;
let underwater = false;
let breaking = false;
let furnaceUiTimer = 0;
/** クリエイティブでは即掘れて、置いてもアイテムが減らない。 */
let creative = false;

const seedInput = document.getElementById("seed") as HTMLInputElement;
const modeButton = document.getElementById("mode") as HTMLButtonElement;

screen.onChange = () => {
  hud.refresh();
  saveDirty = true;
};

screen.onCraft = () => audio.play("craft");

// インベントリ画面で捨てたぶんは足元に落ちる（拾い直せる）。
screen.onDiscard = (item, count) => {
  drops.throwOut(item, count, player.position.x, player.position.y + 1.2, player.position.z, player.yaw, player.pitch);
  hud.flash(`${itemName(item)} x${count} を落としました`);
  saveDirty = true;
};

/**
 * 倒したモブのドロップ。**倒れた場所に落とす。**
 * `Mobs` はプレイヤーが倒したときにしかここを呼ばない
 * （遠くで焼け死んだモブの肉が湧いてはいけない）。
 */
mobs.onDrop = (item, count, x, y, z) => {
  drops.burst(item, count, x, y + 0.3, z);
  saveDirty = true;
};

/** 拾った音。**何をいつ鳴らすかは `drops.ts` が決めている**ので、ここは素通し。 */
drops.onSound = (sfx) => audio.play(sfx);

furnaces.onChange = () => {
  saveDirty = true;
};

chests.onChange = () => {
  saveDirty = true;
};

beds.onChange = () => {
  saveDirty = true;
};

drops.onChange = () => {
  hud.refresh();
  saveDirty = true;
};

/** モブの声。**何をいつ鳴らすかは `mobs.ts` が決めている**ので、ここは素通し。 */
mobs.onSound = (sfx, pitch) => audio.play(sfx, "none", pitch);

function setCreative(on: boolean): void {
  creative = on;
  modeButton.textContent = creative ? "クリエイティブ" : "サバイバル";
  if (creative) inventory.fillEmptyHotbar(PALETTE);
  hud.refresh();
}

/**
 * 世界を作り直す。**次元を移るときもここを通る**（`travelThrough`）ので、
 * 受け取るのは `DimensionState` 丸ごと —— 改変・落とし物・かまど・チェストを
 * **1 か所で入れ替える**（写すと、片方だけ直したときに「戻ったらかまどの中身だけ
 * 消えている」形で静かに壊れる。`rules/dimensions.md`）。
 *
 * **リスポーン地点はここで消さない。** 次元ごとに持たないものなので、
 * 消すのは「別のワールドを始める」2 か所（作り直し・保存データの削除）の仕事。
 */
function startWorld(
  seed: number,
  state: DimensionState = emptyState(),
  spawn?: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean },
  dimension = dims.current,
): void {
  world?.dispose();
  worldSeed = seed;
  // **バイオーム表示用のオーバーワールドの生成器**（F3）。ネザーに居るあいだも
  // 持っておく（`ChunkSource` はバイオームを知らない）。オーバーワールドに居るときは
  // `sourceFor` のキャッシュ越しに世界の生成器と同じものになる。
  overworld = dims.overworldGen(seed);
  world = new World(scene, dims.sourceFor(dimension, seed) ?? overworld, deserializeEdits(state.edits));
  seedInput.value = String(seed);

  // モブは保存しない（地形と同じで、シードから作り直せるものは持たない）。
  mobs.clear();
  mobRender?.dispose();
  mobRender = new MobRenderer(scene, world.daylightUniform());

  // かまど・チェスト・落ちたアイテムは次元ごとに持つ。**入れ替えはここだけ。**
  furnaces.deserialize(state.furnaces);
  chests.deserialize(state.chests);
  drops.deserialize(state.drops);
  dropRender?.dispose();
  dropRender = new DropRenderer(scene, world.daylightUniform());
  // 飛んでいるものは保存しないので、ここで空にするだけでよい。
  projectiles.clear();
  projectileRender?.dispose();
  projectileRender = new ProjectileRenderer(scene, world.daylightUniform());

  // 支えを失って勝手に壊れたぶんを地面へ。**壊した本人が居なくても落ちる**ので、
  // クリエイティブかどうかはここで見る（判断を `world.ts` に持ち込まない）。
  world.onAutoBreak = (x, y, z, id) => {
    // **ベッドの相方はクリエイティブでも消すこと**（下の early return より前）。
    // 床を掘られた半分だけが消えると、相方の居ないベッドが残る。
    // 相方のぶんは落とさない —— 出るベッドは 1 台につき 1 個。
    clearBedPartner(world, x, y, z, id);
    if (creative) return;
    const drop = rollDrop(id, Math.random());
    if (drop.item === NO_ITEM || drop.count <= 0) return;
    drops.burst(drop.item, drop.count, x + 0.5, y + 0.25, z + 0.5);
  };

  const x = spawn?.x ?? SPAWN_X;
  const z = spawn?.z ?? SPAWN_Z;
  world.primeAround(x, z, 1);

  player.position.set(x, spawn?.y ?? world.surfaceY(Math.floor(x), Math.floor(z)) + 0.2, z);
  player.velocity.set(0, 0, 0);
  player.yaw = spawn?.yaw ?? 0;
  player.pitch = spawn?.pitch ?? -0.15;
  player.flying = spawn?.flying ?? false;
  player.clearKeys();
  player.syncCamera();
  resetFootprint();
  world.update(player.position.x, player.position.z);
  // モブは保存しないので、読み込み直後は必ず 0 体。まとめて湧かせて、
  // 最初の 1 分が空っぽにならないようにする（届く範囲だけなので数は控えめ）。
  mobs.populate(world, mobContext());
}

/**
 * モブに渡す周りの状況。判断は全部 `mobs.ts` 側なので、ここは値を集めるだけ。
 *
 * `vitals` をそのまま渡すので、**ダメージの死因（「モンスター」）も無敵時間も
 * `mobs.ts` が決める。** ここに `damage()` の呼び出しを書くと、戦闘の判断が
 * DOM 込みでしか確かめられないファイルへ移ってしまう。
 */
function mobContext(): MobContext {
  return {
    playerX: player.position.x,
    playerY: player.position.y,
    playerZ: player.position.z,
    brightness: dayNight.brightness,
    playerVelocity: player.velocity,
    invulnerable: creative,
    vitals,
  };
}

/** 落ちたアイテムに渡す周りの状況。判断は全部 `drops.ts` 側なので、値を集めるだけ。 */
function dropContext(): DropContext {
  return {
    playerX: player.position.x,
    playerY: player.position.y,
    playerZ: player.position.z,
    inventory,
  };
}

/**
 * 点火中かどうかをワールドのブロック ID に反映する。
 *
 * **`setVoxel` が成功したときだけ「合った」ことにする。** 未読み込みの列では
 * 書き込みが黙って失敗するので、`furnaces.ts` 側が持ち越して次のフレームでまた試す
 * （そうしないと「火が消えているのに光ったままのかまど」が残る）。
 */
function syncFurnaceBlocks(): void {
  furnaces.syncLit((x, y, z, lit) => {
    // 列がまだ無いなら確かめようがない。**ここで true を返さないこと**
    // （`getVoxel` が AIR を返すので「かまどが無くなった」と誤読する）。
    if (!world.hasColumn(columnOf(x), columnOf(z))) return false;
    const current = world.getVoxel(x, y, z);
    // もうかまどが無い（掘られた・上書きされた）なら、合わせるものが無い。
    if (baseBlock(current) !== FURNACE) return true;
    const want = lit ? FURNACE_LIT : FURNACE;
    if (current === want) return true;
    return world.setVoxel(x, y, z, want);
  });
}

/**
 * かまどを開いている間だけ、焼き上がりと燃料の残りを描き直す。
 * **毎フレームは要らない**（動くのは数字と矢印の色だけ）。
 */
function refreshFurnaceUi(dt: number): void {
  if (!screen.isOpen || !craft.furnace) {
    furnaceUiTimer = 0;
    return;
  }
  furnaceUiTimer += dt;
  if (furnaceUiTimer < FURNACE_UI_INTERVAL) return;
  furnaceUiTimer = 0;
  screen.refresh();
}

/**
 * ポータルに立っていたら向こうへ。**待つ時間も掛け金も `portaltravel.ts` の
 * `PortalGate`** で、ここは「いま面の中に居るか」を渡すだけ。
 */
const portalGate = new PortalGate();

function updatePortal(dt: number): void {
  const axis = portalAxis(
    world.getVoxel(
      Math.floor(player.position.x),
      Math.floor(player.position.y + 0.5),
      Math.floor(player.position.z),
    ),
  );
  // **`step()` は 1 フレームに 1 回だけ**（2 回呼ぶと dt を二重に数える）。
  // true が返るのは面の中に居るときだけなので、`axis` は必ずある。
  if (portalGate.step(dt, axis) && axis) travelThrough(axis);
}

/**
 * 次元を移る。**位置を飛ばすので、`portaltravel.ts` が決めた「立てる場所」以外へ
 * 出さないこと。** ここは値を集めて貼るだけ。
 *
 * **`switchTo()` に `liveState()` を渡すのが肝心**（渡し忘れると、戻ったときに
 * こちら側の改変・落とし物・かまど・チェストが消える。`rules/dimensions.md`）。
 */
function travelThrough(axis: PortalAxis): void {
  const from = dims.current;
  const to = portalTarget(from);
  const spot = linkedSpot(player.position.x, player.position.z, linkScale(from, to));
  const state = dims.switchTo(to, liveState());
  if (!state) return;

  // 世界ごと入れ替える（改変・落とし物・かまど・チェストは `startWorld()` が
  // 次元のぶんに差し替える）。**リスポーン地点はそのまま**（次元ごとに持たない）。
  const yHint = Math.floor(player.position.y);
  const { yaw, pitch, flying } = player;
  const spawn = { x: spot.x + 0.5, y: yHint, z: spot.z + 0.5, yaw, pitch, flying };
  startWorld(worldSeed, state, spawn, to);

  // **枠を探す前にボクセルを用意すること。** 未読み込みの列では `getVoxel` が
  // AIR を返すので、行きに作った枠を見落として毎回建て直すことになる
  // （`moveToSpawn()` が `primeAround()` を先に呼ぶのと同じ罠）。
  world.primeAround(spot.x, spot.z, 1);
  const landing = arrive(world, spot.x, spot.z, yHint, axis);
  player.position.set(landing.x, landing.y, landing.z);
  player.velocity.set(0, 0, 0);
  player.syncCamera();
  // 飛んだ距離を歩いたことにしない（`rules/vitals.md`）。
  resetFootprint();
  // 出た先は枠の中。**いったん出るまで戻らない。**
  portalGate.latch();
  world.update(player.position.x, player.position.z);
  hud.flash(`${dims.nameOf(to)}へ`);
  saveDirty = true;
}

/** 飛んだ距離を歩いたことにしないための控え直し。**位置を飛ばしたら必ず呼ぶ。** */
function resetFootprint(): void {
  lastFootX = player.position.x;
  lastFootZ = player.position.z;
  footsteps.reset();
}

/**
 * リスポーン地点へ戻す。**寝たベッドがあればそこ、無ければワールドの初期位置。**
 *
 * **列を読み込んでから `spawnPosition()` を呼ぶこと。** 未読み込みの列では
 * `getVoxel` が AIR を返すので、生きているベッドを「壊されている」と誤読して
 * 遠くの初期位置に飛ばしてしまう（`syncFurnaceBlocks()` と同じ罠）。
 *
 * 使えるかどうかの判断（ベッドがまだあるか・頭上が空いているか）は `beds.ts`。
 * ここは列を用意して、返ってきた位置を貼るだけ。
 */
function moveToSpawn(): void {
  const bed = beds.spawnPoint;
  if (bed) {
    world.primeAround(bed.x, bed.z, 1);
    const at = beds.spawnPosition(world);
    if (at) {
      placeAtSpawn(at.x, at.y, at.z);
      return;
    }
    hud.flash("ベッドが見つかりません。初期位置に戻ります");
  }
  world.primeAround(SPAWN_X, SPAWN_Z, 1);
  placeAtSpawn(
    SPAWN_X,
    world.surfaceY(Math.floor(SPAWN_X), Math.floor(SPAWN_Z)) + 0.2,
    SPAWN_Z,
  );
}

/** 位置を飛ばす。**`resetFootprint()` を必ず通す**（飛んだ距離を歩いたことにしない）。 */
function placeAtSpawn(x: number, y: number, z: number): void {
  player.position.set(x, y, z);
  player.velocity.set(0, 0, 0);
  player.clearKeys();
  player.syncCamera();
  resetFootprint();
}

/** いま居る次元の「位置ごとの持ち物」。組み立ては `session.ts`（判断はあちら）。 */
function liveState(): DimensionState {
  return collectState({ world, drops, furnaces, chests });
}

function currentSave(): SaveData {
  // **いま居る次元のぶんを預けてから書き出す**（`forSave` が中で預かる）。
  return buildSave({
    seed: worldSeed,
    player,
    time: dayNight.time,
    creative,
    health: vitals.health,
    hunger: vitals.hunger,
    inventory: inventory.serialize(),
    craft: craft.serialize(),
    volume: audio.getVolume(),
    bed: beds.serialize(),
    shape: dims.forSave(liveState()),
  });
}

function saveNow(message = "保存しました"): void {
  if (save(currentSave())) {
    saveDirty = false;
    hud.flash(message);
  } else {
    hud.flash("保存に失敗しました");
  }
}

// --- 起動 ---------------------------------------------------------------

const saved = load();
// **読んだ値をどこまで信じるかは `session.ts`**（`null` は「セーブに無い」）。
const restored = restoredValues(saved);
if (restored.time !== null) dayNight.setTime(restored.time);
inventory.deserialize(saved?.inventory);
// **必ずインベントリを入れたあとで。** 盤面と掴んでいた山は「預かり物」なので、
// 読んだらそのままインベントリへ返す（開いたままタブを閉じてもアイテムが消えない）。
// 返しきれなかったぶんは盤面に残り、次に空きができたときにまた返る。
craft.deserialize(saved?.craft);
craft.returnAll();
// 返したぶんを書き戻す（次の保存で craft のキーごと消える）。
if (saved?.craft) saveDirty = true;
audio.setVolume(clampVolume(saved?.volume));
setCreative(saved?.creative ?? false);
if (restored.health !== null) vitals.health = restored.health;
if (restored.hunger !== null) vitals.hunger = restored.hunger;
// **次元ごとに振り分けてから世界を作る**（振り分け方は `session.ts` の `savedShape()`）。
// 返ってくるのは**いま居る次元**の持ち物（知らない次元ならオーバーワールドに落ちる）。
const here = dims.fromSave(savedShape(saved));
startWorld(saved?.seed ?? (Math.random() * 0xffffffff) >>> 0, here, saved?.player);
beds.deserialize(saved?.bed);

// --- 入力 ---------------------------------------------------------------

function requestLock(): void {
  // 自動再生の制限があるので、AudioContext はここ（ユーザー操作の中）で起こす
  audio.resume();
  // ブラウザによっては Promise を返し、拒否されることがある
  Promise.resolve(canvas.requestPointerLock()).catch(() =>
    hud.flash("ポインタのロックに失敗しました。もう一度クリックしてください"),
  );
}

document.getElementById("play")?.addEventListener("click", requestLock);
document.getElementById("save")?.addEventListener("click", () => saveNow());
document.getElementById("wipe")?.addEventListener("click", () => {
  clearSave();
  inventory.clear();
  craft.discardAll();
  // 地面に落ちているぶんとかまどの中身も消す
  // （残すと、消したはずの持ち物が拾い直せてしまう）。
  drops.clear();
  furnaces.clear();
  chests.clear();
  beds.clear();
  // 他の次元に預けてあるぶんも捨てる（残すと、消したはずの持ち物が
  // 移った先にそのまま置いてある）。
  dims.reset();
  hud.refresh();
  saveDirty = false;
  hud.flash("保存データを削除しました");
});
document.getElementById("regen")?.addEventListener("click", () => {
  const text = seedInput.value.trim();
  const seed = /^\d+$/.test(text) ? Number(text) >>> 0 : hashSeed(text || String(Date.now()));
  dayNight.setTime(NEW_WORLD_TIME);
  vitals.respawn();
  deathScreen.classList.add("hidden");
  // **別のワールドを始めるので、預かっているぶんを全部忘れる。**
  // 忘れないと、前のワールドで別の次元に置いてきたものが新しいワールドに出てくる。
  // リスポーン地点も消す（`startWorld()` は次元を移るときも通るので、あちらでは消さない）。
  dims.reset();
  beds.clear();
  startWorld(seed);
  saveNow(`シード ${seed} で作り直しました`);
});

// メニューの時刻スライダー。1 周 20 分なので、動かして確かめられるようにしておく。
const timeInput = document.getElementById("time") as HTMLInputElement;
const timeLabel = document.getElementById("timelabel") as HTMLElement;

function syncTimeInput(): void {
  timeInput.value = String(Math.round(dayNight.time * 1440));
  timeLabel.textContent = dayNight.clock();
}

timeInput.addEventListener("input", () => {
  dayNight.setTime(Number(timeInput.value) / 1440);
  timeLabel.textContent = dayNight.clock();
  saveDirty = true;
});
syncTimeInput();

// 音量。0 で無音にできるようにしておく（音は好みが分かれるので、必ず切れること）。
const volumeInput = document.getElementById("volume") as HTMLInputElement;
const volumeLabel = document.getElementById("volumelabel") as HTMLElement;

function syncVolumeInput(): void {
  volumeInput.value = String(Math.round(audio.getVolume() * 100));
  volumeLabel.textContent = `${Math.round(audio.getVolume() * 100)}%`;
}

volumeInput.addEventListener("input", () => {
  audio.setVolume(Number(volumeInput.value) / 100);
  volumeLabel.textContent = `${Math.round(audio.getVolume() * 100)}%`;
  saveDirty = true;
});
volumeInput.addEventListener("change", () => {
  // つまみを離したところで 1 回鳴らして、いまの音量が分かるようにする
  audio.resume();
  audio.play("place", "wood");
});
syncVolumeInput();

modeButton.addEventListener("click", () => {
  setCreative(!creative);
  saveDirty = true;
  hud.flash(creative ? "クリエイティブ: 即掘り・E で全アイテム" : "サバイバル: 掘って集めます");
});

document.getElementById("respawn")?.addEventListener("click", () => {
  vitals.respawn();
  moveToSpawn();
  deathScreen.classList.add("hidden");
  saveDirty = true;
  requestLock();
});

document.addEventListener("pointerlockchange", () => {
  playing = document.pointerLockElement === canvas;
  // ここから先はタイトル画面ではない（見回しを二度と始めない）。
  if (playing) everPlayed = true;
  // インベントリや死亡画面でロックが外れたときは、メインメニューを出さない
  hud.setPlaying(playing, !playing && !screen.isOpen && !vitals.dead);
  if (!playing) {
    player.clearKeys();
    breaking = false;
    mining.reset();
    eating.stop();
    syncTimeInput();
    if (saveDirty) saveNow();
  }
});

/**
 * 画面を 1 つ開く。**開ける前に手を止めるのは 4 つとも同じ**なので、ここに集める
 * （写すと、画面を足したときに掘りかけ・食べかけが残る形で 1 つだけ抜ける）。
 */
function openPanel(show: () => void): void {
  if (screen.isOpen) return;
  breaking = false;
  mining.reset();
  eating.stop();
  show();
  hud.setPlaying(false, false);
  document.exitPointerLock();
}

/** インベントリ（または作業台）を開く。ポインタロックは外れる。 */
function openInventory(size: 2 | 3): void {
  openPanel(() => screen.show(size));
}

/**
 * クリエイティブの一覧を開く（`E`）。**器が要らない**のが他の 3 つとの違いで、
 * 並ぶものも押したときの規則も `craftscreen.ts` が持っている。
 * **作業台はクリエイティブでも今までどおり 3x3 のクラフト画面**（`openInventory(3)`）。
 */
function openCreativeInventory(): void {
  openPanel(() => screen.showCreative());
}

/**
 * かまどを開く。中身は `furnaces.ts` が位置ごとに持っていて、画面はそれを借りるだけ。
 * **閉じても中身は返さない**（ワールドに置いてあるもの。`craftscreen.ts` の `close()`）。
 */
function openFurnace(x: number, y: number, z: number): void {
  openPanel(() => screen.showFurnace(furnaces.at(x, y, z)));
}

/**
 * チェストを開く。かまどと同じで、中身は `chests.ts` が位置ごとに持っていて、
 * 画面はそれを借りるだけ。**閉じても中身は返さない**（ワールドの持ち物）。
 */
function openChest(x: number, y: number, z: number): void {
  openPanel(() => screen.showChest(chests.at(x, y, z)));
}

function closeInventory(): void {
  if (!screen.isOpen) return;
  screen.hide();
  hud.refresh();
  requestLock();
}

document.addEventListener("mousemove", (event) => {
  if (playing) player.look(event.movementX, event.movementY);
});

// ポインタロック中のイベントはロック対象に飛ぶが、受け口は document に置いておく
document.addEventListener("contextmenu", (event) => {
  if (playing) event.preventDefault();
});

document.addEventListener("mousedown", (event) => {
  // **`hit` が無くても降りないこと。** 何も無い所の向こうにモブが居る場合がある。
  if (!playing) return;
  event.preventDefault();

  if (event.button === 0) {
    // モブとブロックのどちらが手前かで決める。距離は `hit.point` から取る
    // （`RaycastHit` に距離のフィールドを足さない）。
    const target = mobs.pick(camera.position, lookDirection, REACH);
    const blockDistance = hit ? hit.point.distanceTo(camera.position) : Infinity;
    if (target && target.distance < blockDistance) {
      mobs.attack(target.mob, inventory.selectedItem, mobContext());
      // 殴ると腹が減る。**どれだけ減るかは `vitals.ts`** が持っている。
      if (!creative) vitals.exhaust("attack");
      // 殴っている間は掘らない（ひび割れが出ると、何を壊しているのか分からない）
      breaking = false;
      mining.reset();
      eating.stop();
    } else if (hit) {
      // クリエイティブは 1 クリック 1 個。サバイバルは押しっぱなしで掘り進める。
      if (creative) breakBlock(hit.block.x, hit.block.y, hit.block.z, hit.id, NO_ITEM);
      else breaking = true;
    }
  } else if (event.button === 1) {
    if (!hit) return;
    // スポイト: クリエイティブなら手元に湧かせ、サバイバルは持っていれば選ぶ。
    // 壁掛けの松明のような別置き版は、大元のアイテムに読み替える。
    const picked = baseBlock(hit.id);
    if (creative) inventory.setSelected(picked);
    else if (!inventory.selectItem(picked)) hud.flash(`${blockName(picked)} を持っていません`);
    hud.refresh();
  } else if (event.button === 2) {
    useOrPlace();
  }
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    breaking = false;
    mining.reset();
  } else if (event.button === 2) {
    // 離したら食べかけは無かったことに（アイテムは減らさない）
    eating.stop();
  }
});

/**
 * 選択枠を、狙っているブロックの形に合わせる。ハーフブロックを狙って
 * 立方体の枠が出ると、どちらの半分を狙っているのか分からなくなる。
 */
function fitHighlight(target: RaycastHit): void {
  shapeBounds(target.id, bounds);
  highlight.scale.set(bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]);
  highlight.position.set(
    target.block.x + (bounds[0] + bounds[3]) / 2,
    target.block.y + (bounds[1] + bounds[4]) / 2,
    target.block.z + (bounds[2] + bounds[5]) / 2,
  );
}

/** 形を囲む箱の控え。毎フレーム使うので配列は使い回す。 */
const bounds = [0, 0, 0, 1, 1, 1];

/** 右クリック: 作業台なら開く、食べ物なら食べ始める、それ以外は持っているブロックを置く。 */
function useOrPlace(): void {
  // **`hit` が無くても食べられること。** 空を向いたまま食べられないのはおかしい。
  if (hit?.id === CRAFTING_TABLE) {
    openInventory(3);
    return;
  }

  // かまど。点火中も同じ 1 台なので、大元の ID で見る。
  if (hit && baseBlock(hit.id) === FURNACE) {
    openFurnace(hit.block.x, hit.block.y, hit.block.z);
    return;
  }

  if (hit && hit.id === CHEST) {
    openChest(hit.block.x, hit.block.y, hit.block.z);
    return;
  }

  // ベッド。足側でも枕側でも同じ 1 台なので、どちらを叩いても同じ扱い。
  if (hit && isBed(hit.id)) {
    sleepOrSetSpawn(hit.block.x, hit.block.y, hit.block.z, hit.id);
    return;
  }

  // バケツ。**汲めるか流せるかの判断は `items.ts` の `bucketUse()`**（ここは
  // どのマスに効くかを決めるだけ）。食べ物より先に見る —— どちらも右クリックだが、
  // バケツは押しっぱなしではなく 1 回で終わる。
  if (isBucket(inventory.selectedItem)) {
    useBucket(inventory.selectedItem);
    return;
  }

  // 火打石と打ち金。**どのマスに火を点けるかも枠の判定も `placing.ts` / `portals.ts`。**
  if (hit && isFireStarter(inventory.selectedItem)) {
    const lit = tryIgnite(world, hit);
    if (lit.kind === "blocked") hud.flash(lit.message);
    if (lit.kind === "placed") {
      audio.play("place", "stone");
      saveDirty = true;
    }
    return;
  }

  // 食べ物。**何がどれだけ戻るかは `items.ts`、食べられるかは `vitals.ts`**。
  // ここは「押しっぱなしが始まった」ことだけを持つ。
  const food = foodOf(inventory.selectedItem);
  if (food) {
    if (creative) return;
    if (!vitals.canEat) {
      hud.flash("お腹は空いていません");
      return;
    }
    eating.begin(inventory.selectedItem);
    return;
  }

  if (!hit) return;
  // 置けるかどうかと書き込みは `placing.ts`（**判断はあちら**。ここは結果を貼るだけ）。
  const placed = tryPlace(world, player, hit, player.yaw, placedBlock(inventory.selectedItem));
  if (placed.kind === "blocked") {
    hud.flash(placed.message);
    return;
  }
  if (placed.kind !== "placed") return;
  audio.play("place", blockSound(placed.id));

  if (!creative) inventory.consumeSelected(1);
  hud.refresh();
  saveDirty = true;
}

/**
 * バケツで汲む／流す。**判断は `placing.ts` の `tryBucket()`。**
 *
 * **ここだけ光線を引き直す。** 普段の光線は液体を素通りするので
 * （溶岩湖の向こうを狙えるように）、そのままでは水面を狙えず汲めない。
 */
function useBucket(held: number): void {
  const target = raycastVoxels(world, camera.position, lookDirection, REACH, true);
  if (!target) return;

  const used = tryBucket(world, target, held, player.yaw);
  if (used.kind === "blocked") hud.flash(used.message);
  if (used.kind !== "used") return;

  // **クリエイティブでも中身は入れ替える**（`placing.ts` の `BucketOutcome`）。
  inventory.setSelected(used.item, 1);
  // 水の音を借りている（溶岩用の音はまだ無い）。
  audio.play("splash");
  hud.flash(used.message);
  hud.refresh();
  saveDirty = true;
}

/**
 * ベッドを右クリックしたとき。**判断は `beds.ts` の `sleepDecision()` と
 * `daynight.ts` の `canSleep()`** にあるので、ここは事実を集めて結果を貼るだけ。
 *
 * リスポーン地点は**どの結果でも記録する**（寝られなかったからといって、
 * 地点だけ取り損なう理由が無い）。覚えるのは必ず**足側**のマス —— 枕側を覚えると、
 * 相方を辿らずに「ベッドがまだあるか」を見られなくなる。
 */
function sleepOrSetSpawn(x: number, y: number, z: number, id: number): void {
  // 枕側を叩いたなら、相方（足側）のマスを覚える
  const partner = isBedHead(id) ? bedPartner(id) : null;
  const fx = x + (partner?.dx ?? 0);
  const fz = z + (partner?.dz ?? 0);
  beds.set(fx, y, fz);
  saveDirty = true;

  const result = sleepDecision(
    canSleep(dayNight.time),
    mobs.hostileNear(x + 0.5, y, z + 0.5, SLEEP_MONSTER_RADIUS),
  );
  if (result === "slept") {
    dayNight.setTime(WAKE_TIME);
    syncTimeInput();
    hud.flash("おはようございます");
    return;
  }
  hud.flash(
    result === "monsters"
      ? "近くにモンスターがいます。リスポーン地点にしました"
      : "ここをリスポーン地点にしました",
  );
}

/** 掘り切ったときの処理。ドロップはマスの中心に落ちる（拾うのは `drops.ts`）。 */
function breakBlock(x: number, y: number, z: number, blockId: number, tool: number): void {
  if (!world.setVoxel(x, y, z, AIR)) return;
  saveDirty = true;
  audio.play("break", blockSound(blockId));
  digCadence.reset();

  // かまどを壊したら中身も出す。**クリエイティブでも出すこと** ——
  // 中身は集めたアイテムで、壊し方によって消えてよいものではない。
  if (baseBlock(blockId) === FURNACE) {
    for (const held of furnaces.remove(x, y, z)) {
      drops.burst(held.item, held.count, x + 0.5, y + 0.5, z + 0.5);
    }
  }

  // チェストも同じ。**クリエイティブでも中身は落とす**（下の early return より前）。
  if (blockId === CHEST) {
    for (const held of chests.remove(x, y, z)) {
      drops.burst(held.item, held.count, x + 0.5, y + 0.5, z + 0.5);
    }
  }

  // ベッドは 2 マスで 1 台。**どちらを壊しても相方も消す**（クリエイティブでも）。
  // ドロップは下の 1 本の経路だけを通るので、**出るベッドは 1 個**。
  clearBedPartner(world, x, y, z, blockId);

  if (creative) return;
  // 掘ると腹が減る。**どれだけ減るかは `vitals.ts`**（ここは種類を渡すだけ）。
  vitals.exhaust("mine");
  if (!canHarvest(blockId, tool)) return;
  // **何が落ちるかは `items.ts`**（砂利のように「外したら別のものが落ちる」がある）。
  // ここは乱数を 1 個渡すだけで、確率の比較を持たない。
  const drop = rollDrop(blockId, Math.random());
  if (drop.item === NO_ITEM || drop.count <= 0) return;
  drops.burst(drop.item, drop.count, x + 0.5, y + 0.35, z + 0.5);
}

window.addEventListener("wheel", (event) => {
  if (!playing) return;
  inventory.cycle(event.deltaY > 0 ? 1 : -1);
  hud.refresh();
});

window.addEventListener("keydown", (event) => {
  // インベントリを開いているときは、閉じる・捨てる・ホットバーへ入れ替えるだけ
  if (screen.isOpen) {
    if (event.code === "KeyE" || event.code === "Escape") {
      event.preventDefault();
      closeInventory();
    } else if (event.code === "KeyQ") {
      event.preventDefault();
      screen.discardHeld(bulkDiscard(event));
    } else if (event.code.startsWith("Digit")) {
      const n = Number(event.code.slice(5));
      // 行き先はカーソルの下のスロット。それを覚えているのは craftscreen.ts 側。
      if (n >= 1 && n <= 9) {
        event.preventDefault();
        screen.swapHotbar(n - 1);
      }
    }
    return;
  }
  if (!playing) return;
  if (event.code.startsWith("Digit")) {
    const n = Number(event.code.slice(5));
    if (n >= 1 && n <= 9) {
      inventory.select(n - 1);
      hud.refresh();
    }
    return;
  }
  switch (event.code) {
    case "KeyE":
      event.preventDefault();
      // クリエイティブでは全アイテムの一覧。ホットバーと収納は下にそのまま出る。
      if (creative) openCreativeInventory();
      else openInventory(2);
      return;
    case "KeyQ": {
      // 落としたものは地面に残るので拾い直せる（`drops.ts`）。
      // Ctrl（または Shift）を押していれば山ごと。
      event.preventDefault();
      const thrown = inventory.discardSelected(bulkDiscard(event));
      if (thrown) {
        // 目線の高さから投げる。猶予（拾い直さない時間）は `drops.ts` が決める。
        drops.throwOut(
          thrown.item,
          thrown.count,
          player.position.x,
          player.position.y + 1.2,
          player.position.z,
          player.yaw,
          player.pitch,
        );
        hud.flash(`${itemName(thrown.item)} x${thrown.count} を落としました`);
        hud.refresh();
        saveDirty = true;
      }
      return;
    }
    case "KeyF":
      player.toggleFly();
      return;
    case "KeyM": {
      // 狙った所にモブを 1 体（何を・どこに出すかは `debugspawn.ts`）。
      if (!hit) return;
      const spawn = debugMob(hit, player.yaw, Math.random());
      mobs.spawn(spawn.kind, spawn.x, spawn.y, spawn.z, spawn.yaw);
      return;
    }
    case "KeyN":
      // 飛び道具を 1 つ、視線の向きへ。**種類は押すたびに順ぐり**（`debugspawn.ts`）。
      // 撃つ相手も当たったときの効果もまだ無い（火球はブレイズ、矢は弓と一緒に入る）。
      debugShot = nextShot(debugShot);
      projectiles.launch(
        PROJECTILE_KINDS[debugShot].kind,
        player.position.x,
        player.position.y + 1.5,
        player.position.z,
        player.yaw,
        player.pitch,
      );
      return;
    case "F3":
      event.preventDefault();
      hud.toggleDebug();
      return;
    case "Space":
      event.preventDefault();
      break;
    default:
      break;
  }
  player.setKey(event.code, true);
});

window.addEventListener("keyup", (event) => player.setKey(event.code, false));
window.addEventListener("blur", () => player.clearKeys());
window.addEventListener("beforeunload", () => {
  if (saveDirty) save(currentSave());
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// --- ループ -------------------------------------------------------------

const lookDirection = new Vector3();
let last = performance.now();
let fps = 60;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.08;

  // 走れるかどうかの判断は vitals.ts。player.ts は結果を受け取るだけ。
  player.canSprint = creative || vitals.canSprint;

  if (playing) {
    player.update(dt, world);
  } else {
    // **最初のタイトル画面だけ**ゆっくり見回して背景にする（ホーム画面に寄せた演出）。
    // **条件を `!playing` に戻さないこと** —— インベントリ・かまど・チェスト・
    // Esc メニュー・死亡画面でも回り始め、開くたびに視点がずれていきます
    // （0.05 rad/s なので、20 秒開けていると 1 ラジアン近く回ります）。
    if (!everPlayed) player.yaw += dt * 0.05;
    // 見回しを止めても**カメラ合わせは毎フレーム要ります** —— メニューで
    // 「この種で作り直す」やリスポーンをすると、プレイヤーの位置だけ動くので。
    player.syncCamera();
  }
  // 水平に動いた距離。**足音（`sfx.ts`）と空腹の消耗（`vitals.ts`）が同じ値を見る。**
  // 別々に持つと、片方だけ「壁に押し付けて足踏み」を数えるような食い違いが起きる。
  const moved = Math.hypot(player.position.x - lastFootX, player.position.z - lastFootZ);
  lastFootX = player.position.x;
  lastFootZ = player.position.z;
  world.update(player.position.x, player.position.z);

  camera.getWorldDirection(lookDirection);
  hit = raycastVoxels(world, camera.position, lookDirection, REACH);
  highlight.visible = playing && hit !== null;
  if (hit) fitHighlight(hit);

  updateMining(dt);
  updateEating(dt);

  dayNight.advance(dt);
  updateEnvironment();
  // ポータル。**モブより先に見る** —— 次元が変わるとモブも落とし物も入れ替わるので、
  // 動かしてから移ると、1 フレームぶん前の世界の結果を新しい世界へ持ち込む。
  if (playing) updatePortal(dt);
  // ここでプレイヤーが殴られる。音・赤い明滅・死亡画面は updateVitals が
  // vitals.takeDamage() で拾うので、モブ用のダメージ処理は書かずに済む
  // （拾い方が「前後の体力の比較」だった頃は、ここが先に走るせいで
  //   ゾンビに殺されても死亡画面が出なかった。vitals.ts のコメント参照）。
  if (playing) mobs.update(dt, world, mobContext());
  mobRender.sync(mobs.list, world);
  // 落ちたアイテム。**モブと同じく `world.update()` の外**（`test/world.test.ts` の
  // p99 に混ぜると、ストリーミングの退行と区別できなくなる）。
  if (playing) drops.update(dt, world, dropContext());
  dropRender.sync(drops.list, world);
  // 飛んでいるもの。**落とし物と同じ理由で `world.update()` の外。**
  if (playing) projectiles.update(dt, world);
  projectileRender.sync(projectiles.list, world);
  // かまど。**画面を開いていても止めないこと** —— 開けた瞬間に止まると、
  // 焼き上がるところを見ていられない（`playing` はポインタが外れると false になる）。
  // 落とし物と同じく `world.update()` の外で回す。
  if (playing || screen.isOpen) furnaces.update(dt);
  syncFurnaceBlocks();
  refreshFurnaceUi(dt);
  // 水中のこもりに underwater を使うので、updateEnvironment のあとに回す
  updateSounds(moved);
  // 息の判定に水中かどうかを使うので、updateEnvironment のあとに回す
  updateVitals(dt, moved);
  sky.object.position.copy(camera.position);

  hud.tick(dt);
  autosaveTimer += dt;
  if (saveDirty && autosaveTimer >= AUTOSAVE_INTERVAL) {
    autosaveTimer = 0;
    saveNow("オートセーブ");
  }

  const stats = world.stats();
  hud.setLoading(stats.queued > 0);
  // 並べ方は `debugtext.ts`（判断はあちら。ここは値を集めるだけ）。
  hud.setDebug(
    debugText({
      fps,
      player,
      stats,
      edits: countEdits(world.editsForSave()),
      dayNight,
      creative,
      dimension: dims.nameOf(dims.current),
      biome: biomeName(overworld.biomeAt(Math.floor(player.position.x), Math.floor(player.position.z))),
      counts: {
        mobs: mobs.count,
        drops: drops.count,
        furnaces: furnaces.count,
        chests: chests.count,
        shots: projectiles.count,
      },
      vitals,
      held: inventory.selectedItem,
      hit,
    }),
  );

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/**
 * 体力の更新。判定は vitals.ts に置いてあるので、ここは状況を渡して結果を貼るだけ。
 * クリエイティブでは何も受けず、奈落に落ちたら初期位置へ戻す（死なせない）。
 */
function updateVitals(dt: number, moved: number): void {
  if (playing) {
    vitals.update(dt, {
      y: player.position.y,
      onGround: player.onGround,
      inLiquid: player.inLiquid,
      inLava: player.inLava,
      headInWater: underwater,
      flying: player.flying,
      invulnerable: creative,
      // 空腹の消耗は歩いた距離から。**どれだけ減るかは vitals.ts が決める。**
      moved,
      sprinting: player.sprinting,
    });
    if (creative && player.position.y < VOID_Y) moveToSpawn();
  }

  hud.setVitals(vitals.health, vitals.hunger, vitals.airFraction, vitals.hurtFlash, playing && !creative);

  // **`takeDamage()` で拾うこと。前後の体力を比べないこと。**
  // モブは `updateVitals()` より前に走るので、ここで控えを取る形にすると
  // その差分がもう済んでいて、ゾンビに殺されても死亡画面が出ない（実際にそうなっていた）。
  const hurt = vitals.takeDamage();
  // 減ったときだけ鳴らす（自然回復で毎秒鳴らさない）
  if (hurt) audio.play(vitals.dead ? "death" : "hurt");

  if (hurt && vitals.dead) {
    breaking = false;
    mining.reset();
    eating.stop();
    // **リスポーンより前に落とすこと**（`moveToSpawn()` が位置を変えるので、
    // あとに回すと初期位置に湧く）。
    deathCause.textContent = deathMessage(vitals.cause, dropOnDeath());
    deathScreen.classList.remove("hidden");
    saveDirty = true;
    document.exitPointerLock();
  }
}

/**
 * 食べ進める。**掘るのとまったく同じ形**（押している間だけ進み、離すと消える）。
 *
 * この環境では食べる動きを描けないので、進んでいる手ごたえは咀嚼音だけ。
 * **鳴らす間隔は `sfx.ts` の `EatCadence`**、戻る量は `items.ts`、
 * 食べられるかは `vitals.ts` が持っていて、ここには数値を書かない。
 */
function updateEating(dt: number): void {
  const held = inventory.selectedItem;
  const food = foodOf(held);
  const step = eating.advance(dt, { playing, held, canEat: vitals.canEat, isFood: food !== null });
  if (step === "chew") audio.play("eat");
  if (step !== "done" || !food) return;

  vitals.eat(food);
  inventory.consumeSelected(1);
  hud.flash(`${itemName(held)} を食べました`);
  hud.refresh();
  saveDirty = true;
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
function dropOnDeath(): number {
  const lost = inventory.takeAll();
  for (const stack of lost) {
    // 死体の位置から少し上に散らす（足元に埋まると拾いにくい）
    drops.burst(stack.item, stack.count, player.position.x, player.position.y + 0.6, player.position.z);
  }
  if (lost.length > 0) hud.refresh();
  return lost.length;
}

/** 掘り進める。ひび割れの表示もここでまとめて更新する。 */
function updateMining(dt: number): void {
  if (!playing || !breaking || !hit) {
    mining.reset();
    digCadence.reset();
    crack.setStage(-1);
    return;
  }

  const tool = inventory.selectedItem;
  const { x, y, z } = hit.block;
  const blockId = hit.id;
  // 狙いを変えると進み具合は 0 に戻るので、増えたぶんだけを渡す
  const before = mining.progress;
  if (mining.update(dt, hit.block, blockId, tool)) {
    breakBlock(x, y, z, blockId, tool);
  } else if (digCadence.advance(Math.max(0, mining.progress - before))) {
    // 掘っている間のコツコツ音。進み具合で刻むので、硬いブロックほど間隔が空く
    audio.play("dig", blockSound(blockId));
  }

  const target = mining.target;
  if (target) crack.setStage(mining.stage, target.x, target.y, target.z, hit?.id ?? AIR);
  else crack.setStage(-1);
}

/**
 * 足音・着地・水しぶきと、水中のこもり。
 *
 * **鳴らすかどうかの判断は `sfx.ts` に置いてある。** ここは「どれだけ動いたか」
 * 「地面に着いたか」を渡すだけにして、条件をここに書かないこと
 * （書くと DOM 込みでしか確かめられなくなる）。
 */
function updateSounds(moved: number): void {
  audio.setUnderwater(underwater);
  const { x, y, z } = player.position;
  // 足元のブロック。立っている面の材質で足音が変わる
  const ground = world.getVoxel(Math.floor(x), Math.floor(y - 0.1), Math.floor(z));
  for (const cue of footsteps.update({ playing, moved, ground: blockSound(ground), player })) {
    audio.play(cue.sfx, cue.group);
  }
}

/**
 * 空・フォグ・地形の明るさを、時刻と水中かどうかに合わせる。
 * フォグの色は地平線と揃えておかないと、チャンクの出現が見えてしまう。
 */
function updateEnvironment(): void {
  // **決めるのは `daynight.ts` の `environmentFor()`**（ここは引いて貼るだけ）。
  const env = environmentFor(
    world.getVoxel(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y),
      Math.floor(camera.position.z),
    ),
    dayNight,
  );
  underwater = env.headInWater;
  fog.color.copy(env.fog);
  fog.near = env.near;
  fog.far = env.far;

  // 天球も液体の色で塗りつぶす（水面から上を見上げたときと同じ扱い）
  sky.setUnderwater(env.inLiquid, fog.color);
  sky.update(dayNight);
  world.setDaylight(dayNight.tint);
}

requestAnimationFrame(frame);
