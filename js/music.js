// Generative lo-fi radio built on WebAudio: every note is synthesized in the browser,
// so there are no audio files or licensed tracks. Off until someone presses play.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const TRACKS = [
  { name: 'Neon Rain', bpm: 74, root: 50, prog: [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]] },
  { name: 'After Hours Desk', bpm: 80, root: 45, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] },
  { name: 'Green Candles', bpm: 70, root: 53, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [-7, -3, 0, 3], [-5, -2, 2, 5]] },
];
const PENTA = [0, 3, 5, 7, 10, 12, 15];
const listeners = new Set();

class Radio {
  constructor() {
    this.ac = null;
    this.index = 0;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.seed = 7;
  }

  get track() { return TRACKS[this.index]; }
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  emit() { listeners.forEach((fn) => fn(this)); }

  ensure() {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = (this.ac = new AC());
    this.master = ac.createGain();
    this.master.gain.value = 0.55;
    this.lowpass = ac.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 2200; // warm, tape-like top end
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 64;
    this.levels = new Uint8Array(this.analyser.frequencyBinCount);
    this.lowpass.connect(this.master).connect(this.analyser).connect(ac.destination);

    const len = ac.sampleRate * 2;
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const echo = ac.createDelay();
    echo.delayTime.value = 0.34;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    echo.connect(fb).connect(echo);
    echo.connect(this.lowpass);
    this.echo = echo;
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  tone(freq, t, dur, { type = 'sine', gain = 0.1, attack = 0.02, dest = this.lowpass } = {}) {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (this.rand() - 0.5) * 12; // a little wow and flutter
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hit(t, { freq = 8000, type = 'highpass', gain = 0.05, dur = 0.05 }) {
    const s = this.ac.createBufferSource();
    s.buffer = this.noise;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.lowpass);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  kick(t) {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.lowpass);
    o.start(t);
    o.stop(t + 0.4);
  }

  schedule(step, t) {
    const tr = this.track;
    const sixteenth = 60 / tr.bpm / 4;
    const time = t + (step % 2 ? sixteenth * 0.2 : 0); // swing
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = tr.prog[bar % tr.prog.length];

    if (s === 0 || s === 10 || (s === 7 && bar % 2)) this.kick(time);
    if (s === 4 || s === 12) this.hit(time, { freq: 1700, type: 'bandpass', gain: 0.2, dur: 0.16 });
    if (s % 2 === 0) this.hit(time, { gain: s % 4 === 2 ? 0.045 : 0.02, dur: 0.04 });
    if (this.rand() < 0.08) this.hit(time, { freq: 3200, gain: 0.025, dur: 0.01 }); // vinyl crackle

    if (s === 0) {
      const barLen = sixteenth * 16;
      chord.forEach((n, i) => this.tone(midi(tr.root + 12 + n), time + i * 0.015, barLen * 0.95, { type: 'triangle', gain: 0.04, attack: 0.28 }));
      this.tone(midi(tr.root - 12 + chord[0]), time, barLen * 0.5, { gain: 0.15, attack: 0.03 });
    }
    if (s === 8) this.tone(midi(tr.root - 12 + chord[0]), time, sixteenth * 6, { gain: 0.11 });
    if ((s === 2 || s === 6 || s === 11 || s === 14) && this.rand() < 0.5) {
      const n = PENTA[Math.floor(this.rand() * PENTA.length)];
      this.tone(midi(tr.root + 24 + n), time, sixteenth * 3, { gain: 0.045, attack: 0.01, dest: this.echo });
      this.tone(midi(tr.root + 24 + n), time, sixteenth * 3, { gain: 0.03, attack: 0.01 });
    }
  }

  tick() {
    const sixteenth = 60 / this.track.bpm / 4;
    while (this.nextTime < this.ac.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  async play() {
    this.ensure();
    await this.ac.resume();
    if (this.playing) return;
    this.playing = true;
    this.seed = 7 + this.index * 131;
    this.step = 0;
    this.nextTime = this.ac.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), 25);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.ac?.suspend();
    this.emit();
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  next() {
    const was = this.playing;
    this.pause();
    this.index = (this.index + 1) % TRACKS.length;
    if (was) this.play(); else this.emit();
  }

  level() {
    if (!this.playing || !this.analyser) return 0;
    this.analyser.getByteFrequencyData(this.levels);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += this.levels[i];
    return sum / (8 * 255);
  }
}

export const radio = new Radio();
