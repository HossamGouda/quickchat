/* queue.js — batch follow-up queue: paste a list, message one by one.
   v5.0: staged send (pending → opened → sent/skipped) so "sent" is truthful,
   skip reasons, undo, pacing between opens, people picker + recents merge,
   resume + batch memory at the finish line. */
import {$, store, state, COUNTRIES, ST_LABEL, esc, toast, notifyEvent, normalize,
  VAR_RE, autoVars, fillTpl, customKeys, todayStr, dueLow, dueWhen, fmtShort, logEv, ago} from './core.js';
import {buildLink, openChat} from './dialer.js';
import {pushRecent, saveRecents} from './recents.js';
import {setDueVal, setStatus, isOpen, logOutcome, openLostSheet} from './followups.js';
import {tr} from './i18n.js';
import {pickPeople} from './contacts.js';
import {retryableSkipped, isoWeekKey, paceMs, SKIP_REASONS, bumpDayCounter, DAY_WARN_AT} from './qutil.js';

let q=null;
const qText=$('qText');
let qFoundList=[],qExtra={};
const WHY_LBL=Object.fromEntries(SKIP_REASONS);
export function queueState(){return q}
/* Called once store.ready resolves: restores an in-progress batch queue. */
export function initQueue(){q=store.get('qc_queue',null)}
const NOISE=/\b(mob(ile)?|tel|phone|whats ?app|wa|cell|no|number|contact)\b\.?|جوال|واتساب|هاتف|رقم/gi;
/* Duplicate-warning window: "messaged X ago" shows for contacts messaged in
   the last 30 days; the setup hint turns warn-colored inside 7 days. */
const RECENT_MS=30*864e5,DUP_MS=7*864e5;
function extractWithNames(text){
  const out=[],seen=new Set();
  String(text).split(/\r?\n/).forEach(line=>{
    const ln=line.replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x06f0));
    const re=/(?:\+|00)?\d[\d\s\-(). ]{6,20}\d/g;let m,nums=[],rest=ln;
    while((m=re.exec(ln))){const n=normalize(m[0]);if(n){nums.push(n);rest=rest.replace(m[0],' ')}}
    const name=rest.replace(NOISE,' ').replace(/[:|,;*•\-–—()\[\]#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
    nums.forEach(n=>{if(!seen.has(n.full)){seen.add(n.full);out.push(Object.assign({},n,{name}))}});
  });
  return out;
}
export function fillTplSelect(){
  const sel=$('qTpl'),cur=sel.value||store.get('qc_qtpl','');
  sel.innerHTML='<option value="">'+esc(tr('No message (just open the chat)'))+'</option>'+state.tpls.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
  sel.value=state.tpls.some(t=>t.id===cur)?cur:'';
  renderQVars();
}
function qTplRaw(){const t=state.tpls.find(x=>x.id===$('qTpl').value);return t?t.body:''}
function renderQVars(){
  const v=$('qVars'),keys=customKeys(qTplRaw());
  if(!keys.length){v.hidden=true;v.innerHTML='';return}
  v.innerHTML='<p>'+esc(tr('Same value for everyone in this queue:'))+'</p>'+keys.map(k=>`<label class="var"><span>{${esc(k)}}</span><input class="txt" dir="auto" data-k="${esc(k)}" value="${esc(qExtra[k]||'')}"></label>`).join('');
  v.hidden=false;
}
$('qVars').addEventListener('input',e=>{const k=e.target.dataset.k;if(k)qExtra[k]=e.target.value.trim()});
$('qTpl').addEventListener('change',()=>{store.set('qc_qtpl',$('qTpl').value);renderQVars();qParse()});

