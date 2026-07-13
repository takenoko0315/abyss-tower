import { describe, expect, it } from "vitest";
import { median, pairComparison, summarizeOutcomes, tCritical95 } from "./combat-stats.mjs";

describe("combat statistics", () => {
  it("平均・中央値・最大値・クリア率を丸め前の値で計算する", () => {
    const result = summarizeOutcomes([
      { floor: 2, result: "dead" },
      { floor: 5, result: "dead" },
      { floor: 20, result: "victory" },
    ]);
    expect(result).toMatchObject({ n: 3, avgFloor: 9, medianFloor: 5, maxFloor: 20, clearRate: 1 / 3, clears: 1 });
  });

  it("中央値を丸め前の値から計算する", () => {
    expect(median([9, 1, 4])).toBe(4);
    expect(median([1, 2, 8, 9])).toBe(5);
  });

  it("各seedの差を標本として勝敗・平均・中央値を計算する", () => {
    const a = [{ seed: 1, floor: 2 }, { seed: 2, floor: 8 }, { seed: 3, floor: 5 }];
    const b = [{ seed: 1, floor: 5 }, { seed: 2, floor: 7 }, { seed: 3, floor: 5 }];
    const result = pairComparison(a, b);
    expect(result).toMatchObject({ n: 3, wins: 1, ties: 1, losses: 1, meanDiff: 2 / 3, medianDiff: 0 });
  });

  it("95%CIは対応差の標本標準偏差と自由度n-1のt値を使う", () => {
    const a = [1, 2, 3, 4].map(seed => ({ seed, floor: 0 }));
    const b = [1, 2, 3, 4].map((seed, i) => ({ seed, floor: [1, 2, 3, 4][i] }));
    const result = pairComparison(a, b);
    const mean = 2.5;
    const sd = Math.sqrt(5 / 3);
    const margin = tCritical95(3) * sd / 2;
    expect(result.sd).toBeCloseTo(sd);
    expect(result.ci95[0]).toBeCloseTo(mean - margin);
    expect(result.ci95[1]).toBeCloseTo(mean + margin);
  });

  it("runs=1相当では不正確なゼロ幅CIを出さない", () => {
    const result = pairComparison([{ seed: 1, floor: 3 }], [{ seed: 1, floor: 4 }]);
    expect(result).toMatchObject({ n: 1, meanDiff: 1, ci95: null });
  });

  it("重複seedを黙って上書きしない", () => {
    expect(() => pairComparison(
      [{ seed: 1, floor: 3 }, { seed: 1, floor: 4 }],
      [{ seed: 1, floor: 5 }],
    )).toThrow(/重複/);
  });
});
