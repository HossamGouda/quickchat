/* qutil.js — pure helpers for the queue section (no DOM, no state imports).
   Unit-tested in tools/queue_test.cjs. */

/* Skip reasons that exclude an item from the finish-line "Resume" retry. */
const SKIP_RETRY_BLOCK=new Set(['wrong','no']);

/* Q3: is a skipped item eligible for retry at the finish line?
   'wrong' (wrong number) and 'no' (not interested) are terminal;
   'later' (no answer) and legacy reason-less skips stay retryable. */
export function retryableSkipped(why){return !SKIP_RETRY_BLOCK.has(why||'')}

/* Q5: ISO-8601 week key, e.g. '2026-W44', for the "sent this week" counter.
   Weeks start Monday; belongs-to rules follow the ISO week date system. */
export function isoWeekKey(d){
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=dt.getUTCDay()||7;
  dt.setUTCDate(dt.getUTCDate()+4-day);
  const year=dt.getUTCFullYear();
  const jan1=new Date(Date.UTC(year,0,1));
  const week=Math.ceil((((dt-jan1)/864e5)+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}

/* Q2: pace options in ms, rendered as chips/select entries elsewhere.
   0 = off (no lock). */
export const PACES=[[0,'Off'],[3000,'3 s'],[8000,'8 s'],[15000,'15 s']];
export function paceMs(v){return PACES.some(p=>p[0]===v)?v:3000}

/* Q3: skip-reason keys + their short row tags. */
export const SKIP_REASONS=[['wrong','Wrong number'],['later','No answer — try later'],['no','Not interested']];

/* O3: built-in follow-up sequence — the quote chase. step is 1-based;
   seqPlan() returns {due,off,msg} for the next step or null past the end.
   Pure: the caller passes today's YYYY-MM-DD. */
export const SEQ_QUOTE={
  key:'quote',
  label:'Quote chase: 3d → 7d → 14d',
  steps:[
    {off:3,msg:'{greeting} {name}, just following up on the quotation I sent. Any questions I can answer?'},
    {off:7,msg:'{greeting} {name}, checking in again on the quotation — happy to adjust it if anything changed.'},
    {off:14,msg:'{greeting} {name}, final note from my side on the quotation. It stays open whenever you need it.'}
  ]
};
export function seqPlan(kind,step,today){
  const seq=kind==='quote'?SEQ_QUOTE:null;
  const st=seq&&seq.steps[step-1];
  if(!st)return null;
  const d=new Date(today+'T12:00:00');
  d.setDate(d.getDate()+st.off);
  const due=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  return {due,off:st.off,msg:st.msg,total:seq.steps.length};
}
export const SEQ_LBL={quote:SEQ_QUOTE.label};

/* O1/O5: how many consecutive 'noreply' outcomes end the log (older events
   ignored). Drives the "Don't contact again" suggestion. Pure. */
export function lastOutcomeStreak(log){
  let n=0;
  for(let i=(log||[]).length-1;i>=0;i--){
    const e=log[i];
    if(e.e!=='outcome')continue;
    if(e.v==='noreply'){n++;continue}
    break;
  }
  return n;
}
/* O6: daily opened-chat counter key helpers. day = YYYY-MM-DD. */
export function bumpDayCounter(cur,today){
  const n=cur&&cur.day===today?cur.n+1:1;
  return {day:today,n};
}
export const DAY_WARN_AT=25;
