// サウンド(Web Audio APIで合成。外部ファイル不要)

// ===== サウンド(Web Audio APIで合成。外部ファイル不要) =====
let AC = null;

let SFX_MUTED = false;
let SFX_VOLUME = 1; // 0〜1(スライダーの割合。既存の各音のvolに乗算する)

function audioCtx() {
  if (typeof window === "undefined") return null;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    return AC;
  } catch (e) { return null; }
}

function sTone({ freq = 440, type = "square", dur = 0.1, vol = 0.1, delay = 0, slide = 0 }) {
  const ctx = audioCtx(); if (!ctx || SFX_MUTED) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol * SFX_VOLUME, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) { /* 音は失敗しても無視 */ }
}

function sNoise({ dur = 0.08, vol = 0.12, delay = 0, freq = 800 }) {
  const ctx = audioCtx(); if (!ctx || SFX_MUTED) return;
  try {
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol * SFX_VOLUME, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t0);
  } catch (e) { /* 無視 */ }
}

export const SFX = {
  attack: () => { sNoise({ dur: 0.07, vol: 0.14, freq: 900 }); sTone({ freq: 220, type: "square", dur: 0.06, vol: 0.06, slide: -120 }); },
  crit: () => { sNoise({ dur: 0.09, vol: 0.16, freq: 1400 }); sTone({ freq: 660, type: "square", dur: 0.09, vol: 0.09, slide: -300 }); sTone({ freq: 990, type: "square", dur: 0.07, vol: 0.06, delay: 0.03 }); },
  skill: () => { sTone({ freq: 300, type: "sawtooth", dur: 0.12, vol: 0.08, slide: 500 }); sNoise({ dur: 0.1, vol: 0.1, freq: 1800, delay: 0.02 }); },
  defend: () => { sTone({ freq: 140, type: "triangle", dur: 0.15, vol: 0.14, slide: -40 }); },
  hurt: (d = 0.18) => { sNoise({ dur: 0.1, vol: 0.13, freq: 400, delay: d }); sTone({ freq: 110, type: "sawtooth", dur: 0.12, vol: 0.1, slide: -40, delay: d }); },
  heavyHit: (d = 0.18) => { sTone({ freq: 70, type: "sawtooth", dur: 0.25, vol: 0.18, slide: -30, delay: d }); sNoise({ dur: 0.18, vol: 0.16, freq: 250, delay: d }); },
  potion: () => { sTone({ freq: 520, type: "sine", dur: 0.08, vol: 0.09 }); sTone({ freq: 660, type: "sine", dur: 0.08, vol: 0.09, delay: 0.07 }); sTone({ freq: 880, type: "sine", dur: 0.12, vol: 0.09, delay: 0.14 }); },
  kill: () => { sTone({ freq: 200, dur: 0.1, vol: 0.08, type: "square", slide: -100 }); sTone({ freq: 1046, type: "sine", dur: 0.09, vol: 0.07, delay: 0.08 }); sTone({ freq: 1318, type: "sine", dur: 0.12, vol: 0.07, delay: 0.15 }); },
  levelup: () => { [523, 659, 784, 1046].forEach((f, i) => sTone({ freq: f, type: "triangle", dur: 0.12, vol: 0.1, delay: i * 0.08 })); },
  drop: () => { sTone({ freq: 784, type: "triangle", dur: 0.08, vol: 0.08 }); sTone({ freq: 1174, type: "triangle", dur: 0.12, vol: 0.08, delay: 0.06 }); },
  unique: () => { [659, 830, 1046, 1318, 1661].forEach((f, i) => sTone({ freq: f, type: "sine", dur: 0.14, vol: 0.09, delay: i * 0.06 })); },
  relic: () => { [880, 1108, 1318].forEach((f, i) => sTone({ freq: f, type: "sine", dur: 0.14, vol: 0.08, delay: i * 0.07 })); },
  boss: () => { sTone({ freq: 82, type: "sawtooth", dur: 0.5, vol: 0.15 }); sTone({ freq: 123, type: "sawtooth", dur: 0.5, vol: 0.12, delay: 0.05 }); sTone({ freq: 65, type: "sawtooth", dur: 0.6, vol: 0.15, delay: 0.45 }); },
  freeze: () => { [2093, 1661, 2637].forEach((f, i) => sTone({ freq: f, type: "sine", dur: 0.07, vol: 0.06, delay: i * 0.04 })); },
  death: () => { [392, 311, 246, 196].forEach((f, i) => sTone({ freq: f, type: "sawtooth", dur: 0.25, vol: 0.11, delay: i * 0.16 })); },
  victory: () => { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => sTone({ freq: f, type: "triangle", dur: 0.16, vol: 0.11, delay: i * 0.11 })); },
};

export function setSfxMuted(v) { SFX_MUTED = v; }
export function setSfxVolume(v) { SFX_VOLUME = v; } // v: 0〜1
