'use strict';
SynthEngines.register('additive',{
  defaults:{harmonics:12,tilt:1.4,even:.5},
  label:'Additive',controls:['harmonics','tilt','even'],description:'最大32倍音を合成。倍音数・傾斜・偶数倍音を個別に調整。',
  create(s,v,t){EngineNodes.dual(s,v,t);EngineNodes.wave(s,v);},update:EngineNodes.wave,
  periodic(s,p){
    const key=`add:${p.harmonics}:${p.tilt.toFixed(2)}:${p.even.toFixed(2)}`;
    if(s.waveCache.has(key))return s.waveCache.get(key);
    const real=new Float32Array(65),imag=new Float32Array(65);
    for(let n=1;n<=Math.round(p.harmonics);n++)imag[n]=(n%2?1:p.even)/Math.pow(n,p.tilt);
    const w=s.ctx.createPeriodicWave(real,imag);if(s.waveCache.size>=192)s.waveCache.delete(s.waveCache.keys().next().value);s.waveCache.set(key,w);return w;
  }
});
