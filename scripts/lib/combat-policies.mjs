// combat-decision-bot用の戦闘中の行動方針(意思決定ロジック)。
// window.__abyssDebug が公開する生の状態(player/stats/enemy/cds)だけを見て
// { action: "attack" | "defend" | "potion" | "skill", skillKey? } を返す純粋関数。
// DOM操作やjsdomに依存しないため、vitestで直接ユニットテストできる。
import { SKILLS } from "../../src/game/data.js";
import { HEAVY_COUNTERPLAY, isHeavyCounterplay } from "../../src/game/heavyCounterplay.js";

// SKILLSをspecの性質で分類しておく(データを増やしても自動で追従する)
const DAMAGE_SKILLS = new Set(
  Object.entries(SKILLS).filter(([, s]) => !s.spec.kind).map(([k]) => k),
);
const CC_SKILLS = new Set(
  Object.entries(SKILLS)
    .filter(([, s]) => (s.spec.stunChance || 0) > 0 || ["freeze", "stun"].includes(s.spec.applyStatus?.type))
    .map(([k]) => k),
);
const STANCE_SKILLS = new Set(
  Object.entries(SKILLS).filter(([, s]) => s.spec.kind === "guard" || s.spec.kind === "parry").map(([k]) => k),
);
const HEAL_SKILLS = new Set(
  Object.entries(SKILLS).filter(([, s]) => s.spec.kind === "heal").map(([k]) => k),
);

function isSkillUsable(player, cds, stats, key) {
  return (player.skills || []).includes(key)
    && (cds[key] || 0) === 0
    && !player.petrified
    && (stats.noSkill || 0) <= 0;
}

function usableSkillsOfKind(player, cds, stats, kindSet) {
  return (player.skills || []).filter(k => kindSet.has(k) && isSkillUsable(player, cds, stats, k));
}

// 総倍率(mult×hits)が最大のものを選ぶ。同値ならキー名で決定的にタイブレークする
function pickBestDamageSkill(keys) {
  return [...keys].sort((a, b) => {
    const scoreA = SKILLS[a].spec.mult * (SKILLS[a].spec.hits || 1);
    const scoreB = SKILLS[b].spec.mult * (SKILLS[b].spec.hits || 1);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a < b ? -1 : 1;
  })[0];
}

function deterministicCcSkills(player, cds, stats) {
  return (player.skills || []).filter(key => {
    const type = SKILLS[key]?.spec?.applyStatus?.type;
    return ["freeze", "stun"].includes(type) && isSkillUsable(player, cds, stats, key);
  });
}

function expectedHeavyInterruptAction(player, cds, stats, enemy) {
  const threshold = Math.max(0, enemy.maxHp || 0) * HEAVY_COUNTERPLAY.damageThreshold;
  const guaranteedExtraHits = (stats.noDouble || 0) > 0 ? 0 : Math.floor(Math.max(0, stats.double || 0) / 100);
  const damageSkills = usableSkillsOfKind(player, cds, stats, DAMAGE_SKILLS)
    .filter(key => Math.max(0, Math.round((stats.atk - 1) * SKILLS[key].spec.mult)) * ((SKILLS[key].spec.hits || 1) + guaranteedExtraHits) >= threshold);
  if (damageSkills.length) return { action: "skill", skillKey: pickBestDamageSkill(damageSkills) };
  if (Math.max(0, stats.atk - 1) * (1 + guaranteedExtraHits) >= threshold) return { action: "attack" };
  return null;
}

const isBigThreat = (enemy) => enemy?.intent === "heavy" || enemy?.intent === "flurry";

/** 1. attack-only: 通常攻撃可能なら必ず通常攻撃。回復・防御・スキルは使わない */
export function attackOnlyPolicy() {
  return { action: "attack" };
}

