'use strict';
SynthEngines.register('ring',{
  defaults:{ringRatio:2.5,ringMix:.8},
  label:'Ring Mod',controls:['ringRatio','ringMix'],description:'リング変調による金属的な倍音。',
  create(s,v,t){
    const c=s.ctx,p=v.params;v.carrier=c.createGain();v.ring=c.createGain();v.dry=c.createGain();v.wet=c.createGain();v.mod=c.createOscillator();
    v.dry.gain.value=1-p.ringMix;v.wet.gain.value=p.ringMix;v.ring.gain.value=0;v.mod.frequency.value=v.hz*p.ringRatio;
    v.carrier.connect(v.dry).connect(v.filter);v.carrier.connect(v.ring).connect(v.wet).connect(v.filter);v.mod.connect(v.ring.gain);
    v.extra.push(v.carrier,v.ring,v.dry,v.wet);v.vibrato.connect(v.mod.detune);v.mod.start(t);EngineNodes.dual(s,v,t,v.carrier);
  },
  update(s,v){v.osc.slice(0,2).forEach(o=>o.type=v.params.wave);s.smooth(v.mod.frequency,v.hz*v.params.ringRatio);s.smooth(v.dry.gain,1-v.params.ringMix);s.smooth(v.wet.gain,v.params.ringMix);}
});
