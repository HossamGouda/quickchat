/* version.js — app version banner ("what's new"). */
import {$, store, esc} from './core.js';
import {tr} from './i18n.js';

export const APP_VERSION='5.6';
const WHATS_NEW=['Long-press the app icon: shortcuts straight to New chat, Follow-ups, Queue or My QR','Import contacts from a CSV sheet — any extra column becomes a personal {variable} in your messages, like "Hi {name} from {city}"','Save a queue setup (list + message) as a named campaign and load it any time','File library: keep catalogues and price lists in the app and attach them with one tap','Today card on Follow-ups: due today, expiring quotes, untouched leads and this week\'s numbers at a glance','Campaign QR: turn any template into a QR that opens WhatsApp with the message ready to forward','Cloud sync (Teable) now carries every field — including company, lead source and your CSV variables','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>${esc(tr('Updated to version'))} ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