export function qParse(){
  store.set('qc_qdraft',qText.value);
  /* O5: numbers flagged do-not-contact never enter a queue. */
  const all=extractWithNames(qText.value);
  const dnc=all.filter(x=>{const r=state.recents.find(r=>r.full===x.full);return r&&r.dnc}).length;
  qFoundList=all.filter(x=>{const r=state.recents.find(r=>r.full===x.full);return !r||!r.dnc});
  const named=qFoundList.filter(x=>x.name).length,
    knownRecs=qFoundList.map(x=>state.recents.find(r=>r.full===x.full)).filter(Boolean),
    known=knownRecs.length,
    lastAt=knownRecs.reduce((m,r)=>Math.max(m,r.at||0),0),
    lastAgo=lastAt&&Date.now()-lastAt<RECENT_MS?ago(lastAt):'',
    el=$('qFound');
  el.className='hint'+(qFoundList.length?' ok':'')+(lastAgo&&Date.now()-lastAt<DUP_MS?' warn':'');
  el.textContent=qFoundList.length
    ?tr(`${qFoundList.length} number${qFoundList.length>1?'s':''} found, ${named} with a name${known?`, ${known} already known${lastAgo?` — last messaged ${lastAgo}`:''}`:''}${dnc?`, ${dnc} skipped — do not contact`:''}.`)
    :tr('Paste numbers from a sheet, a message or an email.');
  const big=$('qBig');
  if(big){
    big.hidden=qFoundList.length<=25;
    big.textContent=tr(`Big batch (${qFoundList.length}) — consider splitting it to protect your WhatsApp account.`);
  }
  $('qStart').setAttribute('aria-disabled',!qFoundList.length);
  $('qStart').textContent=qFoundList.length?tr(`Start queue (${qFoundList.length})`):tr('Start queue');
}
qText.addEventListener('input',qParse);
function saveQ(){store.set('qc_queue',q)}
function nextPending(from){
  const i=q.items.findIndex((x,k)=>k>from&&x.status==='pending');
  if(i>=0)return i;const j=q.items.findIndex(x=>x.status==='pending');return j>=0?j:null;
}
$('qStart').onclick=()=>{
  if(!qFoundList.length)return;
  const raw=qTplRaw(),missing=customKeys(raw).filter(k=>!qExtra[k]);
  if(missing.length){toast(tr('Fill {'+missing.join('}, {')+'} first'));return}
  /* Q0: known numbers inherit their saved name when the paste has none. */
  q={items:qFoundList.map(n=>{
    const kr=state.recents.find(x=>x.full===n.full);
    return {full:n.full,code:n.code,local:n.local,country:n.country,name:n.name||(kr&&kr.label)||'',status:'pending'};
  }),raw,extra:Object.assign({},qExtra),idx:0,arm:false,pace:paceMs(store.get('qc_qpace',3000)),app:store.get('qc_qapp',state.app||'wa')};
  lockUntil=0;
  saveQ();renderQueue();
};
function qMessage(it){return q.raw?fillTpl(q.raw,Object.assign(autoVars(q.raw),q.extra,{name:it.name||''}),q.items.indexOf(it)):''}

/* Q5: batch memory — last finished batch + per-ISO-week sent counter. */
function bumpWeek(){
  const wk=isoWeekKey(new Date()),cur=store.get('qc_qweek',null);
  store.set('qc_qweek',cur&&cur.wk===wk?{wk,n:cur.n+1}:{wk,n:1});
}
function renderQStats(){
  const el=$('qStats');if(!el)return;
  const last=store.get('qc_qlast',null),wk=store.get('qc_qweek',null),parts=[];
  if(last)parts.push(tr(`Last batch: ${last.sent} sent · ${last.skipped} skipped · ${fmtShort(last.at)}`));
  if(wk&&wk.wk===isoWeekKey(new Date())&&wk.n)parts.push(tr(`${wk.n} sent this week`));
  el.hidden=!parts.length;
  el.textContent=parts.join(' — ');
}

/* Q2: pacing — lock Open chat for q.pace ms after each fire. */
let lockUntil=0,lockTimer=null,lockIv=null;
function clearLock(){clearTimeout(lockTimer);clearInterval(lockIv);lockUntil=0}
function paintLock(){
  const b=$('qOpen');if(!b)return;
  if(q&&lockUntil>Date.now()){
    b.textContent=tr(`Open chat (${Math.ceil((lockUntil-Date.now())/1000)})`);
    b.setAttribute('aria-disabled','true');
  }else{
    b.textContent=tr('Open chat');
    b.setAttribute('aria-disabled','false');
  }
}
function armLock(){
  clearLock();
  const p=q?q.pace:0;
  if(!p){paintLock();return}
  lockUntil=Date.now()+p;
  lockIv=setInterval(()=>{if(Date.now()>=lockUntil){clearInterval(lockIv);paintLock()}else paintLock()},250);
  lockTimer=setTimeout(()=>{lockUntil=0;paintLock()},p+80);
}
$('qPace').addEventListener('change',()=>{
  const v=paceMs(+($('qPace').value)||0);
  store.set('qc_qpace',v);
  if(q){q.pace=v;saveQ()}
});

/* Per-queue "Open in": WhatsApp or WhatsApp Business. While a queue runs the
   choice lives on q.app (applies to the next opens); in setup it persists as
   the qc_qapp default and is copied into each new queue. */
