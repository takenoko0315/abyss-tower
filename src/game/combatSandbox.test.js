import { describe, expect, it } from "vitest";
import { applySandboxFinalMultipliers, createSandboxEquipment, normalizeSandboxCount, normalizeSandboxMultiplier, SANDBOX_PRESETS, sandboxSkillsFor } from "./combatSandbox.js";

describe("combat sandbox presets", () => {
  it("all non-empty presets provide all six existing equipment slots", () => {
    for (const preset of SANDBOX_PRESETS.filter(item => item.key !== "none")) {
      expect(Object.values(createSandboxEquipment(preset.key)).filter(Boolean)).toHaveLength(6);
    }
  });

  it("uses class-suitable skills for required combinations", () => {
    expect(sandboxSkillsFor("warrior", "defenseRiposte", "strike")).toContain("deflect");
    expect(sandboxSkillsFor("mage", "cc", "frostnova")).toContain("frostnova");
    expect(sandboxSkillsFor("assassin", "status", "truestrike")).toContain("poisonblade");
  });

  it("normalizes invalid manual controls", () => {
    for (const value of [NaN, Infinity, -Infinity, -1, 3]) expect(normalizeSandboxMultiplier(value)).toBe(1);
    expect(normalizeSandboxCount(NaN, 3)).toBe(3);
    expect(normalizeSandboxCount(-5)).toBe(0);
    expect(normalizeSandboxCount(Infinity, 2)).toBe(2);
  });

  it("applies multipliers to final equipment-inclusive values without mutation", () => {
    const player = { atk: 10, def: 4, maxHp: 80 };
    const next = applySandboxFinalMultipliers(player, { atk: 50, def: 20, maxHp: 200 }, { atk: 1.5, def: 2, hp: 0.5 });
    expect(next).toEqual({ atk: 35, def: 24, maxHp: -20 });
    expect(player).toEqual({ atk: 10, def: 4, maxHp: 80 });
  });
});
