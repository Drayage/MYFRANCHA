// audio.js — Web Audio API로 합성한 배경음/효과음(외부 음원 파일 없음)
// 브라우저 자동재생 정책 때문에 첫 사용자 입력 후에 AudioContext가 열린다.

const STORE_KEY = 'francha.audio';
let bgmEnabled = true;
let sfxEnabled = true;
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) { const p = JSON.parse(raw); bgmEnabled = p.bgm !== false; sfxEnabled = p.sfx !== false; }
} catch (e) { /* ignore */ }

let ctx = null, masterGain = null, bgmGain = null, sfxGain = null;

function ensureCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    masterGain = ctx.createGain(); masterGain.gain.value = 0.85; masterGain.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = bgmEnabled ? 0.2 : 0; bgmGain.connect(masterGain);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxEnabled ? 0.9 : 0; sfxGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function unlock() { ensureCtx(); }
document.addEventListener('pointerdown', unlock, { once: true });
document.addEventListener('keydown', unlock, { once: true });

// 짧은 톤 하나를 dest(버스)에 재생. type: sine/triangle/square/sawtooth.
function tone(dest, { freq, dur = 0.16, type = 'sine', gain = 0.3, delay = 0, filterFreq = null }) {
  const c = ensureCtx();
  if (!c || !dest) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.001), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let out = osc;
  if (filterFreq) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    osc.connect(f); out = f;
  }
  out.connect(g); g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// ── 효과음 ──
const SFX = {
  select:    () => tone(sfxGain, { freq: 660, dur: .08, type: 'triangle', gain: .22 }),
  deselect:  () => tone(sfxGain, { freq: 440, dur: .07, type: 'triangle', gain: .16 }),
  submit:    () => { tone(sfxGain, { freq: 520, dur: .12, type: 'sine', gain: .25 }); tone(sfxGain, { freq: 780, dur: .14, type: 'sine', gain: .18, delay: .06 }); },
  flip:      () => tone(sfxGain, { freq: 1400, dur: .05, type: 'square', gain: .07 }),
  move:      () => tone(sfxGain, { freq: 320, dur: .24, type: 'sawtooth', gain: .14, filterFreq: 1000 }),
  collision: () => { tone(sfxGain, { freq: 130, dur: .16, type: 'square', gain: .26 }); tone(sfxGain, { freq: 85, dur: .22, type: 'square', gain: .22, delay: .03 }); },
  nullify:   () => { tone(sfxGain, { freq: 200, dur: .12, type: 'square', gain: .22 }); tone(sfxGain, { freq: 150, dur: .18, type: 'square', gain: .2, delay: .09 }); },
  token:     () => { tone(sfxGain, { freq: 880, dur: .12, type: 'triangle', gain: .22 }); tone(sfxGain, { freq: 1180, dur: .18, type: 'triangle', gain: .2, delay: .09 }); },
  ability:   () => { tone(sfxGain, { freq: 1046, dur: .1, type: 'sine', gain: .16 }); tone(sfxGain, { freq: 1568, dur: .16, type: 'sine', gain: .14, delay: .07 }); },
  shield:    () => { tone(sfxGain, { freq: 300, dur: .18, type: 'sine', gain: .2 }); tone(sfxGain, { freq: 450, dur: .2, type: 'sine', gain: .16, delay: .05 }); },
  button:    () => tone(sfxGain, { freq: 700, dur: .05, type: 'sine', gain: .14 }),
  round:     () => [660, 880].forEach((f, i) => tone(sfxGain, { freq: f, dur: .16, type: 'triangle', gain: .18, delay: i * .09 })),
  win:       () => [523, 659, 784, 1046].forEach((f, i) => tone(sfxGain, { freq: f, dur: .3, type: 'triangle', gain: .22, delay: i * .13 })),
  lose:      () => [392, 349, 311, 262].forEach((f, i) => tone(sfxGain, { freq: f, dur: .36, type: 'sawtooth', gain: .15, delay: i * .17, filterFreq: 700 })),
};

export function sfx(name) {
  if (!sfxEnabled) return;
  ensureCtx();
  SFX[name]?.();
}

// ── 배경음: 가볍고 코믹한 마림바풍 루프(상표 다툼 코미디 테마에 맞춘 통통 튀는 진행) ──
const BGM_NOTES = [
  392, 440, 523, 440, 392, 349, 392, 440,
  523, 587, 659, 587, 523, 440, 392, 349,
];
let bgmTimer = null, bgmIdx = 0;
const BGM_STEP_MS = 260;

function bgmStep() {
  if (bgmEnabled) {
    const freq = BGM_NOTES[bgmIdx % BGM_NOTES.length];
    tone(bgmGain, { freq, dur: .46, type: 'triangle', gain: .5, filterFreq: 2400 });
    if (bgmIdx % 4 === 0) tone(bgmGain, { freq: freq / 2, dur: .85, type: 'sine', gain: .3 });
    bgmIdx++;
  }
  bgmTimer = setTimeout(bgmStep, BGM_STEP_MS);
}

export function startBgm() {
  ensureCtx();
  if (bgmTimer) return;
  bgmIdx = 0;
  bgmStep();
}
export function stopBgm() {
  clearTimeout(bgmTimer);
  bgmTimer = null;
}

export function setBgmEnabled(v) {
  bgmEnabled = v;
  if (bgmGain) bgmGain.gain.value = v ? 0.2 : 0;
  save();
}
export function setSfxEnabled(v) {
  sfxEnabled = v;
  if (sfxGain) sfxGain.gain.value = v ? 0.9 : 0;
  save();
}
export function isBgmEnabled() { return bgmEnabled; }
export function isSfxEnabled() { return sfxEnabled; }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ bgm: bgmEnabled, sfx: sfxEnabled })); } catch (e) { /* ignore */ }
}
