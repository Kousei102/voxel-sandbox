import { DayNight } from "../src/daynight";
import { DAY_LENGTH_SECONDS, NIGHT_BRIGHTNESS } from "../src/constants";
import { check, describe } from "./harness";

/** 明るさ・色の連続性を見るための刻み幅（1 日を 1440 分割 = 1 分刻み）。 */
const STEPS = 1440;

function luminance(c: { r: number; g: number; b: number }): number {
  return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
}

export function run(): void {
  describe("昼夜サイクル");

  const dn = new DayNight();

  // --- 1 日の見え方をまず出す。パラメータを触ったとき壊れ方が分かるように。 ---
  const rows: string[] = [];
  for (let i = 0; i < 24; i += 3) {
    dn.setTime(((i - 6) / 24 + 1) % 1);
    rows.push(
      `${dn.clock()} 明るさ ${dn.brightness.toFixed(2)}` +
        ` 昼 ${dn.dayness.toFixed(2)} 夕 ${dn.twilight.toFixed(2)}` +
        ` 星 ${dn.starOpacity.toFixed(2)} 高度 ${dn.elevation.toFixed(2)}`,
    );
  }
  console.log(rows.map((r) => `      ${r}`).join("\n"));

  // --- 時刻の進み ---
  dn.setTime(0.3);
  dn.advance(DAY_LENGTH_SECONDS);
  check("1 周ちょうど進めると元の時刻に戻る", Math.abs(dn.time - 0.3) < 1e-9, `t=${dn.time}`);

  dn.setTime(0.9);
  dn.advance(DAY_LENGTH_SECONDS * 0.2);
  check("1 を跨いでも [0,1) に収まる", dn.time >= 0 && dn.time < 1, `t=${dn.time.toFixed(3)}`);

  dn.setTime(-0.25);
  check("負の時刻も巻き戻る", Math.abs(dn.time - 0.75) < 1e-9, `t=${dn.time}`);

  dn.paused = true;
  dn.setTime(0.4);
  dn.advance(100);
  check("paused の間は進まない", dn.time === 0.4);
  dn.paused = false;

  // --- 太陽と月 ---
  dn.setTime(0);
  check("日の出は東の地平線", Math.abs(dn.elevation) < 1e-9 && dn.sunDirection.x > 0.99);
  dn.setTime(0.25);
  check("南中で高度 +1", Math.abs(dn.elevation - 1) < 1e-9, dn.clock());
  dn.setTime(0.5);
  check("日没は西の地平線", Math.abs(dn.elevation) < 1e-9 && dn.sunDirection.x < -0.99, dn.clock());
  dn.setTime(0.75);
  check("真夜中で高度 -1", Math.abs(dn.elevation + 1) < 1e-9, dn.clock());

  let opposite = true;
  let unit = true;
  for (let i = 0; i < STEPS; i++) {
    dn.setTime(i / STEPS);
    if (dn.sunDirection.dot(dn.moonDirection) > -0.999) opposite = false;
    if (Math.abs(dn.sunDirection.length() - 1) > 1e-6) unit = false;
  }
  check("月は常に太陽の真裏", opposite);
  check("太陽の向きは常に単位ベクトル", unit);

  // --- 明るさ ---
  dn.setTime(0.25);
  const noon = dn.brightness;
  check("南中で明るさ 1", Math.abs(noon - 1) < 1e-6, noon.toFixed(3));
  dn.setTime(0.75);
  const midnight = dn.brightness;
  check(
    "真夜中で明るさ NIGHT_BRIGHTNESS",
    Math.abs(midnight - NIGHT_BRIGHTNESS) < 1e-6,
    midnight.toFixed(3),
  );
  check("夜でも真っ暗ではない", NIGHT_BRIGHTNESS > 0.1, `NIGHT_BRIGHTNESS=${NIGHT_BRIGHTNESS}`);

  // 画面を見ないと気付けない類: どこかで急に暗転すると、1 分刻みの差が跳ねる。
  // 夜明け・日暮れの立ち上がりで 1.4% 前後（実時間では 1 秒あたり 1.7% 程度）。
  let maxJump = 0;
  let jumpAt = 0;
  let prev = 0;
  for (let i = 0; i <= STEPS; i++) {
    dn.setTime(i / STEPS);
    if (i > 0 && Math.abs(dn.brightness - prev) > maxJump) {
      maxJump = Math.abs(dn.brightness - prev);
      jumpAt = i / STEPS;
    }
    prev = dn.brightness;
  }
  check(
    "明るさが 1 分あたり 3% 以上跳ばない",
    maxJump < 0.03,
    `最大 ${(maxJump * 100).toFixed(2)}% (t=${jumpAt.toFixed(3)})`,
  );

  // --- 色 ---
  let inRange = true;
  let worst = 0;
  for (let i = 0; i < STEPS; i++) {
    dn.setTime(i / STEPS);
    for (const c of [dn.zenith, dn.horizon, dn.ground, dn.tint]) {
      for (const v of [c.r, c.g, c.b]) {
        if (!(v >= 0 && v <= 1)) inRange = false;
        worst = Math.max(worst, v);
      }
    }
  }
  check("空と地形の色は 0..1 に収まる", inRange, `最大成分 ${worst.toFixed(3)}`);

  dn.setTime(0.25);
  const noonTint = luminance(dn.tint);
  dn.setTime(0.75);
  const nightTint = luminance(dn.tint);
  check(
    "地形の色は夜のほうが暗い",
    nightTint < noonTint * 0.5,
    `昼 ${noonTint.toFixed(3)} / 夜 ${nightTint.toFixed(3)}`,
  );
  check("夜の地形の色が 0 に潰れない", nightTint > 0.02, nightTint.toFixed(3));

  // --- 夕焼けと星 ---
  dn.setTime(0.5);
  const duskPeak = dn.twilight;
  dn.setTime(0.25);
  const duskNoon = dn.twilight;
  dn.setTime(0.75);
  const duskMidnight = dn.twilight;
  check(
    "夕焼けは日没で最大・昼夜では 0",
    duskPeak > 0.99 && duskNoon === 0 && duskMidnight === 0,
    `日没 ${duskPeak.toFixed(2)} 南中 ${duskNoon.toFixed(2)} 真夜中 ${duskMidnight.toFixed(2)}`,
  );

  dn.setTime(0.25);
  const starNoon = dn.starOpacity;
  dn.setTime(0.75);
  const starMidnight = dn.starOpacity;
  check(
    "星は昼に消えて真夜中に出る",
    starNoon === 0 && starMidnight > 0.99,
    `南中 ${starNoon.toFixed(2)} 真夜中 ${starMidnight.toFixed(2)}`,
  );

  dn.setTime(0.25);
  check("南中は太陽だけ見える", dn.sunOpacity > 0.99 && dn.moonOpacity === 0);
  dn.setTime(0.75);
  check("真夜中は月だけ見える", dn.moonOpacity > 0.99 && dn.sunOpacity === 0);

  // --- 時計表示 ---
  dn.setTime(0);
  const sunrise = dn.clock();
  dn.setTime(0.25);
  const noonClock = dn.clock();
  dn.setTime(0.75);
  const midnightClock = dn.clock();
  check(
    "時計は 0=06:00 / 0.25=12:00 / 0.75=00:00",
    sunrise === "06:00" && noonClock === "12:00" && midnightClock === "00:00",
    `${sunrise} / ${noonClock} / ${midnightClock}`,
  );
}
