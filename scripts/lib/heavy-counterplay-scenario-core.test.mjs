import { describe, expect, it } from "vitest";
import { runScenarioFight, runScenarioSet, SCENARIOS, summarizeScenario } from "./heavy-counterplay-scenario-core.mjs";

describe("heavy counterplay scenario", () => {
  it("Aではstrategicが防御し、反撃態勢を獲得・消費する", () => {
    const result = runScenarioFight(SCENARIOS.A[0], "strategic", 1);
    expect(result.defended).toBeGreaterThan(0);
    expect(result.riposteGained).toBeGreaterThan(0);
    expect(result.riposteConsumed).toBeGreaterThan(0);
    expect(result.damageInterrupts).toBe(0);
    expect(result.ccInterrupts).toBe(0);
  });

  it("Bではstrategicが火力中断を選び、大技ダメージを受けない", () => {
    const result = runScenarioFight(SCENARIOS.B[0], "strategic", 2);
    expect(result.strategicChoices[0].action).toBe("attack");
    expect(result.damageInterrupts).toBeGreaterThan(0);
  });

  it("Cではstrategicが確定CCを選んで中断する", () => {
    const result = runScenarioFight(SCENARIOS.C[0], "strategic", 3);
    expect(result.strategicChoices[0]).toMatchObject({ action: "skill", skillKey: "frostnova" });
    expect(result.ccInterrupts).toBeGreaterThan(0);
  });

  it("CC耐性100%なら付与失敗を中断扱いにしない", () => {
    const config = structuredClone(SCENARIOS.C[0]);
    config.enemy.ccResist = 1;
    const result = runScenarioFight(config, "cc-priority", 4);
    expect(result.ccAttempts).toBeGreaterThan(0);
    expect(result.ccInterrupts).toBe(0);
  });

  it("Dではstrategicが初期状態に応じてCC・火力・防御を使い分ける", () => {
    const results = runScenarioSet({ scenario: "D", policy: "strategic", runs: 3, seed: 10, workers: 1 });
    const firstChoices = results.map(result => result.strategicChoices[0].action === "skill" ? "cc" : result.strategicChoices[0].action);
    expect(new Set(firstChoices)).toEqual(new Set(["cc", "attack", "defend"]));
  });

  it("同じseedならworker数を変えても完全一致する", () => {
    const one = runScenarioSet({ scenario: "D", policy: "strategic", runs: 20, seed: 99, workers: 1 });
    const four = runScenarioSet({ scenario: "D", policy: "strategic", runs: 20, seed: 99, workers: 4 });
    expect(four).toEqual(one);
  });

  it("連撃を同一行動の合計として火力中断へ含める", () => {
    const config = structuredClone(SCENARIOS.B[0]);
    config.player.atk = 22;
    config.player.double = 100;
    const result = runScenarioFight(config, "damage-priority", 5);
    expect(result.maxHitsInAction).toBeGreaterThanOrEqual(2);
    expect(result.damageInterrupts).toBeGreaterThan(0);
  });

  it("集計に平均と中央値、エラー・timeoutを含む", () => {
    const summary = summarizeScenario(runScenarioSet({ scenario: "A", policy: "strategic", runs: 5, seed: 1, workers: 2 }));
    expect(summary).toMatchObject({ n: 5, errors: 0, timeouts: 0 });
    expect(summary.endHp).toHaveProperty("mean");
    expect(summary.endHp).toHaveProperty("median");
  });
});
