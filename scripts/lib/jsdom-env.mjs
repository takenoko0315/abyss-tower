// balance-bot / combat-decision-bot共通: AbyssTower.jsxをNode上でjsdomレンダリングするための環境セットアップ。
// 副作用として複数のグローバルを書き換えるため、ワーカープロセスの起動時に一度だけ呼び出すこと。
export async function setupJsdomEnv() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const setGlobal = (key, value) => Object.defineProperty(global, key, { value, configurable: true, writable: true });
  setGlobal("window", dom.window);
  setGlobal("document", dom.window.document);
  setGlobal("navigator", dom.window.navigator); // Node 22はnavigatorをgetter専用で定義済みのため代入不可。definePropertyで上書き
  dom.window.__abyssTestFast = true; // 戦闘演出(ダメージポップ等)の待ち時間を完全にスキップさせる(TASK-009)
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
  return dom;
}
