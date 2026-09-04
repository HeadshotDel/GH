// Синтез на WebAudio: ни одного файла, игра остаётся полностью офлайновой
// и весит десятки килобайт.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const n = Math.floor(ctx.sampleRate * 0.3);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

// iOS не даёт звук без жеста — дёргаем на первом касании.
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.55 : 0; }

function tone({ freq, to, dur, type = 'sine', gain = 0.3, delay = 0 }) {
  const c = ensure(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to && to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.06, gain = 0.2, freq = 1800, q = 1.2, delay = 0 }) {
  const c = ensure(); if (!c || !enabled) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

// power — нормальная составляющая скорости удара, px/s
const norm = (p) => Math.min(1, p / 1600);

export function sfxPaddle(power) {
  const k = norm(power);
  tone({ freq: 210 + k * 190, to: 90 + k * 60, dur: 0.09 + k * 0.05, type: 'triangle', gain: 0.16 + k * 0.24 });
  noise({ dur: 0.035 + k * 0.03, gain: 0.06 + k * 0.16, freq: 1400 + k * 2200, q: 0.9 });
}

export function sfxWall(power) {
  const k = norm(power);
  tone({ freq: 420 + k * 260, to: 260, dur: 0.05, type: 'square', gain: 0.05 + k * 0.1 });
  noise({ dur: 0.03, gain: 0.04 + k * 0.09, freq: 2600 + k * 1800, q: 1.6 });
}

export function sfxPost(power) {
  const k = norm(power);
  tone({ freq: 1180, to: 760, dur: 0.16, type: 'sine', gain: 0.10 + k * 0.14 });
  noise({ dur: 0.05, gain: 0.06, freq: 3400, q: 3 });
}

export function sfxGoal() {
  noise({ dur: 0.42, gain: 0.16, freq: 900, q: 0.5 });
  [0, 0.075, 0.15].forEach((d, i) => tone({
    freq: 330 * Math.pow(1.26, i), to: 330 * Math.pow(1.26, i) * 1.5,
    dur: 0.3, type: 'triangle', gain: 0.24, delay: d,
  }));
  tone({ freq: 90, to: 45, dur: 0.5, type: 'sine', gain: 0.3 });
}

export function sfxWin() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone({ freq: f, dur: 0.42, type: 'triangle', gain: 0.24, delay: i * 0.11 }));
}

export function sfxTick(last) {
  tone({ freq: last ? 880 : 520, dur: last ? 0.24 : 0.09, type: 'sine', gain: 0.2 });
}

export function sfxUi() { tone({ freq: 620, to: 780, dur: 0.05, type: 'sine', gain: 0.09 }); }
