/* syncmap.js — pure field mapping between local recents and Teable rows
   (no DOM, no state). Injected ctx supplies COUNTRIES/STATUSES so the
   round-trip is unit-testable in tools/syncmap_test.cjs. */

function dayMs(ds){const p=ds.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).getTime()}
function dayFromCell(v){
  if(typeof v==='number'&&v){const d=new Date(v);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  if(typeof v==='string'&&/^\d{4}-\d\d-\d\d/.test(v))return v.slice(0,10);
  return '';
}

/* Local recent -> Teable fields (protocol v3). */
export function contactToFields(r){
  const f={Number:r.full,Code:r.code||'',Local:r.local||'',Country:r.country||'',Label:r.label||'',
    DueTime:r.dueTime||'',Value:+r.value||0,At:+r.at||Date.now(),
    Log:JSON.stringify(r.log||[]),UpdatedAt:r._lu||r.at||0};
  if(r.status)f.Status=r.status;
  if(r.due)f.Due=dayMs(r.due);
  if(r.note)f.Note=r.note;
  if(r.fuMsg)f.FuMsg=r.fuMsg;
  /* v3 additions: fields added to the app after the Teable base was created. */
  if(r.lostWhy)f.LostWhy=r.lostWhy;
  if(r.valid)f.Valid=dayMs(r.valid);
  f.Dnc=!!r.dnc;
  if(r.outcome)f.Outcome=r.outcome;
  if(r.seq&&r.seq.k)f.Seq=JSON.stringify(r.seq);
  if(r.company)f.Company=r.company;
  if(r.src)f.LeadSource=r.src;
  if(r.vars&&Object.keys(r.vars).length)f.Vars=JSON.stringify(r.vars);
  return f;
}

/* Teable row -> local recent. ctx: {COUNTRIES, STATUSES}. */
export function contactFromRow(row,ctx){
  const g=row.fields||{};
  if(!g.Number)return null;
  let log=[];
  try{log=JSON.parse(g.Log||'[]')}catch(e){log=[]}
  let seq=null;
  try{const s=JSON.parse(g.Seq||'null');if(s&&s.k)seq={k:String(s.k),step:Math.min(3,Math.max(1,+s.step||1))}}catch(e){}
  let vars={};
  try{const v=JSON.parse(g.Vars||'{}');if(v&&typeof v==='object'&&!Array.isArray(v))vars=v}catch(e){}
  return {full:String(g.Number),code:String(g.Code||''),local:String(g.Local||String(g.Number)),
    country:ctx.COUNTRIES.some(c=>c.id===g.Country)?g.Country:'ot',
    at:+g.At||Date.now(),label:String(g.Label||''),
    due:dayFromCell(g.Due),
    status:ctx.STATUSES.includes(g.Status)?g.Status:'',
    dueTime:/^\d\d:\d\d$/.test(g.DueTime||'')?g.DueTime:'',
    value:Math.round(+g.Value||0),
    note:String(g.Note||'').slice(0,500),fuMsg:String(g.FuMsg||'').slice(0,2000),
    dnc:g.Dnc?1:0,
    valid:dayFromCell(g.Valid),
    lostWhy:typeof g.LostWhy==='string'?g.LostWhy.slice(0,80):'',
    outcome:typeof g.Outcome==='string'?g.Outcome.slice(0,20):'',
    seq,
    company:String(g.Company||'').slice(0,120),
    src:String(g.LeadSource||'').slice(0,120),
    vars,
    log,_lu:+g.UpdatedAt||0};
}

/* v3 fields that may not exist yet in the Teable base; sync.js creates them
   on demand (name -> Teable field type). */
export const EXTRA_CONTACT_FIELDS={
  LostWhy:'text',Valid:'date',Dnc:'checkbox',Outcome:'text',
  Seq:'text',Company:'text',LeadSource:'text',Vars:'text',
};
