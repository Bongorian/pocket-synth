'use strict';
// Engine contract: metadata/defaults/controls, create(host, voice, time), update(host, voice, changed).
// The host owns ADSR, MIDI expression, part effects, scheduling and all node disposal.
window.SynthEngines = {
  entries: new Map(),
  register(id, engine) {
    if(this.entries.has(id)||typeof engine.create!=='function')throw Error('Invalid engine: '+id);
    this.entries.set(id,Object.freeze(engine));
  },
  get(id) { return this.entries.get(id)||this.entries.get('analog'); },
  defaults() { return Object.assign({},...Array.from(this.entries.values(),e=>e.defaults||{})); }
};
window.EngineNodes = {
  dual(s,v,t,output=v.filter) {
    const c=s.ctx,p=v.params;v.dual=true;
    for(let i=0;i<3;i++) {
      const o=c.createOscillator();o.frequency.value=i===2?v.hz/2:v.hz;o.type=i===2?'sine':p.wave;
      if(i<2)o.connect(output);else o.connect(v.sub).connect(v.filter);
      v.vibrato.connect(o.detune);v.osc.push(o);o.start(t);
    }
  },
  wave(s,v) {const w=SynthEngines.get(v.mode).periodic(s,v.params);v.osc.slice(0,2).forEach(o=>o.setPeriodicWave(w));},
  cached(s,key,make) {
    if(s.bufferCache.has(key))return s.bufferCache.get(key);
    const b=make();if(s.bufferCache.size>=24)s.bufferCache.delete(s.bufferCache.keys().next().value);
    s.bufferCache.set(key,b);return b;
  },
  buffer(s,v,t,buffer,root,loop=true,offset=0) {
    const o=s.ctx.createBufferSource();o.buffer=buffer;o.loop=loop;
    o.playbackRate.value=Math.pow(2,(v.midi-root)/12);o.connect(v.filter);v.vibrato.connect(o.detune);
    v.osc.push(o);o.start(t,Math.min(offset,buffer.duration-.001));return o;
  }
};
