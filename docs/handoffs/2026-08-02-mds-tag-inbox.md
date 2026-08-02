# MDS tag inbox, facility switch and toast

> Backend lives in the **superltc repo** on branch `Superjonathan123/mds-comment-mentions`.
> Extension side is `Superjonathan123/mds-item-comments`. Neither is merged, and the
> backend must not merge before ~Aug 7 (it touches live triple-check code during the
> Garden Springs pilot).

## What this is

A regional looking at Skipped & Declined can now ask a named nurse about a specific
MDS item. That ask has to reach her, and she has to be able to get from the ask to
the actual MDS — which is usually in a building neither of them currently has open
in PCC. This is the extension half of that.

Three pieces:

1. **Inbox** — its own FAB launcher. Every MDS item conversation the user is in,
   across every building they can reach.
2. **Facility switch** — driving PCC's own facility chooser, because none of the
   direct approaches work (see below).
3. **Toast + badge** — announce a new ask once, count open ones until answered.

## API contract

### `GET /api/extension/mds/inbox?orgSlug=`

No `facilityName`. Scope is the whole organization; authorization is per-row inside
the service by intersecting the user's locations with the org.

```jsonc
{ "success": true, "rows": [{
  "threadKey": "asm_1|I0200|",        // assessmentId|mdsItem|mdsColumn
  "assessmentId": "asm_1",            // OURS
  "externalAssessmentId": "2266385",  // PCC's — for ESOLassessid
  "mdsItem": "I0200", "mdsColumn": "",
  "itemLabel": "I0200 Diabetes · 5-Day, ARD Jul 28",  // never contains a resident
  "patientLabel": "Ada Lovelace",     // auth-only; never in an email
  "pccPatientId": "9911",
  "locationId": "loc_2",
  "facilityName": "Oak Ridge Center",       // our display name
  "pccFacilityName": "Oak Ridge Center",    // what #pccFacLink will read
  "pccSystemId": "7",                       // switchToFacilityView(n) arg, may be null
  "messageCount": 3,
  "lastMessage": { "id": "c9", "userId": "u1", "authorName": "Dana", "message": "…", "createdAt": "…" },
  "awaitingMe": true,                 // unresolved assignment. Survives being read.
  "myAssignmentId": "m1",
  "askedByName": "Dana Whitfield",    // author of the ASSIGNING message, not the last one
  "unread": false                     // somebody else spoke since I last opened it
}]}
```

### `GET/POST /api/extension/mds/threads` — now accepts `assessmentId`

When present it wins outright and the PCC tuple is ignored. Inbox rows already name
an exact assessment, usually at a building the user is *not* looking at, so resolving
through `facilityName` would authorize against the wrong location. Access is checked
against the assessment's own facility instead.

### `GET /api/extension/notifications/summary` — three new fields

```jsonc
{ "actionCount": 3, "fyiUnseenCount": 1, "report24hUnseen": true,
  "mdsTagActionCount": 2,      // open assignments — CROSS-FACILITY
  "mdsTagUnreadCount": 1,      // threads with unread replies — CROSS-FACILITY
  "mdsTagToasts": [{ "key": "mds_assign:m1", "itemLabel": "…", "facilityName": "…", "taggerName": "Dana" }] }
```

Certs, queries and the 24h report stay facility-scoped. **MDS tags are not.** An
assignment does not stop mattering when you switch buildings, and a badge that went
quiet on switch would teach people the number is unreliable. They ride in separate
fields rather than being folded into `actionCount` so nobody later mistakes them for
facility-local work.

### New notification key kind: `mds_assign:{commentMentionId}`

⚠️ **This key drives the TOAST ONLY.** It answers "have we announced this out loud
yet", never "has this been dealt with". The ask stays in `mdsTagActionCount` and in
the inbox until it is answered. Wiring one key to both would let somebody clear an
open assignment by glancing at a toast — the exact behaviour reply-to-resolve exists
to prevent.

## The facility switch: why it looks like that

