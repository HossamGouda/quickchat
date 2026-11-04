/* backup.js — backup / restore / CSV export + CSV import with per-contact
   variables, backup nudges, storage persistence. */
import {$, store, state, COUNTRIES, STATUSES, ST_LABEL, dl, toast, dueTime, todayStr, notifyEvent, normalize} from './core.js';
import {renderRecents, keep, trimRecents, saveRecents} from './recents.js';
import {renderTpls} from './templates.js';
import {tombstones, addTombstone} from './tombstones.js';
import {parseCsv, classifyHeaders, mapRow} from './csvutil.js';
import {tr} from './i18n.js';

function tracked(){return state.recents.filter(keep).length}
export function renderBk(){
  const last=store.get('qc_lastBackup',0),tr=tracked(),el=$('bkInfo');
  const days=last?Math.floor((Date.now()-last)/864e5):null;
  const counts=`${state.tpls.length} template${state.tpls.length===1?'':'s'} · ${tr} saved contact${tr===1?'':'s'} · ${state.recents.length-tr} recent.`;
  el.textContent=(last?`Last backup ${days===0?'today':days+' day'+(days>1?'s':'')+' ago'}. `:'No backup yet. ')+counts;
  const stale=tr&&(!last||days>7);
  el.className='bk'+(stale?' warn':'');
  const n=$('bkNudge');
  n.hidden=!(stale&&Date.now()>store.get('qc_nudgeSnooze',0));
  if(!n.hidden)$('nudgeTxt').textContent=last?`Last backup ${days} days ago. You have ${tr} saved contact${tr===1?'':'s'} on this phone only.`:`You have ${tr} saved contact${tr===1?'':'s'} and no backup yet.`;
}

