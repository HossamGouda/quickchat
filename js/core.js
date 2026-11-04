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

export const STATUSES = ['','lead','contacted','quoted','waiting','negotiating','won','lost'];
export const ST_LABEL = {lead:'New lead',contacted:'Contacted',quoted:'Quoted',waiting:'Waiting',negotiating:'Negotiating',won:'Won',lost:'Lost'};

/* O2: why a deal was lost — asked when marking lost, shown in the card. */
export const LOST_REASONS = [['price','Price'],['competitor','Competitor'],['timing','Timing'],['budget','No budget'],['other','Other']];
export const LOST_LBL = Object.fromEntries(LOST_REASONS);

/* O1: one-tap outcomes after returning from WhatsApp. */
export const OUTCOMES = ['sent','noreply','replied','interested'];
export const OUT_LBL = {sent:'Sent',noreply:'No reply',replied:'Replied',interested:'Interested'};

/* Template variables: {name}, {greeting}, {date}, or any {word}.
   O6: message variants {v:option A|option B|option C} — one is picked
   deterministically per send (seed) so batches are not byte-identical. */
export const VAR_RE = /\{([A-Za-z_؀-ۿ][\w؀-ۿ]*)\}/g;
const VAR_V_RE = /\{v:([^}]*)\}/g;
export function applyVariants(raw,seed){
  const n=Math.abs(seed|0);
  return String(raw==null?'':raw).replace(VAR_V_RE,(m,body)=>{
    const parts=body.split('|').map(s=>s.trim()).filter(s=>s);
    return parts.length?parts[n%parts.length]:'';
  });
}

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

/* Translator hook: i18n.js registers itself here so toast() (and any other
   non-DOM string) can be translated without a module cycle. */
let _tr=s=>s;
export function setTranslator(fn){_tr=fn}
export function t(s){return _tr(s)}

/* ---- Toast stack: typed, actionable, auto-dismissing ----
   toast(text, {type:'ok'|'err'|'info', action:{label, fn}, dur:ms})
   Up to 3 toasts stack; each has an icon, optional action, close button and a
   progress bar counting down to auto-dismiss. Plain toast(text) keeps the old
   look-and-feel defaults so the 60+ call sites need no changes. */
