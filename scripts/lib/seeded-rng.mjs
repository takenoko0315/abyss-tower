// combat-decision-bot用の固定シード乱数。AbyssTower.jsx側は一切変更せず、
// グローバルMath.randomを一時的に差し替えることでラン全体(敵の予告・クリティカル判定・
// ドロップ抽選等すべて)を再現可能にする。差し替えは1ランごとにinstall→restoreで元に戻すこと。

// mulberry32: 高速・依存なしの32bit PRNG。統計的な質より再現性と速度を優先する用途に十分。
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// グローバルMath.randomをシード値で差し替える。戻り値の関数を呼ぶと元に戻る。
export function installSeededRandom(seed) {
  const original = Math.random;
  Math.random = mulberry32(seed);
  return function restore() {
    Math.random = original;
  };
}

// 固定契約のリロール候補seed。論理seedを比較キーとして保ち、attemptごとに全体RUNS幅で進める。
export function rerollSeed(logicalSeed, attempt, stride) {
  if (!Number.isInteger(logicalSeed) || !Number.isInteger(attempt) || attempt < 0 || !Number.isInteger(stride) || stride < 1) {
    throw new Error("rerollSeedには整数のlogicalSeed/attempt/strideが必要です");
  }
  return logicalSeed + attempt * stride;
}
