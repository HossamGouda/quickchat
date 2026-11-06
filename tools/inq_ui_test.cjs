/* inq_ui_test.cjs — emulator CDP test for the v6 inquiry chip row (P3).
   Seeds one record with two inquiries, opens the contact card, verifies:
   Q1 chip row renders (2 chips + ＋), active chip aria-pressed=q1
   Q2 clicking a chip switches the mirror (status/value/seq fields)
   Q3 ＋ appends a third inquiry and activates it
   Q4 history filters to the active inquiry; "Show all" restores full log
   Q5 switch persists to IDB (per-inquiry values isolated)
   Requires the app on emulator-5554 with CDP forwarded to 9223. */
const CDP='http://localhost:9223';
let id=0,pending=new Map(),ws,pass=0,fail=0;
function send(method,params,timeout){return new Promise((res,rej)=>{const mid=++id;pending.set(mid,{res,rej});ws.send(JSON.stringify({id:mid,method,params:params||{}}));setTimeout(()=>{if(pending.has(mid)){pending.delete(mid);rej(new Error('CDP timeout '+method))}},timeout||20000)})}
async function evalJs(expr,timeout){const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw new Error('page exception: '+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text).slice(0,400));return r.result.value}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitBoot(){for(let i=0;i<40;i++){try{const ok=await evalJs(`!!(document.getElementById('fuList'))`);if(ok)return}catch(e){}await sleep(500)}throw new Error('boot timeout')}
function check(name,cond,extra){if(cond){pass++;console.log('  PASS '+name)}else{fail++;console.log('  FAIL '+name+(extra!==undefined?' '+JSON.stringify(extra):''))}}

