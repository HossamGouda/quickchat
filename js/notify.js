/* notify.js — due follow-up reminders: app badge + notifications.
   Three delivery paths, best available wins:
   1. Capacitor native app: LocalNotifications fire at the exact follow-up
      time even when the app is fully closed (Android + iOS).
   2. Browser PWA on Android: exact-time notifications while open, plus
      Periodic Background Sync checks while closed.
   3. Other browsers: notifications while the app is open. */
import {$, store, state, todayStr, parseDay, dueTime, dueWhen, sar, toast, notifyEvent} from './core.js';
import {tr} from './i18n.js';
import {isOpen, who, setDueVal} from './followups.js';

const NTF_KEY='qc_notify', NTF_SEEN='qc_notified', CAP_IDS='qc_cap_ntf_ids';
const NTF_LEAD='qc_ntf_lead', SNOOZE='qc_snoozed', NTF_NOTE='qc_ntf_note';
const ACT_TYPE='qc-followup';
const timers=new Map(); /* r.full -> timeout id for exact-time reminders */
let capDenied=false; /* native: OS-level notification access is blocked */

export function dueNow(){
  const t=todayStr();
  return state.recents.filter(r=>r.due&&isOpen(r)&&r.due<=t)
    .sort((a,b)=>(a.due+dueTime(a)).localeCompare(b.due+dueTime(b)));
}
function dueAt(r){const d=parseDay(r.due),hm=dueTime(r).split(':');d.setHours(+hm[0],+hm[1],0,0);return d}

/* ---- Reminder lead time: when the OS should alert relative to the follow-up ---- */
function leadMs(){const v=store.get(NTF_LEAD,'exact');return v==='m30'?18e4:v==='h1'?36e5:0}
/* Absolute alert time for a follow-up; never claims the past. */
function notifyTimeRaw(r){
  const d=parseDay(r.due);
  if(store.get(NTF_LEAD,'exact')==='morning'){d.setHours(9,0,0,0);if(d.getTime()>Date.now())return d.getTime()}
  return dueAt(r).getTime()-leadMs();
}
function snoozed(){return store.get(SNOOZE,{})}
function snid(full){return 10000000+(nid(full)-100000)} /* separate id for the snooze one-off */

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
function capNtf(r,at,extra){
  const note=(r.note||'').slice(0,80);
  return {id:nid(r.full),title:tr('Follow-up due')+': '+who(r),
    body:(r.value?sar(r.value)+' · ':'')+dueWhen(r)+(note?' · '+note:''),
    schedule:{at:new Date(at)},extra:Object.assign({full:r.full},extra),
    actionTypeId:ACT_TYPE,channelId:'followups',smallIcon:'ic_stat_notify'};
}
async function capRegisterActions(){
  const ln=capLN();if(!ln||!ln.registerActionTypes)return;
  try{await ln.registerActionTypes({types:[{id:ACT_TYPE,actions:[
    {id:'done',title:tr('Mark done')},
    {id:'snooze',title:tr('Snooze 1 hour')}]}]})}catch(e){}
}
/* Our notifications declare channelId 'followups'; Android drops them if the
   channel was never created. Idempotent — safe to call before every schedule. */
