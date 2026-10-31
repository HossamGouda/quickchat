/* followups.js — follow-up reminders, deal statuses, contact card, and pipeline stats. */
import {$, store, state, STATUSES, ST_LABEL, esc, logEv, toast,
  ago, todayStr, parseDay, dayDiff, fmtDay, fmtShort, dueTime, dueWhen, dueLow, sar} from './core.js';
import {tr} from './i18n.js';
import {loadRecent, saveRecents} from './recents.js';
import {useTemplate} from './templates.js';
import {renderBk} from './backup.js';
import {setTab} from './tabs.js';

export function isOpen(r){return r.status!=='won'&&r.status!=='lost'}
export function who(r){return r.label||('+'+(r.code?r.code+' '+r.local:r.full))}
function findFuTpl(){return state.tpls.find(t=>/follow|متابع/i.test(t.title))||null}
function lastStatusTime(r,s){const l=(r.log||[]).filter(x=>x.e==='status'&&x.v===s).pop();return l?l.t:r.at}

export function setStatus(r,s){
  if((r.status||'')===s)return;r.status=s;r._lu=Date.now();logEv(r,'status',s);
  if((s==='won'||s==='lost')&&r.due){r.due='';toast('Marked '+ST_LABEL[s]+'. Follow-up cleared')}
}
export function setDueVal(r,ds){if((r.due||'')===ds)return;r.due=ds;r._lu=Date.now();logEv(r,ds?'due':'done',ds)}
export function cycleStatus(r){if(!r)return;setStatus(r,STATUSES[(STATUSES.indexOf(r.status||'')+1)%STATUSES.length]);store.set('qc_recents',state.recents)}
function stChip(r){return `<button type="button" class="chipst${r.status?' st-'+r.status:''}" data-act="cyc" data-f="${r.full}" aria-label="Change status">${r.status?ST_LABEL[r.status]:'+ Status'}</button>`}

function fuRow(r,kind){
  const num=`<div class="rnum">+${r.code?r.code+' '+r.local:r.full}</div>`,lab=r.label?`<div class="lab" dir="auto">${esc(r.label)}</div>`:'';
  const extra=(r.value?`<span class="val">${sar(r.value)}</span>`:'')+(r.note?`<span class="nt" dir="auto">${esc(r.note)}</span>`:'');
  let meta,acts;
  if(kind==='no'){
    meta=`<span>Messaged ${ago(r.at)}</span>`;
    acts=`<button type="button" class="btn small" data-act="q3" data-f="${r.full}">3 days</button><button type="button" class="btn small" data-act="q7" data-f="${r.full}">1 week</button>`;
  }else if(kind==='list'){
    meta=r.due&&isOpen(r)?`<span class="due ${dayDiff(r.due)<0?'od':dayDiff(r.due)===0?'td':''}">${dueWhen(r)}</span>`:`<span>Last contact ${ago(r.at)}</span>`;
    acts=stChip(r);
  }else{
    const n=dayDiff(r.due);meta=`<span class="due ${n<0?'od':n===0?'td':''}">${dueWhen(r)}</span>`+(r.fuMsg?' · <span>Message ready</span>':'');
    acts=stChip(r)+(kind==='due'?`<button type="button" class="btn small primary" data-act="fu" data-f="${r.full}">Follow up</button><button type="button" class="btn small" data-act="fudone" data-f="${r.full}">Done</button>`:'');
  }
  return `<div class="item"><button type="button" class="main fuitem" data-act="open" data-f="${r.full}" aria-label="Open details">${lab}${num}<div class="meta">${meta}</div>${extra?`<div class="xtra">${extra}</div>`:''}</button><div class="acts">${acts}</div></div>`;
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
  const open=state.recents.filter(r=>r.status==='quoted'||r.status==='waiting'),openSum=open.reduce((a,r)=>a+(+r.value||0),0);
  const now=new Date(),m0=new Date(now.getFullYear(),now.getMonth(),1).getTime();
  const won=state.recents.filter(r=>r.status==='won'),wonM=won.filter(r=>lastStatusTime(r,'won')>=m0),wonSum=wonM.reduce((a,r)=>a+(+r.value||0),0);
  const lost=state.recents.filter(r=>r.status==='lost').length,rate=won.length+lost?Math.round(won.length/(won.length+lost)*100):null;
  snapshot();
  const trend=trendText();
  el.innerHTML=`<div class="stat"><span class="k">Open quotes</span><b>${open.length}</b><span class="s">${sar(openSum)}</span></div>
    <div class="stat"><span class="k">Won this month</span><b>${wonM.length}</b><span class="s">${sar(wonSum)}</span></div>
    <div class="stat"><span class="k">Win rate</span><b>${rate===null?'–':rate+'%'}</b><span class="s">${won.length} won · ${lost} lost</span></div>
    ${trend?`<div class="stat"><span class="k">Last 6 months</span><span class="s">${trend}</span></div>`:''}`;
  el.hidden=false;
}

