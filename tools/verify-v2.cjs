const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 452, height: 705 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../app/src/main/assets/index.html'));
    const result = await page.evaluate(async () => {
      async function render(params) {
        const c = new OfflineAudioContext(1, 24000, 48000), s = new SynthEngine();
        Object.assign(s.params, { sub: 0, detune: 0, wave: 'sine', cutoff: 16000, resonance: .1,
          attack: .003, decay: .01, sustain: 1, mix: 0, drive: 0 }, params);
        s.init(c); s.noteOn('a', 57, 0);
        const data = (await c.startRendering()).getChannelData(0);
        let rms = 0, peak = 0, finite = true;
        for (const x of data) { rms += x * x; peak = Math.max(peak, Math.abs(x)); finite &&= Number.isFinite(x); }
        return { data: [...data.slice(5000, 8000)], rms: Math.sqrt(rms / data.length), peak, finite };
      }
      const analog = await render({}), fm0 = await render({ mode: 'fm', fmIndex: 0 }),
        fm = await render({ mode: 'fm', fmIndex: 5 }), wt0 = await render({ mode: 'wavetable', position: 0 }),
        wt1 = await render({ mode: 'wavetable', position: 1 }), metal = await render({ mode: 'wavetable', table: 'metal', position: .6, drive: 4 });
      const diff = (a,b) => a.data.reduce((sum,x,i) => sum + Math.abs(x - b.data[i]), 0) / a.data.length;
      return { samples: [analog,fm0,fm,wt0,wt1,metal].map(({rms,peak,finite}) => ({rms,peak,finite})),
        fmDifference: diff(fm0,fm), wtDifference: diff(wt0,wt1), sineDifference: diff(analog,fm0) };
    });
    for (const s of result.samples) { assert.ok(s.finite); assert.ok(s.rms > .01); assert.ok(s.peak < 1); }
    assert.ok(result.fmDifference > .01); assert.ok(result.wtDifference > .01); assert.ok(result.sineDifference < .00001);
    const midi = await page.evaluate(() => {
      const m = window.midiController; m.enabled = true;
      const send = (status,d1,d2=0,source='app') => m.receive([[source,status,d1,d2]]);
      send(0x90,60,100); send(0x91,60,40); send(0x90,60,90,'usb');
      const independent = synth.voices.size;
      send(0xb0,64,127); send(0x80,60,0); const sustained = synth.voices.size;
      send(0x81,60,0); const channelRelease = synth.voices.size;
      send(0xe0,0,96); const bend = synth.voices.get('midi:app:0:60').bend;
      send(0xb0,7,64); send(0xb0,11,32);
      const volume = m.state('app',0).volume * m.state('app',0).expression;
      send(0xb0,64,0); const pedalRelease = synth.voices.size;
      m.disconnect('usb'); const disconnected = synth.voices.size;
      send(0x90,62,80); send(0x90,62,0); const zeroVelocity = synth.voices.size;
      send(0x90,64,127); send(0xb0,120,0); const allSoundOff = m.voices(m.state('app',0)).length;
      m.channel = 2; send(0x90,60,100); send(0x92,60,100); const channelFiltered = [...synth.voices.keys()];
      m.reset(); m.channel = -1; send(0x90,60,100); send(0xb0,101,0); send(0xb0,100,0); send(0xb0,6,12); send(0xe0,0,96);
      const rpn = synth.voices.get('midi:app:0:60').bend;
      panic(); m.enabled = false;
      return { independent,sustained,channelRelease,bend,volume,pedalRelease,disconnected,zeroVelocity,allSoundOff,channelFiltered,rpn };
    });
    assert.equal(midi.independent,3); assert.equal(midi.sustained,3); assert.equal(midi.channelRelease,2);
    assert.equal(midi.bend,100); assert.ok(midi.volume > .12 && midi.volume < .13);
    assert.equal(midi.pedalRelease,1); assert.equal(midi.disconnected,0); assert.equal(midi.zeroVelocity,0);
    assert.equal(midi.allSoundOff,0); assert.deepEqual(midi.channelFiltered,['midi:app:2:60']); assert.equal(midi.rpn,600);
    await page.locator('#preset').selectOption('FM Steel');
    assert.equal(await page.locator('#mode').inputValue(),'fm');
    await page.locator('#save').click(); await page.reload(); await page.locator('#preset').selectOption('User 1');
    assert.equal(await page.locator('#mode').inputValue(),'fm');
    for (const [w,h] of [[360,640],[452,705],[1024,800]]) {
      await page.setViewportSize({width:w,height:h});
      for (const tab of ['tone','synthesis','env','fx','midi']) {
        await page.locator('[data-tab="'+tab+'"]').click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && $('keyboard').getBoundingClientRect().bottom <= innerHeight));
      }
      await page.locator('#preset').selectOption('Vocal Cloud');
      await page.locator('[data-tab="synthesis"]').click();
      await page.screenshot({path:path.resolve(__dirname,'../verification/v2-'+w+'.png')});
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',result,midi},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
