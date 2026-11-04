/* Unit tests for js/csvutil.js (CSV import with per-contact variables, v5.5). */
const { parseCsv, classifyHeaders, mapRow, KNOWN_COLS } = require('../js/csvutil.js');

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

/* parseCsv */
eq('simple rows', parseCsv('Name,Number\nAli,966500000001').rows, [['Ali', '966500000001']]);
eq('headers trimmed', parseCsv('  Name , Number \nAli,1').headers, ['Name', 'Number']);
eq('quoted cell with comma and quotes', parseCsv('Name,Note\n"Gouda, Inc","said ""hi"""').rows,
  [['Gouda, Inc', 'said "hi"']]);
eq('CRLF and trailing newline tolerated', parseCsv('A,B\r\n1,2\r\n').rows, [['1', '2']]);
eq('BOM stripped', parseCsv('﻿Name\nAli').headers, ['Name']);
eq('empty file', parseCsv(''), { headers: [], rows: [] });
eq('blank lines skipped', parseCsv('A,B\n\n1,2\n\n').rows, [['1', '2']]);
eq('short row padded', parseCsv('A,B,C\n1,2').rows, [['1', '2', '']]);
eq('long row truncated', (() => { const r = parseCsv('A,B\n1,2,3'); return r.rows[0].length })(), 2);

/* classifyHeaders */
{
  const c = classifyHeaders(['Name', 'Number', 'City', '']);
  eq('known columns mapped', c.known, { name: 'label', number: 'full' });
  eq('unknown become vars, blanks skipped', c.vars, ['City']);
  eq('case-insensitive', classifyHeaders(['NUMBER']).known, { number: 'full' });
}

/* mapRow */
{
  const { known, vars } = classifyHeaders(['Name', 'Number', 'City']);
  eq('row maps known + vars', mapRow(['Name', 'Number', 'City'], known, vars, ['Ali', '966500000001', 'Jeddah']),
    { fields: { label: 'Ali', full: '966500000001' }, vars: { city: 'Jeddah' } });
  eq('empty cells dropped', mapRow(['Name', 'Number'], known, vars, ['', '']),
    { fields: {}, vars: {} });
  eq('var keys lowercased', mapRow(['Number', 'Product Name'], { number: 'full' }, ['Product Name'], ['1', 'Pump X']),
    { fields: { full: '1' }, vars: { 'product name': 'Pump X' } });
}

/* KNOWN_COLS covers every export header */
const EXPORT_HEADERS = ['Name', 'Number', 'Country', 'Status', 'Quote value (SAR)', 'Note',
  'Follow-up date', 'Follow-up time', 'Message to send', 'Quote valid until', 'Lost reason',
  'Do not contact', 'Company', 'Lead source'];
eq('all export headers importable', EXPORT_HEADERS.filter(h => !KNOWN_COLS[h.toLowerCase()]), []);

console.log(fail ? `FAILURES: ${fail}` : 'ALL CSV TESTS PASSED');
process.exit(fail ? 1 : 0);
