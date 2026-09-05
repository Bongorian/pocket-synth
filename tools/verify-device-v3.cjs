const {chromium}=require('playwright-core');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const adb=(...args)=>execFileSync('adb',['-s','127.0.0.1:5555',...args],{encoding:'utf8'}).trim();
(async()=>{
  adb('shell','am','start','-n','com.bongorian.pocketsynth/.MainActivity');
  const pid=adb('shell','pidof','com.bongorian.pocketsynth');
  const port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  let browser,page,backup;
  try{
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts()[0].pages()[0];
    await page.waitForSelector('.key');
    backup=await page.evaluate(()=>({parts:synth.parts.map(({bus,...p})=>p),selected:synth.selectedPart,volume:Number($('volume').value),octave,enabled:midiController.enabled}));
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.evaluate(()=>{
      panic();assignPatch(0,'FM Electric');assignPatch(1,'Additive Organ');assignPatch(2,'Ring Drone');assignPatch(9,'Electro Kit');
      for(const i of [0,1,2,9])synth.mixer(i,{mute:false,level:.5,pan:0});
      synth.wake();AndroidMidi.enable(true);
    });
    await page.waitForFunction(()=>midiController.enabled);
    await page.evaluate(()=>receiveMidi([['v3-test',0x90,60,90],['v3-test',0x91,64,90],['v3-test',0x92,67,90],['v3-test',0x99,36,110]]));
    await page.waitForFunction(()=>synth.live.size>=3);
    await page.waitForFunction(()=>{const d=new Float32Array(512);synth.analyser.getFloatTimeDomainData(d);return Math.max(...d.map(Math.abs))>.005;});
    const info=await page.evaluate(()=>({rate:synth.ctx.sampleRate,parts:[...synth.live].map(v=>v.part),width:innerWidth,height:innerHeight}));
    adb('shell','input','keyevent','KEYCODE_HOME');
    await page.waitForFunction(()=>!nativeForeground,undefined,{polling:100});
    const background=await page.evaluate(()=>{const d=new Float32Array(512);synth.analyser.getFloatTimeDomainData(d);return {state:synth.ctx.state,peak:Math.max(...d.map(Math.abs))};});
    assert.equal(background.state,'running');assert.ok(background.peak>.001);
    adb('shell','am','start','-n','com.bongorian.pocketsynth/.MainActivity');
    await page.waitForFunction(()=>nativeForeground,undefined,{polling:100});
    await page.evaluate(()=>{midiDisconnected('v3-test');panic();$('edit-part').value='9';$('edit-part').onchange();$('synthesis').hidden=false;document.querySelector('[data-tab="synthesis"]').click();});
    adb('shell','input','keyevent','KEYCODE_A');
    await page.waitForFunction(()=>synth.live.size===0,undefined,{polling:100});
    assert.equal(await page.locator('#octave').textContent(),'C2');
    await page.screenshot({path:path.resolve(__dirname,'../verification/android-v3-drums.png')});
    await page.locator('[data-tab="parts"]').click();
    await page.screenshot({path:path.resolve(__dirname,'../verification/android-v3-parts.png')});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',info,background,checks:['native-WebView-multipart-audio','background-audio','drum-key-lifecycle','layouts'],orcaTest:false},null,2));
  }finally{
    if(page&&backup)await page.evaluate(b=>{
      panic();b.parts.forEach((p,i)=>{synth.setPatch(i,p.params,p.name);synth.mixer(i,p);synth.parts[i].modified=p.modified;});
      synth.selectPart(b.selected);basePreset=synth.parts[b.selected].name;
      $('volume').value=b.volume;synth.update({volume:b.volume});options();sync();setOctave(b.octave);persistParts();
      AndroidMidi.enable(b.enabled);document.querySelector('[data-tab="tone"]').click();
    },backup);
    if(browser)await browser.close();adb('forward','--remove','tcp:'+port);
  }
})().catch(e=>{console.error(e);process.exit(1);});
