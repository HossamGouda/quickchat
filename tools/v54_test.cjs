/* Unit tests for v5.4 pure helpers: variants, sequences, outcome streaks,
   daily counter. */
const { applyVariants, fillTpl, STATUSES, ST_LABEL, LOST_REASONS, OUTCOMES, OUT_LBL } = require('../js/core.js');
const { seqPlan, SEQ_QUOTE, lastOutcomeStreak, bumpDayCounter, DAY_WARN_AT } = require('../js/qutil.js');

let fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

/* O6: applyVariants */
eq('seed 0 picks first', applyVariants('{v:Hello|Hi|Hey}', 0), 'Hello');
eq('seed 1 picks second', applyVariants('{v:Hello|Hi|Hey}', 1), 'Hi');
eq('seed 2 picks third', applyVariants('{v:Hello|Hi|Hey}', 2), 'Hey');
eq('seed 3 wraps', applyVariants('{v:Hello|Hi|Hey}', 3), 'Hello');
eq('single option always', applyVariants('{v:Only}', 9), 'Only');
eq('no variants untouched', applyVariants('Plain text {name}', 5), 'Plain text {name}');
eq('empty variant body -> empty', applyVariants('{v:}', 0), '');
eq('trims picked option', applyVariants('{v: A | B }', 1), 'B');

/* O6: fillTpl seed integration — variants resolve before {vars} */
eq('fillTpl resolves variant then var', fillTpl('{v:Hi|Hello} {name}', { name: 'Sara' }, 1), 'Hello Sara');
eq('fillTpl without variant, seed ignored', fillTpl('Hi {name}', { name: 'Sara' }, 7), 'Hi Sara');
eq('fillTpl leaves unknown var', fillTpl('{v:A|B} {missing}', {}, 0), 'A {missing}');

/* O2: status additions */
eq('7 statuses incl empty', STATUSES.length, 8);
eq('labels cover new stages', ST_LABEL.lead + '/' + ST_LABEL.contacted + '/' + ST_LABEL.negotiating, 'New lead/Contacted/Negotiating');
eq('lost reasons defined', LOST_REASONS.length, 5);
eq('outcome labels', OUT_LBL.interested, 'Interested');
eq('4 outcomes', OUTCOMES.length, 4);

/* O3: seqPlan */
eq('quote has 3 steps', SEQ_QUOTE.steps.length, 3);
eq('step1 due +3d', seqPlan('quote', 1, '2026-11-04').due, '2026-11-07');
eq('step2 due +7d', seqPlan('quote', 2, '2026-11-04').due, '2026-11-11');
eq('step3 due +14d', seqPlan('quote', 3, '2026-11-04').due, '2026-11-18');
eq('step4 null (finished)', seqPlan('quote', 4, '2026-11-04'), null);
eq('unknown kind null', seqPlan('nope', 1, '2026-11-04'), null);
eq('plan carries total', seqPlan('quote', 1, '2026-11-04').total, 3);
eq('plan carries msg', /quotation/i.test(seqPlan('quote', 2, '2026-11-04').msg), true);
eq('month boundary rollover', seqPlan('quote', 1, '2026-11-30').due, '2026-12-03');
eq('year boundary rollover', seqPlan('quote', 1, '2026-12-30').due, '2027-01-02');

/* O1/O5: lastOutcomeStreak */
const L = (...evs) => evs.map(([e, v], i) => ({ t: 1000 + i, e, v }));
eq('empty log -> 0', lastOutcomeStreak([]), 0);
eq('two noreplies streak', lastOutcomeStreak(L(['outcome','sent'], ['outcome','noreply'], ['outcome','noreply'])), 2);
eq('streak broken by reply', lastOutcomeStreak(L(['outcome','noreply'], ['outcome','replied'], ['outcome','noreply'])), 1);
eq('non-outcome events skipped', lastOutcomeStreak(L(['msg'], ['outcome','noreply'], ['due'], ['outcome','noreply'])), 2);
eq('sent ends streak at 0', lastOutcomeStreak(L(['outcome','noreply'], ['outcome','sent'])), 0);

/* O6: bumpDayCounter */
eq('first of day', JSON.stringify(bumpDayCounter(null, '2026-11-04')), '{"day":"2026-11-04","n":1}');
eq('same day increments', JSON.stringify(bumpDayCounter({ day: '2026-11-04', n: 24 }, '2026-11-04')), '{"day":"2026-11-04","n":25}');
eq('new day resets', JSON.stringify(bumpDayCounter({ day: '2026-11-04', n: 40 }, '2026-11-05')), '{"day":"2026-11-05","n":1}');
eq('warn threshold is 25', DAY_WARN_AT, 25);

process.exit(fail ? 1 : 0);