function qAppVal(){return q?(q.app||'wa'):store.get('qc_qapp',state.app||'wa')}
function paintQApp(){
  const v=qAppVal();
  document.querySelectorAll('[data-qapp]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.qapp===v)));
}
['qApps','qRunApps'].forEach(id=>{
  const el=$(id);if(!el)return;
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-qapp]');if(!b)return;
    if(q){q.app=b.dataset.qapp;saveQ()}else store.set('qc_qapp',b.dataset.qapp);
    paintQApp();
  });
});

export function renderQueue(){
  const setup=$('qSetup'),run=$('qRun'),list=$('qList');
  paintQWarn(store.get('qc_qday',null));
  if(!q){
    setup.hidden=false;run.hidden=true;list.hidden=true;
    qText.value=qText.value||store.get('qc_qdraft','');
    const ps=$('qPace');if(ps)ps.value=String(store.get('qc_qpace',3000));
    renderQStats();
    paintQApp();
    qParse();return;
  }
  setup.hidden=true;run.hidden=false;list.hidden=false;
  paintQApp();
  const sent=q.items.filter(x=>x.status==='sent').length,sk=q.items.filter(x=>x.status==='skipped').length,tot=q.items.length;
  $('qBar').style.width=Math.round((sent+sk)/tot*100)+'%';
  const via=(q.app||'wa')==='wb'?tr(' · WhatsApp Business'):'';
  $('qEnd').textContent=q.idx===null?tr('New queue'):tr('End queue');
  const ps=$('qPace');if(ps)ps.value=String(q.pace||0);
  if(q.idx===null){
    $('qProg').textContent=tr(`Finished${via}`);
    /* Q5: resume covers jumped-away opened items and retryable skips. */
    const resume=q.items.filter(x=>x.status==='opened'||(x.status==='skipped'&&retryableSkipped(x.why))).length;
    $('qCur').innerHTML=`<p style="margin:0">${tr(`${sent} sent, ${sk} skipped. Tap a contact below to open it again.`)}</p>`
      +(sent?`<label class="field"><span class="lbl">${tr('Task (optional)')}</span><input class="txt" id="qTask" dir="auto" autocomplete="off" placeholder="${esc(tr('e.g. Price follow-up'))}"></label>
        <div class="wrapr"><span class="bk">${tr(`Follow up with the ${sent} sent:`)}</span><button type="button" class="btn small" data-qfu="3">${tr('in 3 days')}</button><button type="button" class="btn small" data-qfu="7">${tr('in 1 week')}</button></div>`:'')
      +(resume?`<button type="button" class="btn small" data-qretry>${tr(`Resume ${resume}`)}</button>`:'');
    $('qActs').hidden=true;
  }else{
    const it=q.items[q.idx],c=COUNTRIES.find(x=>x.id===it.country);
    /* Q0: known line — remember who you're refreshing before opening. */
    const kr=state.recents.find(x=>x.full===it.full);
    const bits=[];
    if(kr&&(kr.status||kr.due))bits.push(tr(`In your follow-ups: ${kr.status?ST_LABEL[kr.status]:tr('no status')}${kr.due&&isOpen(kr)?' · '+dueWhen(kr):''}`));
    if(kr&&kr.at&&Date.now()-kr.at<RECENT_MS)bits.push(tr(`Messaged ${ago(kr.at)}`));
    const known=bits.length?`<div class="meta">${esc(bits.join(' · '))}</div>`:'';
    $('qProg').textContent=`${q.idx+1} of ${tot} · ${sent} sent${via}`;
    $('qCur').innerHTML=`<div class="field"><label class="lbl" for="qName">Name</label><input id="qName" class="txt" dir="auto" autocomplete="off" value="${esc(it.name||'')}" placeholder="Client name"></div>
      <div class="rnum">+${it.code?it.code+' '+it.local:it.full} <span class="meta">${c&&c.id!=='ot'?tr(c.name):''}</span></div>
      ${known}
      ${q.raw?`<div class="qmsg" id="qMsg" dir="auto">${esc(qMessage(it))}</div>`:''}`;
    const opened=it.status==='opened';
    $('qOpen').hidden=opened;
    $('qSent').hidden=!opened;
    $('qActs').hidden=false;
    paintLock();
    $('qName').addEventListener('input',e=>{it.name=e.target.value.trim();saveQ();const m=$('qMsg');if(m)m.textContent=qMessage(it)});
  }
  list.innerHTML=q.items.map((x,i)=>{
    const tag=x.status==='skipped'&&x.why?` <small>(${esc(tr(WHY_LBL[x.why]||x.why))})</small>`:'';
    return `<div class="item${i===q.idx?' cur':''}"><span class="st ${x.status==='pending'?'':x.status}">${x.status==='sent'?'✓':x.status==='skipped'?'–':x.status==='opened'?'…':i+1}</span><button class="main" data-qi="${i}">${x.name?`<div class="lab" dir="auto">${esc(x.name)}</div>`:''}<div class="rnum">+${x.code?x.code+' '+x.local:x.full}${tag}</div></button></div>`;
  }).join('');
}
$('qList').addEventListener('click',e=>{const b=e.target.closest('[data-qi]');if(!b||!q)return;q.idx=+b.dataset.qi;saveQ();renderQueue();window.scrollTo({top:0,behavior:'smooth'})});

