import { describe, expect, it } from "vitest";
import {
  calculateAttackDamage,
  estimateDirectDamageRange,
  calculateBaseIncomingDamage,
  critOverflowBonus,
  decrementStatusTurn,
  doubleTierChances,
  frenzyDamageMultiplier,
  mergeStatus,
  potionHealingMultiplier,
  rollAdditionalHits,
  rollInfiniteBladeBonus,
} from "./combat.js";

describe("TASK-014 contract calculations", () => {
  it("adds 0.8% damage per missing HP percent and caps the added part at 50%", () => {
    expect(frenzyDamageMultiplier(100, 100, true)).toBe(1);
    expect(frenzyDamageMultiplier(99, 100, true)).toBeCloseTo(1.008);
    expect(frenzyDamageMultiplier(50, 100, true)).toBe(1.4);
    expect(frenzyDamageMultiplier(0, 100, true)).toBe(1.5);
    expect(frenzyDamageMultiplier(-100, 100, true)).toBe(1.5);
    expect(frenzyDamageMultiplier(120, 100, true)).toBe(1);
    expect(frenzyDamageMultiplier(50, 100, false)).toBe(1);
  });

  it("reduces catalyst potion healing by 20% without changing normal healing", () => {
    expect(potionHealingMultiplier()).toBe(1);
    expect(potionHealingMultiplier({ potionCut20: 1 })).toBe(0.8);
    expect(potionHealingMultiplier({ potionHalf: 1 })).toBe(0.5);
    expect(potionHealingMultiplier({ potionHalf: 1, potionCut20: 1 })).toBe(0.5);
  });
});

describe("direct damage preview", () => {
  it("uses the real damage rounding at variance -1 through +2 without probabilistic criticals", () => {
    expect(estimateDirectDamageRange({ attack: 20, multiplier: 0.25, hits: 2, critChance: 80, critDamage: 200 })).toEqual({ min: 10, max: 12 });
  });

  it("includes only guaranteed critical damage", () => {
    expect(estimateDirectDamageRange({ attack: 20, multiplier: 2, guaranteedCritical: true, critDamage: 150 })).toEqual({ min: 57, max: 66 });
  });
});

describe("attack damage", () => {
  it("calculates basic damage from attack and skill multiplier", () => {
    expect(calculateAttackDamage({ attack: 10, multiplier: 2.2 })).toBe(22);
  });

  it("applies critical damage", () => {
    expect(calculateAttackDamage({
      attack: 10,
      isCritical: true,
      critDamage: 150,
      critChance: 50,
    })).toBe(15);
  });

  it("converts critical chance above 100% into critical damage", () => {
    expect(critOverflowBonus(130)).toBe(30);
    expect(calculateAttackDamage({
      attack: 10,
      isCritical: true,
      critDamage: 150,
      critChance: 130,
    })).toBe(18);
  });

  it("keeps the exact 100% boundary and converts from 101%", () => {
    expect(critOverflowBonus(100)).toBe(0);
    expect(critOverflowBonus(101)).toBe(1);
  });

  it("does not apply critical overflow to a non-critical hit", () => {
    expect(calculateAttackDamage({
      attack: 10,
      isCritical: false,
      critDamage: 150,
      critChance: 130,
    })).toBe(10);
  });

  it("keeps the existing tough and guard reductions", () => {
    expect(calculateAttackDamage({
      attack: 10,
      targetTough: true,
      targetGuarding: true,
    })).toBe(4);
  });

  it("preserves the legacy rounding order for crystalline and fragile targets", () => {
    // Legacy order: round(5 * 1.1)=6, round(6 * 0.8)=5, round(5 * 1.5)=8.
    expect(calculateAttackDamage({
      attack: 5,
      multiplier: 1.1,
      crystallineMultiplier: 0.8,
      targetFragile: true,
    })).toBe(8);
  });
});

describe("incoming damage", () => {
  it("subtracts defense as a fixed value", () => {
    expect(calculateBaseIncomingDamage(12, 5)).toBe(7);
  });

  it("keeps a minimum of one damage", () => {
    expect(calculateBaseIncomingDamage(3, 99)).toBe(1);
  });

  it("applies the same integer variance before rounding", () => {
    expect(calculateBaseIncomingDamage(12.4, 5, -1)).toBe(6);
  });
});

describe("multi-hit overflow", () => {
  it("splits rates above 100% into guaranteed and overflow tiers", () => {
    expect(doubleTierChances(0)).toEqual([]);
    expect(doubleTierChances(100)).toEqual([100]);
    expect(doubleTierChances(120)).toEqual([100, 20]);
    expect(doubleTierChances(200)).toEqual([100, 100]);
    expect(doubleTierChances(220)).toEqual([100, 100, 20]);
  });

  it("rolls each overflow tier in order", () => {
    const succeeds = [0.5, 0.1];
    expect(rollAdditionalHits(120, () => succeeds.shift())).toBe(2);

    const failsOverflow = [0.5, 0.3];
    expect(rollAdditionalHits(120, () => failsOverflow.shift())).toBe(1);
  });

  it("consumes one random value per attempted tier", () => {
    let calls = 0;
    const random = () => {
      calls += 1;
      return calls < 3 ? 0.5 : 0.3;
    };
    expect(rollAdditionalHits(220, random)).toBe(2);
    expect(calls).toBe(3);

    calls = 0;
    expect(rollAdditionalHits(0, random)).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("深淵覚醒: 無限刃の上限", () => {
  it("never lets total hits (baseHits + bonus) exceed the 10-hit cap even at a guaranteed 100% chance", () => {
    expect(rollInfiniteBladeBonus(1, 10, 1, 1, () => 0)).toBe(9); // 常に成功する乱数でも打ち止め
  });

  it("respects a smaller baseHits-derived cap for multi-hit skills", () => {
    expect(rollInfiniteBladeBonus(1, 10, 3, 1, () => 0)).toBe(7);
  });

  it("never reduces a bonus already below the cap", () => {
    expect(rollInfiniteBladeBonus(2, 10, 1, 0, () => 1)).toBe(2); // 0%の追加抽選は伸びない
  });
});

describe("status effects", () => {
  it("adds poison and bleed damage while keeping the longer duration", () => {
    const poison = mergeStatus({ poison: { turns: 2, dmg: 4 } }, "poison", 3, 5);
    expect(poison.poison).toEqual({ turns: 3, dmg: 9 });

    const bleed = mergeStatus({ bleed: { turns: 4, dmg: 7 } }, "bleed", 2, 3);
    expect(bleed.bleed).toEqual({ turns: 4, dmg: 10 });
  });

  it("does not replace weaken with a weaker value", () => {
    const status = mergeStatus({ weaken: { turns: 1, dmg: 20 } }, "weaken", 3, 15);
    expect(status.weaken).toEqual({ turns: 3, dmg: 20 });
  });

  it("decrements a status turn without mutating the input", () => {
    const before = { burn: { turns: 2, dmg: 6 } };
    const after = decrementStatusTurn(before, "burn");
    expect(after.burn).toEqual({ turns: 1, dmg: 6 });
    expect(before.burn.turns).toBe(2);
  });

  it("stops at zero and preserves unrelated statuses", () => {
    const before = {
      freeze: { turns: 1, dmg: 0 },
      poison: { turns: 2, dmg: 5 },
    };
    const after = decrementStatusTurn(before, "freeze");
    expect(after.freeze.turns).toBe(0);
    expect(after.poison).toBe(before.poison);
    expect(before.freeze.turns).toBe(1);
  });
});
