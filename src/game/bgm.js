// BGM(背景音楽)再生。ブラウザの自動再生制限があるため、ユーザー操作後に呼び出すこと
let audio = null;
let bgmMuted = false;

function getAudio() {
  if (!audio) {
    audio = new Audio(`${import.meta.env.BASE_URL}bgm/summit-of-the-iron-pagoda.mp3`);
    audio.loop = true;
    audio.volume = 0.35;
    audio.muted = bgmMuted;
  }
  return audio;
}

// 初回のユーザー操作(クリック/タップ)の中で呼ぶこと。2回目以降は再生中なら何もしない
export function playBgm() {
  const a = getAudio();
  if (!a.paused) return;
  a.play().catch(() => { /* 自動再生がブロックされても静かに無視(次の操作で再試行される) */ });
}

export function setBgmMuted(v) {
  bgmMuted = v;
  if (audio) audio.muted = v;
}
