/* followups.js — follow-up reminders, deal statuses, contact card, and pipeline stats.
   v4.0: task-first general follow-ups (not only quotations), recurring intervals,
   undo, grouped due list, batch actions, per-contact reminder mute, next-step chains. */
import {$, store, state, STATUSES, ST_LABEL, esc, logEv, toast, normalize,
  ago, todayStr, parseDay, dayDiff, fmtDay, fmtShort, dueTime, dueWhen, dueLow, sar,
  OUT_LBL, OUTCOMES, LOST_REASONS, LOST_LBL} from './core.js';
import {tr} from './i18n.js';
import {loadRecent, saveRecents} from './recents.js';
import {useTemplate} from './templates.js';
import {renderBk} from './backup.js';
import {setTab} from './tabs.js';
import {pickContact} from './contacts.js';
import {nextRepeatDue} from './ntfutil.js';
import {seqPlan, SEQ_LBL, lastOutcomeStreak} from './qutil.js';
import {addTombstone} from './tombstones.js';
import {renderTodayMini} from './stats.js';

export function isOpen(r){return r.status!=='won'&&r.status!=='lost'}
export function who(r){return r.label||('+'+(r.code?r.code+' '+r.local:r.full))}
function findFuTpl(){return state.tpls.find(t=>/follow|متابع/i.test(t.title))||null}
function lastStatusTime(r,s){const l=(r.log||[]).filter(x=>x.e==='status'&&x.v===s).pop();return l?l.t:r.at}

/* ---- Repeat intervals (F1) ---- */
export const REPEAT_LBL={d3:'Every 3 days',w1:'Every week',w2:'Every 2 weeks',m1:'Every month'};

export function setStatus(r,s){
  const snap={due:r.due,dueTime:dueTime(r),status:r.status||''};
  if((r.status||'')===s)return;r.status=s;r._lu=Date.now();logEv(r,'status',s);
  if(s!=='lost')delete r.lostWhy;
  if(s==='won'||s==='lost')r.seq=null;
  if((s==='won'||s==='lost')&&r.due){r.due='';toast(`Marked ${ST_LABEL[s]}. Follow-up cleared`,{action:undoAction(r,snap)})}
}
export function setDueVal(r,ds){if((r.due||'')===ds)return;r.due=ds;r._lu=Date.now();logEv(r,ds?'due':'done',ds)}
export function cycleStatus(r){
  if(!r)return;
  const prev={status:r.status||'',due:r.due,dueTime:dueTime(r)};
  setStatus(r,STATUSES[(STATUSES.indexOf(r.status||'')+1)%STATUSES.length]);
  store.set('qc_recents',state.recents);
  if(r.status!==prev.status)toast(`Status: ${ST_LABEL[r.status]}`,{action:{label:tr('Undo'),fn:()=>{Object.assign(r,{status:prev.status,due:prev.due,dueTime:prev.dueTime});r._lu=Date.now();store.set('qc_recents',state.recents);renderFollowups()}}});
}
/* F4: snapshot-based undo action for toasts shown after a mutation. */
function undoAction(r,snap){
  snap=snap||{due:r.due,dueTime:dueTime(r),status:r.status||''};
  return {label:tr('Undo'),fn:()=>{Object.assign(r,{due:snap.due,dueTime:snap.dueTime,status:snap.status});r._lu=Date.now();saveRecents();renderFollowups();renderFuPrompt();renderBk()}};
}

/* F0/F1: the one completion path for web rows, the card, batch actions and
   the native notification "Mark done" action (which dispatches qc:done).
   Repeat intervals schedule the next due date automatically. */
export function completeFollowUp(r,opts){
  opts=opts||{};
  if(!r||!r.due)return;
  const snap={due:r.due,dueTime:dueTime(r),status:r.status||''};
  setDueVal(r,'');
  const repeating=r.fuRepeat&&REPEAT_LBL[r.fuRepeat];
  if(repeating){
    const nd=nextRepeatDue(todayStr(),r.fuRepeat);
    if(nd){setDueVal(r,nd);logEv(r,'repeat',REPEAT_LBL[r.fuRepeat])}
  }
  /* O3: an active sequence schedules the next chase step with its message. */
  let seqNext=null;
  if(r.seq&&r.seq.k){
    seqNext=seqPlan(r.seq.k,(r.seq.step||0)+1,todayStr());
    if(seqNext){
      r.seq.step=(r.seq.step||0)+1;
      setDueVal(r,seqNext.due);
      r.fuMsg=seqNext.msg;
      logEv(r,'seq',tr(`Step ${r.seq.step} of ${seqNext.total}`));
    }else r.seq=null;
  }
  saveRecents();
  if(!opts.silent){
    const msg=seqNext?tr(`Chase step ${r.seq.step} done — next: ${dueLow(r.due)}`):repeating?tr(`Follow-up done — next: ${dueLow(r.due)}`):tr('Follow-up done');
    /* One action slot: recurrence/sequences offer the next-step chain, one-offs offer undo. */
    const chain=repeating||seqNext;
    const action=chain?{label:tr('Next step…'),fn:()=>openFuSheet({task:r.task||''})}:undoAction(r,snap);
    toast(msg,{type:'ok',action});
  }
  renderFollowups();renderFuPrompt();renderBk();
}
document.addEventListener('qc:done',e=>{
  const r=state.recents.find(x=>x.full===e.detail);if(!r)return;
  completeFollowUp(r);
});

function stChip(r){return `<button type="button" class="chipst${r.status?' st-'+r.status:''}" data-act="cyc" data-f="${r.full}" aria-label="Change status">${r.status?ST_LABEL[r.status]:'+ Status'}</button>`}
function fuCheck(r){return fuSelectMode?`<input type="checkbox" class="fu-check" data-f="${r.full}"${fuSel.has(r.full)?' checked':''} aria-label="Select">`:''}

