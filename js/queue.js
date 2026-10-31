/* queue.js — batch follow-up queue: paste a list, message one by one. */
import {$, store, state, COUNTRIES, esc, toast, normalize,
  VAR_RE, autoVars, fillTpl, customKeys, todayStr, dueLow} from './core.js';
import {buildLink} from './dialer.js';
import {pushRecent, saveRecents} from './recents.js';
import {setDueVal, setStatus, isOpen} from './followups.js';

let q=null;
const qText=$('qText');
let qFoundList=[],qExtra={};
export function queueState(){return q}
/* Called once store.ready resolves: restores an in-progress batch queue. */
export function initQueue(){q=store.get('qc_queue',null)}
const NOISE=/\b(mob(ile)?|tel|phone|whats ?app|wa|cell|no|number|contact)\b\.?|جوال|واتساب|هاتف|رقم/gi;
function extractWithNames(text){
  const out=[],seen=new Set();
  String(text).split(/\r?\n/).forEach(line=>{
    const ln=line.replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x0660)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x06f0));
    const re=/(?:\+|00)?\d[\d\s\-(). ]{6,20}\d/g;let m,nums=[],rest=ln;
    while((m=re.exec(ln))){const n=normalize(m[0]);if(n){nums.push(n);rest=rest.replace(m[0],' ')}}
    const name=rest.replace(NOISE,' ').replace(/[:|,;*•\-–—()\[\]#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
    nums.forEach(n=>{if(!seen.has(n.full)){seen.add(n.full);out.push(Object.assign({},n,{name}))}});
  });
  return out;
}
export function fillTplSelect(){
  const sel=$('qTpl'),cur=sel.value||store.get('qc_qtpl','');
  sel.innerHTML='<option value="">No message (just open the chat)</option>'+state.tpls.map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('');
  sel.value=state.tpls.some(t=>t.id===cur)?cur:'';
  renderQVars();
}
function qTplRaw(){const t=state.tpls.find(x=>x.id===$('qTpl').value);return t?t.body:''}
function renderQVars(){
  const v=$('qVars'),keys=customKeys(qTplRaw());
  if(!keys.length){v.hidden=true;v.innerHTML='';return}
  v.innerHTML='<p>Same value for everyone in this queue:</p>'+keys.map(k=>`<label class="var"><span>{${esc(k)}}</span><input class="txt" dir="auto" data-k="${esc(k)}" value="${esc(qExtra[k]||'')}"></label>`).join('');
  v.hidden=false;
}
$('qVars').addEventListener('input',e=>{const k=e.target.dataset.k;if(k)qExtra[k]=e.target.value.trim()});
$('qTpl').addEventListener('change',()=>{store.set('qc_qtpl',$('qTpl').value);renderQVars();qParse()});

