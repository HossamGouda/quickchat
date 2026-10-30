/* qr.js — "My QR" tab: renders a printable WhatsApp chat QR code. */
import {$, store, normalize, toast} from './core.js';
import {tr} from './i18n.js';

const qrNum=$('qrNum'),qrMsg=$('qrMsg'),qrCap=$('qrCap');
const qrSaved=store.get('qc_qr',{num:'',msg:"Hello, I'd like a quotation.",cap:'Scan to chat on WhatsApp'});
qrNum.value=qrSaved.num;qrMsg.value=qrSaved.msg;qrCap.value=qrSaved.cap;
let qrLink=null;
export function drawQR(){
  const cv=$('qrCanvas'),x=cv.getContext('2d'),W=cv.width,H=cv.height;
  store.set('qc_qr',{num:qrNum.value,msg:qrMsg.value,cap:qrCap.value});
  x.fillStyle='#ffffff';x.fillRect(0,0,W,H);x.textAlign='center';
  const raw=qrNum.value.trim(),n=raw?normalize(raw):null;
  const h=$('qrHint');
  if(!n){qrLink=null;h.className='hint'+(raw?' err':'');h.textContent=raw?'Enter the number with country code, e.g. +966 55 123 4567.':'Clients scan the code and land in a chat with you.';
    x.fillStyle='#5d6b63';x.font='500 26px "IBM Plex Sans", system-ui, sans-serif';x.fillText(tr('Enter your number above'),W/2,H/2);return}
  const m=qrMsg.value.trim();
  qrLink='https://wa.me/'+n.full+(m?'?text='+encodeURIComponent(m):'');
  h.className='hint ok';h.textContent='Link: wa.me/'+n.full+(m?' + message':'');
  if(typeof qrcode!=='function'){x.fillStyle='#b3261e';x.font='500 24px sans-serif';x.fillText('QR library failed to load',W/2,H/2);return}
  const qr=qrcode(0,'M');qr.addData(qrLink);qr.make();
  const mc=qr.getModuleCount(),quiet=4,cell=Math.floor(580/(mc+quiet*2)),size=cell*(mc+quiet*2),ox=Math.round((W-size)/2),oy=20;
  x.fillStyle='#0b1a12';
  for(let r=0;r<mc;r++)for(let c=0;c<mc;c++)if(qr.isDark(r,c))x.fillRect(ox+(c+quiet)*cell,oy+(r+quiet)*cell,cell,cell);
  const cap=qrCap.value.trim(),ty=oy+size+44;
  x.fillStyle='#0b1a12';x.direction=/[؀-ۿ]/.test(cap)?'rtl':'ltr';
  x.font='700 34px "IBM Plex Sans", system-ui, sans-serif';if(cap)x.fillText(cap,W/2,ty,W-60);
  x.direction='ltr';x.fillStyle='#12704a';x.font='600 30px "IBM Plex Mono", ui-monospace, monospace';
  x.fillText('+'+(n.code?n.code+' '+n.local:n.full),W/2,cap?ty+48:ty,W-60);
}
[qrNum,qrMsg,qrCap].forEach(el=>el.addEventListener('input',drawQR));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(!$('tab-qr').hidden)drawQR()});
$('qrSave').onclick=()=>{
  if(!qrLink){toast('Enter your number first');qrNum.focus();return}
  $('qrCanvas').toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='whatsapp-qr.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Image saved to Downloads')},'image/png');
};
$('qrCopy').onclick=()=>{
  if(!qrLink){toast('Enter your number first');return}
  navigator.clipboard.writeText(qrLink).then(()=>toast('Link copied'),()=>toast('Copy failed. Long-press to copy: '+qrLink));
};
