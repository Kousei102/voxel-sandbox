import { DIAMOND_ORE, GRASS, STONE, WATER } from "../src/blocks";
import { debugText, formatBreakTime, type DebugSources } from "../src/debugtext";
import { NO_ITEM, WOOD_PICKAXE, DIAMOND_PICKAXE } from "../src/items";
import { MAX_HEALTH } from "../src/vitals";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** F3 に出す値を持つ偽物。**器そのものではなく値だけ**を渡す形の見本でもある。 */
function sources(over: Partial<DebugSources> = {}): DebugSources {
  return {
    fps: 59.6,
    player: {
      position: { x: 18.25, y: 70.5, z: -3.75 },
      flying: false,
      onGround: true,
      inLiquid: false,
      liquid: WATER,
    },
    stats: { chunks: 40, queued: 0, triangles: 12345 },
    edits: 7,
    dayNight: { clock: () => "06:00", brightness: 0.8 },
    creative: false,
    dimension: "オーバーワールド",
    biome: "平原",
    counts: { mobs: 3, drops: 2, furnaces: 1, chests: 0, shots: 0 },
    vitals: { health: 15, hunger: 9, poisoned: false, airFraction: 1, burning: false },
    held: NO_ITEM,
    hit: null,
    ...over,
  };
}

function lineOf(text: string, head: string): string {
  return text.split("\n").find((line) => line.startsWith(head)) ?? "";
}

export function run(): void {
  describe("F3 のデバッグ表示（debugtext.ts）");

  {
    const text = debugText(sources());
    const lines = text.split("\n");
    // 行数が減ると、出しているつもりの値が黙って消える（画面を見るまで気付けない）。
    check("10 行ある", lines.length === 10, `${lines.length} 行`);
    check("先頭は fps", lines[0] === "60 fps", lines[0]);
    check("座標は小数 1 桁", lines[1] === "xyz 18.3 70.5 -3.8", lines[1]);
    // **チャンクは `>> 4`**（負の側でも 1 つ隣にずれないこと）。
    check("チャンク座標は負でも正しい", lineOf(text, "chunk").startsWith("chunk 1 -1"), lineOf(text, "chunk"));
    check("三角形の数と改変の数が出る", lineOf(text, "tris").includes("edits 7"), lineOf(text, "tris"));
    check("時刻・明るさ・モードが出る", lineOf(text, "time").includes("light 80%") && lineOf(text, "time").includes("survival"));
    check("いま居る次元が出る", lineOf(text, "time").includes("dim オーバーワールド"), lineOf(text, "time"));
    check("バイオームと個数が出る", lineOf(text, "biome").includes("mobs 3") && lineOf(text, "biome").includes("shots 0"));
    check("体力は上限つきで出る", lineOf(text, "hp").startsWith(`hp 15/${MAX_HEALTH}`), lineOf(text, "hp"));
    check("地に足が着いていれば ground", lines[7] === "ground", lines[7]);
    check("手が空なら -", lineOf(text, "hand") === "hand -", lineOf(text, "hand"));
    check("狙っていなければ target は -", lineOf(text, "target") === "target -", lineOf(text, "target"));
  }

  {
    const flying = debugText(sources({ player: { ...sources().player, flying: true } }));
    check("飛んでいれば fly", flying.split("\n")[7] === "fly");
    const swimming = debugText(
      sources({ player: { ...sources().player, onGround: false, inLiquid: true } }),
    );
    check("液体に浸かっていれば名前が出る", swimming.split("\n")[7] === "air / 水", swimming.split("\n")[7]);
    const burning = debugText(
      sources({ vitals: { health: 4, hunger: 0, poisoned: true, airFraction: 0.5, burning: true } }),
    );
    check("炎上が出る", burning.split("\n")[7].endsWith("/ 炎上"), burning.split("\n")[7]);
    check("毒と息の残りが出る", lineOf(burning, "hp").includes("(毒)") && lineOf(burning, "hp").includes("air 50%"));
  }

  {
    // 狙っているブロックと、それを掘るのに掛かる時間。
    const aimed = debugText(
      sources({ hit: { id: STONE, block: { x: 1, y: 2, z: 3 } }, held: WOOD_PICKAXE }),
    );
    check("狙ったブロックの名前と座標が出る", lineOf(aimed, "target").includes("(1, 2, 3)"), lineOf(aimed, "target"));
    check("掘る時間も出る", /\d\.\d\ds/.test(lineOf(aimed, "target")), lineOf(aimed, "target"));
  }

  {
    // **掘れても落ちないことがある**（階層が足りない道具）。ここが消えると、
    // 「掘ったのに何も出ない」の理由が画面から分からなくなる。
    check("階層が足りなければ「落ちない」と出る", formatBreakTime(DIAMOND_ORE, WOOD_PICKAXE).endsWith("(落ちない)"), formatBreakTime(DIAMOND_ORE, WOOD_PICKAXE));
    check("足りていれば秒だけ", /^\d+\.\d\ds$/.test(formatBreakTime(DIAMOND_ORE, DIAMOND_PICKAXE)), formatBreakTime(DIAMOND_ORE, DIAMOND_PICKAXE));
    check("素手で掘れない岩は「掘れない」", formatBreakTime(DIAMOND_ORE, NO_ITEM) === "掘れない" || formatBreakTime(DIAMOND_ORE, NO_ITEM).endsWith("(落ちない)"));
    check("草はすぐ掘れる", Number.parseFloat(formatBreakTime(GRASS, NO_ITEM)) < 2, formatBreakTime(GRASS, NO_ITEM));
  }

  // --- 見張り ---------------------------------------------------------------

  {
    const source = sourceOf("src/debugtext.ts");
    for (const word of ["three", "document", "Mesh", "AudioContext"]) {
      check(`debugtext.ts に ${word} が無い`, !source.includes(word));
    }
    // 文字列を組み立てるだけのファイル。**世界を触らないこと。**
    check("debugtext.ts が世界を触らない", !source.includes("setVoxel") && !source.includes("getVoxel"));
  }
}
