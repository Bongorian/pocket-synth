const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 452, height: 700 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../app/src/main/assets/index.html'));
    await page.waitForSelector('.key');
    const state = () => page.evaluate(() => ({ voices: synth.voices.size, live: synth.live.size,
      notes: [...synth.voices.values()].map(v => v.midi), held: held.size, space, octave }));
    await page.keyboard.down('a'); await page.keyboard.down('d'); await page.keyboard.down('g');
    assert.deepEqual((await state()).notes, [48, 52, 55]);
    await page.keyboard.down('a'); assert.equal((await state()).voices, 3);
    await page.keyboard.down('x'); await page.keyboard.up('x');
    assert.equal((await state()).octave, 4);
    for (const key of ['a', 'd', 'g']) await page.keyboard.up(key);
    assert.equal((await state()).voices, 0);
    await page.keyboard.down(' '); await page.keyboard.press('a');
    assert.equal((await state()).voices, 1);
    await page.keyboard.up(' '); assert.equal((await state()).voices, 0);
    await page.locator('#hold').check(); await page.keyboard.press('d');
    assert.equal((await state()).voices, 1);
    await page.locator('#hold').uncheck(); assert.equal((await state()).voices, 0);
    for (const key of Object.keys({a:0,w:0,s:0,e:0,d:0,f:0,t:0,g:0,y:0,h:0})) await page.keyboard.down(key);
    assert.equal((await state()).live, 8);
    await page.keyboard.press('Escape'); assert.equal((await state()).live, 0);
    for (const key of ['a','w','s','e','d','f','t','g','y','h']) await page.keyboard.up(key);
    await page.locator('#wave').selectOption('square');
    await page.locator('#save').click(); await page.reload();
    await page.locator('#preset').selectOption('User 1');
    assert.equal(await page.locator('#wave').inputValue(), 'square');
    await page.locator('#preset').selectOption('Warm Keys');
    const touch = await page.context().newCDPSession(page);
    const a = await page.locator('.key.white').nth(0).boundingBox();
    const b = await page.locator('.key.white').nth(2).boundingBox();
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: a.x + a.width / 2, y: a.y + a.height - 20, id: 1 },
      { x: b.x + b.width / 2, y: b.y + b.height - 20, id: 2 }] });
    assert.equal((await state()).voices, 2);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await state()).voices, 0);
    const audio = await page.evaluate(async () => {
      const c = new OfflineAudioContext(1, 48000, 48000), s = new SynthEngine();
      s.params = { ...s.params, wave: 'sine', detune: 0, sub: 0, cutoff: 16000, resonance: .1,
        attack: .01, decay: .01, sustain: 1, release: .1, mix: 0, volume: .5 };
      s.init(c); s.noteOn('test', 69, 0); s.noteOff('test', .5);
      const data = (await c.startRendering()).getChannelData(0);
      let energy = 0, peak = 0, tail = 0, crossings = 0;
      for (let i = 4800; i < 19200; i++) {
        energy += data[i] * data[i]; peak = Math.max(peak, Math.abs(data[i]));
        if (data[i - 1] < 0 && data[i] >= 0) crossings++;
      }
      for (let i = 38400; i < data.length; i++) tail = Math.max(tail, Math.abs(data[i]));
      return { rms: Math.sqrt(energy / 14400), peak, hz: crossings / .3, tail };
    });
    assert.ok(audio.rms > .01); assert.ok(Math.abs(audio.hz - 440) < 5);
    assert.ok(audio.peak < 1); assert.ok(audio.tail < .0001);
    for (const [width, height, name] of [[452,700,'phone'],[360,640,'small-phone'],[1024,800,'desktop']]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-tab="tone"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => $('keyboard').getBoundingClientRect().bottom <= innerHeight), true);
      for (const tab of ['tone','env','fx']) {
        await page.locator('[data-tab="' + tab + '"]').click();
        assert.equal(await page.evaluate(id => {
          const panel = document.getElementById(id).getBoundingClientRect();
          return [...document.querySelectorAll('#' + id + ' input')].every(e => e.getBoundingClientRect().bottom <= panel.bottom);
        }, tab), true);
      }
      await page.locator('[data-tab="tone"]').click();
      await page.keyboard.down('a'); await page.keyboard.down('d'); await page.keyboard.down('g');
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.resolve(__dirname, '../verification/' + name + '.png') });
      assert.ok(await page.evaluate(() => {
        const c = $('scope'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let count = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 120 && d[i] < 130) count++;
        return count > 100;
      }));
      await page.evaluate(() => window.synthSuspend());
      assert.equal((await state()).live, 0);
      assert.equal(await page.evaluate(() => synth.ctx.state), 'suspended');
      for (const key of ['a','d','g']) await page.keyboard.up(key);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', audio, checks: ['chords', 'repeat', 'octave-keyup', 'sustain', 'hold',
      'voice-limit', 'panic', 'saved-patch-reload', 'multitouch', '440-Hz-render', 'silent-release',
      'mobile-desktop-layout', 'waveform-pixels', 'lifecycle-stop'] }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