function fuRow(r,kind){
  const num=`<div class="rnum">+${r.code?r.code+' '+r.local:r.full}</div>`,
    lab=r.label?`<div class="lab" dir="auto">${esc(r.label)}</div>`:'',
    task=r.task?`<div class="task" dir="auto">${esc(r.task)}</div>`:'';
  const extra=(r.value?`<span class="val">${sar(r.value)}</span>`:'')+(r.note?`<span class="nt" dir="auto">${esc(r.note)}</span>`:'');
  let meta,acts;
  if(kind==='no'){
    meta=`<span>Messaged ${ago(r.at)}</span>`;
    acts=`<button type="button" class="btn small" data-act="q1" data-f="${r.full}">Tomorrow</button><button type="button" class="btn small" data-act="q3" data-f="${r.full}">3 days</button><button type="button" class="btn small" data-act="q7" data-f="${r.full}">1 week</button>`;
  }else if(kind==='list'){
    meta=r.due&&isOpen(r)?`<span class="due ${dayDiff(r.due)<0?'od':dayDiff(r.due)===0?'td':''}">${dueWhen(r)}</span>`:`<span>Last contact ${ago(r.at)}</span>`;
    acts=stChip(r);
  }else{
    const n=dayDiff(r.due);meta=`<span class="due ${n<0?'od':n===0?'td':''}">${dueWhen(r)}</span>`+(r.fuMsg?' · <span>Message ready</span>':'');
    acts=stChip(r)+(kind==='due'?`<button type="button" class="btn small primary" data-act="fu" data-f="${r.full}">Follow up</button><button type="button" class="btn small" data-act="snz" data-f="${r.full}">Snooze</button><button type="button" class="btn small" data-act="fudone" data-f="${r.full}">Done</button>`:'');
  }
  return `<div class="item${r.dnc?' dnc':''}">${fuCheck(r)}<button type="button" class="main fuitem" data-act="open" data-f="${r.full}" aria-label="Open details">${lab}${task}${num}<div class="meta">${r.dnc?`<span class="dnc-badge">${esc(tr('Do not contact'))}</span> · `:''}${meta}</div>${extra?`<div class="xtra">${extra}</div>`:''}</button><div class="acts">${acts}</div></div>`;
}

/* Monthly pipeline snapshot: keep a rolling 6-month trend beside the stats. */
function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function snapshot(){
  const now=new Date(),mk=monthKey(now);
  const snaps=store.get('qc_snaps',[]);
  if(snaps.length&&snaps[snaps.length-1].m===mk)return snaps;
  const won=state.recents.filter(r=>r.status==='won').length,lost=state.recents.filter(r=>r.status==='lost').length;
  snaps.push({m:mk,won,lost});
  const kept=snaps.filter(s=>{const[y,mo]=s.m.split('-').map(Number);return (now.getFullYear()-y)*12+(now.getMonth()+1-mo)<6});
  store.set('qc_snaps',kept);
  return kept;
}
function trendText(){
  const snaps=store.get('qc_snaps',[]);
  if(snaps.length<2)return '';
  return snaps.map(s=>{
    const rate=s.won+s.lost?Math.round(s.won/(s.won+s.lost)*100):null;
    return s.m.slice(5)+' '+(rate===null?'–':rate+'%');
  }).join(' · ');
}
function renderPipeline(){
  const el=$('pipe'),tracked=state.recents.some(r=>r.status);
  if(!tracked){el.hidden=true;return}
  const open=state.recents.filter(r=>r.status==='quoted'||r.status==='waiting'||r.status==='negotiating'),openSum=open.reduce((a,r)=>a+(+r.value||0),0);
  const now=new Date(),m0=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const won=state.recents.filter(r=>r.status==='won'),wonM=won.filter(r=>lastStatusTime(r,'won')>=m0),wonSum=wonM.reduce((a,r)=>a+(+r.value||0),0);
  const lostRows=state.recents.filter(r=>r.status==='lost'),lost=lostRows.length,rate=won.length+lost?Math.round(won.length/(won.length+lost)*100):null;
  /* O4: quotes whose validity date falls within the next 7 days. */
  const expiring=state.recents.filter(r=>isOpen(r)&&r.valid&&dayDiff(r.valid)>=0&&dayDiff(r.valid)<=7).length;
  /* O2: aggregate lost reasons so patterns surface. */
  const whyAgg={};
  lostRows.forEach(r=>{if(r.lostWhy)whyAgg[r.lostWhy]=(whyAgg[r.lostWhy]||0)+1});
  const whyLine=Object.keys(whyAgg).sort((a,b)=>whyAgg[b]-whyAgg[a]).map(k=>tr(LOST_LBL[k]||k)+' ×'+whyAgg[k]).join(' · ');
  snapshot();
  const trend=trendText();
  /* F10: follow-up discipline — done events logged in the trailing 7 days. */
  const weekAgo=Date.now()-7*864e5;
  const done7=state.recents.reduce((a,r)=>a+(r.log||[]).filter(x=>x.e==='done'&&x.t>=weekAgo).length,0);
  el.innerHTML=`<div class="stat"><span class="k">Open quotes</span><b>${open.length}</b><span class="s">${sar(openSum)}</span></div>
    <div class="stat"><span class="k">Won this month</span><b>${wonM.length}</b><span class="s">${sar(wonSum)}</span></div>
    <div class="stat"><span class="k">Win rate</span><b>${rate===null?'–':rate+'%'}</b><span class="s">${won.length} won · ${lost} lost</span></div>
    ${expiring?`<div class="stat"><span class="k">Expiring quotes</span><b>${expiring}</b><span class="s">${tr('valid within 7 days')}</span></div>`:''}
    <div class="stat"><span class="k">Follow-ups done</span><b>${done7}</b><span class="s">${tr('last 7 days')}</span></div>
    ${whyLine?`<div class="stat"><span class="k">Lost reasons</span><span class="s">${whyLine}</span></div>`:''}
    ${trend?`<div class="stat"><span class="k">Last 6 months</span><span class="s">${trend}</span></div>`:''}`;
  el.hidden=false;
}

