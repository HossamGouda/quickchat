/* Unit tests for js/qutil.js pure helpers (queue section, v5.0). */
const { retryableSkipped, isoWeekKey, paceMs, PACES } = require('../js/qutil.js');

let fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
};

/* retryableSkipped */
eq('later is retryable', retryableSkipped('later'), true);
eq('empty reason is retryable', retryableSkipped(''), true);
eq('undefined reason is retryable', retryableSkipped(undefined), true);
eq('wrong is terminal', retryableSkipped('wrong'), false);
eq('no is terminal', retryableSkipped('no'), false);

/* isoWeekKey: known anchors */
eq('2026-11-04 is 2026-W45 (Wed)', isoWeekKey(new Date(2026, 10, 4)), '2026-W45');
eq('2026-01-01 is 2026-W01 (Thu)', isoWeekKey(new Date(2026, 0, 1)), '2026-W01');
eq('2026-12-31 is 2026-W53 (Thu)', isoWeekKey(new Date(2026, 11, 31)), '2026-W53');
/* Monday/Sunday belong-to rules around a week boundary */
eq('2023-01-01 (Sun) belongs to 2022-W52', isoWeekKey(new Date(2023, 0, 1)), '2022-W52');
eq('2024-12-30 (Mon) starts 2025-W01', isoWeekKey(new Date(2024, 11, 30)), '2025-W01');
eq('2025-01-05 (Sun) belongs to 2025-W01', isoWeekKey(new Date(2025, 0, 5)), '2025-W01');
/* Same local date across time-of-day stays one key */
eq('morning and evening same day match', isoWeekKey(new Date(2026, 10, 4, 23, 59)) === isoWeekKey(new Date(2026, 10, 4, 0, 1)), true);

/* paceMs: passthrough for known values, default 3000 otherwise */
eq('pace 0 stays 0', paceMs(0), 0);
eq('pace 8000 stays 8000', paceMs(8000), 8000);
eq('unknown value defaults to 3000', paceMs(5000), 3000);
eq('undefined defaults to 3000', paceMs(undefined), 3000);
eq('PACES has 4 entries', PACES.length, 4);

console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
process.exit(fail ? 1 : 0);
