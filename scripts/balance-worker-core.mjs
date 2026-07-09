// balance-bot.mjsのワーカー本体。単体でも `node balance-worker-core.mjs --runs=N --diff=X` として動くが、
// AbyssTower.jsx(JSX)を含むため通常はesbuildで事前バンドルされたものをnodeで実行する(balance-bot.mjs参照)。
// 標準出力の最後の1行に、結果配列のJSONを1行で出す。

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), "true"];
  })
);
const RUNS = parseInt(args.runs || "1", 10);
const DIFF_NAME = args.diff || "ノーマル";

const { JSDOM } = await import("jsdom");
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const setGlobal = (key, value) => Object.defineProperty(global, key, { value, configurable: true, writable: true });
setGlobal("window", dom.window);
setGlobal("document", dom.window.document);
setGlobal("navigator", dom.window.navigator); // Node 22はnavigatorをgetter専用で定義済みのため代入不可。definePropertyで上書き
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.requestAnimationFrame = global.requestAnimationFrame;
dom.window.cancelAnimationFrame = global.cancelAnimationFrame;
// jsdomはHTMLMediaElement.play/pauseもAudio自体も実装していない。BGM再生を静かに黙らせる
class FakeAudio {
  constructor() { this.loop = false; this.volume = 1; this.muted = false; this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
global.Audio = FakeAudio;
dom.window.Audio = FakeAudio;
if (dom.window.HTMLMediaElement) {
  dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
}

const React = await import("react");
const { render, fireEvent, cleanup } = await import("@testing-library/react");
const { default: HackRoguelike } = await import("../src/AbyssTower.jsx");
const { SKILLS } = await import("../src/game/data.js");

const MAX_ACTIONS = 4000;
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

function allButtons(container) {
  return Array.from(container.querySelectorAll("button"));
}
function clickByText(container, text) {
  const btn = allButtons(container).find(b => !b.disabled && b.textContent.includes(text));
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
}
function clickRandom(container, excludeTexts = []) {
  const btns = allButtons(container).filter(b => !b.disabled && !excludeTexts.some(t => b.textContent.includes(t)));
  if (!btns.length) return false;
  fireEvent.click(rand(btns));
  return true;
}

// ===== ボットの行動方針 =====
function actOnce(container, d) {
  const { scene, player, stats, enemy, cds, drop } = d;
  switch (scene) {
    case "title": return clickByText(container, "挑戦する");
    case "classSelect": return clickRandom(container, ["戻る"]);
    case "variantSelect": return clickRandom(container, ["クラス選択に戻る"]);
    case "diffSelect": return clickByText(container, DIFF_NAME) || clickRandom(container, ["クラス選択に戻る"]);
    case "blessing": return clickRandom(container);
    case "origin": return clickRandom(container);
    case "zoneSelect": return clickRandom(container);
    case "levelup": return clickRandom(container);
    case "loot": {
      if (drop?.identified === false) {
        if (chance(0.5)) return clickByText(container, "賭けて装備");
        return clickByText(container, "鑑定する") || clickByText(container, "捨てて進む");
      }
      if (chance(0.7)) return clickByText(container, "装備する");
      return clickByText(container, "捨てて進む");
    }
    case "forge": return clickByText(container, "店を出て進む");
    case "shop": return clickByText(container, "店を出て進む");
    case "relicChoice": return clickRandom(container);
    case "relicSwap": return clickRandom(container);
    case "dojo": return clickRandom(container);
    case "eventChoice": return clickRandom(container);
    case "path": {
      const hpPct = player.hp / stats.maxHp;
      if (hpPct < 0.5 && clickByText(container, "焚き火")) return true;
      return clickRandom(container, ["ステータス", "スキルツリー"]);
    }
    case "combat": {
      const isThreat = enemy?.intent === "heavy" || enemy?.intent === "flurry";
      if (isThreat && chance(0.85) && clickByText(container, "防御")) return true;
      const hpPct = player.hp / stats.maxHp;
      if (hpPct < 0.45 && player.potions > 0 && clickByText(container, "🧪")) return true;
      const usable = (player.skills || []).filter(k => (cds[k] || 0) === 0 && !player.petrified);
      if (usable.length && chance(0.6)) {
        const k = rand(usable);
        if (clickByText(container, SKILLS[k].name)) return true;
      }
      return clickByText(container, "⚔️ 攻撃");
    }
    default:
      throw new Error(`未対応のシーン: ${scene}`);
  }
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
      if (!acted) throw new Error(`シーン"${d.scene}"でクリック可能なボタンが見つからない`);
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
for (let i = 0; i < RUNS; i++) out.push(playOneRun());
console.log(JSON.stringify(out));
