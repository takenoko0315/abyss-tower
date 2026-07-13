import { COMBAT_TONES } from "./combatTheme.js";

// 敵ごとの特殊状態(装甲崩壊・過熱・障壁崩壊・状態異常など)を表す共通の小さなチップ。
// 見た目(枠線・背景の濃淡・角丸・グロー)だけを担当し、文言や数値の計算は呼び出し側が行う。
export default function CombatStatusChip({ testId, tone = "neutral", compact = false, pulse = false, style, className, children }) {
  const palette = COMBAT_TONES[tone] || COMBAT_TONES.neutral;
  return (
    <div
      data-testid={testId}
      className={pulse ? `abyss-animated${className ? ` ${className}` : ""}` : className}
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: compact ? "center" : "flex-start", gap: 2,
        padding: compact ? "5px 12px" : "6px 10px",
        borderRadius: compact ? 999 : 7,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        boxShadow: pulse ? `0 0 10px ${palette.glow}` : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
