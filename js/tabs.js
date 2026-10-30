/* tabs.js — top tab navigation. */
import {$} from './core.js';
import {drawQR} from './qr.js';
import {renderFuPrompt, renderFollowups} from './followups.js';
import {fillTplSelect, renderQueue} from './queue.js';

const TABS=['chat','fu','queue','qr'];
export function setTab(t){
  if(!TABS.includes(t))t='chat';
  TABS.forEach(x=>{$('tab-'+x).hidden=x!==t;$('tb-'+x).setAttribute('aria-selected',x===t)});
  try{history.replaceState(null,'',location.pathname+location.search+(t==='chat'?'':'#'+t))}catch(e){}
  if(t==='qr')drawQR();
  if(t==='fu'){renderFuPrompt();renderFollowups()}
  if(t==='queue'){fillTplSelect();renderQueue()}
  window.scrollTo(0,0);
}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)});
window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
