# QuickChat — v5.4 Plan: The App Learns What Happened

Follow-up on v5.3 (per-queue Open-in toggle). This round is about **closing
the loop after a message is opened**: the app currently knows you *tapped*
Open chat (queue `opened → sent`, `fuActive` on the Chat tab) but never learns
what came of it. Every future idea — Today screen, weekly summary, reviving
stale leads, saved campaigns — depends on this data existing. Brainstormed
from an external idea review and a full read of `js/followups.js` (414
lines), `js/queue.js` (303), `js/dialer.js`, `js/core.js`, `js/backup.js`,
`js/qutil.js`. No code yet — this is the plan.

> **Status:** planned 2026-11-04.
> Live: https://hossamgouda.github.io/quickchat · Native: Capacitor APK.

## User profile driving the design

Sales rep running quotes, certificates and general contact tasks over
WhatsApp. Needs the app to *remember outcomes* (did they reply? why did we
lose it?) without typing, and to stop asking about people who said "stop".
Direction confirmed: deepen the follow-ups core (outcomes, sequences, stages,
validity, do-not-contact, message variants) before any structural rework.

## What the section does today (ground truth)

- **Status model:** `STATUSES = ['','quoted','waiting','won','lost']` on the
  Recent (one status per contact — multiple inquiries per contact is a v6
  conversation, out of scope here).