function backupJson(){return JSON.stringify({app:'quickchat',version:5,exportedAt:new Date().toISOString(),templates:state.tpls,numbers:state.recents,deleted:tombstones()},null,2)}
function stamp(){return todayStr()}
function backupDone(){store.set('qc_lastBackup',Date.now());renderBk()}
function downloadBackup(){dl(new Blob([backupJson()],{type:'application/json'}),'quickchat-backup-'+stamp()+'.json');backupDone();toast('Backup saved to Downloads',{type:'ok'});notifyEvent('ok','Backup saved',{tab:'settings'})}
function shareBackup(){
  let file;try{file=new File([backupJson()],'quickchat-backup-'+stamp()+'.txt',{type:'text/plain'})}catch(e){file=null}
  if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:'QuickChat backup'}).then(()=>{backupDone();toast('Backup shared. Pick Drive to keep it safe',{type:'ok'});notifyEvent('ok','Backup shared',{tab:'settings'})}).catch(err=>{if(!err||err.name!=='AbortError')downloadBackup()});
  }else downloadBackup();
}
$('shareBk').onclick=shareBackup;
$('exportBk').onclick=downloadBackup;
$('nudgeGo').onclick=shareBackup;
$('nudgeLater').onclick=()=>{store.set('qc_nudgeSnooze',Date.now()+864e5);renderBk()};
$('csvBk').onclick=()=>{
  const cell=v=>{v=String(v==null?'':v);return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const head=['Name','Number','Country','Status','Quote value (SAR)','Note','Follow-up date','Follow-up time','Message to send','Last contact','Quote valid until','Lost reason','Do not contact','Company','Lead source'];
  const order={lead:0,contacted:1,quoted:2,waiting:3,negotiating:4,won:5,lost:6,'':7};
  const rows=state.recents.slice().sort((a,b)=>(order[a.status||'']-order[b.status||''])||(a.label||'').localeCompare(b.label||'')).map(r=>{
    const c=COUNTRIES.find(x=>x.id===r.country);
    return [r.label||'','+'+r.full,c&&c.id!=='ot'?c.name:'',r.status?ST_LABEL[r.status]:'',r.value||'',r.note||'',r.due||'',r.due?dueTime(r):'',r.fuMsg||'',new Date(r.at).toISOString().slice(0,10),r.valid||'',r.lostWhy||'',r.dnc?'yes':'',r.company||'',r.src||''];
  });
  dl(new Blob(['﻿'+[head].concat(rows).map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'quickchat-contacts-'+stamp()+'.csv');
  toast('Excel file saved to Downloads',{type:'ok'});
};

export function checkStorage(){
  const el=$('bkStore');
  if(!navigator.storage||!navigator.storage.persisted){el.textContent='';return}
  navigator.storage.persisted().then(p=>p||(navigator.storage.persist?navigator.storage.persist():false)).then(p=>{
    el.textContent=p?'Storage protected from automatic clean-up.':'Chrome may clear app data if the phone runs low on space. Keep backups.';
    el.className='bk'+(p?' okc':' warn');
  }).catch(()=>{el.textContent=''});
}

$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  let d;try{d=JSON.parse(await file.text())}catch(err){d=null}
  if(!d||d.app!=='quickchat'||!Array.isArray(d.templates)||!Array.isArray(d.numbers)){toast('This file is not a QuickChat backup');return}
  let nt=0,nn=0;
  const okDay=v=>/^\d{4}-\d\d-\d\d$/.test(v||''),okLog=l=>Array.isArray(l)?l.filter(x=>x&&+x.t&&typeof x.e==='string').slice(-40).map(x=>({t:+x.t,e:String(x.e),v:x.v==null?'':x.v})):[];
  d.templates.forEach((t,k)=>{
    if(!t||typeof t.body!=='string'||!t.body.trim()||state.tpls.some(x=>x.body===t.body))return;
    let id=String(t.id||'');if(!id||state.tpls.some(x=>x.id===id))id='t'+Date.now()+'_'+k;
    state.tpls.push({id,title:String(t.title||t.body.slice(0,30)),body:t.body,pinned:!!t.pinned});nt++;
  });
  d.numbers.forEach(r=>{
    if(!r||!/^\d{6,15}$/.test(String(r.full)))return;
    const ex=state.recents.find(x=>x.full===r.full);
    if(ex){let ch=false;
      if(!ex.label&&r.label){ex.label=String(r.label);ch=true}
      if(!ex.due&&okDay(r.due)){ex.due=r.due;ch=true}
      if(!ex.status&&STATUSES.includes(r.status)&&r.status){ex.status=r.status;ch=true}
      if(!ex.note&&r.note){ex.note=String(r.note).slice(0,500);ch=true}
      if(!ex.fuMsg&&r.fuMsg){ex.fuMsg=String(r.fuMsg).slice(0,2000);ch=true}
      if(!ex.dueTime&&/^\d\d:\d\d$/.test(r.dueTime||'')){ex.dueTime=r.dueTime;ch=true}
      if(!ex.value&&+r.value){ex.value=Math.round(+r.value);ch=true}
      if(!ex.valid&&okDay(r.valid)){ex.valid=r.valid;ch=true}
      if(!ex.lostWhy&&typeof r.lostWhy==='string'&&r.lostWhy){ex.lostWhy=r.lostWhy.slice(0,80);ch=true}
      if(!ex.dnc&&r.dnc){ex.dnc=1;ch=true}
      if(!ex.outcome&&typeof r.outcome==='string'){ex.outcome=r.outcome.slice(0,20);ch=true}
      if(!ex.company&&r.company){ex.company=String(r.company).slice(0,120);ch=true}
      if(!ex.src&&r.src){ex.src=String(r.src).slice(0,120);ch=true}
      if(!ex.seq&&r.seq&&r.seq.k==='quote'){ex.seq={k:'quote',step:Math.min(3,Math.max(1,+r.seq.step||1))};ch=true}
      if(r.vars&&Object.keys(r.vars||{}).length){ex.vars=cleanVars(Object.assign({},ex.vars,r.vars));ch=true}
      if(!(ex.log&&ex.log.length)&&r.log){ex.log=okLog(r.log);ch=true}
      if(ch){ex._lu=Date.now();nn++}return}
    state.recents.push({full:r.full,code:String(r.code||''),local:String(r.local||r.full),country:COUNTRIES.some(c=>c.id===r.country)?r.country:'ot',at:+r.at||Date.now(),label:String(r.label||''),due:okDay(r.due)?r.due:'',status:STATUSES.includes(r.status)?r.status:'',note:String(r.note||'').slice(0,500),fuMsg:String(r.fuMsg||'').slice(0,2000),dueTime:/^\d\d:\d\d$/.test(r.dueTime||'')?r.dueTime:'',value:Math.round(+r.value||0),log:okLog(r.log),valid:okDay(r.valid)?r.valid:'',lostWhy:typeof r.lostWhy==='string'?r.lostWhy.slice(0,80):'',dnc:r.dnc?1:0,outcome:typeof r.outcome==='string'?r.outcome.slice(0,20):'',seq:r.seq&&r.seq.k==='quote'?{k:'quote',step:Math.min(3,Math.max(1,+r.seq.step||1))}:null,company:String(r.company||'').slice(0,120),src:String(r.src||'').slice(0,120),vars:cleanVars(r.vars),_lu:Date.now()});nn++;
  });
  state.recents.sort((a,b)=>b.at-a.at);trimRecents();
  /* Restore deletion tombstones (keep the newer side if we already have one). */
  if(Array.isArray(d.deleted))d.deleted.forEach(t=>{
    if(!t||!t.full||!/^[ct]$/.test(t.k||'c'))return;
    const k=t.k||'c',ex=tombstones().find(x=>x.k===k&&x.full===String(t.full));
    if(!ex){addTombstone(k,String(t.full))}
  });
  store.set('qc_tpls',state.tpls);store.set('qc_recents',state.recents);
  renderTpls();renderRecents();renderBk();
  toast(`Imported ${nt} template${nt===1?'':'s'} and ${nn} number${nn===1?'':'s'}`);
};

/* CSV import: known columns fill record fields; any extra column becomes a
   per-contact {variable} usable in queue messages. */
const okDayCsv=v=>/^\d{4}-\d\d-\d\d$/.test(v||'');
const ST_BY_LABEL=Object.fromEntries(STATUSES.filter(s=>s).map(s=>[ST_LABEL[s].toLowerCase(),s]));
function cleanVars(o){
  const out={};
  Object.entries(o||{}).slice(0,20).forEach(([k,v])=>{
    const key=k.toLowerCase();
    if(/^[A-Za-z_؀-ۿ][\w؀-ۿ]*$/.test(key))out[key]=String(v).slice(0,200);
  });
  return out;
}
function csvStatus(v){
  v=String(v||'').trim().toLowerCase();
  if(STATUSES.includes(v))return v;
  return ST_BY_LABEL[v]||'';
}
$('csvImpBtn').onclick=()=>$('importCsvFile').click();
$('importCsvFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  const {headers,rows}=parseCsv(await file.text());
  if(!headers.length){toast(tr('This file is empty'));return}
  const {known,vars}=classifyHeaders(headers);
  if(!known['number']){toast(tr('CSV needs a "Number" column'));return}
  let nn=0;
  rows.forEach(row=>{
    const {fields,vars:rv}=mapRow(headers,known,vars,row);
    const n=normalize(String(fields.full||'').replace(/^\+/,''));
    if(!n)return;
    const v=cleanVars(rv);
    const ex=state.recents.find(x=>x.full===n.full);
    if(ex){let ch=false;
      if(!ex.label&&fields.label){ex.label=fields.label.slice(0,120);ch=true}
      if(!ex.note&&fields.note){ex.note=fields.note.slice(0,500);ch=true}
      if(!ex.company&&fields.company){ex.company=fields.company.slice(0,120);ch=true}
      if(!ex.src&&fields.src){ex.src=fields.src.slice(0,120);ch=true}
      if(!ex.status&&csvStatus(fields.status)){ex.status=csvStatus(fields.status);ch=true}
      if(!ex.due&&okDayCsv(fields.due)){ex.due=fields.due;ch=true}
      if(!ex.value&&+fields.value){ex.value=Math.round(+fields.value);ch=true}
      if(!ex.valid&&okDayCsv(fields.valid)){ex.valid=fields.valid;ch=true}
      if(!ex.lostWhy&&fields.lostWhy){ex.lostWhy=fields.lostWhy.slice(0,80);ch=true}
      if(!ex.fuMsg&&fields.fuMsg){ex.fuMsg=fields.fuMsg.slice(0,2000);ch=true}
      if(Object.keys(v).length){ex.vars=Object.assign({},ex.vars,v);ch=true}
      if(ch){ex._lu=Date.now();nn++}
      return;
    }
    state.recents.push({full:n.full,code:n.code,local:n.local,country:n.country,at:Date.now(),
      label:fields.label?fields.label.slice(0,120):'',status:csvStatus(fields.status),
      due:okDayCsv(fields.due)?fields.due:'',dueTime:/^\d\d:\d\d$/.test(fields.dueTime||'')?fields.dueTime:'',
      note:fields.note?fields.note.slice(0,500):'',fuMsg:fields.fuMsg?fields.fuMsg.slice(0,2000):'',
      value:Math.round(+fields.value||0),valid:okDayCsv(fields.valid)?fields.valid:'',
      lostWhy:fields.lostWhy?fields.lostWhy.slice(0,80):'',dnc:/^(yes|true|1|x)$/i.test(fields.dnc||'')?1:0,
      company:fields.company?fields.company.slice(0,120):'',src:fields.src?fields.src.slice(0,120):'',
      log:[],vars:v,_lu:Date.now()});
    nn++;
  });
  state.recents.sort((a,b)=>b.at-a.at);trimRecents();
  store.set('qc_recents',state.recents);
  renderRecents();renderBk();
  toast(vars.length?tr(`Imported ${nn} contacts with variables`) + ' {'+vars.join('}, {')+'}':tr(`Imported ${nn} contacts`));
};