async function capEnsureChannel(){
  const ln=capLN();if(!ln||!ln.createChannel)return;
  try{await ln.createChannel({id:'followups',name:tr('Follow-ups'),
    importance:4,visibility:1,vibration:true,lights:true})}catch(e){}
}
async function capSchedule(){
  const ln=capLN();if(!ln)return;
  await capCancelAll();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),items=[],sz=snoozed();
  for(const r of dueNow()){
    if(sz[r.full]>now)continue; /* snoozed: its own one-off is scheduled separately */
    let at=notifyTimeRaw(r);
    if(at<=now){at=now+1500;markSeen(r.full,r.due)} /* overdue: alert shortly after opening */
    if(at-now<31*864e5)items.push({r,at});
  }
  if(!items.length)return;
  const ids=[];
  try{
    await capRegisterActions();
    await capEnsureChannel();
    await ln.schedule({notifications:items.map(({r,at})=>{
      const n=capNtf(r,at);ids.push(n.id);return n;
    })});
    store.set(CAP_IDS,ids);
  }catch(e){/* scheduling failed; badge still updates */}
}
/* Notification action: mark the follow-up done without opening the app. */
export function capDone(full){
  const r=state.recents.find(x=>x.full===full);if(!r)return;
  setDueVal(r,'');store.set('qc_recents',state.recents);
  const ln=capLN();if(ln){const id=nid(full);ln.cancel({notifications:[{id},{id:snid(full)}]}).catch(()=>{})}
  const sz=snoozed();if(sz[full]){delete sz[full];store.set(SNOOZE,sz)}
  store.set(NTF_NOTE,tr('Follow-up done'));
  notifyEvent('ok',tr('Follow-up done')+': '+who(r),{tab:'fu'});
  refreshDue();
}
/* Notification action: re-alert one hour from now. */
async function capSnooze(full){
  const r=state.recents.find(x=>x.full===full);if(!r)return;
  const ln=capLN();if(!ln)return;
  const until=Date.now()+36e5;
  const sz=snoozed();sz[r.full]=until;store.set(SNOOZE,sz);
  try{
    await capRegisterActions();
    await capEnsureChannel();
    await ln.cancel({notifications:[{id:nid(r.full)}]});
    await ln.schedule({notifications:[{id:snid(r.full),
      title:tr('Follow-up due')+': '+who(r),
      body:tr('Snoozed')+' · '+(r.value?sar(r.value)+' · ':'')+dueWhen(r),
      schedule:{at:new Date(until)},extra:{full:r.full},
      actionTypeId:ACT_TYPE,channelId:'followups',smallIcon:'ic_stat_notify'}]});
  }catch(e){}
  store.set(NTF_NOTE,tr('Follow-up snoozed for 1 hour'));
  notifyEvent('due',tr('Follow-up snoozed for 1 hour')+': '+who(r),{tab:'fu'});
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
    if(notifyTimeRaw(r)<=now&&s[r.full]!==r.due){
      showNotif(r);markSeen(r.full,r.due);
      notifyEvent('due',tr('Follow-up due')+': '+who(r),{tab:'fu'});
    }
  }
}

/* Exact-time reminders for future due items in the next 7 days. */
function scheduleUpcoming(){
  for(const id of timers.values())clearTimeout(id);
  timers.clear();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now();
  for(const r of dueNow()){
    const wait=notifyTimeRaw(r)-now;
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
  const lead=$('ntfLead');
  if(lead){
    lead.value=store.get(NTF_LEAD,'exact');
    lead.onchange=()=>{store.set(NTF_LEAD,lead.value);refreshDue()};
  }
  $('ntfSettings').onclick=()=>{
    const cap=window.Capacitor;
    if(cap&&cap.isNativePlatform&&cap.isNativePlatform()&&cap.Plugins&&cap.Plugins.QCOpen)
      cap.Plugins.QCOpen.openNotificationSettings().catch(()=>{});
  };
  /* Native: handle notification action buttons (works even if the OS started the app cold). */
  const ln=capLN();
  if(ln&&ln.addListener){
    try{
      ln.addListener('localNotificationActionPerformed',a=>{
        const full=a.notification&&a.notification.extra&&a.notification.extra.full;if(!full)return;
        if(a.actionId==='done')capDone(full);
        else if(a.actionId==='snooze')capSnooze(full);
      });
    }catch(e){}
    /* Surface the result of an action taken while the app was closed. */
    const note=store.get(NTF_NOTE,'');
    if(note){store.set(NTF_NOTE,'');setTimeout(()=>toast(note,{type:'ok'}),800)}
    /* Without the exact-alarm special access, reminders only fire loosely and
       the OS may refuse them entirely. Ask once, then leave it to Settings. */
    try{
      ln.checkExactNotificationSetting&&ln.checkExactNotificationSetting().then(e=>{
        if(e&&e.exact_alarm&&e.exact_alarm!=='granted'&&!store.get('qc_exact_prompted')){
          store.set('qc_exact_prompted',1);
          toast(tr('For reminders at the exact time, allow alarms for QuickChat in phone settings.'));
          setTimeout(()=>{try{ln.changeExactNotificationSetting&&ln.changeExactNotificationSetting()}catch(_){}},1200);
        }
      });
    }catch(_){}
  }
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
