import { readFileSync, readdirSync } from "node:fs";
import { check, describe } from "./harness";

/**
 * 画面まわりは DOM が要るのでヘッドレスでは動かせないが、
 * 「ブラウザを開くまで気付けない壊れ方」のうち静的に分かるものはここで潰しておく。
 */
export function run(): void {
  describe("画面の組み立て");

  const html = readFileSync("index.html", "utf8");
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

  // getElementById が返す null は `as HTMLElement` で握りつぶされるので、
  // id を消した／打ち間違えたことは実際に触るまで分からない。
  const missing: string[] = [];
  let referenced = 0;
  for (const file of readdirSync("src").filter((name) => name.endsWith(".ts"))) {
    const source = readFileSync(`src/${file}`, "utf8");
    for (const match of source.matchAll(/getElementById\("([^"]+)"\)/g)) {
      referenced++;
      if (!ids.has(match[1])) missing.push(`${file} の #${match[1]}`);
    }
  }
  console.log(`      index.html の id ${ids.size} 個 / TS からの参照 ${referenced} 件`);
  check("TS が引く id はすべて index.html にある", missing.length === 0, missing.join(" / "));

  // 通知の帯（#status）は ui.ts が body の直下に作る。
  // index.html のパネルの中に書くと、そのパネルが hidden の間ずっと見えない
  // （メニューの中に入れていたせいで、プレイ中の通知が誰にも見えていなかった）。
  check("通知の帯は index.html に置かれていない", !ids.has("status"));

  // 隠れるパネルの id。ここに通知を足したくなったら、上のコメントを読むこと。
  for (const panel of ["hud", "menu", "inventory", "death"]) {
    check(`${panel} が存在する`, ids.has(panel));
  }

  // 中身で長さが変わる注記（レシピ名・かまどの進み具合）は、流れから外して浮かせてある。
  // 流れに残すと .slotwrap の幅が文字の長さで変わり、列は中央寄せなので
  // **文字が変わるたびに 2x2 の盤面とかまどのスロットが左右に動く**。
  // 「要らない absolute」として消されると画面を開くまで気付けないので、ここで押さえる。
  const css = readFileSync("src/style.css", "utf8");
  const rule = css.match(/#recipehint,\s*#furnacehint\s*\{([^}]*)\}/)?.[1] ?? "";
  check("中身で変わる注記は流れから外してある", /position:\s*absolute/.test(rule), rule.trim());
  // 絶対配置の幅は包む箱（スロット 46px）まで縮むので、折り返しを止めないと縦 1 列になる。
  check("その注記は折り返さない", /white-space:\s*nowrap/.test(rule), rule.trim());
  // かまどの「材料」「燃料」は文字が変わらず、.furnacecol の縦の間隔をあれが作っている。
  // .hint そのものを浮かせると、あの 2 つが下のスロットに重なる。
  const hintRule = css.match(/\n\.hint\s*\{([^}]*)\}/)?.[1] ?? "";
  check("注記の既定は流れに残してある", !/position:\s*absolute/.test(hintRule), hintRule.trim());

  mainStaysWiring();
}

/**
 * `main.ts` を配線のままに保つ。
 *
 * **ここだけはテストの効かない場所**（トップレベルで `new WebGLRenderer` を作るので
 * ヘッドレスで import すらできない）。それでも次元・ポータル・ドラゴンの追加は
 * 必ずここを通る。だから中身は見られなくても、**大きさと形は数で押さえる。**
 *
 * 上限に当たったら「上限を上げる」のではなく、**判断を別ファイルへ出すこと。**
 * このプロジェクトの背骨（`CLAUDE.md` の「確かめられないものは、確かめられるものから
 * 切り離す」）がそのまま効いて、出した先はヘッドレスで検証できるようになる。
 */
