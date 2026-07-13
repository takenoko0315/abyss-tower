import { ELITE_TRAITS, GIMMICKS, STATUS } from "../game/data.js";
import Bar from "./Bar.jsx";
import { COMBAT_TONES } from "./combatTheme.js";

// 敵アイコン・名前・HP・攻撃力・次の行動・処刑カウント・状態チップを1枚のHUDカードにまとめる。
// 戦闘ロジックは持たず、値と(既に計算済みの)子要素を受け取って並べるだけの表示コンポーネント。
// デスクトップ幅では .abyss-ec-grid が2列(左:メダリオン、右:情報)に、モバイル幅では1列に切り替わる(AbyssTower.jsx側の<style>で定義)。
export default function EnemyCombatCard({
  enemy, atkDisplay, atkBoosted, dangerPulse = false, exposed = false,
  hitFxAnimation = "none", popups = [], executionCount = null,
  intentPanel = null, rhythmChip = null,
}) {
  const danger = dangerPulse && !exposed;
  // 状態は「カード全面の塗り」ではなく「上端のアクセント線+控えめな外周グロー」だけで表現する
  const accentTone = exposed ? COMBAT_TONES.chance : (danger || enemy.isFinal) ? COMBAT_TONES.danger : null;
  const cardBg = enemy.isBoss ? "#1a1611" : "#161210";
  const cardBorder = enemy.isBoss ? "#3a2f1f" : "#292524";
  const animation = danger ? "abyss-danger-pulse .7s ease-in-out infinite" : hitFxAnimation;
  const imminentExecution = executionCount === 1;
  const activeStatuses = enemy.status ? Object.entries(enemy.status).filter(([, v]) => v.turns > 0) : [];
  const medallionBorder = accentTone ? accentTone.border : enemy.isBoss ? "#7c5a1e" : "#3f3a33";
  const hasNote = (enemy.gimmick && GIMMICKS[enemy.gimmick]) || enemy.cursedByShaman || (enemy.gimmick === "slow" && enemy.resting);

  return (
    <div
      data-testid="enemy-card"
      className={animation !== "none" ? "abyss-animated" : undefined}
      style={{
        position: "relative", background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderTop: `3px solid ${accentTone ? accentTone.border : cardBorder}`,
        boxShadow: accentTone ? `0 0 12px ${accentTone.glow}` : "none",
        borderRadius: 12, padding: 14, marginBottom: 12, animation,
      }}
    >
      {enemy.isFinal && <div style={{ color: COMBAT_TONES.danger.strong, fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>― 最 終 ボ ス ―</div>}
      {enemy.arenaStage && <div style={{ color: "#fb923c", fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>🏟️ 闘技場 — {enemy.arenaStage}/2戦目</div>}

      <div className="abyss-ec-grid">
        <div style={{ position: "relative" }}>
          {popups.length > 0 && (
            <div style={{ position: "absolute", left: "50%", top: -8, width: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
              {popups.map(pop => (
                <div key={pop.id} style={{
                  position: "absolute", left: pop.offset * 20 - (popups.length - 1) * 10, top: 0, transform: "translateX(-50%)", whiteSpace: "nowrap",
                  color: pop.status ? STATUS[pop.status].color : pop.crit ? "#facc15" : "#f87171", fontWeight: 800, fontSize: pop.crit ? 22 : 15,
                  textShadow: "0 1px 3px rgba(0,0,0,0.85)", animation: "abyss-float-up 0.9s ease-out forwards",
                }}>{pop.status ? `${STATUS[pop.status].icon}${pop.text}` : pop.crit ? `💥${pop.text}` : pop.text}</div>
              ))}
            </div>
          )}
          <div className="abyss-ec-visual" style={{
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            background: `radial-gradient(circle at 50% 35%, #2b2620 0%, #14110d 72%)`,
            border: `2px solid ${medallionBorder}`,
            boxShadow: accentTone ? `0 0 14px ${accentTone.glow}` : "0 2px 8px rgba(0,0,0,.5)",
          }}>{enemy.icon}</div>
          <div style={{ fontWeight: 700, color: enemy.isBoss ? "#fbbf24" : "#e7e5e4", marginTop: 8, textAlign: "center" }}>
            {enemy.isBoss && "👑 "}{enemy.name}
          </div>
          {enemy.trait && (
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "#c4b5fd", border: "1px solid #7c3aed", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>
                {ELITE_TRAITS[enemy.trait].icon} {ELITE_TRAITS[enemy.trait].name}
              </span>
            </div>
          )}
        </div>

        <div className={executionCount !== null ? "abyss-ec-info has-countdown" : "abyss-ec-info"}>
          {hasNote && (
            <div style={{ fontSize: 10, color: "#8a8580", lineHeight: 1.5, marginBottom: 6 }}>
              {enemy.gimmick && GIMMICKS[enemy.gimmick] && <span>{GIMMICKS[enemy.gimmick].icon} {GIMMICKS[enemy.gimmick].name}: {GIMMICKS[enemy.gimmick].desc}</span>}
              {enemy.cursedByShaman && <span style={{ marginLeft: 6 }}>🪶 呪詛纏い(攻撃+20%)</span>}
              {enemy.gimmick === "slow" && enemy.resting && <span style={{ marginLeft: 6 }}>🤖 次のターンは充填で動けない</span>}
            </div>
          )}
          <div style={{ background: "rgba(0,0,0,.2)", borderRadius: 8, padding: "8px 10px" }}>
            <Bar cur={enemy.hp} max={enemy.maxHp} color={exposed ? COMBAT_TONES.chance.strong : "#dc2626"} />
            <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
              <span>{Math.max(0, enemy.hp)} / {enemy.maxHp}</span>
              <span>⚔️{atkDisplay}{atkBoosted ? "↑" : ""}</span>
            </div>
          </div>
          {intentPanel}
          {rhythmChip && <div style={{ marginTop: 6 }}>{rhythmChip}</div>}
          {enemy.guardTurns > 0 && <div style={{ fontSize: 11, color: COMBAT_TONES.guard.strong, marginTop: 6 }}>🛡️ 構え中(受けるダメージ-50%)</div>}
          {activeStatuses.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {activeStatuses.map(([k, v]) => (
                <span key={k} style={{ fontSize: 11, color: STATUS[k].color, border: `1px solid ${STATUS[k].color}`, borderRadius: 4, padding: "1px 6px" }}>
                  {STATUS[k].icon}{STATUS[k].name}{v.turns}T{k === "poison" || k === "bleed" ? `(${v.dmg})` : k === "weaken" ? `(-${v.dmg}%)` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {executionCount !== null && (
        <div data-testid="execution-countdown" className={imminentExecution ? "abyss-animated" : undefined} style={{
          position: "absolute", top: 10, right: 10, zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
          minWidth: imminentExecution ? 42 : 30, minHeight: imminentExecution ? 42 : 30, padding: "0 7px",
          borderRadius: "14px 14px 3px 14px", boxSizing: "border-box",
          border: `2px solid ${imminentExecution ? COMBAT_TONES.danger.text : "#57534e"}`,
          background: imminentExecution ? COMBAT_TONES.danger.border : "#292524",
          color: imminentExecution ? "#fff" : "#d6d3d1",
          fontWeight: 900, fontSize: imminentExecution ? 19 : 13,
          boxShadow: imminentExecution ? `0 0 12px ${COMBAT_TONES.danger.glow}` : "none",
          animation: imminentExecution ? "abyss-interrupt-pop .3s ease-out" : "none",
        }}>
          <span style={{ fontSize: imminentExecution ? 16 : 12 }}>🪓</span>{executionCount}
        </div>
      )}
    </div>
  );
}
