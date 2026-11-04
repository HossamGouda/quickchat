/* statsutil.js — pure compute helpers for the stats tab (no DOM, no state imports).
   Unit-tested in tools/stats_test.cjs. Mirrors the outcome/status keys in core.js. */
import {isoWeekKey} from './qutil.js';

export const OUTCOME_KEYS=['sent','noreply','replied','interested'];
export const STATUS_KEYS=['','lead','contacted','quoted','waiting','negotiating','won','lost'];

/* Count outcome log events per outcome key: {sent, noreply, replied, interested}. */
export function outcomeCounts(recs){
  const c={};OUTCOME_KEYS.forEach(o=>c[o]=0);
  recs.forEach(r=>(r.log||[]).forEach(x=>{if(x.e==='outcome'&&c[x.v]!==undefined)c[x.v]++}));
  return c;
}

/* Replies = replied + interested events. Rate = replies / sent events, 0..1. */
export function responseRate(oc){
  const sent=oc.sent||0,replies=(oc.replied||0)+(oc.interested||0);
  return sent?replies/sent:0;
}

/* Last `weeks` ISO weeks (oldest first) with per-outcome event counts. */
export function weeklyCounts(recs,weeks,now){
  const anchor=new Date(now||Date.now());
  const keys=[];
  for(let i=weeks-1;i>=0;i--){
    const d=new Date(anchor.getTime()-i*7*864e5);
    keys.push(isoWeekKey(d));
  }
  const rows=keys.map(k=>({wk:k,c:{},n:0}));
  const idx=Object.fromEntries(keys.map((k,i)=>[k,i]));
  recs.forEach(r=>(r.log||[]).forEach(x=>{
    if(x.e!=='outcome')return;
    const i=idx[isoWeekKey(new Date(x.t))];
    if(i===undefined)return;
    rows[i].c[x.v]=(rows[i].c[x.v]||0)+1;rows[i].n++;
  }));
  return rows;
}

/* Count records per pipeline status (r.status). */
export function statusCounts(recs){
  const c={};STATUS_KEYS.forEach(s=>c[s]=0);
  recs.forEach(r=>{if(c[r.status||'']!==undefined)c[r.status||'']++});
  return c;
}

/* Lost-reason tally for lost records: {price: n, ...} (empty reasons under ''). */
export function lostReasonCounts(recs){
  const c={};
  recs.forEach(r=>{if(r.status==='lost'){const k=r.lostWhy||'';c[k]=(c[k]||0)+1}});
  return c;
}

/* Lead-source tally: only records with a src; {src: n}. */
export function srcCounts(recs){
  const c={};
  recs.forEach(r=>{if(r.src){c[r.src]=(c[r.src]||0)+1}});
  return c;
}

/* How many records carry any outcome log (the "messaged" denominator). */
export function messagedCount(recs){
  return recs.filter(r=>(r.log||[]).some(x=>x.e==='outcome')).length;
}

/* Today screen + weekly summary helpers. */
export function dueOn(recs,day){return recs.filter(r=>r.due===day).length}
export function expiringQuotes(recs,now){
  const t0=new Date(now||Date.now());t0.setHours(0,0,0,0);const t=t0.getTime();
  return recs.filter(r=>{
    if(r.status==='won'||r.status==='lost'||!r.valid)return false;
    const d=(Date.parse(r.valid)-t)/864e5;
    return d>=0&&d<=7;
  }).length;
}
export function newLeads(recs){
  return recs.filter(r=>r.status==='lead'&&!(r.log||[]).some(x=>x.e==='outcome')).length;
}
export function weekSummary(recs,now){
  const wk=isoWeekKey(new Date(now||Date.now()));
  const s={sent:0,replied:0,interested:0,won:0,lost:0};
  recs.forEach(r=>(r.log||[]).forEach(x=>{
    if(isoWeekKey(new Date(x.t))!==wk)return;
    if(x.e==='outcome'){
      if(x.v==='sent')s.sent++;
      else if(x.v==='replied')s.replied++;
      else if(x.v==='interested')s.interested++;
    }else if(x.e==='status'){
      if(x.v==='won')s.won++;
      else if(x.v==='lost')s.lost++;
    }
  }));
  return s;
}
