/* Unit tests for js/syncmap.js — Teable field mapping round-trip (protocol v3). */
const { contactToFields, contactFromRow, EXTRA_CONTACT_FIELDS } = require('../js/syncmap.js');

const COUNTRIES = [{ id: 'sa' }, { id: 'ot' }];
const STATUSES = ['', 'lead', 'contacted', 'quoted', 'waiting', 'negotiating', 'won', 'lost'];
const CTX = { COUNTRIES, STATUSES };

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

const rec = {
  full: '966500000001', code: '966', local: '500000001', country: 'sa',
  label: 'Ali', status: 'quoted', due: '2026-11-10', dueTime: '09:30',
  value: 4500, at: 1793000000000, note: 'Wants two', fuMsg: 'Hello {name}',
  lostWhy: 'price', valid: '2026-12-01', dnc: 1, outcome: 'sent',
  seq: { k: 'quote', step: 2 }, company: 'Gouda Trading', src: 'Expo',
  vars: { city: 'Jeddah', model: 'X200' },
  log: [{ t: 1, e: 'outcome', v: 'sent' }], _lu: 1793100000000,
};

/* toFields */
const f = contactToFields(rec);
eq('number is the match key', f.Number, '966500000001');
eq('valid serializes to ms date', f.Valid, new Date(2026, 11, 1).getTime());
eq('due serializes to ms date', f.Due, new Date(2026, 10, 10).getTime());
eq('dnc is checkbox boolean', f.Dnc, true);
eq('seq/vars serialize as JSON', [typeof f.Seq, typeof f.Vars], ['string', 'string']);
eq('company + lead source mapped', [f.Company, f.LeadSource], ['Gouda Trading', 'Expo']);
eq('outcome + lost reason mapped', [f.Outcome, f.LostWhy], ['sent', 'price']);

/* round-trip through a Teable row */
const back = contactFromRow({ fields: f }, CTX);
eq('full round-trips', back.full, rec.full);
eq('country resolves', back.country, 'sa');
eq('due/valid round-trip as day strings', [back.due, back.valid], ['2026-11-10', '2026-12-01']);
eq('dnc round-trips', back.dnc, 1);
eq('seq round-trips', back.seq, { k: 'quote', step: 2 });
eq('vars round-trip', back.vars, { city: 'Jeddah', model: 'X200' });
eq('company/src round-trip', [back.company, back.src], ['Gouda Trading', 'Expo']);
eq('lostWhy/outcome round-trip', [back.lostWhy, back.outcome], ['price', 'sent']);
eq('status round-trips', back.status, 'quoted');
eq('log round-trips', back.log, [{ t: 1, e: 'outcome', v: 'sent' }]);
eq('_lu preserved', back._lu, 1793100000000);

/* fromRow robustness */
eq('empty fields row -> null', contactFromRow({ fields: {} }, CTX), null);
eq('unknown country -> ot', contactFromRow({ fields: { Number: '1', Country: 'zz' } }, CTX).country, 'ot');
eq('unknown status -> empty', contactFromRow({ fields: { Number: '1', Status: 'bogus' } }, CTX).status, '');
eq('garbage Vars -> {}', contactFromRow({ fields: { Number: '1', Vars: '{oops' } }, CTX).vars, {});
eq('garbage Seq -> null', contactFromRow({ fields: { Number: '1', Seq: '[1' } }, CTX).seq, null);
eq('date cells from ISO strings', contactFromRow({ fields: { Number: '1', Valid: '2026-12-01T00:00:00.000Z' } }, CTX).valid.length, 10);

/* v3 field catalog covers every new mapping key */
const NEED = ['LostWhy', 'Valid', 'Dnc', 'Outcome', 'Seq', 'Company', 'LeadSource', 'Vars'];
eq('EXTRA_CONTACT_FIELDS covers v3 fields', NEED.filter(k => !EXTRA_CONTACT_FIELDS[k]), []);

console.log(fail ? `FAILURES: ${fail}` : 'ALL SYNCMAP TESTS PASSED');
process.exit(fail ? 1 : 0);
