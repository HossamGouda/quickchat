/* sync.js — Teable cloud sync (protocol v2).
   IndexedDB stays the source of truth; this module mirrors contacts and templates
   to the Teable base (js/sync-config.js) and merges remote changes back.
   Conflict rule per record: the side with the newer UpdatedAt wins.
   Deletions propagate via tombstones (js/tombstones.js): a deleted record is
   marked Deleted in Teable and purged from both sides after 30 days.
   SyncMeta rows hold the protocol version and last-sync timestamp; clients on
   mismatched protocol versions refuse to sync rather than corrupt data.

   The personal access token is entered in the Backup tab and kept in the
   on-device store only — it is never committed to the repo or shown in UI. */
import {$, store, state, COUNTRIES, STATUSES, toast} from './core.js';
import {TEABLE_API, TEABLE_TABLES as TBLS, TEABLE_MATCH_FIELDS as MATCH, PROTOCOL_VERSION} from './sync-config.js';
import {saveRecents} from './recents.js';
import {renderTpls} from './templates.js';
import {tombstones, addTombstone, removeTombstone, purgeTombstone, purgeDue} from './tombstones.js';
import {tr} from './i18n.js';

const token=()=>store.get('qc_teable_token','');
const syncOn=()=>!!store.get('qc_sync_on',false);
const REQ_TIMEOUT=20000;

async function tb(method, path, body){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),REQ_TIMEOUT);
  let res;
  try{
    res=await fetch(TEABLE_API+path,{
      method,
      headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined,
      signal:ctl.signal
    });
  }catch(e){
    clearTimeout(timer);
    throw new Error(e.name==='AbortError'?'Teable did not respond in time. Check the connection.':'No network route to Teable.');
  }
  clearTimeout(timer);
  if(res.status===401||res.status===403)throw new Error('Teable rejected the token. Check the token below.');
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

/* Push local rows in batches; returns total upserted. */
async function pushRows(tableId,matchField,fieldsList){
  let n=0;
  for(const part of chunk(fieldsList,50)){
    const d=await tb('POST',`/table/${tableId}/record/upsert`,{matchField,onConflict:'update',typecast:true,records:part.map(fields=>({fields}))});
    n+=(d.summary&&(d.summary.updated+d.summary.created))||part.length;
  }
  return n;
}

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
function delFields(full,delAt){return {Number:full,Deleted:true,DeletedAt:delAt,UpdatedAt:delAt}}
function delFieldsTpl(id,delAt){return {TplId:id,Deleted:true,DeletedAt:delAt,UpdatedAt:delAt}}

/* ---- templates ---- */
function tplToFields(t){return {TplId:t.id,Title:t.title,Body:t.body,Pinned:!!t.pinned,UpdatedAt:t._lu||0}}
function tplFromRow(row){
  const g=row.fields||{};
  if(!g.TplId||typeof g.Body!=='string')return null;
  return {id:String(g.TplId),title:String(g.Title||g.Body.slice(0,30)),body:g.Body,pinned:!!g.Pinned,_lu:+g.UpdatedAt||0};
}

/* ---- SyncMeta: protocol version + informational cursor ---- */
async function readMeta(rows,key){
  const row=rows.find(r=>String((r.fields||{}).Key)===key);
  return row?String((row.fields||{}).Value):null;
}
async function writeMeta(key,value){
  await tb('POST',`/table/${TBLS.syncMeta}/record/upsert`,{matchField:MATCH.syncMeta,onConflict:'update',typecast:true,
    records:[{fields:{Key:key,Value:String(value)}}]});
}

/* ---- settings blob: device preferences mirrored via SyncMeta ----
   Per-device keys (token, lock, notification toggle) are never synced.
   Language applies on next open; the rest apply immediately. */
