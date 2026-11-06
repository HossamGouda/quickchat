/* inq.js — multiple inquiries (quotations) per contact, v6 structural layer.
   One contact can carry several inquiries over time. Inquiry-scoped fields:
   status, value (quote value), valid (quote valid until), lostWhy, outcome,
   seq (message-sequence step), vars (template variables). They live in r.inq[]
   and are MIRRORED onto the top level of r for the ACTIVE inquiry (r.act), so
   the several hundred existing read sites (card, lists, stats, queue, notify,
   sync export) keep working without change. All writes to these fields must
   go through inqSet/inqAdd/inqSwitch — enforced by tools/inq_lint.cjs.

   Records that predate v6 have the fields at top level with no r.inq; the
   first access migrates them into inq[0] lazily. migrateRecents() runs the
   same pass at boot so the UI can list inquiries immediately. */

import {STATUSES, OUTCOMES} from './core.js';

export const INQ_FIELDS=['status','value','valid','lostWhy','outcome','seq','vars'];
const DEFAULTS={status:'',value:0,valid:'',lostWhy:'',outcome:'',seq:null,vars:{}};
const OPEN=s=>s!=='won'&&s!=='lost';

function newId(r){let id;do{id='q'+Math.random().toString(36).slice(2,8)}while((r.inq||[]).some(i=>i.id===id));return id}

/* Clamp one patch to the canonical shapes; unknown keys are ignored. */
function clean(patch){
  const o={};
  if('status'in patch)o.status=STATUSES.includes(patch.status)?patch.status:'';
  if('value'in patch){const v=Math.round(Number(patch.value));o.value=Number.isFinite(v)&&v>=0?v:0}
  if('valid'in patch)o.valid=/^\d{4}-\d\d-\d\d$/.test(patch.valid||'')?patch.valid:'';
  if('lostWhy'in patch)o.lostWhy=String(patch.lostWhy||'').slice(0,80);
  if('outcome'in patch)o.outcome=OUTCOMES.includes(patch.outcome)?patch.outcome:'';
  if('seq'in patch){const s=patch.seq;o.seq=s&&typeof s==='object'&&s.k?{k:String(s.k),step:Math.min(3,Math.max(1,+s.step||1))}:null}
  if('vars'in patch){const v=patch.vars;o.vars=v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
  return o;
}

/* Top level of r <- active inquiry (always all seven keys, defaults filled). */
function mirror(r){
  const a=inqActive(r);
  for(const k of INQ_FIELDS)r[k]=a&&a[k]!==undefined?a[k]:DEFAULTS[k];
}

/* Lazy migration: ensure r.inq exists (created from top-level data when the
   record carries any), r.act points at a real inquiry, mirror is refreshed. */
export function inqEnsure(r){
  if(!r)return r;
  const has=INQ_FIELDS.some(k=>{const v=r[k];return v!==undefined&&v!==null&&v!==''&&v!==0&&!(k==='vars'&&typeof v==='object'&&!Object.keys(v).length)&&!(k==='seq'&&v===null)});
  if(!Array.isArray(r.inq)||!r.inq.length){
    if(!has)return r;                       /* fresh contact: stay inquiry-less */
    const first={id:'q1'};
    for(const k of INQ_FIELDS)if(r[k]!==undefined&&!(k==='vars'&&!Object.keys(r.vars||{}).length))first[k]=r[k];
    r.inq=[first];r.act='q1';
  }else if(!r.act||!r.inq.some(i=>i.id===r.act)){
    r.act=r.inq[0].id;
  }
  mirror(r);
  return r;
}

/* The active inquiry object, or null for a fresh contact with no data yet. */
export function inqActive(r){
  if(!r)return null;
  if(!Array.isArray(r.inq)||!r.inq.length)return null;
  if(!r.act||!r.inq.some(i=>i.id===r.act))r.act=r.inq[0].id;
  return r.inq.find(i=>i.id===r.act)||r.inq[0]||null;
}

export function inqList(r){inqEnsure(r);return Array.isArray(r.inq)?r.inq:[]}

/* Write to the active inquiry and refresh the mirror. */
export function inqSet(r,patch){
  inqEnsure(r);
  if(!inqActive(r)){r.inq=[{id:'q1'}];r.act='q1'}
  Object.assign(inqActive(r),clean(patch));
  mirror(r);
  r._lu=Date.now();
  return inqActive(r);
}

/* Add a blank inquiry and make it active. Returns the new inquiry. */
export function inqAdd(r,label){
  inqEnsure(r);
  if(!Array.isArray(r.inq))r.inq=[];
  const a={id:newId(r)};
  if(label)a.label=String(label).slice(0,40);
  r.inq.push(a);r.act=a.id;
  mirror(r);
  r._lu=Date.now();
  return a;
}

/* Switch the active pointer; re-derives the mirror (self-heals any drift). */
export function inqSwitch(r,id){
  inqEnsure(r);
  if(!r.inq||!r.inq.some(i=>i.id===id))return null;
  r.act=id;mirror(r);r._lu=Date.now();
  return inqActive(r);
}

/* Delete an inquiry (caller shows the undo toast). Active pointer moves to
   the most recent remaining inquiry; with none left the record goes back to
   a fresh, inquiry-less state. */
export function inqDel(r,id){
  inqEnsure(r);
  if(!r.inq||!r.inq.length)return false;
  const i=r.inq.findIndex(x=>x.id===id);
  if(i<0)return false;
  const gone=r.inq[i];
  r.inq.splice(i,1);
  if(!r.inq.length){delete r.inq;delete r.act;for(const k of INQ_FIELDS)delete r[k]}
  else if(r.act===id){r.act=r.inq[Math.max(0,i-1)].id;mirror(r)}
  r._lu=Date.now();
  return gone;
}

/* Contact appears in Follow while ANY inquiry is open (or, legacy records,
   while the top-level status is open). */
export function hasOpenInq(r){
  if(!r)return false;
  if(Array.isArray(r.inq)&&r.inq.length)return r.inq.some(i=>OPEN(i.status||''));
  return OPEN(r.status||'');
}

/* Merge a loser's inquiries into r (contact merge). Dedupes by id, re-keys
   collisions so ids stay unique; r.act is untouched. */
export function inqMerge(r,loser){
  inqEnsure(r);inqEnsure(loser);
  if(!loser.inq||!loser.inq.length)return;
  if(!Array.isArray(r.inq))r.inq=[];
  for(const li of loser.inq){
    let id=li.id;
    if(r.inq.some(x=>x.id===id)){id=newId(r)}
    r.inq.push(Object.assign({},li,{id}));
  }
  if(!r.act&&r.inq.length)r.act=r.inq[0].id;
  mirror(r);
  r._lu=Date.now();
}

/* Test helper: true when the top-level mirror matches the active inquiry. */
export function inqCheck(r){
  if(!r)return true;
  if(!Array.isArray(r.inq)||!r.inq.length)return INQ_FIELDS.every(k=>r[k]===undefined);
  const a=inqActive(r);
  return INQ_FIELDS.every(k=>{
    const want=a[k]===undefined?DEFAULTS[k]:a[k];
    if(k==='vars')return JSON.stringify(r[k]||{})===JSON.stringify(want||{});
    if(k==='seq')return JSON.stringify(r[k]||null)===JSON.stringify(want||null);
    return r[k]===want;
  });
}

/* Boot migration pass over the recents list. */
export function migrateRecents(list){for(const r of list||[])inqEnsure(r);return list}
