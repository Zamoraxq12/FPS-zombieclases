// =============================================================================
//  SONIDO SINTETIZADO CON WEB AUDIO (no requiere archivos de audio)
// =============================================================================
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(gainNode, t, attack, decay, peak) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst({ dur = 0.2, freq = 1200, q = 1, peak = 0.8, type = 'lowpass', vol = 1 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, dur, peak * vol);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function tone({ from = 440, to = 220, dur = 0.2, wave = 'square', peak = 0.3, vol = 1, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.005, dur, peak * vol);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const SFX = {
  pistol() { burst({ dur: 0.18, freq: 2200, peak: 0.9 }); tone({ from: 180, to: 60, dur: 0.12, wave: 'triangle', peak: 0.5 }); },
  plasma() { tone({ from: 1400, to: 120, dur: 0.35, wave: 'sawtooth', peak: 0.25 }); burst({ dur: 0.25, freq: 600, peak: 0.4, type: 'bandpass', q: 3 }); },
  empty() { tone({ from: 900, to: 850, dur: 0.04, wave: 'square', peak: 0.12 }); },
  hit() { burst({ dur: 0.12, freq: 500, peak: 0.6 }); },
  kill() { tone({ from: 220, to: 50, dur: 0.6, wave: 'sawtooth', peak: 0.25 }); },
  switchWeapon() { tone({ from: 300, to: 500, dur: 0.06, peak: 0.1 }); tone({ from: 500, to: 300, dur: 0.06, peak: 0.1, delay: 0.08 }); },
  pickup() { tone({ from: 600, to: 600, dur: 0.07, peak: 0.15 }); tone({ from: 900, to: 900, dur: 0.1, peak: 0.15, delay: 0.08 }); },
  groan(vol = 1) {
    const base = 70 + Math.random() * 50;
    tone({ from: base * 1.4, to: base, dur: 0.8 + Math.random() * 0.4, wave: 'sawtooth', peak: 0.12, vol });
  },
  alert(vol = 1) { tone({ from: 160, to: 320, dur: 0.35, wave: 'sawtooth', peak: 0.15, vol }); },
  step() { burst({ dur: 0.05, freq: 300, peak: 0.12 }); },
  gameOver() { tone({ from: 300, to: 40, dur: 1.6, wave: 'sawtooth', peak: 0.35 }); burst({ dur: 0.8, freq: 400, peak: 0.6 }); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => tone({ from: f, to: f, dur: 0.25, wave: 'square', peak: 0.12, delay: i * 0.15 })); },
};
