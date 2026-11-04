/* version.js — app version banner ("what's new"). */
import {$, store, esc} from './core.js';
import {tr} from './i18n.js';

export const APP_VERSION='5.5';
const WHATS_NEW=['Delete is now instant with an Undo toast — no more confirmation pop-ups in the way','Duplicate records can be merged from any follow-up card: pick which record wins and notes & history combine automatically','New "Add stale leads" button on the Queue tab pulls in everyone quiet for 14+ days so you can re-engage them','Queue setup warns when a number was already messaged recently ("last messaged 3 d ago")','"Save my contact" QR now shares a full business card — name, company and email included','New Stats tab: outcomes, response rate, weekly activity, pipeline, lost reasons and lead sources at a glance','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>${esc(tr('Updated to version'))} ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
