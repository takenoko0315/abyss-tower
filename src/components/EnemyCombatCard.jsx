import { ELITE_TRAITS, GIMMICKS, STATUS } from "../game/data.js";
import { damagePopupColor, damagePopupGlow, damagePopupVisual } from "../game/damagePresentation.js";
import Bar from "./Bar.jsx";
import { COMBAT_TONES } from "./combatTheme.js";

// 敵アイコン・名前・HP・攻撃力・次の行動・処刑カウント・状態チップを1枚のHUDカードにまとめる。
// 戦闘ロジックは持たず、値と(既に計算済みの)子要素を受け取って並べるだけの表示コンポーネント。
// デスクトップ幅では .abyss-ec-grid が2列(左:メダリオン、右:情報)に、モバイル幅では1列に切り替わる(AbyssTower.jsx側の<style>で定義)。
export default function EnemyCombatCard({
  enemy, atkDisplay, atkBoosted, dangerPulse = false, exposed = false,
  hitFxAnimation = "none", popups = [], executionCount = null,
  intentPanel = null, rhythmChip = null, defeatFx = null,
}) {
  const danger = dangerPulse && !exposed;
  // 状態は「カード全面の塗り」ではなく「上端のアクセント線+控えめな外周グロー」だけで表現する
  const accentTone = exposed ? COMBAT_TONES.chance : (danger || enemy.isFinal) ? COMBAT_TONES.danger : null;
  const cardBg = enemy.isBoss ? "#1a1611" : "#161210";
  const cardBorder = enemy.isBoss ? "#3a2f1f" : "#292524";
  // 撃破演出(TASK-015): 演出軽減時は既存の単純フェード(abyss-flash-fade-*)へ切り替え、動き・拡大縮小を行わない
  const defeatCardAnim = !defeatFx ? null : defeatFx.reduced
    ? "abyss-flash-fade-a 0.3s ease-out forwards"
    : defeatFx.oneShot ? "abyss-shake-catastrophic 0.5s ease-in-out" : "abyss-shake-a 0.4s ease-in-out";
  const defeatIconAnim = !defeatFx ? null : defeatFx.reduced
    ? "abyss-flash-fade-b 0.35s ease-out forwards"
    : defeatFx.oneShot ? "abyss-defeat-icon-oneshot .6s ease-in forwards" : "abyss-defeat-icon .5s ease-in forwards";
  const defeatLabelAnim = !defeatFx ? null : defeatFx.reduced
    ? "abyss-popup-fade 0.35s ease-out forwards"
    : `abyss-defeat-label ${defeatFx.oneShot ? "0.7s" : "0.55s"} ease-out forwards`;
  const animation = defeatCardAnim || (danger ? "abyss-danger-pulse .7s ease-in-out infinite" : hitFxAnimation);
  const imminentExecution = executionCount === 1;
  const activeStatuses = enemy.status ? Object.entries(enemy.status).filter(([, v]) => v.turns > 0) : [];
  const medallionBorder = accentTone ? accentTone.border : enemy.isBoss ? "#7c5a1e" : "#3f3a33";
  const hasNote = (enemy.gimmick && GIMMICKS[enemy.gimmick]) || enemy.cursedByShaman || (enemy.gimmick === "slow" && enemy.resting);
  // 共鳴クリスタルの特性説明は長文だとPC/モバイル双方で折り返しが目立つため、数値だけの小型チップに分割する。
  // 進捗チップ(カテゴリ達成度、guard=青の丸ピル)と見分けられるよう status(紫)/attack(橙)のトーンを使う。詳細は title/aria-labelに残す。
  const crystallineChip = (tone, label) => (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 700, lineHeight: 1.4,
      padding: "1px 6px", borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text,
    }}>{label}</span>
  );

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
      {defeatFx && (
        <div data-testid="enemy-defeat-label" className="abyss-animated" style={{
          position: "absolute", left: "50%", top: "40%", zIndex: 4, pointerEvents: "none", whiteSpace: "nowrap",
          fontWeight: 900, fontSize: defeatFx.oneShot ? 22 : 17,
          color: defeatFx.oneShot ? "#fbbf24" : "#e7e5e4",
          textShadow: defeatFx.oneShot ? "0 0 14px rgba(251,191,36,.8)" : "0 2px 6px rgba(0,0,0,.7)",
          animation: defeatLabelAnim,
        }}>{defeatFx.oneShot ? "一撃撃破" : "撃破"}</div>
      )}
      {enemy.isFinal && <div style={{ color: COMBAT_TONES.danger.strong, fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>― 最 終 ボ ス ―</div>}
      {enemy.arenaStage && <div style={{ color: "#fb923c", fontSize: 12, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>🏟️ 闘技場 — {enemy.arenaStage}/2戦目</div>}

      <div className="abyss-ec-grid">
        <div style={{ position: "relative" }}>
          {popups.length > 0 && (
            <div style={{ position: "absolute", left: "50%", top: -8, width: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
              {popups.map(pop => {
                const tier = pop.tier || "normal";
                const visual = damagePopupVisual(tier);
                const color = damagePopupColor(tier, { target: "enemy", statusColor: pop.status ? STATUS[pop.status].color : null });
                return (
                  <div key={pop.id} data-testid="enemy-damage-popup" data-tier={tier} className="abyss-animated" style={{
                    position: "absolute", left: pop.offset * 20 - (popups.length - 1) * 10, top: 0, transform: "translateX(-50%)", whiteSpace: "nowrap",
                    color, fontWeight: visual.fontWeight, fontSize: visual.fontSize,
                    textShadow: damagePopupGlow(tier), animation: pop.animation || "abyss-float-up 0.9s ease-out forwards",
                  }}>{pop.status ? `${STATUS[pop.status].icon}${pop.text}` : pop.crit ? `💥${pop.text}` : pop.text}</div>
                );
              })}
            </div>
          )}
          <div className={defeatFx ? "abyss-ec-visual abyss-animated" : "abyss-ec-visual"} style={{
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            background: `radial-gradient(circle at 50% 35%, #2b2620 0%, #14110d 72%)`,
            border: `2px solid ${medallionBorder}`,
            boxShadow: accentTone ? `0 0 14px ${accentTone.glow}` : "0 2px 8px rgba(0,0,0,.5)",
            animation: defeatIconAnim || "none",
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
              {enemy.gimmick === "crystalline" && GIMMICKS.crystalline ? (
                <span
                  role="group"
                  aria-label={`${GIMMICKS.crystalline.icon} ${GIMMICKS.crystalline.name}: ${GIMMICKS.crystalline.desc}`}
                  title={`${GIMMICKS.crystalline.icon} ${GIMMICKS.crystalline.name}: ${GIMMICKS.crystalline.desc}`}
                  style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}
                >
                  {crystallineChip(COMBAT_TONES.status, "💎 技 +50%")}
                  {crystallineChip(COMBAT_TONES.attack, "⚔ 通常 -20%")}
                  <span style={{ fontSize: 9, opacity: .75 }}>技で崩す</span>
                </span>
              ) : enemy.gimmick && GIMMICKS[enemy.gimmick] && <span>{GIMMICKS[enemy.gimmick].icon} {GIMMICKS[enemy.gimmick].name}: {GIMMICKS[enemy.gimmick].desc}</span>}
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
