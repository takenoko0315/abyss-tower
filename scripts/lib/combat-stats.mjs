export function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeOutcomes(results) {
  const n = results.length;
  const floors = results.map(result => result.floor || 0);
  const clears = results.filter(result => result.result === "victory").length;
  return {
    n,
    avgFloor: n ? floors.reduce((a, b) => a + b, 0) / n : 0,
    medianFloor: median(floors),
    maxFloor: floors.length ? Math.max(...floors) : 0,
    clearRate: n ? clears / n : 0,
    clears,
  };
}

// 両側95% t区間の臨界値。df<=30は表値、それ以上はCornish-Fisher近似。
export function tCritical95(df) {
  if (!Number.isInteger(df) || df < 1) return null;
  const table = [
    null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093,
    2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
  ];
  if (df <= 30) return table[df];
  const z = 1.959963984540054;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2);
}

function uniqueSeedMap(results, label) {
  const out = new Map();
  for (const result of results) {
    if (!Number.isInteger(result.seed)) throw new Error(`${label}に整数seedがない結果があります`);
    if (out.has(result.seed)) throw new Error(`${label}でseed=${result.seed}が重複しています`);
    out.set(result.seed, result);
  }
  return out;
}

export function pairComparison(resultsA, resultsB) {
  const bySeedA = uniqueSeedMap(resultsA, "比較元");
  const bySeedB = uniqueSeedMap(resultsB, "比較先");
  const diffs = [];
  for (const [seed, a] of bySeedA) {
    const b = bySeedB.get(seed);
    if (b) diffs.push((b.floor || 0) - (a.floor || 0));
  }
  const n = diffs.length;
  if (n === 0) return { n: 0, pairedSeeds: 0, ci95: null };
  const wins = diffs.filter(d => d > 0).length;
  const ties = diffs.filter(d => d === 0).length;
  const losses = diffs.filter(d => d < 0).length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const med = median(diffs);
  const variance = n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const stderr = n > 1 ? sd / Math.sqrt(n) : null;
  const critical = n > 1 ? tCritical95(n - 1) : null;
  return {
    n, wins, ties, losses,
    winRate: wins / n, tieRate: ties / n, lossRate: losses / n,
    meanDiff: mean, medianDiff: med, sd,
    ci95: n > 1 ? [mean - critical * stderr, mean + critical * stderr] : null,
  };
}
