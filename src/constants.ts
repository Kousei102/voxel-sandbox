/** ワールドの基本寸法。CHUNK_SIZE は 2 の冪であることを前提にビット演算で割り算している。 */
export const CHUNK_SIZE = 16;
export const CHUNK_BITS = 4;
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

/** 縦方向のチャンク段数。ワールドの高さは CHUNK_SIZE * CHUNK_LAYERS。 */
export const CHUNK_LAYERS = 8;
export const WORLD_HEIGHT = CHUNK_SIZE * CHUNK_LAYERS;

export const SEA_LEVEL = 40;

/** 水平方向の描画距離（チャンク単位）。 */
export const RENDER_DISTANCE = 7;
/**
 * ボクセルだけ用意しておく距離。メッシュ化には隣接列のデータが要るので、
 * 描画距離より 1 リング広く持っておかないと生成が連鎖してフレームが飛ぶ。
 */
export const DATA_DISTANCE = RENDER_DISTANCE + 1;
/** この距離を超えたチャンクは破棄する。 */
export const UNLOAD_DISTANCE = DATA_DISTANCE + 2;

/**
 * 1 フレームで地形生成とメッシュ化に使ってよい時間 (ms)。
 * チャンク 1 個の生成もメッシュ化も約 1ms なので、
 * 個数ではなく時間で区切らないとフレーム落ちが出る。
 */
export const GENERATE_BUDGET_MS = 3;
export const MESH_BUDGET_MS = 6;
/** 1 フレームで処理する上限（予算が余っても走りすぎないための保険）。段 = チャンク 1 個。 */
export const MAX_COLUMN_STEPS_PER_FRAME = 16;
export const MAX_MESHES_PER_FRAME = 12;

export const REACH = 6;

/** 空に露出したボクセルの光量。1 マス進むごとに 1（水中は 3）減る。 */
export const MAX_LIGHT = 15;
/**
 * 光量 0 の場所の明るさ。0 にすると洞窟が完全な暗闇になって何も見えないので、
 * かろうじて形が分かる程度は残す。
 */
export const AMBIENT_LIGHT = 0.16;
/** 光量から明るさへの変換の効き具合。1 より大きいほど、暗がりの落ち込みが急になる。 */
export const LIGHT_FALLOFF = 1.4;

/** 昼夜 1 周にかかる実時間 (秒)。Minecraft と同じ 20 分。 */
export const DAY_LENGTH_SECONDS = 1200;
/**
 * 真夜中の明るさ倍率。頂点カラーに焼いた光量にこれを掛ける。
 * 0 にすると夜が完全な暗闇になり、光源を持たないこのゲームでは何もできなくなる。
 */
export const NIGHT_BRIGHTNESS = 0.28;

export const STORAGE_KEY = "voxel-sandbox:v1";
export const AUTOSAVE_INTERVAL = 15;
