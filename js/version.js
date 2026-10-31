/* version.js — app version banner ("what's new"). */
import {$, store} from './core.js';

export const APP_VERSION='3.4';
const WHATS_NEW=['Cloud sync is smarter: it tells you when another device changed your data, syncs your settings (QR text, country, app, queue drafts), and a Restore button rebuilds this phone from Teable','A 6-month win-rate trend now sits under the pipeline stats','PIN lock: require a 4-digit code to open the app — it locks itself when you leave it (enable in Backup)','Arabic is now complete for sync, notifications, the PIN lock and every pop-up message','Due reminders: notifications at the follow-up time, a due-count badge on the icon, and background checks on Android — enable in Backup','Cloud sync: your contacts and templates stay mirrored to Teable so any device stays up to date','Follow-ups: pick the exact time, and write the message to send in advance','Follow-ups: quote value, notes and history for each contact','Pipeline totals: open quotes, won this month, win rate','Filter contacts by status, and search notes','Back up to Google Drive in one tap, and export contacts to Excel','Share a PDF quotation into QuickChat and pass it to the chat','Arabic interface (tap العربية at the top)'];
export function renderWhatsNew(){
  const el=$('whatsNew'),seen=store.get('qc_ver','');
  if(seen===APP_VERSION||!store.get('qc_seen',false)){store.set('qc_ver',APP_VERSION);el.hidden=true;return}
  el.innerHTML=`<div class="qhead"><span><b>Updated to version ${APP_VERSION}</b></span><button type="button" class="btn small" id="wnOk">OK</button></div><ul class="steps">${(seen==='3.3'?WHATS_NEW.slice(0,2):WHATS_NEW).map(x=>`<li>${x}</li>`).join('')}</ul>`;
  el.hidden=false;
  $('wnOk').onclick=()=>{store.set('qc_ver',APP_VERSION);el.hidden=true};
}
