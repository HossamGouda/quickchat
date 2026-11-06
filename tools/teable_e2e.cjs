/* teable_e2e.cjs — end-to-end Teable sync test on the emulator over CDP.
   Requires: fixed APK installed, CDP forwarded on localhost:9223, TK env var
   with the Teable PAT.
   Phases: A boot → B token+first sync (creates v3 fields, pulls) → C seeded
   contact with every v3 field + sync (exercises push/upsert) → D tombstone
   sync (deletion propagation) → E disable sync on the device.
   The cloud side is verified separately via curl after this script. */
const CDP='http://localhost:9223';
const TK=process.env.TK;
if(!TK)throw new Error('TK env var missing');
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
async function syncAndWait(tag){
  await evalJs(`document.getElementById('syncNow').click();'clicked'`);
  for(let i=0;i<90;i++){
    await sleep(1000);
    const s=await evalJs(`(()=>{const e=document.getElementById('syncStatus');return {t:e.textContent,c:e.className}})()`);
    if(/Synced with Teable|Sync failed|Not synced yet/.test(s.t)&&!/…|in progress|Syncing/i.test(s.t))return s;
    if(i===89)return s;
  }
}
function seed(recs,tombs){
  const d=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
  const test={full:'966500000001',code:'966',local:'500000001',country:'sa',at:Date.now(),label:'QC Sync Test',
    status:'quoted',valid:d(7),dnc:0,outcome:'sent',lostWhy:'price',seq:{k:'quote',step:2},
    company:'Test Co',src:'qr',vars:{a:1},value:5000,note:'e2e probe',due:d(1),
    log:[{t:Date.now(),e:'msg'}]};
  return evalJs(`new Promise(res=>{
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{
      const tx=rq.result.transaction('kv','readwrite');
      const os=tx.objectStore('kv');
      os.put(${JSON.stringify(recs)},'qc_recents');
      os.put(${JSON.stringify(tombs)},'qc_deleted');
      tx.oncomplete=()=>res('seeded');
    };
    rq.onerror=()=>res('seed failed');
  })`,15000).then(v=>{
    if(v!=='seeded')throw new Error('seed failed');
    return evalJs('location.reload();"reloading"');
  }).then(()=>sleep(2500)).then(()=>waitBoot());
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
  check('A boot reached',true);

  /* B: token + first sync — field creation + full pull. */
  await evalJs(`document.getElementById('syncToken').value=${JSON.stringify(TK)};'set'`);
  await evalJs(`document.getElementById('syncSave').click();'clicked'`);
  let s=null;
  for(let i=0;i<90;i++){await sleep(1000);s=await evalJs(`(()=>{const e=document.getElementById('syncStatus');return {t:e.textContent,c:e.className}})()`);
    if(/Synced with Teable|Sync failed/.test(s.t))break}
  check('B first sync succeeded',/Synced with Teable/.test(s.t),s);
  console.log('  status after first sync: '+JSON.stringify(s));
  const pulled=await evalJs(`(()=>{try{return JSON.parse(localStorage.getItem('qc_recents')||'[]').length}catch(e){return -1}})()`);
  console.log('  local recents count (via ls fallback may be -1): '+pulled);

  /* C: seeded contact exercising every v3 field AND the v4 inquiry list,
     then sync. */
  await seed([{full:'966500000001',code:'966',local:'500000001',country:'sa',at:Date.now(),label:'QC Sync Test',
    status:'quoted',valid:(()=>{const x=new Date();x.setDate(x.getDate()+7);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')})(),
    dnc:0,outcome:'sent',lostWhy:'price',seq:{k:'quote',step:2},company:'Test Co',src:'qr',vars:{a:1},value:5000,note:'e2e probe',
    inq:[{id:'q1',label:'Valves',status:'quoted',value:2500,valid:'2026-12-15',seq:{k:'quote',step:2},vars:{b:2}},
         {id:'q2',status:'won',value:100}],
    act:'q1',
    log:[{t:Date.now(),e:'msg'}]}],[]);
  s=await syncAndWait('C');
  check('C push-sync succeeded',/Synced with Teable/.test(s.t),s);
  console.log('  status after push sync: '+JSON.stringify(s));

  /* D: tombstone for the test contact, empty recents, sync → deletion propagates. */
  await seed([],[{k:'c',full:'966500000001',delAt:Date.now()}]);
  s=await syncAndWait('D');
  check('D delete-sync succeeded',/Synced with Teable/.test(s.t),s);
  console.log('  status after delete sync: '+JSON.stringify(s));

  /* E: disable sync on this device (so it never re-syncs on its own). */
  await evalJs(`document.getElementById('syncOff').click();'off'`);
  const off=await evalJs(`document.getElementById('syncStatus').textContent`);
  check('E sync disabled on emulator',/off/i.test(off),off);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('E2E ERROR: '+e.message);process.exit(2)});
