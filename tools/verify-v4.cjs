const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  fs.mkdirSync(path.resolve(__dirname,'../verification'),{recursive:true});
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  try {
    const page=await browser.newPage({viewport:{width:452,height:705}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.resolve(__dirname,'../app/src/main/assets/index.html'));
    await page.locator('#browse').click();await page.locator('#preset-filter').selectOption('analog');
    assert.ok(await page.locator('.preset-load').count()>5);
    await page.locator('#preset-search').fill('Round');
    assert.equal(await page.locator('.preset-load').count(),1);
    await page.locator('.favorite').click();await page.locator('[data-preset="Round Bass"]').click();
    assert.equal(await page.evaluate(()=>synth.parts[0].name),'Round Bass');
    const base=await page.evaluate(()=>synth.params.cutoff);
    const xy=await page.locator('#xy').boundingBox();
    await page.mouse.move(xy.x+xy.width*.7,xy.y+xy.height*.6);await page.mouse.down();await page.mouse.move(xy.x+xy.width*.8,xy.y+xy.height*.7);await page.mouse.up();
    const edited=await page.evaluate(()=>synth.params.cutoff);assert.notEqual(edited,base);
    await page.locator('#undo').click();assert.equal(await page.evaluate(()=>synth.params.cutoff),base);
    await page.locator('#redo').click();assert.equal(await page.evaluate(()=>synth.params.cutoff),edited);
    await page.locator('#compare').click();assert.equal(await page.evaluate(()=>synth.params.cutoff),base);
    await page.locator('#compare').click();assert.equal(await page.evaluate(()=>synth.params.cutoff),edited);
    await page.locator('#save').click();await page.locator('#save-slot').selectOption('16');await page.locator('#save-name').fill('Live Bass');await page.locator('#confirm-save').click();
    await page.reload();assert.equal(await page.locator('#patch-name').textContent(),'Live Bass');
    const audio=await page.evaluate(async()=>{
      const check=(v,m)=>{if(!v)throw Error(m);},rendered=[];
      for(const mode of ['analog','fm','wavetable','additive','ring','drums']){
        const c=new OfflineAudioContext(1,6000,24000),s=new SynthEngine();s.setPatch(0,{mode},'Test');s.init(c);s.noteOn('test',mode==='drums'?36:60);
        const b=await c.startRendering(),data=b.getChannelData(0);check(data.every(Number.isFinite),mode+' finite');check(data.some(x=>Math.abs(x)>.001),mode+' audible');rendered.push(mode);
      }
      const c=new OfflineAudioContext(1,12000,24000),s=new SynthEngine();s.init(c);s.perform(0,{bend:100,modulation:20});s.noteOn('a',60,undefined,1,0);s.noteOn('b',64,undefined,1,1);
      const a=s.voices.get('a'),b=s.voices.get('b');s.pitch(a,200);s.perform(0,{bend:0});check(a.bend===200,'MIDI bend preserved');check(s.performanceControls[1].bend===0,'part-local expression');
      s.solo(1);s.noteOn('blocked',67,undefined,1,0);check(!s.voices.has('blocked'),'solo gates new notes');check(s.parts[0].mute===false,'solo preserves mute');s.solo(1);
      const backup=studio.exportData(),valid=studio.validate(backup);check(valid.parts.length===16&&valid.names['User 16']==='Live Bass','backup roundtrip');
      let rejected=false;try{studio.validate({...backup,parts:[]});}catch(_){rejected=true;}check(rejected,'invalid backup rejected');
      return {engines:rendered,checks:['solo','part-expression','MIDI-bend-preservation','backup-validation']};
    });
    await page.evaluate(()=>{const bank=studio.exportData();bank.parts[0].level=.42;window.studioImport(JSON.stringify(bank));});
    await page.locator('#confirm-import').click();assert.equal(await page.evaluate(()=>synth.parts[0].level),.42);
    await page.reload();assert.equal(await page.evaluate(()=>synth.parts[0].level),.42);
    for(const [width,height] of [[360,640],[452,705],[1024,800],[760,430]]){
      await page.setViewportSize({width,height});
      for(const tab of ['live','tone','synthesis','env','fx','parts','midi']){
        await page.locator('[data-tab="'+tab+'"]').click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&$('keyboard').getBoundingClientRect().bottom<=innerHeight),'layout '+width+' '+tab);
      }
      await page.locator('[data-tab="live"]').click();
      await page.screenshot({path:path.resolve(__dirname,'../verification/v4-live-'+width+'.png')});
      await page.locator('#edit-part').selectOption('9');
      assert.equal(await page.locator('#keyboard.drums .key').count(),16);
      assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#keyboard .key')].every(k=>k.getBoundingClientRect().bottom<=innerHeight&&k.getBoundingClientRect().right<=innerWidth)),'drum pad bounds '+width);
      await page.screenshot({path:path.resolve(__dirname,'../verification/v4-drums-'+width+'.png')});
      await page.locator('#edit-part').selectOption('0');
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',audio,ui:['search','favorites','XY','undo-redo','AB','named-save-reload','16-drum-pads','4-viewports']}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
