import { EndGen } from "./endgen";
import { NetherGen } from "./nethergen";
import type { ChunkSource } from "./world";
import { WorldGen } from "./worldgen";

/**
 * 次元の入れ物。**判断だけのファイル**で、three も DOM も乱数も出てきません
 * （`beds.ts` / `liquids.ts` / `portals.ts` と同じ形。`test/dimensions.test.ts` が見張っています）。
 *
 * 持つのは 2 つだけです。
 *
 * 1. **どの次元があるか**（`DIMENSIONS` の表。生成器の作り方もここ）
 * 2. **いま居ない次元の持ち物を預かること**（`edits` / 落とし物 / かまど / チェスト）
 *
 * **`main.ts` に次元ごとの分岐を書かないための器です。** 分岐を散らすと、次元を足すたびに
 * 「置く」「壊す」「保存する」の 3 か所を直して回ることになり、必ず 1 つ忘れます
 * （`test/ui.test.ts` が `main.ts` の分岐を数えて上限で止めています）。
 *
 * **この器は「どこへ繋がるか」を知りません。** 枠の判定は `portals.ts`、
 * ポータルの対応と移動の配線は `main.ts` の仕事です。
 */

/**
 * 次元の名前。**セーブに文字列のまま入る**ので、既存の id を書き換えないこと
 * （ブロック ID を振り直さないのと同じ理由で、預けた持ち物が行方不明になります）。
 */
export type DimensionId = string;

export const OVERWORLD: DimensionId = "overworld";
export const NETHER: DimensionId = "nether";
export const END: DimensionId = "end";

/**
 * 次元 1 つぶんの「位置ごとの持ち物」。**セーブに書く形そのまま**にしてあります
 * （`storage.ts` の `SaveData` の同名のキーと同じ型）。
 *
 * **モブは入りません**（保存しないので。次元を移ったら消えるのが正しい）。
 * **リスポーン地点（`bed`）も入りません** —— 世界に 1 つだけの地点なので上の階層のままです。
 */
export interface DimensionState {
  /** チャンクキー -> [localIndex, blockId, ...]。 */
  readonly edits: Record<string, number[]>;
  readonly drops?: number[];
  readonly furnaces?: Record<string, number[]>;
  readonly chests?: Record<string, number[]>;
}

/** まだ一度も行っていない次元の状態。 */
export function emptyState(): DimensionState {
  return { edits: {} };
}

/**
 * 読んだセーブを `DimensionState` の形に揃える。**壊れたセーブで落ちないため**で、
 * `edits` が無いだけで次元ごと読めなくなるより、空で開けるほうが安全側。
 */
function normalize(raw: Partial<DimensionState> | undefined): DimensionState {
  return {
    edits: raw?.edits ?? {},
    drops: raw?.drops,
    furnaces: raw?.furnaces,
    chests: raw?.chests,
  };
}

export interface DimensionDef {
  readonly id: DimensionId;
  /** 画面に出す名前。 */
  readonly name: string;
  /**
   * 世界の種に混ぜる値。**オーバーワールドは 0 のままにすること** ——
   * 変えると既存のワールドの地形が丸ごと別物になります。
   */
  readonly salt: number;
  /** その次元の生成器を作る。渡ってくるのは**混ぜたあとの種**。 */
  create(seed: number): ChunkSource;
}

/**
 * 遊べる次元の表。**ここに載っていない次元へは移れません**（`switchTo` が null を返す）。
 *
 * 次元を足すときは **`salt` を 0 以外にすること**（同じ種で同じ地形にならないように）と、
 * **`daynight.ts` の `SKY_STYLES` にも 1 行**足すこと（無いとオーバーワールドの
 * 青空と星のまま新しい次元に立ちます）。
 */
export const DIMENSIONS: readonly DimensionDef[] = [
  {
    id: OVERWORLD,
    name: "オーバーワールド",
    salt: 0,
    create: (seed) => new WorldGen(seed),
  },
  {
    id: NETHER,
    name: "ネザー",
    // **0 以外なら何でもよい。** 同じ種でオーバーワールドと同じ形にならなければ足りる。
    salt: 0x4e455448,
    create: (seed) => new NetherGen(seed),
  },
  {
    id: END,
    name: "エンド",
    // **ネザーとも違う値にすること**（同じにすると、島のふちの形がネザーの床と同じ癖になる）。
    salt: 0x454e4421,
    create: (seed) => new EndGen(seed),
  },
];

/**
 * セーブに書く形。**オーバーワールドは今までどおり上の階層**（`top`）に置き、
 * `others` に入るのはそれ以外の次元だけです。
 *
 * こうしてあるので、**オーバーワールドに居る限り保存の形は今までと同じ**
 * （`dim` も `others` も出ない）で、既存のセーブもそのまま読めます。
 */
export interface SaveShape {
  /** いま居る次元。**オーバーワールドなら省略。** */
  readonly dim?: DimensionId;
  /** 上の階層に書くぶん（オーバーワールドの持ち物）。 */
  readonly top: DimensionState;
  /** それ以外の次元。空なら省略。 */
  readonly others?: Record<string, DimensionState>;
}

export class Dimensions {
  /** 次元 -> 預かっている持ち物。**いま居る次元のぶんも `stash()` で入ります。** */
  private readonly stashed = new Map<DimensionId, DimensionState>();
  /** 次元 -> 生成器。**1 つにつき 1 個だけ**作って使い回す（列のキャッシュを捨てないため）。 */
  private readonly sources = new Map<DimensionId, ChunkSource>();
  private currentId: DimensionId = OVERWORLD;

