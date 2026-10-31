/* notify.js — due follow-up reminders: app badge + notifications.
   Three delivery paths, best available wins:
   1. Capacitor native app: LocalNotifications fire at the exact follow-up
      time even when the app is fully closed (Android + iOS).
   2. Browser PWA on Android: exact-time notifications while open, plus
      Periodic Background Sync checks while closed.
   3. Other browsers: notifications while the app is open. */
import {$, store, state, todayStr, parseDay, dueTime, dueWhen, sar, toast} from './core.js';
import {tr} from './i18n.js';
import {isOpen, who} from './followups.js';

const NTF_KEY='qc_notify', NTF_SEEN='qc_notified', CAP_IDS='qc_cap_ntf_ids';
const timers=new Map(); /* r.full -> timeout id for exact-time reminders */
let capDenied=false; /* native: OS-level notification access is blocked */

export function dueNow(){
  const t=todayStr();
  return state.recents.filter(r=>r.due&&isOpen(r)&&r.due<=t)
    .sort((a,b)=>(a.due+dueTime(a)).localeCompare(b.due+dueTime(b)));
}
function dueAt(r){const d=parseDay(r.due),hm=dueTime(r).split(':');d.setHours(+hm[0],+hm[1],0,0);return d}

/* Capacitor bridge: present only inside the native app. */
function capLN(){return (window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.LocalNotifications)||null}
function capGranted(p){return p&&(p.display==='granted'||p.granted===true)}
function nid(full){let h=7;for(const c of full)h=(h*31+ +c)%2000000000;return 100000+(h%1000000)}

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

/* ---- Capacitor path: schedule OS-level notifications for all due items ---- */
async function capCancelAll(){
  const ln=capLN(),ids=store.get(CAP_IDS,[]);
  if(!ln||!ids.length)return;
  try{await ln.cancel({notifications:ids.map(id=>({id}))})}catch(e){}
  store.set(CAP_IDS,[]);
}
async function capSchedule(){
  const ln=capLN();if(!ln)return;
  await capCancelAll();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),items=[];
  for(const r of dueNow()){
    const at=dueAt(r).getTime();
    if(at<=now){items.push({r,at:now+1500});markSeen(r.full,r.due)} /* overdue: alert shortly after opening */
    else if(at-now<31*864e5)items.push({r,at});
  }
  if(!items.length)return;
  const ids=[];
  try{
    await ln.schedule({notifications:items.map(({r,at})=>{
      const id=nid(r.full);ids.push(id);
      return {id,title:tr('Follow-up due'),body:who(r)+(r.value?' · '+sar(r.value):'')+' · '+dueWhen(r),
        schedule:{at:new Date(at)},extra:{full:r.full}};
    })});
    store.set(CAP_IDS,ids);
  }catch(e){/* scheduling failed; badge still updates */}
}

/* ---- Web path ---- */
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

export function refreshDue(){
  refreshBadge();
  if(capLN()){capSchedule();return} /* native app handles closed-app delivery */
  checkMissed();scheduleUpcoming();
}

export function notifySupported(){
  return {native:!!capLN(),
    pbs:!!(window.ServiceWorkerRegistration&&'periodicSync'in ServiceWorkerRegistration.prototype)};
}
async function permState(){
  const ln=capLN();
  if(ln){try{return (await ln.checkPermissions()).display}catch(e){return 'prompt'}}
  return 'Notification'in window?Notification.permission:'unsupported';
}
function renderNotify(){
  const on=store.get(NTF_KEY,0)===1,el=$('ntfToggle');if(!el)return;
  const info=$('ntfInfo');
  const stBtn=$('ntfSettings');
  if(stBtn)stBtn.hidden=!(capLN()&&capDenied);
  if(!capLN()&&!'Notification'in window){info.textContent='';return}
  if(!on){info.textContent='';return}
  info.textContent=capLN()?tr('Notifications on, even when the app is closed.'):
    notifySupported().pbs?tr('Notifications on, even when the app is closed (Android).'):
    tr('Notifications on while the app is open.');
}

async function registerPbs(){
  if(capLN()||!notifySupported().pbs||Notification.permission!=='granted')return;
  try{const reg=await navigator.serviceWorker.ready;
    await reg.periodicSync.register('qc-due',{minInterval:60*60*1000});
  }catch(e){/* permission or quota denied — page-side reminders still work */}
}

export async function syncNotifyToggle(){
  const el=$('ntfToggle');if(!el)return;
  const ln=capLN();
  if(!el.checked){
    store.set(NTF_KEY,0);
    if(ln)await capCancelAll();
    renderNotify();refreshDue();return;
  }
  let granted=false;
  if(ln){
    try{const p=await ln.requestPermissions();granted=capGranted(p)}catch(e){granted=false}
  }else if('Notification'in window){
    granted=(Notification.permission==='granted'?true:await Notification.requestPermission()==='granted');
  }
  if(granted){
    capDenied=false;
    store.set(NTF_KEY,1);toast(tr('Notifications enabled'));registerPbs();
    /* In the native app, prompt once more if Android blocked exact alarms. */
    if(ln&&ln.checkExactNotificationSetting){
      try{const e=await ln.checkExactNotificationSetting();
        if(e&&e.exact_alarm&&e.exact_alarm!=='granted')toast(tr('For reminders at the exact time, allow alarms for QuickChat in phone settings.'))}catch(_){}
    }
  }else{
    el.checked=false;
    if(capLN())capDenied=true;
    toast(capLN()?tr('Notification permission denied. Enable it in phone settings (Apps → QuickChat → Notifications).'):tr('Notification permission denied. Enable it in browser settings.'));
  }
  renderNotify();refreshDue();
}

export function initNotify(){
  const el=$('ntfToggle');if(!el)return;
  el.onchange=()=>syncNotifyToggle();
  $('ntfSettings').onclick=()=>{
    const cap=window.Capacitor;
    if(cap&&cap.isNativePlatform&&cap.isNativePlatform()&&cap.Plugins&&cap.Plugins.QCOpen)
      cap.Plugins.QCOpen.openNotificationSettings().catch(()=>{});
  };
  /* Reflect the real permission state (e.g. revoked in OS settings). */
  permState().then(p=>{
    if(p==='granted'){el.checked=store.get(NTF_KEY,0)===1;capDenied=false}
    else{
      el.checked=false;
      if(capLN()&&p==='denied')capDenied=true;
      if(store.get(NTF_KEY,0)===1&&p==='denied'){store.set(NTF_KEY,0)}
    }
    renderNotify();refreshDue();
  });
  setInterval(refreshDue,60*1000);
  /* Re-check when the user comes back from the OS settings screen. */
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    refreshDue();
    permState().then(p=>{
      if(p==='granted'){el.checked=store.get(NTF_KEY,0)===1;capDenied=false}
      else if(capLN()&&p==='denied')capDenied=true;
      renderNotify();
    });
  });
}
