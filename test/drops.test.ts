import { readFileSync } from "node:fs";
import { COBBLE, GRASS, STONE, STONE_SLAB, WATER } from "../src/blocks";
import {
  DESPAWN_AGE,
  DROP_BOX,
  DROP_SIZE,
  Drops,
  MAX_DROPS,
  PICKUP_DELAY,
  SPIN_RATE,
  THROW_DELAY,
  dropBob,
  type DropContext,
} from "../src/drops";
import { INVENTORY_SIZE, Inventory } from "../src/inventory";
import { COAL, MAX_STACK, STICK } from "../src/items";
import { buildBoxMesh } from "../src/mobmesh";
import { mobRgb } from "../src/mobs";
import { VOID_Y } from "../src/vitals";
import { Arena } from "./arena";
import { signedVolume, verifyWinding } from "./geometry";
import { check, describe } from "./harness";

/** 平らな草原。ブロックは y=10 の 1 段なので、上面は y=11。 */
function flatGrass(): Arena {
  const arena = new Arena();
  arena.fill(-40, 40, 10, 10, -40, 40, GRASS);
  return arena;
}

/** 拾い手の居ない状況（物理と統合だけを見たいとき）。 */
function nobody(): DropContext {
  return { playerX: 1000, playerY: 0, playerZ: 1000 };
}

/** その場に立っているプレイヤー。 */
function standing(inventory: Inventory, x = 0.5, y = 11, z = 0.5): DropContext {
  return { playerX: x, playerY: y, playerZ: z, inventory };
}

/** dt 刻みで `seconds` 秒ぶん回す。 */
function advance(drops: Drops, arena: Arena, ctx: DropContext, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) drops.update(dt, arena.asWorld(), ctx);
}

