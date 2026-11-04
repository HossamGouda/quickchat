/* tabs.js — top tab navigation. */
import {$} from './core.js';
import {drawQR, fillCampSelect, drawCamp} from './qr.js';
import {renderFuPrompt, renderFollowups} from './followups.js';
import {fillTplSelect, renderQueue, renderCampSelect} from './queue.js';
import {renderStats, renderToday} from './stats.js';

const TABS=['chat','fu','queue','stats','qr'];
export function setTab(t){
  if(!TABS.includes(t))t='chat';
  TABS.forEach(x=>{$('tab-'+x).hidden=x!==t;$('tb-'+x).setAttribute('aria-selected',x===t)});
  try{history.replaceState(null,'',location.pathname+location.search+(t==='chat'?'':'#'+t))}catch(e){}
  if(t==='qr'){drawQR();fillCampSelect();drawCamp()}
  if(t==='fu'){renderToday();renderFuPrompt();renderFollowups()}
  if(t==='queue'){fillTplSelect();renderQueue();renderCampSelect()}
  if(t==='stats')renderStats()
  window.scrollTo(0,0);
}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)});
window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
