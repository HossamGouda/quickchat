/* tombstones.js — local ledger of deleted contacts/templates so cloud sync can
   propagate deletions instead of resurrecting them from the other side.
   A tombstone is {k:'c'|'t', full, delAt}; it purges after 30 days. */
import {store, state} from './core.js';

const KEY='qc_deleted';
export const PURGE_MS=30*864e5;

export function tombstones(){return store.get(KEY,[])}

export function addTombstone(k,full){
  const list=tombstones().filter(t=>!(t.k===k&&t.full===full));
  list.unshift({k,full,delAt:Date.now()});
  store.set(KEY,list);
}

export function removeTombstone(k,full){
  store.set(KEY,tombstones().filter(t=>!(t.k===k&&t.full===full)));
}

export function tombstoneFor(k,full){
  return tombstones().find(t=>t.k===k&&t.full===full);
}

/* Drop a tombstone and its record from the local store (after remote purge). */
export function purgeTombstone(k,full){
  removeTombstone(k,full);
  if(k==='c'){state.recents=state.recents.filter(x=>x.full!==full);store.set('qc_recents',state.recents)}
  else{state.tpls=state.tpls.filter(x=>x.id!==full);store.set('qc_tpls',state.tpls)}
}

export function purgeDue(){
  const now=Date.now();
  return tombstones().filter(t=>now-t.delAt>PURGE_MS);
}
