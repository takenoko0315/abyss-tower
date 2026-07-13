import { describe, expect, it } from "vitest";
import { attackOnlyPolicy, greedyPolicy, basicPolicy, strategicPolicy, decisionCandidates } from "./combat-policies.mjs";

// テスト用の最小限の状態を組み立てるヘルパー
function makeState({
  hp = 100, maxHp = 100, atk = 10, potions = 1, skills = [], petrified = false,
  cds = {}, noDefend = 0, noSkill = 0,
  enemy = { intent: "attack", hp: 50, maxHp: 100, guardTurns: 0, status: {}, gimmick: null },
} = {}) {
  return {
    player: { hp, potions, skills, petrified },
    stats: { maxHp, atk, noDefend, noSkill },
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

describe("strategic combat rhythms", () => {
  it("処刑人の装甲中は攻撃せず受け流し準備をする", () => {
    const enemy = { combatRhythm: "executioner", rhythmState: { phase: "armored", parryReady: false }, intent: "attack", hp: 100, maxHp: 100, status: {} };
    expect(strategicPolicy(makeState({ skills: ["strike"], enemy }))).toEqual({ action: "defend" });
  });

  it("古竜の飛翔中は防御し、過熱中は攻撃スキルを使う", () => {
    const flying = { combatRhythm: "dragon", rhythmState: { phase: "flying", actionsLeft: 2 }, intent: "attack", hp: 100, maxHp: 100, status: {} };
    expect(strategicPolicy(makeState({ skills: ["strike"], enemy: flying }))).toEqual({ action: "defend" });
    const hot = { ...flying, rhythmState: { phase: "overheated", actionsLeft: 2 } };
    expect(strategicPolicy(makeState({ skills: ["strike"], enemy: hot }))).toEqual({ action: "skill", skillKey: "strike" });
  });

  it("結晶では直前と違うカテゴリを選ぶ", () => {
    const enemy = { combatRhythm: "crystal", rhythmState: { phase: "barrier", lastCategory: "defend", categories: ["defend"] }, intent: "attack", hp: 100, maxHp: 100, status: {} };
    expect(strategicPolicy(makeState({ skills: ["strike"], enemy }))).toEqual({ action: "skill", skillKey: "strike" });
  });
});

describe("decisionCandidates", () => {
  it("通常攻撃不能時にも利用可能な行動へ決定的にフォールバックできる", () => {
    const state = makeState({ hp: 20, potions: 1, skills: ["strike"], cds: { strike: 0 } });
    expect(decisionCandidates({ action: "attack" }, state)).toEqual([
      { action: "attack" },
      { action: "defend" },
      { action: "potion" },
      { action: "skill", skillKey: "strike" },
    ]);
  });

  it("禁止・一時利用不能な行動をフォールバック候補に入れない", () => {
    const state = makeState({ hp: 20, potions: 0, skills: ["strike"], cds: { strike: 2 }, noDefend: 1, noSkill: 1 });
    expect(decisionCandidates({ action: "skill", skillKey: "strike" }, state)).toEqual([
      { action: "skill", skillKey: "strike" },
      { action: "attack" },
    ]);
  });

  it("石化中は解除手段となる通常攻撃以外を追加しない", () => {
    const state = makeState({ petrified: true, potions: 3, skills: ["strike"] });
    expect(decisionCandidates({ action: "attack" }, state)).toEqual([{ action: "attack" }]);
  });
});

describe("greedyPolicy", () => {
  it("HPが30%以下で回復薬があれば回復する", () => {
    const state = makeState({ hp: 25, maxHp: 100, potions: 1 });
    expect(greedyPolicy(state)).toEqual({ action: "potion" });
  });

  it("HPが30%以下でも回復薬がなければスキル/攻撃に進む", () => {
    const state = makeState({ hp: 25, maxHp: 100, potions: 0 });
    expect(greedyPolicy(state)).not.toEqual({ action: "potion" });
  });

  it("使用可能なスキルがあれば倍率計算せず先頭のものを使う", () => {
    const state = makeState({
      hp: 90, skills: ["flamestrike", "strike"], cds: { flamestrike: 0, strike: 0 },
    });
    // strikeの方が倍率は高い(2.2>1.5)が、greedyは並び順の先頭(flamestrike)をそのまま使う
    expect(greedyPolicy(state)).toEqual({ action: "skill", skillKey: "flamestrike" });
  });

  it("敵が大技を予告していても防御しない", () => {
    const state = makeState({ hp: 90, enemy: { intent: "heavy", hp: 50, maxHp: 100, guardTurns: 0, status: {} } });
    expect(greedyPolicy(state)).toEqual({ action: "attack" });
  });

  it("敵が防御中でも気にせず通常攻撃(スキルが無ければ)", () => {
    const state = makeState({ hp: 90, enemy: { intent: "attack", hp: 50, maxHp: 100, guardTurns: 1, status: {} } });
    expect(greedyPolicy(state)).toEqual({ action: "attack" });
  });

  it("敵の毒牙ギミックを考慮せず通常攻撃", () => {
    const state = makeState({
      hp: 90, enemy: { intent: "venom", hp: 50, maxHp: 100, guardTurns: 0, status: {}, gimmick: "venomfang" },
    });
    expect(greedyPolicy(state)).toEqual({ action: "attack" });
  });

  it("石化中はスキルが使用不可扱いになり通常攻撃になる", () => {
    const state = makeState({ hp: 90, petrified: true, skills: ["strike"], cds: { strike: 0 } });
    expect(greedyPolicy(state)).toEqual({ action: "attack" });
  });

  it("スキルがクールダウン中なら通常攻撃", () => {
    const state = makeState({ hp: 90, skills: ["strike"], cds: { strike: 2 } });
    expect(greedyPolicy(state)).toEqual({ action: "attack" });
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
  it("鉄の処刑人の大技には確定CC、20%火力、防御の順で対処する", () => {
    const target = { name: "鉄の処刑人", counterplay: "heavy-v1", intent: "heavy", hp: 100, maxHp: 100, guardTurns: 0, status: {} };
    expect(strategicPolicy(makeState({ skills: ["frostnova"], enemy: target }))).toEqual({ action: "skill", skillKey: "frostnova" });
    expect(strategicPolicy(makeState({ atk: 25, skills: [], enemy: target }))).toEqual({ action: "attack" });
    expect(strategicPolicy(makeState({ atk: 10, skills: [], enemy: target }))).toEqual({ action: "defend" });
  });

  it("鉄の処刑人戦で防御・スキル禁止でも通常攻撃へフォールバックする", () => {
    const target = { name: "鉄の処刑人", counterplay: "heavy-v1", intent: "heavy", hp: 100, maxHp: 100, guardTurns: 0, status: {} };
    const state = makeState({ atk: 10, skills: ["frostnova"], enemy: target, noDefend: 1, noSkill: 1 });
    expect(strategicPolicy(state)).toEqual({ action: "attack" });
  });

  it("火力予測は最低乱数を使い、確率要素を見込まず確定連撃だけを合算する", () => {
    const target = { name: "鉄の処刑人", counterplay: "heavy-v1", intent: "heavy", hp: 100, maxHp: 100, guardTurns: 0, status: {} };
    expect(strategicPolicy(makeState({ atk: 20, skills: [], enemy: target }))).toEqual({ action: "defend" });
    expect(strategicPolicy(makeState({ atk: 21, skills: [], enemy: target }))).toEqual({ action: "attack" });
    const guaranteedDouble = makeState({ atk: 11, skills: [], enemy: target });
    guaranteedDouble.stats.double = 100;
    expect(strategicPolicy(guaranteedDouble)).toEqual({ action: "attack" });
  });
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
