/* csvutil.js — pure CSV parsing + column mapping for contact import with
   per-contact variables (no DOM, no state imports). Unit-tested in tools/csv_test.cjs. */

/* RFC-4180-ish parse: quoted cells with "" escapes, CRLF/LF rows, BOM tolerant.
   Returns {headers:[...], rows:[[...]]} — rows padded/truncated to header length. */
export function parseCsv(text){
  const s=String(text==null?'':text).replace(/^﻿/,'');
  const cells=[];let cur='',q=false,row=[],rows=[];
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(q){
      if(ch==='"'){if(s[i+1]==='"'){cur+='"';i++}else q=false}
      else cur+=ch;
    }else if(ch==='"')q=true;
    else if(ch===','){row.push(cur);cur=''}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&s[i+1]==='\n')i++;
      row.push(cur);cur='';rows.push(row);row=[];
    }else cur+=ch;
  }
  if(cur!==''||row.length){row.push(cur);rows.push(row)}
  rows=rows.filter(r=>r.some(c=>String(c).trim()!==''));
  if(!rows.length)return{headers:[],rows:[]};
  const headers=rows[0].map(h=>String(h).trim());
  return {headers,rows:rows.slice(1).map(r=>headers.map((_,i)=>r[i]==null?'':r[i]))};
}

/* Known import columns, keyed by lowercased header → record field.
   Unknown headers become per-contact variables under r.vars (lowercased key). */
export const KNOWN_COLS={
  'name':'label','number':'full','country':'country','status':'status',
  'quote value (sar)':'value','note':'note','follow-up date':'due',
  'follow-up time':'dueTime','message to send':'fuMsg','quote valid until':'valid',
  'lost reason':'lostWhy','do not contact':'dnc','company':'company','lead source':'src',
};

/* Classify headers: {known:{lowerHeader:field}, vars:[header]}. Case-insensitive. */
export function classifyHeaders(headers){
  const known={},vars=[];
  headers.forEach(h=>{
    const k=h.trim().toLowerCase();
    if(KNOWN_COLS[k])known[k]=KNOWN_COLS[k];
    else if(k)vars.push(h.trim());
  });
  return {known,vars};
}

/* Split a mapped row into known fields + variables: {fields:{...}, vars:{...}}. */
export function mapRow(headers,known,vars,row){
  const fields={},outVars={};
  headers.forEach((h,i)=>{
    const v=String(row[i]==null?'':row[i]).trim();
    const k=h.trim().toLowerCase();
    if(known[k]){if(v)fields[known[k]]=v.slice(0,known[k]==='full'?30:500)}
    else if(vars.includes(h.trim())&&v)outVars[k]=v.slice(0,200);
  });
  return {fields,vars:outVars};
}
