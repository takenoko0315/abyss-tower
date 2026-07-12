import { describe, expect, it } from "vitest";
import { attackOnlyPolicy, basicPolicy, strategicPolicy } from "./combat-policies.mjs";

// テスト用の最小限の状態を組み立てるヘルパー
function makeState({
  hp = 100, maxHp = 100, potions = 1, skills = [], petrified = false,
  cds = {}, noDefend = 0, noSkill = 0,
  enemy = { intent: "attack", hp: 50, maxHp: 100, guardTurns: 0, status: {}, gimmick: null },
} = {}) {
  return {
    player: { hp, potions, skills, petrified },
    stats: { maxHp, noDefend, noSkill },
    cds,
    enemy,
  };
}

describe("attackOnlyPolicy", () => {
  it("常に通常攻撃を選ぶ(HPが低くても回復しない)", () => {
    expect(attackOnlyPolicy(makeState({ hp: 5, potions: 3 }))).toEqual({ action: "attack" });
  });

  it("敵が大技を予告していても防御しない", () => {
    const state = makeState({ enemy: { intent: "heavy", hp: 50, maxHp: 100, guardTurns: 0, status: {} } });
    expect(attackOnlyPolicy(state)).toEqual({ action: "attack" });
  });
});

describe("basicPolicy", () => {
  it("HPが危険域(30%以下)で回復薬があれば回復する", () => {
    const state = makeState({ hp: 25, maxHp: 100, potions: 1 });
    expect(basicPolicy(state)).toEqual({ action: "potion" });
  });

  it("HPが危険域でも回復薬がなければ回復以外の判断に進む", () => {
    const state = makeState({ hp: 25, maxHp: 100, potions: 0 });
    expect(basicPolicy(state)).not.toEqual({ action: "potion" });
  });

  it("敵が大技を予告していれば防御する", () => {
    const state = makeState({ hp: 90, enemy: { intent: "heavy", hp: 50, maxHp: 100, guardTurns: 0, status: {} } });
    expect(basicPolicy(state)).toEqual({ action: "defend" });
  });

  it("敵が連攻を予告していれば防御する", () => {
    const state = makeState({ hp: 90, enemy: { intent: "flurry", hp: 50, maxHp: 100, guardTurns: 0, status: {} } });
    expect(basicPolicy(state)).toEqual({ action: "defend" });
  });

  it("防御封印(noDefend)中は大技予告でも防御せず通常攻撃になる", () => {
    const state = makeState({
      hp: 90, noDefend: 1,
      enemy: { intent: "heavy", hp: 50, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(basicPolicy(state)).toEqual({ action: "attack" });
  });

  it("敵が防御中で使用可能なスキルがあればスキルを使う", () => {
    const state = makeState({
      hp: 90, skills: ["strike"], cds: { strike: 0 },
      enemy: { intent: "attack", hp: 50, maxHp: 100, guardTurns: 1, status: {} },
    });
    expect(basicPolicy(state)).toEqual({ action: "skill", skillKey: "strike" });
  });

  it("敵が防御中でもスキルがクールダウン中なら通常攻撃", () => {
    const state = makeState({
      hp: 90, skills: ["strike"], cds: { strike: 2 },
      enemy: { intent: "attack", hp: 50, maxHp: 100, guardTurns: 1, status: {} },
    });
    expect(basicPolicy(state)).toEqual({ action: "attack" });
  });

  it("それ以外は通常攻撃", () => {
    const state = makeState({ hp: 90 });
    expect(basicPolicy(state)).toEqual({ action: "attack" });
  });

  it("石化中は通常攻撃しか選べない", () => {
    const state = makeState({ hp: 90, petrified: true, potions: 5 });
    expect(basicPolicy(state)).toEqual({ action: "attack" });
  });
});

describe("strategicPolicy", () => {
  it("HP25%以下で回復スキルがあれば回復薬より優先する", () => {
    const state = makeState({
      hp: 20, maxHp: 100, potions: 3, skills: ["healchant"], cds: { healchant: 0 },
    });
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "healchant" });
  });

  it("HP25%以下で回復スキルがなければ回復薬を使う", () => {
    const state = makeState({ hp: 20, maxHp: 100, potions: 2 });
    expect(strategicPolicy(state)).toEqual({ action: "potion" });
  });

  it("大技予告時、凍結/気絶スキルが使えれば最優先で使う", () => {
    const state = makeState({
      hp: 90, skills: ["frostnova"], cds: { frostnova: 0 },
      enemy: { intent: "heavy", hp: 80, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "frostnova" });
  });

  it("敵が既に凍結/気絶中なら妨害スキルより防御を優先する", () => {
    const state = makeState({
      hp: 90, skills: ["frostnova"], cds: { frostnova: 0 },
      enemy: { intent: "heavy", hp: 80, maxHp: 100, guardTurns: 0, status: { freeze: { turns: 1, dmg: 0 } } },
    });
    expect(strategicPolicy(state)).toEqual({ action: "defend" });
  });

  it("大技予告時、構え系スキル(ironguard)があれば防御より優先する", () => {
    const state = makeState({
      hp: 90, skills: ["ironguard"], cds: { ironguard: 0 },
      enemy: { intent: "heavy", hp: 80, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "ironguard" });
  });

  it("大技予告時、他に手段がなければ防御する", () => {
    const state = makeState({
      hp: 90, enemy: { intent: "heavy", hp: 80, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(strategicPolicy(state)).toEqual({ action: "defend" });
  });

  it("毒牙ギミックの毒撃予告には防御する", () => {
    const state = makeState({
      hp: 90, enemy: { intent: "venom", hp: 80, maxHp: 100, guardTurns: 0, status: {}, gimmick: "venomfang" },
    });
    expect(strategicPolicy(state)).toEqual({ action: "defend" });
  });

  it("HPが十分高くギミックもなければ毒撃を無視して他の判断に進む", () => {
    const state = makeState({
      hp: 95, enemy: { intent: "venom", hp: 80, maxHp: 100, guardTurns: 0, status: {}, gimmick: null },
    });
    expect(strategicPolicy(state)).not.toEqual({ action: "defend" });
  });

  it("敵が構え中は使用可能スキルの中で倍率最大のものを選ぶ", () => {
    const state = makeState({
      hp: 90, skills: ["strike", "flamestrike"], cds: { strike: 0, flamestrike: 0 },
      enemy: { intent: "attack", hp: 80, maxHp: 100, guardTurns: 1, status: {} },
    });
    // strike: 2.2倍×1, flamestrike: 1.5倍×1 → strikeが選ばれる
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "strike" });
  });

  it("敵の残りHPが20%以下ならスキルで畳み掛ける", () => {
    const state = makeState({
      hp: 90, skills: ["strike"], cds: { strike: 0 },
      enemy: { intent: "attack", hp: 15, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "strike" });
  });

  it("HP45%以下で回復薬があれば回復する(緊急域でも構え中でもない場合)", () => {
    const state = makeState({ hp: 40, maxHp: 100, potions: 1 });
    expect(strategicPolicy(state)).toEqual({ action: "potion" });
  });

  it("平常時は使用可能な攻撃スキルを温存せず使う", () => {
    const state = makeState({ hp: 90, skills: ["strike"], cds: { strike: 0 } });
    expect(strategicPolicy(state)).toEqual({ action: "skill", skillKey: "strike" });
  });

  it("使える手段が何もなければ通常攻撃", () => {
    const state = makeState({ hp: 90 });
    expect(strategicPolicy(state)).toEqual({ action: "attack" });
  });

  it("石化中は通常攻撃しか選べない", () => {
    const state = makeState({ hp: 10, petrified: true, potions: 5, skills: ["healchant"] });
    expect(strategicPolicy(state)).toEqual({ action: "attack" });
  });

  it("無音の誓い(noSkill)中はスキルを使わず、防御や回復にフォールバックする", () => {
    const state = makeState({
      hp: 90, noSkill: 1, skills: ["frostnova"], cds: { frostnova: 0 },
      enemy: { intent: "heavy", hp: 80, maxHp: 100, guardTurns: 0, status: {} },
    });
    expect(strategicPolicy(state)).toEqual({ action: "defend" });
  });
});