const SETTING_KEYS=['qc_country','qc_app','qc_qr','qc_qtpl','qc_qdraft','qc_cal','qc_lang'];
function settingsBlob(){
  const v={};
  for(const k of SETTING_KEYS){const x=store.get(k,undefined);if(x!==undefined)v[k]=x}
  return v;
}
function applySettings(v){
  let langChanged=false;
  for(const k of SETTING_KEYS){
    if(v[k]===undefined)continue;
    store.set(k,v[k]);
    if(k==='qc_country')state.country=v[k];
    if(k==='qc_app')state.app=v[k];
    if(k==='qc_lang'&&state.lang!==v[k])langChanged=true;
  }
  return langChanged;
}
async function syncSettings(metaRows){
  const row=metaRows.find(r=>String((r.fields||{}).Key)==='settings');
  let remote=null;
  if(row){try{remote=JSON.parse(String(row.fields.Value))}catch(e){remote=null}}
  let applied=false;
  if(remote&&+remote.lu>(store.get('qc_settings_lu',0))&&remote.v){
    applySettings(remote.v);
    store.set('qc_settings_lu',+remote.lu);
    store.set('qc_settings_sig',JSON.stringify(remote.v));
    applied=true;
  }
  const local=settingsBlob(),sig=JSON.stringify(local);
  if(sig!==store.get('qc_settings_sig','')){
    await writeMeta('settings',JSON.stringify({v:local,lu:Date.now()}));
    store.set('qc_settings_sig',sig);store.set('qc_settings_lu',Date.now());
  }
  return applied;
}

/* Force-pull restore: cloud wins for every record it holds; local-only
   records are kept; remote deletions are applied via tombstones. */
export async function restoreFromCloud(){
  if(!token()){toast('Add your Teable token in the Backup section first');return false}
  if(navigator.onLine===false){toast('You are offline.');return false}
  try{
    const remote=await pullAll(TBLS.contacts);
    let restored=0;
    const seen=new Set();
    for(const row of remote){
      const g=row.fields||{};if(!g.Number)continue;
      const full=String(g.Number);seen.add(full);
      if(g.Deleted){addTombstone('c',full);state.recents=state.recents.filter(x=>x.full!==full);continue}
      const m=contactFromRow(row);
      if(!m)continue;
      const ex=state.recents.find(x=>x.full===full);
      if(ex)Object.assign(ex,m);else state.recents.push(m);
      restored++;
    }
    state.recents.sort((a,b)=>b.at-a.at);
    saveRecents();
    const rT=await pullAll(TBLS.templates);
    let restoredT=0;
    for(const row of rT){
      const g=row.fields||{};if(!g.TplId)continue;
      const id=String(g.TplId);
      if(g.Deleted){addTombstone('t',id);state.tpls=state.tpls.filter(x=>x.id!==id);continue}
      const m=tplFromRow(row);
      if(!m)continue;
      const ex=state.tpls.find(x=>x.id===id);
      if(ex)Object.assign(ex,m);else state.tpls.push(m);
      restoredT++;
    }
    store.set('qc_tpls',state.tpls);renderTpls();
    store.set('qc_last_sync',Date.now());
    toast(`Restored from Teable: ${restored} contacts, ${restoredT} templates`);
    renderSync();
    return true;
  }catch(err){
    toast('Restore failed: '+(err.message||'network error'));
    return false;
  }
}

/* One-time (v2): give legacy records a sane UpdatedAt so a fresh Teable edit
   beats an old record last messaged long ago. */
function backfillLu(){
  if(store.get('qc_sync_v2',false))return;
  const floor=store.get('qc_last_sync',0)||0;
  state.recents.forEach(r=>{r._lu=Math.max(r._lu||0,r.at||0,floor)});
  state.tpls.forEach(t=>{t._lu=Math.max(t._lu||0,floor)});
  store.set('qc_recents',state.recents);store.set('qc_tpls',state.tpls);
  store.set('qc_sync_v2',true);
}

/* Merge one record kind. `kind` selects local getters and field mappers.
   remote: Map(full -> teable row). lastSync enables conflict detection (both
   sides changed since the last successful sync). Returns {pushList,pulled,
   conflicts} and mutates state. */
