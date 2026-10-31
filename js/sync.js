/* sync.js — Teable cloud sync.
   IndexedDB stays the source of truth; this module mirrors contacts and templates
   to the Teable base (js/sync-config.js) and merges remote changes back.
   Conflict rule per record: the side with the newer UpdatedAt wins. Deletions
   are not synced (v1): a record deleted on one side reappears from the other.

   The personal access token is entered in the Backup tab and kept in the
   on-device store only — it is never committed to the repo or shown in UI. */
import {$, store, state, COUNTRIES, STATUSES, toast} from './core.js';
import {TEABLE_API, TEABLE_TABLES as TBLS, TEABLE_MATCH_FIELDS as MATCH} from './sync-config.js';
import {saveRecents} from './recents.js';
import {renderTpls} from './templates.js';

const token=()=>store.get('qc_teable_token','');
const syncOn=()=>!!store.get('qc_sync_on',false);

async function tb(method, path, body){
  const res=await fetch(TEABLE_API+path,{
    method,
    headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
  if(res.status===401||res.status===403)throw new Error('Teable rejected the token. Check it in Settings.');
  if(!res.ok)throw new Error('Teable error '+res.status);
  const txt=await res.text();
  return txt?JSON.parse(txt):{};
}

/* Read every record of a table (paged). */
async function pullAll(tableId){
  const out=[];let offset=0;
  for(;;){
    const q=`/table/${tableId}/record?pageSize=1000&offset=${offset}`;
    const d=await tb('GET',q);
    const recs=d.records||[];
    out.push(...recs);
    if(recs.length<1000)break;
    offset+=recs.length;
  }
  return out;
}

function chunk(arr,n){const o=[];for(let i=0;i<arr.length;i+=n)o.push(arr.slice(i,i+n));return o}

/* ---- field mapping: local recent <-> Teable row ---- */
function dayMs(ds){const p=ds.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).getTime()}
function dayFromCell(v){
  if(typeof v==='number'&&v){const d=new Date(v);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  if(typeof v==='string'&&/^\d{4}-\d\d-\d\d/.test(v))return v.slice(0,10);
  return '';
}
function contactToFields(r){
  const f={Number:r.full,Code:r.code||'',Local:r.local||'',Country:r.country||'',Label:r.label||'',
    DueTime:r.dueTime||'',Value:+r.value||0,At:+r.at||Date.now(),
    Log:JSON.stringify(r.log||[]),UpdatedAt:r._lu||r.at||0};
  if(r.status)f.Status=r.status;
  if(r.due)f.Due=dayMs(r.due);
  if(r.note)f.Note=r.note;
  if(r.fuMsg)f.FuMsg=r.fuMsg;
  return f;
}
function contactFromRow(row){
  const g=row.fields||{};
  if(!g.Number)return null;
  let log=[];
  try{log=JSON.parse(g.Log||'[]')}catch(e){log=[]}
  return {full:String(g.Number),code:String(g.Code||''),local:String(g.Local||String(g.Number)),
    country:COUNTRIES.some(c=>c.id===g.Country)?g.Country:'ot',
    at:+g.At||Date.now(),label:String(g.Label||''),
    due:dayFromCell(g.Due),
    status:STATUSES.includes(g.Status)?g.Status:'',
    dueTime:/^\d\d:\d\d$/.test(g.DueTime||'')?g.DueTime:'',
    value:Math.round(+g.Value||0),
    note:String(g.Note||'').slice(0,500),fuMsg:String(g.FuMsg||'').slice(0,2000),
    log,_lu:+g.UpdatedAt||0};
}

/* ---- templates ---- */
function tplToFields(t){return {TplId:t.id,Title:t.title,Body:t.body,Pinned:!!t.pinned,UpdatedAt:t._lu||0}}
function tplFromRow(row){
  const g=row.fields||{};
  if(!g.TplId||typeof g.Body!=='string')return null;
  return {id:String(g.TplId),title:String(g.Title||g.Body.slice(0,30)),body:g.Body,pinned:!!g.Pinned,_lu:+g.UpdatedAt||0};
}

/* Push local rows in batches; returns total upserted. */
async function pushRows(tableId,matchField,fieldsList){
  let n=0;
  for(const part of chunk(fieldsList,50)){
    const d=await tb('POST',`/table/${tableId}/record/upsert`,{matchField,onConflict:'update',typecast:true,records:part.map(fields=>({fields}))});
    n+=(d.summary&&(d.summary.updated+d.summary.created))||part.length;
  }
  return n;
}

/* Full bidirectional sync of contacts + templates. */
export async function syncNow(){
  if(!token()){toast('Add your Teable token in the Backup section first');return false}
  if(navigator.onLine===false){toast('You are offline. Sync will run when you are back.');return false}
  renderSync();
  try{
    /* Contacts */
    const remote=new Map((await pullAll(TBLS.contacts)).map(r=>[String((r.fields||{}).Number||''),r]));
    const localByFull=new Map(state.recents.map(r=>[r.full,r]));
    let pushed=0,pulled=0;
    const pushList=[];
    for(const r of state.recents){
      const row=remote.get(r.full);
      if(!row){pushList.push(contactToFields(r));continue}
      if((+((row.fields||{}).UpdatedAt)||0)>(r._lu||r.at||0)){
        const merged=contactFromRow(row);
        if(merged){Object.assign(r,merged);pulled++}
      }else pushList.push(contactToFields(r));
    }
    for(const [num,row] of remote){
      if(!localByFull.has(num)&&contactFromRow(row)){state.recents.push(contactFromRow(row));pulled++}
    }
    pushed+=await pushRows(TBLS.contacts,MATCH.contacts,pushList);
    state.recents.sort((a,b)=>b.at-a.at);
    saveRecents();
    /* Templates */
    const rT=new Map((await pullAll(TBLS.templates)).map(r=>[String((r.fields||{}).TplId||''),r]));
    const localTpl=new Map(state.tpls.map(t=>[t.id,t]));
    const pushTpl=[];let tPulled=0;
    for(const t of state.tpls){
      const row=rT.get(t.id);
      if(!row){pushTpl.push(tplToFields(t));continue}
      if((+((row.fields||{}).UpdatedAt)||0)>(t._lu||0)){const m=tplFromRow(row);if(m){Object.assign(t,m);tPulled++}}else pushTpl.push(tplToFields(t));
    }
    for(const [id,row] of rT)if(!localTpl.has(id)&&tplFromRow(row)){state.tpls.push(tplFromRow(row));tPulled++}
    pushed+=await pushRows(TBLS.templates,MATCH.templates,pushTpl);
    store.set('qc_tpls',state.tpls);renderTpls();
    store.set('qc_last_sync',Date.now());
    toast(`Synced with Teable: ${pushed} sent, ${pulled+tPulled} received`);
    renderSync();
    return true;
  }catch(err){
    $('syncStatus').textContent=err.message||'Sync failed';
    toast('Sync failed: '+(err.message||'network error'));
    renderSync();
    return false;
  }
}

/* ---- Backup-tab UI ---- */
export function renderSync(){
  const el=$('syncStatus'),has=!!token();
  $('syncTokenRow').hidden=has;
  $('syncOff').hidden=!has;
  $('syncNow').hidden=!has;
  if(!has){el.textContent='Cloud sync (Teable) is off. Add a token to sync contacts and templates.';return}
  const last=store.get('qc_last_sync',0);
  el.textContent='Cloud sync on'+(syncOn()?'':' (auto-sync disabled)')+(last?' · Last sync '+new Date(last).toLocaleString():' · Not synced yet');
}
$('syncSave').onclick=()=>{
  const v=$('syncToken').value.trim();
  if(!v){toast('Paste your Teable token first');return}
  store.set('qc_teable_token',v);store.set('qc_sync_on',true);
  $('syncToken').value='';renderSync();syncNow();
};
$('syncOff').onclick=()=>{
  store.set('qc_teable_token','');store.set('qc_sync_on',false);
  renderSync();toast('Cloud sync disabled. Data stays on this phone.');
};
$('syncNow').onclick=syncNow;
window.addEventListener('online',()=>{if(token()&&syncOn())syncNow()});

/* Called after store.ready: render the panel and auto-sync when enabled. */
export function initSync(){
  renderSync();
  if(token()&&syncOn()&&navigator.onLine!==false)syncNow();
}