/**
 * 2. greedy: 深く考えずに遊ぶ人間を想定した雑な方針。基本は通常攻撃、HP危険域で回復薬、
 * 使えるスキルがあれば(倍率計算などせず)手近なものを使う。敵の予告・防御・ギミックは一切見ない。
 */
export function greedyPolicy(d) {
  const { player, stats, cds } = d;
  const hpPct = player.hp / stats.maxHp;
  if (hpPct <= 0.3 && player.potions > 0) return { action: "potion" };

  const usable = usableSkillsOfKind(player, cds, stats, DAMAGE_SKILLS);
  if (usable.length) return { action: "skill", skillKey: usable[0] };

  return { action: "attack" };
}

/**
 * 3. basic: HP危険域で回復薬、大技/連攻の予告に防御、敵防御中に有効なスキルがあれば使用。
 * それ以外は通常攻撃。
 */
export function basicPolicy(d) {
  const { player, stats, enemy, cds } = d;
  if (player.petrified) return { action: "attack" };

  const hpPct = player.hp / stats.maxHp;
  if (hpPct <= 0.3 && player.potions > 0) return { action: "potion" };

  if (isBigThreat(enemy) && (stats.noDefend || 0) <= 0) return { action: "defend" };

  if ((enemy?.guardTurns || 0) > 0) {
    const usable = usableSkillsOfKind(player, cds, stats, DAMAGE_SKILLS);
    if (usable.length) return { action: "skill", skillKey: pickBestDamageSkill(usable) };
  }

  return { action: "attack" };
}

/**
 * 4. strategic: 敵の予告行動・双方のHP・回復薬・使用可能スキル・状態異常・敵ギミック・現在の契約を
 * 考慮するルールベース方針。完璧なAIではなく、basicより一段高度な優先順位付けを行う。
 */
