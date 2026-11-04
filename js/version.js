/* version.js — app version banner ("what's new"). */
import {$, store, esc} from './core.js';
import {tr} from './i18n.js';

export const APP_VERSION='5.7';
const WHATS_NEW=['A full interface polish pass: the tab bar, Stats and the follow-up card all got cleaner layouts','New Appearance setting: force Light or Dark, or follow the system','Stats tab fixed: "Messaged" now counts everyone you actually messaged, and tapping a weekly bar shows that week\'s numbers','A "today" strip on the Chat tab: due follow-ups, expiring quotes and new leads at a glance — tap to jump','Arabic translation sweep closed every remaining untranslated string, and switching language re-renders Stats correctly now'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>${esc(tr('Updated to version'))} ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
