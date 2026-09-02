/**
 * **本物のブラウザでゲームを開いて PNG を撮る**（`node tools/browsershot.mjs`）。
 *
 * ------------------------------------------------------------------------
 * **このスクリプトが動くのは Claude Code のクラウドのサンドボックスだけです。**
 * 手元の devcontainer にはブラウザが入っていないので動きません
 * （`CLAUDE.md` の「この環境では WebGL が動かない」はそちらの話）。
 * クラウド側では 2026-09-02 に実測して動きました:
 *   - Chromium 141.0.7390.37 が `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
 *   - playwright が `/opt/node22/lib/node_modules/playwright`
 *   - GPU は無い（`/dev/dri` が無い）ので SwiftShader のソフト描画。**遅い**
 * **パスは決め打ちにしないこと。** イメージが Chromium を上げると `chromium-1194` が
 * 別の番号になるので、`/opt/pw-browsers` を**探して新しいものを採ります**。
 * 見つからなければ**落ちずに `npm run shot` を案内して終わります**（`AUTODEV.md` の C-3。
 * **そこで Playwright を入れにいかないこと**）。環境変数で名指しもできます
 * （`PW_MODULE` / `CHROME_BIN`）。
 * ------------------------------------------------------------------------
 *
 * ```
 * npm run build                       # dist/ を作っておくこと
 * npx http-server dist -p 8080 --silent &
 * node tools/browsershot.mjs          # docs/browser-shots/*.png
 * node tools/browsershot.mjs --wait 30 --out /tmp/shots
 * ```
 *
 * **「撮れた」だけでは足りません。真っ黒な PNG も PNG です。** だから撮った絵を
 * その場で読み直して、**色数と上下の代表色**を出します（`analyze()`）。
 * ページの `console` のエラーと例外、`gl.getError()` も拾って最後に並べます。
 *
 * **`npm run shot`（`tools/raster.ts`）の絵と明るさが揃っています。** 揃ったのは
 * この道具のおかげです —— 突き合わせたら CPU 側だけ **sRGB の伝達関数 1 回ぶん暗く**
 * （草の上面が rgb(37,100,20) 対 rgb(106,168,79)）、`raster.ts` に `srgb()` を入れて直しました。
 * いまは地面の代表色が両方とも rgb(106,168,79) / rgb(94,156,65) で一致します。
 * **直った状態を `test/shot.test.ts` が画素の値で見張っています**（正面 239 / 上面 255 /
 * 底面 188 / 半透明 119）。**ここが食い違ったらまず `raster.ts` を疑うこと。**
 * **空だけは一致しません**（ブラウザは `sky.ts` の天球 GLSL、CPU は `daynight.ts` の
 * 2 色の勾配で、そもそも別経路）。詳しくは `docs/browser-shots/README.md`。
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

/** ブラウザが見つからなかったときに出す道案内。**入れにいかせないこと。** */
const FALLBACK = [
  "**ここで Playwright を入れにいかないこと**（`AUTODEV.md` の C-3）。",
  "代わりに `npm run shot -- mobs terrain` で撮ってください（GPU もブラウザも要りません）。",
  "名指しするなら PW_MODULE / CHROME_BIN に渡せます。",
].join("\n  ");

const PW_CANDIDATES = [
  process.env.PW_MODULE,
  "/opt/node22/lib/node_modules/playwright/index.mjs",
  "playwright", // 入っていれば普通に解決させる（node_modules / NODE_PATH）
];

const CHROME_ROOTS = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  "/opt/pw-browsers",
  `${process.env.HOME ?? "/root"}/.cache/ms-playwright`,
];

/**
 * Chromium の実体を探す。**ビルド番号を決め打ちしないこと** ——
 * イメージが上がると `chromium-1194` は消えます。番号の大きいものから採り、
 * 1 つも無ければ `undefined` を返して**playwright 自身に探させます**。
 */
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const root of CHROME_ROOTS) {
    if (!root || !existsSync(root)) continue;
    const builds = readdirSync(root)
      .filter((d) => d.startsWith("chromium-")) // chromium_headless_shell-* は除く
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const build of builds) {
      const bin = `${root}/${build}/chrome-linux/chrome`;
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

async function loadChromium() {
  for (const spec of PW_CANDIDATES) {
    if (!spec) continue;
    if (spec.startsWith("/") && !existsSync(spec)) continue;
    try {
      return (await import(spec)).chromium;
    } catch {
      // 次の候補へ。**ここで諦めないこと**（1 つ目は環境変数で、3 つ目は無いのが普通）
    }
  }
  return undefined;
}

function parse(argv) {
  const opt = { url: "http://127.0.0.1:8080/", out: "docs/browser-shots", seed: "4242", wait: 30, width: 960, height: 600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") opt.url = argv[++i];
    else if (a === "--out") opt.out = argv[++i];
    else if (a === "--seed") opt.seed = argv[++i];
    else if (a === "--wait") opt.wait = Number(argv[++i]);
    else if (a === "--size") {
      const [w, h] = argv[++i].split("x");
      opt.width = Number(w);
      opt.height = Number(h);
    } else throw new Error(`知らない指定: ${a}`);
  }
  return opt;
}

/**
 * 撮った PNG を**ページの中で**読み直して、色数と代表色を出す。
 * node 側に PNG のデコーダを足したくないので、ブラウザの `createImageBitmap` に任せる
 * （`tools/raster.ts` の `encodePng` は書き出し専用で、読み込みは持っていない）。
 */
async function analyze(page, buffer) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    const seen = new Set();
    // 上 15% を「空」、下 15% を「地面」の代表として平均する。
    const band = (y0, y1) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < bmp.width; x++) {
          const i = (y * bmp.width + x) * 4;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
      }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return {
      width: bmp.width,
      height: bmp.height,
      colors: seen.size,
      top: band(0, Math.max(1, Math.floor(bmp.height * 0.15))),
      bottom: band(Math.floor(bmp.height * 0.85), bmp.height),
    };
  }, buffer.toString("base64"));
}