function stripComments(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

export function run(): void {
  describe("落ちたアイテム（純粋と描画の切り分け）");

  // 描画はこの環境では確かめられない。だから「判断」は drops.ts に閉じ込めてあり、
  // three に触るのは droprender.ts だけ。ここが崩れると、落ちたアイテムまわりが
  // 丸ごと「ブラウザを開くまで確かめられないもの」になる。
  const dropsSource = stripComments("src/drops.ts");
  const rendering = [
    "Mesh",
    "BufferGeometry",
    "Material",
    "document.",
    "getElementById",
    "AudioContext",
    "onBeforeCompile",
  ].filter((name) => dropsSource.includes(name));
  check("drops.ts は描画に触らない", rendering.length === 0, rendering.join(" "));

  // 逆向き。判断が描画側へ漏れていないか（漏れると、その判断だけテストが届かなくなる）。
  const renderSource = stripComments("src/droprender.ts");
  const decisions = [
    "Math.random(",
    "PICKUP",
    "DESPAWN",
    "MAX_DROPS",
    "MERGE",
    "itemStackLimit",
    "inventory",
  ].filter((name) => renderSource.includes(name));
  check("droprender.ts に判断が漏れていない", decisions.length === 0, decisions.join(" "));

  // **いちばん強い判定。** 新しい GLSL はこの環境で一切確かめられないので、
  // 光の合成は terrainshader.ts の既存 3 行を通す以外に道が無いことを構造で保つ。
  const shader = ["ShaderMaterial", "vertexShader", "fragmentShader"].filter((name) =>
    renderSource.includes(name),
  );
  check("droprender.ts は新しい GLSL を書かない", shader.length === 0, shader.join(" "));
  check(
    "droprender.ts は地形と同じ光の合成を使う",
    renderSource.includes('from "./terrainshader"') && renderSource.includes("useTerrainLighting"),
  );

  // ボクセルの無い列で物理を回すと世界を突き抜けて落ちる。構造で保っているので、
  // ガードそのものが消えたら気付けるようにしておく。
  check("drops.ts は未生成の列を見張っている", dropsSource.includes("hasColumn"));

  const lines = (path: string) => readFileSync(path, "utf8").split("\n").length;
  console.log(`      drops.ts ${lines("src/drops.ts")} 行 / droprender.ts ${lines("src/droprender.ts")} 行`);

  console.log(
    `      当たり判定 ${DROP_SIZE.half * 2} x ${DROP_SIZE.height} (段差 ${DROP_SIZE.step})` +
      `  寿命 ${DESPAWN_AGE}s  上限 ${MAX_DROPS} 個`,
  );
  console.log(`      拾える猶予 ${PICKUP_DELAY}s / 投げた猶予 ${THROW_DELAY}s  回転 ${SPIN_RATE} rad/s`);

  describe("落ちたアイテムの形");

  const mesh = buildBoxMesh(DROP_BOX, 0x808080, mobRgb);
  const boxVolume =
    (DROP_BOX[3] - DROP_BOX[0]) * (DROP_BOX[4] - DROP_BOX[1]) * (DROP_BOX[5] - DROP_BOX[2]);
  verifyWinding("ドロップ", mesh, null);
  const volumeError = Math.abs(signedVolume(mesh) - boxVolume);
  check("体積が箱と一致（裏返りなし）", volumeError < 1e-9, `ずれ ${volumeError.toExponential(2)}`);
  check("頂点数が箱 1 個ぶん", mesh.positions.length / 3 === 24, `${mesh.positions.length / 3} / 24`);
  check("形が当たり判定と同じ大きさ", boxVolume === DROP_SIZE.half * 2 * DROP_SIZE.height * DROP_SIZE.half * 2);

  // 揺れは 0 以上でないと、地面に置いたアイテムが床にめり込む。
  const bobs = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2, Math.PI * 2].map(dropBob);
  console.log(`      揺れ  ${bobs.map((b) => b.toFixed(4).padStart(7)).join(" ")}`);
  check("揺れが床に潜らない", bobs.every((b) => b >= 0), `最小 ${Math.min(...bobs)}`);
  check("揺れが上下する", Math.max(...bobs) > 0);

  describe("落ちたアイテムの物理");

  {
    const arena = flatGrass();
    const drops = new Drops();
    const drop = drops.spawn(COBBLE, 1, 0.5, 20, 0.5)!;
    const startY = drop.position.y;
    advance(drops, arena, nobody(), 3);
    const fell = startY - drop.position.y;
    console.log(`      y ${startY} → ${drop.position.y.toFixed(3)}（${fell.toFixed(3)} 落ちた）`);
    // **先に「実際に落ちた」ことを出す。** 動いていないものは、どこで止めても止まって見える。
    check("落ちる", fell > 8, `落差 ${fell.toFixed(3)}`);
    check("地面の上で止まる", Math.abs(drop.position.y - 11) < 1e-3, `y ${drop.position.y.toFixed(4)}`);
    check("接地の旗が立つ", drop.onGround);
  }

  {
    // ハーフの上は半分の高さで止まる（`collisionBoxes` を見ている証拠）。
    const arena = flatGrass();
    arena.fill(0, 0, 11, 11, 0, 0, STONE_SLAB);
    const drops = new Drops();
    const drop = drops.spawn(COBBLE, 1, 0.5, 20, 0.5)!;
    advance(drops, arena, nobody(), 3);
    check("ハーフの上では半分の高さ", Math.abs(drop.position.y - 11.5) < 1e-3, `y ${drop.position.y.toFixed(4)}`);
  }

  {
    // 水に浮くこと。**沈むと水底に溜まって取りに行けなくなる。**
    // 水面では「浮く → 頭が出て重力 → また浸かる」を繰り返すので、
    // **最後の 1 フレームの `inLiquid` だけを見ないこと**（たまたま出ている側で通る）。
    const arena = flatGrass();
    arena.fill(-4, 4, 11, 20, -4, 4, WATER);
    const drops = new Drops();
    const drop = drops.spawn(COBBLE, 1, 0.5, 24, 0.5)!;
    let everWet = false;
    let lowest = Infinity;
    for (let i = 0; i < 8 * 60; i++) {
      drops.update(1 / 60, arena.asWorld(), nobody());
      everWet ||= drop.inLiquid;
      lowest = Math.min(lowest, drop.position.y);
    }
    console.log(
      `      水中 いちばん深い y ${lowest.toFixed(3)} → 落ち着き先 ${drop.position.y.toFixed(3)}` +
        `（水面 21 / 水底 11）`,
    );
    // **先に「水に入った」ことを出す。** 入っていなければ、浮いているかは測れない。
    check("水に入る", everWet && lowest < 21, `濡れた=${everWet} 最深 ${lowest.toFixed(3)}`);
    check("水底まで沈まない", lowest > 15, `いちばん深くて y ${lowest.toFixed(3)}`);
    check("水面あたりに落ち着く", Math.abs(drop.position.y - 21) < 1, `y ${drop.position.y.toFixed(3)}`);
  }

  {
    // ボクセルの無い列では動かさない。**先に「列があれば動く」ことを出すこと** ——
    // 出さないと「更新されていないから落ちない」で通ってしまう。
    const loaded = flatGrass();
    const movedDrops = new Drops();
    const moving = movedDrops.spawn(COBBLE, 1, 0.5, 20, 0.5)!;
    advance(movedDrops, loaded, nobody(), 1);
    const movedBy = 20 - moving.position.y;

    const frozenArena = flatGrass();
    frozenArena.missingColumns.add("0,0");
    const frozenDrops = new Drops();
    const frozen = frozenDrops.spawn(COBBLE, 1, 0.5, 20, 0.5)!;
    advance(frozenDrops, frozenArena, nobody(), 1);

    console.log(`      列あり ${movedBy.toFixed(3)} 落ちた / 列なし ${(20 - frozen.position.y).toFixed(3)}`);
    check("列があれば落ちる", movedBy > 1, `${movedBy.toFixed(3)}`);
    check("列が無ければ動かない", frozen.position.y === 20, `y ${frozen.position.y}`);
  }

  {
    // 奈落。**寿命任せにすると 5 分間落ち続ける山が残る。**
    const arena = flatGrass();
    const drops = new Drops();
    drops.spawn(COBBLE, 1, 0.5, VOID_Y - 1, 0.5);
    check("奈落に落ちる前は居る", drops.count === 1);
    advance(drops, arena, nobody(), 1 / 60, 1 / 60);
    check("奈落に落ちたら消える", drops.count === 0, `${drops.count} 個`);
  }

  describe("落ちたアイテムを拾う");

  {
    const arena = flatGrass();
    const inventory = new Inventory();
    const drops = new Drops();
    drops.spawn(COBBLE, 3, 0.5, 11, 0.5);
    const ctx = standing(inventory);

    // 猶予のあいだは拾えない
    advance(drops, arena, ctx, PICKUP_DELAY * 0.5);
    const during = inventory.count(COBBLE);
    // **そのあと必ず「拾えること」も出す。** 出さないと、距離判定が壊れていて
    // 誰も拾えない状態でも「猶予が効いている」で通る。
    advance(drops, arena, ctx, PICKUP_DELAY);
    const after = inventory.count(COBBLE);
    console.log(`      猶予中 ${during} 個 → 猶予明け ${after} 個`);
    check("猶予のあいだは拾えない", during === 0, `${during} 個`);
    check("猶予が明けたら拾える", after === 3, `${after} 個`);
    check("拾った山は消える", drops.count === 0, `${drops.count} 個`);
  }

  {
    // 半径の外では拾わない。**先に、内側なら拾えることを出す。**
    const arena = flatGrass();
    const near = new Inventory();
    const nearDrops = new Drops();
    nearDrops.spawn(COBBLE, 1, 0.5, 11, 0.5);
    advance(nearDrops, arena, standing(near), 2);

    const far = new Inventory();
    const farDrops = new Drops();
    farDrops.spawn(COBBLE, 1, 6.5, 11, 0.5);
    advance(farDrops, arena, standing(far), 2);

    console.log(`      距離 0 → ${near.count(COBBLE)} 個 / 距離 6 → ${far.count(COBBLE)} 個`);
    check("近ければ拾う", near.count(COBBLE) === 1);
    check("遠ければ拾わない", far.count(COBBLE) === 0 && farDrops.count === 1);
  }

  {
    // **満杯なら地面に残る。** 不変条件は「拾う前の総数 = インベントリの増分 + 地面の残り」。
    const arena = flatGrass();
    const inventory = new Inventory();
    inventory.add(STONE, MAX_STACK * INVENTORY_SIZE);
    const before = inventory.count(COBBLE);
    const drops = new Drops();
    drops.spawn(COBBLE, 10, 0.5, 11, 0.5);
    advance(drops, arena, standing(inventory), 3);
    const gained = inventory.count(COBBLE) - before;
    console.log(`      満杯: 手に ${gained} 個 / 地面に ${drops.totalItems} 個（合計 10）`);
    check("満杯なら 1 個も入らない", gained === 0, `${gained} 個`);
    check("地面に全部残る", drops.totalItems === 10 && drops.count === 1, `${drops.totalItems} 個 / ${drops.count} 山`);
    check("総数が保存される", gained + drops.totalItems === 10);
  }

  {
    // 部分回収。3 個ぶんだけ空けて 10 個の山を拾わせる。
    const arena = flatGrass();
    const inventory = new Inventory();
    inventory.add(STONE, MAX_STACK * (INVENTORY_SIZE - 1));
    inventory.add(COBBLE, MAX_STACK - 3);
    const before = inventory.count(COBBLE);
    const drops = new Drops();
    drops.spawn(COBBLE, 10, 0.5, 11, 0.5);
    advance(drops, arena, standing(inventory), 3);
    const gained = inventory.count(COBBLE) - before;
    console.log(`      部分回収: 手に +${gained} 個 / 地面に ${drops.totalItems} 個（合計 10）`);
    check("入るだけ拾う", gained === 3, `+${gained}`);
    check("残りは地面に残る", drops.totalItems === 7, `${drops.totalItems} 個`);
    check("総数が保存される", gained + drops.totalItems === 10);
  }

  describe("落ちたアイテムの統合");

  {
    const arena = flatGrass();
    const drops = new Drops();
    drops.spawn(STICK, 10, 0.5, 11, 0.5);
    drops.spawn(STICK, 7, 0.8, 11, 0.5);
    const before = drops.totalItems;
    advance(drops, arena, nobody(), 1);
    console.log(`      統合前 2 山 ${before} 個 → 統合後 ${drops.count} 山 ${drops.totalItems} 個`);
    check("同じアイテムは 1 山になる", drops.count === 1, `${drops.count} 山`);
    check("合計が変わらない", drops.totalItems === before, `${drops.totalItems} / ${before}`);
  }

  {
    const arena = flatGrass();
    const drops = new Drops();
    drops.spawn(STICK, 5, 0.5, 11, 0.5);
    drops.spawn(COAL, 5, 0.8, 11, 0.5);
    advance(drops, arena, nobody(), 1);
    check("別のアイテムは統合しない", drops.count === 2, `${drops.count} 山`);
  }

  {
    // 上限を超える組は 2 山のまま。**合計が変わらないことが不変条件。**
    const arena = flatGrass();
    const drops = new Drops();
    drops.spawn(STICK, 30, 0.5, 11, 0.5);
    drops.spawn(STICK, 50, 0.8, 11, 0.5);
    advance(drops, arena, nobody(), 1);
    const counts = drops.list.map((d) => d.count).sort((a, b) => b - a);
    console.log(`      30 + 50 → ${counts.join(" + ")}（合計 ${drops.totalItems}）`);
    check("積める上限で止まる", counts[0] === MAX_STACK, `${counts[0]} / ${MAX_STACK}`);
    check("溢れたぶんは別の山に残る", drops.count === 2 && drops.totalItems === 80, `${drops.count} 山 ${drops.totalItems} 個`);
  }

  {
    // 遠い 2 山は統合しない。**先に、近ければ統合されることは上で出してある。**
    const arena = flatGrass();
    const drops = new Drops();
    drops.spawn(STICK, 5, 0.5, 11, 0.5);
    drops.spawn(STICK, 5, 3.5, 11, 0.5);
    advance(drops, arena, nobody(), 1);
    check("遠い山は統合しない", drops.count === 2, `${drops.count} 山`);
  }

  describe("落ちたアイテムの寿命と上限");

  {
    // 凍っている列でも寿命は進む（戻らない場所に永久に残らない）。
    const arena = flatGrass();
    arena.missingColumns.add("0,0");
    const drops = new Drops();
    drops.spawn(COBBLE, 1, 0.5, 11, 0.5);
    advance(drops, arena, nobody(), DESPAWN_AGE - 2, 1);
    const alive = drops.count;
    advance(drops, arena, nobody(), 4, 1);
    console.log(`      ${DESPAWN_AGE - 2}s で ${alive} 個 → ${DESPAWN_AGE + 2}s で ${drops.count} 個`);
    check("寿命の手前ではまだ居る", alive === 1, `${alive} 個`);
    check("寿命を越えたら消える", drops.count === 0, `${drops.count} 個`);
  }

  {
    const drops = new Drops();
    const extra = 10;
    for (let i = 0; i < MAX_DROPS + extra; i++) drops.spawn(COBBLE, 1, i * 4 + 0.5, 11, 0.5);
    console.log(`      ${MAX_DROPS + extra} 個 湧かせて ${drops.count} 個 残った（上限 ${MAX_DROPS}）`);
    check("上限で頭打ちになる", drops.count === MAX_DROPS, `${drops.count} 個`);
    // 古いものから捨てる。**新しいほうを捨てると、掘った瞬間に消えて何が起きたか分からない。**
    check("残るのは新しいほう", drops.list[0].position.x === extra * 4 + 0.5, `x ${drops.list[0].position.x}`);
  }

  describe("落ちたアイテムを投げる");

  {
    const arena = flatGrass();
    const drops = new Drops();
    // yaw 0 のとき前は -Z（`player.ts` の forward と同じ規約）。
    const thrown = drops.throwOut(COBBLE, 1, 0.5, 12.2, 0.5, 0, 0)!;
    check("投げた直後は拾えない", thrown.pickupDelay === THROW_DELAY, `${thrown.pickupDelay}s`);
    check("前へ飛ぶ", thrown.velocity.z < -1, `vz ${thrown.velocity.z.toFixed(2)}`);

    // **その場で拾い直さないこと。** プレイヤーは投げた場所に立ったまま。
    const inventory = new Inventory();
    advance(drops, arena, standing(inventory, 0.5, 11, 0.5), THROW_DELAY * 0.5);
    check("猶予のあいだ拾い直さない", inventory.count(COBBLE) === 0, `${inventory.count(COBBLE)} 個`);

    const flew = 0.5 - thrown.position.z;
    console.log(`      z 0.5 → ${thrown.position.z.toFixed(2)}（${flew.toFixed(2)} 前へ）`);
    check("実際に前へ飛んだ", flew > 1, `${flew.toFixed(2)} ブロック`);
  }

  describe("落ちたアイテムのセーブ");

  {
    const source = new Drops();
    source.spawn(COBBLE, 5, 1.25, 11, -3.5);
    source.spawn(STICK, 12, -7.5, 20.25, 4);
    const flat = source.serialize();
    const loaded = new Drops();
    loaded.deserialize(flat);
    console.log(`      ${source.count} 山 → ${flat.length} 要素 → ${loaded.count} 山`);
    check("1 山 5 要素", flat.length === source.count * 5, `${flat.length} 要素`);
    check("往復で数が合う", loaded.count === source.count && loaded.totalItems === source.totalItems);
    const same = loaded.list.every((d, i) => {
      const o = source.list[i];
      return (
        d.item === o.item &&
        d.count === o.count &&
        Math.abs(d.position.x - o.position.x) < 0.01 &&
        Math.abs(d.position.y - o.position.y) < 0.01 &&
        Math.abs(d.position.z - o.position.z) < 0.01
      );
    });
    check("往復でアイテムと位置が保たれる", same);

    const empty = new Drops();
    empty.deserialize(undefined);
    check("古いセーブ（キーなし）は 0 個", empty.count === 0);
    empty.deserialize([]);
    check("空の配列も 0 個", empty.count === 0);
  }

  {
    // **セーブの版は 1 のまま。** 上げた瞬間に既存プレイヤーの世界が全部読めなくなる。
    const storage = readFileSync("src/storage.ts", "utf8");
    check("SaveData の版が 1 のまま", storage.includes("version: 1") && storage.includes("version !== 1"));
    check("drops は省略可のキー", /drops\?:\s*number\[\]/.test(storage));
  }
}