  /** 表を差し替えられるのは**テストのため**（偽の次元を 2 つ作って往復を確かめます）。 */
  constructor(private readonly defs: readonly DimensionDef[] = DIMENSIONS) {}

  get current(): DimensionId {
    return this.currentId;
  }

  /** 遊べる次元の一覧。 */
  get ids(): DimensionId[] {
    return this.defs.map((d) => d.id);
  }

  /** その次元へ行けるか（表に載っているか）。 */
  known(id: DimensionId): boolean {
    return this.defs.some((d) => d.id === id);
  }

  /** 画面に出す名前。知らない次元なら id をそのまま返す。 */
  nameOf(id: DimensionId): string {
    return this.defs.find((d) => d.id === id)?.name ?? id;
  }

  /**
   * その次元の生成器。知らない次元なら null。
   *
   * **同じ次元には同じものを返します。** 作り直すと列のキャッシュが毎回捨てられ、
   * 行き来するたびに地形の生成をやり直すことになります。
   * 種が変わるとき（別のワールドを始めるとき）は `reset()` を呼ぶこと。
   */
  sourceFor(id: DimensionId, seed: number): ChunkSource | null {
    const cached = this.sources.get(id);
    if (cached) return cached;
    const def = this.defs.find((d) => d.id === id);
    if (!def) return null;
    const made = def.create((seed ^ def.salt) >>> 0);
    this.sources.set(id, made);
    return made;
  }

  /**
   * オーバーワールドの生成器だけは**型が付いたまま**返す。
   *
   * `main.ts` の F3 がバイオーム名を出すのに `WorldGen` そのものが要るためで
   * （`ChunkSource` はバイオームを知りません。`rules/meshing-render.md`）、
   * **`sourceFor()` と同じキャッシュを通す**ので、オーバーワールドに居るあいだは
   * 世界の生成器とまったく同じものになります（列のキャッシュも 1 つで済む）。
   */
  overworldGen(seed: number): WorldGen {
    const source = this.sourceFor(OVERWORLD, seed);
    return source instanceof WorldGen ? source : new WorldGen(seed);
  }

  /** その次元に預けてある持ち物（無ければ空）。 */
  stateOf(id: DimensionId): DimensionState {
    return this.stashed.get(id) ?? emptyState();
  }

  /**
   * いま居る次元の持ち物を預ける。
   * **`switchTo()` と `forSave()` の中から呼ばれる**ので、ふつうは直に呼びません。
   */
  stash(state: DimensionState): void {
    this.stashed.set(this.currentId, state);
  }

  /**
   * 次元を移る。移った先の持ち物を返す（知らない次元なら null で、**居場所は動きません**）。
   *
   * **預けるのと取り出すのが 1 回の呼び出しになっている**のが肝心です ——
   * 2 つに分けると「預け忘れて、戻ったらオーバーワールドの改変が消えていた」が起こせます。
   */
  switchTo(id: DimensionId, leaving: DimensionState): DimensionState | null {
    if (!this.known(id)) return null;
    this.stash(leaving);
    this.currentId = id;
    return this.stateOf(id);
  }

  /**
   * 全部忘れる。**別のワールドを始めるときに呼ぶこと**（`main.ts` の `startWorld()`）——
   * 忘れないと、前のワールドのネザーの改変が新しいワールドに出てきます。
   */
  reset(): void {
    this.stashed.clear();
    this.sources.clear();
    this.currentId = OVERWORLD;
  }

  /**
   * セーブに書く形にする。**いま居る次元の持ち物を渡すこと**（中で預かります）。
   *
   * 渡し忘れを防ぐために `stash()` を兼ねてあります。分けると
   * 「保存の直前に預け忘れて、いま居る次元の改変だけが消える」が起こせます。
   */
  forSave(live: DimensionState): SaveShape {
    this.stash(live);

    const others: Record<string, DimensionState> = {};
    for (const [id, state] of this.stashed) {
      if (id === OVERWORLD) continue;
      others[id] = state;
    }

    return {
      dim: this.currentId === OVERWORLD ? undefined : this.currentId,
      top: this.stateOf(OVERWORLD),
      others: Object.keys(others).length > 0 ? others : undefined,
    };
  }

  /**
   * セーブから戻す。**いま居る次元の持ち物を返す**ので、呼ぶ側はそれを世界に貼ります。
   *
   * **知らない次元には立たせません。** 別のブランチで作ったセーブ（まだ無い次元に居るもの）を
   * 読むと、生成器の無い場所に立たされて世界が空になります。そのときは
   * オーバーワールドに落とし、**預かり物は捨てずに持ったまま**にします
   * （次元が実装された周に、そのまま続きが遊べます）。
   */
  fromSave(saved: {
    dim?: DimensionId;
    top: Partial<DimensionState> | undefined;
    others?: Record<string, Partial<DimensionState>>;
  }): DimensionState {
    this.stashed.clear();
    this.stashed.set(OVERWORLD, normalize(saved.top));
    for (const [id, state] of Object.entries(saved.others ?? {})) {
      // 上の階層が正。**両方にあったら上の階層を採ります**（`forSave` は
      // オーバーワールドを `others` に入れないので、ふつうはここに来ません）。
      if (id === OVERWORLD) continue;
      this.stashed.set(id, normalize(state));
    }

    const want = saved.dim ?? OVERWORLD;
    this.currentId = this.known(want) ? want : OVERWORLD;
    return this.stateOf(this.currentId);
  }
}
