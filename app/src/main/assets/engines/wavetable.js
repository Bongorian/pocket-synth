'use strict';
SynthEngines.register('wavetable',{
  defaults:{table:'basic',position:.3},
  label:'Wavetable',controls:['position'],description:'5フレームを補間するウェーブテーブル。Positionで音色を連続変化。',
  create(s,v,t){EngineNodes.dual(s,v,t);EngineNodes.wave(s,v);},update:EngineNodes.wave,
  periodic(s,p){
    const step=Math.round(p.position*128),key=`wt:${p.table}:${step}`;
    if(s.waveCache.has(key))return s.waveCache.get(key);
    const real=new Float32Array(65),imag=new Float32Array(65),frame=step/32,low=Math.floor(frame),high=Math.min(4,low+1),mix=frame-low;
    const partial=(n,f)=>{
      if(p.table==='vocal')return (n===1?.7:0)+Math.exp(-Math.pow((n-[2,4,7,11,16][f])/2.5,2))*.5/Math.sqrt(n);
      if(p.table==='metal')return Math.sin(n*[1.2,2.1,3.7,5.1,7.3][f])/Math.pow(n,.8);
      if(f===0)return n===1?1:0;
      if(f===1)return n%2?Math.pow(-1,(n-1)/2)/(n*n):0;
      if(f===2)return n<32?1/n:0;
      if(f===3)return n%2?1/n:0;
      return Math.sin(n*Math.PI*.15)/n;
    };
    for(let n=1;n<65;n++)imag[n]=partial(n,low)*(1-mix)+partial(n,high)*mix;
    const w=s.ctx.createPeriodicWave(real,imag);if(s.waveCache.size>=192)s.waveCache.delete(s.waveCache.keys().next().value);s.waveCache.set(key,w);return w;
  }
});
