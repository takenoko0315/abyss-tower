// BGM(背景音楽)再生。ブラウザの自動再生制限があるため、ユーザー操作後に呼び出すこと
let audio = null;
let bgmMuted = false;
let bgmVolume = 1; // 0〜1(スライダーの割合。BASE_VOLUMEに乗算する)
const BASE_VOLUME = 0.35; // 既存の既定音量

function getAudio() {
  if (!audio) {
    audio = new Audio(`${import.meta.env.BASE_URL}bgm/summit-of-the-iron-pagoda.mp3`);
    audio.loop = true;
    audio.volume = BASE_VOLUME * bgmVolume;
    audio.muted = bgmMuted;
  }
  return audio;
}

// 初回のユーザー操作(クリック/タップ)の中で呼ぶこと。play()が実際に成功したかどうかをPromiseで返す
// (モバイルSafari等は自動再生ブロックの解除に厳密なユーザー操作を要求するため、失敗したら呼び出し側で再試行できるようにする)
export function playBgm() {
  const a = getAudio();
  if (!a.paused) return Promise.resolve();
  return a.play();
}

export function setBgmMuted(v) {
  bgmMuted = v;
  if (audio) audio.muted = v;
}

export function setBgmVolume(v) { // v: 0〜1
  bgmVolume = v;
  if (audio) audio.volume = BASE_VOLUME * bgmVolume;
}
