/* Unit tests for js/statsutil.js pure helpers (stats tab, v5.5). */
const { outcomeCounts, responseRate, weeklyCounts, statusCounts,
  lostReasonCounts, srcCounts, messagedCount,
  dueOn, expiringQuotes, newLeads, weekSummary } = require('../js/statsutil.js');

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

const T = (d, e, v) => ({ t: d.getTime(), e, v: v === undefined ? '' : v });
const NOW = new Date(2026, 10, 4, 12); // Wed 2026-11-04, ISO week 2026-W45

/* outcomeCounts */
const recs = [
  { full: '1', log: [T(NOW, 'outcome', 'sent'), T(NOW, 'outcome', 'replied')] },
  { full: '2', log: [T(NOW, 'outcome', 'sent'), T(NOW, 'outcome', 'interested')] },
  { full: '3', log: [T(NOW, 'status', 'won')] },
  { full: '4', log: [] },
];
eq('outcome counts tally only outcome events', outcomeCounts(recs),
  { sent: 2, noreply: 0, replied: 1, interested: 1 });
eq('empty recents gives zeroed keys', outcomeCounts([]),
  { sent: 0, noreply: 0, replied: 0, interested: 0 });

/* responseRate */
eq('rate = replies / sent', responseRate({ sent: 2, replied: 1, interested: 1 }), 1);
eq('rate 0 when nothing sent', responseRate({ sent: 0, replied: 3 }), 0);
eq('rate fraction', responseRate({ sent: 4, replied: 1, interested: 0 }), 0.25);

/* weeklyCounts: trailing window, oldest first, events bucketed by ISO week */
const old = new Date(2026, 9, 20); // W43
const recsW = [
  { full: 'a', log: [T(old, 'outcome', 'sent'), T(NOW, 'outcome', 'sent'), T(NOW, 'outcome', 'replied')] },
  { full: 'b', log: [T(new Date(2026, 9, 27), 'outcome', 'sent')] }, // W44
  { full: 'c', log: [T(new Date(2020, 0, 1), 'outcome', 'sent')] },  // outside window
];
const wk = weeklyCounts(recsW, 3, NOW.getTime());
eq('window has 3 rows', wk.length, 3);
eq('window ends on anchor week', wk[2].wk, '2026-W45');
eq('week W43 has one sent', wk[0], { wk: '2026-W43', c: { sent: 1 }, n: 1 });
eq('week W44 has one sent', wk[1], { wk: '2026-W44', c: { sent: 1 }, n: 1 });
eq('week W45 stacks sent+replied', wk[2], { wk: '2026-W45', c: { sent: 1, replied: 1 }, n: 2 });
eq('events older than window are ignored', wk.reduce((s, r) => s + r.n, 0), 4);

/* statusCounts */
eq('status tally includes empty bucket', statusCounts([{ status: 'won' }, { status: 'lead' }, {}]),
  { '': 1, lead: 1, contacted: 0, quoted: 0, waiting: 0, negotiating: 0, won: 1, lost: 0 });

/* lostReasonCounts */
eq('only lost records counted, missing reason under empty key',
  lostReasonCounts([{ status: 'lost', lostWhy: 'price' }, { status: 'lost' }, { status: 'won', lostWhy: 'price' }]),
  { price: 1, '': 1 });
eq('no lost records gives empty tally', lostReasonCounts([{ status: 'won' }]), {});

/* srcCounts */
eq('src tally skips records without src', srcCounts([{ src: 'Expo' }, { src: 'Expo' }, { src: 'Referral' }, {}]),
  { Expo: 2, Referral: 1 });

/* messagedCount */
eq('messaged = records with any outcome event', messagedCount(recs), 2);
eq('no recents gives 0', messagedCount([]), 0);


/* dueOn */
eq('due today counts only exact date', dueOn([{due:'2026-11-04'},{due:'2026-11-05'},{},{}], '2026-11-04'), 1);

/* expiringQuotes */
const expNow = new Date(2026, 10, 4, 12).getTime();
eq('open quote expiring in 3 days counts', expiringQuotes([
  {status:'quoted', valid:'2026-11-07'},
  {status:'quoted', valid:'2026-11-08'},   // 4 days: counts
  {status:'quoted', valid:'2026-11-09'},   // 5 days: counts
  {status:'quoted', valid:'2026-11-02'},   // past: no
  {status:'won', valid:'2026-11-06'},      // closed: no
  {status:'quoted'},                       // no validity: no
], expNow), 3);

/* newLeads */
eq('lead with no outcome counts; messaged one does not', newLeads([
  {status:'lead', log:[]},
  {status:'lead', log:[{t:1, e:'outcome', v:'sent'}]},
  {status:'contacted', log:[]},
]), 1);

/* weekSummary */
const wsNow = new Date(2026, 10, 4, 12).getTime(); // W45
{
  const s = weekSummary([
    {log: [
      {t: wsNow - 2 * 864e5, e: 'outcome', v: 'sent'},
      {t: wsNow - 1 * 864e5, e: 'outcome', v: 'replied'},
      {t: wsNow, e: 'outcome', v: 'interested'},
      {t: wsNow, e: 'status', v: 'won'},
      {t: wsNow, e: 'status', v: 'lost'},
    ]},
    {log: [{t: wsNow - 10 * 864e5, e: 'outcome', v: 'sent'}]},  // last week: ignored
    {log: [{t: wsNow, e: 'note', v: 'x'}]},                      // non-outcome: ignored
  ], wsNow);
  eq('week summary tallies outcomes and status changes', s, {sent: 1, replied: 1, interested: 1, won: 1, lost: 1});
}
eq('empty week gives zeros', weekSummary([], wsNow), {sent: 0, replied: 0, interested: 0, won: 0, lost: 0});

console.log(fail ? `FAILURES: ${fail}` : 'ALL STATS TESTS PASSED');
process.exit(fail ? 1 : 0);
