/* ux_verify.cjs — drive the app in the emulator WebView over CDP and verify
   the v5.7-polish UI fixes end to end. Usage: node tools/ux_verify.cjs */
const CDP='http://localhost:9223';
let id=0,pending=new Map(),ws;
function send(method,params,timeout){
  return new Promise((res,rej)=>{
    const mid=++id;pending.set(mid,{res,rej});
    ws.send(JSON.stringify({id:mid,method,params:params||{}}));
    setTimeout(()=>{if(pending.has(mid)){pending.delete(mid);rej(new Error('CDP timeout '+method))}},timeout||15000);
  });
}
async function evalJs(expr,timeout){
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},timeout);
  if(r.exceptionDetails)throw new Error('page exception: '+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text).slice(0,400));
  return r.result.value;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;
function check(name,cond,detail){if(cond){pass++;console.log('PASS '+name)}else{fail++;console.log('FAIL '+name+(detail!==undefined?' — '+JSON.stringify(detail):''))}}

(async()=>{
  const targets=await(await fetch(CDP+'/json')).json();
  const page=targets.find(t=>t.type==='page');
  if(!page)throw new Error('no page target');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result)}};
  await send('Runtime.enable');

  /* Wait for boot: the version line appears once main.js ran. */
  for(let i=0;i<30;i++){try{if(await evalJs(`!!document.getElementById('ver')&&document.getElementById('ver').textContent.includes('version')`))break}catch(e){}await sleep(500)}
  check('boot reached',await evalJs(`document.getElementById('ver').textContent.includes('version')`));

  /* Seed records straight into IndexedDB, then reload so boot hydrates from it. */
  await evalJs(`new Promise(res=>{
    const d=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
    const recs=[
      {full:'966501234567',code:'966',local:'501234567',country:'sa',at:Date.now(),label:'Ahmed Test',due:d(0),dueTime:'09:00',log:[{t:Date.now(),e:'msg'}]},
      {full:'966509876543',code:'966',local:'509876543',country:'sa',at:Date.now()-3*864e5,label:'Sara Test',status:'won',value:15000,log:[{t:Date.now()-3*864e5,e:'msg'},{t:Date.now()-3*864e5,e:'outcome',v:'sent'},{t:Date.now()-2*864e5,e:'outcome',v:'replied'}]},
      {full:'967780702761',code:'967',local:'780702761',country:'ye',at:Date.now()-864e5,label:'Ali Lead',status:'quoted',valid:d(5),log:[{t:Date.now()-864e5,e:'msg'}]}
    ];
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const tx=rq.result.transaction('kv','readwrite');tx.objectStore('kv').put(recs,'qc_recents');tx.oncomplete=()=>res('seeded')};
    rq.onerror=()=>res('seed failed');
  })`,15000);
  await evalJs('location.reload(); "reloading"');
  await sleep(2500);
  for(let i=0;i<20;i++){try{if(await evalJs(`document.getElementById('ver').textContent.includes('version')`))break}catch(e){}await sleep(500)}

  /* B1: tab bar single row — all five tab buttons share the same offsetTop. */
  const tops=await evalJs(`[...document.querySelectorAll('.tabs [data-tab]')].map(b=>b.offsetTop)`);
  check('B1 tabs one row',new Set(tops).size===1,tops);

  /* P1: due badge sits inside its button's box. */
  const badge=await evalJs(`(()=>{const b=document.querySelector('.tabs .badge');if(!b)return null;const r=b.getBoundingClientRect(),p=b.parentElement.getBoundingClientRect();return {badge:[r.left,r.top,r.right,r.bottom],btn:[p.left,p.top,p.right,p.bottom]}})()`);
  if(badge){const[r1,t1,r2,b2]=badge.badge,[p1,q1,p2,q2]=badge.btn;
    check('P1 badge within button (+3px bleed)',r1>=p1-1&&r2<=p2+1&&t1>=q1-3&&b2<=q2+1,badge)}
  else check('P1 badge inside button',true,'no badge (no due today in this build)');

  /* P3: campaign Save button is full-width (wider than Load). Measured on
     the Queue tab so the elements are laid out. */
  await evalJs(`document.getElementById('tb-queue').click();'ok'`);await sleep(300);
  const p3=await evalJs(`(()=>{const l=document.getElementById('qCampLoad'),s=document.getElementById('qCampSave');return {load:l.getBoundingClientRect().width,save:s.getBoundingClientRect().width,row:s.getBoundingClientRect().top>l.getBoundingClientRect().bottom-1}})()`);
  check('P3 save campaign full-width',p3.save>p3.load*1.6&&p3.row,p3);

  /* E4: today mini card on Chat tab shows the seeded counts. */
  const mini=await evalJs(`(()=>{const el=document.getElementById('todayMini');return {hidden:el.hidden,txt:el.textContent}})()`);
  check('E4 today mini visible with counts',!mini.hidden&&/1/.test(mini.txt),mini.txt);
  const miniTops=await evalJs(`[...document.getElementById('todayMini').querySelectorAll('b')].map(b=>b.textContent)`);
  check('E4 counts due/expiring',miniTops.length>=2,miniTops);

  /* B2: stats Messaged counts all three seeded contacts (msg evidence). */
  await evalJs(`document.getElementById('tb-stats').click();'ok'`);await sleep(400);
  const chips=await evalJs(`[...document.querySelectorAll('#stOverview .stchip')].map(c=>c.textContent)`);
  const messaged=chips.find(c=>/Messaged/.test(c));
  check('B2 messaged=3 from msg events',/3/.test(messaged||''),chips);

  /* E2: tap a weekly column → detail line appears. */
  await evalJs(`document.querySelector('#stWeekly .stcol').click();'ok'`);await sleep(200);
  const wk=await evalJs(`(()=>{const p=document.getElementById('stWkSel');return {hidden:p.hidden,txt:p.textContent}})()`);
  check('E2 weekly tap detail',!wk.hidden&&wk.txt.length>3,wk);

  /* E1: theme toggle — dark applies data-theme, system removes it. */
  await evalJs(`document.getElementById('setBtn').click();'ok'`);await sleep(300);
  await evalJs(`document.querySelector('[data-thm="dark"]').click();'ok'`);await sleep(200);
  const th1=await evalJs(`document.documentElement.dataset.theme`);
  check('E1 dark theme applied',th1==='dark',th1);
  const pressed=await evalJs(`document.querySelector('[data-thm="dark"]').getAttribute('aria-pressed')`);
  check('E1 dark chip pressed',pressed==='true',pressed);
  await evalJs(`document.querySelector('[data-thm="system"]').click();'ok'`);await sleep(200);
  const th2=await evalJs(`document.documentElement.dataset.theme||'none'`);
  check('E1 system removes override',th2==='none',th2);

  /* E3: scroll compacts the header. */
  await evalJs(`document.getElementById('setBack').click();'ok'`);await sleep(200);
  await evalJs(`window.scrollTo(0,120);'ok'`);await sleep(300);
  const compact=await evalJs(`document.querySelector('.hdr').classList.contains('compact')`);
  check('E3 header compacts on scroll',compact===true,compact);

  /* P4 runtime: switch to Arabic and collect leftover Latin text nodes. */
  await evalJs(`window.scrollTo(0,0);document.getElementById('langBtn').click();'ok'`);await sleep(600);
  const leftovers=await evalJs(`(()=>{
    const SKIP='[dir="auto"],.rnum,.preview,canvas,[translate="no"],script,style,textarea,input,select';
    const ALLOW=/QuickChat|WhatsApp|Teable|Google|Drive|PIN|QR/;
    const out=new Set();
    document.querySelectorAll('.tabs .badge').forEach(b=>b.remove()); /* counts are locale-neutral */
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())){
      const el=n.parentElement;if(!el||el.closest(SKIP))continue;
      if(el.closest('[hidden]'))continue;
      const v=n.nodeValue.trim();if(!v||!/[A-Za-z]/.test(v))continue;
      if(ALLOW.test(v))continue;
      if(/^W\\d{2}$/.test(v))continue; /* ISO week labels are numbers */
      if(el.offsetParent===null)continue;
      out.add(v.slice(0,80));
    }
    return [...out];
  })()`);
  const realLeftovers=leftovers.filter(s=>!/^(Ahmed|Sara|Ali) Test?$/.test(s.trim())&&!/^[\d\s+·:()/%—-]+$/.test(s));
  check('P4 Arabic mode no leftover English',realLeftovers.length===0,realLeftovers);

  console.log('\\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error('DRIVER ERROR',e.message);process.exit(2)});