const opt = parse(process.argv.slice(2));
const chromium = await loadChromium();
if (!chromium) {
  console.error(`playwright が見つかりません（探した先: ${PW_CANDIDATES.filter(Boolean).join(" / ")}）。\n  ${FALLBACK}`);
  process.exit(1);
}
mkdirSync(opt.out, { recursive: true });

const errors = [];
const shots = [];
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const chromeBin = findChrome();
console.log(`Chromium: ${chromeBin ?? "playwright の既定"}`);
let browser;
try {
  browser = await chromium.launch({ executablePath: chromeBin, args: ["--no-sandbox"] });
} catch (e) {
  console.error(`Chromium を起動できません（${chromeBin ?? "playwright の既定"}）: ${e.message}\n  ${FALLBACK}`);
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: opt.width, height: opt.height } });
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[console.${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

async function shot(name, target) {
  const buffer = await (target ? page.locator(target) : page).screenshot();
  const path = `${opt.out}/${name}.png`;
  writeFileSync(path, buffer);
  const a = await analyze(page, buffer);
  shots.push({ name, path, bytes: buffer.length, ...a });
  console.log(
    `${at()}  ${path}  ${buffer.length} バイト  ${a.width}x${a.height}  ` +
      `色 ${a.colors} 種  上 rgb(${a.top})  下 rgb(${a.bottom})`,
  );
  if (a.colors <= 1) console.log("  ※ 単一色。描けていない");
}

try {
  await page.goto(opt.url, { waitUntil: "load" });
  await page.waitForSelector("#menu", { state: "visible" });

  // **種を揃える**（`npm run shot` と同じ 4242 を見るため）。撮るのは入れたあと。
  await page.fill("#seed", opt.seed);
  await page.click("#regen");
  await shot("menu");
  await page.click("#play");

  // ポインタロックが掛かってはじめて `playing` になり、HUD の `hidden` が外れる。
  // ヘッドレスでは掛からないことがあるので、そのときは JS で `playing` を立てる。
  let locked = await page
    .waitForFunction(() => document.pointerLockElement === document.getElementById("viewport"), { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (!locked) {
    console.log(`${at()}  ポインタロックが掛からなかった → JS で playing を立てる（本番の証拠にはならない）`);
    await page.evaluate(() => {
      const canvas = document.getElementById("viewport");
      Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => canvas });
      document.dispatchEvent(new Event("pointerlockchange"));
    });
  }

  // **チャンクは少しずつ読み込まれる。** `#loading` が消えるまで待って、さらに数秒置く。
  const drawn = Date.now();
  await page
    .waitForFunction(() => !document.getElementById("loading").classList.contains("on"), { timeout: opt.wait * 1000 })
    .catch(() => console.log(`${at()}  #loading が ${opt.wait} 秒で消えなかった（そのまま撮る）`));
  console.log(`${at()}  地形の読み込みが落ち着くまで ${((Date.now() - drawn) / 1000).toFixed(1)}s`);
  await page.waitForTimeout(3000);

  // `#viewport` の要素撮りは**上に載っている DOM も一緒に写る**（Playwright は
  // ページの絵を要素の枠で切るだけ）。地形だけを見たいので、いったん HUD を退ける。
  const show = (on) =>
    page.evaluate((on) => {
      for (const id of ["hud", "crosshair"]) document.getElementById(id).classList.toggle("hidden", !on);
    }, on);
  const debugOn = (on) =>
    page.evaluate((on) => (document.getElementById("debug").style.display = on ? "" : "none"), on);

  await show(false);
  await shot("game", "#viewport");
  // HUD 全体（体力・空腹・ホットバー・十字）。**F3 の文字は消して**、次の 1 枚に譲る。
  await show(true);
  await debugOn(false);
  await shot("hud");
  // `#debug` は既定で見えている（F3 は「消す」側）。
  await debugOn(true);
  await shot("debug");
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#inventory:not(.hidden)", { timeout: 5000 }).catch(() => {});
  // **オートセーブの通知（`#status`）がパネル末尾の説明文にまともに重なる**
  // （`#status` は `bottom: 118px` 固定で、960x600 だと帯が y 452〜482 に来る）。
  // 15 秒ごとに 3 秒出るので、消えている隙を待ってから撮る。`REVIEW.md` に積んである。
  await page
    .waitForFunction(() => !document.getElementById("status").classList.contains("on"), { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  await shot("inventory");
  await page.keyboard.press("KeyE");

  const gl = await page.evaluate(() => {
    const ctx = document.getElementById("viewport").getContext("webgl2");
    if (!ctx) return { ok: false };
    return { ok: true, error: ctx.getError(), version: ctx.getParameter(ctx.VERSION), renderer: ctx.getParameter(ctx.RENDERER) };
  });
  console.log(`${at()}  WebGL: ${JSON.stringify(gl)}`);
  console.log(`${at()}  ポインタロック: ${locked ? "効いた" : "効かなかった（HUD は JS で出した）"}`);
  console.log(errors.length === 0 ? "console のエラー・例外: なし" : `console のエラー・例外:\n  ${errors.join("\n  ")}`);
} finally {
  await browser.close();
}
