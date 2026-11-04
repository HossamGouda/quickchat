/* settings.js — full-screen Settings pane (backup, cloud sync, reminders, privacy, about). */
import {$, store} from './core.js';

export function openSettings(){
  $('main').hidden=true;
  $('paneSettings').hidden=false;
  window.scrollTo(0,0);
}
export function closeSettings(){
  $('paneSettings').hidden=true;
  $('main').hidden=false;
  window.scrollTo(0,0);
}
/* E1: theme — 'system' removes the attribute (OS decides via the media
   query), 'light' opts out of dark, 'dark' forces it. The CSS hooks for
   [data-theme] already exist in styles.css. */
export function applyTheme(){
  const t=store.get('qc_theme','system');
  if(t==='dark')document.documentElement.dataset.theme='dark';
  else if(t==='light')document.documentElement.dataset.theme='light';
  else delete document.documentElement.dataset.theme;
  return t;
}
export function initSettings(){
  $('setBtn').onclick=openSettings;
  $('setBack').onclick=closeSettings;
  const cur=applyTheme();
  document.querySelectorAll('[data-thm]').forEach(b=>{
    b.setAttribute('aria-pressed',String(b.dataset.thm===cur));
    b.onclick=()=>{
      store.set('qc_theme',b.dataset.thm);
      const c=applyTheme();
      document.querySelectorAll('[data-thm]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.thm===c)));
    };
  });
}
