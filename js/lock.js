/* lock.js — optional 4-digit PIN lock.
   The PIN is salted and SHA-256 hashed (crypto.subtle, HTTPS only); the PIN
   itself is never stored. The lock is a privacy screen against a picked-up
   phone — it does not encrypt the data. It engages on boot and whenever the
   app is hidden. "Forgot PIN" disables the lock (data is kept). */
import {$, store, toast} from './core.js';
import {tr} from './i18n.js';

const KEY='qc_lock';
const lockState=()=>store.get(KEY,null);
const hasCrypto=()=>typeof crypto!=='undefined'&&crypto.subtle&&typeof crypto.subtle.digest==='function';

let entry='',phase='unlock',pending='';

async function sha(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function drawDots(){
  $('lockDots').innerHTML=[0,1,2,3].map(i=>`<i class="${i<entry.length?'on':''}"></i>`).join('');
}
function msg(t){$('lockMsg').textContent=t}
function renderPad(){
  const keys=['1','2','3','4','5','6','7','8','9','','0','⌫'];
  $('lockPad').innerHTML=keys.map(k=>k===''?'<span></span>'
    :`<button type="button" class="btn padkey" data-k="${k}" aria-label="${k==='⌫'?'Delete digit':k}">${k}</button>`).join('');
}
function reset(newPhase){
  entry='';phase=newPhase;
  msg(phase==='unlock'?tr('Enter your PIN'):phase==='choose'?tr('Choose a 4-digit PIN'):tr('Confirm your PIN'));
  $('lockForgot').hidden=phase!=='unlock'||!lockState();
  $('lockCancel').hidden=phase==='unlock';
  drawDots();
}
async function commit(){
  const pin=entry;entry='';drawDots();
  if(phase==='unlock'){
    const st=lockState();
    if(st&&await sha(st.salt+pin)===st.hash){$('lockScreen').hidden=true;toast(tr('Welcome back'))}
    else{msg(tr('Wrong PIN. Try again.'));setTimeout(()=>reset('unlock'),400)}
    return;
  }
  if(phase==='choose'){pending=pin;reset('confirm');return}
  /* confirm */
  if(pin!==pending){msg(tr('PINs do not match. Start again.'));setTimeout(()=>reset('choose'),400);return}
  const salt=String(Date.now())+Math.random().toString(36).slice(2,8);
  store.set(KEY,{salt,hash:await sha(salt+pin)});
  $('lockScreen').hidden=true;renderLockUI();toast(tr('PIN set. The app locks when you leave it.'));
}
function press(k){
  if(k==='⌫'){entry=entry.slice(0,-1);drawDots();return}
  if(entry.length>=4)return;
  entry+=k;drawDots();
  if(entry.length===4)commit();
}

export function isLocked(){return !!lockState()}
export function lock(){
  if(!lockState())return;
  $('lockScreen').hidden=false;reset('unlock');
}
function startSetup(){
  if(!hasCrypto()){toast(tr('PIN lock needs a secure connection (HTTPS).'));renderLockUI();return}
  $('lockScreen').hidden=false;reset('choose');
}

export function renderLockUI(){
  const el=$('lockToggle');if(!el)return;
  const st=!!lockState(),ok=hasCrypto();
  el.checked=st;
  $('lockInfo').textContent=!ok?tr('PIN lock needs a secure connection (HTTPS).'):tr('The app locks itself when you leave it.');
}
export function initLock(){
  renderPad();
  renderLockUI();
  $('lockToggle').onchange=()=>{
    if($('lockToggle').checked)startSetup();
    else{store.set(KEY,null);renderLockUI();toast(tr('Lock disabled'))}
  };
  $('lockPad').addEventListener('click',e=>{
    const b=e.target.closest('[data-k]');if(b)press(b.dataset.k);
  });
  $('lockForgot').onclick=()=>{store.set(KEY,null);$('lockScreen').hidden=true;renderLockUI();toast(tr('Lock disabled'))};
  $('lockCancel').onclick=()=>{$('lockScreen').hidden=true;renderLockUI();toast(tr('Cancel'))};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)lock()});
  /* Keyboard entry on desktops */
  document.addEventListener('keydown',e=>{
    if($('lockScreen').hidden)return;
    if(/^\d$/.test(e.key))press(e.key);
    if(e.key==='Backspace')press('⌫');
  });
  if(lockState())lock();
}