export function strategicPolicy(d) {
  const { player, stats, enemy, cds } = d;
  if (player.petrified) return { action: "attack" };

  const hpPct = player.hp / stats.maxHp;
  const enemyHpPct = enemy && enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  const noDefend = (stats.noDefend || 0) > 0;

  const usableHeal = usableSkillsOfKind(player, cds, stats, HEAL_SKILLS);
  const usableCC = usableSkillsOfKind(player, cds, stats, CC_SKILLS);
  const usableStance = usableSkillsOfKind(player, cds, stats, STANCE_SKILLS);
  const usableDamage = usableSkillsOfKind(player, cds, stats, DAMAGE_SKILLS);

  const rhythm = enemy?.combatRhythm;
  const rhythmState = enemy?.rhythmState || {};
  if (rhythm === "executioner") {
    if (rhythmState.phase === "exposed" && usableDamage.length) return { action: "skill", skillKey: pickBestDamageSkill(usableDamage) };
    if (rhythmState.phase === "armored" && !rhythmState.parryReady && !noDefend) return { action: "defend" };
    if (rhythmState.parryReady && enemy.intent === "heavy" && !noDefend) return { action: "defend" };
  }
  if (rhythm === "dragon") {
    if (rhythmState.phase === "overheated") return usableDamage.length ? { action: "skill", skillKey: pickBestDamageSkill(usableDamage) } : { action: "attack" };
    if (rhythmState.phase === "flying") {
      if (hpPct <= 0.75 && usableHeal.length) return { action: "skill", skillKey: usableHeal[0] };
      if (hpPct <= 0.75 && player.potions > 0) return { action: "potion" };
      if (!noDefend) return { action: "defend" };
    }
  }
  if (rhythm === "crystal" && rhythmState.phase !== "exposed") {
    const last = rhythmState.lastCategory;
    if (last !== "defend" && !noDefend) return { action: "defend" };
    if (last !== "skill" && usableDamage.length) return { action: "skill", skillKey: pickBestDamageSkill(usableDamage) };
    if (last !== "heal" && hpPct < 0.9 && player.potions > 0) return { action: "potion" };
    return { action: "attack" };
  }

  if (isHeavyCounterplay(enemy)) {
    const certainCc = deterministicCcSkills(player, cds, stats);
    if (certainCc.length) return { action: "skill", skillKey: certainCc[0] };
    const damageInterrupt = expectedHeavyInterruptAction(player, cds, stats, enemy);
    if (damageInterrupt) return damageInterrupt;
    if (!noDefend) return { action: "defend" };
    return { action: "attack" };
  }

  // A: 緊急回復(HP25%以下) — 回復スキルがあれば温存中の回復薬より優先
  if (hpPct <= 0.25) {
    if (usableHeal.length) return { action: "skill", skillKey: usableHeal[0] };
    if (player.potions > 0) return { action: "potion" };
  }

  // B: 大技/連攻の予告への対応 — 妨害(凍結/気絶)>構え/見切り系スキル>防御の優先順位
  if (isBigThreat(enemy)) {
    const enemyIncapacitated = (enemy?.status?.freeze?.turns || 0) > 0 || (enemy?.status?.stun?.turns || 0) > 0;
    if (!enemyIncapacitated && usableCC.length) return { action: "skill", skillKey: usableCC[0] };
    if (usableStance.length) return { action: "skill", skillKey: usableStance[0] };
    if (!noDefend) return { action: "defend" };
  }

  // C: 毒撃(venom)対策 — 毒牙ギミック持ちか、既にHPが減っている時は防御で毒付与を防ぐ
  if (enemy?.intent === "venom" && !noDefend && (enemy?.gimmick === "venomfang" || hpPct < 0.6)) {
    return { action: "defend" };
  }

  // D: 敵が構え中(guardTurns>0) — 通常攻撃は被ダメ半減されるので、あればスキルで押す
  if ((enemy?.guardTurns || 0) > 0 && usableDamage.length) {
    return { action: "skill", skillKey: pickBestDamageSkill(usableDamage) };
  }

  // E: 敵の残りHPが少ない — スキルで畳み掛けて被弾ターンを減らす
  if (enemy && enemyHpPct <= 0.2 && usableDamage.length) {
    return { action: "skill", skillKey: pickBestDamageSkill(usableDamage) };
  }

  // F: 通常時の回復薬(HP45%以下)
  if (hpPct <= 0.45 && player.potions > 0) return { action: "potion" };

  // G: スキルは温存せず、使えるなら使う(クールダウンの空き時間を作らない)
  if (usableDamage.length) return { action: "skill", skillKey: pickBestDamageSkill(usableDamage) };

  return { action: "attack" };
}

export const POLICIES = {
  "attack-only": attackOnlyPolicy,
  greedy: greedyPolicy,
  basic: basicPolicy,
  strategic: strategicPolicy,
};

// 方針の第一選択がDOM上で使えない場合に試す、決定的な合法行動列。
// 第一選択を先頭に保ち、通常攻撃→防御→回復→所持スキルの順で重複なく並べる。
export function decisionCandidates(decision, d) {
  const { player, stats, cds } = d;
  const candidates = [decision, { action: "attack" }];
  if (!player.petrified && (stats.noDefend || 0) <= 0) candidates.push({ action: "defend" });
  if (!player.petrified && player.potions > 0) candidates.push({ action: "potion" });
  for (const key of player.skills || []) {
    if (isSkillUsable(player, cds, stats, key)) candidates.push({ action: "skill", skillKey: key });
  }
  const seen = new Set();
  return candidates.filter(candidate => {
    const id = `${candidate.action}:${candidate.skillKey || ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// 計測(combat-decision-worker-core.mjs)用に分類集合とヘルパーも公開する
export { DAMAGE_SKILLS, CC_SKILLS, STANCE_SKILLS, HEAL_SKILLS, isSkillUsable, usableSkillsOfKind, pickBestDamageSkill, isBigThreat, deterministicCcSkills, expectedHeavyInterruptAction };
