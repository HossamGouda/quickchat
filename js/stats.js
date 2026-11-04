/* stats.js — statistics dashboard tab renderer.
   Pure compute helpers live in statsutil.js (unit-tested in tools/stats_test.cjs). */
import {$, state, esc, ST_LABEL, OUTCOMES, OUT_LBL, LOST_LBL, todayStr} from './core.js';
import {tr} from './i18n.js';
import {outcomeCounts, responseRate, weeklyCounts, statusCounts,
  lostReasonCounts, srcCounts, messagedCount,
  dueOn, expiringQuotes, newLeads, weekSummary} from './statsutil.js';

/* ---------- renderer ---------- */
const TOP_N=5;

/* E2: last-rendered weekly rows + series so a tap can show the week's numbers. */
let wkRows=[],wkSeries=[];

function barRow(label,n,max,color){
  const w=max?Math.max(2,Math.round(n/max*100)):0;
  return `<div class="strow"><span class="stlbl">${esc(label)}</span><span class="stbar"><span style="width:${w}%;background:${color}"></span></span><b>${n}</b></div>`;
}

export function renderStats(){
  const recs=state.recents,el=$('tab-stats');
  const cards=['stOverview','stWeekly','stPipeline','stLost','stSrc'].map(id=>$(id));
  if(!recs.length){
    cards.forEach(c=>c.hidden=true);
    const em=$('stEmpty');em.hidden=false;em.querySelector('p').textContent=tr('No data yet — outcomes appear as you message people');
    return;
  }
  $('stEmpty').hidden=true;
  cards.forEach(c=>c.hidden=false);
  const oc=outcomeCounts(recs),rate=responseRate(oc),sc=statusCounts(recs);
  const lc=lostReasonCounts(recs),srcs=srcCounts(recs);
  const replied=(oc.replied||0)+(oc.interested||0);
  const chip=(lbl,n)=>`<div class="stchip"><b>${n}</b><span>${esc(tr(lbl))}</span></div>`;

  // overview chips
  el.querySelector('#stOverview').innerHTML=`
    <p class="bk">${esc(tr('Overview'))}</p>
    <div class="stgrid">
      ${chip('Contacts',recs.length)}
      ${chip('Messaged',messagedCount(recs))}
      ${chip('Replies',replied)}
      ${chip('Interested',oc.interested||0)}
      ${chip('Won',sc.won||0)}
      ${chip('Lost',sc.lost||0)}
    </div>
    <p class="bk" style="margin-top:8px">${esc(tr('Response rate'))}: <b>${Math.round(rate*100)}%</b></p>`;

  // weekly bars (3 strongest outcome keys)
  const wk=weeklyCounts(recs,8);
  const wMax=Math.max(1,...wk.map(r=>r.n));
  const series=OUTCOMES.filter(o=>(oc[o]||0)>0).slice(0,3);
  wkRows=wk;wkSeries=series;
  const colors={sent:'#8fbf9f',replied:'#5a8fc0',interested:'#3e7d54',noreply:'#c9c9c9'};
  el.querySelector('#stWeekly').innerHTML=`
    <p class="bk">${esc(tr('Weekly activity'))} — ${esc(tr('last 8 weeks'))}</p>
    <div class="stlegend">${series.map(o=>`<span><i style="background:${colors[o]}"></i>${esc(tr(OUT_LBL[o]))}</span>`).join('')}</div>
    <div class="stweeks">${wk.map(r=>{
      const segs=series.map(o=>r.c[o]?`<span style="height:${Math.max(2,Math.round(r.c[o]/wMax*72))}px;background:${colors[o]}"></span>`:'').join('');
      return `<div class="stcol" title="${r.wk}: ${r.n}">${r.n?`<div class="ststack">${segs}</div>`:'<div class="ststack"></div>'}<small>${esc(r.wk.slice(5))}</small></div>`;
    }).join('')}</div>
    <p class="bk" id="stWkSel" hidden></p>`;

  // pipeline
  const order=['lead','contacted','quoted','waiting','negotiating','won','lost'];
  const pMax=Math.max(1,...order.map(s=>sc[s]||0));
  el.querySelector('#stPipeline').innerHTML=`
    <p class="bk">${esc(tr('Pipeline'))}</p>
    ${order.map(s=>barRow(tr(ST_LABEL[s]),sc[s]||0,pMax,s==='won'?'#3e7d54':s==='lost'?'#b0563f':'#5a8fc0')).join('')}`;

  // lost reasons
  const lostEl=el.querySelector('#stLost');
  const lEntries=Object.entries(lc).sort((a,b)=>b[1]-a[1]);
  if(lEntries.length){
    const lMax=Math.max(...lEntries.map(x=>x[1]));
    lostEl.innerHTML=`<p class="bk">${esc(tr('Lost reasons'))}</p>`+
      lEntries.map(([k,n])=>barRow(k?LOST_LBL[k]||k:tr('No reason given'),n,lMax,'#b0563f')).join('');
    lostEl.hidden=false;
  } else lostEl.hidden=true;

  // lead sources
  const srcEl=el.querySelector('#stSrc');
  const sEntries=Object.entries(srcs).sort((a,b)=>b[1]-a[1]).slice(0,TOP_N);
  if(sEntries.length){
    const sMax=Math.max(...sEntries.map(x=>x[1]));
    srcEl.innerHTML=`<p class="bk">${esc(tr('Where leads come from'))}</p>`+
      sEntries.map(([k,n])=>barRow(k,n,sMax,'#8f6fb0')).join('');
    srcEl.hidden=false;
  } else srcEl.hidden=true;
}

