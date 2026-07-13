import { calculateAttackDamage, calculateBaseIncomingDamage, rollAdditionalHits } from "../../src/game/combat.js";
import { HEAVY_COUNTERPLAY, consumeRiposte, grantRiposte, resolveHeavyCounterplay } from "../../src/game/heavyCounterplay.js";
import { SKILLS } from "../../src/game/data.js";
import { deterministicCcSkills, expectedHeavyInterruptAction, strategicPolicy } from "./combat-policies.mjs";
import { mulberry32 } from "./seeded-rng.mjs";

export const SCENARIO_POLICIES = ["defense-fixed", "damage-priority", "cc-priority", "strategic"];

const basePlayer = {
  cls: "warrior", hp: 100, maxHp: 100, atk: 25, def: 10, crit: 0, critDmg: 150, double: 0,
  potions: 1, skills: [], cds: {}, statusApplyChance: 1, equipment: {}, hooks: {}, heavyRiposte: false,
};
const baseEnemy = {
  name: HEAVY_COUNTERPLAY.enemyName, hp: 200, maxHp: 200, atk: 34, def: 0,
  intent: "heavy", pattern: ["attack", "attack", "heavy"], patternIdx: 0, status: {}, ccResist: 0,
};

export const SCENARIOS = Object.freeze({
  A: [{ id: "defense", player: { ...basePlayer, hp: 160, maxHp: 160, atk: 24, def: 22 }, enemy: { ...baseEnemy, atk: 30 } }],
  B: [{ id: "burst", player: { ...basePlayer, atk: 44, def: 10 }, enemy: { ...baseEnemy } }],
  C: [{ id: "cc", player: { ...basePlayer, atk: 20, def: 10, skills: ["frostnova"], cds: { frostnova: 0 }, statusApplyChance: 1 }, enemy: { ...baseEnemy } }],
  D: [
    { id: "cc-ready", player: { ...basePlayer, hp: 70, atk: 44, def: 12, skills: ["frostnova"], cds: { frostnova: 0 } }, enemy: { ...baseEnemy, hp: 200 } },
    { id: "burst-ready", player: { ...basePlayer, hp: 55, atk: 44, def: 12, skills: ["frostnova"], cds: { frostnova: 2 } }, enemy: { ...baseEnemy, hp: 160 } },
    { id: "defense-only", player: { ...basePlayer, hp: 35, atk: 28, def: 22, skills: ["frostnova"], cds: { frostnova: 2 } }, enemy: { ...baseEnemy, hp: 80 } },
  ],
});

const clone = value => structuredClone(value);
const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function statsFor(player) {
  const equipment = player.equipment || {};
  const hooks = player.hooks || {};
  return {
    maxHp: player.maxHp,
    atk: player.atk + (equipment.atk || 0),
    def: player.def + (equipment.def || 0),
    crit: player.crit + (equipment.crit || 0),
    critDmg: player.critDmg,
    double: player.double + (equipment.double || 0),
    noDefend: hooks.noDefend || 0,
    noSkill: hooks.noSkill || 0,
  };
}

function chooseHeavyAction(policy, state) {
  const { player, enemy } = state;
  const stats = statsFor(player);
  const d = { player, enemy, stats, cds: player.cds };
  if (policy === "defense-fixed") {
    return (stats.noDefend || 0) <= 0
      ? { action: "defend", reason: "大技を確実に軽減し反撃態勢を得る" }
      : { action: "attack", reason: "防御禁止のため通常攻撃へフォールバック" };
  }
  if (policy === "damage-priority") {
    const guaranteedHits = 1 + Math.floor(Math.max(0, stats.double || 0) / 100);
    if (stats.atk * guaranteedHits >= enemy.maxHp * HEAVY_COUNTERPLAY.damageThreshold) {
      return { action: "attack", reason: "通常攻撃の確定ヒット合計で20%以上を見込む" };
    }
    const action = expectedHeavyInterruptAction(player, player.cds, stats, enemy);
    if (action) return { ...action, reason: "表示攻撃力と倍率から20%以上の直接ダメージを見込む" };
    return (stats.noDefend || 0) <= 0
      ? { action: "defend", reason: "20%へ届かないため防御" }
      : { action: "attack", reason: "火力不足かつ防御禁止" };
  }
  if (policy === "cc-priority") {
    const cc = deterministicCcSkills(player, player.cds, stats);
    if (cc.length) return { action: "skill", skillKey: cc[0], reason: "確定付与型CCスキルが使用可能" };
    return (stats.noDefend || 0) <= 0
      ? { action: "defend", reason: "CCが利用不能なため防御" }
      : { action: "attack", reason: "CC利用不能かつ防御禁止" };
  }
  const action = strategicPolicy(d);
  const reason = action.action === "defend" ? "CC・20%火力が利用不能なため防御"
    : action.action === "skill" ? "確定CCを最優先"
      : "20%以上を見込める直接火力を選択";
  return { ...action, reason };
}

