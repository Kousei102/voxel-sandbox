import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, describe } from "./harness";

/**
 * 決まりごとの設置スクリプト（`scripts/install-rule.mjs`）の見張り。
 *
 * **これが無人の周から `.claude/rules/` を触る唯一の口**なので、口が広がっていないことを
 * 毎周確かめます。とくに `.claude/settings.json` とフックと `.claude/skills/**` に
 * 届かないこと —— ここが広がると、周が自分の許可設定を書き換えられるようになります。
 *
 * **本当に走らせて確かめること**（関数を import して呼ばない）。このスクリプトは
 * `import.meta.url` から置き場所を決めるので、テストに束ねると別のファイルになり、
 * **確かめたつもりのものと違うもの**を見ることになります。
 *
 * 本当に書く側は**一時ディレクトリ**でやります（`INSTALL_RULE_ROOT`）。
 * リポジトリの決まりごとを書き換えるテストにすると、落ちた周が汚れた木を残します。
 */

const CLI = "scripts/install-rule.mjs";

/** 決まりごとの形をした最小の本文。 */
function ruleText(body: string, paths: string[] = ['  - "src/example.ts"']): string {
  return ["---", "paths:", ...paths, "---", "", body, ""].join("\n");
}

function install(args: string[], root?: string): { code: number; out: string } {
  const result = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: root ? { ...process.env, INSTALL_RULE_ROOT: root } : process.env,
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}`.trim().split("\n").join(" / ") };
}

export function run(): void {
  describe("決まりごとの設置（scripts/install-rule.mjs）");

  // --- このスクリプトが動く条件 ------------------------------------------------
  // **許可行が消えると、無人の周は「sensitive file」ではなく Bash の確認で止まります**
  // （しかも実装もテストも全部終えたあとで、です）。ここで毎周見ておく。
  const settingsBefore = readFileSync(".claude/settings.json", "utf8");
  const allow: string[] = JSON.parse(settingsBefore)?.permissions?.allow ?? [];
  const needed = "Bash(node scripts/install-rule.mjs:*)";
  console.log(`      .claude/settings.json の許可: ${allow.join(" / ") || "（無し）"}`);
  check(`設置スクリプトの許可がある: ${needed}`, allow.includes(needed), allow.includes(needed) ? "" : "無人の周が層 2 を直せません");

  // --- 宛先の検査（本物のリポジトリで。**どれも書かないもの**）-----------------
  const refuse: Array<[string, string]> = [
    [".claude/settings.json", "許可設定"],
    [".claude/skills/add-block/SKILL.md", "層 3（スキル）"],
    [".claude/rules/../settings.json", "`..` で外へ出る形"],
    ["src/mobs.ts", "そもそも決まりごとではない場所"],
    [".claude/rules/MOBS.md", "決まりごとの名前の形ではない"],
    [".claude/rules/sub/mobs.md", "rules の直下ではない"],
    // **名前だけ正しい形**。ここは親を realpath で突き合わせる側が落とします。
    ["docs/mobs.md", "決まりごとの名前だが場所が違う"],
    [".claude/rules/../../docs/mobs.md", "`..` で rules の外へ出る（名前は正しい形）"],
  ];
  for (const [dest, why] of refuse) {
    const { code, out } = install([".claude/rules/mobs.md", dest]);
    console.log(`      ${dest} → 終了 ${code}: ${out}`);
    check(`宛先を断る: ${why}`, code === 1, code === 1 ? "" : "この宛先へ書けてしまいます");
  }
  const settingsAfter = readFileSync(".claude/settings.json", "utf8");
  check("許可設定が書き換わっていない", settingsAfter === settingsBefore, settingsAfter === settingsBefore ? "" : "断ったはずの宛先が通っています");

  // --- 同じ内容なら 1 バイトも書かない ----------------------------------------
  const before = readFileSync(".claude/rules/mobs.md", "utf8");
  const same = install([".claude/rules/mobs.md", ".claude/rules/mobs.md"]);
  console.log(`      同内容 → 終了 ${same.code}: ${same.out}`);
  check("同じ内容なら「変更なし」で終わる", same.code === 0 && same.out.includes("変更なし"));
  check("同じ内容の設置でファイルが変わらない", readFileSync(".claude/rules/mobs.md", "utf8") === before);

  // --- ここから一時ディレクトリ。**本当に書かせて確かめる** --------------------
  const root = mkdtempSync(join(tmpdir(), "install-rule-"));
  try {
    mkdirSync(join(root, ".claude/rules"), { recursive: true });
    const src = join(root, "new.md");

    writeFileSync(src, ruleText("最初の本文。"), "utf8");
    const created = install([src, join(root, ".claude/rules/example.md")], root);
    const dest = join(root, ".claude/rules/example.md");
    console.log(`      新規 → 終了 ${created.code}: ${created.out}`);
    check("新しい決まりごとを据えられる", created.code === 0 && existsSync(dest));
    check("新規と分かる形で出る", created.out.includes("新規"), created.out.includes("新規") ? "" : created.out);
    check("据えた本文が元と同じ", existsSync(dest) && readFileSync(dest, "utf8") === ruleText("最初の本文。"));

    const again = install([src, dest], root);
    const quiet = again.code === 0 && again.out.includes("変更なし");
    check("2 回目は「変更なし」", quiet, quiet ? "" : again.out);

    writeFileSync(src, ruleText("最初の本文。\n\n足した 1 行。"), "utf8");
    const updated = install([src, dest], root);
    console.log(`      更新 → 終了 ${updated.code}: ${updated.out}`);
    check("更新できる", updated.code === 0 && readFileSync(dest, "utf8").includes("足した 1 行。"));
    const counted = /\+\d+ \/ -\d+ 行/.test(updated.out);
    check("何行変わったかが出る", counted, counted ? "" : updated.out);
    check("paths の件数が出る", updated.out.includes("paths 1 件"), updated.out.includes("paths 1 件") ? "" : updated.out);

    // --- 本文の検査 ---------------------------------------------------------
    const badBody: Array<[string, string, string]> = [
      ["frontmatter が無い", "# ただの見出し\n", "no-frontmatter.md"],
      ["frontmatter が閉じていない", '---\npaths:\n  - "src/a.ts"\n', "unclosed.md"],
      ["paths: が無い", "---\nname: x\n---\n\n本文\n", "no-paths.md"],
      ["paths: の下が空", "---\npaths:\n---\n\n本文\n", "empty-paths.md"],
      ["中身が空", "", "empty.md"],
    ];
    for (const [why, text, name] of badBody) {
      const bad = join(root, name);
      writeFileSync(bad, text, "utf8");
      const { code, out } = install([bad, join(root, ".claude/rules/bad.md")], root);
      console.log(`      ${why} → 終了 ${code}: ${out}`);
      check(`本文を断る: ${why}`, code === 1 && !existsSync(join(root, ".claude/rules/bad.md")));
    }

    const missing = install([join(root, "nothing.md"), dest], root);
    check("元のファイルが無ければ断る", missing.code === 1, missing.code === 1 ? "" : missing.out);

    const wrongArgs = install([src], root);
    const usage = wrongArgs.code === 1 && wrongArgs.out.includes("使い方");
    check("引数が足りなければ使い方を出して断る", usage, usage ? "" : wrongArgs.out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