const FILTERS=['active','quoted','waiting','negotiating','won','lost','all'],F_LABEL={active:'Active',quoted:'Quoted',waiting:'Waiting',negotiating:'Negotiating',won:'Won',lost:'Lost',all:'All'};
function renderFilters(){
  const f=state.fuFilter||'active',cnt=k=>k==='active'||k==='all'?'':` <small>${state.recents.filter(r=>r.status===k).length}</small>`;
  $('fuFilters').innerHTML=FILTERS.map(k=>`<button type="button" data-flt="${k}" aria-pressed="${f===k}">${F_LABEL[k]}${cnt(k)}</button>`).join('');
}
$('fuFilters').addEventListener('click',e=>{const b=e.target.closest('[data-flt]');if(!b)return;state.fuFilter=b.dataset.flt;$('fltSearch').value='';renderFollowups()});
$('fltSearch').addEventListener('input',()=>renderFollowups());

export function renderFollowups(){
  const key=r=>r.due+' '+dueTime(r),all=state.recents.filter(r=>r.due&&isOpen(r)).sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  const t=todayStr(),due=all.filter(r=>r.due<=t),up=all.filter(r=>r.due>t);
  $('tb-fu').innerHTML='<span>Follow</span>'+(due.length?`<span class="badge" aria-label="${due.length} due">${due.length}</span>`:'');
  renderPipeline();renderFilters();
  const f=state.fuFilter||'active';
  $('activeView').hidden=f!=='active';$('fltSec').hidden=f==='active';
  if(f==='active')renderActiveView(all,due,up);
  else renderFilterView(f);
  renderTodayMini(); /* E4: keep the Chat-tab strip in sync with every list change */
}

/* F5: due-list buckets. */
const BUCKET={od:'Overdue',td:'Today',tm:'Tomorrow',wk:'Later this week',lt:'Later'};
function bucketOf(ds){const n=dayDiff(ds);return n<0?'od':n===0?'td':n===1?'tm':n<7?'wk':'lt'}

/* F3: select mode + batch actions on the Due list. */
let fuSelectMode=false,fuSel=new Set();
function setSelectMode(on){
  fuSelectMode=on;if(!on)fuSel.clear();
  const btn=$('fuSelect');if(btn){btn.setAttribute('aria-pressed',on?'true':'false');btn.textContent=tr(on?'Cancel':'Select')}
  renderFollowups();
}
function renderBar(){
  const old=$('fuBar');if(old)old.remove();
  if(!fuSelectMode||!fuSel.size)return;
  const bar=document.createElement('div');bar.id='fuBar';bar.className='fu-bar';
  bar.innerHTML=`<span class="fu-bar-n">${fuSel.size}</span>
    <button type="button" class="btn small" data-b="tmr">${tr('Snooze to tomorrow')}</button>
    <button type="button" class="btn small" data-b="done">${tr('Done')}</button>
    <label class="datechip"><span>${tr('Set date')}</span><input type="date" id="fuBarDate" min="${todayStr()}"></label>
    <button type="button" class="btn small primary" data-b="apply">${tr('Apply')}</button>`;
  bar.addEventListener('click',e=>{
    const b=e.target.closest('[data-b]');if(!b)return;
    const rs=[...fuSel].map(f=>state.recents.find(x=>x.full===f)).filter(Boolean);
    if(b.dataset.b==='tmr'){
      rs.forEach(r=>setDueVal(r,todayStr(1)));
      fuSel.clear();saveRecents();renderFollowups();
      toast(tr(`${rs.length} snoozed to tomorrow`),{type:'ok'});
    }else if(b.dataset.b==='done'){
      rs.forEach(r=>completeFollowUp(r,{silent:true}));
      fuSel.clear();setSelectMode(false);
      toast(tr(`${rs.length} marked done`),{type:'ok'});
    }else if(b.dataset.b==='apply'){
      const d=$('fuBarDate').value;
      if(!d){toast(tr('Pick a date first'));return}
      rs.forEach(r=>setDueVal(r,d));
      fuSel.clear();saveRecents();renderFollowups();
      toast(tr(`${rs.length} follow-ups set`),{type:'ok'});
    }
  });
  document.body.appendChild(bar);
}

/* Active view: due now (grouped), upcoming, and no-reminder prompts. */
function renderActiveView(all,due,up){
  const pf=store.get('qc_fuPrompt','');
  const no=state.recents.filter(r=>!r.due&&isOpen(r)&&r.full!==pf).slice(0,15);
  $('fuCount').textContent=due.length?due.length+' today or overdue':'';
  if(due.length){
    const groups={od:[],td:[],tm:[],wk:[],lt:[]};
    due.forEach(r=>groups[bucketOf(r.due)].push(r));
    $('fuList').innerHTML=Object.keys(groups).filter(k=>groups[k].length)
      .map(k=>`<div class="fugroup"><span>${tr(BUCKET[k])}</span><small>${groups[k].length}</small></div>`+groups[k].map(r=>fuRow(r,'due')).join('')).join('');
  }else{
    $('fuList').innerHTML=`<div class="empty">${all.length||no.length?'Nothing due. You are up to date.':'No follow-ups yet. After you message someone, set a reminder here.'}</div>`;
  }
  $('upSec').hidden=!up.length;$('upList').innerHTML=up.map(r=>fuRow(r,'up')).join('');
  $('noSec').hidden=!no.length;$('noList').innerHTML=no.map(r=>fuRow(r,'no')).join('');
  renderBar();
}

/* Filtered view: one status bucket with live search. */
function renderFilterView(f){
  const s=$('fltSearch').value.trim().toLowerCase(),sd=s.replace(/\D/g,'');
  let list=state.recents.filter(r=>f==='all'||r.status===f);
  if(s)list=list.filter(r=>(r.label||'').toLowerCase().includes(s)||(r.note||'').toLowerCase().includes(s)||(r.task||'').toLowerCase().includes(s)||(r.company||'').toLowerCase().includes(s)||(r.src||'').toLowerCase().includes(s)||(sd&&r.full.includes(sd)));
  list.sort((a,b)=>b.at-a.at);
  const sum=list.reduce((a,r)=>a+(+r.value||0),0);
  $('fltTitle').textContent=F_LABEL[f]+' ('+list.length+')'+(sum?' · '+sar(sum):'');
  $('fltList').innerHTML=list.length?list.map(r=>fuRow(r,'list')).join(''):'<div class="empty">No contacts here yet.</div>';
}

