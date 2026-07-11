import { describe, expect, it } from "vitest";
import {
  calculateAttackDamage,
  calculateBaseIncomingDamage,
  critOverflowBonus,
  decrementStatusTurn,
  doubleTierChances,
  mergeStatus,
  rollAdditionalHits,
} from "./combat.js";

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

  it("keeps the existing tough and guard reductions", () => {
    expect(calculateAttackDamage({
      attack: 10,
      targetTough: true,
      targetGuarding: true,
    })).toBe(4);
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
    expect(doubleTierChances(120)).toEqual([100, 20]);
    expect(doubleTierChances(220)).toEqual([100, 100, 20]);
  });

  it("rolls each overflow tier in order", () => {
    const succeeds = [0.5, 0.1];
    expect(rollAdditionalHits(120, () => succeeds.shift())).toBe(2);

    const failsOverflow = [0.5, 0.3];
    expect(rollAdditionalHits(120, () => failsOverflow.shift())).toBe(1);
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
});
