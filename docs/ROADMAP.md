# QuickChat — Essential Improvements Roadmap

Prioritized from "matters for daily use on the phone" down to "nice to have".
P0 = do first, P1 = next, P2 = later. No code yet — this is the plan.

> **Status (2026-10-31): all items implemented and deployed.**
> P0 #1–5 shipped in v3.2–3.3, P1 #6–10 in v3.4, P2 #11–14 in v3.5.
> Live at https://hossamgouda.github.io/quickchat

## P0 — Trust & daily-use essentials

### 1. Deploy so the phone can actually install it
Everything so far (SW, IDB, sync) only works over HTTPS with a real origin.
- Push to GitHub, enable GitHub Pages on `main` / root.
- First phone visit installs the PWA; SW precaches; Teable sync works on cellular.
- Effort: small. **This unlocks all real-world testing.**

### 2. Due-follow-up reminders (notifications)
The app's core value is follow-ups, but today it only shows a badge *when opened*.
- While app is open: Notification API, check due list every minute, notify.
- Android Chrome: Periodic Background Sync so reminders fire even when closed.
- iOS: limited (no periodic sync) — badge + due count on app icon via Badging API where supported.
- Also: schedule notification at the follow-up *time* (we already store DueTime).
- Effort: medium; biggest product win.

### 3. Sync v2: deletions + syncMeta
Known v1 limitation: deletions reappear from the other side.
- Tombstone strategy: `Deleted` checkbox + `DeletedAt` in Teable; syncMeta table
  holds per-device "last purge" markers. Realistically simpler: mark-deleted rows,
  hide in app, purge after 30 days.
- Use the (currently unused) SyncMeta table for sync cursor + protocol version.
- Effort: medium.

### 4. Arabic for the new UI + translation hygiene
Cloud-sync strings (and any v2 strings) are English-only today.
- Add AR keys for sync UI; audit for untranslated toasts (toast() bypasses the DOM observer).
- Longer term: move from English-sentence keys to stable keys + en/ar tables.
- Effort: small.

### 5. Passcode lock
Phone holds client names, quote values, notes. A lost phone = exposed pipeline.
- Simple 4-digit PIN (hashed) before app opens; stored in IDB; optional toggle.
- Effort: small; high peace-of-mind value.

## P1 — Product strength

### 6. Multi-device conflict surfacing
Last-write-wins silently today. Two phones editing the same contact can surprise.
- On conflict (both sides changed since last sync), prefer newer `_lu` but toast
  "3 contacts were updated from another device" + highlight in recents.
- Effort: small-medium.

### 7. Sync the rest of the state
Queue drafts, QR settings, language, country, and app preference aren't synced.
- Add a `Settings` row in SyncMeta (JSON blob) synced after contacts/templates.
- Effort: small.

### 8. First-sync semantics for legacy records
Records created before `_lu` existed fall back to `r.at` — an old record messaged
long ago can wrongly beat a fresh Teable edit.
- One-time backfill: set `_lu = max(r.at, qc_last_sync || 0)` on first sync v2 run.
- Effort: tiny, fold into #3.

### 9. Backup ↔ sync unification story
JSON file backup and Teable sync now coexist. Decide the narrative:
- Keep both (file = disaster recovery, Teable = live mirror) but make the Backup
  tab explain when to use which; add "Restore from Teable" (full pull, force-local).
- Effort: small UI + a force-pull mode in sync.js.

### 10. Pipeline analytics over time
Pipeline stats are point-in-time. Store monthly snapshots (won/lost/rate) —
either a `Snapshots` table in Teable or a local rolling array; render a 6-month trend.
- Effort: medium.

## P2 — Robustness & polish

### 11. Tests that run in CI
- Unit tests for pure functions: `normalize`, `extractNumbers`, `parse`, date helpers.
- Node-based (no browser): the tools/ stubs already prove the pattern.
- GitHub Action: syntax check + import check + eval smoke + e2e (e2e needs a token → use a restricted test token via repo secret, or skip e2e in CI).
- Effort: medium, mostly mechanical.

### 12. Boot failure surfacing
`boot().catch` logs to console only; a broken deploy shows a blank page.
- Show a visible "Update failed — clear site data or retry" card on boot error.
- Effort: tiny.

### 13. Manifest screenshots + richer install
Add 1–2 screenshots to the manifest for the richer Android install prompt.
- Effort: tiny.

### 14. Code-quality continuation
- `renderRecents` / `renderFollowups` / `renderFuPrompt` are still 40–60 lines
  (render + template string + branches). Split render vs row-builder.
- `recentClick` / `fuListClick` act-dispatchers: consider a registry map per
  action instead of if-chains (OCP).
- Effort: ongoing, low risk if behavior-preserving.

### 15. Sync protocol versioning
`sync-config.js` gets a `PROTOCOL_VERSION`; SyncMeta stores it; mismatched
clients refuse to sync rather than corrupt. Matters once 2+ devices run it.
- Effort: tiny; do with #3.

## Sequencing proposal
1 → 2 → (3+8+15 together) → 5 → 4 → 6/7/9 → the rest.

## Explicit non-goals (for now)
- Multi-user/team features, auth servers, WhatsApp Business API integration,
  CRM pipelines beyond current statuses, native app wrappers (Capacitor) —
  the PWA already covers the phone use-case.
