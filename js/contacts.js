/* contacts.js — pick a number from the phone's contact book (native app only).
   Reads via the QCContacts native plugin; on web the picker button stays hidden. */
import {$, toast, esc, normalize} from './core.js';
import {tr} from './i18n.js';
import {numIn, labelIn, setCountry, update} from './dialer.js';

function capContacts(){return (window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.QCContacts)||null}
function isNative(){return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}

let sheet=null;

export function initContacts(){
  const btn=$('pickContact');
  if(!btn)return;
  if(!isNative()||!capContacts()){btn.hidden=true;return}
  btn.hidden=false;
  btn.onclick=openPicker;
}

function closeSheet(){if(sheet){sheet.remove();sheet=null}}

async function openPicker(){
  const cap=capContacts();
  try{
    const {granted}=await cap.requestAccess();
    if(!granted){toast(tr('Contacts access denied. Enable it in system settings for QuickChat.'),{type:'err'});return}
  }catch(e){
    toast(tr('Contacts access denied. Enable it in system settings for QuickChat.'),{type:'err'});
    return;
  }
  showSheet();
  await load('');
}

function showSheet(){
  closeSheet();
  sheet=document.createElement('div');
  sheet.className='qc-sheet-back';
  sheet.innerHTML=`<div class="qc-sheet" role="dialog" aria-label="${esc(tr('Pick a contact'))}">
    <div class="qc-ct-head"><b>${esc(tr('Pick a contact'))}</b><button type="button" class="btn small" data-x aria-label="Close">✕</button></div>
    <input id="ctSearch" class="txt" type="search" autocomplete="off" placeholder="${esc(tr('Search contacts'))}" dir="auto">
    <div class="qc-ct-list" id="ctList"><p class="qc-ct-empty">${esc(tr('Loading…'))}</p></div>
  </div>`;
  sheet.addEventListener('click',e=>{
    if(e.target===sheet||e.target.closest('[data-x]')){closeSheet();return}
    const chip=e.target.closest('[data-full]');
    if(chip)pickNumber(chip.dataset.full,chip.dataset.name);
  });
  document.body.appendChild(sheet);
  const s=$('ctSearch');let t;
  s.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>load(s.value.trim()),250)});
  s.focus();
}

async function load(q){
  const list=$('ctList');if(!list)return;
  list.innerHTML=`<p class="qc-ct-empty">${esc(tr('Loading…'))}</p>`;
  let res;
  try{res=await capContacts().list({query:q})}
  catch(e){list.innerHTML=`<p class="qc-ct-empty">${esc(tr('Could not read contacts'))}</p>`;return}
  const cs=res.contacts||[];
  if(!cs.length){list.innerHTML=`<p class="qc-ct-empty">${esc(tr('No contacts found'))}</p>`;return}
  list.innerHTML=cs.map(c=>{
    const nums=(c.phones||[]).map(p=>{
      const digits=(p.number||'').replace(/\D/g,'');
      if(!digits)return '';
      return `<button type="button" class="chip" data-full="${esc(digits)}" data-name="${esc(c.name||'')}">${esc(p.number)}<small>${esc(p.label||'')}</small></button>`;
    }).join('');
    return `<div class="qc-ct"><div class="qc-ct-name">${esc(c.name||'?')}</div><div class="qc-ct-nums">${nums||`<span class="qc-ct-none">${esc(tr('No phone numbers'))}</span>`}</div></div>`;
  }).join('');
}

/* Fill the dialer via normalize(), which understands every stored format:
   +9665…, 009665…, 9665… (explicit country code) and 0559… / 5598… (local
   number — the leading zero is dropped and the selected country's code is
   applied; any known country matching the length/pattern wins). Unmatched
   numbers fall back to the raw digits so parse() shows its usual hint. */
function pickNumber(full,name){
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
  closeSheet();
  toast(tr('Number added'));
}