function mainStaysWiring(): void {
  const raw = readFileSync("src/main.ts", "utf8");
  const lines = raw.split("\n").length;

  // 現在 1264 行。次元・ポータル・ドラゴンの配線ぶんの余地は残しつつ、
  // 判断を書き始めたら必ず当たる高さにしてある。
  const LIMIT = 1500;
  console.log(`      main.ts ${lines} 行 / 上限 ${LIMIT}`);
  check(
    "main.ts が配線の大きさに収まっている",
    lines <= LIMIT,
    lines > LIMIT ? "判断を別ファイルへ出すこと（上限を上げないこと）" : "",
  );

  // 次元ごとの分岐を散らさない。切り替えは `dimensions.ts` の 1 か所に集め、
  // `main.ts` は「どの次元か」を渡すだけにする。**散らすと、次元を足すたびに
  // 見落とした分岐が 1 つずつ残る**（かまどの `syncLit` と同じ罠が全機能に掛かる）。
  // 語は `===` の**どちら側にも**来る（`dim === "nether"` と `NETHER === dim`）ので
  // 両向きを見る。片側だけにすると、いちばんありそうな書き方をまるごと見逃す。
  const source = stripComments(raw);
  const branches = [
    ...source.matchAll(
      /\b(?:nether|end|overworld)\b\s*(?:===|!==)|(?:===|!==)\s*["'`]?(?:nether|end|overworld)\b/gi,
    ),
  ].length;
  const BRANCH_LIMIT = 2;
  check(
    "main.ts に次元の分岐を散らしていない",
    branches <= BRANCH_LIMIT,
    `${branches} 件 / 上限 ${BRANCH_LIMIT}`,
  );

  // 出した判断を**呼び直していること**を見張る。行数の上限だけでは
  // 「出したのに `main.ts` にも書き戻した」を止められない（両方あっても行は増えない）。
  // ここに並ぶのは、どれも**出した先にテストがある**もの。
  const routed: [string, string][] = [
    ["F3 の組み立て", "debugText("],
    ["セーブの組み立て", "buildSave("],
    ["読んだ値の均し", "restoredValues("],
    ["空とフォグ", "environmentFor("],
    ["次元ごとの空", "setDimension("],
    ["足音・着地・水しぶき", "footsteps.update("],
    ["バケツ", "tryBucket("],
    ["食べ進み", "eating.advance("],
    ["まとめ捨ての判定", "bulkDiscard("],
    // リスポーンで**どの次元へ戻るか**。`main.ts` が自分で決め始めると、
    // ネザーで死んだ人が天井の岩盤の上に湧く形（2-4c）に戻る。
    ["リスポーンで戻る次元", "respawnDimension("],
    ["リスポーンの行き先", "respawnPlan("],
    // 投げたエンダーアイが**どちらを向くか**。`main.ts` が自分で要塞を探し始めると、
    // 建てる側（`structures.ts` の器）と食い違っても掘るまで気付けない。
    ["エンダーアイの向き", "eyeShot("],
    // 枠にアイを嵌める／揃ったら起動する。`main.ts` が輪を数え始めると、
    // **地下 18 マスの部屋を掘り当てるまで確かめられない**場所に判断が戻る。
    ["エンドポータルの起動", "fitEye("],
    ["エンドポータルの文言", "eyeMessage("],
    // 飛び道具が当たったマスを砕くかどうか。`main.ts` が `=== END_CRYSTAL` を
    // 書き始めると、**柱の上（y60〜87）まで登らないと確かめられない**場所に判断が戻る。
    ["クリスタルを砕く", "shatterCrystal("],
    // 砕いた弾はその場から消すこと。矢は本来ブロックに刺さって止まるので、
    // 消さないと**砕けた相手だけが消えて、矢が空中に浮いたまま残る**
    // （柱の上なので、下から見上げるまで気付けない）。
    ["砕いた弾を消す", "projectiles.remove("],
    // 弓の引き。`main.ts` が自分で秒数を数え始めると、中断する条件（手が変わった・
    // 矢が尽きた）が器を足すたびに 1 つずつ抜ける（食べかけで通った道）。
    ["弓の引き", "drawing.advance("],
    ["弓を放つ", "drawing.release("],
  ];
  const inlined = routed.filter(([, call]) => !source.includes(call));
  check(
    "main.ts は出した判断を呼び直している",
    inlined.length === 0,
    inlined.map(([name]) => name).join(" / "),
  );

  // **何が落ちるかは `items.ts` の `rollDrop()`** で、`main.ts` は乱数を 1 個渡すだけ。
  // ここに確率の比較を書くと、砂利のように「外したら別のものが落ちる」を足したときに、
  // 掘った経路と支えを失った経路で規則が食い違う（片方だけ直しても気付けない）。
  const chances = [...source.matchAll(/\.chance\b/g)].length;
  check("main.ts が落ちる確率を自分で判定していない", chances === 0, `${chances} 件`);

  // 新しい `*render.ts` には、必ず対のガードを同時に足すこと
  // （判断が漏れていないかを見張る側。`test/mobs.test.ts` / `test/drops.test.ts` が手本）。
  const renderers = readdirSync("src").filter((n) => n.endsWith("render.ts"));
  const guarded = renderers.filter((name) =>
    readdirSync("test")
      .filter((t) => t.endsWith(".test.ts"))
      .some((t) => readFileSync(`test/${t}`, "utf8").includes(`src/${name}`)),
  );
  console.log(`      描画側のファイル ${renderers.length} 件 / 見張られている ${guarded.length} 件`);
  check(
    "すべての *render.ts に見張りのテストがある",
    guarded.length === renderers.length,
    renderers.filter((n) => !guarded.includes(n)).join(" "),
  );
}

/** コメントを落としてから語を探す（`test/mobs.test.ts` と同じ作法）。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
