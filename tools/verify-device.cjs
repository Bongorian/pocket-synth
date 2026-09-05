const { chromium } = require('playwright-core');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const path = require('node:path');
const device = ['-s', '127.0.0.1:5555'];
const adb = (...args) => execFileSync('adb', [...device, ...args], { encoding: 'utf8' }).trim();
const adbAsync = (...args) => promisify(execFile)('adb', [...device, ...args]);
(async () => {
  const pid = adb('shell', 'pidof', 'com.bongorian.pocketsynth');
  const port = adb('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    const page = browser.contexts()[0].pages()[0];
    await page.waitForSelector('.key');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const info = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      fits: $('keyboard').getBoundingClientRect().bottom <= innerHeight,
      icons: [...document.images].every(i => i.complete && i.naturalWidth > 0) }));
    assert.ok(info.fits); assert.ok(info.icons);
    // Inject through Android InputDispatcher, exercising Activity.dispatchKeyEvent.
    const chord = adbAsync('shell', 'input', 'keycombination', '-t', '1800', 'KEYCODE_A', 'KEYCODE_D', 'KEYCODE_G');
    await page.waitForFunction(() => synth.voices.size === 3);
    const audio = await page.evaluate(() => {
      const d = new Float32Array(512); synth.analyser.getFloatTimeDomainData(d);
      return { state: synth.ctx.state, sampleRate: synth.ctx.sampleRate, baseLatency: synth.ctx.baseLatency,
        peak: Math.max(...d.map(Math.abs)), notes: [...synth.voices.values()].map(v => v.midi) };
    });
    assert.deepEqual(audio.notes, [48,52,55]); assert.equal(audio.state, 'running');
    await page.waitForFunction(() => {
      const c = $('scope'), data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 1] > 120 && data[i] < 130) count++;
      return count > 100;
    });
    await page.screenshot({ path: path.resolve(__dirname, '../verification/android.png') });
    await chord;
    await page.waitForFunction(() => synth.voices.size === 0 && held.size === 0);
    await page.waitForFunction(() => synth.live.size === 0);
    adb('shell', 'input', 'keyevent', 'KEYCODE_X');
    await page.waitForFunction(() => octave === 4);
    adb('shell', 'input', 'keyevent', 'KEYCODE_Z');
    await page.waitForFunction(() => octave === 3);
    await page.locator('#hold').check();
    adb('shell', 'input', 'keyevent', 'KEYCODE_A');
    await page.waitForFunction(() => synth.voices.size === 1 && held.size === 0);
    const actualPeak = await page.evaluate(() => {
      const d = new Float32Array(512); synth.analyser.getFloatTimeDomainData(d); return Math.max(...d.map(Math.abs));
    });
    assert.ok(actualPeak > .001);
    adb('shell', 'input', 'keyevent', 'KEYCODE_ESCAPE');
    await page.waitForFunction(() => synth.live.size === 0 && !$('hold').checked);
    await page.locator('#hold').check();
    adb('shell', 'input', 'keyevent', 'KEYCODE_A');
    await page.waitForFunction(() => synth.voices.size === 1);
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await new Promise(resolve => setTimeout(resolve, 500));
    adb('shell', 'am', 'start', '-n', 'com.bongorian.pocketsynth/.MainActivity');
    await page.waitForFunction(() => synth.live.size === 0 && !document.hidden);
    await page.screenshot({ path: path.resolve(__dirname, '../verification/android-ready.png') });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', info, audio, actualPeak,
      checks: ['native-key-chord', 'native-keyup', 'native-octave', 'native-panic', 'audio-output-samples', 'background-stop', 'bundled-icons'] }, null, 2));
  } finally {
    if (browser) await browser.close();
    adb('forward', '--remove', 'tcp:' + port);
  }
})().catch(e => { console.error(e); process.exit(1); });