export function startFollowUp(r){
  state.fuActive=r.full;setTab('chat');loadRecent(r);
  const t=r.fuMsg?{body:r.fuMsg}:findFuTpl();if(t){useTemplate(t)}
  window.scrollTo({top:0,behavior:'smooth'});
  toast(r.fuMsg?'Saved message ready. Tap Open chat':t?'Follow-up message ready. Tap Open chat':'Number loaded. Tap Open chat');
}
function openCard(r,mode){store.set('qc_fuPrompt',r.full);state.cardMode=mode||'contact';renderFuPrompt();renderFollowups();setTimeout(()=>$('fuPrompt').scrollIntoView({behavior:'smooth',block:'start'}),50)}
/* Row actions, dispatched from a registry (open/extend per action,
   no growing if-chains). Each handler receives the contact record. */
const FU_ACTIONS={
  open:r=>openCard(r),
  fu:r=>startFollowUp(r),
  q1:r=>quickDue(r,1),
  q3:r=>quickDue(r,3),
  q7:r=>quickDue(r,7),
  fudone:r=>completeFollowUp(r),
  /* Snooze lives in notify.js; the event keeps this module cycle-free. */
  snz:r=>document.dispatchEvent(new CustomEvent('qc:snz',{detail:r.full})),
  cyc:r=>cycleStatus(r),
};
/* Deep link: open a contact's card from a notification or bell entry. */
export function openCardFull(full){const r=state.recents.find(x=>x.full===full);if(r)openCard(r)}
function quickDue(r,days){
  setDueVal(r,todayStr(days));saveRecents();toast('Follow-up set: '+dueLow(r.due));
  if(store.get('qc_cal',true))location.href=calLink(r);
}
function fuListClick(e){
  const ck=e.target.closest('.fu-check');
  if(ck){
    if(ck.checked){fuSel.add(ck.dataset.f)}else{fuSel.delete(ck.dataset.f)}
    const wantBar=!!fuSel.size,haveBar=!!$('fuBar');
    if(wantBar!==haveBar)renderBar();
    else if(wantBar){const s=$('fuBar').querySelector('.fu-bar-n');if(s)s.textContent=fuSel.size}
    return;
  }
  const b=e.target.closest('[data-act]');if(!b)return;const r=state.recents.find(x=>x.full===b.dataset.f);if(!r)return;
  const h=FU_ACTIONS[b.dataset.act];if(h)h(r);
  saveRecents();
}
['fuList','upList','noList','fltList'].forEach(id=>$(id).addEventListener('click',fuListClick));

/* F0: "new follow-up" sheet — create a task follow-up for anyone, including
   contacts never messaged from the Chat tab. Reached from the person icon
   in the Due header, or from the "Next step…" toast action after Done
   (prefilled with the finished task to draft the chained follow-up). */
