/* core.js — shared state, storage, domain constants, and leaf utilities.
   No feature-module imports live here; every other module may depend on this one. */

export const COUNTRIES = [
  {id:'sa',name:'KSA',code:'966',len:9,first:/^5/,ph:'05X XXX XXXX'},
  {id:'ye',name:'Yemen',code:'967',len:9,first:/^7/,ph:'7XX XXX XXX'},
  {id:'eg',name:'Egypt',code:'20',len:10,first:/^1/,ph:'01X XXXX XXXX'},
  {id:'om',name:'Oman',code:'968',len:8,first:/^[79]/,ph:'9XXX XXXX'},
  {id:'ot',name:'Other',code:'',len:0,first:null,ph:'Number without code'}
];

export const DEFAULT_TPLS = [
  {id:'t1',title:'Introduction',pinned:true,body:'{greeting} {name}, this is Hossam from Al-Wasael Industrial Company. I got your number regarding your irrigation inquiry.'},
  {id:'t2',title:'Quotation sent',pinned:true,body:'{greeting} {name}. Please find our quotation attached. Let me know if you have any questions.'},
  {id:'t3',title:'Follow-up',body:'{greeting} {name}, just following up on our last conversation. Is there any update from your side?'},
  {id:'t4',title:'Location request',body:'Please share the site location pin so we can arrange the visit.'}
];

export const STATUSES = ['','quoted','waiting','won','lost'];
export const ST_LABEL = {quoted:'Quoted',waiting:'Waiting',won:'Won',lost:'Lost'};

/* Template variables: {name}, {greeting}, {date}, or any {word} */
export const VAR_RE = /\{([A-Za-z_؀-ۿ][\w؀-ۿ]*)\}/g;

/* Storage: write-through cache over IndexedDB, with a localStorage fallback.
   store.get reads synchronously from memory; store.set persists in the background.
   Await store.ready before boot. Existing localStorage data migrates on first run. */
const mem = new Map();
let idbFailed = false, dbPromise = null;

function openDb(){
  dbPromise = new Promise(resolve => {
    if(typeof indexedDB === 'undefined'){ idbFailed = true; return resolve(null) }
    const req = indexedDB.open('quickchat', 1);
    req.onupgradeneeded = () => { if(!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv') };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { idbFailed = true; resolve(null) };
    req.onblocked = () => { idbFailed = true; resolve(null) };
  });
  return dbPromise;
}

function idbPut(k, v){
  dbPromise.then(db => {
    if(!db) return;
    try{ db.transaction('kv', 'readwrite').objectStore('kv').put(v, k) }catch(e){}
  });
}

function lsGet(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : undefined }catch(e){ return undefined } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} }
function persist(k, v){ idbFailed ? lsSet(k, v) : idbPut(k, v) }

/* One-time move of pre-IndexedDB data (localStorage) into IndexedDB. */
function migrateFromLocalStorage(){
  try{
    for(let i = localStorage.length - 1; i >= 0; i--){
      const k = localStorage.key(i);
      if(!k || !k.startsWith('qc_') || k === 'qc_migrated') continue;
      if(!mem.has(k)){ const v = lsGet(k); if(v !== undefined){ mem.set(k, v); idbPut(k, v) } }
      localStorage.removeItem(k);
    }
    lsSet('qc_migrated', Date.now());
  }catch(e){}
}

export const store = {
  /* Resolves once memory holds every persisted value (or the fallback is armed). */
  ready: null,
  get(k, d){ return mem.has(k) ? mem.get(k) : d },
  set(k, v){ mem.set(k, v); persist(k, v) }
};

store.ready = openDb().then(db => {
  if(!db){
    /* IndexedDB unavailable: keep using localStorage behind the same API. */
    try{ for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('qc_') && k !== 'qc_migrated'){ const v = lsGet(k); if(v !== undefined) mem.set(k, v) }
    }}catch(e){}
    return;
  }
  return new Promise(resolve => {
    const cursor = db.transaction('kv').objectStore('kv').openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if(c){ mem.set(c.key, c.value); c.continue() } else { migrateFromLocalStorage(); resolve() }
    };
    cursor.onerror = () => { migrateFromLocalStorage(); resolve() };
  });
});

export const state = {lang:'en',
  country:'sa',
  app:'wa',
  tpls:DEFAULT_TPLS.slice(),
  recents:[],
  editing:null, confirmDel:null, confirmClear:false
};

/* Called once store.ready resolves, before the boot sequence. */
export function hydrateState(){
  state.lang=store.get('qc_lang','en');
  state.country=store.get('qc_country','sa');
  state.app=store.get('qc_app','wa');
  state.tpls=store.get('qc_tpls',null)||DEFAULT_TPLS.slice();
  state.recents=store.get('qc_recents',[]);
}

export const $ = id=>document.getElementById(id);

export function country(){return COUNTRIES.find(c=>c.id===state.country)||COUNTRIES[0]}

export function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

