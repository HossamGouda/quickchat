/* notify.js — due follow-up reminders: app badge + notifications.
   Three delivery paths, best available wins:
   1. Capacitor native app: LocalNotifications fire at the exact follow-up
      time even when the app is fully closed (Android + iOS).
   2. Browser PWA on Android: exact-time notifications while open, plus
      Periodic Background Sync checks while closed.
   3. Other browsers: notifications while the app is open.
   Engine extras (v3.9): snooze 1h / 3h / tomorrow, quiet hours, one summary
   for simultaneous bursts, a once-a-day re-nag for overdue follow-ups. */
import {$, store, state, todayStr, parseDay, dueTime, dueWhen, sar, toast, notifyEvent} from './core.js';
import {tr} from './i18n.js';
import {isOpen, who} from './followups.js';
import {hasOpenInq} from './inq.js';
import {applyQuiet, snoozeUntilMs, snoozeUntilParts, nextNagMs, groupAlerts} from './ntfutil.js';

const NTF_KEY='qc_notify', NTF_SEEN='qc_notified', CAP_IDS='qc_cap_ntf_ids';
const NTF_LEAD='qc_ntf_lead', SNOOZE='qc_snoozed', NTF_NOTE='qc_ntf_note', NTF_JUMP='qc_ntf_jump';
const QUIET='qc_quiet', NAG='qc_nag';
const ACT_TYPE='qc-followup';
const timers=new Map(); /* r.full -> timeout id for exact-time reminders */
let capDenied=false; /* native: OS-level notification access is blocked */

export function dueNow(){
  const t=todayStr();
  return state.recents.filter(r=>r.due&&hasOpenInq(r)&&!r.muted&&r.due<=t)
    .sort((a,b)=>(a.due+dueTime(a)).localeCompare(b.due+dueTime(b)));
}
function dueAt(r){const d=parseDay(r.due),hm=dueTime(r).split(':');d.setHours(+hm[0],+hm[1],0,0);return d}

/* ---- Reminder lead time: when the OS should alert relative to the follow-up ---- */
function leadMs(){const v=store.get(NTF_LEAD,'exact');return v==='m30'?18e4:v==='h1'?36e5:0}
/* Quiet hours: alerts landing inside the window shift to its end. */
export function quietCfg(){
  const q=store.get(QUIET,{on:1,from:'22:00',to:'08:00'});
  return {on:q.on!==0&&q.on!==false&&q.on!==undefined,
    from:/^\d\d:\d\d$/.test(q.from||'')?q.from:'22:00',
    to:/^\d\d:\d\d$/.test(q.to||'')?q.to:'08:00'};
}
/* Absolute alert time for a follow-up; quiet hours applied; never claims the past. */
function notifyTimeRaw(r){
  const d=parseDay(r.due);
  if(store.get(NTF_LEAD,'exact')==='morning'){d.setHours(9,0,0,0);if(d.getTime()>Date.now())return d.getTime()}
  const q=quietCfg();
  return applyQuiet(dueAt(r).getTime()-leadMs(),q.from,q.to);
}
function snoozed(){return store.get(SNOOZE,{})}
function snid(full){return 10000000+(nid(full)-100000)} /* separate id for one-off re-alerts */
function nags(){return store.get(NAG,{})}

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

/* ---- Snooze (v3.9): 1 hour / 3 hours / tomorrow 9:00 + custom date (v4.0) ---- */
function snoozeLabel(kind){return kind==='h3'?tr('Snoozed for 3 hours'):kind==='morning'?tr('Snoozed until tomorrow 9:00'):tr('Snoozed for 1 hour')}
/* Record the snooze and schedule the re-alert; works for OS-action,
   in-app and custom-date calls. `label` feeds the toast/bell entry. */
