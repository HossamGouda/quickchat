# Multi-Inquiry per Contact — v6 Structural Plan (DRAFT 2026-11-06)

Status: plan only. No code until the user green-lights. This file is not committed.

## 1. Problem

Today one contact = one sales thread. The flattened "inquiry" state lives directly
on the contact record `r`: `status`, `value` (quote value), `valid` (quote valid
until), `lostWhy`, `outcome`, `seq` (message-sequence step), `vars` (template
variables). A customer who asks for two quotations overwrites the first:
quote value/validity, lost reason, sequence step, and per-message outcome all
get clobbered.

## 2. Coupling audit (why this is the structural anchor)

- Reads of `status/outcome/valid/lostWhy`: 188 matches across 9 files.
- Reads of `seq/value/isOpen`: 224 matches across 16 files.
- Hub functions:
  - `isOpen(r)` — followups.js:18 — `status!=='won'&&status!=='lost'` (open = contact shown in Follow).
  - `logOutcome(r,v)` — followups.js:576 — daily-once rule via `r.log` scan.
  - `cardHtml(r,...)` — followups.js:348 — one status row, one value/valid pair.
  - `contactToFields/contactFromRow` — syncmap.js:13/34 — 8 inquiry-ish fields on the wire.
  - `keep(r)` — recents.js:18 — trim/keep rule reads inquiry fields.
  - `doMerge` — followups.js:548 — field-by-field merge of two records.
  - statsutil.js — quote/expiring/value aggregates read `r.valid/r.value`.
  - queue.js — seq/status reads for chase messages; notify.js — due/notify logic.

Conclusion: rewriting every read site is not viable. The design must keep the
top-level fields as a **live mirror of the active inquiry** so ~95% of read
sites stay untouched, and concentrate the change on the much smaller set of
write sites plus new UI.

## 3. Data model

```js
r.inq = [ { id:'q1', label:'',           // optional short name, e.g. "5k units"
            status, value, valid, lostWhy, outcome, seq, vars } ]
r.act = 'q1'                              // id of the active inquiry (not index)
```

- **Inquiry-scoped** (move under `inq[]`): `status`, `value`, `valid`,
  `lostWhy`, `outcome`, `seq`, `vars`.
- **Contact-scoped** (stay on `r`): identity (`full/code/local/country/label`),
  `company`, `src`, scheduling (`due/dueTime/task/fuRepeat`), `dnc`, `muted`,
  `at`, `log` (event history, see §7), `_lu`, conflict `_conf`.
- **Mirror**: the active inquiry's seven fields are also written at top level of
  `r` on every switch/write. All existing read sites (card, lists, stats,
  queue, notify, search, sync export) keep working unchanged.

### 3.1 Module: `js/inq.js` (new, pure where possible)

- `inqEnsure(r)` — one-time migration: if `!r.inq && (r.status||r.value||r.valid||
  r.lostWhy||r.outcome||r.seq||Object.keys(r.vars||{}).length)` → build `inq[0]`
  from the top-level fields, `act='q1'`. Runs inside record normalization
  (same place `norm` runs — extend `tools/norm_test.cjs`).
- `inqGet(r)` → active inquiry object (creates `inq[0]` on demand for fresh
  contacts that get a status/value write).
- `inqSet(r, patch)` → write to active inquiry + refresh mirror + `r._lu`.
- `inqSwitch(r, id)` / `inqAdd(r, label?)` / `inqCloseWon/Lost handled via inqSet`.
- `hasOpenInq(r)` → `r.inq.some(i=>i.status!=='won'&&i.status!=='lost')`.
- Mirror self-check `inqCheck(r)` for tests: compares mirror vs active inquiry.

## 4. Write-site redirect (the real work — phase P1)

Every **write** to the seven fields routes through `inqSet`. Known write sites
to audit and redirect (grep each at implementation time):
- `setStatus` (followups.js), status chips in `cardHtml`, `cycleStatus`.
- `logOutcome` + `poSheet` handlers (followups.js:576–635) — incl. the daily-once
  rule, see §7.
- Quote value input + `valid` date input in the card (followups.js card section).
- `lostWhy` sheet write (followups.js:514–517).
- Sequence advance / `r.seq` readers-writers (templates.js chase flow, queue.js).
- `renderVars/applyVars` (`vars`) — templates.js.
- `doMerge` (followups.js:548) — merge rule becomes: concatenate `inq` arrays
  (dedupe by `id`, keep newer `_lu`... inquiries carry no own `_lu`; use
  contact `_lu` and prefer non-empty fields), active = winner's `act`.
- `keep(r)` (recents.js:18) — add `||r.inq?.length>1` so multi-inquiry contacts
  never auto-trim.

Rule: after P1, zero direct assignments to the seven fields outside `inq.js`.
Enforce by code-review checklist + a grep in CI (`tools/check_imports.cjs`-style
lint: `r\.(status|value|valid|lostWhy|outcome|seq|vars)\s*=` outside inq.js).

