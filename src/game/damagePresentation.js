// ダメージポップの演出強度判定。ダメージ計算そのものには関与しない純粋関数のみを置く。
// 「明らかに通常とは違う火力が出ている」を数字の大きさ・色・動きで伝えるための階級分け。

export const DAMAGE_POPUP_TIERS = ["normal", "strong", "critical", "catastrophic"];

const tierIndex = tier => Math.max(0, DAMAGE_POPUP_TIERS.indexOf(tier));

// 敵へのダメージ用の階級判定。目安: maxHp比10%→strong、25%または会心→critical、50%→catastrophic。
// 会心は最低でもcritical、maxHp以上の単発は必ずcatastrophicに確定させる(オーバーキルでも表示数値自体は変えない)。
export function getDamagePopupTier({ damage = 0, targetMaxHp = 0, isCritical = false } = {}) {
  const safeDamage = Math.max(0, damage);
  const ratio = targetMaxHp > 0 ? safeDamage / targetMaxHp : 0;
  let idx = 0;
  if (ratio >= 0.5) idx = 3;
  else if (ratio >= 0.25) idx = 2;
  else if (ratio >= 0.1) idx = 1;
  if (isCritical) idx = Math.max(idx, tierIndex("critical"));
  if (targetMaxHp > 0 && safeDamage >= targetMaxHp) idx = tierIndex("catastrophic");
  return DAMAGE_POPUP_TIERS[idx];
}

// プレイヤーの被ダメージ用。同じ仕組みだが敵への与ダメとは基準%を変える(20%/40%)。
// isLethalは「このダメージでHPが0以下になる」ケース。致死級は必ずcatastrophicに確定させる。
export function getPlayerDamagePopupTier({ damage = 0, targetMaxHp = 0, isLethal = false } = {}) {
  const safeDamage = Math.max(0, damage);
  const ratio = targetMaxHp > 0 ? safeDamage / targetMaxHp : 0;
  let idx = 0;
  if (ratio >= 0.4) idx = 2;
  else if (ratio >= 0.2) idx = 1;
  if (isLethal) idx = tierIndex("catastrophic");
  return DAMAGE_POPUP_TIERS[idx];
}

// 上限を指定して階級を頭打ちにする(回復ポップを強くしすぎないため等)
export function clampTier(tier, maxTier) {
  if (!maxTier) return tier;
  return DAMAGE_POPUP_TIERS[Math.min(tierIndex(tier), tierIndex(maxTier))];
}

// 階級ごとの見た目パラメータを1箇所に集約(AbyssTower.jsx側に条件分岐を増やさないため)
const TIER_VISUAL = {
  normal: { fontSize: 15, scale: 1 },
  strong: { fontSize: 17, scale: 1.2 },
  critical: { fontSize: 22, scale: 1.5 },
  catastrophic: { fontSize: 28, scale: 2 },
};

export function damagePopupVisual(tier) {
  return TIER_VISUAL[tier] || TIER_VISUAL.normal;
}

const ENEMY_DAMAGE_COLOR = {
  normal: "#f87171",
  strong: "#f87171",
  critical: "#facc15", // 既存のクリティカル色(金)を再利用
  catastrophic: "#fef9c3", // 金・白寄りの強い発光色
};

const PLAYER_DAMAGE_COLOR = {
  normal: "#f87171",
  strong: "#f87171",
  critical: "#fb7185",
  catastrophic: "#fee2e2", // 白寄りの警告色(敵ダメージの金系とは分ける)
};

// 敵ダメージ/被ダメージ/回復/状態異常で色を出し分ける。statusColorが渡された場合は最優先。
export function damagePopupColor(tier, { target = "enemy", isHeal = false, statusColor = null } = {}) {
  if (statusColor) return statusColor;
  if (isHeal) return "#4ade80";
  return (target === "player" ? PLAYER_DAMAGE_COLOR : ENEMY_DAMAGE_COLOR)[tier] || ENEMY_DAMAGE_COLOR.normal;
}

// catastrophicのみ強いglow、criticalは軽いglowを追加(常時点滅・全画面フラッシュにはしない)
export function damagePopupGlow(tier) {
  if (tier === "catastrophic") return "0 0 10px rgba(250,204,21,0.85), 0 1px 3px rgba(0,0,0,0.9)";
  if (tier === "critical") return "0 0 5px rgba(250,204,21,0.5), 0 1px 3px rgba(0,0,0,0.85)";
  return "0 1px 3px rgba(0,0,0,0.85)";
}

// アニメーション文字列の決定。reducedがtrueの間は移動・拡大縮小を止め、サイズ・色差だけで伝える。
export function damagePopupAnimation(tier, { reduced = false } = {}) {
  if (reduced) return "abyss-popup-fade 0.9s ease-out forwards";
  if (tier === "catastrophic") return "abyss-popup-pop-big 0.9s ease-out forwards";
  if (tier === "critical") return "abyss-popup-pop 0.9s ease-out forwards";
  return "abyss-float-up 0.9s ease-out forwards";
}

// 1回の行動で発生した複数ヒットを、画面を覆い尽くさないよう安全な件数に間引く。
// 間引いた場合は最後に合計ダメージのポップを1件追加する(実際の各ヒットのダメージ値自体は変更しない)。
// getTierを渡すとプレイヤー被ダメ側の基準(getPlayerDamagePopupTier)に差し替えられる。
export function scaleHitsForPopup(hits, { targetMaxHp = 0, maxVisible = 6, getTier } = {}) {
  const tierFn = getTier || (h => getDamagePopupTier({ damage: h.dmg, targetMaxHp, isCritical: !!h.crit }));
  const safeHits = Array.isArray(hits) ? hits : [];
  const withTier = h => ({ ...h, tier: tierFn(h) });
  if (safeHits.length <= maxVisible) return safeHits.map(withTier);
  const shown = safeHits.slice(0, Math.max(0, maxVisible - 1)).map(withTier);
  const totalDamage = safeHits.reduce((sum, h) => sum + (h.dmg || 0), 0);
  shown.push({
    dmg: totalDamage,
    isTotal: true,
    tier: tierFn({ dmg: totalDamage, crit: safeHits.some(h => h.crit) }),
  });
  return shown;
}