export async function userSnoozeUntil(full,until,label){
  const r=state.recents.find(x=>x.full===full);if(!r)return;
  const q=quietCfg();
  until=applyQuiet(until,q.from,q.to);
  const sz=snoozed();sz[full]=until;store.set(SNOOZE,sz);
  /* A snooze cancels today's re-nag bookkeeping for this contact. */
  const ln=capLN();
  if(ln){
    try{
      await capRegisterActions();
      await capEnsureChannel();
      await ln.cancel({notifications:[{id:nid(full)},{id:snid(full)}]});
      await ln.schedule({notifications:[{id:snid(full),
        title:tr('Follow-up due')+': '+who(r),
        body:(label?label+' · ':'')+(r.value?sar(r.value)+' · ':'')+dueWhen(r),
        schedule:{at:new Date(until)},extra:{full:r.full},
        actionTypeId:ACT_TYPE,channelId:'followups',smallIcon:'ic_stat_notify'}]});
    }catch(e){}
  }
  refreshDue();
  store.set(NTF_NOTE,label);
  notifyEvent('due',label+': '+who(r),{tab:'fu',full:r.full});
}
export async function userSnooze(full,kind){
  return userSnoozeUntil(full,snoozeUntilMs(kind),snoozeLabel(kind));
}
/* Bottom-sheet snooze picker, opened from the due-row Snooze button. */
function snoozeSheet(full){
  closeSnoozeSheet();
  const r=state.recents.find(x=>x.full===full);if(!r)return;
  const back=document.createElement('div');back.className='qc-sheet-back';
  const sheet=document.createElement('div');sheet.className='qc-sheet';sheet.setAttribute('role','menu');
  const mk=(kind,label)=>{
    const b=document.createElement('button');b.type='button';b.className='qc-sheet-item';b.textContent=tr(label);
    b.onclick=()=>{closeSnoozeSheet();userSnooze(full,kind)};return b;
  };
  sheet.appendChild(mk('h1','Snooze 1 hour'));
  sheet.appendChild(mk('h3','Snooze 3 hours'));
  sheet.appendChild(mk('morning','Snooze until tomorrow 9:00'));
  /* F2: custom date & time, expanded inline. */
  const custom=document.createElement('button');custom.type='button';custom.className='qc-sheet-item';custom.textContent=tr('Pick date & time…');
  const area=document.createElement('div');area.className='qc-snooze-custom';area.hidden=true;
  const dIn=document.createElement('input');dIn.type='date';dIn.min=todayStr();dIn.className='txt';dIn.setAttribute('aria-label',tr('Date'));
  const tIn=document.createElement('input');tIn.type='time';tIn.className='txt';tIn.setAttribute('aria-label',tr('Time'));
  const ok=document.createElement('button');ok.type='button';ok.className='btn primary';ok.textContent=tr('Snooze until then');
  ok.onclick=()=>{
    const until=snoozeUntilParts(dIn.value,tIn.value);
    if(!until){toast(tr('Pick a future date and time'));return}
    closeSnoozeSheet();
    const q=quietCfg();
    const lbl=tr(`Snoozed until ${new Date(until).toLocaleDateString(state.lang==='ar'?'ar-u-ca-gregory-nu-latn':'en-GB',{weekday:'short',day:'numeric',month:'short'})} ${tIn.value||'09:00'}`);
    userSnoozeUntil(full,until,lbl);
  };
  area.appendChild(dIn);area.appendChild(tIn);area.appendChild(ok);
  custom.onclick=()=>{area.hidden=!area.hidden;if(!area.hidden)dIn.focus()};
  sheet.appendChild(custom);sheet.appendChild(area);
  const cx=document.createElement('button');cx.type='button';cx.className='qc-sheet-item cancel';cx.textContent=tr('Cancel');
  cx.onclick=closeSnoozeSheet;sheet.appendChild(cx);
  back.appendChild(sheet);
  back.onclick=e=>{if(e.target===back)closeSnoozeSheet()};
  document.body.appendChild(back);
}
function closeSnoozeSheet(){const b=document.querySelector('.qc-sheet-back');if(b)b.remove()}

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
    body:(r.task?r.task+' · ':'')+(r.value?sar(r.value)+' · ':'')+dueWhen(r)+(note?' · '+note:''),
    schedule:{at:new Date(at)},extra:Object.assign({full:r.full},extra),
    actionTypeId:ACT_TYPE,channelId:'followups',smallIcon:'ic_stat_notify'};
}
function capSummaryNtf(items,at){
  const names=items.slice(0,3).map(r=>who(r)).join(', ');
  return {id:424242,
    title:tr('Follow-ups due')+': '+items.length,
    body:names+(items.length>3?'…':'')+' — '+tr('tap to open'),
    schedule:{at:new Date(at)},extra:{tab:'fu'},
    channelId:'followups',smallIcon:'ic_stat_notify'};
}
async function capRegisterActions(){
  const ln=capLN();if(!ln||!ln.registerActionTypes)return;
  try{await ln.registerActionTypes({types:[{id:ACT_TYPE,actions:[
    {id:'done',title:tr('Mark done')},
    {id:'snooze1h',title:tr('Snooze 1 hour')},
    {id:'snzMorning',title:tr('Tomorrow 9:00')}]}]})}catch(e){}
}
/* Our notifications declare channelId 'followups'; Android drops them if the
   channel was never created. Idempotent — safe to call before every schedule. */