let fuSheet=null;
function closeFuSheet(){if(fuSheet){fuSheet.remove();fuSheet=null}}
export function openFuSheet(prefill){
  prefill=prefill||{};
  closeFuSheet();
  fuSheet=document.createElement('div');fuSheet.className='qc-sheet-back';
  fuSheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('New follow-up'))}">
    <div class="qc-ct-head"><b>${esc(tr('New follow-up'))}</b><button type="button" class="btn small" data-x aria-label="Close">✕</button></div>
    <div class="fu-new-grid">
      <input class="txt" id="nfsName" dir="auto" autocomplete="off" placeholder="${esc(tr('Name'))}" value="${esc(prefill.name||'')}" aria-label="${esc(tr('Name'))}">
      <input class="txt" id="nfsNum" dir="ltr" inputmode="tel" autocomplete="off" placeholder="${esc(tr('Phone number'))}" value="${esc(prefill.digits||'')}" aria-label="${esc(tr('Phone number'))}">
      <button type="button" class="btn iconbtn" id="nfsPick" aria-label="${esc(tr('Pick a contact'))}" title="${esc(tr('Pick a contact'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
    </div>
    <input class="txt" id="nfsTask" dir="auto" autocomplete="off" placeholder="${esc(tr('What is this follow-up for?'))}" value="${esc(prefill.task||'')}" aria-label="${esc(tr('What is this follow-up for?'))}">
    <div class="wrapr"><button type="button" class="chip" data-d="1">Tomorrow</button><button type="button" class="chip" data-d="3">3 days</button><button type="button" class="chip" data-d="7">1 week</button><button type="button" class="chip" data-d="14">2 weeks</button>
      <label class="datechip"><span>Date</span><input type="date" id="nfsDate" min="${todayStr()}" aria-label="Pick a follow-up date"></label>
      <label class="datechip"><span>Time</span><input type="time" id="nfsTime" dir="ltr" value="09:00" aria-label="Follow-up time"></label></div>
    <button type="button" class="btn primary" data-save>${esc(tr('Save follow-up'))}</button>
  </div>`;
  fuSheet.addEventListener('click',e=>{
    if(e.target===fuSheet||e.target.closest('[data-x]')){closeFuSheet();return}
    if(e.target.closest('#nfsPick')){pickContact((digits,name)=>{const n=$('nfsNum'),nm=$('nfsName');if(n)n.value=digits;if(nm&&!nm.value.trim())nm.value=name});return}
    const d=e.target.closest('[data-d]');
    if(d){saveNewFollowUp(todayStr(+d.dataset.d));return}
    if(e.target.closest('[data-save]'))saveNewFollowUp($('nfsDate').value);
  });
  document.body.appendChild(fuSheet);
  const t=$('nfsTask');if(t&&!t.value)t.focus();
}
function saveNewFollowUp(ds){
  const digits=($('nfsNum').value||'').replace(/\D/g,'');
  if(!digits){toast(tr('Enter a phone number'));return}
  if(!ds){toast(tr('Pick a follow-up date'));return}
  const name=$('nfsName').value.trim(),task=$('nfsTask').value.trim().slice(0,140);
  const tm=$('nfsTime').value;
  const n=normalize(digits);
  const full=n?n.full:digits;
  let r=state.recents.find(x=>x.full===full);
  if(!r){r={full,code:n?n.code:'',local:n?n.local:digits,country:n?n.country:'ot',at:Date.now(),label:name};state.recents.unshift(r)}
  if(name)r.label=name;
  if(task){r.task=task;logEv(r,'task',task)}
  r.dueTime=/^\d\d:\d\d$/.test(tm)?tm:'09:00';
  setDueVal(r,ds);
  r._lu=Date.now();
  saveRecents();renderFollowups();
  closeFuSheet();
  toast('Follow-up set: '+dueLow(ds));
}

/* Contact card: status, follow-up date, quote value, note, history */
const EV_TXT={msg:()=>'Messaged',status:v=>v?'Status: '+ST_LABEL[v]:'Status cleared',due:v=>'Follow-up set for '+fmtDay(v),done:()=>'Follow-up cleared',value:v=>'Quote value: '+sar(v),
  task:v=>'Task: '+v,time:v=>'Follow-up time: '+v,repeat:v=>'Repeats: '+v,queue:v=>'Queue message sent'+(v?' — '+v:''),
  outcome:v=>'Outcome: '+(OUT_LBL[v]||v),lostwhy:v=>'Lost reason: '+(LOST_LBL[v]||v),seq:v=>'Sequence: '+v,
  valid:v=>'Quote valid until '+fmtDay(v),dnc:v=>+v?'Do not contact: on':'Do not contact: off',
  merge:v=>'Merged with '+v};
/* Contact card: pure template builder (renderFuPrompt wires state around it). */
function cardHtml(r,cal,log,head){
  return `<div class="qhead"><span class="bk">${head}</span><button type="button" class="btn small" data-x="1">${state.cardMode==='just'&&!r.due?'Not needed':'Close'}</button></div>
    <input class="txt" id="fpName" dir="auto" autocomplete="off" placeholder="Name" value="${esc(r.label||'')}" aria-label="Name">
    <div class="numrow-card"><span class="rnum">+${r.code?r.code+' '+r.local:r.full}</span>
      <a class="btn small" href="tel:+${r.full}" aria-label="${esc(tr('Call'))}">${tr('Call')}</a>
      <button type="button" class="btn small" data-x="copynum">${tr('Copy number')}</button>
      <button type="button" class="btn small" data-x="merge">${tr('Merge')}</button></div>
    <div class="two"><label class="field"><span class="lbl">${tr('Company')}</span><input class="txt" id="fpCo" dir="auto" autocomplete="organization" placeholder="${esc(tr('e.g. Gouda Trading'))}" value="${esc(r.company||'')}"></label>
      <label class="field"><span class="lbl">${tr('Lead source')}</span><input class="txt" id="fpSrc" dir="auto" autocomplete="off" placeholder="${esc(tr('e.g. WhatsApp ad, referral'))}" value="${esc(r.src||'')}"></label></div>
    <div class="wrapr"><span class="bk">Status</span>${['lead','contacted','quoted','waiting','negotiating','won','lost'].map(s=>`<button type="button" class="chip" data-s="${s}" aria-pressed="${r.status===s}">${ST_LABEL[s]}</button>`).join('')}</div>
    ${r.status==='lost'&&r.lostWhy?`<div class="wrapr"><span class="bk">${esc(tr('Lost reason'))}</span><b>${esc(tr(LOST_LBL[r.lostWhy]||r.lostWhy))}</b></div>`:''}
    <div class="wrapr"><span class="bk">Follow-up date</span>${r.due&&isOpen(r)?`<b class="due">${dueWhen(r)}</b><button type="button" class="btn small danger" data-x="clear">Remove</button>`:''}</div>
    <div class="wrapr"><button type="button" class="chip" data-d="1">Tomorrow</button><button type="button" class="chip" data-d="3">3 days</button><button type="button" class="chip" data-d="7">1 week</button><button type="button" class="chip" data-d="14">2 weeks</button>
      <label class="datechip"><span>Date</span><input type="date" id="fpDate" min="${todayStr(1)}" aria-label="Pick a follow-up date"></label>
      <label class="datechip"><span>Time</span><input type="time" id="fpTime" dir="ltr" value="${dueTime(r)}" aria-label="Follow-up time"></label></div>
    <div class="wrapr"><span class="bk">${tr('Repeat')}</span><select id="fpRepeat" class="txt" aria-label="${esc(tr('Repeat'))}">
      <option value="">${tr('No repeat')}</option>
      ${Object.keys(REPEAT_LBL).map(k=>`<option value="${k}"${r.fuRepeat===k?' selected':''}>${tr(REPEAT_LBL[k])}</option>`).join('')}
    </select></div>
    <div class="wrapr"><span class="bk">${tr('Sequence')}</span><select id="fpSeq" class="txt" aria-label="${esc(tr('Sequence'))}">
      <option value="">${tr('No sequence')}</option>
      ${Object.keys(SEQ_LBL).map(k=>`<option value="${k}"${r.seq&&r.seq.k===k?' selected':''}>${tr(SEQ_LBL[k])}</option>`).join('')}
    </select></div>
    <label class="chk"><input type="checkbox" id="fpCal" ${cal?'checked':''}> <span>Also add a reminder to my phone calendar</span></label>
    <label class="chk${r.muted?' on':''}"><input type="checkbox" id="fpMute" ${r.muted?'checked':''}> <span>${tr('Mute reminders for this contact')}</span></label>
    <label class="chk${r.dnc?' on':''}"><input type="checkbox" id="fpDnc" ${r.dnc?'checked':''}> <span>${tr('Do not contact again')}</span></label>
    <div class="two"><label class="field"><span class="lbl">Quote value (SAR)</span><input class="txt" id="fpVal" dir="ltr" inputmode="decimal" autocomplete="off" placeholder="0" value="${r.value?Math.round(r.value):''}"></label>
      <label class="field"><span class="lbl">${tr('Quote valid until')}</span><input type="date" class="txt" id="fpValid" min="${todayStr()}" value="${r.valid||''}" aria-label="${esc(tr('Quote valid until'))}"></label></div>
    <label class="field"><span class="lbl">${tr('What is this follow-up for?')}</span><input class="txt" id="fpTask" dir="auto" autocomplete="off" placeholder="${esc(tr('e.g. Get material test certificate from QC'))}" value="${esc(r.task||'')}"></label>
    <label class="field"><span class="lbl">Message to send (optional)</span><textarea id="fpMsg" dir="auto" rows="3" placeholder="Leave empty to use your Follow-up template">${esc(r.fuMsg||'')}</textarea></label>
    <label class="field"><span class="lbl">Note</span><textarea id="fpNote" dir="auto" rows="2" placeholder="What was quoted, site, products">${esc(r.note||'')}</textarea></label>
    ${log.length?`<details class="tl"><summary>History (${log.length})</summary><ol>${log.map(x=>`<li><span class="d">${fmtShort(x.t)}</span> <span>${(EV_TXT[x.e]||(()=>x.e))(x.v)}</span></li>`).join('')}</ol></details>`:''}
    <button type="button" class="btn primary" data-x="go">Follow up now</button>`;
}
export function renderFuPrompt(){
  const el=$('fuPrompt'),f=store.get('qc_fuPrompt',''),r=state.recents.find(x=>x.full===f);
  if(!r){el.hidden=true;el.innerHTML='';return}
  const cal=store.get('qc_cal',true),log=(r.log||[]).slice().reverse();
  const head=state.cardMode==='just'?'Just messaged':'Contact';
  el.innerHTML=cardHtml(r,cal,log,head);
  el.hidden=false;
}
function saveCardFields(r){
  const n=$('fpName'),v=$('fpVal'),no=$('fpNote');if(!n)return;
  r.label=n.value.trim();
  const val=Math.round(parseFloat(String(v.value).replace(/[^\d.]/g,''))||0);
  if(val!==(+r.value||0)){r.value=val;if(val)logEv(r,'value',val)}
  r.note=no.value.trim().slice(0,500);
  const co=$('fpCo'),src=$('fpSrc');
  if(co)r.company=co.value.trim().slice(0,120);
  if(src)r.src=src.value.trim().slice(0,120);
  const tm=$('fpTime'),fm=$('fpMsg'),tk=$('fpTask');
  r._lu=Date.now();
  if(tm&&/^\d\d:\d\d$/.test(tm.value))r.dueTime=tm.value;
  if(fm)r.fuMsg=fm.value.trim().slice(0,2000);
  if(tk&&tk.value.trim()!==(r.task||'')){r.task=tk.value.trim().slice(0,140);logEv(r,'task',r.task)}
}
function closeCard(){store.set('qc_fuPrompt','');state.cardMode=null;renderFuPrompt()}
function setDue(r,ds){
  saveCardFields(r);const cal=$('fpCal')?$('fpCal').checked:store.get('qc_cal',true);
  setDueVal(r,ds);if(r.status==='won'||r.status==='lost')setStatus(r,'waiting');
  closeCard();saveRecents();toast('Follow-up set: '+dueLow(ds));
  if(cal)location.href=calLink(r);
}
$('fuPrompt').addEventListener('change',e=>{
  const r=state.recents.find(x=>x.full===store.get('qc_fuPrompt',''));if(!r)return;
  if(e.target.id==='fpCal'){store.set('qc_cal',e.target.checked);return}
  if(e.target.id==='fpMute'){r.muted=e.target.checked?1:0;r._lu=Date.now();saveRecents();renderFollowups();toast(tr(e.target.checked?'Reminders muted for this contact':'Reminders on for this contact'));return}
  if(e.target.id==='fpRepeat'){r.fuRepeat=e.target.value||'';if(r.fuRepeat)r.seq=null;r._lu=Date.now();logEv(r,'repeat',REPEAT_LBL[r.fuRepeat]||'');saveRecents();return}
  /* O3: picking a sequence seeds step 1 (due + message) and clears Repeat —
     one rescheduler owns the next due date. */
  if(e.target.id==='fpSeq'){
    const k=e.target.value||'';
    if(k){
      const p=seqPlan(k,1,todayStr());
      r.seq={k,step:1};r.fuRepeat='';
      if(p){setDueVal(r,p.due);r.fuMsg=p.msg}
      logEv(r,'seq',SEQ_LBL[k]);
      toast(tr(`Sequence started — next: ${dueLow(r.due)}`),{type:'ok'});
    }else r.seq=null;
    r._lu=Date.now();saveRecents();renderFollowups();renderFuPrompt();return;
  }
  /* O4: quote validity arms a reminder two days before expiry. */
  if(e.target.id==='fpValid'){
    r.valid=e.target.value||'';r._lu=Date.now();
    logEv(r,'valid',r.valid||'cleared');
    if(r.valid&&r.valid>todayStr()){
      const d=new Date(r.valid+'T12:00:00');d.setDate(d.getDate()-2);
      const remind=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      if(!r.due||r.due>remind){
        setDueVal(r,remind);
        if(!r.task)r.task=tr('Quote expires')+' '+fmtDay(r.valid);
        toast(tr(`Reminder set — quote expires ${fmtDay(r.valid)}`),{type:'ok'});
      }
    }
    saveRecents();renderFollowups();return;
  }
  /* O5: do-not-contact flag — queue, picker and suggestions respect it. */
  if(e.target.id==='fpDnc'){r.dnc=e.target.checked?1:0;r._lu=Date.now();logEv(r,'dnc',r.dnc);saveRecents();renderFollowups();toast(tr(e.target.checked?'This number will not be queued again':'Number can be queued again'));return}
  if(e.target.id==='fpDate'){if(e.target.value)setDue(r,e.target.value);return}
  if(e.target.id==='fpTime'){
    /* F9: time changes write a history entry. */
    const prev=dueTime(r);saveCardFields(r);
    if(dueTime(r)!==prev)logEv(r,'time',dueTime(r));
    store.set('qc_recents',state.recents);renderFollowups();if(r.due)toast('Follow-up time: '+dueTime(r));return}
  saveCardFields(r);store.set('qc_recents',state.recents);renderFollowups();renderBk();
});
$('fuPrompt').addEventListener('click',e=>{
  const r=state.recents.find(x=>x.full===store.get('qc_fuPrompt',''));if(!r)return;
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.d){setDue(r,todayStr(+b.dataset.d));return}
  saveCardFields(r);
  if(b.dataset.s){
    const s=b.dataset.s;
    /* O2: first time marking lost, ask why (patterns need the reason). */
    if(s==='lost'&&r.status!=='lost'&&!r.lostWhy){openLostSheet(r);return}
    const prev={status:r.status||'',due:r.due,dueTime:dueTime(r),lostWhy:r.lostWhy||''};
    const clearing=r.status===s;
    setStatus(r,clearing?'':s);
    if(clearing)r.lostWhy='';
    saveRecents();renderFuPrompt();
    if(r.status!==prev.status)toast(`Status: ${ST_LABEL[r.status]||'—'}`,{action:{label:tr('Undo'),fn:()=>{Object.assign(r,prev);r._lu=Date.now();saveRecents();renderFuPrompt();renderFollowups()}}});
    return;
  }
  if(b.dataset.x==='clear'){setDueVal(r,'');toast('Reminder removed');saveRecents();renderFuPrompt();return}
  if(b.dataset.x==='copynum'){
    const link='+'+r.full;
    const fallback=()=>{toast(tr('Copy failed. Long-press to copy: ')+link)};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(link).then(()=>toast(tr('Number copied'))).catch(fallback);else fallback();
    return;
  }
  if(b.dataset.x==='go'){saveRecents();closeCard();startFollowUp(r);return}
  if(b.dataset.x==='merge'){openMergeSheet(r);return}
  if(b.dataset.x){saveRecents();closeCard()}
});
function calLink(r){
  const s=parseDay(r.due),hm=dueTime(r).split(':');s.setHours(+hm[0],+hm[1],0,0);const en=new Date(s.getTime()+15*60000);
  const fmt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const appUrl=location.origin+location.pathname+'?fu='+r.full;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(tr('WhatsApp follow-up:')+' '+who(r))
    +'&dates='+fmt(s)+'/'+fmt(en)+'&details='+encodeURIComponent('Number: +'+r.full+(r.status?'\nStatus: '+ST_LABEL[r.status]:'')+(r.value?'\nQuote: '+sar(r.value):'')+(r.note?'\nNote: '+r.note:'')+(r.fuMsg?'\nMessage: '+r.fuMsg:'')+'\nOpen in QuickChat: '+appUrl);
}

/* Due-header controls: select mode + new follow-up from contacts. */
const fuSelBtn=$('fuSelect'),fuPickBtn=$('fuPick');
if(fuSelBtn)fuSelBtn.onclick=()=>setSelectMode(!fuSelectMode);
if(fuPickBtn)fuPickBtn.onclick=()=>openFuSheet({});

/* ---- O2: lost-reason sheet (card chip, cycle, queue shortcut) ---- */
let lostSheet=null;
export function closeLostSheet(){if(lostSheet){lostSheet.remove();lostSheet=null}}
export function openLostSheet(r,cb){
  if(!r)return;
  closeLostSheet();
  lostSheet=document.createElement('div');lostSheet.className='qc-sheet-back';
  lostSheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('Why lost?'))}">
    <div class="qc-ct-head"><b>${esc(tr('Why lost?'))}</b><button type="button" class="btn small" data-x aria-label="${esc(tr('Close'))}">✕</button></div>
    ${LOST_REASONS.map(([k,l])=>`<button type="button" class="qc-sheet-item" data-lw="${k}">${esc(tr(l))}</button>`).join('')}
    <input class="txt" id="lwDetail" dir="auto" autocomplete="off" placeholder="${esc(tr('Details (optional)'))}">
  </div>`;
  lostSheet.addEventListener('click',e=>{
    if(e.target===lostSheet||e.target.closest('[data-x]')){closeLostSheet();return}
    const b=e.target.closest('[data-lw]');if(!b)return;
    const detail=($('lwDetail')&&$('lwDetail').value.trim().slice(0,80))||'';
    const why=b.dataset.lw==='other'&&detail?detail:b.dataset.lw;
    closeLostSheet();
    const prev={status:r.status||'',due:r.due,dueTime:dueTime(r),lostWhy:r.lostWhy||''};
    setStatus(r,'lost');
    r.lostWhy=why;
    logEv(r,'lostwhy',LOST_LBL[why]||why);
    saveRecents();renderFollowups();renderFuPrompt();
    toast(`${tr('Lost reason')}: ${tr(LOST_LBL[why]||why)}`,{action:{label:tr('Undo'),fn:()=>{Object.assign(r,prev);r._lu=Date.now();saveRecents();renderFollowups();renderFuPrompt()}}});
    if(cb)cb(why);
  });
  document.body.appendChild(lostSheet);
}