const FILTERS=['active','quoted','waiting','won','lost','all'],F_LABEL={active:'Active',quoted:'Quoted',waiting:'Waiting',won:'Won',lost:'Lost',all:'All'};
function renderFilters(){
  const f=state.fuFilter||'active',cnt=k=>k==='active'||k==='all'?'':` <small>${state.recents.filter(r=>r.status===k).length}</small>`;
  $('fuFilters').innerHTML=FILTERS.map(k=>`<button type="button" data-flt="${k}" aria-pressed="${f===k}">${F_LABEL[k]}${cnt(k)}</button>`).join('');
}
$('fuFilters').addEventListener('click',e=>{const b=e.target.closest('[data-flt]');if(!b)return;state.fuFilter=b.dataset.flt;$('fltSearch').value='';renderFollowups()});
$('fltSearch').addEventListener('input',()=>renderFollowups());

export function renderFollowups(){
  const key=r=>r.due+' '+dueTime(r),all=state.recents.filter(r=>r.due&&isOpen(r)).sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  const t=todayStr(),due=all.filter(r=>r.due<=t),up=all.filter(r=>r.due>t);
  $('tb-fu').innerHTML='<span>Follow-ups</span>'+(due.length?`<span class="badge" aria-label="${due.length} due">${due.length}</span>`:'');
  renderPipeline();renderFilters();
  const f=state.fuFilter||'active';
  $('activeView').hidden=f!=='active';$('fltSec').hidden=f==='active';
  {
    const pf=store.get('qc_fuPrompt','');
    const no=state.recents.filter(r=>!r.due&&isOpen(r)&&r.full!==pf).slice(0,15);
    $('fuCount').textContent=due.length?due.length+' today or overdue':'';
    $('fuList').innerHTML=due.length?due.map(r=>fuRow(r,'due')).join('')
      :`<div class="empty">${all.length||no.length?'Nothing due. You are up to date.':'No follow-ups yet. After you message someone, set a reminder here.'}</div>`;
    $('upSec').hidden=!up.length;$('upList').innerHTML=up.map(r=>fuRow(r,'up')).join('');
    $('noSec').hidden=!no.length;$('noList').innerHTML=no.map(r=>fuRow(r,'no')).join('');
  }
  if(f!=='active'){
    const s=$('fltSearch').value.trim().toLowerCase(),sd=s.replace(/\D/g,'');
    let list=state.recents.filter(r=>f==='all'||r.status===f);
    if(s)list=list.filter(r=>(r.label||'').toLowerCase().includes(s)||(r.note||'').toLowerCase().includes(s)||(sd&&r.full.includes(sd)));
    list.sort((a,b)=>b.at-a.at);
    const sum=list.reduce((a,r)=>a+(+r.value||0),0);
    $('fltTitle').textContent=F_LABEL[f]+' ('+list.length+')'+(sum?' · '+sar(sum):'');
    $('fltList').innerHTML=list.length?list.map(r=>fuRow(r,'list')).join(''):'<div class="empty">No contacts here yet.</div>';
  }
}

