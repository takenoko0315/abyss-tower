// 汎用ヘルパー
import { RELIC_MAP } from "./data.js";

export const hasNode = (player, key) => (player.tree || []).includes(key);

export const hasRelic = (player, flag) => (player.relics || []).some(k => RELIC_MAP[k]?.flag === flag);

// ===== ユーティリティ =====
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 装備の実効ステータス(基礎値 × (1 + 10% × 強化数)。複利しない)
// 固有能力(abilityStats)は「強化できない欄」として倍率の対象外で加算する
export function effStats(item) {
  const pm = 1 + 0.1 * (item.plus || 0);
  const out = {};
  for (const [k, v] of Object.entries(item.stats)) out[k] = Math.round(v * pm);
  for (const [k, v] of Object.entries(item.abilityStats || {})) out[k] = (out[k] || 0) + v;
  return out;
}