## 5. Sync (protocol v4)

Recommended minimal route: add ONE field to the contacts table,
`Inquiries` (longText) holding `JSON.stringify({inq, act})`.
- `EXTRA_CONTACT_FIELDS` gains `Inquiries:'longText'`; `contactToFields` writes
  it when `r.inq` exists; `contactFromRow` parses it (garbage → `inqEnsure`).
- `PROTOCOL_VERSION = 4`. Old app vs v4 cloud: refuses (already the rule) — user
  must update all devices, same as v3 rollout.
- Conflict granularity stays per-contact (newer `UpdatedAt` wins). Acceptable:
  inquiries mutate with contact activity; two devices editing two different
  inquiries of the same contact concurrently can lose one edit — document it.
  (Full per-inquiry rows = a new Teable table + match keys; defer unless the
  user syncs from two devices heavily.)
- Extend `tools/teable_e2e.cjs` with a multi-inquiry record round-trip.

## 6. UI (phase P3)

- **Card top**: an inquiry switcher — a horizontal chip row, one chip per
  inquiry (label or "Inquiry n"), active highlighted, trailing ＋ chip
  ("New inquiry"). Switching re-renders the card from the mirror.
- **New inquiry**: creates empty `inq` entry (status '' — treated as lead),
  switches to it. The OLD inquiry keeps its state untouched.
- **Card history**: log entries tagged with inquiry id; a small toggle
  "This inquiry / All" filters the visible history (default: this inquiry).
- **Follow tab**: contact appears if `hasOpenInq(r)` (replaces `isOpen` at the
  LIST level only; card internals still use the active inquiry). Row shows
  open-inquiry count when >1.
- **Outcome sheet**: unchanged shape; operates on active inquiry (see §7).
- **Stats**: keep reading the mirror (active inquiry) — no change in v1.
  (Aggregate-across-inquiries stats is a later enhancement.)
- All new strings need AR keys.

## 7. Semantics decisions (locked unless user objects)

1. **Outcome daily-once**: currently one `outcome` event per contact per day
   (logOutcome early-return). With inquiries: one per (contact, inquiry) per
   day — log events get a `q` tag (`{t, e:'outcome', v, q:'q2'}`), the
   daily check filters by active inquiry id. Sending about inquiry A in the
   morning still allows an outcome for inquiry B in the evening.
2. **Sequences (`r.seq`)**: per inquiry. Chase/queue messages continue to use
   the active inquiry's step (mirror makes existing readers correct).
3. **Closing**: `won`/`lost` closes the ACTIVE inquiry only. If other inquiries
   remain open the contact stays in Follow; when none are open it drops out.
4. **`value`/`valid` aggregates in stats/today card**: read active inquiry
   (mirror). A closed inquiry's expiring quote no longer nags unless it is
   active — acceptable for v1.
5. **Merge**: loser contact's inquiries are appended to winner (dedupe by id,
   re-key on collision), winner's `act` preserved.
6. **Deletion of an inquiry**: destructive, local-only, with undo toast —
  same pattern as contact delete; no tombstone (sync tombstones stay
  contact-level; the serialized `Inquiries` JSON carries the deletion).

## 8. Phases & estimates

| Phase | Work | Est. |
|---|---|---|
| P0 | `js/inq.js` + migration + unit tests (norm_test extensions) | 0.5 d |
| P1 | Redirect all write sites; mirror lint grep; full test chain | 1 d |
| P2 | Sync v4 (`Inquiries` field, protocol bump, e2e extension) | 0.5 d |
| P3 | Card switcher UI + history filter + Follow-tab count + AR | 1–2 d |
| P4 | Emulator/visual verification + WHATS_NEW + version bump | 0.5 d |

## 9. Risks & mitigations

- **Mirror divergence** (a missed write site mutates top-level while `inq[]`
  holds stale data): `inqSwitch` re-derives the mirror from `inq[]` on every
  switch, so divergence self-heals on switch; CI grep (§4) prevents new sites.
- **Migration of existing users**: `inqEnsure` is lazy per-record on load/save —
  no bulk migration, no sync storm. Mirror is already correct pre-migration.
- **Sync rollback danger**: an old device (protocol ≤3) must not sync against a
  v4 base — already enforced by the mismatch refusal; user updates all devices
  first (same as v3).
- **Size**: `Inquiries` JSON per contact stays small (few inquiries × small
  fields); `log` remains the big field (already capped at 40 events in merge,
  last-7-days semantics elsewhere).

## 10. Open questions for the user

1. Inquiry-scoped vs contact-scoped split in §3 — agree? (Especially:
   scheduling `due` stays contact-level: one follow-up slot per contact.)
2. Sync: minimal JSON-field route (§5) OK, or do you want full per-inquiry
   Teable rows now?
3. Should the outcome sheet ask "which inquiry was this about?" when a contact
   has >1 open inquiry and no active switch happened recently — or is
   always-active (last-touched inquiry) good enough for v1?
