/* share.js — shared file (PDF / image) hand-off to WhatsApp, plus a small
   reusable file library stored in Cache Storage. */
import {$, store, esc, fmtSize, toast} from './core.js';
import {tr} from './i18n.js';

let attFile=null;
export function renderAttach(){
  const el=$('attach');
  if(!attFile){el.hidden=true;el.innerHTML='';return}
  el.innerHTML=`<div class="qhead"><span class="bk">Attachment ready</span><button type="button" class="btn small" data-a="rm">Remove</button></div>
    <p class="attn" dir="auto">${esc(attFile.name)} <span class="bk">${fmtSize(attFile.size)}</span></p>
    <ol class="steps"><li>Enter the number below and tap Open chat. This creates the chat in WhatsApp.</li><li>Come back here and tap Send file, then pick WhatsApp and that chat. It is at the top of the list.</li></ol>
    <button type="button" class="btn primary" data-a="send">Send file</button>`;
  el.hidden=false;
}
export async function loadSharedFile(){
  try{
    const c=await caches.open('qc-share'),res=await c.match('shared-file');if(!res)return;
    const blob=await res.blob(),name=decodeURIComponent(res.headers.get('X-Name')||'file');
    attFile=new File([blob],name,{type:blob.type||res.headers.get('Content-Type')||'application/octet-stream'});
    renderAttach();
  }catch(e){}
}
export async function clearSharedFile(){attFile=null;renderAttach();try{const c=await caches.open('qc-share');await c.delete('shared-file')}catch(e){}}
$('attach').addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  if(b.dataset.a==='rm'){clearSharedFile();return}
  if(!attFile)return;
  if(!(navigator.canShare&&navigator.canShare({files:[attFile]}))){toast('This phone cannot share this file type from the app');return}
  navigator.share({files:[attFile]}).then(()=>{toast('File passed to the app you picked');clearSharedFile()}).catch(err=>{if(!err||err.name!=='AbortError')toast('Sharing failed. Try again')});
});

/* File library: files kept in Cache Storage ('qc-lib'), metadata in qc_lib.
   Use a saved file as the current attachment, or share it straight away. */
const LIB_MAX=20;
const libMeta=()=>store.get('qc_lib',[]);
function saveMeta(m){store.set('qc_lib',m)}
async function libBlob(id){
  const c=await caches.open('qc-lib'),res=await c.match('qc-lib-'+id);
  return res?res.blob():null;
}
export function renderLib(){
  const el=$('libCard');if(!el)return;
  const m=libMeta();
  el.hidden=!m.length;
  if(!m.length){el.innerHTML='';return}
  el.innerHTML=`<div class="qhead"><span class="bk">${esc(tr('File library'))}</span><button type="button" class="btn small" id="libAdd">${esc(tr('Add file'))}</button></div>`+
    m.map(f=>`<div class="wrapr" data-id="${f.id}"><span class="attn" dir="auto">${esc(f.name)} <span class="bk">${fmtSize(f.size)}</span></span>
      <button type="button" class="btn small" data-l="use">${esc(tr('Use'))}</button>
      <button type="button" class="btn small" data-l="send">${esc(tr('Send'))}</button>
      <button type="button" class="btn small danger" data-l="del">${esc(tr('Delete'))}</button></div>`).join('');
}
$('libCard')&&$('libCard').addEventListener('click',async e=>{
  const add=e.target.closest('#libAdd');
  if(add){$('libFile').click();return}
  const row=e.target.closest('[data-id]'),act=e.target.closest('[data-l]');
  if(!row||!act)return;
  const id=row.dataset.id,meta=libMeta().find(x=>x.id===id);
  if(!meta)return;
  if(act.dataset.l==='del'){
    saveMeta(libMeta().filter(x=>x.id!==id));
    try{const c=await caches.open('qc-lib');await c.delete('qc-lib-'+id)}catch(e){}
    renderLib();toast(tr('File removed'));return;
  }
  const blob=await libBlob(id);if(!blob){toast(tr('File missing'));saveMeta(libMeta().filter(x=>x.id!==id));renderLib();return}
  const file=new File([blob],meta.name,{type:meta.type||'application/octet-stream'});
  if(act.dataset.l==='use'){attFile=file;renderAttach();toast(tr('File attached'));return}
  if(!(navigator.canShare&&navigator.canShare({files:[file]}))){toast('This phone cannot share this file type from the app');return}
  navigator.share({files:[file],title:meta.name}).then(()=>toast(tr('File passed to the app you picked'))).catch(err=>{if(!err||err.name!=='AbortError')toast('Sharing failed. Try again')});
});
$('libFile').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  const m=libMeta();
  if(m.length>=LIB_MAX){toast(tr('File library is full'));return}
  const id='f'+Date.now();
  try{
    const c=await caches.open('qc-lib');
    await c.put('qc-lib-'+id,new Response(f,{headers:{'X-Name':encodeURIComponent(f.name),'Content-Type':f.type||'application/octet-stream'}}));
  }catch(err){toast(tr('Could not store the file'));return}
  m.push({id,name:f.name,size:f.size,type:f.type||'',savedAt:Date.now()});
  saveMeta(m);renderLib();toast(tr('File added'));
};
