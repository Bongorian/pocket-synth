'use strict';
SynthEngines.register('sequence',{
  label:'Wave Sequence',defaults:{sequenceRate:2,sequenceBlend:.35,sequencePattern:0},
  controls:['sequenceRate','sequenceBlend','sequencePattern'],
  description:'4ステップの波形シーケンス。速度は音程から独立。Blend・Patternは次の発音から。',
  create(s,v,t){
    const p=v.params,c=s.ctx,patterns=[['sine','triangle','sawtooth','square'],['square','sine','square','triangle'],['sawtooth','triangle','sine','triangle']];v.auxSources=[];v.sequenceGates=[];
    for(let step=0;step<4;step++){
      const o=c.createOscillator(),g=c.createGain(),gate=c.createBufferSource();o.type=patterns[Math.round(p.sequencePattern)][step];o.frequency.value=v.hz;
      const b=EngineNodes.cached(s,`seq:${step}:${p.sequenceBlend}`,()=>{
        const b=c.createBuffer(1,4096,24000),d=b.getChannelData(0),blend=Math.max(.005,p.sequenceBlend);
        for(let i=0;i<d.length;i++){
          const pos=i/d.length*4,local=(pos-step+4)%4;
          d[i]=local<1?Math.min(1,local/blend):local<1+blend?1-(local-1)/blend:0;
        }
        return b;
      });
      gate.buffer=b;gate.loop=true;gate.playbackRate.value=p.sequenceRate*b.duration/4;g.gain.value=0;
      gate.connect(g.gain);o.connect(g).connect(v.filter);v.vibrato.connect(o.detune);
      v.osc.push(o);v.extra.push(g);v.auxSources.push(gate);v.sequenceGates.push(gate);o.start(t);gate.start(t);
    }
  },
  update(s,v){for(const gate of v.sequenceGates)s.smooth(gate.playbackRate,v.params.sequenceRate*gate.buffer.duration/4);}
});
