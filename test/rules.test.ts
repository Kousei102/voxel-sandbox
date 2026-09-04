import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { check, describe } from "./harness";

/**
 * 決まりごと（層 2・`rules/*.md`）が引ける形を保っているか。
 *
 * **2026-09-04 に `.claude/rules/` から出しました。** 前は `paths` に当たるファイルを
 * `Read` / `Edit` した瞬間に Claude Code が自動で読み込んでいましたが、`.claude/**` は
 * 書き込みに確認が出る場所で、**答える人が居ない無人の周がそこで止まります**。
 * 迂回用のスクリプトを置いても**使われた回数は 0 回**で、残ったのは手順の複雑さと、
 * リポジトリの外にある定期実行のプロンプトとの食い違いだけでした（AUTODEV 19 の `HANDOFF.md`）。
 *
 * **引き換えに自動読み込みを捨てているので、代わりがここです。**
 * 周は `grep -l '"src/player.ts"' rules/*.md` で引いて読みます。引けなくなる壊れ方
 * （`paths` が無い・宛先が消えている・一覧に載っていない）は**黙って効かなくなる**ので、
 * 自動読み込みと違って**テストで赤くできる形にしてあります。**
 */
const DIR = "rules";
const INDEX = `${DIR}/README.md`;

/** `paths:` の下の `  - "src/foo.ts"` を拾う。フロントマター（最初の `---` 対）の中だけ。 */
function frontmatterPaths(text: string): string[] {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return [];
  const end = lines.indexOf("---", 1);
  if (end < 0) return [];
  const out: string[] = [];
  let inPaths = false;
  for (const line of lines.slice(1, end)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!/^\s/.test(line)) inPaths = false;
    const hit = inPaths ? line.match(/^\s*-\s*"([^"]+)"\s*$/) : null;
    if (hit) out.push(hit[1]);
  }
  return out;
}

/** `paths` の宛先を突き合わせる相手。リポジトリの中で決まりごとが掛かりうるものだけ。 */
function repoFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["src", "test", "tools"]) {
    for (const name of readdirSync(dir, { recursive: true }) as string[]) {
      const path = `${dir}/${name.split("\\").join("/")}`;
      if (statSync(path).isFile()) out.push(path);
    }
  }
  for (const name of readdirSync(".")) {
    if (statSync(name).isFile()) out.push(name);
  }
  return out;
}

/** `test/**\/*.ts` のような glob を 1 本の正規表現に。`**` はディレクトリをまたぐ。 */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*" && glob[i + 2] === "/") {
      source += "(?:.*/)?";
      i += 2;
    } else if (c === "*") {
      source += "[^/]*";
    } else {
      source += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** `rules/README.md` の表の 1 列目（`| \`mobs.md\` | … |`）。 */
function indexed(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const hit = line.match(/^\|\s*`([\w.-]+\.md)`\s*\|/);
    if (hit) out.push(hit[1]);
  }
  return out;
}

