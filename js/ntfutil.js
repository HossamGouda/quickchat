/* ntfutil.js — pure reminder-time helpers for the notification engine.
   No DOM, no store: every function takes what it needs and returns plain
   values, so the node harness in tools/ can unit-test them directly.
   Used by notify.js; not imported anywhere else. */

const HM_RE=/^(\d{1,2}):(\d{2})$/;
function hm(v,fb){const m=HM_RE.test(v||'')?v.match(HM_RE):null;return m?{h:+m[1],m:+m[2]}:fb}

/* Quiet hours window [w0,w1) around ts. Overnight windows (from>to) also
   claim the early-morning hours via the window that began the previous
   evening: an alert at 07:59 with 22:00-08:00 quiet hours shifts to 08:00
   today, not "before the window starts". Returns null when ts is outside. */
export function quietHit(ts,from,to){
  const f=hm(from,{h:22,m:0}),t=hm(to,{h:8,m:0});
  const d=new Date(ts);
  const w0=new Date(d.getFullYear(),d.getMonth(),d.getDate(),f.h,f.m,0,0);
  const w1=new Date(d.getFullYear(),d.getMonth(),d.getDate(),t.h,t.m,0,0);
  const overnight=w1.getTime()<=w0.getTime();
  if(overnight)w1.setDate(w1.getDate()+1);
  if(ts>=w0.getTime()&&ts<w1.getTime())return{w0:w0.getTime(),w1:w1.getTime()};
  if(overnight){
    /* The window that started yesterday evening and ends today at `to`. */
    const pw0=new Date(w0);pw0.setDate(pw0.getDate()-1);
    const pw1=new Date(w1);pw1.setDate(pw1.getDate()-1);
    if(ts>=pw0.getTime()&&ts<pw1.getTime())return{w0:pw0.getTime(),w1:pw1.getTime()};
  }
  return null;
}
/* Shift an alert that falls inside quiet hours to the window's end. */
export function applyQuiet(ts,from,to){
  const hit=quietHit(ts,from,to);
  return hit?hit.w1:ts;
}

/* Snooze targets: 1 hour / 3 hours from now, or the next 9:00 ("morning").
   "now" is injectable for tests. */
export function snoozeUntilMs(kind,now){
  const t=now!==undefined?now:Date.now();
  if(kind==='h3')return t+3*36e5;
  if(kind==='morning'){
    const d=new Date(t);d.setHours(9,0,0,0);
    if(d.getTime()<=t)d.setDate(d.getDate()+1);
    return d.getTime();
  }
  return t+36e5; /* h1 default */
}

/* When a still-overdue follow-up should re-nag: the next 9:00 local time. */
export function nextNagMs(now){
  const t=now!==undefined?now:Date.now();
  const d=new Date(t);d.setHours(9,0,0,0);
  if(d.getTime()<=t)d.setDate(d.getDate()+1);
  return d.getTime();
}

/* Group simultaneous alerts: more than `limit` items collapsing into one
   summary fire at the earliest of their times. Pure decision — the caller
   renders whatever shape comes back.
   items: [{full,at}] -> {summary:boolean, at, items} */
export function groupAlerts(items,limit){
  const l=limit||3;
  if(items.length<=l)return{summary:false,at:items.length?Math.min.apply(null,items.map(i=>i.at)):0,items:items.slice()};
  return{summary:true,at:Math.min.apply(null,items.map(i=>i.at)),items:items.slice()};
}

/* YYYY-MM-DD in local time — the due-date comparison granularity. */
export function dayStr(ts){
  const d=new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
