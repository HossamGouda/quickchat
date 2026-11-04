/* contacts.js — pick numbers from the phone book and/or QuickChat people.
   v5.1: one sheet, two sources. "Phone contacts" reads the device book via
   the QCContacts native plugin (Android app only); "QuickChat people" lists
   your in-app recents with their follow-up status. On the web only the
   second source works and the first explains itself.
   pickContact(cb): single pick → cb(digits, name)   (Chat tab, Follow-ups)
   pickPeople(cb):  multi pick → cb([{digits, name}]) (Queue "Add from your people") */
import {$, toast, esc, normalize, state, ST_LABEL} from './core.js';
import {tr} from './i18n.js';
import {numIn, labelIn, setCountry, update} from './dialer.js';

function capContacts(){return (window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.QCContacts)||null}
function isNative(){return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}

let sheet=null,mode='single',onDoneCb=null,source='phone',sel=new Map(),searchT=null;

export function initContacts(){
  const btn=$('pickContact');
  if(!btn)return;
  if(!isNative()||!capContacts()){btn.hidden=true;return}
  btn.hidden=false;
  btn.onclick=()=>pickContact((digits,name)=>fillDialer(digits,name));
}

/* Open the picker; cb receives (digits, name) of the tapped number. */
export function pickContact(cb){openPicker('single',rows=>{const r=rows[0];if(r)cb(r.digits,r.name)})}
/* Multi-select variant; cb receives an array of {digits, name}. */
export function pickPeople(cb){openPicker('multi',rows=>cb(rows))}

async function openPicker(pickMode,cb){
  const cap=capContacts();
  const native=!!(cap&&isNative());
  mode=pickMode;onDoneCb=cb;sel=new Map();
  source=native?'phone':'people';
  if(source==='phone'){
    try{
      const {granted}=await cap.requestAccess();
      if(!granted){toast(tr('Contacts access denied. Enable it in system settings for QuickChat.'),{type:'err'});source='people'}
    }catch(e){
      toast(tr('Contacts access denied. Enable it in system settings for QuickChat.'),{type:'err'});
      source='people';
    }
  }
  showSheet();
  load('');
}

function closeSheet(){if(sheet){sheet.remove();sheet=null}onDoneCb=null;sel=new Map()}

