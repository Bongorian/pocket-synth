'use strict';
SynthEngines.register('physical',{
  label:'Physical Model',defaults:{stringDamping:.45,stringDecay:2.2,pluckPoint:.25},
  controls:['stringDamping','stringDecay','pluckPoint'],
  description:'Karplus–Strong弦モデル。弦の減衰・明るさ・弾く位置を調整（次の発音から）。',
  create(s,v,t){
    const p=v.params,rate=24000,hz=Math.min(9000,v.hz),period=rate/hz-(.05+p.stringDamping*.9);
    const key=`ks:${v.midi}:${p.stringDamping}:${p.stringDecay}:${p.pluckPoint}`;
    const b=EngineNodes.cached(s,key,()=>{
      const length=Math.ceil(rate*Math.min(6,p.stringDecay*2)),b=s.ctx.createBuffer(1,length,rate),out=b.getChannelData(0);
      const n=Math.max(2,Math.ceil(period)+1),line=new Float32Array(n),excitation=new Float32Array(n);let seed=314159;
      for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;excitation[i]=seed/2147483648-1;}
      const pick=Math.max(1,Math.floor(n*p.pluckPoint));let mean=0;
      for(let i=0;i<n;i++){line[i]=(excitation[i]-excitation[(i+pick)%n])*.5;mean+=line[i]/n;}
      for(let i=0;i<n;i++)line[i]-=mean;
      const loss=Math.pow(.001,1/(hz*p.stringDecay)),damp=.05+p.stringDamping*.9,delay=Math.ceil(period),f=delay-period;let at=0,previous=0;
      for(let i=0;i<length;i++){
        let j=at-delay;if(j<0)j+=n;let next=j+1;if(next===n)next=0;
        const x=line[j]*(1-f)+line[next]*f;
        const y=(x*(1-damp)+previous*damp)*loss;previous=x;line[at]=y;if(++at===n)at=0;out[i]=y*2;
      }
      // Fade the finite modeled tail to silence.
      for(let i=0;i<240;i++)out[length-1-i]*=i/240;
      return b;
    });
    EngineNodes.buffer(s,v,t,b,69+12*Math.log2(hz/440),false);
  }
});
