'use strict';
(() => {
  let destination=0;
  $('sample-select').onchange=()=>{
    stopEditedPart();synth.update({sample:$('sample-select').value,sampleData:'',sampleName:'',sampleRoot:60});sync();markModified();
  };
  $('sample-import').onclick=()=>{
    destination=synth.selectedPart;releaseLocal();
    if(window.AndroidStudio?.importSample)window.AndroidStudio.importSample();else $('sample-file').click();
  };
  async function load(bytes,name){
    const target=destination;
    try{
      if(bytes.byteLength>2097152)throw Error('音声ファイルは2 MB以内です');
      synth.wake();const decoded=await synth.ctx.decodeAudioData(bytes);
      if(decoded.duration>2.001||decoded.duration<.01)throw Error('10 ms〜2秒の音声を選んでください');
      const n=Math.min(48000,Math.floor(decoded.duration*24000)),channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
      let raw='';
      for(let i=0;i<n;i++){
        const pos=i*decoded.sampleRate/24000,j=Math.floor(pos),f=pos-j;let x=0;
        for(const d of channels)x+=(d[j]||0)*(1-f)+(d[Math.min(j+1,d.length-1)]||0)*f;
        const sample=Math.round(Math.max(-1,Math.min(1,x/channels.length))*32767);
        raw+=String.fromCharCode(sample&255,(sample>>8)&255);
      }
      studio.beforeEdit(target);synth.stopPart(target);
      synth.update({sampleData:btoa(raw),sampleName:name.slice(0,60),sampleRoot:60},target);
      synth.parts[target].modified=true;
      if(target===synth.selectedPart){sync();markModified();}else persistParts();
      studio.notify('Ch '+(target+1)+' に読込 · Root Noteで基準音を指定');
    }catch(e){studio.notify(e.message||'音声を読み込めませんでした');}
  }
  $('sample-file').onchange=async()=>{
    const file=$('sample-file').files[0];if(file){if(file.size>2097152)studio.notify('音声ファイルは2 MB以内です');else await load(await file.arrayBuffer(),file.name);}$('sample-file').value='';
  };
  window.synthImportSample=(base64,name)=>{
    const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return load(bytes.buffer,name);
  };
})();