async function capEnsureChannel(){
  const ln=capLN();if(!ln||!ln.createChannel)return;
  try{await ln.createChannel({id:'followups',name:tr('Follow-ups'),
    importance:4,visibility:1,vibration:true,lights:true})}catch(e){}
}
/* Follow-ups due before today that are still open: re-nag once per day at 9:00. */
function nagList(){
  const t=todayStr(),sz=snoozed(),ng=nags(),now=Date.now(),out=[];
  for(const r of dueNow()){
    if(r.due>=t)continue;          /* only overdue, not due-today */
    if(sz[r.full]>now)continue;    /* snoozed */
    if(ng[r.full]===t)continue;    /* already nagged today */
    out.push(r);
  }
  return out;
}
async function capSchedule(){
  const ln=capLN();if(!ln)return;
  await capCancelAll();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),dueItems=[],futureItems=[],sz=snoozed(),ng=nags(),oneOffs=[];
  const q=quietCfg();
  for(const r of dueNow()){
    if(sz[r.full]>now)continue; /* snoozed: its own one-off is scheduled separately */
    let at=notifyTimeRaw(r);
    if(at<=now){at=now+1500;markSeen(r.full,r.due)} /* overdue: alert shortly after opening */
    if(at-now<31*864e5)dueItems.push({r,at});
  }
  /* F11: future due dates get their own exact-time alarm, so a follow-up
     scheduled for Thursday 14:00 fires Thursday 14:00 even if the app
     hasn't been opened since Monday. Replaced by id on every refresh.
     Burst-summary grouping applies to due-now items only. */
  const future=state.recents.filter(r=>r.due&&hasOpenInq(r)&&!r.muted&&r.due>todayStr()&&r.due<=todayStr(14));
  for(const r of future){
    if(sz[r.full]>now)continue;
    const at=notifyTimeRaw(r);
    if(at>now)futureItems.push({r,at});
  }
  /* Re-nag for still-overdue follow-ups: one re-alert per day, at the next 9:00. */
  for(const r of nagList()){
    ng[r.full]=todayStr();store.set(NAG,ng);
    const at=applyQuiet(nextNagMs(),q.from,q.to);
    oneOffs.push({id:snid(r.full),r,at});
  }
  const scheduled=[];
  try{
    await capRegisterActions();
    await capEnsureChannel();
    if(dueItems.length>3){
      /* Burst: one summary notification instead of a wall of alerts. */
      const g=groupAlerts(dueItems.map(i=>({full:i.r.full,at:i.at})));
      const n=capSummaryNtf(dueItems.map(i=>i.r),g.at);
      await ln.schedule({notifications:[n]});scheduled.push(n.id);
      for(const i of dueItems)markSeen(i.r.full,i.r.due);
    }else if(dueItems.length){
      await ln.schedule({notifications:dueItems.map(({r,at})=>{
        const n=capNtf(r,at);scheduled.push(n.id);return n;
      })});
    }
    if(futureItems.length){
      await ln.schedule({notifications:futureItems.map(({r,at})=>{
        const n=capNtf(r,at);scheduled.push(n.id);return n;
      })});
    }
    if(oneOffs.length){
      await ln.schedule({notifications:oneOffs.map(({id,r,at})=>({id,
        title:tr('Still waiting')+': '+who(r),
        body:tr('Follow-up is overdue')+' · '+(r.value?sar(r.value)+' · ':'')+dueWhen(r),
        schedule:{at:new Date(at)},extra:{full:r.full},
        actionTypeId:ACT_TYPE,channelId:'followups',smallIcon:'ic_stat_notify'}))});
      for(const o of oneOffs)scheduled.push(o.id);
    }
    store.set(CAP_IDS,scheduled);
  }catch(e){/* scheduling failed; badge still updates */}
}
/* Notification action: mark the follow-up done without opening the app.
   The FU logic (recurrence, undo bookkeeping, next due) lives in
   followups.js — completed via the qc:done event so web and native share
   exactly one completion path. */
