/* recents.js — recent numbers list: labels, search, trim, and reuse. */
import {$, store, state, COUNTRIES, country, ST_LABEL, ago, esc, logEv, toast} from './core.js';
import {tr} from './i18n.js';
import {setCountry, update, currentNumber, nameFromLabel, ccIn, numIn, labelIn} from './dialer.js';
import {renderVars, applyVars} from './templates.js';
import {renderFollowups, cycleStatus} from './followups.js';
import {renderBk} from './backup.js';
import {addTombstone, removeTombstone} from './tombstones.js';

/* Deletion bookkeeping: tombstone for cloud sync + nudge sync to propagate. */
function deleteRecent(f){
  addTombstone('c',f);
  state.recents=state.recents.filter(x=>x.full!==f);
  store.set('qc_recents',state.recents);
  if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
}

export function keep(r){return r.label||r.due||r.status||r.note||r.value||r.fuMsg||r.dnc||r.company||r.src}
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

/* Row builders: one function per visual state, kept out of the renderer. */
function editingRow(r,f){
  return `<div class="item editing">
    <div class="rnum">+${r.code} ${r.local}</div>
    <input class="txt" id="eLabel" dir="auto" placeholder="Name / note" value="${esc(r.label||'')}">
    <div class="acts"><button class="btn small" data-act="lcancel">Cancel</button><button class="btn small primary" data-act="lsave" data-f="${f}">Save</button></div></div>`;
}
function actsFor(r,f){
  return `<button class="btn small" data-act="ledit" data-f="${f}">${r.label?'Rename':'Name'}</button><button class="btn small" data-act="rm" data-f="${f}" aria-label="Remove">✕</button>`;
}
function recentRow(r,c,f){
  const conf=r._conf&&Date.now()-r._conf<864e5;
  return `<div class="item${r.dnc?' dnc':''}"><button class="main" data-act="reuse" data-f="${f}">${r.label?`<div class="lab" dir="auto">${esc(r.label)}</div>`:''}<div class="rnum">+${r.code} ${r.local}</div><div class="meta">${r.dnc?`<span class="dnc-badge">${esc(tr('Do not contact'))}</span> · `:''}${c?c.name:''} · ${ago(r.at)}${conf?` · <span class="conf">Updated from another device</span>`:''}</div></button><div class="acts">${actsFor(r,f)}</div></div>`;
}

export function renderRecents(){
  renderFollowups();
  const el=$('recents'),w=$('clearRecentWrap'),sIn=$('search');
  sIn.hidden=state.recents.length<6;
  if(!state.recents.length){el.innerHTML='<div class="empty">Numbers you open will appear here. Add a name to keep a number permanently.</div>';w.innerHTML='';return}
  const hasUnl=state.recents.some(r=>!keep(r));
  w.innerHTML=hasUnl?`<button class="btn small" data-act="clearall">Clear unnamed</button>`:'';
  const q=sIn.hidden?'':sIn.value.trim().toLowerCase(),qd=q.replace(/\D/g,'');
  const list=state.recents.filter(r=>!q||(r.label||'').toLowerCase().includes(q)||(r.company||'').toLowerCase().includes(q)||(qd&&r.full.includes(qd))||(ST_LABEL[r.status]||'').toLowerCase()===q);
  if(!list.length){el.innerHTML='<div class="empty">No numbers match “'+esc(q)+'”.</div>';return}
  el.innerHTML=list.map(r=>{
    const c=COUNTRIES.find(x=>x.id===r.country),f=r.full;
    return state.labelEditing===f?editingRow(r,f):recentRow(r,c,f);
  }).join('');
  const e=$('eLabel');if(e){e.focus();e.onkeydown=ev=>{if(ev.key==='Enter')el.querySelector('[data-act="lsave"]').click()}}
}
export function loadRecent(r){
  setCountry(r.country);if(r.country==='ot')ccIn.value=r.code;numIn.value=r.local;labelIn.value=r.label||'';
  $('picks').hidden=true;update();
  if(state.pending&&state.pending.nameAuto&&state.pending.keys.includes('name')){state.pending.vals.name=nameFromLabel();renderVars();applyVars()}
}

/* Row actions as a registry; handlers that don't need the record use the
   button's data-f directly via the wrapper below. */
/* U1: deletion is instant and reversible — the undo toast restores the
   record at its old slot and lifts its tombstone so sync re-uploads it. */
function deleteRecentUndo(r){
  const i=state.recents.indexOf(r);
  deleteRecent(r.full);
  toast(tr('Number deleted'),{type:'info',dur:6000,action:{label:tr('Undo'),fn:()=>{
    if(state.recents.some(x=>x.full===r.full))return;
    removeTombstone('c',r.full);
    r._lu=Date.now();
    state.recents.splice(Math.min(i,state.recents.length),0,r);
    store.set('qc_recents',state.recents);
    if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
    renderRecents();renderBk();
  }}});
}
function clearUnnamed(){
  const removed=state.recents.filter(r=>!keep(r));
  removed.forEach(r=>addTombstone('c',r.full));
  if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
  state.recents=state.recents.filter(keep);
  store.set('qc_recents',state.recents);
  if(removed.length)toast(tr('Removed unnamed numbers'),{type:'info',dur:6000,action:{label:tr('Undo'),fn:()=>{
    removed.forEach(r=>removeTombstone('c',r.full));
    state.recents=removed.concat(state.recents);
    store.set('qc_recents',state.recents);
    if(window.dispatchEvent)window.dispatchEvent(new Event('qc-data-changed'));
    renderRecents();renderBk();
  }}});
}
const RECENT_ACTIONS={
  reuse:r=>{loadRecent(r);window.scrollTo({top:0,behavior:'smooth'})},
  ledit:r=>{state.labelEditing=r.full},
  lcancel:()=>{state.labelEditing=null},
  lsave:r=>{r.label=$('eLabel').value.trim();r._lu=Date.now();state.labelEditing=null;trimRecents();store.set('qc_recents',state.recents);renderBk();toast(r.label?'Name saved':'Name removed')},
  rm:r=>deleteRecentUndo(r),
  cyc:r=>cycleStatus(r),
  clearall:()=>clearUnnamed(),
};
function recentClick(e){
  const b=e.target.closest('[data-act]');if(!b)return;
  const act=b.dataset.act,f=b.dataset.f,r=state.recents.find(x=>x.full===f);
  const h=RECENT_ACTIONS[act];if(!h)return;
  if(r||act==='clearall'||act==='lcancel')h(r||{full:f});
  renderRecents();
}

$('search').addEventListener('input',renderRecents);
$('recents').addEventListener('click',recentClick);
$('clearRecentWrap').addEventListener('click',recentClick);

export function saveRecents(){store.set('qc_recents',state.recents);renderRecents();renderBk()}
