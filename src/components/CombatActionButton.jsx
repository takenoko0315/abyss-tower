import { COMBAT_TONES } from "./combatTheme.js";

// 攻撃/防御/スキル/回復の全ボタンで共有する見た目。
// 全ボタン共通の濃いダークトーン背景 + カテゴリ色の左アクセント線(全面塗りはしない)。
// 技名より予想値(ダメージ・被ダメージ・残り回数)を大きく見せ、
// 「中断可能(金枠・発光・斧バッジ)」と「戦術的に不適切(淡い破線枠のみ・暗くしない)」と
// 「disabled(背景・文字色を落として非活性化)」の3状態を別々の見た目で区別する。
export default function CombatActionButton({
  testId, onClick, disabled = false, accent = COMBAT_TONES.neutral.strong,
  label, primaryValue, primaryTestId, secondaryCaption, secondaryTone,
  interrupt = false, ineffective = false, minHeight,
}) {
  const base = {
    flex: 1, padding: "10px 8px", borderRadius: 10, fontWeight: 700, fontSize: 14,
    borderTop: `1px solid ${COMBAT_TONES.neutral.border}`, borderRight: `1px solid ${COMBAT_TONES.neutral.border}`, borderBottom: `1px solid ${COMBAT_TONES.neutral.border}`,
    borderLeft: `4px solid ${disabled ? COMBAT_TONES.neutral.border : accent}`,
    background: disabled ? "#181614" : "#211d1a",
    color: disabled ? "#57534e" : "#f5f5f4",
    cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
    position: "relative", minHeight, textAlign: "center",
  };
  const interruptStyle = interrupt ? {
    borderTop: `2px solid ${COMBAT_TONES.chance.border}`, borderRight: `2px solid ${COMBAT_TONES.chance.border}`, borderBottom: `2px solid ${COMBAT_TONES.chance.border}`,
    borderLeft: `4px solid ${COMBAT_TONES.chance.border}`,
    animation: "abyss-interrupt-pop .3s ease-out, abyss-interrupt-glow 1.1s ease-in-out .3s infinite",
  } : {};
  // 「戦術的に不適切」は暗く沈めず、淡い破線枠だけで示す(disabledの塗りつぶし変化とは別の見た目にする)
  const ineffectiveStyle = !disabled && !interrupt && ineffective ? {
    borderTop: `1px dashed ${COMBAT_TONES.neutral.strong}`, borderRight: `1px dashed ${COMBAT_TONES.neutral.strong}`, borderBottom: `1px dashed ${COMBAT_TONES.neutral.strong}`,
  } : {};

  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={interrupt ? "abyss-animated" : undefined}
      style={{ ...base, ...ineffectiveStyle, ...interruptStyle }}
    >
      {interrupt && (
        <span
          data-testid="interrupt-badge"
          style={{
            position: "absolute", top: -9, right: -7, width: 20, height: 20, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
            background: COMBAT_TONES.chance.strong, color: "#422006", border: "2px solid #1c1917",
            filter: "drop-shadow(0 0 3px #000)",
          }}
        >🪓</span>
      )}
      <div style={{ fontSize: 11, fontWeight: 600, opacity: .8 }}>{label}</div>
      {primaryValue != null && (
        <div data-testid={primaryTestId} style={{ fontSize: 17, fontWeight: 900, marginTop: 3 }}>{primaryValue}</div>
      )}
      {secondaryCaption && (
        <div style={{ fontSize: 10, marginTop: 2, color: secondaryTone || COMBAT_TONES.neutral.strong }}>{secondaryCaption}</div>
      )}
    </button>
  );
}
