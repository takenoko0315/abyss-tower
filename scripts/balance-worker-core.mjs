// balance-bot.mjsのワーカー本体。単体でも `node balance-worker-core.mjs --runs=N --diff=X` として動くが、
// AbyssTower.jsx(JSX)を含むため通常はesbuildで事前バンドルされたものをnodeで実行する(balance-bot.mjs参照)。
// 標準出力の最後の1行に、結果配列のJSONを1行で出す。

import { setupJsdomEnv } from "./lib/jsdom-env.mjs";
import { rand, chance, clickByText } from "./lib/dom-actions.mjs";
import { nonCombatAction } from "./lib/standard-scene-actions.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const RUNS = parseInt(args.runs || "1", 10);
const DIFF_NAME = args.diff || "ノーマル";
const CLASS_FILTER = args.class || null; // 指定時はクラス選択画面で固定のクラスを選ぶ(assassin/warrior/vampire/mage)
const POLICY = args.policy || "standard"; // standard(既定・防御多用) / aggressive(防御しない)
const BLESSING_FILTER = args.blessing || null; // 指定時は祝福選択画面で固定の祝福を選ぶ(ks_xxxのキー、または契約を避ける"none")

const dom = await setupJsdomEnv();

const React = await import("react");
const { render, cleanup } = await import("@testing-library/react");
const { default: HackRoguelike } = await import("../src/AbyssTower.jsx");
const { SKILLS, BLESSINGS } = await import("../src/game/data.js");
const BLESSING_NAME = Object.fromEntries(BLESSINGS.map(b => [b.key, b.name]));
const KEYSTONE_KEYS = new Set(BLESSINGS.filter(b => b.keystone).map(b => b.key));

const MAX_ACTIONS = 4000;

// ===== ボットの行動方針 =====
const CLASS_LABEL = { assassin: "暗殺者", warrior: "戦士", vampire: "吸血鬼", mage: "魔術師" };

const SCENE_OPTS = {
  classFilter: CLASS_FILTER, classLabel: CLASS_LABEL, diffName: DIFF_NAME,
  blessingFilter: BLESSING_FILTER, blessingName: BLESSING_NAME, keystoneKeys: KEYSTONE_KEYS,
};

function actOnce(container, d) {
  const { scene, player, enemy, cds } = d;
  if (scene === "combat") {
    const isThreat = enemy?.intent === "heavy" || enemy?.intent === "flurry";
    if (POLICY === "standard" && isThreat && chance(0.85) && clickByText(container, "防御")) return true;
    const hpPct = player.hp / d.stats.maxHp;
    if (hpPct < 0.45 && player.potions > 0 && clickByText(container, "🧪")) return true;
    const usable = (player.skills || []).filter(k => (cds[k] || 0) === 0 && !player.petrified);
    // aggressive方針:防御せず、大技/連攻の予告時はスキルを優先(なければ攻撃)
    if (POLICY === "aggressive" && isThreat) {
      if (usable.length) {
        const k = rand(usable);
        if (clickByText(container, SKILLS[k].name)) return true;
      }
      return clickByText(container, "⚔️ 攻撃");
    }
    if (usable.length && chance(0.6)) {
      const k = rand(usable);
      if (clickByText(container, SKILLS[k].name)) return true;
    }
    return clickByText(container, "⚔️ 攻撃");
  }
  const result = nonCombatAction(container, d, SCENE_OPTS);
  if (result === null) throw new Error(`未対応のシーン: ${scene}`);
  return result;
}

function playOneRun() {
  const { container, unmount } = render(React.createElement(HackRoguelike));
  const dbg = () => dom.window.__abyssDebug;
  let actions = 0;
  let lastEnemy = null; // 死亡直前の敵(ボス死亡集計用)
  try {
    while (actions < MAX_ACTIONS) {
      actions++;
      const d = dbg();
      if (!d) throw new Error("window.__abyssDebugが未初期化(初回レンダリング未完了)");
      if (d.scene === "combat" && d.enemy) lastEnemy = { name: d.enemy.name, floor: d.floor };
      if (d.scene === "dead") return { result: "dead", floor: d.floor, cls: d.player.cls, blessing: d.player.blessing, lastEnemy, actions };
      if (d.scene === "victory") return { result: "victory", floor: 20, cls: d.player.cls, blessing: d.player.blessing, lastEnemy, actions };
      const acted = actOnce(container, d);
      if (!acted) {
        // 指定した契約(--blessing)がこのランの選択肢に出なかった場合はエラーにせずリロール扱い
        if (d.scene === "blessing" && BLESSING_FILTER && BLESSING_FILTER !== "none") return { result: "reroll" };
        throw new Error(`シーン"${d.scene}"でクリック可能なボタンが見つからない`);
      }
    }
    const d = dbg();
    return { result: "timeout", floor: d?.floor, cls: d?.player?.cls, blessing: d?.player?.blessing, lastEnemy, actions };
  } catch (err) {
    const d = dbg();
    return { result: "error", error: { message: err.message, stack: err.stack }, floor: d?.floor, cls: d?.player?.cls, blessing: d?.player?.blessing, lastEnemy, actions };
  } finally {
    unmount();
    cleanup();
  }
}

const out = [];
let rerolls = 0;
while (out.length < RUNS) {
  const r = playOneRun();
  if (r.result === "reroll") { rerolls++; continue; }
  out.push(r);
}
if (rerolls > 0) console.error(`[balance-worker] --blessing=${BLESSING_FILTER} のリロール数: ${rerolls}(選択肢に出ないランを破棄して作り直した回数)`);
console.log(JSON.stringify(out));
