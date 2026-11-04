/* dialer.js — country picker, number parsing, and WhatsApp link building (Chat tab). */
import {$, store, state, COUNTRIES, country, extractNumbers, toast} from './core.js';
import {renderVars, leftoverVars, applyVars} from './templates.js';
import {addRecent} from './recents.js';
import {setDueVal, renderFuPrompt, renderFollowups} from './followups.js';
import {queueState, qParse} from './queue.js';
import {setTab} from './tabs.js';

export const ccIn=$('cc'), numIn=$('num'), msgIn=$('msg'), hint=$('hint'), go=$('go'), labelIn=$('label');

function renderCountries(){
  $('countries').innerHTML=COUNTRIES.map(c=>`<button type="button" class="cc" data-id="${c.id}" aria-pressed="${c.id===state.country}">${c.name}<small>${c.code?'+'+c.code:'…'}</small></button>`).join('');
}
export function setCountry(id,keepCode){
  state.country=id;store.set('qc_country',id);
  const c=country();
  if(!keepCode) ccIn.value=c.code;
  ccIn.readOnly=c.id!=='ot';
  numIn.placeholder=c.ph;
  renderCountries();update();
}

/* Parse what the user typed. Returns {code, local, full, error} */
function parse(){
  let raw=numIn.value.trim();
  const hadPlus=/^\s*\+/.test(raw);
  let d=raw.replace(/\D/g,'');
  if(!d) return {empty:true};
  // International input: +XXX or 00XXX
  if(hadPlus||d.startsWith('00')){
    if(d.startsWith('00')) d=d.slice(2);
    const hit=COUNTRIES.filter(c=>c.code).find(c=>d.startsWith(c.code));
    if(hit){
      if(hit.id!==state.country) setCountry(hit.id);
      d=d.slice(hit.code.length);
    } else {
      if(state.country!=='ot') setCountry('ot');
      return {full:d,code:'',local:d,warn:'Unknown country code. Number used as typed.'};
    }
  } else {
    // Number already includes the selected country's code without +
    const c=country();
    if(c.code && d.startsWith(c.code) && d.length===c.code.length+c.len) d=d.slice(c.code.length);
  }
  const c=country();
  const code=(ccIn.value||'').replace(/\D/g,'');
  d=d.replace(/^0+/,'');
  if(c.id==='ot'){
    if(!code) return {error:'Enter the country code for "Other".'};
    if(d.length<6) return {error:'Number looks too short.'};
    return {code,local:d,full:code+d};
  }
  if(d.length<c.len) return {error:`Too short. ${c.name} mobile numbers have ${c.len} digits after the code.`,partial:true};
  if(d.length>c.len) return {error:`Too long. ${c.name} mobile numbers have ${c.len} digits after the code.`};
  const warn=c.first&&!c.first.test(d)?`This doesn't look like a ${c.name} mobile number. Check it before sending.`:'';
  return {code,local:d,full:code+d,warn};
}

export function nameFromLabel(){return labelIn.value.trim().split(/\s+[-–—]\s+|[,|]/)[0].trim()}

function applyNumber(n){
  setCountry(n.country);
  if(n.intl){numIn.value='+'+n.full}else{numIn.value=n.local}
  $('picks').hidden=true;update();
}
export function handleText(text,source){
  const found=extractNumbers(text||'');
  const p=$('picks');
  if(!found.length){p.hidden=true;toast(source==='share'?'No phone number found in shared text':'No phone number found');return false}
  if(found.length===1){applyNumber(found[0]);if(source)toast('Number added');return true}
  p.innerHTML='<p>'+found.length+' numbers found. Tap the one to message:</p><div class="chips">'+found.map((n,i)=>{
    const c=COUNTRIES.find(x=>x.id===n.country);
    return `<button type="button" class="chip" data-i="${i}">+${n.code?n.code+' '+n.local:n.full}<small>${c.id==='ot'?'':c.name}</small></button>`}).join('')+'</div>'
    +'<button type="button" class="btn small" id="toQueue">Add all '+found.length+' to follow-up queue</button>';
  p.hidden=false;p._found=found;p._text=text;
  return true;
}

