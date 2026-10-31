/* settings.js — full-screen Settings pane (backup, cloud sync, reminders, privacy, about). */
import {$} from './core.js';

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
export function initSettings(){
  $('setBtn').onclick=openSettings;
  $('setBack').onclick=closeSettings;
}
