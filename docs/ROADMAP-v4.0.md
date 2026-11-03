# QuickChat — v4.0 Plan: Follow-ups Deep-Polish

Follow-up on v3.9–v3.12 (reminder engine, contacts integration). This round is
about the **Follow-ups tab**: making it a real lightweight sales pipeline,
not just a due-date list. Brainstormed from a full read of
`js/followups.js`, `js/notify.js`, `js/queue.js`, and the v3.9 notification
work. No code yet — this is the plan.

> **Status:** planned 2026-11-04. Awaiting prioritization.
> Live: https://hossamgouda.github.io/quickchat · Native: Capacitor APK.

## What the section does today (ground truth)

- **Active view**: three flat lists — *Due* (today/overdue, sorted by
  date+time), *Upcoming*, *Messaged, no reminder yet* (with 3-day / 1-week
  quick buttons, capped at 15 rows).
- **Contact card** (`fuPrompt`): name, status chips (quoted/waiting/won/lost),
  due chips (Tomorrow / 3d / 1w + date & time pickers), optional Google
  Calendar link (with `?fu=` deep link back into the app), quote value (SAR),
  per-contact message, note, history timeline, "Follow up now".
- **Filter view**: status buckets (active/quoted/waiting/won/lost/all) with
  live search over name/note/number.
- **Pipeline stats**: open quotes + value, won this month + value, win rate,
  rolling 6-month snapshot trend.
- **Reminder engine (v3.9)**: snooze 1h/3h/tomorrow, quiet hours, daily 9:00
  re-nag for overdue, >3-due summary grouping, tap-through to card, bell
  filters.

## Gaps worth closing

0. **Follow-ups are implicitly sales-only.** Every surface assumes a quote:
   value in SAR, statuses quoted/waiting/won/lost, stats about win rate. But
   most real follow-ups are *tasks*: "QC owes me the material test
   certificate", "waiting on the PM to approve the drawing", "send the
   passport copy to the logistics agent". The card has a Note and a
   Message, but no first-class **task** — nothing that says what this
   follow-up is *for* — and you can only create a follow-up for someone
   already in Recents (i.e. someone you messaged from the Chat tab first).
   Real workflows are also **chained**: the certificate example is two jobs
   — (1) request from QC, (2) forward to the client — and today nothing
   links them.

1. **No recurrence.** "Done" clears `r.due` — a deal waiting on a customer
   who replies "call me next week" needs a manual re-set every time. The log
   shows due-set/cleared events, but nothing repeats.
2. **Snooze is short-horizon only.** 1h / 3h / tomorrow 9:00. "Snooze until
   Thursday" or "next Sunday" is impossible without opening the card.
3. **No bulk handling of a busy morning.** Ten due contacts = ten individual
   taps. No select-and-act.
4. **Done is a dead end.** No undo (the toast component already supports
   action buttons — unused here), and no "done, and remind me again in X".
5. **Due list is flat.** Everything today reads the same whether it is 4 days
   overdue or due at 18:00 tonight.
6. **Quick-set chips are inconsistent.** "No reminder" rows offer 3d/1w but
   not Tomorrow; the card offers Tomorrow/3d/1w but no 2-week or custom
   quick interval.
7. **No per-contact reminder mute.** Some contacts should never nag (closed
   deals you keep for history, wrong numbers).
8. **No direct call/copy from the card.** Two taps exist for WhatsApp but not
   for `tel:` or copying the number.
9. **Time changes are silent.** `fpTime` changes don't write a history entry.
10. **Stats don't measure follow-up discipline.** Win rate exists, but
    "follow-ups completed this week" / "overdue streak" — the behaviors the
    app is supposed to drive — are invisible.

## Proposed work

### P0 — functional depth

**F0. General/custom follow-ups (not just quotations).**
The headline item — re-frames the section from "deal tracker" to
"anything I owe or am waiting for".

