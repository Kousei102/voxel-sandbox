import {
  BoxGeometry,
  Color,
  EdgesGeometry,
  Fog,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { AIR, WATER, blockName, isSolid } from "./blocks";
import { AUTOSAVE_INTERVAL, CHUNK_BITS, REACH, RENDER_DISTANCE, CHUNK_SIZE } from "./constants";
import { Player } from "./player";
import { raycastVoxels, type RaycastHit } from "./raycast";
import { createSky } from "./sky";
import { clearSave, countEdits, deserializeEdits, load, save, serializeEdits } from "./storage";
import { Hud } from "./ui";
import { World } from "./world";
import { hashSeed } from "./noise";

const FOG_COLOR = 0x9ec8e8;
const WATER_FOG = 0x1b4f8c;

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new Scene();
const fog = new Fog(FOG_COLOR, RENDER_DISTANCE * CHUNK_SIZE * 0.55, RENDER_DISTANCE * CHUNK_SIZE * 0.98);
scene.fog = fog;

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 2400);

const sky = createSky(FOG_COLOR);
scene.add(sky);
const skyUniforms = (sky.material as ShaderMaterial).uniforms;
const skyZenith = new Color(0x3f7fd0);
const skyHorizon = new Color(FOG_COLOR);
const skyGround = new Color(0x4c5a63);
const waterColor = new Color(WATER_FOG);

const highlight = new LineSegments(
  new EdgesGeometry(new BoxGeometry(1.002, 1.002, 1.002)),
  new LineBasicMaterial({ color: 0x0b0e12, transparent: true, opacity: 0.55, fog: false }),
);
highlight.visible = false;
scene.add(highlight);

const hud = new Hud();
const player = new Player(camera);

let world!: World;
let playing = false;
let saveDirty = false;
let autosaveTimer = 0;
let hit: RaycastHit | null = null;
let underwater = false;

const seedInput = document.getElementById("seed") as HTMLInputElement;

function startWorld(
  seed: number,
  edits = new Map<string, Map<number, number>>(),
  spawn?: { x: number; y: number; z: number; yaw: number; pitch: number; flying: boolean },
): void {
  world?.dispose();
  world = new World(scene, seed, edits);
  seedInput.value = String(seed);

  const x = spawn?.x ?? 0.5;
  const z = spawn?.z ?? 0.5;
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
startWorld(
  saved?.seed ?? (Math.random() * 0xffffffff) >>> 0,
  deserializeEdits(saved?.edits),
  saved?.player,
);

// --- 入力 ---------------------------------------------------------------

function requestLock(): void {
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
  startWorld(seed);
  saveNow(`シード ${seed} で作り直しました`);
});

document.addEventListener("pointerlockchange", () => {
  playing = document.pointerLockElement === canvas;
  hud.setPlaying(playing);
  if (!playing) {
    player.clearKeys();
    if (saveDirty) saveNow();
  }
});

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
    if (world.setVoxel(hit.block.x, hit.block.y, hit.block.z, AIR)) saveDirty = true;
  } else if (event.button === 1) {
    hud.selectBlock(hit.id);
  } else if (event.button === 2) {
    const x = hit.block.x + hit.normal.x;
    const y = hit.block.y + hit.normal.y;
    const z = hit.block.z + hit.normal.z;
    const target = world.getVoxel(x, y, z);
    if (target !== AIR && target !== WATER) return;
    const id = hud.selectedBlock;
    if (isSolid(id) && player.overlapsBlock(x, y, z)) return;
    if (world.setVoxel(x, y, z, id)) saveDirty = true;
  }
});

window.addEventListener("wheel", (event) => {
  if (playing) hud.cycle(event.deltaY > 0 ? 1 : -1);
});

window.addEventListener("keydown", (event) => {
  if (!playing) return;
  if (event.code.startsWith("Digit")) {
    const n = Number(event.code.slice(5));
    if (n >= 1 && n <= 9) hud.select(n - 1);
    return;
  }
  switch (event.code) {
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
  if (hit) highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);

  updateWaterState();
  sky.position.copy(camera.position);

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
      `${player.flying ? "fly" : player.onGround ? "ground" : "air"}${player.inWater ? " / water" : ""}\n` +
      `target ${hit ? `${blockName(hit.id)} (${hit.block.x}, ${hit.block.y}, ${hit.block.z})` : "-"}`,
  );

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/** 水中では視界を狭め、空の色も水色に寄せる。 */
function updateWaterState(): void {
  const inside =
    world.getVoxel(
      Math.floor(camera.position.x),
      Math.floor(camera.position.y),
      Math.floor(camera.position.z),
    ) === WATER;
  if (inside === underwater) return;
  underwater = inside;

  if (underwater) {
    fog.color.copy(waterColor);
    fog.near = 0.1;
    fog.far = 22;
    (skyUniforms.zenith.value as Color).copy(waterColor);
    (skyUniforms.horizon.value as Color).copy(waterColor);
    (skyUniforms.ground.value as Color).copy(waterColor).multiplyScalar(0.5);
  } else {
    fog.color.setHex(FOG_COLOR);
    fog.near = RENDER_DISTANCE * CHUNK_SIZE * 0.55;
    fog.far = RENDER_DISTANCE * CHUNK_SIZE * 0.98;
    (skyUniforms.zenith.value as Color).copy(skyZenith);
    (skyUniforms.horizon.value as Color).copy(skyHorizon);
    (skyUniforms.ground.value as Color).copy(skyGround);
  }
}

requestAnimationFrame(frame);
