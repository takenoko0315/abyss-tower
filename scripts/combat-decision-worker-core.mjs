// combat-decision-bot.mjsのワーカー本体。balance-worker-core.mjsと同じくAbyssTower.jsxを
// jsdom+RTLで実プレイさせるが、目的は「戦闘中の判断」が到達階・生存率にどれだけ効くかの計測。
// クラス選択・分岐路・戦利品などcombat以外のシーンはlib/standard-scene-actions.mjsの標準方針を使い、
// combatシーンだけをlib/combat-policies.mjsの3方針(attack-only/basic/strategic)で置き換える。
// 標準出力の最後の1行に、結果配列のJSONを1行で出す。
import { setupJsdomEnv } from "./lib/jsdom-env.mjs";
import { clickByText, clickRandom } from "./lib/dom-actions.mjs";
import { nonCombatAction } from "./lib/standard-scene-actions.mjs";
import { POLICIES, isBigThreat } from "./lib/combat-policies.mjs";
import { installSeededRandom } from "./lib/seeded-rng.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const RUNS = parseInt(args.runs || "1", 10);
const DIFF_NAME = args.diff || "ノーマル";
const CLASS_FILTER = args.class || null;
const BLESSING_FILTER = args.blessing || null;
const POLICY_NAME = args.policy || "basic"; // attack-only / basic / strategic
const SEED_OFFSET = parseInt(args.seedOffset || "0", 10); // このワーカーが担当するランのうち0番目のシード値

if (!POLICIES[POLICY_NAME]) throw new Error(`未知の行動方針: ${POLICY_NAME}`);
const decide = POLICIES[POLICY_NAME];

const dom = await setupJsdomEnv();

const React = await import("react");
const { render, cleanup } = await import("@testing-library/react");
const { default: HackRoguelike } = await import("../src/AbyssTower.jsx");
const { SKILLS, BLESSINGS } = await import("../src/game/data.js");
const { potionHealingMultiplier } = await import("../src/game/combat.js");
const BLESSING_NAME = Object.fromEntries(BLESSINGS.map(b => [b.key, b.name]));
const KEYSTONE_KEYS = new Set(BLESSINGS.filter(b => b.keystone).map(b => b.key));
const CLASS_LABEL = { assassin: "暗殺者", warrior: "戦士", vampire: "吸血鬼", mage: "魔術師" };

const SCENE_OPTS = {
  classFilter: CLASS_FILTER, classLabel: CLASS_LABEL, diffName: DIFF_NAME,
  blessingFilter: BLESSING_FILTER, blessingName: BLESSING_NAME, keystoneKeys: KEYSTONE_KEYS,
};

const MAX_ACTIONS = 4000;
// AbyssTower.jsx:754相当の防御ダメージ倍率(推定用にミラー。本体の式が変わればここも合わせる必要がある)
const defendMultFor = (enemy, stats) => {
  if (enemy?.gimmick === "arcane" && enemy?.intent === "heavy") return 0.7;
  return (stats.betterDefend || 0) > 0 ? 0.2 : 0.4;
};
// AbyssTower.jsx:851相当の回復薬の回復量(推定用。世界モディファイアでpotionHealが変更されている場合は誤差が出る)
const potionHealEstimate = (player, stats) => Math.max(
  1, Math.round(stats.maxHp * 0.4 * potionHealingMultiplier(stats) * (1 - (player.healReduce || 0) / 100)),
);

function emptyMetrics() {
  return {
    combatTurns: 0,
    counts: { attack: 0, defend: 0, skill: 0, potion: 0 },
    heavyOrFlurryTelegraphed: 0,
    defendedVsHeavy: 0,
    guardTurnsSeen: 0,
    attackedVsGuard: 0,
    mitigatedDamageEstimate: 0,
    potionOverhealEstimate: 0,
    ccInterruptTurns: 0,
  };
}

// 決定した行動をクリックする。ボタンが無効/存在しない場合は通常攻撃→ランダムにフォールバックする
function executeCombatDecision(container, decision) {
  const tryClick = (action, skillKey) => {
    if (action === "attack") return clickByText(container, "⚔️ 攻撃") ? "attack" : null;
    if (action === "defend") return clickByText(container, "防御") ? "defend" : null;
    if (action === "potion") return clickByText(container, "🧪") ? "potion" : null;
    if (action === "skill") return clickByText(container, SKILLS[skillKey].name) ? "skill" : null;
    return null;
  };
  const primary = tryClick(decision.action, decision.skillKey);
  if (primary) return primary;
  if (decision.action !== "attack" && tryClick("attack")) return "attack";
  if (clickRandom(container)) return "random";
  return null;
}

