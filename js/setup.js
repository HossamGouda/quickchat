/* setup.js — first-run setup card: country + your name, so the example
   number, greetings and the contact QR start out right. Shown once. */
import {$, store, state, COUNTRIES, toast} from './core.js';
import {tr} from './i18n.js';
import {setCountry} from './dialer.js';

export function initSetup(){
  if(store.get('qc_setup_done',false))return;
  const card=$('setupCard');
  card.hidden=false;
  const paint=()=>{document.querySelectorAll('#suCountries .cc').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===state.country)))};
  $('suCountries').innerHTML=COUNTRIES.map(c=>`<button type="button" class="cc" data-id="${c.id}" aria-pressed="${c.id===state.country}">${c.name}<small>${c.code?'+'+c.code:'…'}</small></button>`).join('');
  $('suCountries').addEventListener('click',e=>{
    const b=e.target.closest('.cc');if(!b)return;
    setCountry(b.dataset.id);paint();
  });
  const done=skip=>{
    const name=$('suName').value.trim().slice(0,60);
    if(name){const q=store.get('qc_qr',{num:'',msg:"Hello, I'd like a quotation.",cap:'',vn:'',org:'',mail:''});q.vn=name;store.set('qc_qr',q);const qn=$('qrVn');if(qn)qn.value=name}
    store.set('qc_setup_done',true);store.set('qc_seen',true);
    card.hidden=true;
    if(!skip)toast(tr('You are all set'));
  };
  $('suGo').onclick=()=>done(false);
  $('suSkip').onclick=()=>done(true);
}
