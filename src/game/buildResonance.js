// 系統共鳴: 装備・スキル・レリック・出自・執着が同じ系統へどれだけ噛み合っているかを純粋関数で判定する。
// ダメージ計算そのものへは関与しない(スコア/段階の算出だけを行う)。
import { ABILITY_TAGS, OBSESSION_AFFIX_BIAS, ORIGIN_OBSESSION, RELIC_TAGS, SKILL_TAGS } from "./data.js";

export const RESONANCE_SYSTEMS = ["poison", "burn", "bleed", "multi"];

export const RESONANCE_LEVEL_1_THRESHOLD = 3;
export const RESONANCE_LEVEL_2_THRESHOLD = 6;

export function getResonanceLevel(score) {
  if (score >= RESONANCE_LEVEL_2_THRESHOLD) return 2;
  if (score >= RESONANCE_LEVEL_1_THRESHOLD) return 1;
  return 0;
}

const equipHasAffix = (equip, system) => {
  const keys = OBSESSION_AFFIX_BIAS[system] || [];
  return Object.values(equip || {}).some(it => it?.stats && keys.some(k => (it.stats[k] || 0) > 0));
};

const equipHasAbility = (equip, system) =>
  Object.values(equip || {}).some(it => it?.ability && (ABILITY_TAGS[it.ability] || []).includes(system));

const hasTaggedSkill = (skills, system) => (skills || []).some(k => (SKILL_TAGS[k] || []).includes(system));

const hasTaggedRelic = (relics, system) => (relics || []).some(k => (RELIC_TAGS[k] || []).includes(system));

const originMatches = (origin, system) => (ORIGIN_OBSESSION[origin] || []).includes(system);

// 系統ごとに6つの二値要素(装備アフィックス/装備固有能力/スキル/レリック/出自/執着一致)を判定し、
// それぞれ最大1点ずつ加点する(同じ装備が複数条件を満たしても装備由来の合計は各カテゴリ最大1点)。
// player/equip/skills/relics/originはいずれも未定義・古い形状でも安全に0点扱いになる。
export function collectBuildResonance({ player = {}, equip = {}, skills, relics, origin } = {}) {
  const skillList = skills || player.skills || [];
  const relicList = relics || player.relics || [];
  const originKey = origin || player.origin;
  const result = {};
  for (const system of RESONANCE_SYSTEMS) {
    let score = 0;
    if (equipHasAffix(equip, system)) score++;
    if (equipHasAbility(equip, system)) score++;
    if (hasTaggedSkill(skillList, system)) score++;
    if (hasTaggedRelic(relicList, system)) score++;
    if (originMatches(originKey, system)) score++;
    if (player.buildObsession === system) score++;
    result[system] = { score, level: getResonanceLevel(score) };
  }
  return result;
}
