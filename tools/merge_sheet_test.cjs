/* merge_sheet_test.cjs — regression test for the full-screen merge sheet bug.
   Seeds 30 follow-ups, opens a contact card, taps Merge, then verifies:
   M1 sheet fits inside the viewport (header + close button reachable)
   M2 candidate list is scrollable (qc-ct-list caps height)
   M3 backdrop tap closes the sheet
   M4 picking a candidate merges (29 records left, tombstone written)
   Requires the app running on emulator-5554 with CDP forwarded to 9223. */
const CDP='http://localhost:9223';
let id=0,pending=new Map(),ws;
function send(method,params,timeout){
  return new Promise((res,rej)=>{
    const mid=++id;pending.set(mid,{res,rej});
    ws.send(JSON.stringify({id:mid,method,params:params||{}}));
    setTimeout(()=>{if(pending.has(mid)){pending.delete(mid);rej(new Error('CDP timeout '+method))}},timeout||20000);
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
async function waitBoot(){
  for(let i=0;i<40;i++){try{if(await evalJs(`!!document.getElementById('ver')&&document.getElementById('ver').textContent.includes('version')`))return}catch(e){}await sleep(500)}
  throw new Error('boot never completed');
}

(async()=>{
  const targets=await(await fetch(CDP+'/json')).json();
  const page=targets.find(t=>t.type==='page');
  if(!page)throw new Error('no page target');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result)}};
  await send('Runtime.enable');
  await waitBoot();

  /* Seed 30 follow-ups due today (UTC-safe: yesterday too, so they are <= today everywhere). */
  await evalJs(`new Promise(res=>{
    const t=new Date();t.setDate(t.getDate()-1);
    const d=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    const now=Date.now();
    const recs=Array.from({length:30},(_,i)=>({full:'96650'+String(100000+i),code:'966',local:'50'+String(100000+i),country:'sa',at:now-i*60000,label:'Person '+(i+1),due:d,log:[{t:now,e:'msg'}]}));
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const tx=rq.result.transaction('kv','readwrite');tx.objectStore('kv').put(recs,'qc_recents');tx.oncomplete=()=>res('seeded')};
    rq.onerror=()=>res('seed failed');
  })`,15000).then(v=>{if(v!=='seeded')throw new Error('seed failed')});
  await evalJs('location.reload();"reloading"');
  await sleep(2500);
  await waitBoot();
  const before=await evalJs(`new Promise(res=>{
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const g=rq.result.transaction('kv').objectStore('kv').get('qc_recents');g.onsuccess=()=>res((g.result||[]).length)};
  })`);

  await evalJs(`document.getElementById('tb-fu').click();'ok'`);
  await sleep(400);
  await evalJs(`document.querySelector('#fuList [data-act="open"]').click();'ok'`);
  await sleep(400);
  await evalJs(`document.querySelector('#fuPrompt [data-x="merge"]').click();'ok'`);
  await sleep(400);

  /* M1+M2: geometry of sheet, header, close button, list scrollability. */
  const g=await evalJs(`(()=>{
    const sheet=document.querySelector('.qc-sheet');if(!sheet)return null;
    const head=sheet.querySelector('.qc-ct-head');
    const closeBtn=head&&head.querySelector('[data-x]');
    const list=sheet.querySelector('.qc-ct-list');
    const sr=sheet.getBoundingClientRect(),cr=closeBtn&&closeBtn.getBoundingClientRect();
    return {vh:innerHeight,sheetTop:sr.top,sheetH:sr.height,
      closeTop:cr?cr.top:null,closeVisible:cr?cr.bottom<=innerHeight&&cr.top>=0:null,
      items:list?list.querySelectorAll('[data-mf]').length:0,
      scrollable:list?list.scrollHeight>list.clientHeight+1:false,
      listH:list?list.getBoundingClientRect().height:null};
  })()`);
  check('M1 sheet within viewport',g&&g.sheetTop>=-1&&g.sheetTop+g.sheetH<=g.vh+1&&g.closeVisible===true,g);
  check('M2 list capped + scrollable',g&&g.items===before-1&&g.scrollable===true,{items:g&&g.items,expected:before-1,scrollable:g&&g.scrollable});
  console.log('  geometry: '+JSON.stringify(g));

  /* Screenshot for visual proof. */
  const shot=await send('Page.captureScreenshot',{format:'png'});
  require('fs').writeFileSync('.tmp-merge-sheet.png',Buffer.from(shot.data,'base64'));
  console.log('  screenshot: .tmp-merge-sheet.png');

  /* M3: backdrop tap closes. */
  await evalJs(`document.querySelector('.qc-sheet-back').click();'ok'`);
  await sleep(300);
  check('M3 backdrop tap closes',await evalJs(`!document.querySelector('.qc-sheet-back')`));

  /* M4: reopen and merge the first candidate. */
  await evalJs(`document.querySelector('#fuPrompt [data-x="merge"]').click();'ok'`);
  await sleep(300);
  await evalJs(`document.querySelector('.qc-sheet [data-mf]').click();'ok'`);
  await sleep(500);
  const after=await evalJs(`new Promise(res=>{
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const g=rq.result.transaction('kv').objectStore('kv').get('qc_recents');g.onsuccess=()=>res({recents:(g.result||[]).length,sheetGone:!document.querySelector('.qc-sheet-back')})};
  })`);
  check('M4 merge executed',after.recents===before-1&&after.sheetGone,{after,expected:before-1});
  const tombs=await evalJs(`new Promise(res=>{
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const g=rq.result.transaction('kv').objectStore('kv').get('qc_deleted');g.onsuccess=()=>res((g.result||[]).length)};
  })`);
  check('M4 tombstone written for loser',tombs>=1,tombs);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('TEST ERROR: '+e.message);process.exit(2)});
