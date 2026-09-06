'use strict';
SynthEngines.register('drums',{
  defaults:{kit:'electro',drumTone:0,drumDecay:1},
  label:'Drum Kit',controls:['drumTone','drumDecay'],oneshot:true,description:'3種類の合成ドラムキット。パッドまたはMIDIで演奏。',
  create(s,v){this.render(s,v.id,v.midi,v.t,v.velocity,v.index,v.p,v.b);},
  render(s,id,midi,t,velocity,index,p,b) {
    const c=s.ctx,group=SynthEngine.drumGroup(midi),tune=Math.pow(2,p.drumTone/12)*(p.kit==='deep'?.82:1);
    if(group==='hat') for(const v of [...s.live]) if(v.part===index&&v.drumGroup==='hat')s.dispose(v);
    const durations={kick:.5,snare:.22,clap:.19,hat:midi===46?.5:.075,tom:.32,cymbal:midi===51||midi===59?.65:1.3,rim:.06,bell:.4,shaker:.07};
    const duration=durations[group]*p.drumDecay*(p.kit==='dust'?.7:1);
    const amp=c.createGain(),expression=c.createGain(),filter=c.createBiquadFilter(),sources=[],extra=[];
    filter.type='lowpass';filter.frequency.value=p.kit==='dust'?Math.min(6500,p.cutoff):p.cutoff;filter.Q.value=.5;
    filter.connect(amp).connect(expression).connect(b.input);
    const tone=(type,hz,level,sweep)=>{
      const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(hz*tune,t);
      if(sweep)o.frequency.exponentialRampToValueAtTime(sweep*tune,t+Math.min(.08,duration*.6));
      g.gain.value=level;o.connect(g).connect(filter);sources.push(o);extra.push(g);
    };
    const noise=(hz,level,type='highpass')=>{
      const o=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();o.buffer=s.noise;o.loop=true;
      f.type=type;f.frequency.value=Math.min(18000,hz*tune);f.Q.value=.7;g.gain.value=level;
      o.connect(f).connect(g).connect(filter);sources.push(o);extra.push(f,g);
    };
    if(group==='kick')tone('sine',140,1,45);
    else if(group==='snare') {tone('triangle',180,.35,120);noise(1400,.8);}
    else if(group==='clap')noise(1100,1,'bandpass');
    else if(group==='hat')noise(6500,.55);
    else if(group==='cymbal') {noise(4500,.4);tone('square',731,.08);tone('square',1123,.06);}
    else if(group==='tom')tone('sine',170*Math.pow(2,(midi-45)/12),.9,75*Math.pow(2,(midi-45)/12));
    else if(group==='rim') {tone('triangle',850,.4);tone('sine',1700,.25);}
    else if(group==='bell') {tone('square',540,.25);tone('square',800,.2);}
    else noise(3500,.55,'bandpass');
    const peak=.5*Math.max(0,Math.min(1,velocity));
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(peak,t+.002);
    if(group==='clap') {
      for(const offset of [.012,.025]) {amp.gain.linearRampToValueAtTime(.02,t+offset);amp.gain.linearRampToValueAtTime(peak,t+offset+.003);}
    }
    amp.gain.exponentialRampToValueAtTime(.00001,t+Math.max(.035,duration));
    sources.forEach(o=>{o.start(t);o.stop(t+Math.max(.035,duration)+.02);});
    s.register({id,midi,part:index,params:p,mode:'drums',drumGroup:group,oneshot:true,osc:sources,amp,expression,filter,extra,released:false,bend:0,control:{}});
  }
});
