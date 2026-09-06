'use strict';
SynthEngines.register('granular',{
  label:'Granular',defaults:{grainSize:.08,grainDensity:24,grainPosition:.3,grainSpread:.3,grainScan:.5},sample:true,
  controls:['grainSize','grainDensity','grainPosition','grainSpread','grainScan','sampleRoot'],
  description:'Hann窓の粒を重ねる循環クラウド。位置・散らばり・走査を調整（次の発音から）。',
  create(s,v,t){
    const p=v.params,source=SampleBank.get(s,p),key=`grain:${p.sampleData||p.sample}:${p.grainSize}:${p.grainDensity}:${p.grainPosition}:${p.grainSpread}:${p.grainScan}`;
    const b=EngineNodes.cached(s,key,()=>{
      const rate=24000,n=rate*2,b=s.ctx.createBuffer(1,n,rate),out=b.getChannelData(0),input=source.getChannelData(0);
      const count=Math.max(4,Math.round(p.grainDensity*2)),size=Math.round(p.grainSize*rate);const window=new Float32Array(size);for(let j=0;j<size;j++)window[j]=.5-.5*Math.cos(2*Math.PI*j/size);let seed=42;
      for(let g=0;g<count;g++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const position=((p.grainPosition+(seed/4294967296-.5)*p.grainSpread+p.grainScan*g/count)%1+1)%1;
        const from=Math.floor(position*input.length),start=Math.floor(g*n/count);
        for(let j=0;j<size;j++)out[(start+j)%n]+=input[(from+j)%input.length]*window[j];
      }
      const gain=1.6/Math.max(1,count*size/n*.5);for(let i=0;i<n;i++)out[i]*=gain;
      return b;
    });
    EngineNodes.buffer(s,v,t,b,p.sampleRoot,true);
  }
});
