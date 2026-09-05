'use strict';
class SynthEngine {
  constructor() {
    this.ctx = null; this.voices = new Map(); this.live = new Set();
    this.maxVoices = 16; this.selectedPart = 0; this.masterVolume = .35;
    this.defaults = { mode: 'analog', wave: 'sawtooth', table: 'basic', position: .3,
      fmRatio: 2, fmIndex: 2, fmDecay: .35, drive: 0, harmonics: 12, tilt: 1.4, even: .5,
      ringRatio: 2.5, ringMix: .8, kit: 'electro', drumTone: 0, drumDecay: 1,
      detune: 8, cutoff: 2400, resonance: 1.2, sub: .2,
      attack: .015, decay: .25, sustain: .65, release: .3,
      delay: .2, feedback: .25, mix: .15, lfoRate: 4, lfoDepth: 0, volume: .35 };
    this.parts = Array.from({length: 16}, () => ({ params: {...this.defaults}, name: 'Warm Keys', level: 1, pan: 0, mute: false, bus: null }));
    this.params = this.parts[0].params;
  }
  init(context) {
    if (this.ctx) return;
    this.parts[this.selectedPart].params = this.params;
    this.ctx = context || new AudioContext({latencyHint: 'interactive'});
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volumeSet ? this.masterVolume : this.params.volume;
    this.limiter = c.createDynamicsCompressor();
    Object.entries({threshold: -12, knee: 6, ratio: 12, attack: .003, release: .15}).forEach(([k,v]) => this.limiter[k].value = v);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 512;
    this.master.connect(this.limiter).connect(this.analyser).connect(c.destination);
    this.waveCache = new Map(); this.curveCache = new Map();
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    let seed = 123456789;
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
  }
  wake() { this.init(); if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  smooth(param, value) { param.setTargetAtTime(value, this.ctx.currentTime, .015); }
  selectPart(index) {
    if (!Number.isInteger(index) || index < 0 || index > 15) return;
    this.selectedPart = index; this.params = this.parts[index].params;
  }
  setPatch(index, patch, name) {
    this.stopPart(index);
    this.parts[index].params = {...this.defaults, ...patch};
    this.parts[index].name = name;
    if (index === this.selectedPart) this.params = this.parts[index].params;
    if (this.parts[index].bus) this.updateBus(index);
  }
  mixer(index, values) {
    const p = this.parts[index];
    if (values.level !== undefined) p.level = Math.max(0, Math.min(1.5, values.level));
    if (values.pan !== undefined) p.pan = Math.max(-1, Math.min(1, values.pan));
    if (values.mute !== undefined) p.mute = Boolean(values.mute);
    if (p.bus) { this.smooth(p.bus.output.gain, p.mute ? 0 : p.level); this.smooth(p.bus.pan.pan, p.pan); }
  }
  createBus(index) {
    const part = this.parts[index]; if (part.bus) return part.bus;
    const c = this.ctx, b = {input:c.createGain(), shaper:c.createWaveShaper(), delay:c.createDelay(1.5),
      feedback:c.createGain(), wet:c.createGain(), output:c.createGain(), pan:c.createStereoPanner(), lfo:c.createOscillator()};
    b.shaper.oversample = '2x';
    b.input.connect(b.shaper); b.shaper.connect(b.output); b.shaper.connect(b.delay);
    b.delay.connect(b.feedback).connect(b.delay); b.delay.connect(b.wet).connect(b.output);
    b.output.connect(b.pan).connect(this.master); b.lfo.start();
    part.bus = b; this.updateBus(index); return b;
  }
  updateBus(index) {
    const part = this.parts[index], p = part.params, b = part.bus; if (!b) return;
    if (b.drive !== p.drive) {
      if (!this.curveCache.has(p.drive)) {
        const curve = new Float32Array(2048), k = 1 + p.drive * 3;
        for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = p.drive === 0 ? x : Math.tanh(x*k)/Math.tanh(k); }
        this.curveCache.set(p.drive, curve);
      }
      b.shaper.curve = this.curveCache.get(p.drive); b.drive = p.drive;
    }
    this.smooth(b.delay.delayTime,p.delay); this.smooth(b.feedback.gain,p.feedback);
    this.smooth(b.wet.gain,p.mix); this.smooth(b.lfo.frequency,p.lfoRate);
    this.mixer(index, {});
  }
  update(values, index = this.selectedPart) {
    Object.assign(this.parts[index].params, values);
    if (values.volume !== undefined) {
      this.masterVolume = values.volume; this.volumeSet = true;
      if (this.ctx) this.smooth(this.master.gain, values.volume);
    }
    if (!this.ctx) return;
    this.updateBus(index);
    const p = this.parts[index].params;
    for (const v of this.live) {
      if (v.part !== index || v.oneshot) continue;
      v.params = {...p}; this.setWave(v); this.pitch(v, v.bend);
      if (v.mode === 'fm') {
        if (values.fmRatio !== undefined) this.smooth(v.mod.frequency,v.hz*p.fmRatio);
        if (values.fmIndex !== undefined) { v.fm.gain.cancelScheduledValues(this.ctx.currentTime); this.smooth(v.fm.gain,v.hz*p.fmIndex*.25); }
      }
      if (v.mode === 'ring') {
        this.smooth(v.mod.frequency,v.hz*p.ringRatio); this.smooth(v.dry.gain,1-p.ringMix); this.smooth(v.wet.gain,p.ringMix);
      }
      this.smooth(v.sub.gain,p.sub); this.smooth(v.filter.Q,p.resonance); this.controls(v,v.control);
    }
  }
  periodic(p) {
    const step = Math.round(p.position*128);
    const key = p.mode === 'additive' ? `add:${p.harmonics}:${p.tilt.toFixed(2)}:${p.even.toFixed(2)}` : `${p.table}:${step}`;
    if (this.waveCache.has(key)) return this.waveCache.get(key);
    const real = new Float32Array(65), imag = new Float32Array(65);
    if (p.mode === 'additive') {
      for (let n=1; n<=Math.round(p.harmonics); n++) imag[n] = (n%2 ? 1 : p.even) / Math.pow(n,p.tilt);
    } else {
      const frame=step/32, low=Math.floor(frame), high=Math.min(4,low+1), mix=frame-low;
      const partial=(n,f)=>{
        if(p.table==='vocal') return (n===1?.7:0)+Math.exp(-Math.pow((n-[2,4,7,11,16][f])/2.5,2))*.5/Math.sqrt(n);
        if(p.table==='metal') return Math.sin(n*[1.2,2.1,3.7,5.1,7.3][f])/Math.pow(n,.8);
        if(f===0) return n===1?1:0;
        if(f===1) return n%2?Math.pow(-1,(n-1)/2)/(n*n):0;
        if(f===2) return n<32?1/n:0;
        if(f===3) return n%2?1/n:0;
        return Math.sin(n*Math.PI*.15)/n;
      };
      for(let n=1;n<imag.length;n++) imag[n]=partial(n,low)*(1-mix)+partial(n,high)*mix;
    }
    const wave=this.ctx.createPeriodicWave(real,imag);
    if(this.waveCache.size>=192) this.waveCache.delete(this.waveCache.keys().next().value);
    this.waveCache.set(key,wave); return wave;
  }
  setWave(v) {
    const p=v.params;
    if(v.mode==='wavetable'||v.mode==='additive') { const w=this.periodic(p); v.osc[0].setPeriodicWave(w); v.osc[1].setPeriodicWave(w); }
    else v.osc[0].type=v.osc[1].type=v.mode==='fm'?'sine':p.wave;
  }
  pitch(v,cents=0) {
    v.bend=cents; if(v.oneshot)return;
    v.osc.forEach((o,i)=>this.smooth(o.detune,cents+(i<2?(i?1:-1)*v.params.detune/2:0)));
    if(v.mod)this.smooth(v.mod.detune,cents);
  }
  expression(v,level) { this.smooth(v.expression.gain,level); }
  controls(v,control={}) {
    v.control={...control};
    if(v.filter)this.smooth(v.filter.frequency,control.cutoff ?? v.params.cutoff);
    if(v.vibrato)this.smooth(v.vibrato.gain,v.params.lfoDepth+(control.modulation||0));
  }
  reserve(index) {
    if(this.live.size<this.maxVoices)return;
    const all=[...this.live];
    this.dispose(all.find(v=>v.released)||all.find(v=>v.part===index)||all[0]);
  }
  noteOn(id,midi,time,velocity=1,index=this.selectedPart) {
    const existing=this.voices.get(id);
    if(existing) { if(existing.oneshot)this.dispose(existing); else return; }
    if(this.parts[index].mute)return;
    this.init(); this.reserve(index);
    const c=this.ctx,p={...this.parts[index].params},b=this.createBus(index),t=time??c.currentTime;
    if(p.mode==='drums') { this.drum(id,midi,t,velocity,index,p,b); return; }
    const osc=[c.createOscillator(),c.createOscillator(),c.createOscillator()];
    const filter=c.createBiquadFilter(),amp=c.createGain(),sub=c.createGain(),expression=c.createGain(),vibrato=c.createGain();
    filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=p.resonance;
    const hz=440*Math.pow(2,(midi-69)/12),peak=.16*Math.max(0,Math.min(1,velocity));
    const v={id,midi,part:index,params:p,osc,filter,amp,sub,expression,vibrato,hz,bend:0,mode:p.mode,start:t,
      attack:p.attack,decay:p.decay,sustain:p.sustain,peak,released:false,control:{},extra:[]};
    if(p.mode==='ring') {
      v.carrier=c.createGain();v.ring=c.createGain();v.dry=c.createGain();v.wet=c.createGain();v.mod=c.createOscillator();
      v.dry.gain.value=1-p.ringMix;v.wet.gain.value=p.ringMix;v.ring.gain.value=0;v.mod.frequency.value=hz*p.ringRatio;
      v.carrier.connect(v.dry).connect(filter);v.carrier.connect(v.ring).connect(v.wet).connect(filter);v.mod.connect(v.ring.gain);
      v.extra.push(v.carrier,v.ring,v.dry,v.wet);v.mod.start(t);
    }
    osc.forEach((o,i)=>{
      o.frequency.value=i===2?hz/2:hz;o.type=i===2?'sine':p.wave;
      o.detune.value=i<2?(i?1:-1)*p.detune/2:0;
      if(i<2)o.connect(v.carrier||filter);else o.connect(sub).connect(filter);
      vibrato.connect(o.detune);o.start(t);
    });
    b.lfo.connect(vibrato);vibrato.gain.value=p.lfoDepth;
    sub.gain.value=p.sub;filter.connect(amp).connect(expression).connect(b.input);
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+p.attack);
    amp.gain.linearRampToValueAtTime(peak*p.sustain,t+p.attack+p.decay);
    this.setWave(v);
    if(p.mode==='fm') {
      v.mod=c.createOscillator();v.fm=c.createGain();v.mod.frequency.value=hz*p.fmRatio;
      v.fm.gain.setValueAtTime(hz*p.fmIndex,t);v.fm.gain.exponentialRampToValueAtTime(Math.max(.001,hz*p.fmIndex*.25),t+p.fmDecay);
      v.mod.connect(v.fm);v.fm.connect(osc[0].frequency);v.fm.connect(osc[1].frequency);v.mod.start(t);v.extra.push(v.fm);
    }
    if(v.mod)vibrato.connect(v.mod.detune);
    this.register(v);
  }
  register(v) { this.voices.set(v.id,v);this.live.add(v);v.osc[0].onended=()=>this.dispose(v); }
  drum(id,midi,t,velocity,index,p,b) {
    const c=this.ctx,group=SynthEngine.drumGroup(midi),tune=Math.pow(2,p.drumTone/12)*(p.kit==='deep'?.82:1);
    if(group==='hat') for(const v of [...this.live]) if(v.part===index&&v.drumGroup==='hat')this.dispose(v);
    const durations={kick:.5,snare:.22,clap:.19,hat:midi===46?.5:.075,tom:.32,cymbal:midi===51||midi===59?.65:1.3,rim:.06,bell:.4,shaker:.07};
    const duration=durations[group]*p.drumDecay*(p.kit==='dust'?.7:1);
    const amp=c.createGain(),expression=c.createGain(),filter=c.createBiquadFilter(),sources=[],extra=[];
    filter.type='lowpass';filter.frequency.value=p.kit==='dust'?Math.min(6500,p.cutoff):p.cutoff;filter.Q.value=.5;
    filter.connect(amp).connect(expression).connect(b.input);
    const tone=(type,hz,level,sweep)=>{
      const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(hz*tune,t);
      if(sweep)o.frequency.exponentialRampToValueAtTime(sweep*tune,t+Math.min(.08,duration*.6));
      g.gain.value=level;o.connect(g).connect(filter);sources.push(o);extra.push(g);
    };
    const noise=(hz,level,type='highpass')=>{
      const o=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();o.buffer=this.noise;o.loop=true;
      f.type=type;f.frequency.value=Math.min(18000,hz*tune);f.Q.value=.7;g.gain.value=level;
      o.connect(f).connect(g).connect(filter);sources.push(o);extra.push(f,g);
    };
    if(group==='kick')tone('sine',140,1,45);
    else if(group==='snare') {tone('triangle',180,.35,120);noise(1400,.8);}
    else if(group==='clap')noise(1100,1,'bandpass');
    else if(group==='hat')noise(6500,.55);
    else if(group==='cymbal') {noise(4500,.4);tone('square',731,.08);tone('square',1123,.06);}
    else if(group==='tom')tone('sine',170*Math.pow(2,(midi-45)/12),.9,75*Math.pow(2,(midi-45)/12));
    else if(group==='rim') {tone('triangle',850,.4);tone('sine',1700,.25);}
    else if(group==='bell') {tone('square',540,.25);tone('square',800,.2);}
    else noise(3500,.55,'bandpass');
    const peak=.5*Math.max(0,Math.min(1,velocity));
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+.002);
    if(group==='clap') {
      for(const offset of [.012,.025]) {amp.gain.linearRampToValueAtTime(.02,t+offset);amp.gain.linearRampToValueAtTime(peak,t+offset+.003);}
    }
    amp.gain.exponentialRampToValueAtTime(.00001,t+Math.max(.035,duration));
    sources.forEach(o=>{o.start(t);o.stop(t+Math.max(.035,duration)+.02);});
    this.register({id,midi,part:index,params:p,mode:'drums',drumGroup:group,oneshot:true,osc:sources,amp,expression,filter,extra,released:false,bend:0,control:{}});
  }
  static drumGroup(note) {
    if([35,36].includes(note))return 'kick';
    if([38,40].includes(note))return 'snare';
    if(note===39)return 'clap';
    if([42,44,46].includes(note))return 'hat';
    if([41,43,45,47,48,50,60,61,62,63,64,65,66].includes(note))return 'tom';
    if([49,51,52,55,57,59].includes(note))return 'cymbal';
    if([37,75,76,77].includes(note))return 'rim';
    if([53,56,67,68,80,81].includes(note))return 'bell';
    return 'shaker';
  }
  noteOff(id,time) {
    const v=this.voices.get(id);if(!v||v.oneshot)return;
    this.voices.delete(id);v.released=true;
    const t=time??this.ctx.currentTime,r=v.params.release,elapsed=Math.max(0,t-v.start);
    const level=elapsed<v.attack?v.peak*elapsed/v.attack:elapsed<v.attack+v.decay?v.peak*(1-(1-v.sustain)*(elapsed-v.attack)/v.decay):v.peak*v.sustain;
    v.amp.gain.cancelScheduledValues(t);v.amp.gain.setValueAtTime(level,t);v.amp.gain.linearRampToValueAtTime(0,t+r);
    v.osc.forEach(o=>o.stop(t+r+.02));if(v.mod)v.mod.stop(t+r+.02);
  }
  dispose(v) {
    if(!this.live.has(v))return;this.live.delete(v);if(this.voices.get(v.id)===v)this.voices.delete(v.id);
    for(const o of [...v.osc,...(v.mod?[v.mod]:[])]) {o.onended=null;try{o.stop();}catch(_){}o.disconnect();}
    if(v.vibrato){this.parts[v.part].bus.lfo.disconnect(v.vibrato);v.vibrato.disconnect();}
    for(const node of [v.filter,v.amp,v.sub,v.expression,...v.extra])if(node)node.disconnect();
    if(this.onVoiceEnded)this.onVoiceEnded();
  }
  clearDelay(index) {
    const b=this.parts[index].bus;if(!b)return;
    b.shaper.disconnect(b.delay);b.delay.disconnect();b.feedback.disconnect();
    b.delay=this.ctx.createDelay(1.5);b.delay.delayTime.value=this.parts[index].params.delay;
    b.shaper.connect(b.delay);b.delay.connect(b.feedback).connect(b.delay);b.delay.connect(b.wet);
  }
  stopPart(index) {for(const v of [...this.live])if(v.part===index)this.dispose(v);this.clearDelay(index);}
  panic() {for(const v of [...this.live])this.dispose(v);for(let i=0;i<16;i++)this.clearDelay(i);}
}
window.SynthEngine=SynthEngine;
