# QuickChat — v5.0 Plan: Queue Deep-Polish

Follow-up on v4.0 (follow-ups overhaul). This round is about the **Queue tab**:
making a weekly batch of ~50 contacts truthful, paced, and reusable against
your existing relationships. Brainstormed from a full read of `js/queue.js`
(113 lines), `index.html`, `js/recents.js`, `js/followups.js`, `js/contacts.js`
and the v3.10–v4.0 work. No code yet — this is the plan.

> **Status:** implemented 2026-11-04.
> Live: https://hossamgouda.github.io/quickchat · Native: Capacitor APK.

## User profile driving the design

Big one-shot weekly batches (paste ~50 leads, burn through them) **mixed
with existing contacts to re-engage**. Confirmed direction: auto-merge pasted
numbers against Recents (default) *and* an explicit picker from your people —
both, with merge as the default behavior.

## What the section does today (ground truth)

- **Setup**: paste free text → `extractWithNames` (country-smart via
  `normalize()` since v3.11), name on the same line, dedupe by `full`.
  Template select with `{name}`-style vars filled once for the batch.
- **Run**: `q = {items, raw, extra, idx, arm}` in `qc_queue` — survives app
  restarts (so pause/resume already exists; it is not a gap). Linear walk:
  *Open chat* marks `sent` **immediately** (optimistic), opens WhatsApp,
  advances. *Back*, *Skip* (no reason), tap-any-row to jump, *End* (armed
  double-tap).
- **Finish**: progress bar, "n sent, m skipped", and 3d/1w buttons that set
  a due date on every sent contact's Recent via the v4.0 FU engine.

## Gaps worth closing

0. **Sources are paste-only.** No merge with Recents (known numbers get no
   name prefill, no memory that you know them), no picker, no dedupe signal.
1. **"Sent" is a lie.** *Open chat* marks sent before anything was sent.
   Slips and abandoned batches silently poison the follow-up engine (v4.0
   tasks/recurrence now remind you to chase people you never messaged).
2. **No pacing.** 40 back-to-back `wa.me` intents is exactly what the in-app
   warning says gets accounts restricted. No delay, no cooldown, no guidance.
3. **Skip is mute.** "Wrong number" and "ask me later" get the same "–",
   and neither feeds anything (mute/lost/retry).
4. **No undo.** One fat-finger on *Open chat* = wrong state, polluted Recents.
5. **Thin finish.** No retry of skipped, no task text on the batch
   follow-up (a context-less due date), no memory that a batch happened.
6. **Small correctness bugs.** Jumping to a `sent` row and tapping *Open chat*
   re-pushes the Recent and rewrites state; skips/opens leave no history.

## Proposed work

### Q0 — Sources: merge + picker

- **Auto-merge (default).** At queue start, every extracted number is looked
  up in Recents: known numbers get the saved name when the paste has none;
  the parse hint gains "k already known"; the run card shows a *known line*
  under the current contact (`In your follow-ups: Quoted · due Thu`) so you
  remember who you're refreshing before opening the chat. Render-time lookup
  — no schema change.
- **People picker.** "Add from your people" in setup opens a searchable
  multi-select sheet over Recents (label, number, status chip). **Add N to
  list** appends plain lines (`Name +number`) into the paste box. One
  pipeline: everything still flows text → extract → merge, so dedupe and
  country detection apply uniformly. Repeatable picks append.

### Q1 — Staged send (the truthfulness fix)

New status `opened` between `pending` and `sent`:

- *Open chat* (on a pending item) → status `opened`, open WhatsApp, **do not
  advance**.
- Returning, the action row reads **Sent ✓ / Skip** (Back stays). *Sent*
  confirms: `sent` + `at`, pushes the Recent, writes a `queue` history
  event, advances with an **Undo** toast (6 s, restores `opened` + position).
- *Skip* from `opened` behaves the same as from `pending` (Q3).
- Tapping *Open chat* on an already `sent`/`skipped` row re-opens the chat
  **without** touching state (fixes the re-push bug).
- Cost: +1 tap per contact (~30 s on a 50-batch) — the price of the FU
  engine never chasing ghosts.

### Q2 — Pacing

Pace control on the run card (`Off / 3 s / 8 s / 15 s`, persisted
`qc_qpace`, default **3 s**). Each *Open chat* fire locks the button for the
pace window with a visible countdown (`Open chat (7)`) — spaces the `wa.me`
intents, the single most effective in-app protection against WhatsApp
restriction. Plus a soft warning when a batch exceeds 25 numbers. UI timer
only; no native work.

### Q3 — Skip with reason

Skip opens a small sheet: **Wrong number / No answer — try later / Not
interested / Skip without reason**. Stored as `it.why`; shown as a tag on
skipped rows.

- `wrong` → excludes from retry **and** from batch follow-up; the skip toast
  offers a **Mark as lost** action (sets the matching Recent to `lost`).
- `no` → excludes from retry.
- `later` / empty → stays eligible for everything.

### Q4 — Undo

Undo toast (existing component, one action slot) after *Sent* and *Skip*
confirmations, restoring previous status + queue position.

### Q5 — Finish line

- **Resume n**: one button converting `opened` + retryable-skipped items
  back to `pending` (covers jumped-away opened items and try-later skips).
- **Task text on batch follow-up**: the 3d/1w row gains an optional task
  input; when filled, each sent contact's new due date carries `r.task`
  (plugs into v4.0's task-first follow-ups + `logEv(r,'task',…)`).
- **Batch memory**: on finish, `qc_qlast = {sent, skipped, at}`; per confirmed
  send, a weekly counter `qc_qweek = {wk: isoWeek, n}`. Setup card shows
  "Last batch: 38 sent · 4 skipped · 3 Nov" and "n sent this week".

### Q6 — Correctness + history

- Sent/skipped rows: reopen-only (no state rewrite, no Recent re-push).
- Every confirmed send writes `logEv(r,'queue',name)`; the contact card's
  timeline renders it ("Queue message sent").

## Non-goals (this round)

- Auto-send / delivery detection (no WhatsApp API — by design).
- Multi-queue management (one queue at a time stays).
- Per-item custom messages beyond `{name}` (richer personalization is 1:1
  chat territory).
- Cloud/multi-device queue sync (queue stays on-device).
- New permissions.

## Cross-cutting (every item)

- Arabic translations for all new strings at merge time, incl. `AR_RE`
  regex entries for interpolated toasts/hints.
- Pure helpers in a DOM-free `js/qutil.js` (`retryableSkipped`, `isoWeekKey`)
  with unit tests in `tools/queue_test.cjs` (same pattern as
  `ntfutil_test.cjs` / `norm_test.cjs`).
- No service-worker mirror needed (nothing here touches the periodic-sync
  path) — but `tools/build_sw.py` must still be re-run for the content hash.
- Version bump v5.0 with What's-new entries (en/ar).
- Emulator verification before push, per the v3.9–v4.0 routine.

## Suggested order

Q0 (sources) → Q1+Q4 (staged send + undo) → Q3 (reasons) → Q5 (finish) →
Q2 (pacing) → Q6 (fixes). Q0–Q1 share the render path; Q3–Q5 all touch the
action row and finish view.