export function run(): void {
  describe("決まりごと（層 2・rules/）");

  const files = readdirSync(DIR).filter((name) => name.endsWith(".md") && name !== "README.md").sort();
  console.log(`      rules/ に ${files.length} 本（README.md を除く）`);
  check("決まりごとが 1 本以上ある", files.length > 0, files.length ? "" : "移動や退避で丸ごと消えていないか");

  // --- 1. `paths` があるか（無いと grep で引けない = 誰にも読まれない） ---
  const noPaths = files.filter((name) => frontmatterPaths(readFileSync(`${DIR}/${name}`, "utf8")).length === 0);
  check(
    "すべての決まりごとに `paths` がある",
    noPaths.length === 0,
    noPaths.length ? `${noPaths.join(" / ")} —— 先頭に paths を書くこと（無いと引けません）` : "",
  );

  // --- 2. `paths` の宛先が実在するか（ファイルを消す・名前を変えると静かに外れる） ---
  const all = repoFiles();
  const dangling: string[] = [];
  let entries = 0;
  for (const name of files) {
    for (const path of frontmatterPaths(readFileSync(`${DIR}/${name}`, "utf8"))) {
      entries++;
      const hit = path.includes("*")
        ? all.some((file) => globToRegExp(path).test(file))
        : existsSync(path);
      if (!hit) dangling.push(`${name} の ${path}`);
    }
  }
  console.log(`      paths の宛先 ${entries} 件`);
  check("`paths` の宛先はすべて実在する", dangling.length === 0, dangling.join(" / "));

  // --- 3. 一覧（`rules/README.md`）と実ファイルが一致するか ---
  // 一覧に無いものは、周が「どれを読むか」を決めるときに目に入りません。
  const listed = indexed(readFileSync(INDEX, "utf8")).sort();
  const missing = files.filter((name) => !listed.includes(name));
  const extra = listed.filter((name) => !files.includes(name));
  console.log(`      rules/README.md の一覧 ${listed.length} 行`);
  check("一覧に載っていない決まりごとが無い", missing.length === 0, missing.join(" / "));
  check("一覧が実在しないものを指していない", extra.length === 0, extra.join(" / "));

  // --- 4. `rules/<名前>.md` と書いた参照が実在するか ---
  // 名前を変えたときに、案内している側だけが古く残る（読む人は「無い」ことに気付けない）。
  const readers = ["CLAUDE.md", "LOOP.md", "AUTODEV.md", INDEX, ...files.map((name) => `${DIR}/${name}`)];
  const broken: string[] = [];
  for (const file of readers) {
    for (const match of readFileSync(file, "utf8").matchAll(/`(rules\/[\w.-]+\.md)`/g)) {
      if (!existsSync(match[1])) broken.push(`${file} の ${match[1]}`);
    }
  }
  check("`rules/…` への参照はすべて実在する", broken.length === 0, broken.join(" / "));

  // --- 5. 古い置き場（`.claude/rules/`）が復活していないか ---
  // 戻すと**書き込みに確認が出て無人の周が止まり**、しかも 2 か所に分かれます。
  // 上の「自動で読まれる」に頼った文言も一緒に戻ってくるので、置き場所ごと見張ります。
  const revived = existsSync(".claude/rules");
  check(
    ".claude/rules/ が復活していない",
    !revived,
    revived ? "層 2 は rules/（`.claude/` の外）。戻すと無人の周が書き込みで止まります" : "",
  );
  // `rules/README.md` だけは除きます —— **なぜ出したか**を書くのに古い名前が要ります。
  const stale = readers.filter(
    (file) => file !== INDEX && readFileSync(file, "utf8").includes(".claude/rules/"),
  );
  check(
    "古い置き場を指した案内が残っていない",
    stale.length === 0,
    stale.length ? `${stale.join(" / ")} —— rules/ へ直すこと` : "",
  );

  // --- 6. 層 2 が `RULES-INBOX.md` へ書き置かれていないか ---
  //
  // **これは「決まりごとの本文を次の周に当てさせる」形をここで止めるためのものです。**
  // 受け渡しを 1 周空けると本文どうしが食い違い、取り込む側が毎回それを捌くことになります
  // （5 周ぶんの実例が `docs/rules-inbox-archive.md`）。`RULES-INBOX.md` が要るのは
  // **`.claude/skills/**` だけ** —— あそこは書き込みに確認が出て無人の周が止まるからで、
  // `rules/` は `.claude/` の外なので**その周が自分で `Edit` して据えられます。**
  //
  // **リポジトリの外にある定期実行のプロンプトが古いと、ここへ戻ってきます**（2026-09-04 に
  // 2 度: AUTODEV 19 は書き置き、AUTODEV 20 は据えたうえで食い違いを報告）。
  // **書いた周がその場で気付けるのはここだけ**です（`HANDOFF.md` は人が読むまで誰も見ない）。
  const inbox = readFileSync("RULES-INBOX.md", "utf8").split("\n");
  const misrouted = inbox.filter(
    (line) => /^##\s/.test(line) && (line.includes("rules/") || files.some((name) => line.includes(name))),
  );
  check(
    "RULES-INBOX.md に層 2 が書き置かれていない",
    misrouted.length === 0,
    misrouted.length
      ? `${misrouted.map((line) => line.trim()).join(" / ")} —— 決まりごとは rules/ を Edit で直すこと（ここはスキル専用）`
      : "",
  );
}
