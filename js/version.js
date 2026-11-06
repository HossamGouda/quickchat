/* version.js — app version banner ("what's new"). */
import {$, store, esc} from './core.js';
import {tr} from './i18n.js';

export const APP_VERSION='6.0';
const WHATS_NEW=['Multiple inquiries per contact: track separate quotes and deals on one number, and switch between them with chips on the contact card','Sync protocol v4: inquiries travel with cloud sync — sync once on each device after updating','The contact card shows an inquiry chip row; history can be filtered per inquiry or shown for all'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>${esc(tr('Updated to version'))} ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
