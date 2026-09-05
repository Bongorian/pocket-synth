'use strict';
class SynthEngine {
  constructor() {
    this.ctx = null;
    this.voices = new Map();
    this.live = new Set();
    this.params = { mode: 'analog', wave: 'sawtooth', table: 'basic', position: 0.3,
      fmRatio: 2, fmIndex: 2, fmDecay: 0.35, drive: 0,
      detune: 8, cutoff: 2400, resonance: 1.2, sub: 0.2,
      attack: 0.015, decay: 0.25, sustain: 0.65, release: 0.3,
      delay: 0.2, feedback: 0.25, mix: 0.15, lfoRate: 4, lfoDepth: 0, volume: 0.35 };
  }
  init(context) {
    if (this.ctx) return;
    this.ctx = context || new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.input = c.createGain();
    this.shaper = c.createWaveShaper();
    this.shaper.oversample = '2x';
    this.input.connect(this.shaper);
    this.delay = c.createDelay(1.5);
    this.feedback = c.createGain();
    this.wet = c.createGain();
    this.master = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 512;
    this.shaper.connect(this.master);
    this.shaper.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet).connect(this.master);
    this.master.connect(this.limiter).connect(this.analyser).connect(c.destination);
    this.lfo = c.createOscillator();
    this.lfoGain = c.createGain();
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
    this.waveCache = new Map();
    this.update(this.params);
  }
  wake() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  smooth(param, value) { param.setTargetAtTime(value, this.ctx.currentTime, 0.015); }
  update(values) {
    Object.assign(this.params, values);
    if (!this.ctx) return;
    const p = this.params;
    if (values.drive !== undefined || !this.shaper.curve) {
      const curve = new Float32Array(2048), k = 1 + p.drive * 3;
      for (let i = 0; i < curve.length; i++) {
        const x = i * 2 / (curve.length - 1) - 1;
        curve[i] = p.drive === 0 ? x : Math.tanh(x * k) / Math.tanh(k);
      }
      this.shaper.curve = curve;
    }
    this.smooth(this.master.gain, p.volume);
    this.smooth(this.delay.delayTime, p.delay);
    this.smooth(this.feedback.gain, p.feedback);
    this.smooth(this.wet.gain, p.mix);
    this.smooth(this.lfo.frequency, p.lfoRate);
    this.smooth(this.lfoGain.gain, p.lfoDepth);
    for (const v of this.live) {
      this.setWave(v);
      this.pitch(v, v.bend);
      if (v.mod) {
        if (values.fmRatio !== undefined) this.smooth(v.mod.frequency, v.hz * p.fmRatio);
        if (values.fmIndex !== undefined) {
          v.fm.gain.cancelScheduledValues(this.ctx.currentTime);
          this.smooth(v.fm.gain, v.hz * p.fmIndex * .25);
        }
      }
      this.smooth(v.sub.gain, p.sub);
      this.smooth(v.filter.frequency, p.cutoff);
      this.smooth(v.filter.Q, p.resonance);
    }
  }
  wavetable() {
    const p = this.params, step = Math.round(p.position * 128), key = p.table + ':' + step;
    if (this.waveCache.has(key)) return this.waveCache.get(key);
    const real = new Float32Array(65), imag = new Float32Array(65), position = step / 128;
    // Interpolate between five harmonic frames; PeriodicWave handles band limiting.
    const frame = position * 4, low = Math.floor(frame), high = Math.min(4, low + 1), mix = frame - low;
    const partial = (n, f) => {
      if (p.table === 'vocal') {
        const center = [2, 4, 7, 11, 16][f];
        return (n === 1 ? .7 : 0) + Math.exp(-Math.pow((n - center) / 2.5, 2)) * .5 / Math.sqrt(n);
      }
      if (p.table === 'metal') return Math.sin(n * [1.2, 2.1, 3.7, 5.1, 7.3][f]) / Math.pow(n, .8);
      if (f === 0) return n === 1 ? 1 : 0;
      if (f === 1) return n % 2 ? Math.pow(-1, (n - 1) / 2) / (n * n) : 0;
      if (f === 2) return n / 64 < .5 ? 1 / n : 0;
      if (f === 3) return n % 2 ? 1 / n : 0;
      return Math.sin(n * Math.PI * .15) / n;
    };
    for (let n = 1; n < imag.length; n++) imag[n] = partial(n, low) * (1 - mix) + partial(n, high) * mix;
    const wave = this.ctx.createPeriodicWave(real, imag);
    if (this.waveCache.size >= 128) this.waveCache.delete(this.waveCache.keys().next().value);
    this.waveCache.set(key, wave); return wave;
  }
  setWave(v) {
    if (v.mode === 'wavetable') {
      const w = this.wavetable(); v.osc[0].setPeriodicWave(w); v.osc[1].setPeriodicWave(w);
    } else v.osc[0].type = v.osc[1].type = v.mode === 'fm' ? 'sine' : this.params.wave;
  }
  pitch(v, cents = 0) {
    v.bend = cents;
    v.osc.forEach((o, i) => this.smooth(o.detune, cents + (i < 2 ? (i ? 1 : -1) * this.params.detune / 2 : 0)));
    if (v.mod) this.smooth(v.mod.detune, cents);
  }
  expression(v, level) { this.smooth(v.expression.gain, level); }
  noteOn(id, midi, time, velocity = 1) {
    if (this.voices.has(id)) return;
    this.init();
    const c = this.ctx, p = this.params, t = time ?? c.currentTime;
    // Include release tails in the voice budget, preferring to steal a released voice.
    if (this.live.size >= 8) {
      const oldest = [...this.live].find(v => v.released) || this.live.values().next().value;
      this.dispose(oldest);
    }
    const osc = [c.createOscillator(), c.createOscillator(), c.createOscillator()];
    const filter = c.createBiquadFilter(), amp = c.createGain(), sub = c.createGain(), expression = c.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = p.cutoff;
    filter.Q.value = p.resonance;
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    osc.forEach((o, i) => {
      o.frequency.value = i === 2 ? hz / 2 : hz;
      o.type = i === 2 ? 'sine' : p.wave;
      if (i < 2) { o.detune.value = (i ? 1 : -1) * p.detune / 2; o.connect(filter); }
      else o.connect(sub).connect(filter);
      this.lfoGain.connect(o.detune);
      o.start(t);
    });
    sub.gain.value = p.sub;
    filter.connect(amp).connect(expression).connect(this.input);
    const peak = 0.16 * Math.max(0, Math.min(1, velocity));
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + p.attack);
    amp.gain.linearRampToValueAtTime(peak * p.sustain, t + p.attack + p.decay);
    const v = { id, midi, osc, filter, amp, sub, expression, hz, bend: 0, mode: p.mode, start: t, attack: p.attack,
      decay: p.decay, sustain: p.sustain, peak, released: false };
    this.setWave(v);
    if (p.mode === 'fm') {
      v.mod = c.createOscillator(); v.fm = c.createGain();
      v.mod.frequency.value = hz * p.fmRatio;
      v.fm.gain.setValueAtTime(hz * p.fmIndex, t);
      v.fm.gain.exponentialRampToValueAtTime(Math.max(.001, hz * p.fmIndex * .25), t + p.fmDecay);
      v.mod.connect(v.fm); v.fm.connect(osc[0].frequency); v.fm.connect(osc[1].frequency); v.mod.start(t);
    }
    this.voices.set(id, v);
    this.live.add(v);
    osc[0].onended = () => this.dispose(v);
  }
  noteOff(id, time) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    v.released = true;
    const t = time ?? this.ctx.currentTime, r = this.params.release;
    const elapsed = Math.max(0, t - v.start);
    const level = elapsed < v.attack ? v.peak * elapsed / v.attack :
      elapsed < v.attack + v.decay ? v.peak * (1 - (1 - v.sustain) * (elapsed - v.attack) / v.decay) : v.peak * v.sustain;
    v.amp.gain.cancelScheduledValues(t);
    v.amp.gain.setValueAtTime(level, t);
    v.amp.gain.linearRampToValueAtTime(0, t + r);
    v.osc.forEach(o => o.stop(t + r + 0.02));
    if (v.mod) v.mod.stop(t + r + 0.02);
  }
  dispose(v) {
    if (!this.live.has(v)) return;
    this.live.delete(v);
    if (this.voices.get(v.id) === v) this.voices.delete(v.id);
    v.osc.forEach(o => {
      o.onended = null;
      try { o.stop(); } catch (_) {}
      this.lfoGain.disconnect(o.detune);
      o.disconnect();
    });
    if (v.mod) { try { v.mod.stop(); } catch (_) {} v.mod.disconnect(); v.fm.disconnect(); }
    v.filter.disconnect(); v.amp.disconnect(); v.sub.disconnect(); v.expression.disconnect();
  }
  panic() {
    for (const v of [...this.live]) this.dispose(v);
    if (!this.ctx) return;
    // Recreate the delay to clear buffered echoes as well as held voices.
    this.shaper.disconnect(this.delay);
    this.delay.disconnect(); this.feedback.disconnect();
    this.delay = this.ctx.createDelay(1.5);
    this.delay.delayTime.value = this.params.delay;
    this.shaper.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.wet);
  }
}
window.SynthEngine = SynthEngine;
