/* i18n_scan.cjs — find user-visible English strings with no Arabic mapping.
   Replicates trCore (AR map + AR_RE rows) from js/i18n.js and scans string
   literals in the renderers + index.html text. Usage: node tools/i18n_scan.cjs */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js','i18n.js'),'utf8');

function grab(name,from){
  const i=from.indexOf('const '+name+'=');
  if(i<0)throw new Error(name+' not found');
  const open=from.indexOf(name==='AR'?'{':'[',i);
  const close=name==='AR'?'\n};':'\n];';
  const j=from.indexOf(close,open);
  if(j<0)throw new Error(name+' end not found');
  return from.slice(open,j+2);
}
const AR=new Function('return '+grab('AR',src))();
let AR_RE;
function trCore(k){
  if(Object.prototype.hasOwnProperty.call(AR,k))return AR[k];
  for(const [re,fn] of AR_RE){const m=k.match(re);if(m)return fn(...m)}
  if(k.includes(' · ')){const p=k.split(' · '),t=p.map(trCore);if(t.some((x,i)=>x!==p[i]))return t.join(' · ')}
  return k;
}
AR_RE=new Function('trCore','return '+grab('AR_RE',src))(trCore);

/* Lexer: walk JS, skipping comments and regex literals, collecting strings. */
function jsStrings(code){
  const out=[];let i=0;const n=code.length;
  const prevSig=j=>{let k=j-1;while(k>=0&&/\s/.test(code[k]))k--;return k>=0?code[k]:''};
  while(i<n){
    const c=code[i];
    if(c==='/'&&code[i+1]==='/'){while(i<n&&code[i]!=='\n')i++;continue}
    if(c==='/'&&code[i+1]==='*'){i+=2;while(i<n&&!(code[i]==='*'&&code[i+1]==='/'))i++;i+=2;continue}
    if(c==='/'){
      /* Regex literal only when the previous significant char can't end an expression. */
      const p=prevSig(i);
      if(!p||'=(,:[!&|?{};+-*%<>~^'.includes(p)){
        let j=i+1,inCls=false,ok=false;
        while(j<n){const ch=code[j];
          if(ch==='\\'){j+=2;continue}
          if(ch==='[')inCls=true;else if(ch===']')inCls=false;
          else if(ch==='/'&&!inCls){ok=true;break}
          else if(ch==='\n')break;
          j++}
        if(ok){j++;while(j<n&&/[a-z]/i.test(code[j]))j++;i=j;continue}
      }
      i++;continue;
    }
    if(c==="'"||c==='"'||c==='`'){
      const q=c;let j=i+1,s='';
      while(j<n&&code[j]!==q){
        if(code[j]==='\\'){s+=(code[j+1]||'');j+=2;continue}
        if(q==='`'&&code[j]==='$'&&code[j+1]==='{'){s+='${}';j+=2;let d=1;while(j<n&&d){if(code[j]==='{')d++;else if(code[j]==='}')d--;j++}continue}
        s+=code[j++];
      }
      if(j<n){out.push(s);j++}
      i=j;continue;
    }
    i++;
  }
  return out;
}
/* UI text pieces from a literal: if it carries markup, strip tags and pull
   attributes; plain strings pass through. */
function pieces(s){
  const out=[];
  if(s.includes('<')){
    const txt=s.replace(/<[^>]*>/g,'\n').replace(/&\w+;/g,' ');
    const attrs=s.match(/(?:placeholder|aria-label|title)="([^"]{2,})"/g)||[];
    attrs.forEach(a=>out.push(a.slice(a.indexOf('"')+1,-1)));
    txt.split('\n').forEach(t=>out.push(t));
  }else if(s.includes('${')){
    s.split(/\$\{[^}]*\}/).forEach(t=>out.push(t));
  }else out.push(s);
  return out;
}
const BAD=/[{};=`\\]|=>|function|\bconst\b|\blet\b|\bvar\b|https?:|qc_|\.js\b|data-[a-z]+=|<\/?|&[a-z]+;|\.\w+\(|\(\s*\)|\bnull\b|\bundefined\b/;
function isCode(s){
  const t=s.trim();
  if(t.length<3||t.length>180)return true;
  if(BAD.test(t))return true;
  if(!/[A-Za-z؀-ۿ]/.test(t))return true;
  if(!/\s/.test(t)&&/^[a-z][\w-]*$/.test(t))return true;   // single lowercase token = key/id
  if(/^[A-Z][\w-]*$/.test(t)&&!t.includes(' '))return true; // CONSTANT
  if(/^[\d\s+\-().·:%×,?!'’]+$/.test(t))return true;
  if(/^[#.][\w-]/.test(t))return true;
  return false;
}
const gaps=new Map();
function check(s,where){
  if(isCode(s))return;
  const t=trCore(s.trim());
  if(t===s.trim()&&!gaps.has(s.trim()))gaps.set(s.trim(),where);
}
fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')&&f!=='i18n.js'&&f!=='qrcode.js').forEach(f=>{
  const code=fs.readFileSync(path.join(root,'js',f),'utf8');
  jsStrings(code).forEach(lit=>pieces(lit).forEach(p=>check(p,'js/'+f)));
});
/* index.html static text + attributes */
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const body=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'');
pieces(body).forEach(p=>check(p,'index.html'));
const list=[...gaps.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
console.log(list.length+' untranslated candidate strings');
list.forEach(([s,w])=>console.log('  ['+w+'] '+JSON.stringify(s)));