function showSheet(){
  if(sheet)closeSheet();
  const title=mode==='multi'?tr('Add from your people'):tr('Pick a contact');
  sheet=document.createElement('div');
  sheet.className='qc-sheet-back';
  sheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(title)}">
    <div class="qc-ct-head"><b>${esc(title)}</b><button type="button" class="btn small" data-x aria-label="${esc(tr('Close'))}">✕</button></div>
    <div class="wrapr qc-src" role="group" aria-label="${esc(tr('Contact source'))}" hidden>
      <button type="button" class="chip" data-src="phone">${esc(tr('Phone contacts'))}</button>
      <button type="button" class="chip" data-src="people">${esc(tr('QuickChat people'))}</button>
    </div>
    <p class="qc-ct-note" hidden></p>
    <input id="ctSearch" class="txt" type="search" autocomplete="off" placeholder="${esc(tr('Search contacts'))}" dir="auto">
    <div class="qc-ct-list" id="ctList"><p class="qc-ct-empty">${esc(tr('Loading…'))}</p></div>
    <button type="button" class="btn primary" id="ctAdd" hidden aria-disabled="true">${esc(tr('Add to list'))}</button>
  </div>`;
  sheet.addEventListener('click',e=>{
    if(e.target===sheet||e.target.closest('[data-x]')){closeSheet();return}
    const src=e.target.closest('[data-src]');
    if(src){setSource(src.dataset.src);return}
    const row=e.target.closest('[data-digits]');
    if(row){
      const digits=row.dataset.digits,name=row.dataset.name||'',cb=onDoneCb;
      if(mode==='single'){closeSheet();if(cb)cb([{digits,name}]);return}
      if(sel.has(digits)){sel.delete(digits);row.setAttribute('data-on','false')}
      else{sel.set(digits,{digits,name});row.setAttribute('data-on','true')}
      paintAdd();return;
    }
    if(e.target.closest('#ctAdd')){
      if(!sel.size)return;
      const rows=[...sel.values()],cb=onDoneCb;
      closeSheet();if(cb)cb(rows);
    }
  });
  document.body.appendChild(sheet);
  const s=$('ctSearch');
  s.addEventListener('input',()=>{clearTimeout(searchT);searchT=setTimeout(()=>load(s.value.trim()),source==='phone'?250:0)});
  s.focus();
  paintSrc();
}

function paintSrc(){
  const grp=sheet.querySelector('.qc-src'),note=sheet.querySelector('.qc-ct-note');
  if(grp){
    const native=!!(capContacts()&&isNative());
    grp.hidden=!native;
    grp.querySelectorAll('[data-src]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.src===source)));
  }
  if(note){
    /* The phone book needs the native plugin; on the web explain that the
       list below is QuickChat people, not the device contacts. */
    note.hidden=!!isNative();
    note.textContent=tr('Contacts are only available in the Android app');
  }
  const add=$('ctAdd');
  if(add)add.hidden=mode!=='multi';
  paintAdd();
}
function setSource(src){
  if(src===source)return;
  source=src;
  const s=$('ctSearch');if(s)s.value='';
  paintSrc();load('');
}
function paintAdd(){
  const add=$('ctAdd');if(!add)return;
  add.textContent=sel.size?tr(`Add ${sel.size} to list`):tr('Add to list');
  add.setAttribute('aria-disabled',String(!sel.size));
}

function load(query){
  if(source==='phone')loadPhone(query);else loadPeople(query);
}

async function loadPhone(query){
  const list=$('ctList');if(!list)return;
  list.innerHTML=`<p class="qc-ct-empty">${esc(tr('Loading…'))}</p>`;
  let res;
  try{res=await capContacts().list({query:query})}
  catch(e){list.innerHTML=`<p class="qc-ct-empty">${esc(tr('Could not read contacts'))}</p>`;return}
  const cs=res.contacts||[],seen=new Set(),rows=[];
  cs.forEach(c=>(c.phones||[]).forEach(p=>{
    const digits=(p.number||'').replace(/\D/g,'');
    if(!digits||seen.has(digits))return;
    seen.add(digits);
    rows.push({digits,name:c.name||'',sub:p.label||'',display:p.number||digits});
  }));
  if(!rows.length){list.innerHTML=`<p class="qc-ct-empty">${esc(tr('No contacts found'))}</p>`;return}
  list.innerHTML=rows.map(r=>rowHtml(r.digits,r.name,`+${r.display}${r.sub?' · '+esc(r.sub):''}`)).join('');
}
function loadPeople(query){
  const list=$('ctList');if(!list)return;
  const qd=query.replace(/\D/g,''),ql=query.toLowerCase();
  const rows=state.recents.filter(r=>!query||(r.label||'').toLowerCase().includes(ql)||(qd&&r.full.includes(qd))).slice(0,200);
  if(!rows.length){list.innerHTML=`<p class="qc-ct-empty">${esc(tr('No contacts here yet.'))}</p>`;return}
  list.innerHTML=rows.map(r=>{
    const sub=(r.status?ST_LABEL[r.status]:'')+(r.status?' · ':'')+'+'+(r.code?r.code+' '+r.local:r.full);
    return rowHtml(r.full,r.label||'',sub);
  }).join('');
}
function rowHtml(digits,name,sub){
  return `<div class="qc-ct qc-pick" data-digits="${esc(digits)}" data-name="${esc(name)}" data-on="${sel.has(digits)}" role="button" tabindex="0">
    <div class="qc-ct-row"><span class="qc-ct-name">${esc(name||('+'+digits))}</span>${mode==='multi'?`<span class="qc-pick-tick" aria-hidden="true">${sel.has(digits)?'✓':''}</span>`:''}</div>
    <div class="rnum">${sub}</div>
  </div>`;
}

/* Fill the dialer via normalize(), which understands every stored format:
   +9665…, 009665…, 9665… (explicit country code) and 0559… / 5598… (local
   number — the leading zero is dropped and the selected country's code is
   applied; any known country matching the length/pattern wins). Unmatched
   numbers fall back to the raw digits so parse() shows its usual hint. */
function fillDialer(full,name){
  if(!full)return;
  const n=normalize(full);
  if(n){
    setCountry(n.country);
    numIn.value=n.intl?'+'+n.full:n.local;
  }else{
    numIn.value=full;
  }
  if(!labelIn.value.trim()&&name)labelIn.value=name;
  update();
  labelIn.dispatchEvent(new Event('input'));
  toast(tr('Number added'));
}
