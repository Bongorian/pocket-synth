'use strict';
window.SampleBank={
  get(s,p){
    const raw=p.sampleData||FACTORY_SAMPLES[p.sample]||FACTORY_SAMPLES.pluck;
    return EngineNodes.cached(s,raw,()=>{
      const bytes=atob(raw),b=s.ctx.createBuffer(1,bytes.length/2,24000),d=b.getChannelData(0);
      for(let i=0;i<d.length;i++){let n=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);d[i]=(n>32767?n-65536:n)/32768;}
      return b;
    });
  }
};
SynthEngines.register('pcm',{
  label:'PCM Sampler',defaults:{sample:'pluck',sampleData:'',sampleName:'',sampleRoot:60,sampleStart:0,sampleLoop:0},
  controls:['sampleRoot','sampleStart','sampleLoop'],sample:true,
  description:'PCMを鍵盤にマッピング。音声ファイルを読み込み可能（2秒以内）。開始位置・ループは次の発音から。',
  create(s,v,t){const p=v.params,b=SampleBank.get(s,p);EngineNodes.buffer(s,v,t,b,p.sampleRoot,!!p.sampleLoop,p.sampleStart*(b.duration-.01));}
});
