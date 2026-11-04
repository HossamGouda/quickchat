/* version.js — app version banner ("what's new"). */
import {$, store} from './core.js';

export const APP_VERSION='5.0';
const WHATS_NEW=['Queue tells the truth now: Open chat marks a contact "opened" and a Sent ✓ tap confirms it — with Undo if you slip','Skip asks why (wrong number / no answer / not interested); wrong numbers can be marked lost, and try-later skips are resumable','Build batches from your people: pasted numbers merge with saved contacts (names and status remembered), or pick them from a searchable sheet','Pace control (off / 3 / 8 / 15 s) spaces out WhatsApp opens to protect your account, with a warning on big batches','End of batch: retry skipped contacts, attach a task to the whole batch follow-up, and see last-batch + sent-this-week stats','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>Updated to version ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${x}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
