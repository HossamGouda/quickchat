/* version.js — app version banner ("what's new"). */
import {$, store} from './core.js';

export const APP_VERSION='5.1';
const WHATS_NEW=['Contact picking is fixed and unified: "Add from your people" and the follow-up contact icon now open the same sheet with two sources — your phone contacts (in the app) and your QuickChat people — pick one or many','On the website the phone-book source now says plainly that it needs the Android app, instead of doing nothing','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>Updated to version ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${x}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
