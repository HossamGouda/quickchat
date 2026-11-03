/* version.js — app version banner ("what's new"). */
import {$, store} from './core.js';

export const APP_VERSION='4.0';
const WHATS_NEW=['Follow-ups are for anything now, not just deals: a task line ("get the test certificate from QC"), create one for anyone straight from your phone book, and Done offers a "Next step…" that chains the follow-up to the client','Recurring follow-ups: set "every week" (or 3 days / 2 weeks / monthly) and Done automatically schedules the next one','Due list is grouped — Overdue / Today / Tomorrow / Later this week — with batch Select: snooze many to tomorrow, mark many done, or set one date for all','Snooze any reminder to a custom date and time; mute reminders per contact; undo Done and status changes; call or copy a number from the contact card','Follow-ups done in the last 7 days now sit in the stats strip, and the Android app fires reminders at the exact due time even for future dates','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>Updated to version ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${x}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