function mergeRecords(kind,remote,localList,toFields,fromRow,delF,lastSync){
  const conflicts=[];
  const localBy=new Map(localList.map(x=>[kind==='c'?x.full:x.id,x]));
  const pushList=[];let pushed=0,pulled=0;
  const keyOf=x=>kind==='c'?x.full:x.id;
  const luOf=x=>x._lu||x.at||0;
  const tmb=tombstones().filter(t=>t.k===kind);
  const tmbBy=new Map(tmb.map(t=>[t.full,t]));

  /* 1. Local survivors vs remote rows */
  for(const x of localList){
    const row=remote.get(keyOf(x));
    if(!row){pushList.push(toFields(x));continue}
    const g=row.fields||{},remoteLu=+g.UpdatedAt||0;
    if(g.Deleted){
      /* Remote tombstone vs local live record: newer side wins. */
      const remoteDelAt=+g.DeletedAt||0;
      if(luOf(x)>remoteDelAt){ /* resurrect: local edit is newer */
        const f=toFields(x);f.Deleted=false;pushList.push(f);pulled--;
      }else{
        /* adopt the deletion locally */
        if(kind==='c')state.recents=state.recents.filter(r=>r.full!==x.full);
        else state.tpls=state.tpls.filter(t=>t.id!==x.id);
        const old=tmbBy.get(keyOf(x));if(!old||remoteDelAt>old.delAt)tmbBy.set(keyOf(x),{k:kind,full:keyOf(x),delAt:remoteDelAt});
        pulled++;
      }
      continue;
    }
    if(remoteLu>luOf(x)){
      /* Conflict: remote wins, but we also changed since the last sync. */
      if(lastSync&&luOf(x)>lastSync)conflicts.push({kind,key:keyOf(x)});
      const m=fromRow(row);
      if(m){Object.assign(x,m);pulled++}
    }else if(remoteLu<luOf(x))pushList.push(toFields(x));
    /* equal: nothing to do */
  }

  /* 2. Remote-only rows: import unless deleted or covered by a local tombstone */
  for(const [k,row] of remote){
    const g=row.fields||{};
    if(localBy.has(k))continue;
    const tb2=tmbBy.get(k);
    if(g.Deleted){
      if(!tb2||(+g.DeletedAt||0)>tb2.delAt)tmbBy.set(k,{k:kind,full:k,delAt:+g.DeletedAt||0});
      continue;
    }
    const m=fromRow(row);
    if(!m)continue;
    if(tb2&&luOf(m)>tb2.delAt){ /* remote edit arrived after our delete: resurrect */
      removeTombstone(kind,k);tmbBy.delete(k);
      if(kind==='c')state.recents.push(m);else state.tpls.push(m);
      pulled++;
    }else if(!tb2){
      if(kind==='c')state.recents.push(m);else state.tpls.push(m);
      pulled++;
    }
    /* tb2 && remote older than delete: stale row under an active tombstone;
       step 3 pushes the deletion — no import, no duplicate push here. */
  }

  /* 3. Local tombstones vs remote: propagate deletions, drop orphans.
     Iterate the LIVE tmbBy map — resurrections in step 2 removed entries from it. */
  for(const t of tmbBy.values()){
    const row=remote.get(t.full);
    if(!row){ /* remote row already gone (purged elsewhere) */
      purgeTombstone(kind,t.full);tmbBy.delete(t.full);continue;
    }
    const g=row.fields||{};
    if(!g.Deleted)pushList.push(delF(t.full,t.delAt));
    else if((+g.DeletedAt||0)<t.delAt)pushList.push(delF(t.full,t.delAt));
  }

  /* Persist the tombstone ledger for this kind (addTombstone/removeTombstone
     already wrote theirs; here we flush the merged remote-adopted set). */
  store.set('qc_deleted',tombstones().filter(t=>t.k!==kind).concat([...tmbBy.values()]));

  return {pushList,pulled,conflicts};
}

/* Full bidirectional sync of contacts + templates.
   opts.quiet: update the status line only, no toast (background runs). */