export function buildLink(full,txt){
  const t=(txt===undefined?msgIn.value:txt).trim();
  const p='phone='+full+(t?'&text='+encodeURIComponent(t):'');
  const web='https://wa.me/'+full+(t?'?text='+encodeURIComponent(t):'');
  const pkg=state.app==='wb'?'com.whatsapp.w4b':'com.whatsapp';
  if(/Android/i.test(navigator.userAgent))
    return 'intent://send?'+p+'#Intent;scheme=whatsapp;package='+pkg+';S.browser_fallback_url='+encodeURIComponent(web)+';end';
  return web;
}

/* Navigate to a chat link. In the Capacitor native shell the WebView cannot
   resolve intent:// URLs (Bridge.launchIntent would ACTION_VIEW the raw string),
   so a tiny native plugin (QCOpen) parses the intent URI properly. */
export function openChat(url,full){
  const cap=window.Capacitor;
  if(cap&&cap.isNativePlatform&&cap.isNativePlatform()&&cap.Plugins&&cap.Plugins.QCOpen){
    /* Native: QCOpen parses intent:// and launches WhatsApp. On failure
       (WhatsApp not installed, or wrong variant selected) say so — do NOT
       navigate the WebView to wa.me, which leaves the app stuck. */
    cap.Plugins.QCOpen.open({url}).catch(()=>{toast('Could not open WhatsApp. Is it installed?')});
    return;
  }
  location.href=url;
}

let current=null;
export function currentNumber(){return current}
export function update(){
  const r=parse();
  current=null;
  hint.className='hint';
  if(r.empty){hint.textContent='Paste or type a number. Local or international format both work.';}
  else if(r.error){hint.textContent=r.error;if(!r.partial)hint.className='hint err';}
  else{
    current=r;
    hint.innerHTML=(r.warn?`<span style="color:var(--danger)">${r.warn}</span><br>`:'')+`Will open: <span class="preview">+${r.code} ${r.local}</span>`;
    if(!r.warn)hint.className='hint ok';
  }
  if(current){go.href=buildLink(current.full);go.setAttribute('aria-disabled','false');}
  else{go.href='#';go.setAttribute('aria-disabled','true');}
}

export function setApp(a){state.app=a;store.set('qc_app',a);$('appWa').setAttribute('aria-pressed',a==='wa');$('appWb').setAttribute('aria-pressed',a==='wb');update()}

go.addEventListener('click',e=>{
  e.preventDefault();if(!current)return;
  const left=leftoverVars();
  if(left.length){toast('Fill '+[...new Set(left)].join(', ')+' first');const v=$('vars').querySelector('input');if(v)v.focus();else msgIn.focus();return}
  addRecent();
  if(state.fuActive===current.full){const r=state.recents.find(x=>x.full===current.full);if(r){setDueVal(r,'');r.fuMsg=''}state.fuActive=null;store.set('qc_recents',state.recents)}
  store.set('qc_fuPrompt',current.full);state.cardMode='just';renderFuPrompt();renderFollowups();openChat(buildLink(current.full),current.full);
});
msgIn.addEventListener('input',()=>{if(state.pending){state.pending=null;renderVars()}});
labelIn.addEventListener('input',()=>{const p=state.pending;if(p&&p.nameAuto&&p.keys.includes('name')){p.vals.name=nameFromLabel();renderVars();applyVars()}});