- **Follow-ups:** due date + optional time, `fuRepeat` intervals already
  auto-schedule the next due date on Done (the "chain" machinery exists —
  sequences extend it, they don't invent it). `fuMsg` drafts a message;
  `fuActive` on the Chat tab tracks "you opened this contact from a
  follow-up". `task` holds the free-text task.
- **Queue:** staged `opened → sent` with Undo; skip reasons `wrong / later /
  no` (only `wrong`/`no` are terminal — `retryableSkipped()`); weekly sent
  counter (`bumpWeek`/`qc_qweek`); finish-line batch follow-up with task
  text.
- **History:** per-contact `r.log[]` events (`status`, `due`, `done`,
  `task`, `queue`, `repeat`, …) already power the detail timeline — new
  events plug straight in.

## Gaps worth closing

1. **No outcome data.** After Open chat the app is blind: "Replied" and
   "ignored me" look identical. No reporting can ever work without this.
2. **Only 2 open stages.** A brand-new lead and a negotiated deal both show
   nothing until "Quoted". Lost deals record no reason, so no patterns.
3. **Sequences are manual.** `fuRepeat` reschedules the *same* reminder;
   nobody builds the day-3 → day-7 → day-14 chase with escalating messages.
4. **Quote validity is untracked.** A natural, truthful reason to message a
   client (your quote expires Thursday) is left on paper.
5. **"Stop" people come back.** Nothing prevents a "Not interested" contact
   from re-entering the next pasted queue.
6. **Every cold message is identical.** One template text to 50 people is
   both spam-shaped and ban-risky; there's no nudge on volume either.

## Proposed work

### O1 — Outcome logging (the foundation)

One new per-contact field `r.outcome` (latest) + `logEv(r,'outcome',v)`
events (values: `sent` / `noreply` / `replied` / `interested`).

- **Prompt moment.** When a Recent is opened via Open chat from anywhere
  (Chat tab `fuActive`, queue, follow-up "Follow up"), stamp
  `r._po = Date.now()`. On next app foreground (`visibilitychange` /
  Capacitor `appStateChange`), if `_po` is < 30 min old and `location.hash`
  is back in the app, show a one-tap sheet: **"What happened with
  +966…?" — Sent / No reply / Replied / Interested**. One tap writes the
  event, clears `_po`, and offers a sensible next step per answer:
  - *Interested* → suggest status `negotiating` (O2), offer "Set follow-up".
  - *Replied* → offer "Set follow-up" (default +3d).
  - *No reply* → offer "Chase in 3 days" (starts/extends the sequence, O3).
  - *Sent* → nothing extra (queue already counts it).
- **Dismissible, never blocking:** ✕ or tapping outside just clears `_po`;
  the sheet re-arms on the next open. No repeat nag within the same day
  for the same contact.
- **Queue integration:** the existing *Sent ✓* confirm writes `sent`
  automatically (no extra tap there — the sheet must not double-ask).
- Cost: ~1 tap per conversation *when it matters*; zero typing.

### O2 — More stages + lost reason

- `STATUSES` gains `lead` (New lead), `contacted` (Contacted),
  `negotiating` (Negotiating) before `quoted`. `ST_LABEL` + `F_LABEL`
  filters + pipeline counts follow mechanically.
- **Lost asks why:** marking `lost` opens the same bottom-sheet pattern as
  the queue's skip reasons: Price / Competitor / Timing / No budget /
  Other (free text, optional). Stored as `r.lostWhy`; logged as a
  `lostwhy` event. Detail card shows "Lost — Price". Undo restores
  previous status and clears `lostWhy`.
- Pipeline stat row "Win rate" unchanged; add "Lost reasons" line when ≥1
  recorded (e.g. `Price ×2 · Timing ×1`).
- The queue's existing *Mark as lost* shortcut routes through the same
  sheet.

### O3 — Follow-up sequences

Extend `fuRepeat` rather than replace it.

- New per-contact `r.seq` = `{kind:'quote', step:0}` where `kind` selects a
  built-in chain: **Quote chase: 3d → 7d → 14d (final)**. Defined in one
  table (day offset + template slot + label per step).
- `completeFollowUp()`: if `r.seq` active and a next step exists →
  auto-set `due = today + offset`, load that step's message into `fuMsg`
  (replacing it — the previous step's text is history), log `seq` event,
  toast "Next chase: day 7 · Tue". Last step done (or status → `won`/`lost`)
  clears `r.seq`.
- Selecting a chain in the follow-up detail (next to Repeat) seeds step 1;
  clearing Repeat/chain returns to today's manual behavior.
- Sequences and `fuRepeat` are mutually exclusive (one rescheduler owns
  the next due date).

### O4 — Quote validity reminder

- New field `r.valid` (date) on the contact card, plus a pipeline stat
  "Expiring" (open quotes with validity within 7 days).
- Setting validity auto-arms a reminder: `due = valid − 2 days`,
  `task = 'Quote expires ' + validity` — a truthful reason to message.
  Skipped if an earlier open due date exists.
- Shown in the follow-up row meta and the detail timeline.

### O5 — Do-not-contact list

- New flag `r.dnc`. Sources: (a) queue skip reason `no` gains an optional
  **"Don't contact again"** checkbox in the skip sheet; (b) outcome sheet
  offers it after two consecutive `noreply` (soft suggestion, one tap);
  (c) toggle in the contact detail.
- Enforcement: `extractWithNames` results and the people picker filter out
  DNC numbers with a count note ("2 skipped — do not contact"); DNC rows
  render dimmed with a stop badge in Recents/Follow-ups; un-toggling is one
  tap from the detail card.

### O6 — Message variants + daily-count warning

- **Variants in templates:** `{v:Hello Ahmed|Hi Mr. Ahmed|Good day}` picks
  one deterministically per queue item (`index % count`) so a batch reads
  human and isn't byte-identical. Pure `fillTpl` extension — works in the
  Chat tab too.
- **Daily-count warning:** new `qc_qday` counter `{day, n}` reset by date.
  At ≥ 25 opened chats/day the queue shows a dismissible warning banner:
  "25 chats opened today — WhatsApp restricts accounts that message many
  people who haven't saved their number." Continues to count; never blocks.

## i18n, tests, rollout

- Every new string goes through `tr()` with an `js/i18n.js` AR entry
  (map key + `AR_RE` regex rows for interpolated templates).
- New unit tests: sequence table/step math and `_po` expiry in
  `tools/queue_test.cjs`-style files; outcome/lost-why round-trips through
  `tools/norm_test.cjs`-style sanitizers if fields join the backup schema
  (`backup.js` exporter + importer must both learn the new fields).
- Then the standing routine: `node --check`, import/ntf/norm/queue tests,
  `eval_smoke`, `build_www.py`, `npx cap sync`, APK, emulator verify (CDP),
  `build_sw.py`, commit, push, poll CI.
- Version bump 5.4 with a What's-new banner (AR included).

## Explicitly out of scope (v5.5 / v6 candidates)

CSV import with per-contact variables, CSV/Excel export, saved campaigns,
build-queue-from-stale-leads (needs O1 data first), Today screen, multiple
inquiries per contact (the structural rework — anchor of v6), business-card
OCR, file library, QR campaign cards, app shortcuts.