- **Task text becomes first-class.** New field `r.task` (short, e.g. "Get
  material test certificate from QC"). Shown as the row's primary line
  under the name on Due/Upcoming lists, editable in the card above the
  note ("What is this follow-up for?"). Statuses and SAR value stay
  optional — a task follow-up has no value and needs no status beyond
  open/done.
- **Create a follow-up for anyone, from the Follow-ups tab.** The contacts
  icon (same picker built for the Chat tab) moves into the Follow-ups
  header; picking a contact there opens a **New follow-up** sheet: name and
  number prefilled, task text, due date chips (+ time), save. Creates the
  recents entry with `due` set — no WhatsApp message required first.
- **Chained next steps.** On Done (and on the notification "Mark done"
  action), an optional toast action **"Next step…"** opens the same sheet
  pre-filled: the *other* contact can be picked from the same picker, task
  text pre-drafted from the completed one ("Send certificate to PM —
  Al Noor project"). This covers the two-job certificate flow end to end
  without a dependency-graph engine: the chain is just "done → prompted to
  create the linked follow-up".
- **"Waiting on someone" is a first-class use.** The existing `waiting`
  status already means it; F0 makes it usable without a quote attached,
  and the task text carries who/what you're waiting for.

**F1. Recurring follow-ups (repeat interval).**
`r.fuRepeat ∈ {none,3d,1w,2w,1m}` set on the card (small select beside the
due chips). When a follow-up fires/is Done, if `fuRepeat` is set the next
due is auto-computed (`today + interval`, same `dueTime`) and a toast says
"Next follow-up: Thu 12/4". `fudone` handler and the notification "Mark
done" action both route through one helper so native + web stay in sync.
Log event `repeat` for the timeline. ~Small schema addition, no migration
needed (absent = none).

**F2. Custom snooze date.**
Extend the v3.9 snooze sheet with a "Pick date & time" row that expands two
inputs (`<input type="date">` min tomorrow, `<input type="time">`) plus
Confirm. Stores in the existing `qc_snz` shape — the engine needs no change,
only new options in `snoozeUntilMs` inputs. Pure-helper + sheet change only.

**F3. Batch actions on the Due list.**
Enter/select mode via a long-press on a row or a "Select" button in the Due
header → checkboxes appear on due rows → sticky action bar with:
*Snooze to tomorrow* · *Done* · *Set date…*. All route through existing
single-contact helpers in a loop; one save at the end; one summary toast
("5 snoozed to tomorrow"). Selection state lives in a module-local Set, not
persisted.

### P1 — interaction polish

**F4. Undo for Done and status changes.**
`setDueVal(r,'')` from Done and `cycleStatus` wrap in an undoable action:
toast with an **Undo** button (toast component already supports
`{action:{label,fn}}`) restoring due+time / previous status within ~6 s.

**F5. Grouped Due list.**
Section headers inside the Due list: *Overdue (n)*, *Today (n)*, *Tomorrow
(n)*, *Later this week (n)* — each sorted by time. Pure re-render of the
same data; `dayDiff` already gives the buckets.

**F6. Consistent quick-set chips.**
"No reminder" rows gain **Tomorrow**; the card gains **2 weeks**; both use
the same chip order (Tomorrow · 3 days · 1 week · 2 weeks).

**F7. Per-contact reminder mute.**
Toggle on the card ("Reminders: on/off" — visual switch). Muted contacts
are skipped by `notify.js`/`sw.js` scan loops (same guard shape as
`status==='won'` skips) and excluded from the >3 summary count. Stored as
`r.muted`, synced through existing recents save.

**F8. Card quick actions: Call + Copy number.**
Two small icon buttons on the card beside the number: `tel:+full` anchor
and clipboard write with the existing fallback toast.

**F9. Log time changes.**
`fpTime` change writes `logEv(r,'due',r.due+' '+t)`-style entry — actually a
new `time` event: `Follow-up time: HH:MM`. Timeline only.

### P2 — measurement & native depth

**F10. Follow-up discipline stats.**
Extend the pipeline strip with one computed stat: *Follow-ups done this
week* (count `done` log events in the trailing 7 days). Cheap: count during
`renderPipeline`; no new storage.

**F11. Exact-time native alarm on the due day.**
Today native reminders re-nag at 9:00 daily. Enhancement: when a contact has
`dueTime`, schedule one exact alarm at `due + dueTime` via the existing
`LocalNotifications.schedule` path (SCHEDULE_EXACT_ALARM is already granted
in v3.9 testing). Falls back to the daily nag when exact alarms are denied.
Guard against duplicates using the existing `qc_notified` map keyed by
`full+due+time`.

## Non-goals (this round)

- Push server / multi-device reminder sync (cloud sync stays data-only).
- Kanban drag-and-drop pipeline view (filter view + stats cover it).
- Auto-detecting customer replies (no WhatsApp API access — by design).
- Queue rework — separate plan after this lands.
- New permissions.

## Cross-cutting (every item)

- Arabic translations for all new strings at merge time, incl. regex entries
  for interpolated toasts.
- Unit tests in `tools/` for every pure helper (interval math, snooze
  options, bucket assignment) — same pattern as `ntfutil_test.cjs` /
  `norm_test.cjs`.
- Service-worker mirror in `sw.js` template (`tools/build_sw.py`) for any
  behavior the periodic-sync path replicates (F1, F7).
- Version bump v4.0 with What's-new entries.
- Emulator verification for native paths (F1 done-action, F7 mute, F11
  exact alarm) before push, per the v3.9–v3.12 routine.

## Suggested order

F0 → F1 → F4 → F5 → F6 (one focused release: "follow-ups for anything you
owe or are waiting for"), then F2 → F3 → F7 → F8 → F9, then F10 → F11.
F0+F1+F4+F5+F6 are all small, user-visible every day, and share the
due-list render path; F0 also unlocks the contacts-picker reuse the same
way v3.10–v3.12 did for the Chat tab.
