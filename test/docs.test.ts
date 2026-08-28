import { existsSync, readFileSync } from "node:fs";
import { check, describe } from "./harness";

/**
 * 毎周読まれる文書が肥大しないように押さえる。
 *
 * **`main.ts` の 1500 行と同じ扱い**（`test/ui.test.ts`）。上限に当たったら
 * **上限を上げるのではなく、済んだぶんを `docs/` へ退避すること。**
 *
 * ここを見張らないと何が起きるかは実測済み: ループを回すうちに
 * `TASKS.md` が 762 行・`REVIEW.md` が 627 行まで育ち、**その 9 割が
 * 「終わったことの記録」**でした。ループは毎周それを読まされます。
 *
 * `TUNING.md` は対象外です。あれは**ユーザーが遊びながら埋めていく表**で、
 * ループが読むものではありません（`LOOP.md` の 3.5 は「1 行足す」だけ）。
 */
const LIMITS: Array<[string, number, string]> = [
  ["CLAUDE.md", 200, "領域別の話は `.claude/rules/` へ（`paths` を書くこと）"],
  ["LOOP.md", 200, "恒久的な決まりごとは `CLAUDE.md` か `.claude/rules/` へ"],
  ["TASKS.md", 150, "`[x]` の本文を `docs/tasks-done.md` へ移し、1 行だけ残すこと"],
  ["REVIEW.md", 200, "直した節が溜まったら `docs/review-archive.md` へ移すこと"],
];

// 退避先。ここは読まれないので大きさを見ない。
const ARCHIVES = ["docs/tasks-done.md", "docs/review-archive.md"];

export function run(): void {
  describe("毎周読まれる文書の大きさ");

  for (const [file, limit, advice] of LIMITS) {
    const lines = readFileSync(file, "utf8").split("\n").length;
    console.log(`      ${file} ${lines} 行 / 上限 ${limit}`);
    check(`${file} が上限に収まっている`, lines <= limit, lines > limit ? advice : "");
  }

  // 退避先を消す／名前を変えると、上の 4 つから「本文はあっち」と指した先が消える。
  // 中身は誰も読まないので、消えたことに気付く機会がここしかない。
  for (const file of ARCHIVES) {
    const there = existsSync(file);
    const lines = there ? readFileSync(file, "utf8").split("\n").length : 0;
    console.log(`      ${file} ${there ? `${lines} 行（退避先）` : "見つからない"}`);
    check(`${file} がある`, there, there ? "" : "退避先を消さないこと（参照が宙に浮きます）");
  }

  // **直した不具合を `REVIEW.md` に残さないこと。** 移すのは `npm run archive` の
  // 仕事で（`scripts/archive-review.mjs`）、忘れるとここが溜まって上限に当たる。
  // **`[ ]`（未着手）と `[!]`（直せない）は残ってよい** —— 動かすのは `[x]` だけ。
  //
  // **見本のコードブロックを数えないこと。** 「## 見つかった不具合」だけの行より下が
  // 本物の並びで、それより上は書き方の説明（`## [ ] ネザーから戻ると…` という見本が
  // 置いてある）。生の `indexOf` で目印を探すと**説明文中の言及**に当たるので、
  // ここもスクリプトと同じく**行そのもの**で探す（実際に踏んだ）。
  const review = readFileSync("REVIEW.md", "utf8").split("\n");
  const at = review.findIndex((line) => line.trimEnd() === "# 見つかった不具合");
  const listed = at < 0 ? [] : review.slice(at).filter((line) => /^## \[/.test(line));
  const done = listed.filter((line) => /^## \[x\]/.test(line));
  console.log(`      REVIEW.md の不具合 ${listed.length} 件（うち直した [x] ${done.length} 件）`);
  check("目印の行がある（`npm run archive` の足場）", at >= 0, at < 0 ? "「# 見つかった不具合」だけの行" : "");
  check(
    "直した不具合は REVIEW.md に残っていない",
    done.length === 0,
    done.length ? "`npm run archive` を走らせること" : "",
  );

  // 「本文は docs/… にある」と書いた先が実在するか。
  // 退避のときに綴りを間違えても、読む人が居ないので誰も気付けない。
  const missing: string[] = [];
  for (const [file] of LIMITS) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/`(docs\/[\w./-]+\.md)`/g)) {
      if (!existsSync(match[1])) missing.push(`${file} の ${match[1]}`);
    }
  }
  check("docs/ への参照はすべて実在する", missing.length === 0, missing.join(" / "));
}
