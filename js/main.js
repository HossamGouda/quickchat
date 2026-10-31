/* main.js — boot orchestration: initial render, deep links / share intents,
   language switching, and service worker registration. */
import {$, store, state, hydrateState, toast, extractNumbers} from './core.js';
import {i18nAll} from './i18n.js';
import {setCountry, setApp, update, handleText, pasteFromClipboard, numIn, hint} from './dialer.js';
import {renderTpls, showPack} from './templates.js';
import {renderRecents, loadRecent} from './recents.js';
import {renderBk, checkStorage} from './backup.js';
import {renderFuPrompt, startFollowUp} from './followups.js';
import {renderAttach, loadSharedFile} from './share.js';
import {APP_VERSION, renderWhatsNew} from './version.js';
import {setTab} from './tabs.js';
import {renderQueue, initQueue} from './queue.js';
import {drawQR, initQR} from './qr.js';
import {initSync} from './sync.js';
import {initNotify} from './notify.js';
import {initLock} from './lock.js';

/* Language switch re-renders every visible surface, then re-walks the DOM for translation. */
function setLang(l,quiet){
  state.lang=l;store.set('qc_lang',l);
  document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr';
  $('langBtn').textContent=l==='ar'?'English':'العربية';
  if(!quiet){renderTpls();renderRecents();renderFuPrompt();renderBk();update();renderAttach();if(!$('tab-queue').hidden)renderQueue();if(!$('tab-qr').hidden)drawQR()}
  i18nAll();
}
$('langBtn').onclick=()=>setLang(state.lang==='ar'?'en':'ar');

if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})})}

/* ---- Boot: wait for IndexedDB hydration, then run the original sequence ---- */
async function boot(){
await store.ready;
hydrateState();initLock();initQueue();initQR();initSync();initNotify();
setCountry(state.country);setApp(state.app);renderTpls();renderRecents();renderBk();checkStorage();
$('ver').textContent='QuickChat version '+APP_VERSION;
// Example state on first open so the tool shows how it works
const qs=new URLSearchParams(location.search);
const shared=[qs.get('title'),qs.get('text'),qs.get('url')].filter(Boolean).join(' ');
const action=qs.get('action'),pack=qs.get('pack'),fu=qs.get('fu'),sf=qs.get('file');
if(shared||action||pack||fu||sf){try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}store.set('qc_seen',true)}
setTab(location.hash.slice(1));
renderFuPrompt();
if(sf){setTab('chat');loadSharedFile()}else loadSharedFile();
if(fu){const r=state.recents.find(x=>x.full===fu.replace(/\D/g,''));if(r)startFollowUp(r);else{handleText('+'+fu,'');setTab('chat')}}
else if(pack){setTab('chat');showPack(pack)}
else if(shared){setTab('chat');if(!sf||extractNumbers(shared).length)handleText(shared,'share')}
else if(action==='last'){const r=state.recents[0];if(r){loadRecent(r);toast('Last number loaded. Tap Open chat')}else toast('No recent numbers yet')}
else if(action==='paste'){numIn.focus();pasteFromClipboard()}
renderWhatsNew();
setLang(state.lang,true);
if(!store.get('qc_seen',false)){numIn.value='0512345678';update();store.set('qc_seen',true);hint.innerHTML+=' <span style="color:var(--muted)">(example)</span>'}
}
boot().catch(e=>{
  console.error('QuickChat boot failed:',e);
  const card=document.createElement('div');
  card.className='card notice warnc';
  card.style.margin='20px';
  card.innerHTML=`<p><b>QuickChat could not start</b></p>
    <p class="bk">An update may have been only partially saved. Your data is safe.</p>
    <div class="row2"><button type="button" class="btn primary" id="bootRetry" style="flex:1">Retry</button></div>
    <p class="bk">If it keeps failing: uninstall the home-screen app and add it again, or clear site data in browser settings (take a backup first if you can open the app on another device).</p>`;
  document.body.prepend(card);
  document.getElementById('bootRetry').onclick=()=>location.reload();
});
