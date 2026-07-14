import { COMBAT_TONES } from "./combatTheme.js";

// 敵カードの情報領域(HPブロックの下)に配置する「次の行動」パネル。
// 数値・条件判定はすべて呼び出し側(AbyssTower.jsx)の既存関数(estimateIntentDamage /
// HEAVY_COUNTERPLAY.damageThreshold)の結果を受け取るだけで、戦闘ロジックは持たない。
export default function EnemyIntentPanel({
  mode, // "execution" | "generic"
  dmg, threshold, // mode==="execution"
  icon, name, isFlurry, isThreat, defDmg, isGuard, isVenom, isBurrowedNext, hasPattern, color, // mode==="generic"
}) {
  if (mode === "execution") {
    return (
      <div data-testid="execution-intent" style={{ marginTop: 8, width: "100%", boxSizing: "border-box", borderLeft: `3px solid ${COMBAT_TONES.danger.border}`, background: "rgba(239,68,68,.08)", borderRadius: "0 6px 6px 0", padding: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, color: COMBAT_TONES.danger.text }}>
          <span style={{ fontSize: 16 }}>🪓</span>
          <span style={{ fontSize: 11, fontWeight: 700, opacity: .85 }}>処刑</span>
          <span style={{ fontSize: 26, fontWeight: 900 }}>{dmg ?? "?"}</span>
        </div>
        <div data-testid="execution-threshold" style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", marginTop: 1 }}>1行動で<span style={{ color: COMBAT_TONES.danger.strong }}>{threshold}以上</span>なら中断</div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, width: "100%", boxSizing: "border-box", borderLeft: `3px solid ${color}`, background: "rgba(255,255,255,.03)", borderRadius: "0 6px 6px 0", padding: "5px 10px", fontSize: 11, fontWeight: 700, color }}>
      次の行動:{icon}{name}{isFlurry ? "×3" : ""}
      {isThreat ? `(約${dmg} / 🛡️防御なら約${defDmg})` : isGuard ? "(被ダメ-50%)" : "(攻撃力UP)"}
      {isVenom ? " +毒付与(防御で無効)" : ""}
      {isBurrowedNext ? " 🪱潜伏明け強化" : ""}
      {hasPattern ? " 🔁" : ""}
    </div>
  );
}