export function startFollowUp(r){
  state.fuActive=r.full;setTab('chat');loadRecent(r);
  const t=r.fuMsg?{body:r.fuMsg}:findFuTpl();if(t){useTemplate(t)}
  window.scrollTo({top:0,behavior:'smooth'});
  toast(r.fuMsg?'Saved message ready. Tap Open chat':t?'Follow-up message ready. Tap Open chat':'Number loaded. Tap Open chat');
}
function openCard(r,mode){store.set('qc_fuPrompt',r.full);state.cardMode=mode||'contact';renderFuPrompt();renderFollowups();setTimeout(()=>$('fuPrompt').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function fuListClick(e){
  const b=e.target.closest('[data-act]');if(!b)return;const r=state.recents.find(x=>x.full===b.dataset.f);if(!r)return;
  const a=b.dataset.act;
  if(a==='open'){openCard(r);return}
  if(a==='fu'){startFollowUp(r);return}
  if(a==='q3'||a==='q7'){setDueVal(r,todayStr(a==='q3'?3:7));saveRecents();toast('Follow-up set: '+dueLow(r.due));if(store.get('qc_cal',true))location.href=calLink(r);return}
  if(a==='fudone'){setDueVal(r,'');toast('Follow-up done')}
  if(a==='cyc')cycleStatus(r);
  saveRecents();
}
['fuList','upList','noList','fltList'].forEach(id=>$(id).addEventListener('click',fuListClick));

/* Contact card: status, follow-up date, quote value, note, history */
const EV_TXT={msg:()=>'Messaged',status:v=>v?'Status: '+ST_LABEL[v]:'Status cleared',due:v=>'Follow-up set for '+fmtDay(v),done:()=>'Follow-up cleared',value:v=>'Quote value: '+sar(v)};
export function renderFuPrompt(){
  const el=$('fuPrompt'),f=store.get('qc_fuPrompt',''),r=state.recents.find(x=>x.full===f);
  if(!r){el.hidden=true;el.innerHTML='';return}
  const cal=store.get('qc_cal',true),log=(r.log||[]).slice().reverse();
  const head=state.cardMode==='just'?'Just messaged':'Contact';
  el.innerHTML=`<div class="qhead"><span class="bk">${head}</span><button type="button" class="btn small" data-x="1">${state.cardMode==='just'&&!r.due?'Not needed':'Close'}</button></div>
    <input class="txt" id="fpName" dir="auto" autocomplete="off" placeholder="Name" value="${esc(r.label||'')}" aria-label="Name">
    <div class="rnum">+${r.code?r.code+' '+r.local:r.full}</div>
    <div class="wrapr"><span class="bk">Status</span>${['quoted','waiting','won','lost'].map(s=>`<button type="button" class="chip" data-s="${s}" aria-pressed="${r.status===s}">${ST_LABEL[s]}</button>`).join('')}</div>
    <div class="wrapr"><span class="bk">Follow-up date</span>${r.due&&isOpen(r)?`<b class="due">${dueWhen(r)}</b><button type="button" class="btn small danger" data-x="clear">Remove</button>`:''}</div>
    <div class="wrapr"><button type="button" class="chip" data-d="1">Tomorrow</button><button type="button" class="chip" data-d="3">3 days</button><button type="button" class="chip" data-d="7">1 week</button>
      <label class="datechip"><span>Date</span><input type="date" id="fpDate" min="${todayStr(1)}" aria-label="Pick a follow-up date"></label>
      <label class="datechip"><span>Time</span><input type="time" id="fpTime" dir="ltr" value="${dueTime(r)}" aria-label="Follow-up time"></label></div>
    <label class="chk"><input type="checkbox" id="fpCal" ${cal?'checked':''}> <span>Also add a reminder to my phone calendar</span></label>
    <div class="two"><label class="field"><span class="lbl">Quote value (SAR)</span><input class="txt" id="fpVal" dir="ltr" inputmode="decimal" autocomplete="off" placeholder="0" value="${r.value?Math.round(r.value):''}"></label></div>
    <label class="field"><span class="lbl">Message to send (optional)</span><textarea id="fpMsg" dir="auto" rows="3" placeholder="Leave empty to use your Follow-up template">${esc(r.fuMsg||'')}</textarea></label>
    <label class="field"><span class="lbl">Note</span><textarea id="fpNote" dir="auto" rows="2" placeholder="What was quoted, site, products">${esc(r.note||'')}</textarea></label>
    ${log.length?`<details class="tl"><summary>History (${log.length})</summary><ol>${log.map(x=>`<li><span class="d">${fmtShort(x.t)}</span> <span>${(EV_TXT[x.e]||(()=>x.e))(x.v)}</span></li>`).join('')}</ol></details>`:''}
    <button type="button" class="btn primary" data-x="go">Follow up now</button>`;
  el.hidden=false;
}
function saveCardFields(r){
  const n=$('fpName'),v=$('fpVal'),no=$('fpNote');if(!n)return;
  r.label=n.value.trim();
  const val=Math.round(parseFloat(String(v.value).replace(/[^\d.]/g,''))||0);
  if(val!==(+r.value||0)){r.value=val;if(val)logEv(r,'value',val)}
  r.note=no.value.trim().slice(0,500);
  const tm=$('fpTime'),fm=$('fpMsg');
  r._lu=Date.now();
  if(tm&&/^\d\d:\d\d$/.test(tm.value))r.dueTime=tm.value;
  if(fm)r.fuMsg=fm.value.trim().slice(0,2000);
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
  if(e.target.id==='fpDate'){if(e.target.value)setDue(r,e.target.value);return}
  if(e.target.id==='fpTime'){saveCardFields(r);store.set('qc_recents',state.recents);renderFollowups();if(r.due)toast('Follow-up time: '+dueTime(r));return}
  saveCardFields(r);store.set('qc_recents',state.recents);renderFollowups();renderBk();
});
$('fuPrompt').addEventListener('click',e=>{
  const r=state.recents.find(x=>x.full===store.get('qc_fuPrompt',''));if(!r)return;
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.d){setDue(r,todayStr(+b.dataset.d));return}
  saveCardFields(r);
  if(b.dataset.s){setStatus(r,r.status===b.dataset.s?'':b.dataset.s);saveRecents();renderFuPrompt();return}
  if(b.dataset.x==='clear'){setDueVal(r,'');toast('Reminder removed');saveRecents();renderFuPrompt();return}
  if(b.dataset.x==='go'){saveRecents();closeCard();startFollowUp(r);return}
  if(b.dataset.x){saveRecents();closeCard()}
});
function calLink(r){
  const s=parseDay(r.due),hm=dueTime(r).split(':');s.setHours(+hm[0],+hm[1],0,0);const en=new Date(s.getTime()+15*60000);
  const fmt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const appUrl=location.origin+location.pathname+'?fu='+r.full;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(tr('WhatsApp follow-up:')+' '+who(r))
    +'&dates='+fmt(s)+'/'+fmt(en)+'&details='+encodeURIComponent('Number: +'+r.full+(r.status?'\nStatus: '+ST_LABEL[r.status]:'')+(r.value?'\nQuote: '+sar(r.value):'')+(r.note?'\nNote: '+r.note:'')+(r.fuMsg?'\nMessage: '+r.fuMsg:'')+'\nOpen in QuickChat: '+appUrl);
}