/* Today card: sits at the top of the Follow-ups tab — due today, expiring
   quotes, untouched new leads, and a this-week summary. */
export function renderToday(){
  const el=$('todayCard');if(!el)return;
  const recs=state.recents;
  if(!recs.length){el.hidden=true;el.innerHTML='';return}
  const today=todayStr();
  const row=(lbl,n,tab)=>`<button type="button" class="strow todayrow" data-today="${tab}" ${n?'':'disabled'}><span class="stlbl">${esc(tr(lbl))}</span><b>${n}</b></button>`;
  const ws=weekSummary(recs);
  const replies=ws.replied+ws.interested;
  el.innerHTML=`<p class="bk">${esc(tr('Today'))}</p>`+
    row('Follow-ups due today',dueOn(recs,today),'fu')+
    row('Quotes expiring within 7 days',expiringQuotes(recs),'fu')+
    row('New leads not yet messaged',newLeads(recs),'fu')+
    `<p class="bk" style="margin-top:8px">${esc(tr('This week'))}: <b>${ws.sent}</b> ${esc(tr('Sent'))} · <b>${replies}</b> ${esc(tr('Replies'))} · <b>${ws.won}</b> ${esc(tr('Won'))} · <b>${ws.lost}</b> ${esc(tr('Lost'))}${ws.sent?` — ${esc(tr('Response rate'))} <b>${Math.round(replies/ws.sent*100)}%</b>`:''}</p>`;
  el.hidden=false;
}

/* E4: compact today strip on the Chat tab — one glance, tap jumps to
   Follow-ups. Empty (hidden) when there is nothing actionable. */
export function renderTodayMini(){
  const el=document.getElementById('todayMini');if(!el)return;
  const recs=state.recents;
  if(!recs.length){el.hidden=true;el.innerHTML='';return}
  const d=dueOn(recs,todayStr()),x=expiringQuotes(recs),n=newLeads(recs);
  if(!d&&!x&&!n){el.hidden=true;el.innerHTML='';return}
  const seg=(lbl,cnt)=>cnt?`<b>${cnt}</b> ${esc(tr(lbl))}`:'';
  const parts=[seg('Follow-ups due today',d),seg('Quotes expiring within 7 days',x),seg('New leads not yet messaged',n)].filter(Boolean);
  el.innerHTML=`<button type="button" class="todayrow" data-today="fu">${parts.join(' · ')}</button>`;
  el.hidden=false;
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const b=e.target.closest('[data-today]');if(!b)return;
  document.dispatchEvent(new CustomEvent('qc:nav',{detail:b.dataset.today}));
});
/* E2: tap a weekly column to show its numbers under the chart. */
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const col=e.target.closest('#stWeekly .stcol');if(!col||!wkRows.length)return;
  const i=[...col.parentElement.children].indexOf(col),r=wkRows[i];if(!r)return;
  const p=document.getElementById('stWkSel');if(!p)return;
  if(!r.n){p.textContent=tr('No messages that week')}
  else{
    const segs=wkSeries.filter(o=>r.c[o]).map(o=>`${r.c[o]} ${tr(OUT_LBL[o])}`);
    p.textContent=r.wk+': '+segs.join(' · ');
  }
  p.hidden=false;
});
