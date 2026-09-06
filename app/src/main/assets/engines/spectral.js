'use strict';
// Freeze a sample frame in the frequency domain; remap partials and resynthesize with a bandlimited PeriodicWave.
SynthEngines.register('spectral',{
  label:'Spectral',defaults:{spectralPosition:.25,spectralShift:0,spectralTilt:0,spectralBlur:.2},sample:true,
  controls:['spectralPosition','spectralShift','spectralTilt','spectralBlur'],
  description:'PCMの短時間スペクトルを静止・再合成。倍音シフト・傾斜・ぼかしは演奏中も反映。',
  create(s,v,t){EngineNodes.dual(s,v,t);this.update(s,v);},
  update(s,v){
    const p=v.params,b=SampleBank.get(s,p),key=`spectrum:${p.sampleData||p.sample}:${p.spectralPosition}:${p.spectralShift}:${p.spectralTilt}:${p.spectralBlur}`;
    let w=s.waveCache.get(key);
    if(!w){
      const data=b.getChannelData(0),n=512,start=Math.floor(p.spectralPosition*Math.max(0,data.length-n));
      const mag=new Float32Array(65),real=new Float32Array(65),imag=new Float32Array(65);
      for(let k=1;k<=64;k++){
        let re=0,im=0;for(let j=0;j<n;j++){const x=data[(start+j)%data.length]*(.5-.5*Math.cos(2*Math.PI*j/n)),phase=2*Math.PI*k*j/n;re+=x*Math.cos(phase);im+=x*Math.sin(phase);}
        mag[k]=Math.hypot(re,im)/n;
      }
      const shift=Math.round(p.spectralShift);
      for(let k=1;k<=64;k++){
        const src=k-shift;
        if(src<1||src>64)continue;
        const blurred=(mag[Math.max(1,src-1)]+mag[src]+mag[Math.min(64,src+1)])/3;
        imag[k]=(mag[src]*(1-p.spectralBlur)+blurred*p.spectralBlur)*Math.pow(k,p.spectralTilt);
      }
      w=s.ctx.createPeriodicWave(real,imag);if(s.waveCache.size>=192)s.waveCache.delete(s.waveCache.keys().next().value);s.waveCache.set(key,w);
    }
    v.osc.slice(0,2).forEach(o=>o.setPeriodicWave(w));
  }
});