(async()=>{
  const targets=await(await fetch(CDP+'/json')).json();
  const page=targets.find(t=>t.type==='page');
  if(!page)throw new Error('no page target');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result)}};
  await send('Runtime.enable');
  await send('Page.enable');
  await waitBoot();

  /* Seed one record with two inquiries + a mixed-tag log. */
  await evalJs(`new Promise(res=>{
    const t=new Date();t.setDate(t.getDate()-1);
    const d=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
    const now=Date.now();
    const rec=[{full:'966501000001',code:'966',local:'501000001',country:'sa',at:now,label:'Test Inquiries',
      status:'quoted',value:2500,valid:'2026-12-01',lostWhy:'',outcome:'',seq:null,vars:{},
      due:d,dueTime:'09:00',_lu:now,act:'q1',
      inq:[
        {id:'q1',label:'Pipes',status:'quoted',value:2500,valid:'2026-12-01',lostWhy:'',outcome:'',seq:null,vars:{}},
        {id:'q2',label:'Fittings',status:'lead',value:0,valid:'',lostWhy:'',outcome:'',seq:null,vars:{}}],
      log:[
        {t:now-4000,e:'msg'},
        {t:now-3000,e:'status',v:'lead',q:'q2'},
        {t:now-2000,e:'status',v:'quoted',q:'q1'},
        {t:now-1000,e:'value',v:2500,q:'q1'}]}];
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const tx=rq.result.transaction('kv','readwrite');tx.objectStore('kv').put(rec,'qc_recents');tx.oncomplete=()=>res('seeded')};
    rq.onerror=()=>res('seed failed');
  })`,15000).then(v=>{if(v!=='seeded')throw new Error('seed failed')});
  await evalJs('location.reload();"reloading"');
  await sleep(2500);
  await waitBoot();

  /* Open the follow-up card for the seeded record. */
  await evalJs(`document.getElementById('tb-fu').click();'ok'`);
  await sleep(400);
  await evalJs(`document.querySelector('#fuList [data-act="open"]').click();'ok'`);
  await sleep(400);

  /* Q1: chip row. */
  const chips=await evalJs(`(()=>{
    const c=[...document.querySelectorAll('#fuPrompt [data-iq]')];
    return {n:c.length,ids:c.map(x=>x.dataset.iq),
      pressed:c.filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.iq),
      labels:c.map(x=>x.textContent.trim())};
  })()`);
  check('Q1 chip row = 2 inquiries + ＋',chips.n===3&&chips.ids[2]==='__new',chips);
  check('Q1 active chip is q1',chips.pressed.length===1&&chips.pressed[0]==='q1',chips);
  check('Q1 labels carry names',chips.labels[0]==='Pipes'&&chips.labels[1]==='Fittings',chips);

  /* Q2: mirror reflects active inquiry. */
  const m1=await evalJs(`(()=>({val:document.getElementById('fpVal').value,
    pressed:[...document.querySelectorAll('#fuPrompt [data-s]')].filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.s)}))()`);
  check('Q2 mirror shows q1 (quoted/2500)',m1.val==='2500'&&m1.pressed.join()==='quoted',m1);

  /* Switch to q2. */
  await evalJs(`document.querySelector('#fuPrompt [data-iq="q2"]').click();'ok'`);
  await sleep(300);
  const m2=await evalJs(`(()=>({val:document.getElementById('fpVal').value,
    pressed:[...document.querySelectorAll('#fuPrompt [data-s]')].filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.s),
    active:[...document.querySelectorAll('#fuPrompt [data-iq]')].filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.iq)}))()`);
  check('Q2 switch updates mirror (lead/empty)',m2.val===''&&m2.pressed.join()==='lead',m2);
  check('Q2 switch moves aria-pressed',m2.active.join()==='q2',m2);

  /* Q3: ＋ adds a third inquiry. */
  await evalJs(`document.querySelector('#fuPrompt [data-iq="__new"]').click();'ok'`);
  await sleep(300);
  const m3=await evalJs(`(()=>({n:document.querySelectorAll('#fuPrompt [data-iq]').length,
    active:[...document.querySelectorAll('#fuPrompt [data-iq]')].filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.iq),
    val:document.getElementById('fpVal').value}))()`);
  check('Q3 ＋ appends inquiry (3+＋)',m3.n===4,m3);
  check('Q3 new inquiry active + blank value',m3.active.length===1&&m3.active[0]!=='q1'&&m3.active[0]!=='q2'&&m3.active[0]!=='__new'&&m3.val==='',m3);

  /* Q4: history filtering. */
  const h1=await evalJs(`(()=>{const d=document.querySelector('#fuPrompt details.tl');return d?{open:d.open,items:d.querySelectorAll('li').length,btn:!!d.querySelector('[data-x="histall"]')}:null})()`);
  check('Q4 history filtered to active (q3=untagged only)',h1&&h1.items===1&&h1.btn===true,h1);
  await evalJs(`document.querySelector('#fuPrompt details.tl [data-x="histall"]').click();'ok'`);
  await sleep(300);
  const h2=await evalJs(`(()=>{const d=document.querySelector('#fuPrompt details.tl');return d?{items:d.querySelectorAll('li').length}:null})()`);
  check('Q4 "Show all" restores full log (4)',h2&&h2.items===4,h2);

  /* Back to filtered mode, then switch to q1 — filter must follow. */
  await evalJs(`document.querySelector('#fuPrompt details.tl [data-x="histall"]').click();'ok'`);
  await sleep(200);
  await evalJs(`document.querySelector('#fuPrompt [data-iq="q1"]').click();'ok'`);
  await sleep(300);
  const h3=await evalJs(`(()=>{const d=document.querySelector('#fuPrompt details.tl');return d?{items:d.querySelectorAll('li').length}:null})()`);
  check('Q4 filter follows switch (q1 = 3 entries)',h3&&h3.items===3,h3);

  /* Q5: persistence + isolation. */
  const stored=await evalJs(`new Promise(res=>{
    const rq=indexedDB.open('quickchat',1);
    rq.onsuccess=()=>{const g=rq.result.transaction('kv').objectStore('kv').get('qc_recents');g.onsuccess=()=>{
      const r=(g.result||[])[0]||{};
      res({act:r.act,status:r.status,value:r.value,
        inq:(r.inq||[]).map(q=>({id:q.id,status:q.status,value:q.value})),
        mirror:inqProbe=(r.inq||[]).length===3&&r.value===2500&&r.status==='quoted'})}};
  })`);
  check('Q5 persisted: act=q1, q1 value intact',stored.act==='q1'&&stored.value===2500&&stored.status==='quoted',stored);
  check('Q5 three inquiries persisted with own values',stored.inq.length===3&&stored.inq[0].value===2500&&stored.inq[1].status==='lead',stored.inq);

  /* Screenshot for visual proof. */
  const shot=await send('Page.captureScreenshot',{format:'png'});
  require('fs').writeFileSync('.tmp-inq-ui.png',Buffer.from(shot.data,'base64'));
  console.log('  screenshot: .tmp-inq-ui.png');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error('TEST ERROR: '+e.message);process.exit(1)});