let toastTimer;
/* Translator hook: i18n.js registers itself here so toast() (and any other
   non-DOM string) can be translated without a module cycle. */
let _tr=s=>s;
export function setTranslator(fn){_tr=fn}
export function t(s){return _tr(s)}
export function toast(s){const t=$('toast');t.textContent=_tr(s);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}

/* ---- Dates and formatting ---- */
export function ago(ts){const m=Math.round((Date.now()-ts)/60000);if(m<1)return'just now';if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';const d=Math.round(h/24);return d+' d ago'}
export function todayStr(off){const d=new Date();d.setDate(d.getDate()+(off||0));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
export function parseDay(ds){const p=ds.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])}
export function dayDiff(ds){const t=new Date();t.setHours(0,0,0,0);return Math.round((parseDay(ds)-t)/864e5)}
export function loc(){return state.lang==='ar'?'ar-u-ca-gregory-nu-latn':'en-GB'}
export function fmtDay(ds){return parseDay(ds).toLocaleDateString(loc(),{weekday:'short',day:'numeric',month:'short'})}
export function fmtShort(ts){return new Date(ts).toLocaleDateString(loc(),{day:'numeric',month:'short'})}
export function dueTime(r){return /^\d\d:\d\d$/.test(r.dueTime||'')?r.dueTime:'09:00'}
export function dueWhen(r){return dueLabel(r.due)+(dueTime(r)!=='09:00'?' · '+dueTime(r):'')}
export function dueLabel(ds){const n=dayDiff(ds);if(n<0)return 'Overdue '+(-n)+' d';if(n===0)return 'Today';if(n===1)return 'Tomorrow';return fmtDay(ds)}
export function dueLow(ds){const l=dueLabel(ds);return dayDiff(ds)<=1?l.toLowerCase():'on '+l}
export function sar(v){return 'SAR '+Math.round(Number(v)||0).toLocaleString('en-US')}
export function fmtSize(n){return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}

/* ---- Downloads ---- */
export function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}

/* ---- Contact history log ---- */
export function logEv(r,e,v){(r.log=r.log||[]).push({t:Date.now(),e,v:v===undefined?'':v});if(r.log.length>40)r.log.splice(0,r.log.length-40)}

/* ---- Number normalization (pure) ---- */
/* Pure: turn one raw number string into {country, local, code, full} or null */
export function normalize(raw){
  const intl=/^\s*(\+|00)/.test(raw);
  let d=raw.replace(/\D/g,'');
  if(intl){
    if(d.startsWith('00'))d=d.slice(2);
    const c=COUNTRIES.find(c=>c.code&&d.startsWith(c.code)&&d.length===c.code.length+c.len);
    if(c)return {country:c.id,code:c.code,local:d.slice(c.code.length),full:d};
    if(d.length>=8&&d.length<=15)return {country:'ot',code:'',local:d,full:d,intl:true};
    return null;
  }
  for(const c of COUNTRIES){
    if(c.code&&d.startsWith(c.code)&&d.length===c.code.length+c.len&&c.first.test(d.slice(c.code.length)))
      return {country:c.id,code:c.code,local:d.slice(c.code.length),full:d};
  }
  const l=d.replace(/^0+/,'');
  const order=[country(),...COUNTRIES.filter(c=>c.id!==state.country)].filter(c=>c.code);
  const c=order.find(c=>l.length===c.len&&c.first.test(l));
  if(c)return {country:c.id,code:c.code,local:l,full:c.code+l};
  return null;
}

/* Pure: find every phone number in free text (SMS, email signature, PDF) */
export function extractNumbers(text){
  const out=[],seen=new Set();
  const re=/(?:\+|00)?\d[\d\s\-(). ]{6,20}\d/g;
  const norm=String(text).replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x06f0));
  let m;
  while((m=re.exec(norm))){
    const n=normalize(m[0]);
    if(n&&!seen.has(n.full)){seen.add(n.full);out.push(n)}
  }
  return out;
}

/* ---- Template variables ---- */
export function autoVars(raw){
  const now=new Date(),h=now.getHours(),ar=/[؀-ۿ]/.test(raw);
  const greeting=ar?(h<12?'صباح الخير':'مساء الخير'):(h<12?'Good morning':h<17?'Good afternoon':'Good evening');
  const date=String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear();
  return {greeting,date};
}
export function fillTpl(raw,vals){return raw.replace(VAR_RE,(m,k)=>vals[k.toLowerCase()]||m)}
/* Template keys the user must fill (auto-filled {greeting}/{date} and {name} excluded) */
export function customKeys(raw){const auto=autoVars(raw);return [...new Set([...raw.matchAll(VAR_RE)].map(m=>m[1].toLowerCase()))].filter(k=>!(k in auto)&&k!=='name')}

/* ---- Base64url for shareable template packs ---- */
export function b64uEnc(str){const by=new TextEncoder().encode(str);let bin='';by.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export function b64uDec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))}