function playOneRun(seed) {
  const restoreRandom = installSeededRandom(seed);
  const { container, unmount } = render(React.createElement(HackRoguelike));
  const dbg = () => dom.window.__abyssDebug;
  const metrics = emptyMetrics();
  let actions = 0;
  let lastEnemy = null;
  try {
    while (actions < MAX_ACTIONS) {
      actions++;
      const d = dbg();
      if (!d) throw new Error("window.__abyssDebugが未初期化(初回レンダリング未完了)");
      if (d.scene === "combat" && d.enemy) lastEnemy = { name: d.enemy.name, gimmick: d.enemy.gimmick, floor: d.floor };
      if (d.scene === "dead") return { result: "dead", floor: d.floor, cls: d.player.cls, blessing: d.player.blessing, lastEnemy, actions, seed, metrics };
      if (d.scene === "victory") return { result: "victory", floor: 20, cls: d.player.cls, blessing: d.player.blessing, lastEnemy, actions, seed, metrics };

      if (d.scene !== "combat") {
        const acted = nonCombatAction(container, d, SCENE_OPTS);
        if (acted === null) throw new Error(`未対応のシーン: ${d.scene}`);
        if (!acted) {
          if (d.scene === "blessing" && BLESSING_FILTER && BLESSING_FILTER !== "none") return { result: "reroll" };
          throw new Error(`シーン"${d.scene}"でクリック可能なボタンが見つからない`);
        }
        continue;
      }

      // ===== 戦闘シーン: 判断方針を適用し、判断価値の指標を収集する =====
      const telegraphedBig = isBigThreat(d.enemy);
      const guarding = (d.enemy?.guardTurns || 0) > 0;
      const ccPending = telegraphedBig
        && ((d.enemy?.status?.freeze?.turns || 0) > 0 || (d.enemy?.status?.stun?.turns || 0) > 0);
      const hpBefore = d.player.hp;

      const decision = decide(d);
      const actual = executeCombatDecision(container, decision);
      if (!actual) throw new Error(`シーン"combat"でクリック可能なボタンが見つからない`);

      metrics.combatTurns++;
      metrics.counts[actual]++;
      if (telegraphedBig) metrics.heavyOrFlurryTelegraphed++;
      if (guarding) metrics.guardTurnsSeen++;
      if (ccPending) metrics.ccInterruptTurns++;
      if (actual === "defend" && telegraphedBig) metrics.defendedVsHeavy++;
      if (actual === "attack" && guarding) metrics.attackedVsGuard++;
      if (actual === "potion") {
        metrics.potionOverhealEstimate += Math.max(
          0, potionHealEstimate(d.player, d.stats) - (d.stats.maxHp - hpBefore),
        );
      }
      if (actual === "defend" && telegraphedBig) {
        const d2 = dbg();
        if (d2 && d2.floor === d.floor) {
          const actualDamage = Math.max(0, hpBefore - d2.player.hp);
          if (actualDamage > 0) {
            const mult = defendMultFor(d.enemy, d.stats);
            metrics.mitigatedDamageEstimate += Math.round(actualDamage * (1 / mult - 1));
          }
        }
      }
    }
    const d = dbg();
    return { result: "timeout", floor: d?.floor, cls: d?.player?.cls, blessing: d?.player?.blessing, lastEnemy, actions, seed, metrics };
  } catch (err) {
    const d = dbg();
    return {
      result: "error",
      error: { message: err.message, stack: err.stack },
      floor: d?.floor, cls: d?.player?.cls, blessing: d?.player?.blessing, lastEnemy, actions, seed, metrics,
    };
  } finally {
    restoreRandom();
    unmount();
    cleanup();
  }
}

const out = [];
let rerolls = 0;
while (out.length < RUNS) {
  const seed = SEED_OFFSET + out.length + rerolls; // リロールもシード消費として扱い、後続ランのシードとずれないようにする
  const r = playOneRun(seed);
  if (r.result === "reroll") { rerolls++; continue; }
  out.push(r);
}
if (rerolls > 0) console.error(`[combat-decision-worker] --blessing=${BLESSING_FILTER} のリロール数: ${rerolls}`);
console.log(JSON.stringify(out));
