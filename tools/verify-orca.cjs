const {chromium}=require('playwright-core');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const adb=(...args)=>execFileSync('adb',['-s','127.0.0.1:5555',...args],{encoding:'utf8'}).trim();
(async()=>{
  const pid=adb('shell','pidof','com.bongorian.pocketsynth');
  const port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  let browser;
  try{
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
    const page=browser.contexts()[0].pages()[0];
    const before=await page.evaluate(()=>midiController.events);
    await page.evaluate(()=>{document.getElementById('preset').value='FM Electric';document.getElementById('preset').onchange();});
    adb('shell','input','keycombination','KEYCODE_CTRL_LEFT','KEYCODE_F');
    await page.waitForFunction(n=>midiController.events>n,before,{timeout:8000,polling:100});
    await page.waitForFunction(()=>synth.voices.size>0,undefined,{timeout:3000,polling:100});
    await new Promise(r=>setTimeout(r,250));
    const active=await page.evaluate(()=>{
      const data=new Float32Array(512);synth.analyser.getFloatTimeDomainData(data);
      return {events:midiController.events,notes:[...synth.voices.values()].map(v=>({id:v.id,note:v.midi,mode:v.mode})),peak:Math.max(...data.map(Math.abs)),state:synth.ctx.state,time:synth.ctx.currentTime};
    });
    assert.ok(active.notes.some(n=>n.id.startsWith('midi:app:')));assert.ok(active.peak>.001);assert.equal(active.state,'running');
    await new Promise(r=>setTimeout(r,500));
    const later=await page.evaluate(()=>synth.ctx.currentTime);assert.ok(later-active.time>.3);
    await page.waitForFunction(()=>synth.voices.size===0,undefined,{timeout:15000,polling:100});
    await page.waitForFunction(()=>synth.live.size===0,undefined,{timeout:4000,polling:100});
    console.log(JSON.stringify({result:'PASS',active,later,checks:['Orca Android foreground -> Pocket Synth background','standard Android MIDI port','FM audio samples','note off and release']},null,2));
  }finally{if(browser)await browser.close();adb('forward','--remove','tcp:'+port);}
})().catch(e=>{console.error(e);process.exit(1);});
