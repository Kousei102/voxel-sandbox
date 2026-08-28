import { readFileSync } from "node:fs";
import { END_STONE } from "../src/blocks";
import { MAX_LIGHT } from "../src/constants";
import { END, OVERWORLD } from "../src/dimensions";
import { VictoryWatch, bossBarState, victoryMessage } from "../src/boss";
import { NO_ITEM } from "../src/items";
import { MOBS, Mobs, type MobContext } from "../src/mobs";
import { Arena, seeded, sourceOf } from "./arena";
import { check, describe } from "./harness";

/**
 * 倒したことが**画面で伝わる**ぶん（体力バーとクリア画面）の判断。
 *
 * 画面そのもの（`ui.ts` / `index.html` / `style.css`）はブラウザでしか確かめられないので、
 * **判断は全部 `boss.ts` に閉じ込めてある**（`CLAUDE.md` の対の表）。ここで見るのは
 * その中身と、**`ui.ts` へ漏れていないこと**の 2 つ。
 */
export function run(): void {
  describe("ボスの合図（体力バーとクリア画面）");

  const DRAGON = MOBS.dragon;

  // --- 判断のファイルに、確かめられないものが紛れていないこと -----------------

  {
    const source = sourceOf("src/boss.ts");
    const forbidden = ["Mesh", "document.", "HTMLElement", "AudioContext", "Math.random("].filter(
      (w) => source.includes(w),
    );
    check("boss.ts は画面にも音にも乱数にも触らない", forbidden.length === 0, forbidden.join(" "));

    // **`mobs.ts` を import しないこと。** 受け取るのは器ではなく必要な値だけ
    // （`BossFacts`）。import すると、画面の 1 行を確かめるのにモブの表と AI が
    // 丸ごと付いてくる（`vitals.ts` が `items.ts` を import しないのと同じ筋）。
    check("boss.ts は mobs.ts を import しない", !source.includes('from "./mobs"'));
  }

  {
    // **`ui.ts` は貼るだけ。** 割合の計算や「体力が尽きたら消す」をあちらに書くと、
    // ドラゴンを倒しに行くまで確かめられない場所に判断が戻る。
    const ui = sourceOf("src/ui.ts");
    const leaked = ["maxHealth", "bossDefeated", "BOSSES", "activeBoss", "/ 100"].filter((w) =>
      ui.includes(w),
    );
    check("ui.ts に体力バーの判断が漏れていない", leaked.length === 0, leaked.join(" "));

    // **置き場所も静かに壊れる。** `#hud` は「プレイ中でない間」ずっと隠れているので、
    // クリア画面をあの中に書くと**倒しても永久に出ない**（出るのはロックが外れた
    // あとなので）。逆に体力バーはあの中で正しい（プレイ中しか意味がない）。
    const html = readFileSync("index.html", "utf8");
    const hud = html.slice(html.indexOf('id="hud"'), html.indexOf('id="hurt"'));
    check("体力バーは #hud の中にある", hud.includes('id="bossbar"'));
    check("クリア画面は #hud の外にある", !hud.includes('id="victory"') && html.includes('id="victory"'));
  }

  // --- 体力バーの中身 -------------------------------------------------------

  {
    check("ボスが居なければ帯を出さない", bossBarState(null) === null);

    const full = bossBarState({ name: "エンダードラゴン", health: 200, maxHealth: 200 });
    const half = bossBarState({ name: "エンダードラゴン", health: 100, maxHealth: 200 });
    console.log(
      `      満タン: ${full?.fraction.toFixed(2)} 「${full?.label}」 / ` +
        `半分: ${half?.fraction.toFixed(2)} 「${half?.label}」`,
    );
    check("満タンは帯いっぱい", full?.fraction === 1);
    check("半分は帯の半分", half?.fraction === 0.5);
    // **残りの数も出すこと。** 棒だけだと、クリスタルの回復と矢のダメージが
    // 釣り合っているのかが目では分からない（削れているのに終わらない、が起きる）。
    check(
      "帯には名前と残りの数が出る",
      !!full && full.label.includes("エンダードラゴン") && full.label.includes("200"),
      full?.label,
    );

    // **倒れたモブは次のフレームに `list` から抜ける。** 0 で出したままにすると、
    // 空の帯が 1 フレームちらつく。
    check("体力が尽きたら消す", bossBarState({ name: "竜", health: 0, maxHealth: 200 }) === null);
    // 割ると NaN になり、帯の幅が `NaN%` になって**黙って消える**（原因が分からない）。
    const broken = bossBarState({ name: "竜", health: 5, maxHealth: 0 });
    check("最大体力が 0 でも NaN の帯を作らない", broken === null, String(broken?.fraction));

    // 回復（クリスタル）で最大を超えることがある。1 を超えると帯が箱からはみ出す。
    const over = bossBarState({ name: "竜", health: 260, maxHealth: 200 });
    check("回復しすぎても帯は 1 を超えない", over?.fraction === 1, String(over?.fraction));

    // **切り上げること。** 残り 0.4 を「0」と出すと、生きているのに倒したように見える。
    const sliver = bossBarState({ name: "竜", health: 0.4, maxHealth: 200 });
    console.log(`      残り 0.4: 「${sliver?.label}」 / 帯 ${sliver?.fraction.toFixed(4)}`);
    check("残りわずかでも 0 とは出さない", !!sliver && sliver.label.includes("1 / 200"), sliver?.label);
    check("そのときも帯は 0 より長い", !!sliver && sliver.fraction > 0);
  }

  // --- 本物の `Mobs` と繋がっていること ---------------------------------------

  {
    const arena = new Arena();
    arena.fill(-40, 40, 40, 48, -40, 40, END_STONE);
    arena.sky = 0;
    arena.block = MAX_LIGHT;
    const world = arena.asWorld();
    const mobs = new Mobs();

    // **先に「湧いた」ことを確かめる**（`rules/testing.md`）。これが無いと、
    // 下の「倒したら消える」が「そもそも最初から null」と見分けが付かない。
    const dragon = mobs.ensureBoss(END, world, false);
    if (!dragon) throw new Error("試験場でボスが湧かない");
    const alive = bossBarState(mobs.activeBoss(END));
    console.log(`      湧いた直後: 「${alive?.label}」 / 帯 ${alive?.fraction}`);
    check("湧いていれば帯が出る", alive?.fraction === 1, String(alive?.fraction));
    check("帯の名前は表から来ている", !!alive?.label.startsWith(DRAGON.name), alive?.label);

    // **別の次元では出ないこと。** 出ると、帰ってきたオーバーワールドの空に
    // ドラゴンの体力バーが浮いたままになる。
    check("ボスの居ない次元では帯を出さない", bossBarState(mobs.activeBoss(OVERWORLD)) === null);
    check("表に無い名前でも落ちない", mobs.activeBoss("なんとか") === null);

    // 実際に殴って減らす（数値を直に書き換えない ——「減った」の証拠にならない）。
    const ctx: MobContext = {
      playerX: dragon.position.x,
      playerY: dragon.position.y,
      playerZ: dragon.position.z,
      brightness: 1,
      random: seeded(4242),
    };
    mobs.attack(dragon, NO_ITEM, ctx);
    const hurt = bossBarState(mobs.activeBoss(END));
    console.log(`      殴ったあと: 「${hurt?.label}」 / 帯 ${hurt?.fraction.toFixed(3)}`);
    check(
      "殴ると帯が短くなる",
      !!hurt && !!alive && hurt.fraction < alive.fraction && hurt.fraction > 0,
      `${alive?.fraction} → ${hurt?.fraction.toFixed(3)}`,
    );

    // 倒す（`list` から抜ける）。**倒したら帯も消えること。**
    mobs.list.length = 0;
    check("倒したら帯が消える", bossBarState(mobs.activeBoss(END)) === null);

    // クリア画面の 1 行に要る名前は、**倒したあとにも取れること**
    // （`activeBoss()` はもう null なので、こちらでしか取れない）。
    console.log(`      倒したあとの名前: ${mobs.bossName(END)} / ${mobs.bossName(OVERWORLD)}`);
    check("倒したあとでもボスの名前が取れる", mobs.bossName(END) === DRAGON.name);
    check("ボスの居ない次元には名前が無い", mobs.bossName(OVERWORLD) === null);
  }

  // --- クリア画面をいつ出すか -------------------------------------------------

  {
    const watch = new VictoryWatch();
    check("倒すまでは出さない", !watch.update(false) && !watch.update(false));
    check("倒した瞬間に 1 回だけ出す", watch.update(true));
    // **毎フレーム `bossDefeated()` は true のまま。** 出し続けると、
    // 閉じたそばから開き直して操作を受け付けない。
    check("そのあとは出し続けない", !watch.update(true) && !watch.update(true));
    // 作り直して倒し直したら、もう一度出る（`mobs.clear()` で false へ戻る）。
    watch.update(false);
    check("倒し直せばまた出る", watch.update(true));
  }

  {
    // **「印が立っている」で出さないこと。** エンドの出口ポータルは `edits` に乗る
    // （＝読み込み直しても残る）ので、印で出す形にすると**倒したあとエンドへ
    // 入り直すたびにクリア画面が出る。** 実際に読み込み直しの流れを回して見る。
    const arena = new Arena();
    arena.fill(-40, 40, 40, 48, -40, 40, END_STONE);
    arena.sky = 0;
    arena.block = MAX_LIGHT;
    const world = arena.asWorld();
    const mobs = new Mobs();
    const watch = new VictoryWatch();

    const dragon = mobs.ensureBoss(END, world, false);
    if (!dragon) throw new Error("試験場でボスが湧かない");
    check("戦っているあいだは出ない", !watch.update(mobs.bossDefeated(END)));
    mobs.list.length = 0;
    check("倒した瞬間に出る", watch.update(mobs.bossDefeated(END)));

    // ここから「エンドへ入り直した」流れ。`startWorld()` の `mobs.clear()` が走り、
    // 倒した印（`defeated = true`）を渡してボスは湧かない。
    mobs.clear();
    const again = new VictoryWatch();
    let shown = 0;
    for (let i = 0; i < 5; i++) {
      mobs.ensureBoss(END, world, true);
      if (again.update(mobs.bossDefeated(END))) shown++;
    }
    console.log(`      入り直したあと 5 フレーム: クリア画面 ${shown} 回 / ${mobs.count} 体`);
    check("入り直してもクリア画面は出ない", shown === 0, `${shown} 回`);
    check("入り直してもボスは湧かない", mobs.count === 0, `${mobs.count} 体`);
  }

  // --- 文言 -----------------------------------------------------------------

  {
    const message = victoryMessage(MOBS.dragon.name);
    console.log(`      クリア画面の 1 行: 「${message}」`);
    check("倒した相手の名前が出る", message.includes(DRAGON.name), message);
    // **帰り道を必ず出すこと。** 出口ポータルは音も通知もなく建つので、
    // 書かないと「倒したのに何も起きていない」ように見える。
    check("帰り道（出口ポータル）に触れている", message.includes("ポータル"), message);
    check("名前が無くても文になる", victoryMessage(null).length > 0, victoryMessage(null));
  }
}
