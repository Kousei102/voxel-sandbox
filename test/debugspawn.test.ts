import { STONE } from "../src/blocks";
import { debugMob, nextShot } from "../src/debugspawn";
import { MOB_KINDS } from "../src/mobs";
import { PROJECTILE_KINDS } from "../src/projectiles";
import { sourceOf } from "./arena";
import { check, describe } from "./harness";

/** 狙っている面（`RaycastHit` と同じ形）。 */
function aimAt(x: number, y: number, z: number, normal: [number, number, number]) {
  return {
    id: STONE,
    block: { x, y, z },
    normal: { x: normal[0], y: normal[1], z: normal[2] },
    point: { y },
  };
}

export function run(): void {
  describe("デバッグの湧かせ方（debugspawn.ts）");

  {
    const spawn = debugMob(aimAt(4, 10, -7, [0, 1, 0]), 0, 0);
    // 上面を狙ったら、そのマスの上のマスの中心に立つ。
    check("面の手前のマスの中心に出る", spawn.x === 4.5 && spawn.z === -6.5, `${spawn.x},${spawn.z}`);
    check("面の上に乗る高さ", spawn.y === 11, String(spawn.y));
    check("向きはプレイヤーの真裏", Math.abs(spawn.yaw - Math.PI) < 1e-9, String(spawn.yaw));

    const side = debugMob(aimAt(0, 20, 0, [-1, 0, 0]), 0, 0);
    check("横の面なら横のマスへ", side.x === -0.5 && side.y === 20, `${side.x},${side.y}`);
  }

  {
    // **種類は `roll` で選ぶ**（乱数は呼ぶ側が作る）。表の端まで届くこと。
    const kinds = new Set(MOB_KINDS.map((_, i) => debugMob(aimAt(0, 0, 0, [0, 1, 0]), 0, (i + 0.5) / MOB_KINDS.length).kind));
    check("表のどの種類も出せる", kinds.size === MOB_KINDS.length, `${kinds.size} / ${MOB_KINDS.length}`);
    check("roll = 0 は先頭", debugMob(aimAt(0, 0, 0, [0, 1, 0]), 0, 0).kind === MOB_KINDS[0]);
    // **1 ちょうどで表の外を引かないこと**（`Math.random()` は 1 を返さないが、
    // ここで落ちると「たまに undefined が湧く」形になって原因が分からない）。
    check("roll = 1 でも表の外を引かない", debugMob(aimAt(0, 0, 0, [0, 1, 0]), 0, 1).kind === MOB_KINDS[MOB_KINDS.length - 1]);
  }

  {
    // 押すたびに順ぐり。始まりは -1（最初の 1 回で 0 になる）。
    let index = -1;
    const seen: number[] = [];
    for (let i = 0; i < PROJECTILE_KINDS.length * 2; i++) {
      index = nextShot(index);
      seen.push(index);
    }
    check("最初の 1 回で 0 になる", seen[0] === 0, String(seen[0]));
    check("4 種類を順ぐりに出せる", new Set(seen).size === PROJECTILE_KINDS.length, `${new Set(seen).size} 種類`);
    check("一周したら先頭へ戻る", seen[PROJECTILE_KINDS.length] === 0, String(seen[PROJECTILE_KINDS.length]));
  }

  // --- 見張り ---------------------------------------------------------------

  {
    const source = sourceOf("src/debugspawn.ts");
    for (const word of ["three", "document", "Mesh", "AudioContext"]) {
      check(`debugspawn.ts に ${word} が無い`, !source.includes(word));
    }
    // 乱数は呼ぶ側が作る（`items.ts` の `rollDrop()` と同じ作法）。
    check("debugspawn.ts が乱数を持たない", !source.includes("Math.random("));
  }
}
