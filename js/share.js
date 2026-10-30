/* share.js — shared file (PDF / image) hand-off to WhatsApp. */
import {$, esc, fmtSize, toast} from './core.js';

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