export function qParse(){
  store.set('qc_qdraft',qText.value);
  qFoundList=extractWithNames(qText.value);
  const named=qFoundList.filter(x=>x.name).length,el=$('qFound');
  el.className='hint'+(qFoundList.length?' ok':'');
  el.textContent=qFoundList.length?`${qFoundList.length} number${qFoundList.length>1?'s':''} found, ${named} with a name.`:'Paste numbers from a sheet, a message or an email.';
  $('qStart').setAttribute('aria-disabled',!qFoundList.length);
  $('qStart').textContent=qFoundList.length?`Start queue (${qFoundList.length})`:'Start queue';
}
qText.addEventListener('input',qParse);
function saveQ(){store.set('qc_queue',q)}
function nextPending(from){
  const i=q.items.findIndex((x,k)=>k>from&&x.status==='pending');
  if(i>=0)return i;const j=q.items.findIndex(x=>x.status==='pending');return j>=0?j:null;
}
$('qStart').onclick=()=>{
  if(!qFoundList.length)return;
  const raw=qTplRaw(),missing=customKeys(raw).filter(k=>!qExtra[k]);
  if(missing.length){toast('Fill {'+missing.join('}, {')+'} first');return}
  q={items:qFoundList.map(n=>({full:n.full,code:n.code,local:n.local,country:n.country,name:n.name,status:'pending'})),raw,extra:Object.assign({},qExtra),idx:0,arm:false};
  saveQ();renderQueue();
};
function qMessage(it){return q.raw?fillTpl(q.raw,Object.assign(autoVars(q.raw),q.extra,{name:it.name||''})):''}
export function renderQueue(){
  const setup=$('qSetup'),run=$('qRun'),list=$('qList');
  if(!q){setup.hidden=false;run.hidden=true;list.hidden=true;qText.value=qText.value||store.get('qc_qdraft','');qParse();return}
  setup.hidden=true;run.hidden=false;list.hidden=false;
  const sent=q.items.filter(x=>x.status==='sent').length,sk=q.items.filter(x=>x.status==='skipped').length,tot=q.items.length;
  $('qBar').style.width=Math.round((sent+sk)/tot*100)+'%';
  const via=state.app==='wb'?' · WhatsApp Business':'';
  $('qEnd').textContent=q.idx===null?'New queue':'End queue';
  if(q.idx===null){
    $('qProg').textContent=`Finished${via}`;
    $('qCur').innerHTML=`<p style="margin:0">${sent} sent, ${sk} skipped. Tap a contact below to open it again.</p>`+(sent?`<div class="wrapr"><span class="bk">Follow up with the ${sent} sent:</span><button type="button" class="btn small" data-qfu="3">in 3 days</button><button type="button" class="btn small" data-qfu="7">in 1 week</button></div>`:'');
    $('qActs').hidden=true;
  }else{
    const it=q.items[q.idx],c=COUNTRIES.find(x=>x.id===it.country);
    $('qProg').textContent=`${q.idx+1} of ${tot} · ${sent} sent${via}`;
    $('qCur').innerHTML=`<div class="field"><label class="lbl" for="qName">Name</label><input id="qName" class="txt" dir="auto" autocomplete="off" value="${esc(it.name||'')}" placeholder="Client name"></div>
      <div class="rnum">+${it.code?it.code+' '+it.local:it.full} <span class="meta">${c&&c.id!=='ot'?c.name:''}</span></div>
      ${q.raw?`<div class="qmsg" id="qMsg" dir="auto">${esc(qMessage(it))}</div>`:''}`;
    $('qActs').hidden=false;
    $('qName').addEventListener('input',e=>{it.name=e.target.value.trim();saveQ();const m=$('qMsg');if(m)m.textContent=qMessage(it)});
  }
  list.innerHTML=q.items.map((x,i)=>`<div class="item${i===q.idx?' cur':''}"><span class="st ${x.status}">${x.status==='sent'?'✓':x.status==='skipped'?'–':i+1}</span><button class="main" data-qi="${i}">${x.name?`<div class="lab" dir="auto">${esc(x.name)}</div>`:''}<div class="rnum">+${x.code?x.code+' '+x.local:x.full}</div></button></div>`).join('');
}
$('qList').addEventListener('click',e=>{const b=e.target.closest('[data-qi]');if(!b||!q)return;q.idx=+b.dataset.qi;saveQ();renderQueue();window.scrollTo({top:0,behavior:'smooth'})});
$('qOpen').onclick=()=>{
  if(!q||q.idx===null)return;
  const it=q.items[q.idx],msg=qMessage(it),left=msg.match(VAR_RE);
  if(left){toast(left.includes('{name}')?'Enter the name first':'Fill '+[...new Set(left)].join(', ')+' first');const n=$('qName');if(n)n.focus();return}
  it.status='sent';it.at=Date.now();
  pushRecent({full:it.full,code:it.code,local:it.local,country:it.country,label:it.name});
  const link=buildLink(it.full,msg);
  q.idx=nextPending(q.idx);saveQ();renderQueue();
  location.href=link;
};
$('qSkip').onclick=()=>{if(!q||q.idx===null)return;const it=q.items[q.idx];if(it.status==='pending')it.status='skipped';q.idx=nextPending(q.idx);saveQ();renderQueue()};
$('qPrev').onclick=()=>{if(!q)return;q.idx=Math.max(0,(q.idx===null?q.items.length:q.idx)-1);saveQ();renderQueue()};
let endTimer;
$('qEnd').onclick=()=>{
  if(!q)return;
  if(q.idx!==null&&!q.arm){q.arm=true;$('qEnd').textContent='Tap again to end';$('qEnd').classList.add('danger');clearTimeout(endTimer);endTimer=setTimeout(()=>{if(q){q.arm=false;$('qEnd').classList.remove('danger');renderQueue()}},3000);return}
  clearTimeout(endTimer);$('qEnd').classList.remove('danger');
  q=null;saveQ();qText.value='';qParse();renderQueue();
};
/* Set a follow-up date for everyone already messaged in this queue */
$('qCur').addEventListener('click',e=>{
  const b=e.target.closest('[data-qfu]');if(!b||!q)return;const ds=todayStr(+b.dataset.qfu);let n=0;
  q.items.filter(i=>i.status==='sent').forEach(i=>{const r=state.recents.find(x=>x.full===i.full);if(r){setDueVal(r,ds);if(!isOpen(r)||!r.status)setStatus(r,'waiting');n++}});
  saveRecents();toast('Follow-up set for '+n+' contact'+(n===1?'':'s')+': '+dueLow(ds));
});
