const {chromium}=require('playwright-core');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const adb=(...args)=>execFileSync('adb',['-s','127.0.0.1:5555',...args],{encoding:'utf8'}).trim();
(async()=>{
 adb('shell','am','start','-W','-n','com.bongorian.pocketsynth/.MainActivity');
 const pid=adb('shell','pidof','com.bongorian.pocketsynth'),port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
 let browser,page,backup;
 try{
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts()[0].pages()[0];
  await page.waitForFunction(()=>window.studio&&window.SynthEngines);
  backup=await page.evaluate(()=>({bank:studio.exportData(),octave,enabled:midiController.enabled,channel:midiController.channel,solo:synth.soloPart}));
  await page.evaluate(()=>{panic();synth.soloPart=-1;midiController.channel=-1;synth.wake();AndroidMidi.enable(true);});
  await page.waitForFunction(()=>midiController.enabled);
  const modes=await page.evaluate(()=>[...SynthEngines.entries.keys()]),timing=[];
  for(const mode of modes){
   const setup=await page.evaluate(mode=>{
    panic();synth.setPatch(0,{mode,mix:0,sub:0,attack:.003,sustain:1},'Test');synth.mixer(0,{mute:false,level:.25});
    const now=performance.now();receiveMidi([['v5-device',0x90,mode==='drums'?36:60,90]]);
    return performance.now()-now;
   },mode);
   await page.waitForFunction(()=>{const d=new Float32Array(512);synth.analyser.getFloatTimeDomainData(d);return d.some(x=>Math.abs(x)>.0005);},undefined,{timeout:5000});
   timing.push({mode,setupMs:Math.round(setup*10)/10});
   await page.evaluate(()=>midiDisconnected('v5-device'));
   assert.equal(await page.evaluate(()=>synth.live.size),0);
  }
  await page.evaluate(()=>{
   const modes=[...SynthEngines.entries.keys()];modes.forEach((mode,i)=>{synth.setPatch(i,{mode,mix:0},'Test');synth.mixer(i,{level:.2,mute:false});});
   receiveMidi(modes.map((mode,i)=>['v5-device',0x90+i,mode==='drums'?36:60+i,85]));
  });
  const info=await page.evaluate(()=>({rate:synth.ctx.sampleRate,baseLatency:synth.ctx.baseLatency,voices:synth.live.size,presets:Object.keys(factory).length,engines:SynthEngines.entries.size,sampleBridge:typeof AndroidStudio.importSample}));
  assert.equal(info.engines,11);assert.equal(info.presets,75);assert.equal(info.sampleBridge,'function');
  adb('shell','input','keyevent','KEYCODE_HOME');await page.waitForFunction(()=>!nativeForeground);
  await page.waitForFunction(()=>{const d=new Float32Array(512);synth.analyser.getFloatTimeDomainData(d);return synth.ctx.state==='running'&&d.some(x=>Math.abs(x)>.001);});
  adb('shell','am','start','-W','-n','com.bongorian.pocketsynth/.MainActivity');await page.waitForFunction(()=>nativeForeground);
  await page.evaluate(()=>{midiDisconnected('v5-device');panic();synth.selectPart(0);assignPatch(0,'Grain Cloud');document.querySelector('[data-tab=synthesis]').click();});
  await page.screenshot({path:path.resolve(__dirname,'../verification/android-v5-granular.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(JSON.stringify({result:'PASS',info,timing,checks:['11 engines through MIDI controller','source disconnect','multipart audio','foreground service background audio','native sample bridge','device layout'],usbHardwareTest:false}));
 }finally{
  if(page&&backup)await page.evaluate(b=>{
   panic();b.bank.parts.forEach((p,i)=>{synth.setPatch(i,p.patch,p.name);synth.mixer(i,p);synth.parts[i].modified=p.modified;});
   synth.soloPart=b.solo;for(let i=0;i<16;i++)synth.mixer(i,{});
   synth.selectPart(b.bank.selected);basePreset=synth.parts[synth.selectedPart].name;$('volume').value=b.bank.volume;synth.update({volume:b.bank.volume});
   options();sync();setOctave(b.octave);persistParts();midiController.channel=b.channel;AndroidMidi.enable(b.enabled);document.querySelector('[data-tab=live]').click();
  },backup);
  if(browser)await browser.close();adb('forward','--remove','tcp:'+port);
 }
})().catch(e=>{console.error(e);process.exit(1);});