`content/modules/mds-comments/facility-switch.js` clicks PCC's header link, waits for
PCC to populate its own menu, then clicks a facility anchor. That is not laziness —
every direct approach is closed:

| Approach | Why it fails |
|---|---|
| Call `switchToFacilityView(3)` | Page global. We are ISOLATED-world. |
| Scan the DOM for facility anchors | `#pccFacMenu` ships **empty**. PCC `$.load()`s `/tools/faclist.jsp` into it on first click. |
| Fetch `faclist.jsp` and inject it | `innerHTML` does not run scripts, and `switchToFacilityView` is defined **by that response**. You get anchors calling a function nobody defined. |
| POST `facilityswitchajaxcontroller.xhtml` ourselves | Undocumented contract we would be guessing at, in a session we do not own. |

**Match on the name, not our id.** `pcc_system_id` is unique per PCC *tenant*, not per
organization — two customers can both legitimately have facility 3 (the AOM case). The
name in the menu PCC just rendered for *this* session is by construction the right
building. Our stored id is a tiebreaker only.

Never silent. Always behind an explicit "Open in PCC" click, and it always ends with a
verification that we landed where we meant to.

## The restore: do NOT copy `hydrateTwentyFourHourRestore`

That function deletes its payload the moment the current facility differs from the one
it was written at. Correct for the 24-hour report — that handoff never leaves a
building, so a mismatch means stale.

Here **a mismatch is the expected middle of the journey.** The whole point is to start
at building A and end at building B. The same rule would delete the payload every
single time the feature was used. It also drops the payload when the facility has not
resolved yet (PCC's header chrome is not guaranteed present when we run), turning a
race into a silent no-op.

`tag-restore.js` is a small state machine instead:

```
switch  → asked PCC to change buildings; poll #pccFacLink until it agrees (6s)
section → right building; navigate to section.xhtml?ESOLassessid=&sectioncode=
arrived → poll SuperOverlay.results (20s), scroll, highlight, open the thread
```

An unresolved header is "not yet", never "wrong". Every terminal failure toasts —
landing on the right page and silently doing nothing reads as the feature being broken.

The arrival polls `SuperOverlay.results` rather than hooking a repaint: the overlay's
scan finishes on its own schedule (it fetches section data first), so tying the handoff
to a render callback is a race we lose intermittently.

## Toast rules

Once ever, batched into one toast, auto-fades, no dismiss click. Re-showing on every
page load across a shift would be dozens of interruptions for the same three items.
Marked seen **after** it renders — marking first and failing to render would silently
eat the one announcement this ever gets.

## Not done

- **Read receipts are recorded but not shown.** `comment_thread_reads` has the data and
  `getThreadReaders` (source-agnostic, in `comment-thread-read.service.ts`) serves it.
  Nothing renders "read by John at 3pm" yet.
- **No badge polling.** Same gap the notification hub already had — the count is stale
  from FAB mount until something calls `updateMDSBadge()`. The 2026-06-02 design called
  for a focus-poll; still unbuilt.
- **Extension inbox is MDS-only.** UB-04 and 24-hour report mentions live in the web
  inbox at `/dashboard/inbox`; they would be dead ends inside PCC.
- **Nothing has run against a live PCC session.** Unit tests and the build pass, and
  the inbox panel was screenshotted through the real module, but the facility switch in
  particular has only been exercised against a synthetic chooser.

## Test path

1. Regional → Skipped & Declined → evidence modal → assign + message.
2. Sign in as the assignee, open PCC, open the FAB → **Inbox**.
3. Row should be under "Asked of you" with a facility pill if it is another building.
4. "Open in PCC" → PCC switches buildings → lands on the section → item highlights →
   thread opens.
5. "Reply & resolve" → row leaves "Asked of you", badge drops.

Failure modes worth distinguishing: an empty picker *with* an explanation is correct
(~19% of skipped items have no reachable author); an empty picker with *no* explanation
means the suggestion service threw.
