/* qr.js — "My QR" tab: printable WhatsApp chat QR, a vCard QR that
   saves your number straight into the client's contacts, and campaign
   QRs that open WhatsApp with a template message ready to forward. */
import {$, store, state, normalize, toast, esc} from './core.js';
import {tr} from './i18n.js';

const qrNum=$('qrNum'),qrMsg=$('qrMsg'),qrCap=$('qrCap'),qrVn=$('qrVn'),qrOrg=$('qrOrg'),qrMail=$('qrMail');
let qrLink=null,qrKind='chat';
/* vCard text values escape ,\ ; and newlines per RFC 2426. */
const escV=s=>s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
/* Called once store.ready resolves: restores saved QR fields into the inputs. */
export function initQR(){
  const s=store.get('qc_qr',{num:'',msg:"Hello, I'd like a quotation.",cap:'Scan to chat on WhatsApp',vn:'',org:'',mail:''});
  qrNum.value=s.num;qrMsg.value=s.msg;qrCap.value=s.cap;qrVn.value=s.vn||'';qrOrg.value=s.org||'';qrMail.value=s.mail||'';
  qrKind=s.kind==='vcard'?'vcard':'chat';
  paintKind();
  fillCampSelect();
  drawCamp();
}
function paintKind(){
  document.querySelectorAll('[data-qrkind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.qrkind===qrKind)));
  const vc=qrKind==='vcard';
  $('qrMsgField').hidden=vc;$('qrVnField').hidden=!vc;$('qrOrgField').hidden=!vc;$('qrMailField').hidden=!vc;
  qrCap.placeholder=tr(vc?'Save my contact':'Scan to chat on WhatsApp');
  $('qrCopy').textContent=tr(vc?'Copy number':'Copy link');
  $('qrCanvas').setAttribute('aria-label',tr(vc?'QR code to save my contact':'QR code for your WhatsApp chat link'));
  $('qrVcardTip').hidden=!vc;
}
$('qrKinds').addEventListener('click',e=>{
  const b=e.target.closest('[data-qrkind]');if(!b||b.dataset.qrkind===qrKind)return;
  qrKind=b.dataset.qrkind;paintKind();drawQR();
});
export function drawQR(){
  const cv=$('qrCanvas'),x=cv.getContext('2d'),W=cv.width,H=cv.height;
  store.set('qc_qr',{kind:qrKind,num:qrNum.value,msg:qrMsg.value,cap:qrCap.value,vn:qrVn.value,org:qrOrg.value,mail:qrMail.value});
  x.fillStyle='#ffffff';x.fillRect(0,0,W,H);x.textAlign='center';
  const raw=qrNum.value.trim(),n=raw?normalize(raw):null;
  const h=$('qrHint');
  if(!n){qrLink=null;h.className='hint'+(raw?' err':'');h.textContent=raw?'Enter the number with country code, e.g. +966 55 123 4567.':'Clients scan the code and land in a chat with you.';
    x.fillStyle='#5d6b63';x.font='500 26px "IBM Plex Sans", system-ui, sans-serif';x.fillText(tr('Enter your number above'),W/2,H/2);return}
  let data,label;
  if(qrKind==='chat'){
    const m=qrMsg.value.trim();
    data=qrLink='https://wa.me/'+n.full+(m?'?text='+encodeURIComponent(m):'');
    label='Link: wa.me/'+n.full+(m?' + message':'');
  }else{
    const vn=qrVn.value.trim().slice(0,60),org=qrOrg.value.trim().slice(0,60),mail=qrMail.value.trim().slice(0,80);
    let vc='BEGIN:VCARD\nVERSION:3.0\n';
    if(vn)vc+='FN:'+escV(vn)+'\nN:;'+escV(vn)+';;;\n';
    if(org)vc+='ORG:'+escV(org)+'\n';
    if(mail&&mail.includes('@'))vc+='EMAIL;TYPE=INTERNET:'+escV(mail)+'\n';
    vc+='TEL;TYPE=CELL,VOICE:+'+n.full+'\nEND:VCARD';
    data=vc;qrLink=null;
    label='vCard: '+(vn?vn:'')+(vn&&org?' · ':'')+(org?org:'')+(vn||org?' — ':'')+'+'+(n.code?n.code+' '+n.local:n.full);
  }
  h.className='hint ok';
  h.textContent=qrKind==='chat'?tr(label):tr('Clients scan the code and save your number as a contact.');
  if(typeof qrcode!=='function'){x.fillStyle='#b3261e';x.font='500 24px sans-serif';x.fillText(tr('QR library failed to load'),W/2,H/2);return}
  const qr=qrcode(0,'M');qr.addData(data);qr.make();
  const mc=qr.getModuleCount(),quiet=4,cell=Math.floor(580/(mc+quiet*2)),size=cell*(mc+quiet*2),ox=Math.round((W-size)/2),oy=20;
  x.fillStyle='#0b1a12';
  for(let r=0;r<mc;r++)for(let c=0;c<mc;c++)if(qr.isDark(r,c))x.fillRect(ox+(c+quiet)*cell,oy+(r+quiet)*cell,cell,cell);
  const cap=qrCap.value.trim(),ty=oy+size+44;
  x.fillStyle='#0b1a12';x.direction=/[؀-ۿ]/.test(cap)?'rtl':'ltr';
  x.font='700 34px "IBM Plex Sans", system-ui, sans-serif';if(cap)x.fillText(cap,W/2,ty,W-60);
  x.direction='ltr';x.fillStyle='#12704a';x.font='600 30px "IBM Plex Mono", ui-monospace, monospace';
  x.fillText('+'+(n.code?n.code+' '+n.local:n.full),W/2,cap?ty+48:ty,W-60);
}
[qrNum,qrMsg,qrCap,qrVn,qrOrg,qrMail].forEach(el=>el.addEventListener('input',drawQR));

/* Campaign QR: a template's message encoded as a wa.me share link. Anyone
   who scans it gets WhatsApp open with the message ready to forward. */
let campLink=null;
function campTpl(){const id=$('qrCampSel').value;return state.tpls.find(t=>t.id===id)||null}
export function fillCampSelect(){
  const sel=$('qrCampSel'),cur=sel.value;
  sel.innerHTML=`<option value="">${esc(tr('Pick a template'))}</option>`+
    state.tpls.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');
  if(cur&&state.tpls.some(t=>t.id===cur))sel.value=cur;
}
export function drawCamp(){
  const cv=$('qrCampCanvas'),x=cv.getContext('2d'),W=cv.width,H=cv.height;
  x.fillStyle='#ffffff';x.fillRect(0,0,W,H);x.textAlign='center';
  const t=campTpl(),h=$('qrCampHint');
  if(!t){campLink=null;h.className='hint';h.textContent=tr('Pick a template above — the QR lets anyone forward your campaign message.');
    x.fillStyle='#5d6b63';x.font='500 26px "IBM Plex Sans", system-ui, sans-serif';x.fillText(tr('Pick a template above'),W/2,H/2);return}
  campLink='https://wa.me/?text='+encodeURIComponent(t.body);
  h.className='hint ok';h.textContent=tr('Scanning opens WhatsApp with this message ready to forward.');
  if(typeof qrcode!=='function'){x.fillStyle='#b3261e';x.font='500 24px sans-serif';x.fillText(tr('QR library failed to load'),W/2,H/2);return}
  const qr=qrcode(0,'M');qr.addData(campLink);qr.make();
  const mc=qr.getModuleCount(),quiet=4,cell=Math.floor(500/(mc+quiet*2)),size=cell*(mc+quiet*2),ox=Math.round((W-size)/2),oy=20;
  x.fillStyle='#0b1a12';
  for(let r=0;r<mc;r++)for(let c=0;c<mc;c++)if(qr.isDark(r,c))x.fillRect(ox+(c+quiet)*cell,oy+(r+quiet)*cell,cell,cell);
  x.direction=/[؀-ۿ]/.test(t.title)?'rtl':'ltr';
  x.font='700 32px "IBM Plex Sans", system-ui, sans-serif';x.fillText(t.title.slice(0,40),W/2,oy+size+44,W-60);
  x.direction='ltr';
}
$('qrCampSel').addEventListener('change',drawCamp);
$('qrCampCopy').onclick=()=>{
  if(!campLink){toast(tr('Pick a template first'));return}
  navigator.clipboard.writeText(campLink).then(()=>toast(tr('Message link copied')),()=>toast(tr('Copy failed. Long-press to copy: ')+campLink));
};
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(!$('tab-qr').hidden)drawQR()});
$('qrSave').onclick=()=>{
  if(!qrNum.value.trim()){toast('Enter your number first');qrNum.focus();return}
  $('qrCanvas').toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=qrKind==='vcard'?'my-contact-qr.png':'whatsapp-qr.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Image saved to Downloads')},'image/png');
};
$('qrCopy').onclick=()=>{
  if(qrKind==='chat'){
    if(!qrLink){toast('Enter your number first');return}
    navigator.clipboard.writeText(qrLink).then(()=>toast('Link copied'),()=>toast('Copy failed. Long-press to copy: '+qrLink));
  }else{
    const n=normalize(qrNum.value.trim());
    if(!n){toast('Enter your number first');qrNum.focus();return}
    navigator.clipboard.writeText('+'+n.full).then(()=>toast('Number copied'),()=>toast('Copy failed. Long-press to copy: +'+(n.code?n.code+' '+n.local:n.full)));
  }
};