function nextIntent(enemy) {
  const intent = enemy.pattern[enemy.patternIdx % enemy.pattern.length];
  enemy.patternIdx++;
  enemy.intent = intent;
}

function applyDirectAction(player, enemy, action, random) {
  const stats = statsFor(player);
  const beforeEnemy = clone(enemy);
  const riposte = consumeRiposte(player);
  Object.assign(player, riposte.nextPlayer);
  const spec = action.action === "skill" ? SKILLS[action.skillKey].spec : { mult: 1, hits: 1 };
  const bonusHits = rollAdditionalHits(stats.double, random);
  let directDamage = 0;
  let hits = 0;
  for (let index = 0; index < (spec.hits || 1) + bonusHits && enemy.hp > 0; index++) {
    const critical = random() * 100 < stats.crit;
    const damage = Math.max(0, calculateAttackDamage({
      attack: stats.atk,
      variance: Math.floor(random() * 4) - 1,
      multiplier: spec.mult * riposte.multiplier,
      isCritical: critical,
      critDamage: stats.critDmg,
      critChance: stats.crit,
    }));
    enemy.hp -= damage;
    directDamage += damage;
    hits++;
  }

  let ccAttempted = false;
  let ccApplied = false;
  if (action.action === "skill" && ["stun", "freeze"].includes(spec.applyStatus?.type)) {
    ccAttempted = true;
    const chance = Math.max(0, Math.min(1, player.statusApplyChance * (1 - enemy.ccResist)));
    if (random() < chance) {
      const type = spec.applyStatus.type;
      const previous = enemy.status[type]?.turns || 0;
      enemy.status[type] = { turns: Math.max(previous, spec.applyStatus.turns), dmg: 0 };
      ccApplied = enemy.status[type].turns > previous;
    }
  }
  if (action.action === "skill") player.cds[action.skillKey] = SKILLS[action.skillKey].cd;
  const resolution = resolveHeavyCounterplay({ enemyBefore: beforeEnemy, enemyAfter: enemy, directDamage });
  return { directDamage, hits, riposteConsumed: riposte.consumed, ccAttempted, ccApplied, resolution };
}

export function runScenarioFight(config, policy, seed) {
  const player = clone(config.player);
  const enemy = clone(config.enemy);
  const random = mulberry32(seed);
  const initialHp = player.hp;
  const metrics = {
    turns: 0, damageTaken: 0, heavyTelegraphs: 0, heavyExecuted: 0, defended: 0, riposteGained: 0, riposteConsumed: 0,
    damageAttempts: 0, damageInterrupts: 0, ccAttempts: 0, ccInterrupts: 0, potions: 0, skills: 0,
    ccAvailable: 0, strategicChoices: [], predictionErrors: [], maxHitsInAction: 0,
  };

  while (player.hp > 0 && enemy.hp > 0 && metrics.turns < 100) {
    metrics.turns++;
    for (const key of Object.keys(player.cds)) player.cds[key] = Math.max(0, player.cds[key] - 1);
    const heavy = enemy.intent === "heavy";
    const choice = heavy ? chooseHeavyAction(policy, { player, enemy }) : { action: "attack", reason: "通常ターンは共通の通常攻撃" };
    if (heavy) {
      metrics.heavyTelegraphs++;
      if (deterministicCcSkills(player, player.cds, statsFor(player)).length) metrics.ccAvailable++;
      if (policy === "strategic") metrics.strategicChoices.push({ turn: metrics.turns, action: choice.action, skillKey: choice.skillKey || null, reason: choice.reason, variant: config.id });
    }

    let interrupted = false;
    let advanceIntent = true;
    if (choice.action === "defend") {
      metrics.defended++;
      metrics.heavyExecuted++;
      const damage = Math.max(1, Math.round(calculateBaseIncomingDamage(enemy.atk * 1.8, statsFor(player).def) * 0.4));
      player.hp -= damage;
      metrics.damageTaken += damage;
      Object.assign(player, grantRiposte(player));
      metrics.riposteGained++;
    } else {
      const predicted = statsFor(player).atk * (choice.action === "skill" ? SKILLS[choice.skillKey].spec.mult * (SKILLS[choice.skillKey].spec.hits || 1) : 1);
      const selectedCc = choice.action === "skill" && ["stun", "freeze"].includes(SKILLS[choice.skillKey].spec.applyStatus?.type);
      const actionResult = applyDirectAction(player, enemy, choice, random);
      metrics.maxHitsInAction = Math.max(metrics.maxHitsInAction, actionResult.hits);
      if (actionResult.riposteConsumed) metrics.riposteConsumed++;
      if (choice.action === "skill") metrics.skills++;
      if (heavy && !selectedCc && predicted >= enemy.maxHp * HEAVY_COUNTERPLAY.damageThreshold) {
        metrics.damageAttempts++;
        metrics.predictionErrors.push(actionResult.directDamage - predicted);
      }
      if (actionResult.ccAttempted) metrics.ccAttempts++;
      if (actionResult.resolution.method === "damage") { metrics.damageInterrupts++; interrupted = true; }
      if (actionResult.resolution.method === "cc") { metrics.ccInterrupts++; interrupted = true; }
      const ccType = (enemy.status.freeze?.turns || 0) > 0 ? "freeze" : (enemy.status.stun?.turns || 0) > 0 ? "stun" : null;
      if (ccType) {
        if (!interrupted) { interrupted = true; advanceIntent = false; }
        enemy.status[ccType].turns = Math.max(0, enemy.status[ccType].turns - 1);
      }
      if (enemy.hp <= 0) break;
      if (!interrupted) {
        if (heavy) metrics.heavyExecuted++;
        const raw = enemy.intent === "heavy" ? enemy.atk * 1.8 : enemy.atk;
        const damage = calculateBaseIncomingDamage(raw, statsFor(player).def);
        player.hp -= damage;
        metrics.damageTaken += damage;
      }
    }
    if (advanceIntent) nextIntent(enemy);
  }

  return {
    seed, scenario: config.id, policy, result: enemy.hp <= 0 ? "victory" : player.hp <= 0 ? "dead" : "timeout",
    endHp: Math.max(0, player.hp), initialHp, enemyHp: Math.max(0, enemy.hp), ...metrics,
  };
}

