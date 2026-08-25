import { AIR, LAVA, STONE, WATER } from "../src/blocks";
import {
  DayNight,
  WAKE_TIME,
  canSleep,
  environmentFor,
  skyStyleFor,
  sunElevation,
} from "../src/daynight";
import { DAY_LENGTH_SECONDS, NIGHT_BRIGHTNESS } from "../src/constants";
import { DIMENSIONS, END, NETHER, OVERWORLD } from "../src/dimensions";
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

  // --- 寝られる時刻（ベッド） ---
  describe("寝られる時刻");

  // **`sample()` と同じ式を使っていること**を先に固定する。ここがずれると、
  // 「見た目は夜なのに寝られない」という形でしか気付けなくなる。
  let sameElevation = true;
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    dn.setTime(t);
    if (Math.abs(sunElevation(t) - dn.elevation) > 1e-12) sameElevation = false;
  }
  check("sunElevation() は sample() の高度と一致する", sameElevation);

  check("真夜中は寝られる", canSleep(0.75));
  check("南中は寝られない", !canSleep(0.25));
  check("日の出は寝られない", !canSleep(0));
  check("日没直後は寝られる", canSleep(0.52));
  check("日の出直前は寝られる", canSleep(0.98));
  check("負の時刻でも [0,1) に丸めて判定する", canSleep(-0.25) === canSleep(0.75));

  // 寝られる時間の長さ。半日よりわずかに短い（地平線の少し下から数えるため）。
  let sleepable = 0;
  for (let i = 0; i < STEPS; i++) if (canSleep(i / STEPS)) sleepable++;
  check(
    "寝られるのは 1 日のおよそ半分",
    sleepable > STEPS * 0.44 && sleepable < STEPS * 0.5,
    `${((sleepable / STEPS) * 100).toFixed(1)}%（${sleepable} 分）`,
  );

  // 起きる時刻は日の出。**そこで寝られなくなること**が肝心（でないと連続で寝られる）。
  check("起きる時刻は日の出", WAKE_TIME === 0);
  check("起きた瞬間はもう寝られない", !canSleep(WAKE_TIME));
  dn.setTime(WAKE_TIME);
  check("起きる時刻は 06:00", dn.clock() === "06:00", dn.clock());

  describe("空とフォグ（environmentFor）");

  {
    const dn2 = new DayNight();
    dn2.setTime(0.25); // 南中
    // **返るのは使い回しの 1 個**（毎フレーム呼ぶので作り直さない）。
    // だから値は**引いたらすぐ控える**こと —— これを忘れると、2 回目の呼び出しで
    // 1 回目の結果まで書き換わる（このテスト自身が最初にそれで落ちた）。
    const snap = (head: number) => {
      const e = environmentFor(head, dn2);
      return { headInWater: e.headInWater, inLiquid: e.inLiquid, fog: e.fog.getHex(), near: e.near, far: e.far };
    };

    check("使い回しの 1 個を返す", environmentFor(AIR, dn2) === environmentFor(WATER, dn2));

    const open = snap(AIR);
    check("空の下では地平線の色（チャンクの出現が見えない）", open.fog === dn2.horizon.getHex());
    check("空の下では浸かっていない", !open.headInWater && !open.inLiquid);
    check("素のフォグは描画距離の内側で終わる", open.near > 0 && open.far > open.near, `${open.near.toFixed(1)} .. ${open.far.toFixed(1)}`);

    const solid = snap(STONE);
    check("岩の中でも液体扱いにしない", !solid.inLiquid && solid.fog === dn2.horizon.getHex());

    const water = snap(WATER);
    // **息と音のこもりは水だけ**（液体すべてに広げると溶岩で溺れる）。
    check("水中は headInWater が立つ", water.headInWater && water.inLiquid);
    check("水中のフォグは近い", water.far < open.far, `${water.far} < ${open.far.toFixed(1)}`);

    const lava = snap(LAVA);
    check("溶岩は inLiquid だけ（息は水と同じにしない）", lava.inLiquid && !lava.headInWater);
    check("溶岩のフォグはいちばん近い", lava.far <= water.far, `${lava.far} <= ${water.far}`);

    // 水は夜に暗くなり、溶岩は自分で光るので変わらない。
    const dayWater = snap(WATER).fog;
    const dayLava = snap(LAVA).fog;
    dn2.setTime(0.75); // 真夜中
    check("水のフォグは夜に暗くなる", snap(WATER).fog !== dayWater);
    check("溶岩のフォグは夜でも変わらない", snap(LAVA).fog === dayLava);
  }

  describe("次元ごとの空");

  {
    // **綴りのずれの見張り。** `daynight.ts` は `dimensions.ts` を import しない
    // （生成器を引き連れてくるので）ぶん、キーが合っているかはここで突き合わせる。
    // 表に無い次元は `skyStyleFor()` がオーバーワールドの**同じオブジェクト**を返すので、
    // 参照の一致で「落ちている」ことが分かる。
    const overworldStyle = skyStyleFor(OVERWORLD);
    const known = [...DIMENSIONS.map((d) => d.id), END];
    const missing = known.filter((id) => id !== OVERWORLD && skyStyleFor(id) === overworldStyle);
    check(
      "遊べる次元（+ まだ行けないエンド）に全部 空がある",
      missing.length === 0,
      missing.length > 0 ? `表に無い: ${missing.join(" ")}` : known.join(" / "),
    );
    check("知らない次元はオーバーワールドの空に落ちる", skyStyleFor("なにこれ") === overworldStyle);

    // --- まず 3 つの次元の見え方を出す（触ったとき壊れ方が分かるように）---
    const dn3 = new DayNight();
    for (const id of known) {
      dn3.setDimension(id);
      const rows: string[] = [];
      for (const t of [0.25, 0.75]) {
        dn3.setTime(t);
        rows.push(
          `${dn3.clock()} 明るさ ${dn3.brightness.toFixed(2)}` +
            ` 天頂 #${dn3.zenith.getHexString()} 地平 #${dn3.horizon.getHexString()}` +
            ` 太陽 ${dn3.sunOpacity.toFixed(2)} 月 ${dn3.moonOpacity.toFixed(2)}` +
            ` 星 ${dn3.starOpacity.toFixed(2)}`,
        );
      }
      console.log(`      ${id}\n${rows.map((r) => `        ${r}`).join("\n")}`);
    }

    /** 1 日ぶん回して、次元 1 つの振る舞いをまとめて測る。 */
    const survey = (id: string) => {
      dn3.setDimension(id);
      let sun = 0;
      let moon = 0;
      // 星は**最小と最大の両方**を見る。最小だけだと「ネザーでも夜になると星が出る」を
      // 見逃す（昼は 0 なので最小 0 で通ってしまう。わざと壊して確かめた）。
      let stars = Infinity;
      let starsMax = 0;
      let minBright = Infinity;
      let maxBright = -Infinity;
      const horizons = new Set<number>();
      let inRange = true;
      for (let i = 0; i < STEPS; i++) {
        dn3.setTime(i / STEPS);
        sun = Math.max(sun, dn3.sunOpacity);
        moon = Math.max(moon, dn3.moonOpacity);
        stars = Math.min(stars, dn3.starOpacity);
        starsMax = Math.max(starsMax, dn3.starOpacity);
        minBright = Math.min(minBright, dn3.brightness);
        maxBright = Math.max(maxBright, dn3.brightness);
        horizons.add(dn3.horizon.getHex());
        for (const c of [dn3.zenith, dn3.horizon, dn3.ground, dn3.tint]) {
          for (const v of [c.r, c.g, c.b]) if (!(v >= 0 && v <= 1)) inRange = false;
        }
      }
      return { sun, moon, stars, starsMax, minBright, maxBright, horizons: horizons.size, inRange };
    };

    // --- オーバーワールドは今までどおり（この周の書き換えで昼夜が消えていないか）---
    const over = survey(OVERWORLD);
    check(
      "オーバーワールドは今までどおり昼夜で動く",
      over.maxBright - over.minBright > 0.5 && over.horizons > 100,
      `明るさ ${over.minBright.toFixed(2)}..${over.maxBright.toFixed(2)} / 地平線の色 ${over.horizons} 種`,
    );
    check(
      "オーバーワールドは太陽・月が出て、星は夜だけ出る",
      over.sun > 0.99 && over.moon > 0.99 && over.starsMax > 0.99 && over.stars === 0,
      `太陽 ${over.sun.toFixed(2)} 月 ${over.moon.toFixed(2)} 星 ${over.stars.toFixed(2)}..${over.starsMax.toFixed(2)}`,
    );

    // 既定（`setDimension` を一度も呼ばない）がオーバーワールドであること。
    // ここがずれると、ワールドを開いた瞬間だけ空が違う。
    const fresh = new DayNight();
    fresh.setTime(0.3);
    dn3.setDimension(OVERWORLD);
    dn3.setTime(0.3);
    check(
      "既定はオーバーワールド",
      fresh.horizon.getHex() === dn3.horizon.getHex() && fresh.brightness === dn3.brightness,
      `#${fresh.horizon.getHexString()} / 明るさ ${fresh.brightness.toFixed(2)}`,
    );

    // --- ネザー: 天井があるので天体は 1 つも出さず、明るさも時刻で動かない ---
    const nether = survey(NETHER);
    check(
      "ネザーは太陽・月・星を出さない（夜になっても）",
      nether.sun === 0 && nether.moon === 0 && nether.starsMax === 0,
      `1 日の最大: 太陽 ${nether.sun} 月 ${nether.moon} 星 ${nether.starsMax}`,
    );
    check(
      "ネザーの明るさは時刻で動かない",
      nether.maxBright === nether.minBright,
      `${nether.minBright.toFixed(2)}..${nether.maxBright.toFixed(2)}`,
    );
    check("ネザーの空の色は時刻で動かない", nether.horizons === 1, `${nether.horizons} 種`);
    check("ネザーの色は 0..1 に収まる", nether.inRange);

    dn3.setDimension(NETHER);
    dn3.setTime(0.25); // 南中でも赤黒いまま
    const nZenith = dn3.zenith;
    const nHorizon = dn3.horizon;
    check(
      "ネザーの空は赤い（赤 > 緑・青）",
      nHorizon.r > nHorizon.g && nHorizon.r > nHorizon.b && nZenith.r > nZenith.b,
      `地平 #${nHorizon.getHexString()} / 天頂 #${nZenith.getHexString()}`,
    );
    check(
      "ネザーの空は暗い（青空より暗い）",
      luminance(nHorizon) < 0.2,
      `輝度 ${luminance(nHorizon).toFixed(3)}`,
    );
    // フォグは地平線に追従する（ここがずれるとチャンクの出現が見える）。
    const netherFog = environmentFor(AIR, dn3).fog.getHex();
    check("ネザーのフォグは地平線と同じ色", netherFog === nHorizon.getHex(), `#${nHorizon.getHexString()}`);

    // --- エンド: 星だけ。まだ行けないが、表はもう効く（2-10 でそのまま繋がる）---
    const end = survey(END);
    check(
      "エンドは星だけ出す（太陽・月は出さない）",
      end.sun === 0 && end.moon === 0 && end.stars > 0.99,
      `太陽 ${end.sun} 月 ${end.moon} 星 ${end.stars.toFixed(2)}`,
    );
    check("エンドの明るさも時刻で動かない", end.maxBright === end.minBright, `${end.minBright.toFixed(2)}`);
    dn3.setDimension(END);
    dn3.setTime(0.25);
    check(
      "エンドの空は紫（青 > 緑）",
      dn3.horizon.b > dn3.horizon.g && dn3.zenith.b > dn3.zenith.g,
      `地平 #${dn3.horizon.getHexString()} / 天頂 #${dn3.zenith.getHexString()}`,
    );

    // --- 行き来 ---
    // **戻れること**が肝心（`setDimension` が一方通行だと、ネザーから帰っても空が赤いまま）。
    dn3.setDimension(NETHER);
    const backHome = survey(OVERWORLD);
    check(
      "オーバーワールドへ戻すと昼夜が戻る",
      backHome.maxBright - backHome.minBright > 0.5,
      `明るさ ${backHome.minBright.toFixed(2)}..${backHome.maxBright.toFixed(2)}`,
    );

    // 時刻は次元に依らない（ネザーに居るあいだも進み、戻れば続きになる）。
    dn3.setTime(0.4);
    dn3.setDimension(NETHER);
    check("次元を移っても時刻は変わらない", dn3.time === 0.4, `t=${dn3.time}`);
    dn3.advance(DAY_LENGTH_SECONDS * 0.1);
    check("ネザーでも時刻は進む", Math.abs(dn3.time - 0.5) < 1e-9, `t=${dn3.time.toFixed(3)}`);
  }
}
