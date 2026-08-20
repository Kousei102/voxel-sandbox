let failures = 0;
let total = 0;
let group = "";
const skipped: string[] = [];

export function describe(name: string): void {
  group = name;
  console.log(`\n${name}`);
}

export function check(label: string, ok: boolean, detail = ""): void {
  total++;
  if (!ok) failures++;
  const mark = ok ? "  ok  " : "  NG  ";
  console.log(`${mark}${label}${detail ? `  — ${detail}` : ""}`);
}

/**
 * 走らせられなかったグループ。**`check()` の失敗にはしません** ——
 * 環境に何かが足りないだけで、コードの退行ではないからです。ただし
 * **「すべて成功」の陰に隠れてはいけない**ので、最後にもう一度名前を出します
 * （黙ってスキップされると、その領域は見張りが外れたまま何周も進みます）。
 */
export function skip(name: string, reason: string): void {
  skipped.push(`${name}（${reason}）`);
  console.log(`  --  スキップ: ${name}  — ${reason}`);
}

export function summary(): void {
  console.log(
    failures === 0
      ? `\n${total} 件すべて成功`
      : `\n${total} 件中 ${failures} 件失敗${group ? ` (最後のグループ: ${group})` : ""}`,
  );
  if (skipped.length > 0) {
    console.log(`※ スキップ ${skipped.length} グループ: ${skipped.join(" / ")}`);
  }
  process.exitCode = failures === 0 ? 0 : 1;
}
