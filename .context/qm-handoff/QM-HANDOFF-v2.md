# QM Chrome Extension — Handoff v2 (authoritative)

**Date:** 2026-06-11. **This supersedes `qm-extension-handoff-FINAL.md` and `qm-v2-whole-board-gap.md`** — use this one. It folds in everything: the lens, the whole-board filtering, the scope-aware modal, ordering, and what the first ext pass got wrong.

> **Read this first:** the ext is currently **one rebuild behind** the web. The web app (superapp, deployed) already does everything below. The backend is done — *all* of this is **client-side** off the existing responses. If something "doesn't filter," it's a frontend gap, not a data gap.

---

## 1. What to copy

This doc + these **pure, framework-free modules** (port near-verbatim; strip `@core` type imports, point at your local response-type copies). They hold *all* the logic — don't re-derive it:

| Module | Gives you |
|---|---|
| `qm-view-model.ts` | buckets, lens (`QmLens`, `measureInLens`, `rowForLens`, `crosserForLens`), `isFiveStarMds`, rates |
| `qm-tones.ts` | colors, dates, labels (`STATUS_BUCKET`, `prettyDate`, `fullName`, `crosserToDrill`, `entryUrgency`) |
| `qm-clinical-signals.ts` | Clinical Signals selectors (`signalResidents`, `actionableAlerts`, `qmStakes`, `alertName`, …) |
| `qip-programs.ts` | per-state QIP registry (`qipForState`, `qipMeasureSet`, `hasActiveQip`) — `qm-view-model` imports it |
| `qm-five-star.ts` *(optional)* | Five-Star points (`measurePoints`) — only if you show points |
| `clearability.ts` | `deriveClearability(actionType)` + `clearabilityHasLever()` — fallback for the new backend `clearability` field (see §6A) |

All are in this folder.

## 2. Endpoints (live; Bearer token; `?facilityName=&orgSlug=` on every one; responses wrap in `{success,data}`)

| Purpose | Endpoint | Returns |
|---|---|---|
| The board | `GET /api/extension/qm-planner/currently-triggering` | `QmCurrentlyTriggeringResponse` (now includes **`facilityState`**) |
| Day-101 crossers | `GET /api/extension/qm-planner/upcoming` | `QmUpcomingResponse` |
| Clinical Signals | `GET /api/extension/qm-planner/preventable-alerts` | `QmPreventableAlertsResponse` |
| Functional Decline | `GET /api/extension/qm-planner/gg-decline-dashboard&mode=qm\|therapy` | `GgDeclineDashboardResponse` |
| Signal snooze / un-snooze | `POST` / `DELETE /api/extension/patients/{id}/preventable-alert-snooze[/{snoozeId}]` | `{id,snoozedUntil,…}` |
| GG snooze / un-snooze | `POST` / `DELETE /api/extension/patients/{id}/gg-decline/snooze[/{snoozeId}]` | snooze (`snoozeId`) |

`patientId` in paths = internal Super-LTC id (not PCC).

## 3. Two mental models you must port (don't hand-roll)

**(a) Actionability buckets** — `statusBucketForRow` / `statusBucketForEntry` in `qm-view-model.ts`:

| Bucket | Meaning | Tone |
|---|---|---|
| **At risk** | a lever exists (`clearGuidance.actionType ∈ clinical/modification/dx_query`) **and** cliff near | rose |
| **Clearable** | a lever exists, runway still long | sky |
| **Will hit** | no lever this stay (time-only / stay-locked) — counts regardless | slate (FYI, not a to-do) |

**(b) The measure lens** — Five-Star / QIP / Both. `measureInLens(id, lens, state)`:
- **Five-Star** (default) → the 10 MDS Five-Star QMs (`isFiveStarMds`)
- **QIP** → this state's QIP set (`qipMeasureSet(state)`) — varies: OH=7, TX=10, GA=4, FL=9, AL=4, TN=3, **WI=none**
- **Both** → the union
- State-survey-only measures that are in neither (Depression, Antianx-Rate, Falls-Any, Behavior, Low-Risk-Incont, Bowel/Bladder) **never appear** under any lens.
- `state = data.facilityState`. Show the toggle only when `hasActiveQip(state)`.

