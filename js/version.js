/* version.js — app version banner ("what's new"). */
import {$, store, esc} from './core.js';
import {tr} from './i18n.js';

export const APP_VERSION='5.4';
const WHATS_NEW=['The app learns what happened: after you message someone, one tap logs Sent / No reply / Replied / Interested — and offers the smart next step','Follow-up sequences: quote chase on day 3, 7 and 14 with a ready message for each step','Pipeline stages New lead → Contacted → Negotiating, lost deals ask why (price, competitor, timing…), quote validity reminders, a do-not-contact list, message variants {v:Hi|Hello}, and a daily-volume warning','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>${esc(tr('Updated to version'))} ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
