/* templates.js — message templates, template variables, and shared template packs. */
import {$ ,store, state, esc, VAR_RE, autoVars, fillTpl, b64uEnc, b64uDec, toast} from './core.js';
import {nameFromLabel, msgIn, update} from './dialer.js';
import {renderBk} from './backup.js';

export function useTemplate(t){
  const auto=autoVars(t.body);
  const keys=[...new Set([...t.body.matchAll(VAR_RE)].map(m=>m[1].toLowerCase()))].filter(k=>!(k in auto));
  const vals=Object.assign({},auto);
  if(keys.includes('name'))vals.name=nameFromLabel();
  state.pending={raw:t.body,vals,keys,nameAuto:true};
  renderVars();applyVars();
}
export function applyVars(){msgIn.value=fillTpl(state.pending.raw,state.pending.vals);update()}
export function renderVars(){
  const v=$('vars'),p=state.pending;
  if(!p||!p.keys.length){v.hidden=true;v.innerHTML='';return}
  v.innerHTML='<p>Fill in the template (updates the message as you type):</p>'+p.keys.map(k=>
    `<label class="var"><span>{${esc(k)}}</span><input class="txt" dir="auto" data-k="${esc(k)}" value="${esc(p.vals[k]||'')}" placeholder="${k==='name'?'Client name':''}"></label>`).join('');
  v.hidden=false;
}
$('vars').addEventListener('input',e=>{
  const k=e.target.dataset.k;if(!k||!state.pending)return;
  if(k==='name')state.pending.nameAuto=false;
  state.pending.vals[k]=e.target.value.trim();applyVars();
});
export function leftoverVars(){return (msgIn.value.match(VAR_RE)||[])}

export function renderTpls(){
  const el=$('tpls');
  if(!state.tpls.length&&state.editing!=='new'){el.innerHTML='<div class="empty">No templates yet. Tap “+ New” to add one.</div>';return}
  let html='';
  const editor=(t)=>`<div class="item editing">
      <input class="txt" id="eTitle" dir="auto" placeholder="Title" value="${esc(t.title)}">
      <textarea id="eBody" dir="auto" placeholder="Message text">${esc(t.body)}</textarea>
      <div class="hint">Placeholders: {name}, {greeting} (time-based, Arabic if the message is Arabic), {date}, or any {word} you'll fill in when sending.</div>
      <div class="acts"><button class="btn small" data-act="cancel">Cancel</button><button class="btn small primary" data-act="save" data-id="${t.id}">Save</button></div>
    </div>`;
  if(state.editing==='new') html+=editor({id:'new',title:'',body:''});
  const sorted=state.tpls.filter(t=>t.pinned).concat(state.tpls.filter(t=>!t.pinned));
  sorted.forEach(t=>{
    if(state.editing===t.id){html+=editor(t);return}
    const acts=state.confirmDel===t.id
      ?`<span class="confirm">Delete? <button class="btn small" data-act="nodel">No</button><button class="btn small danger solid" data-act="yesdel" data-id="${t.id}">Yes</button></span>`
      :`<button class="btn small pin" data-act="pin" data-id="${t.id}" aria-pressed="${!!t.pinned}" aria-label="${t.pinned?'Unpin':'Pin to top'}">${t.pinned?'★':'☆'}</button><button class="btn small" data-act="edit" data-id="${t.id}">Edit</button><button class="btn small danger" data-act="del" data-id="${t.id}">Delete</button>`;
    html+=`<div class="item"><button class="main" data-act="use" data-id="${t.id}"><div class="t" dir="auto">${esc(t.title)}</div><div class="b" dir="auto">${esc(t.body)}</div></button><div class="acts">${acts}</div></div>`;
  });
  el.innerHTML=html;
  const f=$('eTitle');if(f&&!f.value)f.focus();
}
$('tpls').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const id=b.dataset.id,act=b.dataset.act;
  if(act==='use'){const t=state.tpls.find(x=>x.id===id);useTemplate(t);toast(state.pending.keys.length?'Fill in the highlighted fields':'Template added to message');$('msg').scrollIntoView({behavior:'smooth',block:'center'});return}
  if(act==='pin'){state.tpls=state.tpls.map(x=>x.id===id?Object.assign({},x,{pinned:!x.pinned,_lu:Date.now()}):x);store.set('qc_tpls',state.tpls)}
  if(act==='edit'){state.editing=id;state.confirmDel=null}
  if(act==='del'){state.confirmDel=id}
  if(act==='nodel'){state.confirmDel=null}
  if(act==='yesdel'){state.tpls=state.tpls.filter(x=>x.id!==id);state.confirmDel=null;store.set('qc_tpls',state.tpls);renderBk();toast('Template deleted')}
  if(act==='cancel'){state.editing=null}
  if(act==='save'){
    const title=$('eTitle').value.trim(),body=$('eBody').value.trim();
    if(!body){toast('Message text is required');return}
    const old=state.tpls.find(x=>x.id===id);
    const t={id:id==='new'?'t'+Date.now():id,title:title||body.slice(0,30),body,pinned:!!(old&&old.pinned),_lu:Date.now()};
    if(id==='new')state.tpls.unshift(t);else state.tpls=state.tpls.map(x=>x.id===id?t:x);
    state.editing=null;store.set('qc_tpls',state.tpls);renderBk();toast('Template saved');
  }
  renderTpls();
});
$('addTpl').onclick=()=>{state.editing='new';state.confirmDel=null;renderTpls()};