---

## 4. 🚨 THE #1 RULE THE FIRST PASS GOT WRONG: the lens drives the WHOLE board

v1 only filtered the "By measure" tile grid — so the hero said "86 triggering" and "71 Clearable" on every lens, and the worklist/coming-soon/modals stayed full of Depression/Antianx noise. **Wrong.**

**Reduce every row + crosser to the lens BEFORE computing anything:**

```ts
const state    = data.facilityState;
const lensRows = data.patients.map(p => rowForLens(p, lens, state));      // measures filtered, triggeringCount recomputed
const crossers = upcoming.upcomingPatients
  .map(c => crosserForLens(c, lens, state))
  .filter(c => c.projectedHits.length > 0);
```

Then derive **everything** from `lensRows` / `crossers`:
- **Hero count** = `lensRows.filter(r => r.triggeringCount > 0).length` — **NOT** `summary.patientsWithTriggers`
- **At-risk / Clearable / Will-hit / Clear** segments → recompute from `lensRows`
- **Worklist rows + per-resident pills** → from `lensRows` (pills auto-filter; the row's `measures` are already lensed)
- **Coming soon** → the filtered `crossers`
- **Search** → same `lensRows` / `crossers`
- **Resident drill-in modal** → filter its measures too (see §5C)

A resident whose only triggers are state-noise **drops out** under Five-Star. Default = Five-Star, so the board declutters out of the box. **Toggle = client-side only; never re-fetch.**

---

## 5. Surfaces

### A. Command Center
- **Lens toggle:** a **prominent "Measure set" bar at the TOP of the board** (own row above the hero), active tab **filled** (sky=Five-Star / emerald=QIP / slate=Both). Not small pills in the tile header. Only when `hasActiveQip(state)`. Under QIP/Both, show `qipForState(state).programName` + a "clinical portion only" caveat when `clinicalShare !== 'all'`.
- **Hero:** lens-filtered triggering count (§4) + a lens badge; quarter-cliff countdown (`currentQuarterEnd`, `daysUntilQuarterEnd`; rose ≤14d / amber ≤30d / sky).
- **Status segments:** At risk / Clearable / Will hit / Clear (from `lensRows`); clicking filters the worklist.
- **Measure tiles:** the lens measures, sorted by `triggering`. Each: short label + code + **5★/state** tag + count + urgency dots + footer (actionability + `+N soon` + rate%).
- **Worklist** (order: **At risk → Coming soon → Clearable → Will hit → Clear**): each row = whole-row click → drill-in (no `scopeMeasureId`). Status dot + name + `stay·d{cdif}·payer·MDS {ARD}` + lensed pills. Crosser rows show a big days-until-crossing number.
  - **Per-measure clear chip (superapp PR #652):** in the **At-risk and Clearable** rows only, each measure pill gets a small **clear-timing chip** next to it — green **"Clear now"**, blue **"Clear {date}"**, slate **"Time-based" / "Stay-locked"** — so the nurse sees which can be ARD'd clean today vs which must wait, without opening each modal. Use the **same** `clearTiming(entry, patient, facilityDate)` helper (in `qm-tones.ts`) that the modal banner uses, so the row chip and the banner never disagree (`CLEAR_TONE[kind].badge` for the chip color, `.short` for the label). **Will-hit / Clear rows show no chip.** (This intentionally supersedes the old "no per-row info" note — it's per-measure clear timing, not the shared quarter cliff.)
- Resident name/ID **search**.

### B. Measure detail (one measure)
Rate %, num/den, quarter lock, **Five-Star points** (`measurePoints` — 10 MDS measures only), **What-if** switch (per-resident `Kept|Cleared`, crossers `Kept|Prevent`, reverts on toggle-off). Residents grouped by bucket + a violet "Going to trigger soon" group. Clicking a resident here opens the drill-in **scoped to this measure** (pass `scopeMeasureId = measureId` — see §5C).

- **🚨 Quarter-scope the crossers (superapp PR #654 — this gap exists in the ext too).** The day-101 crossing date (`hit.crossingDate`) has **no quarter awareness**, so a resident who reaches day-101 *after* the quarter locks was being shown in the current-quarter what-if — where they can't possibly count (e.g. crosses **Aug 2** under a panel that says **"Q2 locks Jun 30"**). Split the "Going to trigger soon" list with the pure helper:
  - `crosserCountsThisQuarter(hit.crossingDate, summary.currentQuarterEnd)` → **true** ⇒ keep in **"Going to trigger soon"** (sub: *"cross day-101 before {qLabel} locks"*).
  - **false** ⇒ move to a **de-emphasized "Crosses after {qLabel} locks"** group (slate dot, muted), sub *"counts in {`nextQuarterLabel(currentQuarterEnd)`} · today's rate unchanged"*. Keep the `Prevent` toggle (still a valid forward action) but never let it imply a current-quarter rate move.
- **🌱 Default-seed the what-if — narrow to FREE clears only (superapp PR #654 → corrected in #655).** Turning What-if **ON** may pre-check residents, but **only** ones whose trigger is a free coding fix — `reCodeClearableIds(data.patients, measureId)` (gated on `entry.clearGuidance?.actionType === 'modification'`). **Do NOT use `nextObraPreview.wouldClear`** — that flag is `true` on `actionType: 'clinical'` measures (antipsychotic, pressure ulcer) because it assumes the new MDS is coded clean (drug already d/c'd, wound already healed). Seeding on it pre-checks the clinical work as done and projects a fake 0%. No standard evaluator emits `modification`, so in practice **the seed is empty and what-if opens clean** — the nurse marks who they'll actually clear. `clinical` / `dx_query` / `time` / `stay_locked` triggers are never auto-resolved (manual toggle still allowed). Empty-state copy: *"Mark Cleared on residents you'll clear before the cliff — this models the rate only; the clinical work (d/c the drug, heal the wound, query a Dx) still has to happen first."* Helper is in the bundled `qm-view-model.ts`; `nextQuarterLabel` is in `qm-tones.ts`.

### C. Resident drill-in (centered modal) — lens-filtered AND scope-aware
- **Lens filter:** `patient.measures.filter(m => m.triggers && measureInLens(m.id, lens, state))`. A resident opened in Five-Star mode must **never** show their state-only measures.
- **Scope (superapp PR #652):**
  - Opened **from a measure** (measure-detail row, or a crosser within that measure) → **lead with that measure**; tuck the rest under a collapsed **"N other measures triggering for this resident"** accordion. Header: `<measure> · N others triggering`.
  - Opened **from the patient row** → show **all** (lens-filtered) at once, no accordion.
  - `primary = scopeMeasureId ? measures.filter(m=>m.id===scopeMeasureId) : measures; others = the rest`.
- **Per measure:** status chip + name + code + 5★, then —
  - **🔊 LOUD "clear timing" banner (superapp PR #652 → corrected in #656)** right under the measure name —
    the single most important fact, color-coded, not a grey footnote. **Key the label off `clearGuidance.actionType`, NOT off whether a cliff date exists** — a clinical measure's `earliestClearDate` is often "today" just because there's no MDS *coding* wait, but the wound still has to heal / the drug still has to be d/c'd. Use `clearTiming()` from the bundle:
    - **green · "Ready to clear now"** — ONLY `actionType === 'modification'` (a pure coding fix, no clinical change). No standard evaluator emits this, so green is rare. **Never** show green for a measure that's still clinically triggering.
    - **amber `conditional` · "Clears once resolved"** (chip "Needs clinical fix") — `actionType === 'clinical'`. Lead with the real gate (heal the ulcer, restorative ambulation, d/c the drug). This is the common case for pressure ulcer / walk-indep / weight-loss / PHQ-9.
    - **amber `conditional` · "Clears on a Dx query"** (chip "Needs Dx query") — `actionType === 'dx_query'` (catheter, antianxiety-use).
    - **slate · "Counts until {date}" / "Locked to this stay"** — time-based / stay-locked, no lever.
    - crossing → "Preventable before day-101" / "Carries over at day-101".
    - ⚠️ Do NOT resurrect the old "ARD a clean Quarterly/Annual today and it drops" copy or the `nextObraPreview.wouldClear` signal — both over-promise that the clinical work is free.
  - **render EVERY evidence row** (not just the first) with the coded ARD date prominent
    (`[mdsItem] = value`, "Coded on MDS {ARD}"; booleans via `displayMdsValue`) — this is how the nurse
    sees exclusions, e.g. antipsychotic emits `I6000 = No · No schizophrenia Dx coded`.
  - a small **"Counting now · {cliffInfo.cliffLabel}"** line (the cliff detail; the clear timing is the banner).
  - Footer: "View full MDS" + conditional "Send Dx query".

### D. Clinical Signals (Mode 0)
Breadcrumb + **Active | Snoozed** tabs. Helpers in `qm-clinical-signals.ts`. **Do NOT lens-filter this** — every signal (foley/antipsych/UA/UTI) maps to a Five-Star QM, always relevant.
- **Hero:** `{total}` signals + **clickable breakdown chips** (`{count} {type}`) that filter the list to that `alertId`; then the **stakes** block with a **What-if** switch (`qmStakes(data, summary, codedSet?)`).
- **Rows:** one line **per signal** — `alertName(a)` → QM, act-before-MDS/open-MDS badge, the **dated verb** (`signalDateVerb`: order→"started", diagnosis→"onset", note→"noted"), its own **Dismiss** (or Code/Skip in What-if). **The name header is a button → opens the AlertCard modal** (`onClick → setOpenId(patientId)`; the endpoint already returns everything the modal needs — if it doesn't open, you just didn't wire the click).
- **State naming (confidence ladder):** `uti_dx`→"UTI found" (rose); `ua_canary`→"Likely UTI" (abx, rose) / "UA only" (UA, amber) / "UTI noted" (note, amber); `foley_order`→"New Foley"; `antipsychotic_order`→"New Antipsychotic". **Color = confidence** (abx/diagnosed rose, UA/note amber) — old code had this inverted, don't.
- **Exclusions green:** `alert.exclusions.length > 0` → render green ("excluded · won't count" + `Excluded: {description} ({code}) · documented {date}`); excluded signals skip the What-if.
- **Order** (don't re-invent): residents = `signalResidents(data)` (actionable-count DESC; tiebreak lastName ASC — already from the API; add `localeCompare(lastName)` if your sort isn't stable). Signals within a resident = `actionableAlerts(p)` = `[...events, ...canaries]` minus suppressed/snoozed = `ALERT_ORDER`. `urgency` = color only, never order. Count with the suppressed/snooze filter or your numbers won't match.
- **Date nit:** show the signal date inline + readable (the first pass had "onset May 20" tiny/right-aligned).

### E. Functional Decline (its own FAB / screen)
`gg-decline-dashboard?mode=qm|therapy` → roster grouped by severity + mode toggle (Therapy Pickup / QM Decline) + search + snooze. Per-patient chart drill-in = `/gg-decline`; snooze id = `snooze.snoozeId`.

---

## 6. Payload reference

```ts
// currently-triggering → QmCurrentlyTriggeringResponse
{ patients: QmPatientRow[], summary, measuresEvaluated, generatedAt, facilityDate, facilityState }   // facilityState is NEW

// QmPatientRow → measures: QmMeasureEntry[] (when triggers===true):
cliffInfo?:   { cliffLabel, actionDeadline?, earliestClearDate?, daysUntilCliff, clearableBeforeCliff,
                urgency: 'at-risk'|'urgent'|'routine'|'stay-locked' }
clearGuidance?: { actionType: 'time'|'clinical'|'modification'|'dx_query'|'stay_locked'|'none',
                  clearDate?, clearsOnNextObra: boolean, actions: {label,detail?,effectiveDate?}[] }
clearability?: 'clear_now'|'needs_clinical'|'needs_query'|'time_based'|'stay_locked'|'none'  // NEW — see §6A
nextObraPreview: { wouldClear: measureId[], wouldNotClear: measureId[] }

// preventable-alerts → QmAlert
{ id, category:'event'|'canary', label, headline?, qmId,
  signals: {source:'order'|'note'|'diagnosis'|'vitals', date, text?, refId?, detail?}[],
  latestSignalDate, suppressedByExistingCoding, exclusions: {code,description,date|null}[],
  urgency:'high'|'medium'|'low', suggestedAction, snooze?: {id,snoozedUntil,…}|null }
```

### 6A. `clearability` — the backend "how does this clear" field (read this, don't re-derive)

The response now carries `clearability` on every triggering measure (superapp #657). **Prefer it; fall back to `deriveClearability(clearGuidance.actionType)` only when absent** (older responses):
```ts
const clr = entry.clearability ?? deriveClearability(entry.clearGuidance?.actionType);
```
- `clear_now` — pure coding fix (Modification). The ONLY genuine "Clear now" (green). Rare.
- `needs_clinical` — heal the ulcer / restore ambulation / d/c the drug. **Amber, NOT green.** Common.
- `needs_query` — physician Dx query + sign. Amber.
- `time_based` — ages out (UTI, falls). Slate.
- `stay_locked` — locked this stay. Slate.
- `none` — no path.

`clearabilityHasLever(clr)` (`clear_now|needs_clinical|needs_query`) = "a lever exists" — use it for any **"show me all clearable"** filter so you match the backend exactly.

**Beat-3 / clear-timing label — drive it off `clr`, NOT off dates** (`g=clearGuidance`, `c=cliffInfo`, `hasClearPath = !crossing && bucket!=='will_hit' && clearabilityHasLever(clr)`):
```
crossing                  → preventable? "Preventable before day-101" : "Carries over at day-101"
clr==='clear_now'         → green  "Ready to clear now"      (sub: re-code, then re-ARD)
clr==='needs_query'       → amber  "Clears on a Dx query"    (chip "Needs Dx query")
hasClearPath (clinical)   → amber  "Clears once resolved"    (chip "Needs clinical fix"; sub = g.actions[0].label)
clr==='stay_locked'       → slate  "Locked to this stay"
time_based & cliffType==='comparison' → slate "Clears at the next assessment" / chip "Next assessment"
                          (Walk-Indep, ADL Decline, Bowel/Bladder — they don't age out of a window;
                           the decline drops at the next target if the resident holds/improves)
else (Falls/UTI scan)     → slate  "Ages out of the window" ({clearDate} — counts until then)
```
⚠️ Do NOT key "now" off `earliestClearDate <= today` — a clinical measure's earliestClear is often *today* (no coding wait) even though the wound hasn't healed. Only `clear_now` is green.
```

## 7. Build order (each step shippable)
1. Port the 4 pure modules → unit-test against your fixtures.
2. **Lens drives the WHOLE board** (§4) — biggest fix; kills the "86 / 71 on every lens" bug.
3. Prominent top toggle (§5A).
4. Resident drill-in: lens filter + **scope-aware** + render all evidence rows (§5C).
5. Clinical Signals (§5D) — click-to-open, state naming/colors, exclusions-green, ordering, dismiss/snooze, what-if, filter chips.
6. Functional Decline FAB (§5E).

## 8. Gotchas
- `facilityName + orgSlug` on every endpoint; unwrap `{success,data}` once; `facilityDate` is facility-local.
- Lens, what-if, scope, dismiss = **all client-side**. Never re-fetch on a toggle.
- `category` is `'event'|'canary'` — route by `id`, not category.
- `source:'diagnosis'` signals are text-only (no evidence endpoint).
- Crossers (`upcoming`) are already exclusion-filtered server-side.
- WI (and any state where `hasActiveQip` is false) → no toggle, Five-Star only.
