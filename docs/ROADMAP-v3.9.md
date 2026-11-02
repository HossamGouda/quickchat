# QuickChat — v3.9 Plan: Notification System Enhancement

Follow-up on the completed v3.8 (notification center, actionable reminders,
native clipboard). This round deepens the reminder engine itself, guided by
what the code actually supports today. No code yet — this is the plan.

> **Status:** implemented 2026-11-02. All P0–P2 items shipped in v3.9 and
> verified on an API 35 emulator (notification with 3 snooze actions posted
> from a killed/backgrounded app; unit tests and CI green).
> Live: https://hossamgouda.github.io/quickchat · Native: Capacitor APK.

## What v3.8 left on the table

Reading `js/notify.js` and `js/core.js` after v3.8, these are the real gaps:

1. Snooze is hardcoded to exactly 1 hour (`capSnooze`, `36e5`), both as the
   native action button and the re-alert time.
2. An overdue reminder fires once (`markSeen` on first trigger) and then goes
   silent — an ignored follow-up is never nagged again until you open the app.
3. Notifications can fire at any hour; no quiet-hours concept.
4. 6 follow-ups due at 09:00 = 6 simultaneous OS notifications.
5. Tapping an OS notification just opens the app; it doesn't land on the
   contact or even the Follow-ups tab.
6. Capacitor `LocalNotifications` do **not** survive an Android reboot —
   scheduled alarms are lost until the app is opened again.
7. The bell's items navigate to a tab (`opts.tab`) but never to the specific
   contact that triggered the event.

## P0 — Reminder engine (the actual enhancement)

### 1. Snooze options
- Native actions become: **Done · 1 h · Tomorrow 09:00** (Capacitor supports
  3–4 actions per type; keep Done first).
- In the due-row and contact card, a snooze menu with 1 h / 3 h / tomorrow.
- Store snooze as `{full: untilTs}` (existing `qc_snoozed` shape — backward
  compatible; old numeric entries still read correctly).
- Effort: small-medium (touch `capRegisterActions`, `capSnooze`, UI rows).

### 2. Overdue re-nagging, politely
- If a follow-up is still due + open the next morning, re-notify once at 09:00.
- Guardrails so it never spams: max one re-nag per day per contact, recorded
  in a `qc_nag` map `{full: lastNagDate}`; stops entirely after the contact is
  done or the due date is moved.
- Applies to both the native path (re-schedule on app open / refresh) and the
  web path (`checkMissed`).
- Effort: medium.

### 3. Quiet hours
- Settings option (default 22:00–08:00): reminders that would fire inside the
  window shift to the window's end. Pure function on `notifyTimeRaw` — easy to
  unit-test in the existing tools/ harness.
- Effort: small.

### 4. Summary grouping
- If more than 3 follow-ups trigger at once, send one summary notification —
  "5 follow-ups due today" — tapping it opens the Follow-ups tab. Individual
  ones still appear in the bell.
- Effort: small.

## P1 — Reliability & reach

### 5. Survive reboot (native)
- Add a `BOOT_COMPLETED` receiver in the Android shell that re-runs the
  scheduling logic (reuse the same JS entry via a small plugin method or the
  existing `QCOpen` plugin pattern).
- Effort: medium; native-only, PWA unaffected.

### 6. Tap-through deep links
- OS notification tap → open the Follow-ups tab focused on that contact's card
  (`extra.full` already travels with every notification; wire the launch
  intent → `openCard`).
- Bell items get the same deep link (extend `notifyEvent` opts with `full`).
- Effort: small-medium.

### 7. Bell filters
- Kind chips above the bell list: All / Due / Sync / Backup — client-side
  filter over the stored events.
- Effort: tiny.

## P2 — Ship it clean

### 8. i18n + version
- Arabic keys for every new string; audit toasts (they bypass the DOM
  observer — pass keys through `tr()` at call sites, as v3.3 did).
- Bump `version.js` → v3.9 with a "What's new" entry.

### 9. Verification & release
- `tools/eval_smoke.cjs` + `check_imports.cjs` pass; add unit tests for the new
  pure helpers (snooze arithmetic, quiet-hours shift, nag guard) in the
  node-based harness.
- `npm run cap:sync`, rebuild APK, verify on the emulator: snooze actions,
  re-nag, quiet hours, reboot persistence, tap-through.
- Commit, push, confirm CI + Pages, tag v3.9.

## Sequencing

1 → 3 → 4 → 2 (pure-logic first, all unit-testable) → 6 → 7 → 8 → 9,
with 5 slotted in when the native build is open anyway.

## Explicit non-goals (for now)

- Push notifications / any server component — local scheduling only.
- Per-contact custom sounds or channels.
- Home-screen widgets, Android shortcuts, Wear OS.
- WhatsApp Business API integration.
