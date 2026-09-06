'use strict';
SynthEngines.register('analog',{
  defaults:{wave:'sawtooth'},
  label:'Virtual Analog',description:'2オシレーター＋サブ。TONEで波形・デチューンを調整。',
  create(s,v,t){EngineNodes.dual(s,v,t);},
  update(s,v){v.osc.slice(0,2).forEach(o=>o.type=v.params.wave);}
});
