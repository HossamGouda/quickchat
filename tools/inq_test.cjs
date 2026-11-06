/* inq_test.cjs — unit tests for js/inq.js (multi-inquiry data layer). */
const {inqEnsure,inqActive,inqSet,inqAdd,inqSwitch,inqDel,inqList,hasOpenInq,inqMerge,inqCheck,migrateRecents,INQ_FIELDS}=require('../js/inq.js');
let n=0,fail=0;
function eq(name,cond){n++;if(cond)console.log('PASS '+name);else{fail++;console.log('FAIL '+name)}}
function same(name,a,b){eq(name,JSON.stringify(a)===JSON.stringify(b))}

/* 1. Fresh record stays inquiry-less until a write. */
let r={full:'1'};
inqEnsure(r);
eq('fresh record: no inq array',!Array.isArray(r.inq));
eq('fresh record: check passes',inqCheck(r));
eq('fresh record: no active',inqActive(r)===null);
eq('fresh record: open like isOpen("")',hasOpenInq(r)===true);

/* 2. Lazy migration of a legacy record. */
r={full:'2',label:'Ahmed',status:'quoted',value:12000,valid:'2026-12-01',lostWhy:'',outcome:'replied',seq:{k:'quote',step:2},vars:{city:'Riyadh'},at:1};
inqEnsure(r);
eq('legacy: inq created',Array.isArray(r.inq)&&r.inq.length===1);
eq('legacy: act=q1',r.act==='q1');
eq('legacy: status moved',r.inq[0].status==='quoted');
eq('legacy: value moved',r.inq[0].value===12000);
eq('legacy: seq moved',r.inq[0].seq.k==='quote');
eq('legacy: mirror intact',r.status==='quoted'&&r.value===12000);
eq('legacy: check passes',inqCheck(r));
eq('legacy: open (quoted)',hasOpenInq(r)===true);

/* 3. Sanitizers. */
r={full:'3'};inqSet(r,{status:'hacked'});eq('sanitize: bad status -> empty',inqActive(r).status==='');
inqSet(r,{status:'quoted',value:-5});eq('sanitize: negative value -> 0',inqActive(r).value===0);
inqSet(r,{value:4999.6});eq('sanitize: value rounded',inqActive(r).value===5000);
inqSet(r,{valid:'Dec 1'});eq('sanitize: bad date -> empty',inqActive(r).valid==='');
inqSet(r,{valid:'2026-12-01'});eq('sanitize: good date kept',inqActive(r).valid==='2026-12-01');
inqSet(r,{seq:{k:'x',step:9}});eq('sanitize: seq step clamped 3',inqActive(r).seq.step===3);
inqSet(r,{seq:'junk'});eq('sanitize: bad seq -> null',inqActive(r).seq===null);
inqSet(r,{vars:[1,2]});eq('sanitize: array vars -> {}',JSON.stringify(inqActive(r).vars)==='{}');
inqSet(r,{outcome:'replied'});eq('sanitize: outcome kept',inqActive(r).outcome==='replied');
eq('sanitize: unknown key ignored',inqSet(r,{evil:1}).evil===undefined);
eq('check passes after writes',inqCheck(r));

/* 4. Second inquiry isolation + switch mirror. */
inqAdd(r,'Pumps');
eq('add: active switched',inqActive(r).label==='Pumps');
eq('add: mirror reset (status empty)',r.status==='');
eq('add: first inquiry keeps its data',r.inq[0].status==='quoted'&&r.inq[0].value===5000);
eq('two inquiries',inqList(r).length===2);
inqSet(r,{status:'negotiating',value:8000});
inqSwitch(r,'q1');
eq('switch: mirror back to first',r.status==='quoted'&&r.value===5000&&r.valid==='2026-12-01');
eq('switch: second untouched',r.inq[1].status==='negotiating');
eq('switch back',inqSwitch(r,r.inq[1].id)&&r.status==='negotiating');
eq('switch unknown id -> null',inqSwitch(r,'nope')===null);
eq('check passes across switches',inqCheck(r));

/* 5. Deletion. */
const del1=inqDel(r,r.inq[1].id);
eq('del: returns removed inquiry',del1&&del1.label==='Pumps');
eq('del: active moved to remaining',r.act==='q1'&&r.status==='quoted');
eq('del: one left',inqList(r).length===1);
inqDel(r,'q1');
eq('del: last inquiry clears state',!Array.isArray(r.inq)&&r.status===undefined&&r.value===undefined);
eq('del: fresh again, open like isOpen("")',hasOpenInq(r)===true);

/* 6. hasOpenInq with mixed inquiries. */
r={full:'4'};inqEnsure(r);
inqAdd(r,'A');inqSet(r,{status:'waiting'});
inqAdd(r,'B');inqSet(r,{status:'won'});
eq('mixed: open while any inquiry open',hasOpenInq(r)===true);
inqSwitch(r,r.inq[0].id);inqSet(r,{status:'lost'});
eq('mixed: closing the open one leaves only won',hasOpenInq(r)===false);

/* 7. Merge: dedupe by id, re-key collisions, act preserved. */
const w={full:'5'};inqAdd(w,'Main');inqSet(w,{status:'quoted',value:100});
const l={full:'6'};inqAdd(l,'Extra');inqSet(l,{status:'won',value:50});
l.inq[0].id=w.inq[0].id;                       /* force a collision */
l.inq.push({id:'unique2',status:'lost',value:10});
inqMerge(w,l);
eq('merge: 3 inquiries',w.inq.length===3);
eq('merge: act preserved',w.act===w.inq[0].id);
eq('merge: collision re-keyed',new Set(w.inq.map(i=>i.id)).size===3);
eq('merge: mirror still active',w.status==='quoted'&&w.value===100);
eq('merge: loser data present',w.inq.some(i=>i.id==='unique2'&&i.status==='lost'));
eq('merge: check passes',inqCheck(w));

/* 8. inqCheck detects mirror tampering. */
w.status='tampered';
eq('check catches tamper',inqCheck(w)===false);

/* 9. migrateRecents pass. */
const list=[{full:'a',status:'won'},{full:'b'},{full:'c',value:300}];
migrateRecents(list);
eq('migrate: only data records get inq',!list[1].inq&&Array.isArray(list[0].inq)&&Array.isArray(list[2].inq));
eq('migrate: all check',list.every(inqCheck));

console.log(`\n${n-fail}/${n} passed`);
process.exit(fail?1:0);