let syncing=false;
export async function syncNow(opts={}){
  if(!token()){if(!opts.quiet)toast('Add your Teable token in the Backup section first');return false}
  if(navigator.onLine===false){if(!opts.quiet)toast('You are offline. Sync will run when you are back.');return false}
  if(syncing)return false; /* one sync at a time */
  syncing=true;
  renderSync();
  try{
    backfillLu();
    const metaRows=await pullAll(TBLS.syncMeta);
    const proto=await readMeta(metaRows,'protocol');
    if(proto&&+proto!==PROTOCOL_VERSION)
      throw new Error(`Sync protocol mismatch: this device v${PROTOCOL_VERSION}, cloud v${proto}. Update the app on all devices.`);

    let pushed=0,pulled=0;
    const lastSync=store.get('qc_last_sync',0);
    const conflicts=[];

    /* Contacts */
    const remote=new Map((await pullAll(TBLS.contacts)).map(r=>[String((r.fields||{}).Number||''),r]));
    const mC=mergeRecords('c',remote,state.recents,contactToFields,contactFromRow,delFields,lastSync);
    pushed+=await pushRows(TBLS.contacts,MATCH.contacts,mC.pushList);
    pulled+=mC.pulled;conflicts.push(...mC.conflicts);
    state.recents.sort((a,b)=>b.at-a.at);
    saveRecents();

    /* Templates */
    const rT=new Map((await pullAll(TBLS.templates)).map(r=>[String((r.fields||{}).TplId||''),r]));
    const mT=mergeRecords('t',rT,state.tpls,tplToFields,tplFromRow,delFieldsTpl,lastSync);
    pushed+=await pushRows(TBLS.templates,MATCH.templates,mT.pushList);
    pulled+=mT.pulled;conflicts.push(...mT.conflicts);
    store.set('qc_tpls',state.tpls);renderTpls();

    /* Settings blob (queue draft, QR text, country, app, language, calendar) */
    const settingsApplied=await syncSettings(metaRows);

    /* Purge tombstones older than 30 days from both sides (best effort) */
    for(const t of purgeDue()){
      try{
        const table=t.k==='c'?TBLS.contacts:TBLS.templates;
        const src=t.k==='c'?remote:rT;
        const row=src.get(t.full);
        if(row&&row.id)await tb('DELETE',`/table/${table}/record/${row.id}`);
        purgeTombstone(t.k,t.full);
      }catch(e){/* leave tombstone for the next sync */
        removeTombstone(t.k,t.full); /* local purge always; remote retried never (row id may vanish) */
      }
    }

    store.set('qc_last_sync',Date.now());
    await writeMeta('protocol',PROTOCOL_VERSION);
    await writeMeta('lastSync',Date.now());
    /* Surface silent conflicts: both devices edited the same records. */
    if(conflicts.length){
      const now=Date.now();
      for(const c of conflicts){
        const r=c.kind==='c'?state.recents.find(x=>x.full===c.key):state.tpls.find(x=>x.id===c.key);
        if(r)r._conf=now;
      }
      store.set('qc_recents',state.recents);store.set('qc_tpls',state.tpls);
      const nc=conflicts.filter(c=>c.kind==='c').length,nt=conflicts.length-nc;
      toast(`${conflicts.length} updated from another device`+(nt&&nc?` (${nc} contacts, ${nt} templates)`:''));
    }else if(settingsApplied){
      toast(tr('Settings updated from another device'));
    }else{
      toast(`Synced with Teable: ${pushed} sent, ${pulled} received`);
    }
    renderSync();
    return true;
  }catch(err){
    console.error('QC sync failed:',err&&err.message||err);
    renderSync(); /* resets the status line first… */
    $('syncStatus').textContent=err.message||'Sync failed';
    $('syncStatus').className='bk warn';
    if(!opts.quiet)toast('Sync failed: '+(err.message||'network error'));
    return false;
  }finally{
    syncing=false;
  }
}

/* Debounced sync after local deletions (window event from recents/templates). */
let delTimer=null;
window.addEventListener('qc-data-changed',()=>{
  if(!token()||!syncOn())return;
  clearTimeout(delTimer);delTimer=setTimeout(()=>syncNow({quiet:true}),2000);
});

/* ---- Backup-tab UI ---- */
export function renderSync(){
  const el=$('syncStatus'),has=!!token();
  $('syncTokenRow').hidden=has;
  $('syncOff').hidden=!has;
  $('syncNow').hidden=!has;
  $('syncRestore').hidden=!has;
  if(restoreArm)$('syncRestore').textContent=tr('Restore from Teable');
  if(!has){el.textContent='Cloud sync (Teable) is off. Add a token to sync contacts and templates.';el.className='bk';return}
  const last=store.get('qc_last_sync',0);
  const stale=last&&(Date.now()-last>7*864e5);
  el.textContent='Cloud sync on'+(syncOn()?'':' (auto-sync disabled)')+(last?' · Last sync '+new Date(last).toLocaleString()+(stale?' — tap Sync now':''):' · Not synced yet');
  el.className='bk'+(stale?' warn':'');
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
let restoreArm=0;
$('syncRestore').onclick=()=>{
  const now=Date.now();
  if(now-restoreArm<4000){restoreArm=0;$('syncRestore').textContent=tr('Restore from Teable');restoreFromCloud()}
  else{restoreArm=now;$('syncRestore').textContent=tr('Tap again to replace local data from Teable');setTimeout(()=>{if(Date.now()-restoreArm>=3900){restoreArm=0;$('syncRestore').textContent=tr('Restore from Teable')}},4000)}
};
window.addEventListener('online',()=>{if(token()&&syncOn())syncNow({quiet:true})});

/* Called after store.ready: render the panel and auto-sync when enabled.
   Boot-time auto-sync is quiet: a failure lands in the status line only,
   so opening the app offline never pops an error toast. */
export function initSync(){
  renderSync();
  if(token()&&syncOn()&&navigator.onLine!==false)syncNow({quiet:true});
}
