'use strict';
SynthEngines.register('fm',{
  defaults:{fmRatio:2,fmIndex:2,fmDecay:.35},
  label:'FM',controls:['fmRatio','fmIndex','fmDecay'],description:'2オペレーターFM。Ratioで倍音構成、Indexで変調量を調整。',
  create(s,v,t){
    EngineNodes.dual(s,v,t);v.osc.slice(0,2).forEach(o=>o.type='sine');
    const p=v.params;v.mod=s.ctx.createOscillator();v.fm=s.ctx.createGain();v.mod.frequency.value=v.hz*p.fmRatio;
    v.fm.gain.setValueAtTime(v.hz*p.fmIndex,t);v.fm.gain.exponentialRampToValueAtTime(Math.max(.001,v.hz*p.fmIndex*.25),t+p.fmDecay);
    v.mod.connect(v.fm);v.osc.slice(0,2).forEach(o=>v.fm.connect(o.frequency));v.vibrato.connect(v.mod.detune);v.mod.start(t);v.extra.push(v.fm);
  },
  update(s,v,values){
    if(values.fmRatio!==undefined)s.smooth(v.mod.frequency,v.hz*v.params.fmRatio);
    if(values.fmIndex!==undefined){v.fm.gain.cancelScheduledValues(s.ctx.currentTime);s.smooth(v.fm.gain,v.hz*v.params.fmIndex*.25);}
  }
});
