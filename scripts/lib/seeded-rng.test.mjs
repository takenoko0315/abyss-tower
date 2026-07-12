import { describe, expect, it } from "vitest";
import { mulberry32, installSeededRandom } from "./seeded-rng.mjs";

describe("mulberry32", () => {
  it("同じシードなら同じ数列を返す", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("シードが違えば数列も変わる", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("値は常に[0,1)の範囲", () => {
    const r = mulberry32(999);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("installSeededRandom", () => {
  it("Math.randomを差し替え、restoreで元に戻す", () => {
    const original = Math.random;
    const restore = installSeededRandom(42);
    expect(Math.random).not.toBe(original);
    const first = Math.random();
    restore();
    expect(Math.random).toBe(original);
    // 同じシードで再度差し替えれば同じ最初の値になる(再現性)
    const restore2 = installSeededRandom(42);
    expect(Math.random()).toBe(first);
    restore2();
  });
});
