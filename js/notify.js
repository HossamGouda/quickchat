/* notify.js — due follow-up reminders: app badge, notifications while the app
   is open (exact follow-up time), and Periodic Background Sync registration so
   Android Chrome can check due follow-ups even when the app is closed. */
import {$, store, state, todayStr, parseDay, dueTime, dueWhen, sar, toast} from './core.js';
import {tr} from './i18n.js';
import {isOpen, who} from './followups.js';

const NTF_KEY='qc_notify', NTF_SEEN='qc_notified';
const timers=new Map(); /* r.full -> timeout id for exact-time reminders */

export function dueNow(){
  const t=todayStr();
  return state.recents.filter(r=>r.due&&isOpen(r)&&r.due<=t)
    .sort((a,b)=>(a.due+dueTime(a)).localeCompare(b.due+dueTime(b)));
}
function dueAt(r){const d=parseDay(r.due),hm=dueTime(r).split(':');d.setHours(+hm[0],+hm[1],0,0);return d}

/* App-icon badge with the number of due follow-ups. */
export function refreshBadge(){
  const n=dueNow().length;
  try{
    if(n&&navigator.setAppBadge)navigator.setAppBadge(n);
    else if(!n&&navigator.clearAppBadge)navigator.clearAppBadge();
  }catch(e){}
}

function seen(){return store.get(NTF_SEEN,{})}
function markSeen(full,due){const s=seen();s[full]=due;store.set(NTF_SEEN,s)}

function showNotif(r){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const n=new Notification(tr('Follow-up due'),{
    body:who(r)+(r.value?' · '+sar(r.value):'')+' · '+dueWhen(r),
    tag:'qc-'+r.full,icon:'icon-192.png',badge:'icon-192.png',dir:state.lang==='ar'?'rtl':'auto'});
  n.onclick=()=>{window.focus();n.close()};
}

/* Notify for due items whose time has passed and which we have not announced.
   Covers reminders missed while the phone slept (background timers get clamped). */
function checkMissed(){
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),s=seen();
  for(const r of dueNow()){
    if(dueAt(r).getTime()<=now&&s[r.full]!==r.due){showNotif(r);markSeen(r.full,r.due)}
  }
}

/* Exact-time reminders for future due items in the next 7 days. */
function scheduleUpcoming(){
  for(const id of timers.values())clearTimeout(id);
  timers.clear();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now();
  for(const r of dueNow()){
    const at=dueAt(r).getTime(),wait=at-now;
    if(wait>0&&wait<7*864e5)timers.set(r.full,setTimeout(()=>{markSeen(r.full,r.due);if(document.hidden)showNotif(r)},wait));
  }
}

export function refreshDue(){refreshBadge();checkMissed();scheduleUpcoming()}

export function notifySupported(){
  return {perm:'Notification'in window,pbs:!!(window.ServiceWorkerRegistration&&'periodicSync'in ServiceWorkerRegistration.prototype)};
}
function renderNotify(){
  const on=store.get(NTF_KEY,0)===1,perm=notifySupported().perm;
  const el=$('ntfToggle');if(!el)return;
  el.checked=on&&perm&&Notification.permission==='granted';
  const info=$('ntfInfo');
  if(!perm)info.textContent='';
  else if(Notification.permission==='denied')info.textContent=tr('Notification permission denied. Enable it in browser settings.');
  else if(on)info.textContent=notifySupported().pbs?tr('Notifications on, even when the app is closed (Android).'):tr('Notifications on while the app is open.');
  else info.textContent='';
}

async function registerPbs(){
  if(!notifySupported().pbs||Notification.permission!=='granted')return;
  try{const reg=await navigator.serviceWorker.ready;
    await reg.periodicSync.register('qc-due',{minInterval:60*60*1000});
  }catch(e){/* permission or quota denied — page-side reminders still work */}
}

export function initNotify(){
  const el=$('ntfToggle');if(!el)return;
  el.onchange=async()=>{
    if(!el.checked){store.set(NTF_KEY,0);renderNotify();refreshDue();return}
    if(!('Notification'in window)){toast(tr('This browser does not support notifications'));el.checked=false;return}
    const p=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(p==='granted'){store.set(NTF_KEY,1);toast(tr('Notifications enabled'));registerPbs()}
    else{el.checked=false;toast(tr('Notification permission denied. Enable it in browser settings.'))}
    renderNotify();refreshDue();
  };
  renderNotify();refreshDue();
  setInterval(refreshDue,60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDue()});
}
