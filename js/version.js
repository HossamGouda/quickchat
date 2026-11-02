/* version.js — app version banner ("what's new"). */
import {$, store} from './core.js';

export const APP_VERSION='3.9';
const WHATS_NEW=['Snooze your way: reminders can be snoozed for 1 hour, 3 hours, or until tomorrow 9:00 — from the OS notification or a new Snooze button on each due follow-up','Quiet hours: set a nightly window (default 22:00–08:00) and reminders that would fire at night wait calmly until morning','A better morning nag: follow-ups left overdue re-remind you once a day at 9:00 until you handle them, and a burst of simultaneous reminders collapses into one summary notification','Tapping a notification or a bell entry now takes you straight to that contact, and the bell gained All / Due / Sync / Other filters','The Android app re-posts a reminder nudge after the phone reboots, so scheduled alarms are never lost silently','Arabic covers every new string, as always'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>Updated to version ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.8'?WHATS_NEW.slice(0,3):WHATS_NEW).map(x=>`<li>${x}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
