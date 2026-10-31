/* recents.js — recent numbers list: labels, search, trim, and reuse. */
import {$, store, state, COUNTRIES, country, ST_LABEL, ago, esc, logEv, toast} from './core.js';
import {setCountry, update, currentNumber, nameFromLabel, ccIn, numIn, labelIn} from './dialer.js';
import {renderVars, applyVars} from './templates.js';
import {renderFollowups, cycleStatus} from './followups.js';
import {renderBk} from './backup.js';
import {addTombstone} from './tombstones.js';

/* Deletion bookkeeping: tombstone for cloud sync + nudge sync to propagate. */
function deleteRecent(f){
  addTombstone('c',f);
  state.recents=state.recents.filter(x=>x.full!==f);
  store.set('qc_recents',state.recents);
  if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
}

export function keep(r){return r.label||r.due||r.status||r.note||r.value||r.fuMsg}
export function trimRecents(){let un=0;state.recents=state.recents.filter(r=>keep(r)||++un<=20).slice(0,500)}

export function addRecent(){
  const r=currentNumber();
  if(!r) return;
  const c=country(),label=labelIn.value.trim();
  pushRecent({full:r.full,code:r.code,local:r.local,country:c.id,label});
}

export function pushRecent(n){
  const prev=state.recents.find(x=>x.full===n.full)||{};
  state.recents=state.recents.filter(x=>x.full!==n.full);
  const r=Object.assign({},prev,{full:n.full,code:n.code,local:n.local,country:n.country,at:Date.now(),label:n.label||prev.label||''});r._lu=Date.now();
  logEv(r,'msg');state.recents.unshift(r);
  trimRecents();store.set('qc_recents',state.recents);renderRecents();renderBk();
}

export function renderRecents(){
  renderFollowups();
  const el=$('recents'),w=$('clearRecentWrap'),sIn=$('search');
  sIn.hidden=state.recents.length<6;
  if(!state.recents.length){el.innerHTML='<div class="empty">Numbers you open will appear here. Add a name to keep a number permanently.</div>';w.innerHTML='';return}
  const hasUnl=state.recents.some(r=>!keep(r));
  w.innerHTML=state.confirmClear
    ?`<span class="confirm">Remove numbers without a name or follow-up? <button class="btn small" data-act="noclear">No</button><button class="btn small danger solid" data-act="yesclear">Yes</button></span>`
    :(hasUnl?`<button class="btn small" data-act="clearall">Clear unnamed</button>`:'');
  const q=sIn.hidden?'':sIn.value.trim().toLowerCase(),qd=q.replace(/\D/g,'');
  const list=state.recents.filter(r=>!q||(r.label||'').toLowerCase().includes(q)||(qd&&r.full.includes(qd))||(ST_LABEL[r.status]||'').toLowerCase()===q);
  if(!list.length){el.innerHTML='<div class="empty">No numbers match “'+esc(q)+'”.</div>';return}
  el.innerHTML=list.map(r=>{
    const c=COUNTRIES.find(x=>x.id===r.country),f=r.full;
    if(state.labelEditing===f)return `<div class="item editing">
      <div class="rnum">+${r.code} ${r.local}</div>
      <input class="txt" id="eLabel" dir="auto" placeholder="Name / note" value="${esc(r.label||'')}">
      <div class="acts"><button class="btn small" data-act="lcancel">Cancel</button><button class="btn small primary" data-act="lsave" data-f="${f}">Save</button></div></div>`;
    const acts=state.confirmRm===f
      ?`<span class="confirm">Delete? <button class="btn small" data-act="normv">No</button><button class="btn small danger solid" data-act="yesrm" data-f="${f}">Yes</button></span>`
      :`<button class="btn small" data-act="ledit" data-f="${f}">${r.label?'Rename':'Name'}</button><button class="btn small" data-act="rm" data-f="${f}" aria-label="Remove">✕</button>`;
    const conf=r._conf&&Date.now()-r._conf<864e5;
    return `<div class="item"><button class="main" data-act="reuse" data-f="${f}">${r.label?`<div class="lab" dir="auto">${esc(r.label)}</div>`:''}<div class="rnum">+${r.code} ${r.local}</div><div class="meta">${c?c.name:''} · ${ago(r.at)}${conf?` · <span class="conf">Updated from another device</span>`:''}</div></button><div class="acts">${acts}</div></div>`;
  }).join('');
  const e=$('eLabel');if(e){e.focus();e.onkeydown=ev=>{if(ev.key==='Enter')el.querySelector('[data-act="lsave"]').click()}}
}
export function loadRecent(r){
  setCountry(r.country);if(r.country==='ot')ccIn.value=r.code;numIn.value=r.local;labelIn.value=r.label||'';
  $('picks').hidden=true;update();
  if(state.pending&&state.pending.nameAuto&&state.pending.keys.includes('name')){state.pending.vals.name=nameFromLabel();renderVars();applyVars()}
}

function recentClick(e){
  const b=e.target.closest('[data-act]');if(!b)return;
  const act=b.dataset.act,f=b.dataset.f,r=state.recents.find(x=>x.full===f);
  if(act==='reuse'){loadRecent(r);window.scrollTo({top:0,behavior:'smooth'});return}
  if(act==='ledit'){state.labelEditing=f;state.confirmRm=null}
  if(act==='lcancel'){state.labelEditing=null}
  if(act==='lsave'){r.label=$('eLabel').value.trim();r._lu=Date.now();state.labelEditing=null;trimRecents();store.set('qc_recents',state.recents);renderBk();toast(r.label?'Name saved':'Name removed')}
  if(act==='rm'){if(r&&r.label)state.confirmRm=f;else deleteRecent(f)}
  if(act==='normv')state.confirmRm=null;
  if(act==='yesrm'){deleteRecent(f);state.confirmRm=null;renderBk();toast('Number deleted')}
  if(act==='clearall')state.confirmClear=true;
  if(act==='noclear')state.confirmClear=false;
  if(act==='cyc'){if(r)cycleStatus(r)}
  if(act==='yesclear'){state.recents.filter(r=>!keep(r)).forEach(r=>addTombstone('c',r.full));if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));state.recents=state.recents.filter(keep);state.confirmClear=false;store.set('qc_recents',state.recents)}
  renderRecents();
}

$('search').addEventListener('input',renderRecents);
$('recents').addEventListener('click',recentClick);
$('clearRecentWrap').addEventListener('click',recentClick);

export function saveRecents(){store.set('qc_recents',state.recents);renderRecents();renderBk()}