function capClip(){return (window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Clipboard)||null}
function isNative(){return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())}
export async function pasteFromClipboard(){
  /* Native app: the Capacitor Clipboard plugin reads via the OS clipboard
     manager — no browser permission prompt, no user-gesture requirement. */
  if(isNative()){
    try{
      const {value}=await capClip().read();
      if(value&&value.trim())return handleText(value,'paste');
      toast('Clipboard is empty');
    }catch(e){toast('Clipboard is empty')}
    return false;
  }
  try{const t=await navigator.clipboard.readText();if(t&&t.trim())return handleText(t,'paste');toast('Clipboard is empty')}
  catch(err){
    /* Chrome grants clipboard-read per user gesture: offer a retry button so
       the next tap happens inside a click (where the browser prompt can appear). */
    toast('Allow clipboard access, or long-press the field to paste',{type:'err',action:{label:'Try again',fn:()=>pasteFromClipboard()}});
    numIn.focus();
  }
  return false;
}
/* Proactive clipboard-permission ask. Browsers only show their allow/deny prompt
   inside a user gesture, so we surface one toast with a Paste action instead of
   waiting for the first failed paste. Native app: the plugin needs no permission. */
export function initClipboardAsk(){
  try{
    if(isNative())return;
    if(!navigator.permissions||!navigator.permissions.query)return;
    navigator.permissions.query({name:'clipboard-read'}).then(p=>{
      if(p.state==='denied'){
        if(!store.get('qc_clip_denied_note')){
          store.set('qc_clip_denied_note',1);
          toast('Clipboard access is blocked. Enable it in the browser site settings to keep one-tap paste.',{type:'info',dur:5200});
        }
        return;
      }
      if(p.state==='prompt'&&!store.get('qc_clip_asked')){
        store.set('qc_clip_asked',1);
        toast('One-tap paste needs clipboard access. Tap below, then choose Allow.',{type:'info',dur:8000,action:{label:'Paste',fn:()=>pasteFromClipboard()}});
      }
      p.onchange=()=>{if(p.state==='granted')toast('Clipboard access allowed — one-tap paste is on',{type:'ok'})};
    }).catch(()=>{});
  }catch(e){}
}
$('paste').onclick=pasteFromClipboard;
numIn.addEventListener('paste',e=>{
  const t=(e.clipboardData||window.clipboardData).getData('text');
  if(!t)return;
  const found=extractNumbers(t);
  /* One number that belongs to a different country than the selected one:
     route it through normalize (the same engine as the contacts picker) so
     the country auto-switches. Raw field paste would only validate against
     the selected country and reject it as too short/long. */
  if(found.length===1&&found[0].country!=='ot'&&found[0].country!==state.country){
    e.preventDefault();applyNumber(found[0]);toast('Number added');return;
  }
  if(/[^\d\s+\-().]/.test(t)||found.length>1){e.preventDefault();handleText(t,'paste')}
});
$('picks').addEventListener('click',e=>{if(e.target.id==='toQueue'){const p=$('picks'),q=queueState();if(q&&q.items.some(i=>i.status==='pending')){toast('Finish or end the current queue first');setTab('queue');return}$('qText').value=p._text;p.hidden=true;setTab('queue');qParse();return}const b=e.target.closest('.chip');if(b)applyNumber($('picks')._found[+b.dataset.i])});

$('copyLink').onclick=()=>{
  if(!current){toast('Enter a valid number first');return}
  const link='https://wa.me/'+current.full+(msgIn.value.trim()?'?text='+encodeURIComponent(msgIn.value.trim()):'');
  const fallback=()=>{numIn.value=link;numIn.select();toast('Select and copy the link')};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link).then(()=>toast('Link copied'),fallback)}else fallback();
};
$('clear').onclick=()=>{numIn.value='';msgIn.value='';labelIn.value='';state.pending=null;renderVars();$('picks').hidden=true;update();numIn.focus()};

$('countries').addEventListener('click',e=>{const b=e.target.closest('.cc');if(b)setCountry(b.dataset.id)});
$('appWa').onclick=()=>setApp('wa');
$('appWb').onclick=()=>setApp('wb');
numIn.addEventListener('input',update);
ccIn.addEventListener('input',update);
msgIn.addEventListener('input',update);