export function capDone(full){
  document.dispatchEvent(new CustomEvent('qc:done',{detail:full}));
  const ln=capLN();if(ln){const id=nid(full);ln.cancel({notifications:[{id},{id:snid(full)}]}).catch(()=>{})}
  const sz=snoozed();if(sz[full]){delete sz[full];store.set(SNOOZE,sz)}
  const ng=nags();if(ng[full]){delete ng[full];store.set(NAG,ng)}
  store.set(NTF_NOTE,tr('Follow-up done'));
  const r=state.recents.find(x=>x.full===full);
  notifyEvent('ok',tr('Follow-up done')+(r?': '+who(r):''),{tab:'fu',full});
  refreshDue();
}

/* ---- Web path ---- */
function showNotif(r){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const n=new Notification(tr('Follow-up due'),{
    body:(r.task?r.task+' · ':'')+who(r)+(r.value?' · '+sar(r.value):'')+' · '+dueWhen(r),
    tag:'qc-'+r.full,icon:'icon-192.png',badge:'icon-192.png',dir:state.lang==='ar'?'rtl':'auto'});
  n.onclick=()=>{window.focus();n.close();jumpToContact(r.full)};
}
function showSummaryNotif(items){
  if(!('Notification'in window)||Notification.permission!=='granted')return;
  const names=items.slice(0,3).map(r=>who(r)).join(', ');
  const n=new Notification(tr('Follow-ups due')+': '+items.length,{
    body:names+(items.length>3?'…':'')+' — '+tr('tap to open'),
    tag:'qc-due-summary',icon:'icon-192.png',badge:'icon-192.png',dir:state.lang==='ar'?'rtl':'auto'});
  n.onclick=()=>{window.focus();n.close();jumpToContact('')};
}
/* Open (or refocus) the Follow-ups tab on a specific contact card. */
export function jumpToContact(full){
  document.dispatchEvent(new CustomEvent('qc:nav',{detail:'fu'}));
  if(full)document.dispatchEvent(new CustomEvent('qc:open-contact',{detail:full}));
}

/* Notify for due items whose time has passed and which we have not announced.
   Covers reminders missed while the phone slept (background timers get clamped). */
function checkMissed(){
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),s=seen(),sz=snoozed(),missed=[];
  for(const r of dueNow()){
    if(sz[r.full]>now)continue; /* snoozed */
    if(notifyTimeRaw(r)<=now&&s[r.full]!==r.due)missed.push(r);
  }
  if(missed.length>3){showSummaryNotif(missed);for(const r of missed)markSeen(r.full,r.due)}
  else for(const r of missed){showNotif(r);markSeen(r.full,r.due)}
  if(missed.length)for(const r of missed)notifyEvent('due',tr('Follow-up due')+': '+who(r),{tab:'fu',full:r.full,read:true});
  /* Once-a-day re-nag for overdue follow-ups (web path). */
  const ng=nags(),t=todayStr(),fresh=[];
  for(const r of nagList()){
    ng[r.full]=t;fresh.push(r);
    notifyEvent('due',tr('Still waiting')+': '+who(r),{tab:'fu',full:r.full});
  }
  if(fresh.length)store.set(NAG,ng);
}

