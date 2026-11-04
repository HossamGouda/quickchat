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
