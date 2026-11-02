/* Unit tests for js/ntfutil.js — the pure notification-engine helpers.
   Runs in plain node (no DOM); CI picks up tools/*.cjs via node --check,
   and this file exits non-zero on failure so it can be run directly too. */
const assert = require("assert");
const { applyQuiet, quietHit, snoozeUntilMs, nextNagMs, groupAlerts, dayStr } =
  require("../js/ntfutil.js");

/* Fixed "now": 2026-03-10 12:00:00 local */
const NOW = new Date(2026, 2, 10, 12, 0, 0).getTime();
const at = (h, m, dayOff = 0) => { const d = new Date(2026, 2, 10 + dayOff, h, m, 0, 0); return d.getTime(); };

/* ---- quietHit / applyQuiet ---- */
/* 23:00 is inside the 22:00-08:00 window -> shifts to 08:00 next day */
assert.strictEqual(applyQuiet(at(23, 0), "22:00", "08:00"), at(8, 0, 1));
/* 07:59 same */
assert.strictEqual(applyQuiet(at(7, 59), "22:00", "08:00"), at(8, 0));
/* 12:00 is outside -> untouched */
assert.strictEqual(applyQuiet(at(12, 0), "22:00", "08:00"), at(12, 0));
/* daytime-only window 12:00-13:00 */
assert.strictEqual(applyQuiet(at(12, 30), "12:00", "13:00"), at(13, 0));
assert.strictEqual(applyQuiet(at(11, 0), "12:00", "13:00"), at(11, 0));
/* malformed values fall back to 22:00-08:00 */
assert.strictEqual(applyQuiet(at(23, 0), "bad", "nope"), at(8, 0, 1));
/* exact boundary: window start is inside, end is not */
assert.strictEqual(applyQuiet(at(22, 0), "22:00", "08:00"), at(8, 0, 1));
assert.strictEqual(applyQuiet(at(8, 0), "22:00", "08:00"), at(8, 0));
assert.strictEqual(quietHit(at(21, 0), "22:00", "08:00"), null);

/* ---- snoozeUntilMs ---- */
assert.strictEqual(snoozeUntilMs("h1", NOW), NOW + 36e5);
assert.strictEqual(snoozeUntilMs("h3", NOW), NOW + 3 * 36e5);
/* morning: from 12:00 -> next day 9:00 */
assert.strictEqual(snoozeUntilMs("morning", NOW), at(9, 0, 1));
/* morning: from 08:00 -> same day 9:00 */
assert.strictEqual(snoozeUntilMs("morning", at(8, 0)), at(9, 0));
/* default kind behaves as h1 */
assert.strictEqual(snoozeUntilMs(undefined, NOW), NOW + 36e5);

/* ---- nextNagMs ---- */
assert.strictEqual(nextNagMs(NOW), at(9, 0, 1));        /* 12:00 -> tomorrow 9:00 */
assert.strictEqual(nextNagMs(at(8, 0)), at(9, 0));      /* 08:00 -> today 9:00 */
assert.strictEqual(nextNagMs(at(9, 0)), at(9, 0, 1));   /* exactly 9:00 -> tomorrow */

/* ---- groupAlerts ---- */
const one = { full: "1", at: at(9, 0) }, two = { full: "2", at: at(9, 5) },
      three = { full: "3", at: at(9, 10) }, four = { full: "4", at: at(9, 15) };
let g = groupAlerts([one, two, three], 3);
assert.strictEqual(g.summary, false);
assert.strictEqual(g.at, at(9, 0));
assert.strictEqual(g.items.length, 3);
g = groupAlerts([one, two, three, four], 3);
assert.strictEqual(g.summary, true);
assert.strictEqual(g.at, at(9, 0)); /* fires at the earliest member's time */
assert.strictEqual(g.items.length, 4);
g = groupAlerts([], 3);
assert.strictEqual(g.summary, false);
assert.strictEqual(g.items.length, 0);

/* ---- dayStr ---- */
assert.strictEqual(dayStr(at(23, 59)), "2026-03-10");
assert.strictEqual(dayStr(at(0, 0, 1)), "2026-03-11");

console.log("ntfutil: all assertions passed");
