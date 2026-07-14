import { describe, expect, it } from "vitest";
import { collectBuildResonance, getResonanceLevel, RESONANCE_SYSTEMS } from "./buildResonance.js";

describe("getResonanceLevel", () => {
  it("0〜2点は共鳴なし", () => {
    expect(getResonanceLevel(0)).toBe(0);
    expect(getResonanceLevel(2)).toBe(0);
  });
  it("3〜5点は共鳴I", () => {
    expect(getResonanceLevel(3)).toBe(1);
    expect(getResonanceLevel(5)).toBe(1);
  });
  it("6点以上は共鳴II", () => {
    expect(getResonanceLevel(6)).toBe(2);
    expect(getResonanceLevel(9)).toBe(2);
  });
});

describe("collectBuildResonance", () => {
  it("何も持たない状態では全系統0点", () => {
    const result = collectBuildResonance({ player: {}, equip: {} });
    expect(result.poison).toEqual({ score: 0, level: 0 });
    expect(result.burn.score).toBe(0);
    expect(result.bleed.score).toBe(0);
    expect(result.multi.score).toBe(0);
  });

  it("player/equipが未定義でもクラッシュしない(古い状態への耐性)", () => {
    expect(() => collectBuildResonance()).not.toThrow();
    expect(() => collectBuildResonance({})).not.toThrow();
    const result = collectBuildResonance({});
    expect(result.poison.score).toBe(0);
  });

  it("同じ装備に同系統のアフィックスが複数あっても装備由来は1点まで", () => {
    const equip = { weapon: { stats: { poisonPower: 20, dmgVsStatus: 10 } } };
    const result = collectBuildResonance({ player: {}, equip });
    expect(result.poison.score).toBe(1);
  });

  it("固有能力とアフィックスを同じ装備が両方持っていても、その2カテゴリはそれぞれ1点ずつ数える", () => {
    // アフィックス由来1点 + 固有能力由来1点の、独立した2カテゴリとして加点される
    const equip = { weapon: { stats: { poisonPower: 20 }, ability: "scythe" } };
    const result = collectBuildResonance({ player: {}, equip });
    expect(result.poison.score).toBe(2);
  });

  it("装備アフィックス+固有能力+スキル+レリック+出自+執着の6点で共鳴IIに到達する", () => {
    const player = { buildObsession: "poison", skills: ["poisonblade"], relics: ["venom"], origin: "venom" };
    const equip = { weapon: { stats: { poisonPower: 20 }, ability: "scythe" } };
    const result = collectBuildResonance({ player, equip });
    expect(result.poison.score).toBe(6);
    expect(result.poison.level).toBe(2);
  });

  it("3点ちょうどで共鳴Iになる", () => {
    const player = { buildObsession: "burn" };
    const equip = { weapon: { stats: { burnPower: 20 } }, armor: { ability: "cinder" } };
    const result = collectBuildResonance({ player, equip });
    expect(result.burn.score).toBe(3);
    expect(result.burn.level).toBe(1);
  });

  it("出血系統は関連スキル・レリック・出自で加点される", () => {
    const player = { skills: ["laceration"], relics: ["bloodring"], origin: "bloodblade" };
    const result = collectBuildResonance({ player, equip: {} });
    expect(result.bleed.score).toBe(3);
  });

  it("連撃系統は関連スキル・レリック・出自で加点される", () => {
    const player = { skills: ["flurry"], relics: ["feather"], origin: "shadow" };
    const result = collectBuildResonance({ player, equip: {} });
    expect(result.multi.score).toBe(3);
  });

  it("player.buildObsessionが未設定でも他の加点は正常に機能する", () => {
    const player = { skills: ["poisonblade"] };
    const result = collectBuildResonance({ player, equip: {} });
    expect(result.poison.score).toBe(1);
  });
});

describe("guard(防御・棘)系統", () => {
  it("RESONANCE_SYSTEMSにguardが含まれる", () => {
    expect(RESONANCE_SYSTEMS).toContain("guard");
  });

  it("装備アフィックス+固有能力+スキル+レリック+出自+執着の6点で共鳴IIに到達する", () => {
    const player = { buildObsession: "guard", skills: ["ironguard"], relics: ["heart"], origin: "thorn" };
    const equip = { weapon: { stats: { thorns: 20 }, ability: "ironthorn" } };
    const result = collectBuildResonance({ player, equip });
    expect(result.guard.score).toBe(6);
    expect(result.guard.level).toBe(2);
  });

  it("3点ちょうどで共鳴Iになる(装備アフィックス+固有能力+執着)", () => {
    const player = { buildObsession: "guard" };
    const equip = { weapon: { stats: { thorns: 20 }, ability: "ironthorn" } };
    const result = collectBuildResonance({ player, equip });
    expect(result.guard.score).toBe(3);
    expect(result.guard.level).toBe(1);
  });

  it("古いplayer/equip状態でもguardスコアはクラッシュせず0点になる", () => {
    expect(() => collectBuildResonance()).not.toThrow();
    expect(() => collectBuildResonance({})).not.toThrow();
    const result = collectBuildResonance({});
    expect(result.guard.score).toBe(0);
    expect(result.guard.level).toBe(0);
  });

  it("guard追加後も他系統(poison)のスコア計算は変わらない", () => {
    const player = { buildObsession: "poison", skills: ["poisonblade"], relics: ["venom"], origin: "venom" };
    const equip = { weapon: { stats: { poisonPower: 20 }, ability: "scythe" } };
    const result = collectBuildResonance({ player, equip });
    expect(result.poison.score).toBe(6);
    expect(result.poison.level).toBe(2);
    expect(result.guard.score).toBe(0);
  });
});
