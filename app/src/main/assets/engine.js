'use strict';
class SynthEngine {
  constructor() {
    this.ctx = null; this.voices = new Map(); this.live = new Set();
    this.maxVoices = 16; this.selectedPart = 0; this.masterVolume = .35;
    this.soloPart = -1;
    this.performanceControls = Array.from({length:16},()=>({bend:0,modulation:0}));
    this.defaults = { mode:'analog',drive:0,
      detune: 8, cutoff: 2400, resonance: 1.2, sub: .2,
      attack: .015, decay: .25, sustain: .65, release: .3,
      delay: .2, feedback: .25, mix: .15, lfoRate: 4, lfoDepth: 0, volume: .35, filterMod:0,tremolo:0, ...SynthEngines.defaults() };
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
    this.waveCache = new Map(); this.curveCache = new Map(); this.bufferCache = new Map();
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
    if (p.bus) { this.smooth(p.bus.output.gain, p.mute || (this.soloPart >= 0 && this.soloPart !== index) ? 0 : p.level); this.smooth(p.bus.pan.pan, p.pan); }
  }
  solo(index) {
    this.soloPart = this.soloPart === index ? -1 : index;
    for(let i=0;i<16;i++)this.mixer(i,{});
  }
  perform(index, values) {
    Object.assign(this.performanceControls[index],values);
    for(const v of this.live)if(v.part===index){this.pitch(v,v.bend);this.controls(v,v.control);}
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
    if(values.mode && values.mode!==this.parts[index].params.mode)this.stopPart(index);
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
      v.params = {...p}; SynthEngines.get(v.mode).update?.(this,v,values); this.pitch(v,v.bend);
      this.smooth(v.sub.gain,p.sub); this.smooth(v.filter.Q,p.resonance); this.controls(v,v.control);
    }
  }
  pitch(v,cents=0) {
    v.bend=cents; if(v.oneshot)return;
    const total=cents+this.performanceControls[v.part].bend;
    v.osc.forEach((o,i)=>{if(o.detune)this.smooth(o.detune,total+(v.dual&&i<2?(i?1:-1)*v.params.detune/2:0));});
    if(v.mod)this.smooth(v.mod.detune,total);
  }
  expression(v,level) { this.smooth(v.expression.gain,level); }
  controls(v,control={}) {
    v.control={...control};
    if(v.filterLfo)this.smooth(v.filterLfo.gain,v.params.filterMod);
    if(v.tremoloLfo){this.smooth(v.tremoloLfo.gain,v.params.tremolo*.5);this.smooth(v.tremolo.gain,1-v.params.tremolo*.5);}
    if(v.filter)this.smooth(v.filter.frequency,control.cutoff ?? v.params.cutoff);
    if(v.vibrato)this.smooth(v.vibrato.gain,v.params.lfoDepth+(control.modulation||0)+this.performanceControls[v.part].modulation);
  }
  reserve(index) {
    if(this.live.size<this.maxVoices)return;
    const all=[...this.live];
    this.dispose(all.find(v=>v.released)||all.find(v=>v.part===index)||all[0]);
  }
  noteOn(id,midi,time,velocity=1,index=this.selectedPart) {
    const existing=this.voices.get(id);
    if(existing) { if(existing.oneshot)this.dispose(existing); else return; }
    if(this.parts[index].mute || (this.soloPart >= 0 && this.soloPart !== index))return;
    this.init(); this.reserve(index);
    const c=this.ctx,p={...this.parts[index].params},b=this.createBus(index),t=time??c.currentTime;
    if(SynthEngines.get(p.mode).oneshot) { SynthEngines.get(p.mode).create(this,{id,midi,t,velocity,index,p,b}); return; }
    const osc=[];
    const filter=c.createBiquadFilter(),amp=c.createGain(),sub=c.createGain(),expression=c.createGain(),vibrato=c.createGain();
    filter.type='lowpass';filter.frequency.value=p.cutoff;filter.Q.value=p.resonance;
    const hz=440*Math.pow(2,(midi-69)/12),peak=.16*Math.max(0,Math.min(1,velocity));
    const v={id,midi,part:index,params:p,osc,filter,amp,sub,expression,vibrato,hz,bend:0,mode:p.mode,start:t,
      attack:p.attack,decay:p.decay,sustain:p.sustain,peak,released:false,control:{},extra:[]};
    SynthEngines.get(p.mode).create(this,v,t);
    b.lfo.connect(vibrato);vibrato.gain.value=p.lfoDepth;
    sub.gain.value=p.sub;
    v.filterLfo=c.createGain();v.tremoloLfo=c.createGain();v.tremolo=c.createGain();
    b.lfo.connect(v.filterLfo).connect(filter.frequency);b.lfo.connect(v.tremoloLfo).connect(v.tremolo.gain);
    v.extra.push(v.filterLfo,v.tremoloLfo,v.tremolo);
    filter.connect(amp).connect(expression).connect(v.tremolo).connect(b.input);
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+p.attack);
    amp.gain.linearRampToValueAtTime(peak*p.sustain,t+p.attack+p.decay);
    this.register(v);
  }
  register(v) { this.voices.set(v.id,v);this.live.add(v);if(!v.oneshot){this.pitch(v,0);this.controls(v,{});}v.osc[0].onended=()=>this.dispose(v); }
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
    [...v.osc,...(v.auxSources||[])].forEach(o=>o.stop(t+r+.02));if(v.mod)v.mod.stop(t+r+.02);
  }
  dispose(v) {
    if(!this.live.has(v))return;this.live.delete(v);if(this.voices.get(v.id)===v)this.voices.delete(v.id);
    for(const o of [...v.osc,...(v.auxSources||[]),...(v.mod?[v.mod]:[])]) {o.onended=null;try{o.stop();}catch(_){}o.disconnect();}
    for(const node of [v.filterLfo,v.tremoloLfo])if(node)this.parts[v.part].bus.lfo.disconnect(node);
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
