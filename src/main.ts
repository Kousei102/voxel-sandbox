import {
  BoxGeometry,
  Color,
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
  CRAFTING_TABLE,
  NO_SUPPORT,
  PALETTE,
  WATER,
  baseBlock,
  blockName,
  blockSound,
  faceFromYaw,
  isReplaceable,
  placeSpot,
  placedVariant,
  shapeBounds,
  supportFace,
} from "./blocks";
import { AudioEngine } from "./audio";
import { biomeName } from "./biomes";
import { AUTOSAVE_INTERVAL, CHUNK_BITS, REACH, RENDER_DISTANCE, CHUNK_SIZE } from "./constants";
import { CrackOverlay } from "./crack";
import { DayNight } from "./daynight";
import { Inventory } from "./inventory";
import { InventoryScreen } from "./inventoryui";
import { NO_ITEM, dropOf, itemName, placedBlock } from "./items";
import { Mining, breakTime, canHarvest } from "./mining";
import { Player } from "./player";
import { raycastVoxels, type RaycastHit } from "./raycast";
import { DigCadence, StepCadence, clampVolume } from "./sfx";
import { Sky } from "./sky";
import { clearSave, countEdits, deserializeEdits, load, save, serializeEdits } from "./storage";
import { Hud } from "./ui";
import { MAX_HEALTH, VOID_Y, Vitals } from "./vitals";
import { World } from "./world";
import { hashSeed } from "./noise";

const FOG_COLOR = 0x9ec8e8;
const WATER_FOG = 0x1b4f8c;
/** 新しいワールドを始める時刻（朝）。 */
const NEW_WORLD_TIME = 0.05;
const SPAWN_X = 0.5;
const SPAWN_Z = 0.5;

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
const waterColor = new Color(WATER_FOG);

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
const screen = new InventoryScreen(inventory);
const mining = new Mining();
const vitals = new Vitals();
const player = new Player(camera);

// 音。鳴らすかどうかの判断は sfx.ts、実際に鳴らすのは audio.ts。
// ここは「起きたこと」を渡すだけにして、条件を書かない。
const audio = new AudioEngine();
const stepCadence = new StepCadence();
const digCadence = new DigCadence();
/** 足音・着水の判定に使う、前のフレームの状態。 */
let lastFootX = 0;
let lastFootZ = 0;
let wasOnGround = false;
let wasInWater = false;

const deathScreen = document.getElementById("death") as HTMLElement;
const deathCause = document.getElementById("deathcause") as HTMLElement;

let world!: World;
let playing = false;
let saveDirty = false;
let autosaveTimer = 0;
let hit: RaycastHit | null = null;
let underwater = false;
let breaking = false;
/** クリエイティブでは即掘れて、置いてもアイテムが減らない。 */
let creative = false;

const seedInput = document.getElementById("seed") as HTMLInputElement;
const modeButton = document.getElementById("mode") as HTMLButtonElement;

screen.onChange = () => {
  hud.refresh();
  saveDirty = true;
};

screen.onCraft = () => audio.play("craft");

function setCreative(on: boolean): void {
  creative = on;
  modeButton.textContent = creative ? "クリエイティブ" : "サバイバル";
  if (creative) inventory.fillEmptyHotbar(PALETTE);
  hud.refresh();
}

function startWorld(
  seed: number,
  edits = new Map<string, Map<number, number>>(),
  spawn?: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean },
): void {
  world?.dispose();
  world = new World(scene, seed, edits);
  seedInput.value = String(seed);

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
  world.update(player.position.x, player.position.z);
}

/** 初期位置へ戻す。ベッドがまだ無いので、リスポーン地点はワールドの初期位置ひとつだけ。 */
function moveToSpawn(): void {
  world.primeAround(SPAWN_X, SPAWN_Z, 1);
  player.position.set(SPAWN_X, world.surfaceY(Math.floor(SPAWN_X), Math.floor(SPAWN_Z)) + 0.2, SPAWN_Z);
  player.velocity.set(0, 0, 0);
  player.clearKeys();
  player.syncCamera();
}

function currentSave() {
  return {
    version: 1 as const,
    seed: world.seed,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      flying: player.flying,
    },
    time: dayNight.time,
    creative,
    health: vitals.health,
    inventory: inventory.serialize(),
    volume: audio.getVolume(),
    edits: serializeEdits(world.editsForSave()),
  };
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
if (typeof saved?.time === "number" && Number.isFinite(saved.time)) dayNight.setTime(saved.time);
inventory.deserialize(saved?.inventory);
audio.setVolume(clampVolume(saved?.volume));
setCreative(saved?.creative ?? false);
// 死んだまま保存された場合は満タンで再開する（読み込み直後に死亡画面を出さない）
if (typeof saved?.health === "number" && saved.health > 0) {
  vitals.health = Math.min(MAX_HEALTH, saved.health);
}
startWorld(
  saved?.seed ?? (Math.random() * 0xffffffff) >>> 0,
  deserializeEdits(saved?.edits),
  saved?.player,
);

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
  saveDirty = false;
  hud.flash("保存データを削除しました");
});
document.getElementById("regen")?.addEventListener("click", () => {
  const text = seedInput.value.trim();
  const seed = /^\d+$/.test(text) ? Number(text) >>> 0 : hashSeed(text || String(Date.now()));
  dayNight.setTime(NEW_WORLD_TIME);
  vitals.respawn();
  deathScreen.classList.add("hidden");
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
  hud.flash(creative ? "クリエイティブ: 即掘り・アイテム無限" : "サバイバル: 掘って集めます");
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
  // インベントリや死亡画面でロックが外れたときは、メインメニューを出さない
  hud.setPlaying(playing, !playing && !screen.isOpen && !vitals.dead);
  if (!playing) {
    player.clearKeys();
    breaking = false;
    mining.reset();
    syncTimeInput();
    if (saveDirty) saveNow();
  }
});

