import { describe, expect, it } from "vitest";
import { initializeRhythm, previewPlayerAction, resolveEnemyRhythmAction, resolvePlayerRhythmAction } from "./combatRhythm.js";

describe("three enemy combat rhythms", () => {
  it("処刑人は攻撃連打で崩れず、防御準備後の処刑防御で崩れる", () => {
    let enemy = initializeRhythm({ combatRhythm: "executioner" });
    expect(previewPlayerAction(enemy, "attack").multiplier).toBe(0.25);
    enemy = resolvePlayerRhythmAction(enemy, "attack").enemy;
    expect(enemy.rhythmState.phase).toBe("armored");
    enemy = resolvePlayerRhythmAction(enemy, "defend").enemy;
    enemy = resolveEnemyRhythmAction(enemy, { intent: "heavy", defended: true }).enemy;
    expect(enemy.rhythmState.phase).toBe("exposed");
    expect(previewPlayerAction(enemy, "skill").multiplier).toBe(2);
  });

  it("処刑人は防御禁止でもCC中断で装甲を崩せる", () => {
    const enemy = resolveEnemyRhythmAction(initializeRhythm({ combatRhythm: "executioner" }), { intent: "heavy", defended: false, ccInterrupted: true }).enemy;
    expect(enemy.rhythmState.phase).toBe("exposed");
  });

  it("古竜は2行動飛翔し、ブレス後2行動だけ過熱する", () => {
    let enemy = initializeRhythm({ combatRhythm: "dragon", intent: "attack" });
    expect(previewPlayerAction(enemy, "skill").multiplier).toBe(0.3);
    enemy = resolvePlayerRhythmAction(enemy, "defend").enemy;
    enemy = resolvePlayerRhythmAction(enemy, "heal").enemy;
    expect(enemy.rhythmState.phase).toBe("breath");
    enemy = resolveEnemyRhythmAction(enemy, { intent: "heavy", defended: true }).enemy;
    expect(previewPlayerAction(enemy, "skill").multiplier).toBe(1.6);
    enemy = resolvePlayerRhythmAction(enemy, "skill").enemy;
    enemy = resolvePlayerRhythmAction(enemy, "attack").enemy;
    expect(enemy.rhythmState.phase).toBe("flying");
  });

  it("結晶は異なる3カテゴリで崩れ、同一カテゴリ反復を80%軽減する", () => {
    let enemy = initializeRhythm({ combatRhythm: "crystal" });
    enemy = resolvePlayerRhythmAction(enemy, "attack").enemy;
    expect(previewPlayerAction(enemy, "attack").multiplier).toBe(0.2);
    enemy = resolvePlayerRhythmAction(enemy, "defend").enemy;
    enemy = resolvePlayerRhythmAction(enemy, "skill").enemy;
    expect(enemy.rhythmState.phase).toBe("exposed");
    expect(previewPlayerAction(enemy, "attack").multiplier).toBe(1.5);
  });

  it("利用可能カテゴリが少なくても反復3回で詰まない", () => {
    let enemy = initializeRhythm({ combatRhythm: "crystal" });
    for (let i = 0; i < 4; i++) enemy = resolvePlayerRhythmAction(enemy, "attack").enemy;
    expect(enemy.rhythmState.phase).toBe("exposed");
  });

  it("入力を破壊しない", () => {
    const input = initializeRhythm({ combatRhythm: "dragon" });
    resolvePlayerRhythmAction(input, "defend");
    expect(input.rhythmState).toEqual({ phase: "flying", actionsLeft: 2 });
  });
});
