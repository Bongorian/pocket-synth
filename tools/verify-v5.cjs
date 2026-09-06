const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:360,height:640}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.resolve(__dirname,'../app/src/main/assets/index.html'));
  const result=await page.evaluate(async()=>{
   const check=(x,m)=>{if(!x)throw Error(m);};
   const render=async(patch,note=60,duration=.8)=>{
    const c=new OfflineAudioContext(1,Math.round(24000*duration),24000),s=new SynthEngine();s.setPatch(0,patch,'Test');s.init(c);
    const start=performance.now();s.noteOn('n',note,0,.8);const setupMs=performance.now()-start;
    const b=await c.startRendering(),data=Array.from(b.getChannelData(0));
    check(data.every(Number.isFinite),'finite '+JSON.stringify(patch));return {data,setupMs,s};
   };
   const presets=[];let slowest=0;
   for(const [name,p] of Object.entries(FACTORY_PRESETS)){
    const r=await render(p,p.mode==='drums'?36:60,1.2);check(r.data.some(x=>Math.abs(x)>.0001),'silent '+name);
    slowest=Math.max(slowest,r.setupMs);presets.push(name);
   }
   const changes={pcm:[{sample:'pluck'},{sample:'bell'}],physical:[{stringDamping:.1},{stringDamping:.9}],granular:[{grainDensity:4,grainSize:.02},{grainDensity:40,grainSize:.15}],spectral:[{spectralShift:0},{spectralShift:8}],sequence:[{sequenceRate:1},{sequenceRate:10}]};
   for(const [mode,pair] of Object.entries(changes)){
    const a=await render({mode,sub:0,cutoff:14000,...pair[0]}),b=await render({mode,sub:0,cutoff:14000,...pair[1]});
    const difference=a.data.reduce((sum,x,i)=>sum+Math.abs(x-b.data[i]),0)/a.data.length;
    check(difference>.0005,'parameter has no audible effect: '+mode+' '+difference);
   }
   for(const mode of SynthEngines.entries.keys()){
    const c=new OfflineAudioContext(1,48000,24000),s=new SynthEngine();s.setPatch(0,{mode,release:.05,mix:0},'Test');s.init(c);s.noteOn('n',mode==='drums'?36:60,0);
    s.perform(0,{bend:100,modulation:10});s.controls(s.voices.get('n'),{cutoff:1234,modulation:20});s.update({cutoff:2345,filterMod:100,tremolo:.5});s.noteOff('n',.2);
    const b=await c.startRendering();check(s.live.size===0,'voice leak '+mode);
    if(mode!=='drums')check(b.getChannelData(0).slice(24000).every(x=>Math.abs(x)<.0001),'release tail '+mode);
   }
   const c=new OfflineAudioContext(1,24000,24000),s=new SynthEngine();s.init(c);
   let i=0;for(const mode of SynthEngines.entries.keys())s.setPatch(i++,{mode},mode);
   for(let j=0;j<40;j++)s.noteOn('v'+j,48+j%24,0,1,j%11);
   check(s.live.size===16,'voice budget');s.panic();check(s.live.size===0&&s.voices.size===0,'panic');
   const valid=validPatch({mode:'granular',grainDensity:Infinity,grainSize:-2,sampleData:'bad*'});
   check(valid.grainDensity===24&&valid.grainSize===.015&&valid.sampleData==='','validation');
   const bank=studio.validate(studio.exportData());check(bank.parts.length===16,'bank');
   return {presets:presets.length,engines:[...SynthEngines.entries.keys()],slowestSetupMs:Math.round(slowest*10)/10};
  });
  for(const mode of result.engines){
   await page.locator('[data-tab=synthesis]').click();await page.locator('#synth-mode').selectOption(mode);
   assert.equal(await page.evaluate(()=>synth.params.mode),mode);
   assert.ok(await page.locator('#engine-description').textContent());
   await page.locator('#browse').click();await page.locator('#preset-filter').selectOption(mode);
   assert.ok(await page.locator('.preset-load').count()>0,mode+' presets');await page.locator('#browser [data-close]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout '+mode);
  }
  // Exercise real WAV decoding/import and embedded sample persistence through named preset and bank.
  const wav=Buffer.alloc(44+4800);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(4800,40);
  for(let i=0;i<2400;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/24000)*16000),44+i*2);
  await page.locator('#synth-mode').selectOption('pcm');
  await page.locator('#sample-file').setInputFiles({name:'test.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>synth.params.sampleName==='test.wav');
  await page.locator('#save').click();await page.locator('#save-name').fill('Imported PCM');await page.locator('#confirm-save').click();
  await page.reload();assert.equal(await page.evaluate(()=>synth.params.sampleName),'test.wav');
  assert.ok(await page.evaluate(()=>studio.validate(studio.exportData()).parts[0].patch.sampleData.length>0));
  fs.mkdirSync(path.resolve(__dirname,'../verification'),{recursive:true});
  for(const [width,height] of [[360,640],[452,705],[760,430]]){
   await page.setViewportSize({width,height});await page.locator('[data-tab=synthesis]').click();await page.locator('#synth-mode').selectOption('granular');
   await page.screenshot({path:path.resolve(__dirname,'../verification/v5-granular-'+width+'.png')});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&$('keyboard').getBoundingClientRect().bottom<=innerHeight));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',...result,checks:['parameter audio differences','release cleanup','shared voice budget','panic','sample decode/save/reload','bank validation','11 engine UI filters','3 layouts']}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