/* Q1: Open chat stages the item (pending → opened) and opens WhatsApp.
   Sent/skipped rows: reopen only — no state rewrite, no Recent re-push. */
$('qOpen').onclick=()=>{
  if(!q||q.idx===null)return;
  if(Date.now()<lockUntil)return;
  const it=q.items[q.idx],msg=qMessage(it),left=msg.match(VAR_RE);
  if(left){toast(tr(left.includes('{name}')?'Enter the name first':'Fill '+[...new Set(left)].join(', ')+' first'));const n=$('qName');if(n)n.focus();return}
  if(it.status==='pending'){it.status='opened';saveQ();renderQueue()}
  armLock();
  bumpQDay();
  openChat(buildLink(it.full,msg,q.app),it.full);
};
/* O6: daily opened-chat counter + ban-safety warning banner. */
function bumpQDay(){
  const nb=bumpDayCounter(store.get('qc_qday',null),todayStr());
  store.set('qc_qday',nb);
  paintQWarn(nb);
}
function paintQWarn(c){
  const el=$('qWarn');if(!el)return;
  const n=c&&c.n||0;
  el.hidden=!(n>=DAY_WARN_AT&&store.get('qc_qdayHide','')!==todayStr());
  if(!el.hidden)el.innerHTML=esc(tr(`${n} chats opened today — WhatsApp restricts accounts that message many people who haven't saved their number.`))+' <button type="button" class="btn small" data-qwarn-x>'+esc(tr('Dismiss'))+'</button>';
}
$('qWarn').addEventListener('click',e=>{
  if(!e.target.closest('[data-qwarn-x]'))return;
  store.set('qc_qdayHide',todayStr());
  const el=$('qWarn');if(el)el.hidden=true;
});
/* Q1/Q4: confirming sent — advance, weekly counter, history, undo. */
$('qSent').onclick=()=>{
  if(!q||q.idx===null)return;
  const it=q.items[q.idx],prevIdx=q.idx;
  if(it.status!=='opened')return;
  it.status='sent';it.at=Date.now();
  pushRecent({full:it.full,code:it.code,local:it.local,country:it.country,label:it.name});
  const r=state.recents.find(x=>x.full===it.full);
  if(r){logEv(r,'queue',it.name||'');logOutcome(r,'sent')}
  bumpWeek();
  q.idx=nextPending(q.idx);
  if(q.idx===null)store.set('qc_qlast',{sent:q.items.filter(x=>x.status==='sent').length,skipped:q.items.filter(x=>x.status==='skipped').length,at:Date.now()});
  saveQ();renderQueue();
  toast(tr('Marked sent'),{type:'ok',dur:6000,action:{label:tr('Undo'),fn:()=>{
    if(!q)return;
    const x=q.items.find(y=>y.full===it.full);
    if(x&&x.status==='sent'){x.status='opened';q.idx=prevIdx;saveQ();renderQueue()}
  }}});
};
/* Q3: skip always asks why; 'wrong' offers to mark the Recent lost. */
let whySheet=null;
function closeWhySheet(){if(whySheet){whySheet.remove();whySheet=null}}
function openWhySheet(cb){
  closeWhySheet();
  whySheet=document.createElement('div');whySheet.className='qc-sheet-back';
  whySheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('Why skip?'))}">
    <div class="qc-ct-head"><b>${esc(tr('Why skip?'))}</b><button type="button" class="btn small" data-x aria-label="${esc(tr('Close'))}">✕</button></div>
    ${SKIP_REASONS.map(([k,l])=>`<button type="button" class="qc-sheet-item" data-why="${k}">${esc(tr(l))}</button>`).join('')}
    <button type="button" class="qc-sheet-item cancel" data-why="">${esc(tr('Skip without reason'))}</button>
  </div>`;
  whySheet.addEventListener('click',e=>{
    if(e.target===whySheet||e.target.closest('[data-x]')){closeWhySheet();return}
    const b=e.target.closest('[data-why]');if(!b)return;
    closeWhySheet();if(cb)cb(b.dataset.why);
  });
  document.body.appendChild(whySheet);
}
$('qSkip').onclick=()=>{
  if(!q||q.idx===null)return;
  const it=q.items[q.idx];
  if(it.status==='sent')return;
  openWhySheet(why=>{
    const prevIdx=q.idx,prevStatus=it.status;
    it.why=why;it.status='skipped';
    q.idx=nextPending(q.idx);saveQ();renderQueue();
    const r=state.recents.find(x=>x.full===it.full);
    if(why==='wrong'){
      toast(tr('Skipped: wrong number'),{type:'info',dur:6000,action:r?{label:tr('Mark as lost'),fn:()=>{
        if(r.status!=='lost')openLostSheet(r);
      }}:undefined});
    }else{
      /* O5: "Not interested" is a stop — never queue this number again. */
      if(why==='no'&&r&&!r.dnc){r.dnc=1;r._lu=Date.now();logEv(r,'dnc',1);saveRecents()}
      toast(why==='no'?tr('Skipped — this number will not be queued again'):tr('Skipped'),{type:'info',dur:6000,action:{label:tr('Undo'),fn:()=>{
        if(!q)return;
        const x=q.items.find(y=>y.full===it.full);
        if(x&&x.status==='skipped'){x.status=prevStatus;x.why=prevStatus==='skipped'?x.why:'';q.idx=prevIdx;saveQ();renderQueue()}
      }}});
    }
  });
};
$('qPrev').onclick=()=>{if(!q)return;q.idx=Math.max(0,(q.idx===null?q.items.length:q.idx)-1);saveQ();renderQueue()};
let endTimer;
$('qEnd').onclick=()=>{
  if(!q)return;
  if(q.idx!==null&&!q.arm){q.arm=true;$('qEnd').textContent=tr('Tap again to end');$('qEnd').classList.add('danger');clearTimeout(endTimer);endTimer=setTimeout(()=>{if(q){q.arm=false;$('qEnd').classList.remove('danger');renderQueue()}},3000);return}
  clearTimeout(endTimer);$('qEnd').classList.remove('danger');
  clearLock();
  q=null;saveQ();qText.value='';qParse();renderQueue();
};
/* Finish-line actions: batch follow-up (Q5, with optional task text) and
   resume of opened + retryable-skipped items. */
$('qCur').addEventListener('click',e=>{
  if(!q)return;
  const rb=e.target.closest('[data-qretry]');
  if(rb){
    q.items.forEach(x=>{if(x.status==='opened'||(x.status==='skipped'&&retryableSkipped(x.why))){x.status='pending';delete x.why}});
    q.idx=q.items.findIndex(x=>x.status==='pending');
    saveQ();renderQueue();return;
  }
  const b=e.target.closest('[data-qfu]');if(!b)return;
  const ds=todayStr(+b.dataset.qfu),taskEl=$('qTask'),task=taskEl?taskEl.value.trim().slice(0,140):'';let n=0;
  q.items.filter(i=>i.status==='sent').forEach(i=>{const r=state.recents.find(x=>x.full===i.full);if(r){
    setDueVal(r,ds);
    if(task){r.task=task;logEv(r,'task',task)}
    if(!isOpen(r)||!r.status)setStatus(r,'waiting');n++}});
  saveRecents();const msg=tr(`Follow-up set for ${n} contact${n===1?'':'s'}: ${dueLow(ds)}`);toast(msg,{type:'ok'});notifyEvent('due',msg,{tab:'fu'});
});

/* Q0: people picker — unified sheet over the phone book + recents; picks
   append as plain lines to the paste box so everything still flows through
   extract → merge. */
$('qPick').onclick=()=>pickPeople(rows=>{
  const lines=rows.map(r=>(r.name?r.name+' ':'')+'+'+r.digits);
  if(!lines.length)return;
  qText.value=(qText.value?qText.value.replace(/\s+$/,'')+'\n':'')+lines.join('\n');
  qParse();
  qText.scrollTop=qText.scrollHeight;
  toast(tr(`${lines.length} added to the list`));
});
