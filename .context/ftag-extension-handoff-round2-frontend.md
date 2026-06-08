# F-Tag Survey Readiness — Frontend Round-2 Handoff (2026-06-04 eve)

What the extension overlay now does after the second review pass, and the exact
backend contracts it depends on. Extends:
- `.context/ftag-extension-handoff.md` (base API surface)
- `.context/ftag-extension-handoff-review-fixes.md` (first review fixes)

**TL;DR for backend:** the frontend is done for this round. Four things are
needed server-side — an **unsnooze** endpoint, an optional **reopen** endpoint,
**`resolvedAt`/`resolvedBy` on resolved findings**, and confirmation that
**`status=snoozed`** returns snoozed rows with `snoozedUntil`. Everything else is
frontend-only and already shipped.

---

## 1. What shipped on the frontend (no backend needed)

- **Single flat, severity-ordered list** of `feed` (no tag grouping).
- **Compact cards strip on top** = overview + filter. Cards show the
  **plain-English tag name** (nurses don't know F-tag numbers) with the code
  small; clicking filters the list, `All` clears it.
- **Inline row actions** (no detail page): View source · Snooze · Add Prog Note · Resolve.
- **Resolve** is neutral (was an aggressive red); the confirm step is green.
- **Snooze** uses the standard clock icon + 3/7/30-day dropdown.
- **Source view** is a modal with a per-tag "what to look for" hint banner; MAR
  renders as a clean Date/Status/Detail/Staff table with flagged rows ringed.
- **Success animation**: row flashes green with a ✓ on resolve/snooze/note.
- **Two collapsed rails** beneath the list: *Recently resolved* and *Snoozed*.

### Progress-note flow (important behavior change)
"Add Prog Note" **no longer auto-resolves**. Sequence:
1. Click **Add Prog Note** → opens PCC's new-note screen in a **real new window**
   (`window.open(url, 'ftag_progress_note', 'popup,width…,height…')`, opened
   synchronously on click so it isn't popup-blocked; no `noopener`, so we keep
   the handle).
   URL: `{origin}/care/chart/ipn/newipn.jsp?ESOLclientid=<finding.pccPatientId>&res_pn=Y&ESOLpnid=-1`
2. We **poll `win.closed`**. The row's button turns **green "✓ Resolve"** with a
   sublabel: "writing…" while open → "note added" once closed.
3. The nurse **clicks the green Resolve** → `resolve` with
   `resolutionType: "progress_note"`. Explicit, never automatic.

Depends on `finding.pccPatientId` (already shipped, PR #578). Null → we skip the
window and let them resolve directly.

---

## 2. Backend asks

### 2.1 Unsnooze — NEEDED
Powers the **Unsnooze** button on the Snoozed rail. Frontend calls:

```
DELETE /api/extension/ftag-prevention/findings/[id]/snooze?facilityName=…&orgSlug=…
```
(Mirrors the QM board's `DELETE …/snooze` pattern.) No body. Should clear
`snoozedUntil` and return the finding to the open feed.
Response: `{ success: true, finding }`. 404 if missing / not at facility; 409 if
not currently snoozed is fine.

> If you'd rather expose `POST …/unsnooze` instead, tell me and I'll switch the
> verb — one-line change.

### 2.2 Reopen / un-resolve — OPTIONAL (requested by product)
Lets a nurse undo a resolution ("go back in the state"). Frontend is wired to:

```
POST /api/extension/ftag-prevention/findings/[id]/reopen?facilityName=…&orgSlug=…
```
Body: `{}`. Clears the resolution, returns the finding to open.
Response: `{ success: true, finding }`. If you don't build this, the call just
errors and we keep the button hidden — not blocking.

### 2.3 `resolvedAt` / `resolvedBy` on resolved findings — NEEDED for correctness
The *Recently resolved* rail shows **when it was resolved**. We read
`finding.resolvedAt` (fallback `updatedAt`) and `finding.resolvedBy`. Please make
sure `recentlyResolved[]` (and `status=resolved` findings) carry:
- `resolvedAt: string (ISO)` — when it closed
- `resolvedBy: string` — who/what (incl. `"auto"` for auto-resolve)
- `resolutionType: "resolved" | "no_action" | "progress_note" | "auto"` (already present)

Today some rows only have `updatedAt`, so the "resolved X ago" can be slightly off.

### 2.4 `status=snoozed` — CONFIRM (no new endpoint)
The Snoozed rail calls the existing feed with `status=snoozed`:

```
GET /api/extension/ftag-prevention/findings?status=snoozed&facilityName=…&orgSlug=…
```
Please confirm it returns `feed[]` of currently-snoozed findings, each carrying
**`snoozedUntil`** (and ideally `snoozedAt`, `snoozedBy`). We render the window
("until …") and the Unsnooze button from these.

---

## 3. Endpoints the frontend currently calls (full list)

| Method | Path | Purpose | Status |
|---|---|---|---|
| GET  | `/ftag-prevention/module-status` | per-facility gate | live (#576) |
| GET  | `/ftag-prevention/findings?status=open` | feed + recentlyResolved | live |
| GET  | `/ftag-prevention/findings?status=snoozed` | snoozed rail | **confirm §2.4** |
| GET  | `/ftag-prevention/findings/[id]/mar` | MAR/TAR source | live (#580) |
| GET  | `/extension/vitals` | vitals source (F580/F692) | live |
| POST | `/ftag-prevention/findings/[id]/resolve` | resolve / no_action / progress_note | live |
| POST | `/ftag-prevention/findings/[id]/snooze` | snooze 3/7/30 | live |
| DELETE | `/ftag-prevention/findings/[id]/snooze` | unsnooze | **NEEDED §2.1** |
| POST | `/ftag-prevention/findings/[id]/reopen` | un-resolve | **OPTIONAL §2.2** |

All take `?facilityName=&orgSlug=` and Bearer auth, same as every `/api/extension/*` route.

---

## 4. Open questions / notes

- **"Reuse the existing MAR/TAR viewer"** — there is **no separate MAR/TAR
  renderer in the extension repo**; the one in `modules/ftag-prevention` is the
  only one, now polished into a table. If a reusable viewer exists in the *web*
  repo it isn't reachable from the extension. Flag if I missed one here.
- **Older F684 rows with `source.kind: "none"`** — frontend treats F684/F697 as
  MAR-capable regardless (the `/mar` endpoint resolves the window anyway), so
  those still get a working source view. A re-detect/backfill to stamp
  `source.kind: "mar"` would be cleaner but isn't required.
- **`pccPatientId`** must be the PCC `ESOLclientid` (numeric) for the note
  deep-link to land on the right resident — confirmed present on live feed.

---

## 5. Frontend file map (this repo, for reference)

```
content/modules/ftag-prevention/
  FtagBoard.jsx                     root: summary · cards strip · list · rails · source modal
  hooks/
    useFtagFindings.js              open + snoozed feeds (parallel) + recentlyResolved
    useFtagActions.js               resolve / snooze / unsnooze / reopen
    useFindingMar.js                GET /findings/[id]/mar
    useVitals.js                    GET /extension/vitals
  components/
    CardsStrip.jsx                  compact overview + filter (plain tag names)
    FindingListRow.jsx              inline actions + note→resolve flow + success flash
    RecentlyHandled.jsx             Recently-resolved + Snoozed rails (unsnooze)
    SnoozeMenu.jsx                  clock icon + 3/7/30
    ResolveDialog.jsx               resolved / no_action + reason
    SourceModal.jsx                 evidence modal + "what to look for" hint
    sources/{SourceView,MarViewer,VitalsViewer,NotesViewer,OrderViewer}.jsx
  utils/{api,derive,ftags,source,pccLinks}.js
content/css/ftag-prevention.css
content/super-menu/fab.js           FAB + module-status gate
```