export function scenarioConfigs(name) {
  const configs = SCENARIOS[name];
  if (!configs) throw new Error(`未知のシナリオ: ${name}`);
  return configs;
}

export function summarizeScenario(results) {
  const n = results.length;
  const values = key => results.map(result => result[key]);
  const sum = key => values(key).reduce((total, value) => total + value, 0);
  const choices = {};
  for (const result of results) for (const choice of result.strategicChoices) {
    const key = choice.action === "skill" ? "cc" : choice.action === "defend" ? "defend" : "damage";
    choices[key] = (choices[key] || 0) + 1;
  }
  return {
    n,
    wins: results.filter(result => result.result === "victory").length,
    winRate: n ? results.filter(result => result.result === "victory").length / n : 0,
    errors: results.filter(result => result.result === "error").length,
    timeouts: results.filter(result => result.result === "timeout").length,
    endHp: { mean: average(values("endHp")), median: median(values("endHp")) },
    damageTaken: { mean: average(values("damageTaken")), median: median(values("damageTaken")) },
    turns: { mean: average(values("turns")), median: median(values("turns")) },
    heavyTelegraphs: sum("heavyTelegraphs"), heavyExecuted: sum("heavyExecuted"), defended: sum("defended"), riposteGained: sum("riposteGained"), riposteConsumed: sum("riposteConsumed"),
    damageAttempts: sum("damageAttempts"), damageInterrupts: sum("damageInterrupts"), ccAttempts: sum("ccAttempts"), ccInterrupts: sum("ccInterrupts"),
    damageInterruptRate: sum("damageAttempts") ? sum("damageInterrupts") / sum("damageAttempts") : 0,
    ccInterruptRate: sum("ccAttempts") ? sum("ccInterrupts") / sum("ccAttempts") : 0,
    potions: sum("potions"), skills: sum("skills"), ccAvailable: sum("ccAvailable"), choices,
    predictionError: { mean: average(results.flatMap(result => result.predictionErrors)), median: median(results.flatMap(result => result.predictionErrors)) },
    maxHitsInAction: Math.max(...values("maxHitsInAction"), 0),
  };
}

export function runScenarioSet({ scenario, policy, runs, seed, workers }) {
  const configs = scenarioConfigs(scenario);
  const chunks = Array.from({ length: Math.min(workers, runs) }, () => []);
  for (let index = 0; index < runs; index++) chunks[index % chunks.length].push(index);
  return chunks.flatMap(chunk => chunk.map(index => runScenarioFight(configs[index % configs.length], policy, seed + index)))
    .sort((a, b) => a.seed - b.seed);
}