/* Exact-time reminders for future due items in the next 7 days,
   plus wake-ups for snoozed items whose snooze has expired. */
function scheduleUpcoming(){
  for(const id of timers.values())clearTimeout(id);
  timers.clear();
  if(store.get(NTF_KEY,0)!==1)return;
  const now=Date.now(),sz=snoozed();
  for(const r of dueNow()){
    if(sz[r.full]>now){
      /* Snoozed: one timer at the snooze end re-fires the reminder. */
      const wait=sz[r.full]-now;
      if(wait<7*864e5)timers.set(r.full,setTimeout(()=>{if(document.hidden)showNotif(r)},wait));
      continue;
    }
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
        if(e&&e.exact_alarm&&e.exact_alarm!=='granted')toast(tr('For reminders at the exact time, allow alarms for QuickChat in phone settings.'))}catch(_){}}
  }else{
    el.checked=false;
    if(capLN())capDenied=true;
    toast(capLN()?tr('Notification permission denied. Enable it in phone settings (Apps → QuickChat → Notifications).'):tr('Notification permission denied. Enable it in browser settings.'));
  }
  renderNotify();refreshDue();
}

/* Quiet-hours controls in Settings → Reminders. */
function initQuiet(){
  const tg=$('quietToggle');if(!tg)return;
  const from=$('quietFrom'),to=$('quietTo');
  const cfg=quietCfg();
  tg.checked=cfg.on;
  if(from)from.value=cfg.from;
  if(to)to.value=cfg.to;
  const save=()=>{
    store.set(QUIET,{on:tg.checked?1:0,from:from&&/^\d\d:\d\d$/.test(from.value)?from.value:'22:00',
      to:to&&/^\d\d:\d\d$/.test(to.value)?to.value:'08:00'});
    refreshDue();
  };
  tg.onchange=save;
  if(from)from.onchange=save;
  if(to)to.onchange=save;
}

export function initNotify(){
  const el=$('ntfToggle');if(!el)return;
  el.onchange=()=>syncNotifyToggle();
  const lead=$('ntfLead');
  if(lead){
    lead.value=store.get(NTF_LEAD,'exact');
    lead.onchange=()=>{store.set(NTF_LEAD,lead.value);refreshDue()};
  }
  initQuiet();
  /* Due-row Snooze button (followups.js dispatches qc:snz, avoiding an import cycle). */
  document.addEventListener('qc:snz',e=>snoozeSheet(e.detail));
  $('ntfSettings').onclick=()=>{
    const cap=window.Capacitor;
    if(cap&&cap.isNativePlatform&&cap.isNativePlatform()&&cap.Plugins&&cap.Plugins.QCOpen)
      cap.Plugins.QCOpen.openNotificationSettings().catch(()=>{});
  };
  /* Native: handle notification actions (works even if the OS started the app cold). */
  const ln=capLN();
  if(ln&&ln.addListener){
    try{
      ln.addListener('localNotificationActionPerformed',a=>{
        const extra=(a.notification&&a.notification.extra)||{};
        const full=extra.full||'';
        if(a.actionId==='done'&&full)capDone(full);
        else if(a.actionId==='snooze1h'&&full)userSnooze(full,'h1');
        else if(a.actionId==='snzMorning'&&full)userSnooze(full,'morning');
        else if(extra.tab==='fu')store.set(NTF_JUMP,'');
        else if(full){store.set(NTF_JUMP,full);store.set(NTF_NOTE,tr('Follow-up due')+': '+(state.recents.find(x=>x.full===full)?who(state.recents.find(x=>x.full===full)):full))}
      });
    }catch(e){}
    /* Cold start from a notification tap: land on the contact. */
    const jump=store.get(NTF_JUMP,'');
    if(jump){
      store.set(NTF_JUMP,'');
      setTimeout(()=>jumpToContact(jump),700);
    }
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
