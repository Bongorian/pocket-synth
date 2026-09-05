const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--autoplay-policy=no-user-gesture-required']});
  try {
    const page=await browser.newPage({viewport:{width:452,height:705}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.resolve(__dirname,'../app/src/main/assets/index.html'));
    const audio=await page.evaluate(async()=>{
      async function render(patch,note=57,pan=0){
        const c=new OfflineAudioContext(2,48000,24000),s=new SynthEngine();
        s.setPatch(0,patch,'Test');s.mixer(0,{pan});s.init(c);s.noteOn('test',note,0);
        const b=await c.startRendering(),d=b.getChannelData(0),r=b.getChannelData(1);
        return {rms:Math.sqrt(d.reduce((a,x)=>a+x*x,0)/d.length),right:Math.sqrt(r.reduce((a,x)=>a+x*x,0)/r.length),
          peak:d.reduce((a,x)=>Math.max(a,Math.abs(x)),0),finite:d.every(Number.isFinite)&&r.every(Number.isFinite),data:[...d.slice(5000,7000)]};
      }
      const presets=[];
      for(const [name,p] of Object.entries(factory)){const {data,...stats}=await render(p,p.mode==='drums'?36:57);presets.push({name,...stats});}
      const a=await render({mode:'additive',harmonics:1}),b=await render({mode:'additive',harmonics:24,tilt:.4}),
        r=await render({mode:'ring',ringMix:0}),s=await render({mode:'ring',ringMix:1}),left=await render({wave:'sine'},57,-1);
      const diff=(a,b)=>a.data.reduce((sum,x,i)=>sum+Math.abs(x-b.data[i]),0)/a.data.length;
      const drums=[];
      for(const note of [37,38,39,42,45,46,49,51,56,70]){const {data,...stats}=await render(factory['Electro Kit'],note);drums.push({note,...stats});}
      return {presets,drums,additiveDifference:diff(a,b),ringDifference:diff(r,s),left:{rms:left.rms,right:left.right}};
    });
    assert.equal(audio.presets.length,39);
    for(const s of [...audio.presets,...audio.drums]){assert.ok(s.finite,JSON.stringify(s));assert.ok(s.rms>.0001,JSON.stringify(s));assert.ok(s.peak<1,JSON.stringify(s));}
    assert.ok(audio.additiveDifference>.005);assert.ok(audio.ringDifference>.005);assert.ok(audio.left.right<audio.left.rms*.1);
    const routing=await page.evaluate(()=>{
      const check=(value,message)=>{if(!value)throw Error(message);};
      const m=midiController;m.enabled=true;
      const send=(ch,command,n,v=100,source='test')=>m.receive([[source,command|ch,n,v]]);
      assignPatch(0,'FM Steel');assignPatch(1,'Additive Organ');assignPatch(2,'Ring Chime');
      for(const ch of [0,1,2,9])send(ch,0x90,ch===9?36:60);
      check(synth.voices.size===4,'four parts');
      check(synth.voices.get('midi:test:9:36').oneshot,'Ch10 drums');
      send(0,0xb0,74,0);send(0,0xb0,1,127);
      check(synth.voices.get('midi:test:0:60').control.cutoff===80,'CC74');
      check(synth.voices.get('midi:test:1:60').control.cutoff===null,'CC isolation');
      const bus=synth.parts[1].bus;synth.update({mix:.5},0);check(synth.parts[1].bus===bus&&synth.parts[1].params.mix!==.5,'FX isolation');
      $('midi-program').checked=true;send(0,0xc0,5,0);
      check(synth.parts[0].name==='Pure Sine'&&synth.voices.has('midi:test:1:60'),'program isolation');
      send(9,0x80,36,0);check(synth.voices.has('midi:test:9:36'),'one-shot ignores note off');
      send(9,0x90,36);check([...synth.live].filter(v=>v.id==='midi:test:9:36').length===1,'drum retrigger');
      send(9,0x90,46);send(9,0x90,42);check(!synth.voices.has('midi:test:9:46'),'hat choke');
      panic();
      for(let i=0;i<20;i++)synth.noteOn('poly'+i,48+i,undefined,1,i%3);
      check(synth.live.size===16,'16 voice limit');
      const before=[...synth.voices.keys()].join();synth.mixer(3,{mute:true});synth.noteOn('muted',60,undefined,1,3);
      check([...synth.voices.keys()].join()===before,'muted notes do not steal');
      panic();m.enabled=false;
      const s=new SynthEngine();s.update({volume:.12});s.selectPart(1);s.init(new OfflineAudioContext(1,100,24000));
      check(Math.abs(s.master.gain.value-.12)<.00001,'global initial volume');
      return {parts:synth.parts.length,maxVoices:synth.maxVoices};
    });
    await page.locator('#edit-part').selectOption('1');
    await page.evaluate(()=>{synth.update({harmonics:17});markModified();synth.mixer(1,{level:.67,pan:-.4});persistParts();});
    await page.reload();
    assert.deepEqual(await page.evaluate(()=>[synth.selectedPart,synth.params.harmonics,synth.parts[1].level,synth.parts[1].pan,synth.parts[3].mute]),[1,17,.67,-.4,true]);
    await page.locator('#slot').selectOption('16');await page.locator('#save').click();await page.reload();
    assert.equal(await page.locator('#preset').inputValue(),'User 16');
    for(const [width,height] of [[360,640],[452,705],[1024,800]]){
      await page.setViewportSize({width,height});
      for(const tab of ['tone','synthesis','env','fx','parts','midi']){
        await page.locator('[data-tab="'+tab+'"]').click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&$('keyboard').getBoundingClientRect().bottom<=innerHeight));
      }
      await page.locator('[data-tab="parts"]').click();
      await page.locator('[data-patch="15"]').selectOption('Dust Kit');
      await page.locator('#parts').evaluate(e=>e.scrollTop=0);
      await page.screenshot({path:path.resolve(__dirname,'../verification/v3-parts-'+width+'.png')});
      await page.locator('#edit-part').selectOption('9');
      await page.locator('[data-tab="synthesis"]').click();
      await page.keyboard.press('a');
      await page.screenshot({path:path.resolve(__dirname,'../verification/v3-drums-'+width+'.png')});
    }
    await page.waitForFunction(()=>synth.live.size===0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',routing,audio},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
