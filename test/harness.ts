let failures = 0;
let total = 0;
let group = "";

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

export function summary(): void {
  console.log(
    failures === 0
      ? `\n${total} 件すべて成功`
      : `\n${total} 件中 ${failures} 件失敗${group ? ` (最後のグループ: ${group})` : ""}`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}
