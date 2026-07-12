import { describe, expect, it } from "vitest";
import {
  resolveEnemyOngoingEffects,
  resolvePlayerOngoingEffects,
} from "./combat.js";

describe("player ongoing effects", () => {
  it("applies blood bowl before player poison", () => {
    const result = resolvePlayerOngoingEffects({
      player: { hp: 50, pPoison: { turns: 2, dmg: 7 } },
      maxHp: 100,
      drainPerTurn: 3,
    });
    expect(result.nextPlayer).toMatchObject({ hp: 40, pPoison: { turns: 1, dmg: 7 } });
    expect(result.events.map(event => event.source)).toEqual(["bloodBowl", "poison"]);
    expect(result.shouldStop).toBe(false);
  });

  it("stops immediately when blood bowl kills the player", () => {
    const result = resolvePlayerOngoingEffects({
      player: { hp: 2, pPoison: { turns: 2, dmg: 7 } },
      maxHp: 100,
      drainPerTurn: 3,
    });
    expect(result.nextPlayer.hp).toBe(-1);
    expect(result.nextPlayer.pPoison.turns).toBe(2);
    expect(result.events.map(event => event.source)).toEqual(["bloodBowl"]);
    expect(result).toMatchObject({ shouldStop: true, stopReason: "playerDead" });
  });

  it("stops after player poison kills the player", () => {
    const result = resolvePlayerOngoingEffects({
      player: { hp: 5, pPoison: { turns: 1, dmg: 5 } },
      maxHp: 100,
    });
    expect(result.nextPlayer).toMatchObject({ hp: 0, pPoison: { turns: 0, dmg: 5 } });
    expect(result).toMatchObject({ shouldStop: true, stopReason: "playerDead" });
  });

  it("does not trigger zero-turn player poison", () => {
    const result = resolvePlayerOngoingEffects({
      player: { hp: 20, pPoison: { turns: 0, dmg: 99 } },
      maxHp: 100,
    });
    expect(result.nextPlayer.hp).toBe(20);
    expect(result.events).toEqual([]);
  });
});

describe("enemy ongoing effects", () => {
  it("applies regen, poison, bleed, and burn in the existing order", () => {
    const result = resolveEnemyOngoingEffects({
      enemy: {
        hp: 50,
        maxHp: 100,
        trait: "regen",
        status: {
          poison: { turns: 2, dmg: 4 },
          bleed: { turns: 3, dmg: 5 },
          burn: { turns: 1, dmg: 0 },
        },
      },
      burnRate: 0.06,
    });
    expect(result.nextEnemy.hp).toBe(41); // 50 + 6 - 4 - 5 - 6
    expect(result.nextEnemy.status).toMatchObject({
      poison: { turns: 1 },
      bleed: { turns: 2 },
      burn: { turns: 0 },
    });
    expect(result.events.map(event => event.source)).toEqual(["regen", "poison", "bleed", "burn"]);
  });

  it("processes all damage-over-time effects, then stops before status turns when the enemy dies", () => {
    const result = resolveEnemyOngoingEffects({
      enemy: {
        hp: 5,
        maxHp: 100,
        status: {
          poison: { turns: 1, dmg: 4 },
          bleed: { turns: 1, dmg: 3 },
          burn: { turns: 1, dmg: 0 },
          freeze: { turns: 2, dmg: 0 },
        },
      },
      burnRate: 0.06,
    });
    expect(result.nextEnemy.hp).toBe(-8);
    expect(result.events.map(event => event.source)).toEqual(["poison", "bleed", "burn"]);
    expect(result.nextEnemy.status).toMatchObject({
      poison: { turns: 0 },
      bleed: { turns: 0 },
      burn: { turns: 0 },
    });
    expect(result.nextEnemy.status.freeze.turns).toBe(2);
    expect(result).toMatchObject({ shouldStop: true, stopReason: "enemyDead" });
  });

  it("decrements freeze and stun and marks the enemy incapacitated", () => {
    const result = resolveEnemyOngoingEffects({
      enemy: {
        hp: 30,
        maxHp: 30,
        status: {
          freeze: { turns: 2, dmg: 0 },
          stun: { turns: 1, dmg: 0 },
        },
      },
    });
    expect(result.nextEnemy.status).toMatchObject({ freeze: { turns: 1 }, stun: { turns: 0 } });
    expect(result).toMatchObject({ shouldStop: true, stopReason: "incapacitated", incapacitated: true });
  });

  it("decrements weaken without incapacitating the enemy", () => {
    const result = resolveEnemyOngoingEffects({
      enemy: {
        hp: 30,
        maxHp: 30,
        status: { weaken: { turns: 1, dmg: 20 } },
      },
    });
    expect(result.nextEnemy.status.weaken).toEqual({ turns: 0, dmg: 20 });
    expect(result).toMatchObject({ shouldStop: false, stopReason: null, incapacitated: false });
  });

  it("does not trigger zero-turn enemy statuses", () => {
    const result = resolveEnemyOngoingEffects({
      enemy: {
        hp: 30,
        maxHp: 30,
        status: {
          poison: { turns: -1, dmg: 99 },
          bleed: { turns: 0, dmg: 99 },
          burn: { turns: -2, dmg: 0 },
          freeze: { turns: 0, dmg: 0 },
          stun: { turns: -1, dmg: 0 },
          weaken: { turns: 0, dmg: 20 },
        },
      },
      burnRate: 1,
    });
    expect(result.nextEnemy.hp).toBe(30);
    expect(result.events).toEqual([]);
    expect(result.shouldStop).toBe(false);
  });

  it("does not mutate player or enemy inputs", () => {
    const player = Object.freeze({ hp: 20, pPoison: Object.freeze({ turns: 2, dmg: 3 }) });
    const enemy = Object.freeze({
      hp: 20,
      maxHp: 30,
      trait: "regen",
      status: Object.freeze({ poison: Object.freeze({ turns: 1, dmg: 2 }) }),
    });
    const playerResult = resolvePlayerOngoingEffects({ player, maxHp: 20, drainPerTurn: 3 });
    const enemyResult = resolveEnemyOngoingEffects({ enemy, burnRate: 0.06 });
    expect(player).toEqual({ hp: 20, pPoison: { turns: 2, dmg: 3 } });
    expect(enemy).toEqual({
      hp: 20,
      maxHp: 30,
      trait: "regen",
      status: { poison: { turns: 1, dmg: 2 } },
    });
    expect(playerResult.nextPlayer.pPoison).not.toBe(player.pPoison);
    expect(enemyResult.nextEnemy.status).not.toBe(enemy.status);
    expect(enemyResult.nextEnemy.status.poison).not.toBe(enemy.status.poison);
  });

  it("preserves the enemy object shape when status is absent", () => {
    const enemy = { hp: 30, maxHp: 30, name: "shape-check" };
    const result = resolveEnemyOngoingEffects({ enemy });
    expect(Object.hasOwn(result.nextEnemy, "status")).toBe(false);
    expect(result.nextEnemy).toEqual(enemy);
  });
});
