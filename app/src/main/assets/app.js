'use strict';
const synth = new SynthEngine();
const $ = id => document.getElementById(id);
const defaults = { ...synth.params };
const factory = {
  'Warm Keys': {},
  'Round Bass': { wave: 'square', cutoff: 680, detune: 3, sub: 0.6, attack: 0.008, decay: 0.16, sustain: 0.45, release: 0.12, mix: 0 },
  'Glass Pluck': { wave: 'triangle', cutoff: 6200, detune: 12, attack: 0.004, decay: 0.45, sustain: 0, release: 0.15, mix: 0.3, feedback: 0.4 },
  'Slow Pad': { cutoff: 1700, detune: 18, attack: 0.8, decay: 0.6, sustain: 0.75, release: 1.5, mix: 0.3, lfoRate: 0.8, lfoDepth: 8 },
  'Bright Lead': { cutoff: 5500, resonance: 3, detune: 6, attack: 0.01, decay: 0.18, sustain: 0.8, release: 0.2, mix: 0.22, lfoDepth: 12 },
  'Pure Sine': { wave: 'sine', cutoff: 12000, detune: 0, sub: 0, attack: 0.01, mix: 0 },
  'FM Electric': { mode: 'fm', fmRatio: 1, fmIndex: 3.5, fmDecay: .5, cutoff: 9500, sub: 0, detune: 0, decay: .9, sustain: .2, release: .5 },
  'FM Steel': { mode: 'fm', fmRatio: 3.5, fmIndex: 6, fmDecay: .7, cutoff: 12000, sub: 0, decay: 1.5, sustain: .1, release: 1.2, mix: .28 },
  'FM Growl': { mode: 'fm', fmRatio: .5, fmIndex: 8, fmDecay: .2, cutoff: 3200, drive: 2, sub: .45, release: .12 },
  'Morph Sweep': { mode: 'wavetable', table: 'basic', position: .65, detune: 20, cutoff: 6500, attack: .15, release: .8, mix: .25 },
  'Vocal Cloud': { mode: 'wavetable', table: 'vocal', position: .45, detune: 14, cutoff: 11000, attack: .6, release: 1.6, mix: .35 },
  'Metal Edge': { mode: 'wavetable', table: 'metal', position: .7, detune: 7, cutoff: 7000, drive: 1.5, mix: .18 }
};
const specs = {
  fmRatio: ['synthesis', 'FM Ratio', .25, 12, .25, v => v.toFixed(2)],
  fmIndex: ['synthesis', 'FM Index', 0, 12, .1, v => v.toFixed(1)],
  fmDecay: ['synthesis', 'FM Decay', .01, 3, .01, seconds, true],
  position: ['synthesis', 'WT Position', 0, 1, .01, percent],
  drive: ['fx', 'Drive', 0, 5, .1, v => v.toFixed(1)],
  detune: ['tone', 'Detune', 0, 40, 1, v => v + ' ct'],
  sub: ['tone', 'Sub', 0, 1, .01, percent],
  cutoff: ['tone', 'Cutoff', 80, 16000, 1, v => v < 1000 ? Math.round(v) + ' Hz' : (v / 1000).toFixed(1) + ' kHz', true],
  resonance: ['tone', 'Resonance', .1, 12, .1, v => v.toFixed(1)],
  attack: ['env', 'Attack', .003, 2, .001, seconds, true],
  decay: ['env', 'Decay', .01, 2, .001, seconds, true],
  sustain: ['env', 'Sustain', 0, 1, .01, percent],
  release: ['env', 'Release', .02, 3, .001, seconds, true],
  delay: ['fx', 'Delay', .05, 1, .01, seconds],
  feedback: ['fx', 'Feedback', 0, .75, .01, percent],
  mix: ['fx', 'Delay Mix', 0, .6, .01, percent],
  lfoRate: ['fx', 'Vibrato Rate', .1, 12, .1, v => v.toFixed(1) + ' Hz'],
  lfoDepth: ['fx', 'Vibrato Depth', 0, 50, 1, v => v + ' ct']
};
function percent(v) { return Math.round(v * 100) + '%'; }
function seconds(v) { return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s'; }
let users = {}, octave = 3, space = false, basePreset = 'Warm Keys', modified = false;
const held = new Map(), sustained = new Set(), downKeys = new Set(), pointers = new Map();
const keyMap = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14 };
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(midi) { return noteNames[midi % 12] + (Math.floor(midi / 12) - 1); }
function validPatch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = { ...defaults };
  if (['sine', 'triangle', 'sawtooth', 'square'].includes(raw.wave)) p.wave = raw.wave;
  if (['analog', 'fm', 'wavetable'].includes(raw.mode)) p.mode = raw.mode;
  if (['basic', 'vocal', 'metal'].includes(raw.table)) p.table = raw.table;
  for (const [id, s] of Object.entries(specs)) {
    if (typeof raw[id] === 'number' && Number.isFinite(raw[id])) p[id] = Math.max(s[2], Math.min(s[3], raw[id]));
  }
  return p;
}
try {
  const data = JSON.parse(localStorage.getItem('pocket-synth-users') || '{}');
  for (let i = 1; i <= 4; i++) { const p = validPatch(data?.['User ' + i]); if (p) users['User ' + i] = p; }
} catch (_) {}
function options() {
  $('preset').replaceChildren(...[...Object.keys(factory), ...Object.keys(users)].map(name => {
    const o = document.createElement('option'); o.value = name; o.textContent = name; return o;
  }));
}
options();
for (const [id, s] of Object.entries(specs)) {
  const label = document.createElement('label'); label.className = 'control';
  label.innerHTML = '<span class="control-head"><span>' + s[1] + '</span><output id="out-' + id + '"></output></span><input type="range" id="' + id + '">';
  $(s[0] + '-controls').append(label);
  const input = $(id); input.min = s[6] ? 0 : s[2]; input.max = s[6] ? 1000 : s[3]; input.step = s[6] ? 1 : s[4];
  input.addEventListener('input', () => {
    const v = s[6] ? s[2] * Math.pow(s[3] / s[2], Number(input.value) / 1000) : Number(input.value);
    synth.update({ [id]: v }); $('out-' + id).textContent = s[5](v); markModified();
  });
}
function sync() {
  for (const [id, s] of Object.entries(specs)) {
    const v = synth.params[id]; $(id).value = s[6] ? Math.log(v / s[2]) / Math.log(s[3] / s[2]) * 1000 : v;
    $('out-' + id).textContent = s[5](v);
  }
  $('wave').value = synth.params.wave;
  $('mode').value = synth.params.mode; $('table').value = synth.params.table;
  $('wave').disabled = synth.params.mode !== 'analog';
  $('synth-mode').value = synth.params.mode;
  for (const id of ['fmRatio', 'fmIndex', 'fmDecay']) $(id).disabled = synth.params.mode !== 'fm';
  $('table').disabled = $('position').disabled = synth.params.mode !== 'wavetable';
}
function markModified() {
  modified = true;
  $('preset').selectedOptions[0].textContent = basePreset + ' *';
}
$('wave').onchange = () => { synth.update({ wave: $('wave').value }); markModified(); };
$('mode').onchange = () => { panic(); synth.update({ mode: $('mode').value }); sync(); markModified(); };
$('synth-mode').onchange = () => { $('mode').value = $('synth-mode').value; $('mode').onchange(); };
$('table').onchange = () => { synth.update({ table: $('table').value }); markModified(); };
$('volume').oninput = () => synth.update({ volume: Number($('volume').value) });
$('preset').onchange = () => {
  panic(); basePreset = $('preset').value; modified = false;
  synth.update({ ...defaults, ...(users[basePreset] || factory[basePreset]), volume: Number($('volume').value) });
  options(); $('preset').value = basePreset; sync();
};
$('save').onclick = () => {
  const name = 'User ' + $('slot').value;
  const updated = { ...users, [name]: { ...synth.params } };
  try {
    localStorage.setItem('pocket-synth-users', JSON.stringify(updated));
    users = updated; options(); $('preset').value = name; basePreset = name; modified = false;
    $('status').textContent = 'SAVED';
  } catch (_) { $('status').textContent = '保存できません'; }
};
document.querySelectorAll('[data-tab]').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b === button)));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== button.dataset.tab);
  };
});
function paintKeys() {
  const sounding = new Set([...synth.voices.values()].map(v => v.midi));
  document.querySelectorAll('.key').forEach(k => k.classList.toggle('active', sounding.has(Number(k.dataset.midi))));
  $('note').textContent = [...sounding].map(noteName).join(' ') || 'READY';
  $('status').textContent = sounding.size + ' / 8';
}
function press(id, midi) {
  if (held.has(id)) return;
  try {
    synth.wake();
    if (sustained.has(id)) { synth.noteOff(id); sustained.delete(id); }
    synth.noteOn(id, midi); held.set(id, midi); paintKeys();
  } catch (error) { $('status').textContent = '音声を開始できません'; console.error(error); }
}
function release(id) {
  if (!held.has(id)) return;
  held.delete(id);
  if (space || $('hold').checked) sustained.add(id); else synth.noteOff(id);
  paintKeys();
}
function releaseSustain() {
  if (space || $('hold').checked) return;
  for (const id of sustained) if (!held.has(id)) synth.noteOff(id);
  sustained.clear(); paintKeys();
}
$('hold').onchange = releaseSustain;
function panic() {
  held.clear(); sustained.clear(); downKeys.clear(); pointers.clear(); space = false; $('hold').checked = false;
  if (window.midiController) window.midiController.reset();
  synth.panic(); paintKeys();
}
$('panic').onclick = panic;
function setOctave(value) {
  octave = Math.max(1, Math.min(6, value));
  $('octave').textContent = 'C' + octave;
  $('oct-down').disabled = octave === 1; $('oct-up').disabled = octave === 6;
  buildKeyboard(); paintKeys();
}
$('oct-down').onclick = () => setOctave(octave - 1);
$('oct-up').onclick = () => setOctave(octave + 1);
function buildKeyboard() {
  // Keep pointer capture on the container, which survives octave changes.
  $('keyboard').replaceChildren();
  const whites = [0, 2, 4, 5, 7, 9, 11, 12, 14];
  for (let n = 0; n <= 14; n++) {
    const k = document.createElement('button'), white = whites.includes(n), midi = 12 * (octave + 1) + n;
    k.className = 'key ' + (white ? 'white' : 'black'); k.dataset.midi = midi; k.tabIndex = -1;
    k.setAttribute('aria-label', noteName(midi));
    k.innerHTML = Object.keys(keyMap).find(key => keyMap[key] === n).toUpperCase() + '<small>' + noteName(midi) + '</small>';
    if (!white) k.style.left = (whites.filter(w => w < n).length / 9 * 100 - 3.5) + '%';
    k.addEventListener('click', e => { if (e.detail === 0) { const id = 'accessible-' + midi; press(id, midi); setTimeout(() => release(id), 250); } });
    $('keyboard').append(k);
  }
}
function pointerNote(e) {
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.key');
  return target ? Number(target.dataset.midi) : null;
}
$('keyboard').onpointerdown = e => {
  e.preventDefault(); const midi = pointerNote(e); if (midi === null) return;
  $('keyboard').setPointerCapture(e.pointerId); pointers.set(e.pointerId, midi); press('touch-' + e.pointerId, midi);
};
$('keyboard').onpointermove = e => {
  if (!pointers.has(e.pointerId)) return;
  const midi = pointerNote(e), old = pointers.get(e.pointerId); if (old === midi) return;
  release('touch-' + e.pointerId); pointers.set(e.pointerId, midi);
  if (midi !== null) press('touch-' + e.pointerId, midi);
};
function pointerEnd(e) { release('touch-' + e.pointerId); pointers.delete(e.pointerId); }
$('keyboard').onpointerup = pointerEnd;
$('keyboard').onpointercancel = pointerEnd;
$('keyboard').onlostpointercapture = pointerEnd;
window.hardwareKey = (key, down) => {
  key = key.length === 1 ? key.toLowerCase() : key;
  if (down) {
    if (downKeys.has(key)) return;
    downKeys.add(key);
    if (key in keyMap) press('key-' + key, 12 * (octave + 1) + keyMap[key]);
    else if (key === 'z') setOctave(octave - 1);
    else if (key === 'x') setOctave(octave + 1);
    else if (key === ' ') space = true;
    else if (key === 'Escape') panic();
  } else {
    downKeys.delete(key);
    if (key in keyMap) release('key-' + key);
    else if (key === ' ') { space = false; releaseSustain(); }
  }
};
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.target.tagName === 'SELECT') return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key in keyMap || ['z', 'x', ' ', 'Escape'].includes(key)) { e.preventDefault(); window.hardwareKey(key, true); }
});
window.addEventListener('keyup', e => window.hardwareKey(e.key, false));
window.synthSuspend = () => { panic(); if (synth.ctx?.state === 'running') synth.ctx.suspend(); };
window.backgroundMode = false;
window.nativeForeground = true;
function background() {
  if (!window.backgroundMode) { window.synthSuspend(); return; }
  space = false; $('hold').checked = false;
  for (const id of [...held.keys()]) release(id);
  releaseSustain(); downKeys.clear(); pointers.clear();
}
window.addEventListener('blur', background);
window.synthSetForeground = value => { window.nativeForeground = value; if (!value) background(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) background(); });
window.midiController = new MidiController(synth, () => {
  paintKeys(); $('midi-count').textContent = window.midiController.events + ' EVENTS';
}, number => {
  if (!$('midi-program').checked) return;
  const name = Object.keys(factory)[number];
  if (name) { $('preset').value = name; $('preset').onchange(); }
});
for (let n = 0; n < 16; n++) {
  const o = document.createElement('option'); o.value = n; o.textContent = n + 1; $('midi-channel').append(o);
}
$('midi-channel').onchange = () => { window.midiController.reset(); window.midiController.channel = Number($('midi-channel').value); paintKeys(); };
window.receiveMidi = batch => window.midiController.receive(batch);
window.midiDisconnected = source => window.midiController.disconnect(source);
window.midiNativeState = (enabled, ports, connection) => {
  window.backgroundMode = enabled; window.midiController.enabled = enabled; $('midi-enabled').checked = enabled;
  $('midi-status').textContent = enabled ? 'ACTIVE' : 'OFF';
  if (connection) $('midi-connection').textContent = connection;
  if (ports) {
    const selected = $('midi-source').value;
    $('midi-source').replaceChildren();
    for (const p of [{ id: 'auto', name: 'USB自動 + アプリ入力' }, { id: 'none', name: 'アプリ入力のみ' }, ...ports]) {
      const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('midi-source').append(o);
    }
    if ([...$('midi-source').options].some(o => o.value === selected)) $('midi-source').value = selected;
  }
};
$('midi-enabled').onchange = () => {
  if (!window.AndroidMidi) { $('midi-enabled').checked = false; $('midi-status').textContent = 'Android版のみ'; return; }
  synth.wake(); window.AndroidMidi.enable($('midi-enabled').checked);
};
$('midi-source').onchange = () => window.AndroidMidi?.selectSource($('midi-source').value);
const canvas = $('scope'), pen = canvas.getContext('2d', { willReadFrequently: true }), samples = new Uint8Array(512);
let frame = 0;
function draw(now) {
  requestAnimationFrame(draw);
  if (document.hidden || !window.nativeForeground || now - frame < 50) return;
  frame = now;
  const w = Math.round(canvas.clientWidth), h = Math.round(canvas.clientHeight);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  pen.fillStyle = '#0d120e'; pen.fillRect(0, 0, w, h);
  pen.strokeStyle = '#24372a'; pen.lineWidth = 1; pen.beginPath();
  for (let x = 0; x < w; x += 32) { pen.moveTo(x, 0); pen.lineTo(x, h); }
  pen.moveTo(0, h / 2); pen.lineTo(w, h / 2); pen.stroke();
  if (synth.analyser) synth.analyser.getByteTimeDomainData(samples); else samples.fill(128);
  pen.strokeStyle = '#63e3a2'; pen.lineWidth = 1.5; pen.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = i * w / (samples.length - 1), y = h * .58 + (samples[i] - 128) / 128 * h * .8;
    if (i === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
  }
  pen.stroke();
}
sync(); setOctave(3); requestAnimationFrame(draw);