/** インベントリ（または作業台）を開く。ポインタロックは外れる。 */
function openInventory(size: 2 | 3): void {
  if (screen.isOpen) return;
  breaking = false;
  mining.reset();
  screen.show(size);
  hud.setPlaying(false, false);
  document.exitPointerLock();
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
  if (!playing || !hit) return;
  event.preventDefault();

  if (event.button === 0) {
    // クリエイティブは 1 クリック 1 個。サバイバルは押しっぱなしで掘り進める。
    if (creative) breakBlock(hit.block.x, hit.block.y, hit.block.z, hit.id, NO_ITEM);
    else breaking = true;
  } else if (event.button === 1) {
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

/** 右クリック: 作業台なら開く、それ以外は持っているブロックを置く。 */
function useOrPlace(): void {
  if (!hit) return;
  if (hit.id === CRAFTING_TABLE) {
    openInventory(3);
    return;
  }

  const item = inventory.selectedItem;
  const base = placedBlock(item);
  if (base === AIR) return;

  // 置くマス（草むらを狙ったならそのマス自身）と向きは placeSpot() が決める。
  // 階段は置く人の向きで決まるので、見ている向きも渡す。
  const spot = placeSpot(hit, faceFromYaw(player.yaw));
  const { x, y, z } = spot;
  const target = world.getVoxel(x, y, z);
  if (!isReplaceable(target)) return;

  const id = placedVariant(base, spot);

  if (player.overlapsBlock(x, y, z, id)) return;
  if (supportFace(base) !== NO_SUPPORT) {
    if (id === AIR || target === WATER || !world.canPlaceAt(x, y, z, id)) {
      hud.flash(`${blockName(base)} は床か壁にしか付けられません`);
      return;
    }
  }
  if (!world.setVoxel(x, y, z, id)) return;
  audio.play("place", blockSound(id));

  if (!creative) inventory.consumeSelected(1);
  hud.refresh();
  saveDirty = true;
}

/** 掘り切ったときの処理。ドロップをインベントリに入れる。 */
function breakBlock(x: number, y: number, z: number, blockId: number, tool: number): void {
  if (!world.setVoxel(x, y, z, AIR)) return;
  saveDirty = true;
  audio.play("break", blockSound(blockId));
  digCadence.reset();

  if (creative) return;
  if (!canHarvest(blockId, tool)) return;
  const drop = dropOf(blockId);
  if (drop.item === NO_ITEM || drop.count <= 0) return;
  if (drop.chance < 1 && Math.random() >= drop.chance) return;
  const left = inventory.add(drop.item, drop.count);
  if (left > 0) hud.flash("インベントリがいっぱいです");
  hud.refresh();
}

window.addEventListener("wheel", (event) => {
  if (!playing) return;
  inventory.cycle(event.deltaY > 0 ? 1 : -1);
  hud.refresh();
});

window.addEventListener("keydown", (event) => {
  // インベントリを開いているときは E と Esc で閉じるだけ
  if (screen.isOpen) {
    if (event.code === "KeyE" || event.code === "Escape") {
      event.preventDefault();
      closeInventory();
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
      openInventory(2);
      return;
    case "KeyF":
      player.toggleFly();
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

  if (playing) {
    player.update(dt, world);
  } else {
    // メニュー中はゆっくり見回して背景にする
    player.yaw += dt * 0.05;
    player.syncCamera();
  }
  world.update(player.position.x, player.position.z);

  camera.getWorldDirection(lookDirection);
  hit = raycastVoxels(world, camera.position, lookDirection, REACH);
  highlight.visible = playing && hit !== null;
  if (hit) fitHighlight(hit);

  updateMining(dt);

  dayNight.advance(dt);
  updateEnvironment();
  // 水中のこもりに underwater を使うので、updateEnvironment のあとに回す
  updateSounds();
  // 息の判定に水中かどうかを使うので、updateEnvironment のあとに回す
  updateVitals(dt);
  sky.object.position.copy(camera.position);

  hud.tick(dt);
  autosaveTimer += dt;
  if (saveDirty && autosaveTimer >= AUTOSAVE_INTERVAL) {
    autosaveTimer = 0;
    saveNow("オートセーブ");
  }

  const stats = world.stats();
  hud.setLoading(stats.queued > 0);
  hud.setDebug(
    `${fps.toFixed(0)} fps\n` +
      `xyz ${player.position.x.toFixed(1)} ${player.position.y.toFixed(1)} ${player.position.z.toFixed(1)}\n` +
      `chunk ${Math.floor(player.position.x) >> CHUNK_BITS} ${Math.floor(player.position.z) >> CHUNK_BITS}` +
      `  loaded ${stats.chunks}  queue ${stats.queued}\n` +
      `tris ${stats.triangles.toLocaleString()}  edits ${countEdits(world.editsForSave())}\n` +
      `time ${dayNight.clock()}  light ${(dayNight.brightness * 100).toFixed(0)}%  ${creative ? "creative" : "survival"}\n` +
      `biome ${biomeName(world.gen.biomeAt(Math.floor(player.position.x), Math.floor(player.position.z)))}\n` +
      `hp ${vitals.health}/${MAX_HEALTH}  air ${(vitals.airFraction * 100).toFixed(0)}%\n` +
      `${player.flying ? "fly" : player.onGround ? "ground" : "air"}${player.inWater ? " / water" : ""}\n` +
      `hand ${inventory.selectedItem === NO_ITEM ? "-" : itemName(inventory.selectedItem)}\n` +
      `target ${hit ? `${blockName(hit.id)} (${hit.block.x}, ${hit.block.y}, ${hit.block.z})` : "-"}` +
      (hit ? `  ${formatBreakTime(hit.id, inventory.selectedItem)}` : ""),
  );

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/**
 * 体力の更新。判定は vitals.ts に置いてあるので、ここは状況を渡して結果を貼るだけ。
 * クリエイティブでは何も受けず、奈落に落ちたら初期位置へ戻す（死なせない）。
 */
function updateVitals(dt: number): void {
  const wasDead = vitals.dead;
  const beforeHealth = vitals.health;

  if (playing) {
    vitals.update(dt, {
      y: player.position.y,
      onGround: player.onGround,
      inWater: player.inWater,
      headInWater: underwater,
      flying: player.flying,
      invulnerable: creative,
    });
    if (creative && player.position.y < VOID_Y) moveToSpawn();
  }

  hud.setVitals(vitals.health, vitals.airFraction, vitals.hurtFlash, playing && !creative);
  // 減ったときだけ鳴らす（自然回復で毎秒鳴らさない）
  if (vitals.health < beforeHealth) audio.play(vitals.dead ? "death" : "hurt");

  if (vitals.dead && !wasDead) {
    breaking = false;
    mining.reset();
    deathCause.textContent = vitals.cause ? `死因: ${vitals.cause}` : "";
    deathScreen.classList.remove("hidden");
    saveDirty = true;
    document.exitPointerLock();
  }
}

/** デバッグ表示用: いま持っている道具で何秒かかるか。 */
function formatBreakTime(blockId: number, tool: number): string {
  const time = breakTime(blockId, tool);
  if (!Number.isFinite(time)) return "掘れない";
  return `${time.toFixed(2)}s${canHarvest(blockId, tool) ? "" : " (落ちない)"}`;
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
function updateSounds(): void {
  audio.setUnderwater(underwater);

  const { x, y, z } = player.position;
  const moved = Math.hypot(x - lastFootX, z - lastFootZ);
  lastFootX = x;
  lastFootZ = z;

  if (!playing) {
    stepCadence.reset();
    wasOnGround = player.onGround;
    wasInWater = player.inWater;
    return;
  }

  // 足元のブロック。立っている面の材質で足音が変わる
  const ground = world.getVoxel(Math.floor(x), Math.floor(y - 0.1), Math.floor(z));

  if (stepCadence.advance(moved, player)) audio.play("step", blockSound(ground));
  if (player.onGround && !wasOnGround) audio.play("land", blockSound(ground));
  if (player.inWater !== wasInWater) audio.play("splash");

  wasOnGround = player.onGround;
  wasInWater = player.inWater;
}

/**
 * 空・フォグ・地形の明るさを、時刻と水中かどうかに合わせる。
 * フォグの色は地平線と揃えておかないと、チャンクの出現が見えてしまう。
 */
function updateEnvironment(): void {
  underwater =
    world.getVoxel(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y),
      Math.floor(camera.position.z),
    ) === WATER;

  if (underwater) {
    // 水中でも夜は暗くなるように、水の色に明るさを掛ける
    fog.color.copy(waterColor).multiplyScalar(dayNight.brightness);
    fog.near = 0.1;
    fog.far = 22;
  } else {
    fog.color.copy(dayNight.horizon);
    fog.near = RENDER_DISTANCE * CHUNK_SIZE * 0.55;
    fog.far = RENDER_DISTANCE * CHUNK_SIZE * 0.98;
  }

  sky.setUnderwater(underwater, fog.color);
  sky.update(dayNight);
  world.setDaylight(dayNight.tint);
}

requestAnimationFrame(frame);
