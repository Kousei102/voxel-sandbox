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
}
