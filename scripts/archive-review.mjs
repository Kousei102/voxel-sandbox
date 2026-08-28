/**
 * 直した不具合（`REVIEW.md` の `[x]`）を `docs/tasks-done.md` の末尾へ移す。
 *
 *     npm run archive
 *
 * **これがスクリプトなのは、退避先を誰にも読ませないため。**
 * 移す作業をループ（＝モデル）にやらせると、`docs/tasks-done.md` を丸ごと開いて
 * 末尾を探すことになり、**毎周 700 行ぶんの代金を払う**ことになる。
 * 追記（`appendFileSync`）は読み込みを必要としないので、ここは 1 バイトも読まない
 * （読むのは末尾 4KB だけ。見出しを 2 回足さないための確認）。
 *
 * `[ ]`（未着手）と `[!]`（直せない）は動かさない。**移すのは `[x]` だけ。**
 */

import { appendFileSync, openSync, readFileSync, readSync, closeSync, statSync, writeFileSync } from "node:fs";

const REVIEW = "REVIEW.md";
const ARCHIVE = "docs/tasks-done.md";

/** ここから下が不具合の並び。この行より上（書き方の見本）は触らない。 */
const MARKER = "# 見つかった不具合";

/** 退避先で不具合をまとめる見出し。**1 回だけ足す。** */
const ARCHIVE_HEADING = "# 直した不具合（`REVIEW.md` から移したもの）";

/**
 * 退避先の末尾だけを読む。**丸ごと読まないこと** —— このスクリプトの存在理由が
 * 「あのファイルを開かない」なので、全部読むならループにやらせるのと変わらない。
 */
function tailOf(path, bytes = 4096) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return null; // まだ無い
  }
  const start = Math.max(0, size - bytes);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

const all = readFileSync(REVIEW, "utf8").split("\n");

// **目印は「行そのもの」で探すこと。** `indexOf` で生の文字列を探すと、
// 書き方の説明に出てくる**言及**（「`## 見つかった不具合` の下」）に当たって、
// 見本のコードブロックと「直すとき」「遊ぶとき」まで不具合として拾う（実際に踏んだ）。
const markerLine = all.findIndex((line) => line.trimEnd() === MARKER);
if (markerLine < 0) {
  console.error(`${REVIEW} に「${MARKER}」だけの行がありません。`);
  process.exit(1);
}

// 見本のコードブロックを避けるため、**目印より下だけ**を切り分ける。
const head = all.slice(0, markerLine);
const lines = all.slice(markerLine);

// `## ` で始まる行で節に割る（`### ` の小見出しは節の中に残る）。
const starts = [];
for (let i = 0; i < lines.length; i++) {
  if (/^## /.test(lines[i])) starts.push(i);
}

const kept = [];
const moved = [];
for (let s = 0; s < starts.length; s++) {
  const from = starts[s];
  const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
  const section = lines.slice(from, to);
  (/^## \[x\]/.test(lines[from]) ? moved : kept).push(section);
}

if (moved.length === 0) {
  console.log("直した不具合（[x]）はありません。何も動かしていません。");
  process.exit(0);
}

// --- 退避先へ追記 ---------------------------------------------------------
const tail = tailOf(ARCHIVE);
const needsHeading = tail === null || !tail.includes(ARCHIVE_HEADING);
const stamp = new Date().toISOString().slice(0, 10);
const chunks = moved.map((section) => `${section.join("\n").trimEnd()}\n\n*（${stamp} に \`REVIEW.md\` から移動）*\n`);
appendFileSync(ARCHIVE, `${needsHeading ? `\n---\n\n${ARCHIVE_HEADING}\n` : ""}\n${chunks.join("\n")}`, "utf8");

// --- REVIEW.md から消す ---------------------------------------------------
const before = lines.slice(0, starts.length ? starts[0] : lines.length);
const rest = kept.map((section) => section.join("\n").trimEnd()).join("\n\n");
const head2 = head.length ? `${head.join("\n").trimEnd()}\n\n` : "";
writeFileSync(REVIEW, `${head2}${before.join("\n").trimEnd()}\n\n${rest}${rest ? "\n" : ""}`, "utf8");

for (const section of moved) console.log(`移した: ${section[0].replace(/^## \[x\]\s*/, "")}`);
console.log(`${moved.length} 件を ${ARCHIVE} の末尾へ。${REVIEW} に残り ${kept.length} 件。`);
