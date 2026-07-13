// 戦闘UI共通の色ルール。意味と色を1対1に固定し、複数の色を同じ意味に割り当てない。
// danger(赤)=危険・処刑・致命的な次行動 / chance(金)=攻撃チャンス・装甲崩壊・過熱・障壁崩壊
// guard(青)=防御・受け流し準備 / heal(緑)=回復 / status(紫)=状態異常・特殊スキル
// attack(橙)=通常攻撃・直接ダメージ系スキルのアクセント / neutral=通常時の落ち着いたダークトーン
export const COMBAT_TONES = {
  danger: { text: "#fecaca", strong: "#f87171", border: "#ef4444", bg: "#200606", glow: "rgba(239,68,68,.45)" },
  chance: { text: "#fde047", strong: "#fbbf24", border: "#fbbf24", bg: "#3a2308", glow: "rgba(251,191,36,.4)" },
  guard: { text: "#bfdbfe", strong: "#60a5fa", border: "#60a5fa", bg: "#0b1b32", glow: "rgba(96,165,250,.4)" },
  heal: { text: "#bbf7d0", strong: "#4ade80", border: "#16a34a", bg: "#062012", glow: "rgba(74,222,128,.35)" },
  status: { text: "#e9d5ff", strong: "#c084fc", border: "#a855f7", bg: "#1a0a24", glow: "rgba(192,132,252,.35)" },
  attack: { text: "#fed7aa", strong: "#fb923c", border: "#f97316", bg: "#2a1206", glow: "rgba(251,146,60,.35)" },
  neutral: { text: "#e7e5e4", strong: "#a8a29e", border: "#44403c", bg: "#1c1917", glow: "rgba(0,0,0,0)" },
};
