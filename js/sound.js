// Synthesised sound: UI blips, the opening bell, and a low trading-floor murmur.
let ctx = null, master = null, murmur = null;
export const sound = { muted: false };
try { sound.muted = localStorage.getItem('ws.muted') === '1'; } catch { /* storage blocked */ }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sound.muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function blip(freq = 600, dur = 0.08, type = 'sine', vol = 0.12) {
  const c = ac();
  if (!c || sound.muted) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

export function bell() {
  const c = ac();
  if (!c || sound.muted) return;
  [0, 0.32, 0.64].forEach((delay) => {
    [880, 1320, 2210, 2960].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14 / (i + 1), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 - i * 0.2);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 1.3);
    });
  });
}

// Filtered noise: a crowd of traders in the next room.
export function setMurmur(on) {
  const c = ac();
  if (!c) return;
  if (on && !murmur) {
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.08) * 0.97; d[i] = last; }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.9, c.currentTime + 1.5);
    src.connect(bp).connect(g).connect(master);
    src.start();
    murmur = { src, g };
  } else if (!on && murmur) {
    const m = murmur;
    murmur = null;
    m.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
    m.src.stop(c.currentTime + 0.7);
  }
}

export function toggleMute() {
  sound.muted = !sound.muted;
  try { localStorage.setItem('ws.muted', sound.muted ? '1' : '0'); } catch { /* ignore */ }
  const c = ac();
  if (c) master.gain.setTargetAtTime(sound.muted ? 0 : 0.5, c.currentTime, 0.05);
  return sound.muted;
}