/* ---------- Team template packs (shared by link) ---------- */
$('shareTpl').onclick=()=>{
  if(!state.tpls.length){toast('No templates to share');return}
  const url=location.origin+location.pathname+'?pack='+b64uEnc(JSON.stringify({v:1,t:state.tpls.map(t=>({title:t.title,body:t.body,pinned:!!t.pinned}))}));
  const text='Open this link to add my QuickChat message templates ('+state.tpls.length+'):';
  if(navigator.share)navigator.share({title:'QuickChat templates',text,url}).catch(err=>{if(!err||err.name!=='AbortError')copyPack(url)});
  else copyPack(url);
};
function copyPack(url){navigator.clipboard.writeText(url).then(()=>toast('Template link copied'),()=>toast('Could not copy the link'))}
export function showPack(code){
  let pack;try{pack=JSON.parse(b64uDec(code))}catch(e){pack=null}
  const b=$('packBanner');
  if(!pack||!Array.isArray(pack.t)){toast('This template link is broken');return}
  const items=pack.t.filter(t=>t&&typeof t.body==='string'&&t.body.trim()),fresh=items.filter(t=>!state.tpls.some(x=>x.body===t.body));
  b.innerHTML=`<p><b>${items.length} shared template${items.length===1?'':'s'}</b>${fresh.length<items.length?` · ${items.length-fresh.length} you already have`:''}</p>`
    +`<p class="bk" dir="auto">${items.map(t=>esc(t.title||t.body.slice(0,30))).join(' · ')}</p>`
    +`<div class="row2">${fresh.length?`<button type="button" class="btn small primary" data-pk="add">Add ${fresh.length}</button>`:''}<button type="button" class="btn small" data-pk="no">${fresh.length?'Dismiss':'Close'}</button></div>`;
  b.hidden=false;b._fresh=fresh;
  setTimeout(()=>b.scrollIntoView({behavior:'smooth',block:'center'}),100);
}
$('packBanner').addEventListener('click',e=>{
  const a=e.target.closest('[data-pk]');if(!a)return;const b=$('packBanner');
  if(a.dataset.pk==='add'){b._fresh.forEach((t,k)=>state.tpls.push({id:'t'+Date.now()+'_'+k,title:String(t.title||t.body.slice(0,30)),body:t.body,pinned:!!t.pinned}));store.set('qc_tpls',state.tpls);renderTpls();renderBk();toast('Added '+b._fresh.length+' template'+(b._fresh.length===1?'':'s'))}
  b.hidden=true;b.innerHTML='';
});
