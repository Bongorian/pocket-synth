'use strict';
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const engines = {analog:'ANALOG',fm:'FM',wavetable:'WAVETABLE',additive:'ADDITIVE',ring:'RING MOD',drums:'DRUM KIT'};
  const histories = Array.from({length:16},()=>({undo:[],redo:[],reference:null,comparing:false}));
  const partOctaves=synth.parts.map(p=>p.params.mode==='drums'?2:3);
  let names={}, favorites=new Set(), onlyFavorites=false, pendingImport=null, noticeTimer;
  try { names=JSON.parse(localStorage.getItem('pocket-synth-names')||'{}');if(!names||typeof names!=='object')names={}; } catch(_){names={};}
  try { const raw=JSON.parse(localStorage.getItem('pocket-synth-favorites')||'[]');if(Array.isArray(raw))favorites=new Set(raw.filter(n=>typeof n==='string')); } catch(_){}
  const name = id => typeof names[id]==='string' ? names[id] : id;
  function notify(message){clearTimeout(noticeTimer);$('notice').textContent=message;noticeTimer=setTimeout(()=>{$('notice').textContent='CH '+(synth.selectedPart+1)+'  ·  '+engines[synth.params.mode];},2600);}
  function snapshot(index){const p=synth.parts[index];return {patch:clone(p.params),name:p.name,modified:!!p.modified};}
  function historyState(index){const h=histories[index];return {sound:snapshot(index),reference:clone(h.reference),comparing:h.comparing};}
  function beforeEdit(index=synth.selectedPart){const h=histories[index];h.undo.push(historyState(index));if(h.undo.length>24)h.undo.shift();h.redo=[];refresh();}
  function apply(index,state){
    const part=synth.parts[index], values={...state.patch};delete values.volume;
    if(part.params.mode!==values.mode){if(index===synth.selectedPart)releaseLocal();window.midiController?.clearChannel(index);synth.setPatch(index,state.patch,state.name);}
    else {synth.update(values,index);part.name=state.name;}
    synth.parts[index].modified=state.modified;
    if(index===synth.selectedPart){basePreset=state.name;modified=state.modified;options();sync();buildKeyboard();paintKeys();}
    schedulePersist();refresh();
  }
  function history(forward){const i=synth.selectedPart,h=histories[i],from=forward?h.redo:h.undo,to=forward?h.undo:h.redo;if(!from.length)return;to.push(historyState(i));const state=from.pop();h.reference=state.reference;h.comparing=state.comparing;apply(i,state.sound);notify(forward?'やり直しました':'元に戻しました');}
  function loaded(index){const h=histories[index];h.reference=snapshot(index);h.comparing=false;refresh();}
  function compare(){const i=synth.selectedPart,h=histories[i];if(!h.reference)return;beforeEdit(i);const current=snapshot(i);apply(i,h.reference);h.reference=current;h.comparing=!h.comparing;refresh();notify(h.comparing?'A · 比較音色':'B · 編集音色');}
  function resetExpression(){synth.perform(synth.selectedPart,{bend:0,modulation:0});$('bend').value=0;$('mod').value=0;}
  function meters(){
    const sounding=new Set([...synth.voices.values()].map(v=>v.part));
    document.querySelectorAll('.part-row').forEach(row=>row.classList.toggle('sounding',sounding.has(Number(row.dataset.part))));
  }
  function refresh(){
    const p=synth.parts[synth.selectedPart],h=histories[synth.selectedPart];
    $('patch-name').textContent=name(p.name)+(p.modified?' ·':'');$('patch-engine').textContent=engines[p.params.mode]+' / '+(p.modified?'EDITED':'PATCH');
    $('undo').disabled=!h.undo.length;$('redo').disabled=!h.redo.length;$('compare').setAttribute('aria-pressed',String(h.comparing));
    document.querySelectorAll('[data-solo]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.solo)===synth.soloPart)));
    for(const id of ['cutoff','resonance','attack','release','drumTone','drumDecay']){
      const input=$('live-'+id);if(!input)continue;const s=specs[id],v=synth.params[id];
      input.value=s[6]?Math.log(v/s[2])/Math.log(s[3]/s[2])*1000:v;$('live-out-'+id).textContent=s[5](v);
      input.closest('.control').hidden=synth.params.mode==='drums'?['attack','release'].includes(id):['drumTone','drumDecay'].includes(id);
    }
    $('bend').disabled=$('mod').disabled=synth.params.mode==='drums';
    $('xy-value').textContent=specs.cutoff[5](synth.params.cutoff)+' / Q '+synth.params.resonance.toFixed(1);
    $('xy').setAttribute('aria-valuenow',String(Math.round(synth.params.cutoff)));
    drawXY();drawEnvelope();meters();
  }
  function typing(){return !!document.querySelector('dialog[open]')||!!document.activeElement?.matches('input:not([type=range]):not([type=checkbox]),textarea,select');}
  function editMode(){window.AndroidStudio?.editing(typing());}
  function openDialog(id){releaseLocal();$(id).showModal();editMode();}
  function closeDialog(){const dialogs=[...document.querySelectorAll('dialog[open]')];if(!dialogs.length)return false;dialogs.at(-1).close();editMode();return true;}
  window.studio={name,beforeEdit,loaded,refresh,meters,resetExpression,history,compare,typing,closeDialog,notify,partOctave:i=>partOctaves[i],octaveChanged:v=>partOctaves[synth.selectedPart]=v};
  for(let i=0;i<16;i++)histories[i].reference=snapshot(i);
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{editMode();$('browse').blur();}));
  document.addEventListener('focusin',()=>{if(typing())releaseLocal();editMode();});
  document.addEventListener('focusout',()=>setTimeout(editMode,0));
  const editIds=new Set([...Object.keys(specs),'wave','mode','synth-mode','table','kit']);
  document.addEventListener('pointerdown',e=>{if(editIds.has(e.target.id)&&e.target.type==='range')beforeEdit();},true);
  document.addEventListener('keydown',e=>{if(editIds.has(e.target.id)&&e.target.type==='range'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))beforeEdit();},true);
  document.addEventListener('change',e=>{if(editIds.has(e.target.id)&&e.target.tagName==='SELECT')beforeEdit();},true);
  document.addEventListener('change',e=>{if(e.target.tagName==='SELECT'&&!e.target.closest('dialog'))e.target.blur();});
  $('undo').onclick=()=>history(false);$('redo').onclick=()=>history(true);$('compare').onclick=compare;
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!typing()&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}});
  function results(){
    const query=$('preset-search').value.trim().toLowerCase(),filter=$('preset-filter').value;
    const matching=[...Object.keys(factory),...Object.keys(users)].filter(id=>{
      const patch=users[id]||factory[id];return (!onlyFavorites||favorites.has(id))&&(filter==='all'||(filter==='user'?!!users[id]:(patch.mode||'analog')===filter))&&(name(id)+' '+id).toLowerCase().includes(query);
    });
    $('preset-results').replaceChildren();
    for(const id of matching){
      const row=document.createElement('div');row.className='preset-item';row.classList.toggle('selected',synth.parts[synth.selectedPart].name===id);
      const load=document.createElement('button');load.className='preset-load';load.dataset.preset=id;
      const title=document.createElement('strong');title.textContent=name(id);const detail=document.createElement('small');detail.textContent=engines[(users[id]||factory[id]).mode||'analog']+(users[id]?' / '+id:' / FACTORY');load.append(title,detail);
      load.onclick=()=>{assignPatch(synth.selectedPart,id);$('browser').close();notify(name(id));};
      const star=document.createElement('button');star.className='icon favorite';star.setAttribute('aria-label',name(id)+' お気に入り');star.setAttribute('aria-pressed',String(favorites.has(id)));star.innerHTML='<img src="icons/star.svg" alt="">';
      star.onclick=()=>{if(favorites.has(id))favorites.delete(id);else favorites.add(id);try{localStorage.setItem('pocket-synth-favorites',JSON.stringify([...favorites]));}catch(_){notify('お気に入りを保存できません');}results();};row.append(load,star);$('preset-results').append(row);
    }
    if(!matching.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='該当する音色はありません';$('preset-results').append(empty);}
  }
  $('browse').onclick=()=>{results();openDialog('browser');};$('preset-search').oninput=results;$('preset-filter').onchange=results;
  $('favorites-only').onclick=()=>{onlyFavorites=!onlyFavorites;$('favorites-only').setAttribute('aria-pressed',String(onlyFavorites));results();};
  function adjacent(delta){const ids=[...Object.keys(factory),...Object.keys(users)],i=ids.indexOf(synth.parts[synth.selectedPart].name);assignPatch(synth.selectedPart,ids[(i+delta+ids.length)%ids.length]);}
  $('previous-preset').onclick=()=>adjacent(-1);$('next-preset').onclick=()=>adjacent(1);
  for(let i=1;i<=16;i++){const o=document.createElement('option');o.value=i;o.textContent='User '+i;$('save-slot').append(o);}
  $('save').onclick=()=>{
    for(const o of $('save-slot').options)o.textContent='User '+o.value+(users['User '+o.value]?' · '+name('User '+o.value):' · Empty');
    $('save-slot').value=$('slot').value;$('save-name').value=name(synth.parts[synth.selectedPart].name);saveLabel();openDialog('save-dialog');
  };
  function saveLabel(){$('confirm-save').textContent=users['User '+$('save-slot').value]?'上書き保存':'保存';}
  $('save-slot').onchange=saveLabel;
  $('confirm-save').onclick=()=>{
    const id='User '+$('save-slot').value,display=$('save-name').value.trim()||id;
    const updated={...users,[id]:clone(synth.params)},labels={...names,[id]:display};
    try{localStorage.setItem('pocket-synth-users',JSON.stringify(updated));localStorage.setItem('pocket-synth-names',JSON.stringify(labels));}
    catch(_){notify('保存できません。バックアップを書き出してください');return;}
    beforeEdit();users=updated;names=labels;const p=synth.parts[synth.selectedPart];p.name=id;p.modified=false;basePreset=id;modified=false;$('slot').value=$('save-slot').value;
    options();sync();persistParts();loaded(synth.selectedPart);$('save-dialog').close();notify(display+' を保存しました');
  };
  for(const id of ['cutoff','resonance','attack','release','drumTone','drumDecay']){
    const s=specs[id],label=document.createElement('label');label.className='control';
    label.innerHTML='<span class="control-head"><span>'+s[1]+'</span><output id="live-out-'+id+'"></output></span><input id="live-'+id+'" type="range" aria-label="'+s[1]+'">';
    $('live-controls').append(label);const input=$('live-'+id);input.min=s[6]?0:s[2];input.max=s[6]?1000:s[3];input.step=s[6]?1:s[4];
    input.onpointerdown=()=>beforeEdit();input.onkeydown=e=>{if(e.key.startsWith('Arrow'))beforeEdit();};
    input.oninput=()=>{const v=s[6]?s[2]*Math.pow(s[3]/s[2],Number(input.value)/1000):Number(input.value);synth.update({[id]:v});markModified();sync();};
  }
  function surface(canvas){const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,devicePixelRatio||1);if(!rect.width||!rect.height)return null;canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);const c=canvas.getContext('2d');c.scale(ratio,ratio);return {c,w:rect.width,h:rect.height};}
  function drawXY(){const s=surface($('xy-canvas'));if(!s)return;const {c,w,h}=s,x=Math.log(synth.params.cutoff/80)/Math.log(200),y=1-(synth.params.resonance-.1)/11.9;
    c.strokeStyle='#344a59';c.lineWidth=1;for(let n=1;n<4;n++){c.beginPath();c.moveTo(w*n/4,0);c.lineTo(w*n/4,h);c.moveTo(0,h*n/4);c.lineTo(w,h*n/4);c.stroke();}
    c.strokeStyle='#83cfe288';c.beginPath();c.moveTo(x*w,0);c.lineTo(x*w,h);c.moveTo(0,y*h);c.lineTo(w,y*h);c.stroke();c.fillStyle='#83cfe2';c.beginPath();c.arc(Math.max(6,Math.min(w-6,x*w)),Math.max(6,Math.min(h-6,y*h)),5,0,Math.PI*2);c.fill();
  }
  let xyPointer=null,xyPart;
  function xyMove(e){if(e.pointerId!==xyPointer)return;const r=$('xy').getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));synth.update({cutoff:80*Math.pow(200,x),resonance:.1+(1-y)*11.9},xyPart);if(xyPart===synth.selectedPart){markModified();sync();}}
  $('xy').onpointerdown=e=>{e.preventDefault();if(xyPointer!==null)return;beforeEdit();xyPointer=e.pointerId;xyPart=synth.selectedPart;$('xy').setPointerCapture(e.pointerId);xyMove(e);};
  $('xy').onpointermove=xyMove;for(const event of ['pointerup','pointercancel','lostpointercapture'])$('xy').addEventListener(event,e=>{if(e.pointerId===xyPointer)xyPointer=null;});
  $('xy').onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();beforeEdit();if(['ArrowLeft','ArrowRight'].includes(e.key))synth.update({cutoff:Math.max(80,Math.min(16000,synth.params.cutoff*(e.key==='ArrowLeft'?.9:1.1)))});else synth.update({resonance:Math.max(.1,Math.min(12,synth.params.resonance+(e.key==='ArrowUp'?.2:-.2)))});markModified();sync();};
  function drawEnvelope(){const s=surface($('envelope'));if(!s)return;const {c,w,h}=s,p=synth.params,total=p.attack+p.decay+.5+p.release,scale=(w-16)/total,x=8,a=x+p.attack*scale,d=a+p.decay*scale,end=d+.5*scale;const y=h-7,peak=7,level=y-(y-peak)*p.sustain;
    c.strokeStyle='#eea298';c.lineWidth=2;c.beginPath();c.moveTo(x,y);c.lineTo(a,peak);c.lineTo(d,level);c.lineTo(end,level);c.lineTo(w-8,y);c.stroke();c.lineTo(x,y);c.fillStyle='#eea29815';c.fill();
  }
  $('bend').oninput=()=>synth.perform(synth.selectedPart,{bend:Number($('bend').value)});
  const centerBend=()=>{$('bend').value=0;synth.perform(synth.selectedPart,{bend:0});};
  for(const e of ['pointerup','pointercancel','lostpointercapture','blur','keyup'])$('bend').addEventListener(e,centerBend);
  $('mod').oninput=()=>synth.perform(synth.selectedPart,{modulation:Number($('mod').value)});
  $('velocity').oninput=()=>notify('VELOCITY  '+$('velocity').value);
  const originalMidiState=window.midiNativeState;
  window.midiNativeState=(...args)=>{originalMidiState(...args);$('midi-light').textContent=args[0]?'ON':'OFF';$('midi-light').classList.toggle('on',args[0]);};
  $('midi-shortcut').onclick=()=>document.querySelector('[data-tab=midi]').click();
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{resetExpression();requestAnimationFrame(refresh);}));
  new ResizeObserver(()=>{drawXY();drawEnvelope();}).observe(document.querySelector('main'));
  $('project').onclick=()=>openDialog('project-dialog');
  $('reset-performance').onclick=()=>{resetExpression();if(synth.soloPart>=0)synth.solo(synth.soloPart);refresh();$('project-dialog').close();notify('Solo / Bend / Mod を解除');};
  function exportData(){return {format:'pocket-synth',version:4,users:clone(users),names:clone(names),favorites:[...favorites],selected:synth.selectedPart,volume:Number($('volume').value),parts:synth.parts.map(p=>({patch:clone(p.params),name:p.name,level:p.level,pan:p.pan,mute:p.mute,modified:!!p.modified}))};}
  function validate(raw){
    if(!raw||raw.format!=='pocket-synth'||raw.version!==4||!Array.isArray(raw.parts)||raw.parts.length!==16)throw Error('非対応のバックアップです');
    const patch=p=>{if(!p||!engines[p.mode]||!Number.isFinite(p.cutoff))throw Error('音色データが不正です');return validPatch(p);};
    const bank={};for(let n=1;n<=16;n++){const id='User '+n;if(raw.users?.[id])bank[id]=patch(raw.users[id]);}
    const labels={};for(const id of Object.keys(bank))if(typeof raw.names?.[id]==='string')labels[id]=raw.names[id].slice(0,40);
    const parts=raw.parts.map(p=>{if(!p||!Number.isFinite(p.level)||!Number.isFinite(p.pan))throw Error('パートデータが不正です');return {patch:patch(p.patch),name:typeof p.name==='string'&&(p.name in factory||p.name in bank)?p.name:'Warm Keys',level:Math.max(0,Math.min(1.5,p.level)),pan:Math.max(-1,Math.min(1,p.pan)),mute:p.mute===true,modified:p.modified===true};});
    return {users:bank,names:labels,favorites:Array.isArray(raw.favorites)?raw.favorites.filter(id=>typeof id==='string'&&(id in factory||id in bank)):[],selected:Number.isInteger(raw.selected)?Math.max(0,Math.min(15,raw.selected)):0,volume:Number.isFinite(raw.volume)?Math.max(0,Math.min(.8,raw.volume)):.35,parts};
  }
  $('export-bank').onclick=()=>{
    const data=JSON.stringify(exportData(),null,2);if(window.AndroidStudio)window.AndroidStudio.exportBank(data);else{const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='pocket-synth-bank.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
    $('project-dialog').close();
  };
  $('import-bank').onclick=()=>{$('project-dialog').close();if(window.AndroidStudio)window.AndroidStudio.importBank();else $('bank-file').click();};
  window.studioImport=text=>{try{if(text.length>1048576)throw Error('ファイルが大きすぎます');pendingImport=validate(JSON.parse(text));openDialog('import-dialog');}catch(e){notify(e.message||'読み込めません');}};
  $('bank-file').onchange=async()=>{const file=$('bank-file').files[0];if(file){if(file.size>1048576)notify('ファイルが大きすぎます');else window.studioImport(await file.text());}$('bank-file').value='';};
  $('confirm-import').onclick=()=>{
    if(!pendingImport)return;const b=pendingImport;
    const values={'pocket-synth-users':JSON.stringify(b.users),'pocket-synth-names':JSON.stringify(b.names),'pocket-synth-favorites':JSON.stringify(b.favorites),'pocket-synth-parts-v3':JSON.stringify(b)};
    const old=Object.fromEntries(Object.keys(values).map(k=>[k,localStorage.getItem(k)]));
    try{for(const [k,v] of Object.entries(values))localStorage.setItem(k,v);}catch(_){for(const [k,v] of Object.entries(old))try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(_){}notify('保存領域が不足しています');return;}
    panic();if(synth.soloPart>=0)synth.solo(synth.soloPart);users=b.users;names=b.names;favorites=new Set(b.favorites);
    b.parts.forEach((p,i)=>{synth.setPatch(i,p.patch,p.name);synth.mixer(i,p);synth.parts[i].modified=p.modified;histories[i].undo=[];histories[i].redo=[];loaded(i);});
    synth.selectPart(b.selected);synth.update({volume:b.volume});$('volume').value=b.volume;basePreset=synth.parts[b.selected].name;modified=synth.parts[b.selected].modified;
    options();sync();setOctave(synth.params.mode==='drums'?2:3);persistParts();pendingImport=null;$('import-dialog').close();notify('バックアップを読み込みました');
  };
  window.studio.exportData=exportData;window.studio.validate=validate;
  options();refresh();
})();