/* U2: merge a duplicate record into the open card. The loser gives up any
   field the winner lacks (notes append, never overwrite), histories join,
   and the loser is tombstoned so cloud sync purges it everywhere. */
let mergeSheet=null;
function closeMergeSheet(){if(mergeSheet){mergeSheet.remove();mergeSheet=null}}
function openMergeSheet(r){
  closeMergeSheet();
  const cand=state.recents.filter(x=>x.full!==r.full);
  if(!cand.length){toast(tr('No other records to merge'));return}
  mergeSheet=document.createElement('div');mergeSheet.className='qc-sheet-back';
  mergeSheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('Merge with which record?'))}">
    <div class="qc-ct-head"><b>${esc(tr('Merge with which record?'))}</b><button type="button" class="btn small" data-x aria-label="${esc(tr('Close'))}">✕</button></div>
    <div class="qc-ct-list">${cand.map(x=>`<button type="button" class="qc-sheet-item" data-mf="${esc(x.full)}"><div class="lab" dir="auto">${esc(x.label||'—')}</div><div class="rnum">+${x.code?x.code+' '+x.local:x.full}</div><div class="meta">${x.status?esc(tr(ST_LABEL[x.status]))+' · ':''}${esc(ago(x.at||0))}</div></button>`).join('')}</div>
  </div>`;
  mergeSheet.addEventListener('click',e=>{
    if(e.target===mergeSheet||e.target.closest('[data-x]')){closeMergeSheet();return}
    const b=e.target.closest('[data-mf]');if(!b)return;
    const l=state.recents.find(x=>x.full===b.dataset.mf);
    closeMergeSheet();
    if(l)doMerge(r,l);
  });
  document.body.appendChild(mergeSheet);
}
function doMerge(r,l){
  ['label','company','src','task','fuMsg','dueTime','valid','lostWhy','fuRepeat'].forEach(k=>{if(!r[k]&&l[k])r[k]=l[k]});
  if(!r.status&&l.status)r.status=l.status;
  if(!r.due&&l.due){r.due=l.due;if(l.dueTime)r.dueTime=l.dueTime}
  if(!r.value&&l.value)r.value=l.value;
  if(!r.outcome&&l.outcome)r.outcome=l.outcome;
  if(!r.seq&&l.seq)r.seq=l.seq;
  if(l.note&&l.note!==(r.note||'')&&!(r.note||'').includes(l.note))r.note=((r.note?r.note+'\n':'')+l.note).slice(0,500);
  r.log=(r.log||[]).concat(l.log||[]).filter((x,i,a)=>a.findIndex(y=>y.t===x.t&&y.e===x.e)===i).sort((a,b)=>a.t-b.t).slice(-40);
  r.dnc=r.dnc||l.dnc||0;
  r.muted=r.muted||l.muted||0;
  r.at=Math.max(r.at||0,l.at||0);
  logEv(r,'merge','+'+(l.code?l.code+' '+l.local:l.full));
  addTombstone('c',l.full);
  state.recents=state.recents.filter(x=>x.full!==l.full);
  if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
  r._lu=Date.now();
  saveRecents();renderFollowups();renderFuPrompt();
  toast(tr('Merged'),{type:'ok'});
}

/* ---- O1: outcome logging — the one tap that teaches the app what happened ---- */
const PO_TTL=30*60000;
export function stampOutcomeAsk(full){
  if(state.recents.some(x=>x.full===full))store.set('qc_po',{full,t:Date.now()});
}
export function clearOutcomeAsk(){store.set('qc_po',null)}
/* Write an outcome once per contact per day; returns false on a same-day dup. */
export function logOutcome(r,v){
  const day=new Date();day.setHours(0,0,0,0);
  if((r.log||[]).some(x=>x.e==='outcome'&&x.t>=day.getTime()))return false;
  r.outcome=v;r._lu=Date.now();logEv(r,'outcome',v);saveRecents();renderFollowups();return true;
}
let poSheet=null;
function closePoSheet(){if(poSheet){poSheet.remove();poSheet=null}}
function poDone(){clearOutcomeAsk();closePoSheet()}
/* Contextual next step under the outcome chips; one tap, never blocking. */
function poNextRow(r,v){
  const chase=tr('Chase in 3 days'),fu3=tr('Follow up in 3 days'),dncLbl=tr("Don't contact again"),neg=tr('Mark as negotiating');
  if(v==='noreply'){
    const dnc=lastOutcomeStreak(r.log)>=2&&!r.dnc?`<button type="button" class="btn small danger" data-po="dnc">${esc(dncLbl)}</button>`:'';
    return `<button type="button" class="btn small primary" data-po="chase">${esc(chase)}</button>${dnc}`;
  }
  if(v==='replied')return `<button type="button" class="btn small primary" data-po="fu3">${esc(fu3)}</button>`;
  if(v==='interested'){
    const negBtn=r.status!=='negotiating'?`<button type="button" class="btn small" data-po="neg">${esc(neg)}</button>`:'';
    return `<button type="button" class="btn small primary" data-po="fu3">${esc(fu3)}</button>${negBtn}`;
  }
  return '';
}
function maybeOutcomeSheet(){
  const po=store.get('qc_po',null);
  if(!po)return;
  if(Date.now()-po.t>PO_TTL){clearOutcomeAsk();return}
  const r=state.recents.find(x=>x.full===po.full);
  if(!r){clearOutcomeAsk();return}
  const day=new Date();day.setHours(0,0,0,0);
  if((r.log||[]).some(x=>x.e==='outcome'&&x.t>=day.getTime())){clearOutcomeAsk();return}
  closePoSheet();
  poSheet=document.createElement('div');poSheet.className='qc-sheet-back';
  poSheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('What happened?'))}">
    <div class="qc-ct-head"><b>${esc(tr(`What happened with ${r.label||'+'+(r.code?r.code+' '+r.local:r.full)}?`))}</b><button type="button" class="btn small" data-x aria-label="${esc(tr('Close'))}">✕</button></div>
    <div class="wrapr" id="poChips">${OUTCOMES.map(o=>`<button type="button" class="chip" data-o="${o}">${esc(tr(OUT_LBL[o]))}</button>`).join('')}</div>
    <div class="wrapr" id="poNext" hidden></div>
  </div>`;
  poSheet.addEventListener('click',e=>{
    if(e.target===poSheet||e.target.closest('[data-x]')){poDone();return}
    const o=e.target.closest('[data-o]');
    if(o){
      logOutcome(r,o.dataset.o);
      const next=$('poNext');
      if(next){next.innerHTML=poNextRow(r,o.dataset.o);next.hidden=!next.innerHTML}
      poSheet.querySelector('#poChips').style.opacity='.45';
      if(!next||next.hidden)setTimeout(poDone,250);
      return;
    }
    const a=e.target.closest('[data-po]');if(!a)return;
    if(a.dataset.po==='chase'||a.dataset.po==='fu3'){
      setDueVal(r,todayStr(3));
      if(!r.task)r.task=a.dataset.po==='chase'?tr('Chase'):tr('Follow up');
      saveRecents();
      toast(tr('Follow-up set: ')+dueLow(r.due),{type:'ok'});
    }else if(a.dataset.po==='neg'){setStatus(r,'negotiating');saveRecents();toast(tr('Status: ')+ST_LABEL.negotiating)}
    else if(a.dataset.po==='dnc'){r.dnc=1;r._lu=Date.now();logEv(r,'dnc',1);saveRecents();toast(tr('This number will not be queued again'))}
    poDone();
  });
  document.body.appendChild(poSheet);
}
/* Fire on web foreground + Capacitor appStateChange (belt and braces). */
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(maybeOutcomeSheet,350)});
try{
  if(window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App)
    window.Capacitor.Plugins.App.addListener('appStateChange',s=>{if(s&&s.isActive)setTimeout(maybeOutcomeSheet,350)});
}catch(_){}
