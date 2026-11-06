/* inq_lint.cjs — guard the multi-inquiry boundary: after P1, the seven
   inquiry-scoped fields (status, value, valid, lostWhy, outcome, seq, vars)
   may only be assigned inside js/inq.js (the mirror machinery). Any other
   direct assignment desyncs the mirror from r.inq[]. Run in the chain after
   check_imports. */
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const JS=path.join(ROOT,'js');
const RE=/\.\s*(status|value|valid|lostWhy|outcome|seq|vars)\s*=(?!=)/g;
/* Matches `x.status = ...` (any object) but not `===` / `!==`. Object identity
   can't be proven by regex, so this lint errs on the side of catching DOM
   `.value=` writes too; those are whitelisted by line pattern below. */
const SKIP=/\.(value)=\s*[^=]/; /* DOM inputs: foo.value = ... */
let bad=0;
for(const f of fs.readdirSync(JS)){
  if(!f.endsWith('.js')||f==='inq.js')continue;
  const lines=fs.readFileSync(path.join(JS,f),'utf8').split('\n');
  lines.forEach((ln,i)=>{
    RE.lastIndex=0;
    let m;
    while((m=RE.exec(ln))){
      const field=m[1];
      /* Local patch objects building an inqSet argument (e.g. patch.seq). */
      if(/(^|\W)patch\.\s*$/.test(ln.slice(0,m.index+1)))continue;
      /* Contact records in this codebase are always named r or ex; DOM inputs
         use every other name under the sun, so .value is only suspect on r/ex.
         All other inquiry fields never appear on DOM elements at all. */
      if(field==='value'){
        if(!/\b(r|ex)\.value\s*=[^=]/.test(ln))continue;
      }
      /* queue.js statuses are queue-item lifecycle writes, never contacts. */
      if(field==='status'&&f==='queue.js')continue;
      /* syncmap.js re-derives the mirror from the parsed Inquiries payload in
         contactFromRow — that mirror refresh IS the mapper's job (same rule
         as inq.js, which is excluded wholesale above). */
      if(f==='syncmap.js'&&/^\s*out\./.test(ln))continue;
      console.log(`${f}:${i+1}: direct .${field}= write — route through inqSet/inqAdd`);
      bad++;
    }
  });
}
if(bad){console.log(`\nINQ LINT: ${bad} direct write(s) found`);process.exit(1)}
console.log('INQ LINT OK: inquiry fields only written inside inq.js');
