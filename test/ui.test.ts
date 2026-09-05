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

  // 通知の帯（`#status`）は `bottom: 118px` 固定で、これは**ホットバーと体力の段**に
  // 合わせた値。パネルはどれも画面の真ん中に組み上がるので、開いているあいだは
  // 上へ逃がさないと下端とぶつかる（メニューのモード行が丸ごと隠れていた）。
  // **ブラウザを開くまで気付けない**ので、規則があることだけここで押さえる。
  const raised = css.match(/#status\.panelopen\s*\{([^}]*)\}/)?.[1] ?? "";
  check("画面が開いているあいだの通知の位置が決めてある", raised !== "", raised.trim());
  // `top` だけ足して `bottom` を残すと、上下とも指定した形になって帯が縦に伸びる。
  check("そのとき bottom を外している", /bottom:\s*auto/.test(raised), raised.trim());
  const ui = readFileSync("src/ui.ts", "utf8");
  check("その付け外しが配線されている", ui.includes('"panelopen"'), "ui.ts の setPlaying");

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
    // 読んだ値の均し（`restoredValues()`）と**戻す順番**（盤面の預かり物はインベントリの
    // あとで返す）。`main.ts` に並べ直すと、順番が崩れても**開いたままタブを閉じた人**
    // にしか出ない形で壊れる（`test/session.test.ts` が中身を見ている）。
    ["読んだ値の均しと戻す順", "applyRestore("],
    // 別のワールドを始めるときの後始末。**忘れると、前のワールドで別の次元に置いてきた
    // ものが新しいワールドに出てくる**（`main.ts` に器の列を書き戻すと、器を足すたびに
    // 1 つずつ抜ける）。
    ["新しいワールドの後始末", "forgetWorld("],
    ["保存データを消すときの後始末", "forgetEverything("],
    ["打ち込まれた種の読み方", "parseSeed("],
    // キー・マウスの振り分け（`use.ts` の右クリックと同じ形）。**`main.ts` に `if` の列を
    // 書き戻すと、画面が開いている間に歩き出す・目の前のモブを殴れない、が戻る。**
    ["キーの振り分け", "decideKey("],
    ["クリックの振り分け", "decideClick("],
    // 壊したときに何が落ちるか。**掘った経路と支えを失った経路の 2 つ**を同じ規則に
    // 通すため（`test/breaking.test.ts` が両方を並べて見ている）。
    ["掘って壊したとき", "tryBreak("],
    ["支えを失って壊れたとき", "autoBreak("],
    ["空とフォグ", "environmentFor("],
    ["次元ごとの空", "setDimension("],
    ["足音・着地・水しぶき", "footsteps.update("],
    ["バケツ", "tryBucket("],
    // 種をどこに植えられるか。**`main.ts` が「耕地の上だけ」を書き始めると、
    // 置ける／置けないの規則が `placing.ts` と 2 か所に分かれる**（`tryTill()` と同じ）。
    ["苗を植える", "tryPlant("],
    // 苗が育つところ。**`main.ts` が秒数を数え始めると、育つ条件（下が耕地か・列が
    // 読み込まれているか）が `crops.ts` と二重管理になる**（`test/crops.test.ts` が
    // `main.ts` に `GROW_SECONDS` も 180 も無いことを見ている）。
    ["苗が育つ", "crops.update("],
    ["植えたら覚える", "crops.plant("],
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
    // **呼び出しの側も見ること。** 判断を呼ぶ関数が `main.ts` にあるだけでは、
    // フレームから外しても・マウスから外しても緑のまま通る（実際に通った）。
    ["弓を毎フレーム引き進める", "updateDrawing(dt)"],
    ["離したら放つ", "loose();"],
    // 火種と弓が使って減るぶん。**`main.ts` が「弓は 384 回」と書き始めると、
    // 回数が `durability.ts` と二重管理になる**（掘る道具は `wearForBreaking()` に
    // 集めてあるので、使う側も 1 本に集める）。
    ["火種と弓の消耗", "wearForUse("],
    // 右クリックで何が起きるかの振り分け（11 通り）。**並び順そのものが判断**なので、
    // `main.ts` に `if` の列を書き戻すと、順番の食い違いが「枠を狙ってもアイが
    // 飛んでいく」形でしか出ない（枠は地下 18 マス）。
    ["右クリックの振り分け", "decideUse("],
    // **手前がモブかどうかは左クリックと同じ 1 本**（`controls.ts` の `mobIsNearer()`）を
    // 通して渡すこと。`main.ts` が右クリック用に距離の比較を書き直すと、殴れる間合いと
    // 刈れる間合いが食い違い、「殴れるのに刈れない羊」が現物を追うまで分からない。
    ["右クリックで呼ぶ", "useOrPlace(mobIsNearer("],
    // **どの次元にボスが居るか**は `mobs.ts` の表（`BOSSES`）。`main.ts` が
    // 「エンドならドラゴンを湧かせる」と書き始めると、次元の分岐がここに戻る。
    ["ボスを湧かせる", "mobs.ensureBoss("],
    // ドラゴンの回復のもと（生きているエンドクリスタル）を数えて渡すところ。
    // 外すと**倒せてしまう**ので、柱を落とす意味が黙って消える。
    ["回復のもとを数える", "liveCrystals("],
    // 倒した印（エンドの出口ポータル）。**`main.ts` が自分でブロックを置き始めると、
    // 「倒したのに帰れない」も「入り直したら湧き直す」も、エンドへ行って
    // ドラゴンを倒すまで確かめられない**場所に判断が戻る。
    ["倒した印を建てる", "syncExitPortal("],
    ["ボスを倒したか", "mobs.bossDefeated("],
    // 体力バー（いつ出す・いつ消す・何割か）とクリア画面（いつ出す・何と出す）。
    // **`main.ts` が割合を計算し始めると、ドラゴンを倒しに行くまで確かめられない
    // 場所に判断が戻る**（`deathMessage()` とまったく同じ理由）。
    ["体力バーの中身", "bossBarState("],
    ["いま居るボス", "mobs.activeBoss("],
    ["クリア画面の 1 行", "victoryMessage("],
    // **呼び出しの側も見ること**（2-12 / 2-12b で踏んだ偽陽性）。
    // 判断を呼ぶ式がファイルにあるだけでは、フレームから外しても緑のまま通る。
    //
    // **渡すものまで見ること。** ここに渡してよいのは `mobs.bossDefeated()`
    // （この読み込みのあいだの記憶）だけで、`syncExitPortal()` が返す
    // **ワールドの印**を渡すと、倒したあとエンドへ入り直すたびにクリア画面が出る
    // （`main.ts` はヘッドレスで import できないので、形で押さえるしかない）。
    ["倒したかどうかの出どころ", "const defeated = mobs.bossDefeated("],
    ["倒した瞬間を拾う", "victory.update(defeated)"],
    // クリア画面の裏でメインメニューを出さない（死亡画面の `vitals.dead` と同じ役目）。
    // 外しても型は通り、**ドラゴンを倒した人だけが**メニューの重なった画面を見る。
    ["クリア画面の裏にメニューを出さない", "!hud.victoryOpen"],
    // **ボスに渡すのは id（`dims.current`）で、表示名ではない。**
    // ここが `dims.displayNameOf(dims.current)` だったせいで、`BOSSES["エンド"]` が
    // undefined になり、**エンドに入ってもドラゴンが 1 体も湧かず、体力バーも
    // クリア画面も出ませんでした**（`DimensionId` は `string` なので型では止まらない）。
    ["ボスに渡す次元", "const dim = dims.current;"],
    // 食べ切ったあとに何が戻るか（器つきの食べ物）。**`main.ts` が
    // 「シチューならボウル」と書き始めると、器つきが増えるたびに分岐が 1 本ずつ生える。**
    ["食べ終わって戻る器", "emptyAfterEating("],
  ];
  const inlined = routed.filter(([, call]) => !source.includes(call));
  check(
    "main.ts は出した判断を呼び直している",
    inlined.length === 0,
    inlined.map(([name]) => name).join(" / "),
  );

  // **次元を引数に取る判断へ、画面に出す名前を渡さないこと。**
  // `DimensionId` は `string`（セーブに知らない次元名が入りうるため、狭められない）で、
  // 表を引くのも `Record<string, …>` なので、**取り違えても型では止まりません。**
  // 止まらないと何が起きるかは実測済み: `ensureBoss("エンド")` は黙って null を返し、
  // **エンドに入ってもドラゴンが湧かず、体力バーもクリア画面も出ません。**
  const byId = ["ensureBoss", "bossDefeated", "activeBoss", "bossName", "setDimension"];
  const misrouted: string[] = [];
  for (const fn of byId) {
    for (const call of source.matchAll(new RegExp(`\\b${fn}\\(([^)]*)\\)`, "g"))) {
      if (/displayName|\.name\b/.test(call[1])) misrouted.push(`${fn}(${call[1]})`);
    }
  }
  console.log(`      次元を id で受ける呼び出し ${byId.length} 種類を検査`);
  check("次元の判断には id を渡している（表示名でない）", misrouted.length === 0, misrouted.join(" / "));

  // **何が落ちるかは `items.ts` の `rollDrop()`** で、`main.ts` は乱数を 1 個渡すだけ。
  // ここに確率の比較を書くと、砂利のように「外したら別のものが落ちる」を足したときに、
  // 掘った経路と支えを失った経路で規則が食い違う（片方だけ直しても気付けない）。
  const chances = [...source.matchAll(/\.chance\b/g)].length;
  check("main.ts が落ちる確率を自分で判定していない", chances === 0, `${chances} 件`);

  // **食べ終わりに何が戻るかを決めるのは `items.ts` の表 1 本**（`EMPTIES`）。
  // ここにアイテムの名前が出てきたら、器つきの食べ物が増えるたびに
  // 「持てる側」と「戻す側」の 2 か所を直すことになり、必ず片方を忘れる
  // （`durability.ts` に `item === BOW` と書かないのとまったく同じ理由）。
  const vessels = ["BOWL", "MUSHROOM_STEW"].filter((word) => new RegExp(`\\b${word}\\b`).test(source));
  console.log(`      main.ts に器つきの食べ物の名前 ${vessels.length} 件`);
  check("main.ts に BOWL も MUSHROOM_STEW も書かれていない", vessels.length === 0, vessels.join(" "));

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
