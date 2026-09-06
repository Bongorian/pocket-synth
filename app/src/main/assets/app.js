'use strict';
const synth = new SynthEngine();
const $ = id => document.getElementById(id);
const defaults = { ...synth.params };
const factory = window.FACTORY_PRESETS;
const specs = {
  harmonics: ['synthesis', 'Harmonics', 1, 32, 1, v => String(Math.round(v))],
  tilt: ['synthesis', 'Harmonic Tilt', .3, 3, .05, v => v.toFixed(2)],
  even: ['synthesis', 'Even Harmonics', 0, 1, .01, percent],
  ringRatio: ['synthesis', 'Ring Ratio', .125, 12, .125, v => v.toFixed(3)],
  ringMix: ['synthesis', 'Ring Mix', 0, 1, .01, percent],
  drumTone: ['synthesis', 'Drum Tune', -12, 12, 1, v => v + ' st'],
  drumDecay: ['synthesis', 'Drum Decay', .3, 2, .05, v => v.toFixed(2) + 'x'],
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
  if (['analog', 'fm', 'wavetable', 'additive', 'ring', 'drums'].includes(raw.mode)) p.mode = raw.mode;
  if (['electro','deep','dust'].includes(raw.kit)) p.kit=raw.kit;
  if (['basic', 'vocal', 'metal'].includes(raw.table)) p.table = raw.table;
  for (const [id, s] of Object.entries(specs)) {
    if (typeof raw[id] === 'number' && Number.isFinite(raw[id])) p[id] = Math.max(s[2], Math.min(s[3], raw[id]));
  }
  return p;
}
try {
  const data = JSON.parse(localStorage.getItem('pocket-synth-users') || '{}');
  for (let i = 1; i <= 16; i++) { const p = validPatch(data?.['User ' + i]); if (p) users['User ' + i] = p; }
} catch (_) {}
for(const id of ['mode','synth-mode']) for(const [value,name] of [['additive','Additive'],['ring','Ring Mod'],['drums','Drum Kit']]) {
  const o=document.createElement('option');o.value=value;o.textContent=name;$(id).append(o);
}
for(let i=5;i<=16;i++){const o=document.createElement('option');o.value=i;o.textContent='User '+i;$('slot').append(o);}
let persistTimer;
function persistParts() {
  clearTimeout(persistTimer);
  try { localStorage.setItem('pocket-synth-parts-v3',JSON.stringify({selected:synth.selectedPart,volume:Number($('volume').value),
    parts:synth.parts.map(p=>({patch:p.params,name:p.name,level:p.level,pan:p.pan,mute:p.mute,modified:!!p.modified}))})); }
  catch(_){$('status').textContent='保存できません';}
}
function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(persistParts,180);}
synth.setPatch(9,factory['Electro Kit'],'Electro Kit');
try{
  const saved=JSON.parse(localStorage.getItem('pocket-synth-parts-v3')||'null');
  if(saved&&Array.isArray(saved.parts)){
    saved.parts.slice(0,16).forEach((raw,i)=>{
      const patch=validPatch(raw?.patch);if(!patch)return;
      const name=typeof raw.name==='string'&&(raw.name in factory||raw.name in users)?raw.name:'Warm Keys';
      synth.setPatch(i,patch,name);synth.parts[i].modified=Boolean(raw.modified);
      synth.mixer(i,{level:Number.isFinite(raw.level)?raw.level:1,pan:Number.isFinite(raw.pan)?raw.pan:0,mute:raw.mute===true});
    });
    if(Number.isInteger(saved.selected)&&saved.selected>=0&&saved.selected<16)synth.selectPart(saved.selected);
    if(Number.isFinite(saved.volume)){$('volume').value=Math.max(0,Math.min(.8,saved.volume));synth.update({volume:Number($('volume').value)});}
  }
}catch(_){}
basePreset=synth.parts[synth.selectedPart].name;
for(let i=0;i<16;i++){
  const option=document.createElement('option');option.value=i;option.textContent='Ch '+(i+1);$('edit-part').append(option);
  const row=document.createElement('div');row.className='part-row';row.dataset.part=i;
  const label=document.createElement('button');label.className='part-select';label.textContent=String(i+1).padStart(2,'0');label.setAttribute('aria-label','Ch '+(i+1)+' を編集');label.onclick=()=>{$('edit-part').value=i;$('edit-part').onchange();};
  const select=document.createElement('select');select.dataset.patch=i;select.setAttribute('aria-label','Ch '+(i+1)+' 音色');
  select.onchange=()=>assignPatch(i,select.value);
  const mute=document.createElement('input');mute.type='checkbox';mute.dataset.mute=i;mute.setAttribute('aria-label','Ch '+(i+1)+' Mute');
  mute.onchange=()=>{synth.mixer(i,{mute:mute.checked});schedulePersist();};
  const solo=document.createElement('button');solo.className='solo';solo.textContent='S';solo.dataset.solo=i;solo.setAttribute('aria-label','Ch '+(i+1)+' Solo');solo.setAttribute('aria-pressed','false');solo.onclick=()=>{synth.solo(i);window.studio?.refresh();};
  row.append(label,select,mute,solo);$('part-list').append(row);
}
function presetOptions(){return [...Object.keys(factory),...Object.keys(users)].map(name=>{const o=document.createElement('option');o.value=name;o.textContent=window.studio?.name(name)||name;return o;});}
function partRows(){
  document.querySelectorAll('[data-patch]').forEach(select=>{
    const part=synth.parts[Number(select.dataset.patch)];select.replaceChildren(...presetOptions());select.value=part.name;
    if(part.modified&&select.selectedOptions[0])select.selectedOptions[0].textContent+=' *';
  });
  document.querySelectorAll('[data-mute]').forEach(m=>m.checked=synth.parts[Number(m.dataset.mute)].mute);
  document.querySelectorAll('.part-row').forEach(r=>r.classList.toggle('selected',Number(r.dataset.part)===synth.selectedPart));
}
function options() {
  $('preset').replaceChildren(...presetOptions());$('preset').value=synth.parts[synth.selectedPart].name;
  if(synth.parts[synth.selectedPart].modified&&$('preset').selectedOptions[0])$('preset').selectedOptions[0].textContent+=' *';
  partRows();
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
  $('wave').disabled = !['analog','ring'].includes(synth.params.mode);
  $('synth-mode').value = synth.params.mode;
  for (const id of ['fmRatio', 'fmIndex', 'fmDecay']) $(id).disabled = synth.params.mode !== 'fm';
  $('table').disabled = $('position').disabled = synth.params.mode !== 'wavetable';
  const groups={fm:['fmRatio','fmIndex','fmDecay'],wavetable:['position'],additive:['harmonics','tilt','even'],ring:['ringRatio','ringMix'],drums:['drumTone','drumDecay']};
  for(const [mode,ids] of Object.entries(groups))for(const id of ids)$(id).closest('.control').hidden=synth.params.mode!==mode;
  $('table').hidden=synth.params.mode==='drums';$('kit').hidden=synth.params.mode!=='drums';$('kit').value=synth.params.kit;
  const part=synth.parts[synth.selectedPart];$('edit-part').value=synth.selectedPart;
  $('part-level').value=part.level;$('part-level-out').textContent=percent(part.level);
  $('part-pan').value=part.pan;$('part-pan-out').textContent=part.pan===0?'C':(part.pan<0?'L ':'R ')+Math.round(Math.abs(part.pan)*100);
  for(const id of ['detune','sub','attack','decay','sustain','release','lfoRate','lfoDepth'])$(id).disabled=synth.params.mode==='drums';
  window.studio?.refresh();
}
function markModified() {
  modified = true;
  synth.parts[synth.selectedPart].modified=true;
  $('preset').selectedOptions[0].textContent = (window.studio?.name(basePreset)||basePreset) + ' *';
  const row=document.querySelector('[data-patch="'+synth.selectedPart+'"]');
  if(row?.selectedOptions[0])row.selectedOptions[0].textContent=basePreset+' *';
  schedulePersist();
  window.studio?.refresh();
}
$('wave').onchange = () => { synth.update({ wave: $('wave').value }); markModified(); };
$('mode').onchange = () => { stopEditedPart(); synth.update({ mode: $('mode').value }); sync(); markModified(); if(synth.params.mode==='drums')setOctave(2);else buildKeyboard(); };
$('synth-mode').onchange = () => { $('mode').value = $('synth-mode').value; $('mode').onchange(); };
$('table').onchange = () => { synth.update({ table: $('table').value }); markModified(); };
$('kit').onchange=()=>{synth.update({kit:$('kit').value});markModified();};
$('volume').oninput = () => {synth.update({ volume: Number($('volume').value) });schedulePersist();};
function releaseLocal(){window.studio?.resetExpression();space=false;$('hold').checked=false;for(const id of [...held.keys()])release(id);releaseSustain();downKeys.clear();pointers.clear();}
function stopEditedPart(){releaseLocal();window.midiController?.clearChannel(synth.selectedPart);synth.stopPart(synth.selectedPart);}
function assignPatch(index,name){
  const patch=users[name]||factory[name];if(!patch)return;
  window.studio?.beforeEdit(index);
  if(index===synth.selectedPart)releaseLocal();
  window.midiController?.clearChannel(index);synth.setPatch(index,patch,name);synth.parts[index].modified=false;
  if(index===synth.selectedPart){basePreset=name;modified=false;sync();if(synth.params.mode==='drums')setOctave(2);else buildKeyboard();}
  options();paintKeys();schedulePersist();window.studio?.loaded(index);
}
$('preset').onchange=()=>assignPatch(synth.selectedPart,$('preset').value);
$('edit-part').onchange=()=>{
  const targetOctave=window.studio?.partOctave(Number($('edit-part').value));
  releaseLocal();synth.selectPart(Number($('edit-part').value));basePreset=synth.parts[synth.selectedPart].name;
  modified=!!synth.parts[synth.selectedPart].modified;options();sync();
  if(targetOctave!==undefined)setOctave(targetOctave);else if(synth.params.mode==='drums')setOctave(2);else buildKeyboard();paintKeys();schedulePersist();
};
for(const [id,property] of [['part-level','level'],['part-pan','pan']])$(id).oninput=()=>{synth.mixer(synth.selectedPart,{[property]:Number($(id).value)});sync();schedulePersist();};
$('save').onclick = () => {
  const name = 'User ' + $('slot').value;
  const updated = { ...users, [name]: { ...synth.params } };
  try {
    localStorage.setItem('pocket-synth-users', JSON.stringify(updated));
    users = updated; synth.parts[synth.selectedPart].name=name;synth.parts[synth.selectedPart].modified=false;
    options(); $('preset').value = name; basePreset = name; modified = false;persistParts();
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
  const sounding = new Set([...synth.voices.values()].filter(v=>v.part===synth.selectedPart).map(v => v.midi));
  document.querySelectorAll('.key').forEach(k => k.classList.toggle('active', sounding.has(Number(k.dataset.midi))));
  $('note').textContent = [...sounding].map(noteName).join(' ') || 'READY';
  $('status').textContent = synth.voices.size + ' / ' + synth.maxVoices;
  window.studio?.meters();
}
function press(id, midi) {
  if (held.has(id)) return;
  try {
    synth.wake();
    if (sustained.has(id)) { synth.noteOff(id); sustained.delete(id); }
    synth.noteOn(id, midi, undefined, Number($('velocity').value)/127); held.set(id, midi); paintKeys();
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
  window.studio?.resetExpression();
  held.clear(); sustained.clear(); downKeys.clear(); pointers.clear(); space = false; $('hold').checked = false;
  if (window.midiController) window.midiController.reset();
  synth.panic(); paintKeys();
}
$('panic').onclick = panic;
function setOctave(value) {
  octave = Math.max(1, Math.min(6, value));
  window.studio?.octaveChanged(octave);
  $('octave').textContent = 'C' + octave;
  $('oct-down').disabled = octave === 1; $('oct-up').disabled = octave === 6;
  buildKeyboard(); paintKeys();
}
$('oct-down').onclick = () => setOctave(octave - 1);
$('oct-up').onclick = () => setOctave(octave + 1);
function buildKeyboard() {
  // Keep pointer capture on the container, which survives octave changes.
  $('keyboard').replaceChildren();
  const drums=synth.params.mode==='drums';$('keyboard').classList.toggle('drums',drums);
  const whites = [0, 2, 4, 5, 7, 9, 11, 12, 14];
  const drumNotes=[36,38,42,46,37,39,45,49,35,40,44,51,41,43,48,56];
  for (let n = 0; n < (drums?16:15); n++) {
    const k = document.createElement('button'), white = drums||whites.includes(n), midi = drums?drumNotes[n]+12*(octave-2):12 * (octave + 1) + n;
    k.className = 'key ' + (white ? 'white' : 'black'); k.dataset.midi = midi; k.tabIndex = -1;
    k.setAttribute('aria-label', noteName(midi));
    const drumNames={36:'Kick',37:'Rim',38:'Snare',39:'Clap',40:'Snare',41:'Tom',42:'CHat',43:'Tom',44:'PHat',45:'Tom',46:'OHat',47:'Tom',48:'Tom',49:'Crash',50:'Tom'};
    const name=synth.params.mode==='drums'?(drumNames[midi]||SynthEngine.drumGroup(midi)):noteName(midi);
    k.setAttribute('aria-label',synth.params.mode==='drums'?name+' '+noteName(midi):name);
    const shortcut=Object.keys(keyMap).find(key => keyMap[key] === n)||'';
    k.innerHTML = drums?name+'<small>'+noteName(midi)+'</small>':shortcut.toUpperCase()+'<small>'+name+'</small>';
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
  if(down && window.studio?.typing())return;
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
  if (e.ctrlKey || e.altKey || e.metaKey || window.studio?.typing()) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key in keyMap || ['z', 'x', ' ', 'Escape'].includes(key)) { e.preventDefault(); window.hardwareKey(key, true); }
});
window.addEventListener('keyup', e => window.hardwareKey(e.key, false));
window.synthSuspend = () => { panic(); if (synth.ctx?.state === 'running') synth.ctx.suspend(); };
window.backgroundMode = false;
window.nativeForeground = true;
function background() {
  window.studio?.resetExpression();
  persistParts();
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
}, (number, channel) => {
  if (!$('midi-program').checked) return;
  const name = Object.keys(factory)[number];
  if (name) assignPatch(channel,name);
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
  pen.fillStyle = '#111518'; pen.fillRect(0, 0, w, h);
  pen.strokeStyle = '#27333c'; pen.lineWidth = 1; pen.beginPath();
  for (let x = 0; x < w; x += 32) { pen.moveTo(x, 0); pen.lineTo(x, h); }
  pen.moveTo(0, h / 2); pen.lineTo(w, h / 2); pen.stroke();
  if (synth.analyser) synth.analyser.getByteTimeDomainData(samples); else samples.fill(128);
  pen.strokeStyle = '#83cfe2'; pen.lineWidth = 1.5; pen.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const x = i * w / (samples.length - 1), y = h * .58 + (samples[i] - 128) / 128 * h * .8;
    if (i === 0) pen.moveTo(x, y); else pen.lineTo(x, y);
  }
  pen.stroke();
}
synth.onVoiceEnded=()=>{if(!document.hidden&&window.nativeForeground)paintKeys();};
sync(); setOctave(synth.params.mode==='drums'?2:3); requestAnimationFrame(draw);