const TOAST_META={ok:{dur:2600},err:{dur:4200},info:{dur:2200}};
const KIND_SVG={
  ok:'<path d="M20 6 9 17l-5-5"/>',
  err:'<path d="M18 6 6 18M6 6l12 12"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  due:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  sync:'<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>'};
export function kindSvg(kind){
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(KIND_SVG[kind]||KIND_SVG.info)+'</svg>';
}
export function toast(s,opts){
  opts=opts||{};
  const type=opts.type||'info';
  const host=$('toasts');
  if(!host)return; /* markup missing: no-op rather than crash */
  while(host.children.length>=3)host.firstChild.remove();
  const el=document.createElement('div');
  el.className='toast t-'+type;
  el.setAttribute('role',type==='err'?'alert':'status');
  const ic=document.createElement('span');ic.className='toast-ic';ic.innerHTML=kindSvg(type);el.appendChild(ic);
  const txt=document.createElement('span');txt.className='toast-txt';txt.textContent=_tr(s);el.appendChild(txt);
  let dead=false;
  const dismiss=()=>{if(dead)return;dead=true;el.classList.remove('show');setTimeout(()=>el.remove(),240)};
  if(opts.action){
    const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent=_tr(opts.action.label);
    b.onclick=e=>{e.stopPropagation();dismiss();try{opts.action.fn()}catch(_){}};el.appendChild(b);
  }
  const x=document.createElement('button');x.type='button';x.className='toast-x';x.setAttribute('aria-label',_tr('Dismiss'));x.textContent='✕';
  x.onclick=e=>{e.stopPropagation();clearTimeout(tm);dismiss()};el.appendChild(x);
  const bar=document.createElement('i');bar.className='toast-bar';el.appendChild(bar);
  host.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  const dur=opts.dur||TOAST_META[type].dur;
  bar.style.animationDuration=dur+'ms';
  const tm=setTimeout(dismiss,dur);
  el.addEventListener('click',e=>{if(e.target===el||e.target===txt||e.target===ic){clearTimeout(tm);dismiss()}});
}

/* ---- Collapsible sections: [data-coll] wrappers, state persisted ----
   The first h2 becomes the toggle; everything else goes into a .cl-body that
   hides on collapse. Buttons inside the h2 (e.g. "+ New") keep their own
   click handlers — only bare-heading clicks toggle. */
const CL_KEY='qc_collapsed';
export function initCollapsibles(){
  const saved=store.get(CL_KEY,{});
  document.querySelectorAll('[data-coll]').forEach(sec=>{
    if(sec._clInit)return;sec._clInit=true;
    const h=sec.querySelector(':scope>h2');if(!h)return;
    const body=document.createElement('div');body.className='cl-body';
    while(sec.children[1])body.appendChild(sec.children[1]);
    sec.appendChild(body);
    h.setAttribute('role','button');h.tabIndex=0;h.classList.add('cl-h');
    const chev=document.createElement('span');chev.className='cl-chev';chev.setAttribute('aria-hidden','true');
    chev.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    h.appendChild(chev);
    const key=sec.dataset.coll;
    const apply=collapsed=>{
      sec.classList.toggle('cl-collapsed',collapsed);
      h.setAttribute('aria-expanded',String(!collapsed));
    };
    const set=collapsed=>{
      apply(collapsed);
      const s=store.get(CL_KEY,{});
      if(collapsed)s[key]=1;else delete s[key];
      store.set(CL_KEY,s);
    };
    if(saved[key]!==undefined)apply(!!saved[key]);
    else if(sec.dataset.collDefault==='closed')apply(true); /* once-off default, not persisted */
    const toggle=()=>set(!sec.classList.contains('cl-collapsed'));
    h.addEventListener('click',e=>{if(e.target.closest('button'))return;toggle()});
    h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  });
}

/* ---- In-app notification center (bell) ----
   Callers log user-relevant events with notifyEvent(); the bell in the header
   shows unread count and a panel with history. opts.tab makes tapping the item
   navigate there (main.js listens for qc:nav); opts.full also opens the
   contact card (main.js listens for qc:open-contact). */
const EV_KEY='qc_events';
export function events(){return store.get(EV_KEY,[])}
export function notifyEvent(kind,text,opts){
  opts=opts||{};
  const evs=events();
  evs.unshift({id:Date.now()+'-'+Math.floor(Math.random()*999),ts:Date.now(),kind,
    text,tab:opts.tab||'',full:opts.full||'',read:!!opts.read});
  while(evs.length>20)evs.pop();
  store.set(EV_KEY,evs);
  renderBell();
}
export function renderBell(){
  const b=$('bellBadge');if(!b)return;
  const n=events().filter(e=>!e.read).length;
  b.hidden=!n;b.textContent=n>9?'9+':''+n;
}
/* Kind chips above the bell list. 'due' matches due events; 'sync' matches
   sync events; 'rest' collects ok/err/anything else. */
const BP_FILTERS=[['all','All'],['due','Due'],['sync','Sync'],['rest','Other']];
function bpBucket(k){return k==='due'?'due':k==='sync'?'sync':'rest'}
export function initBell(){
  const btn=$('bellBtn'),panel=$('bellPanel'),list=$('bellList');
  if(!btn||!panel||!list)return;
  let filter='all';
  const close=()=>{panel.hidden=true};
  const matches=ev=>filter==='all'||bpBucket(ev.kind)===filter;
  function renderItems(){
    const evs=events().filter(matches);
    list.innerHTML='';
    if(!evs.length){
      const p=document.createElement('p');p.className='bp-empty';p.textContent=_tr('No notifications yet');list.appendChild(p);
      return;
    }
    for(const ev of evs){
      const it=document.createElement('div');it.className='bp-item k-'+ev.kind;
      if(ev.tab||ev.full)it.classList.add('lnk');
      const ic=document.createElement('span');ic.className='bp-ic';ic.innerHTML=kindSvg(ev.kind);it.appendChild(ic);
      const body=document.createElement('div');body.className='bp-body';
      const tx=document.createElement('p');tx.className='bp-txt';tx.textContent=_tr(ev.text);body.appendChild(tx);
      const tm=document.createElement('span');tm.className='bp-time';tm.textContent=ago(ev.ts);body.appendChild(tm);
      it.appendChild(body);
      const rm=document.createElement('button');rm.type='button';rm.className='bp-rm';rm.setAttribute('aria-label',_tr('Dismiss'));rm.textContent='✕';
      rm.onclick=ev2=>{ev2.stopPropagation();store.set(EV_KEY,events().filter(x=>x.id!==ev.id));renderItems();renderBell()};
      it.appendChild(rm);
      it.onclick=()=>{close();
        if(ev.full)document.dispatchEvent(new CustomEvent('qc:open-contact',{detail:ev.full}));
        if(ev.tab)document.dispatchEvent(new CustomEvent('qc:nav',{detail:ev.tab}))};
      list.appendChild(it);
    }
  }
  const chips=$('bpFilters');
  if(chips){
    chips.innerHTML=BP_FILTERS.map(([k,label])=>`<button type="button" data-bpf="${k}" aria-pressed="${k==='all'}">${_tr(label)}</button>`).join('');
    chips.onclick=e=>{
      const b=e.target.closest('[data-bpf]');if(!b)return;
      filter=b.dataset.bpf;
      chips.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      renderItems();
    };
  }
  btn.onclick=e=>{
    e.stopPropagation();
    if(!panel.hidden){close();return}
    renderItems();
    panel.hidden=false;
    /* Opening the panel counts as reading. */
    const unread=events().some(e=>!e.read);
    if(unread){store.set(EV_KEY,events().map(e=>Object.assign({},e,{read:true})));renderBell()}
  };
  $('bellClear').onclick=e=>{
    e.stopPropagation();store.set(EV_KEY,[]);renderBell();
    list.innerHTML='';const p=document.createElement('p');p.className='bp-empty';p.textContent=_tr('No notifications yet');list.appendChild(p);
  };
  document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&e.target!==btn&&!btn.contains(e.target))close()});
}

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
export function fillTpl(raw,vals,seed){return applyVariants(raw,seed).replace(VAR_RE,(m,k)=>vals[k.toLowerCase()]||m)}
/* Template keys the user must fill (auto-filled {greeting}/{date} and {name} excluded) */
export function customKeys(raw){const auto=autoVars(raw);return [...new Set([...raw.matchAll(VAR_RE)].map(m=>m[1].toLowerCase()))].filter(k=>!(k in auto)&&k!=='name')}

/* ---- Base64url for shareable template packs ---- */
export function b64uEnc(str){const by=new TextEncoder().encode(str);let bin='';by.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export function b64uDec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const bin=atob(s);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))}
