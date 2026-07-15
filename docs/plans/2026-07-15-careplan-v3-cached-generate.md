# Care Plan V3 Cached Generate — Extension Integration (SUP-116)

**Goal:** Comprehensive mode consumes the V3 cached generate flow: the click renders
the deterministic plan in ~2s, a REAL percent bar tracks background AI authoring,
the polished content swaps into untouched rows when ready, and junk/under-synced
charts get a warning banner instead of silently reading "no gaps".

**Design (Option A, locked 7/15):** two data sources, married client-side.
- `/api/extension/care-plan/audit` (unchanged) — MEMBERSHIP: toAdd / toRemove /
  toCheck / onPlan / dropped, diffed against the existing plan via the backend's
  concept layer. The worklist renders from this immediately, exactly as today.
- `GET /api/extension/care-plan/generate?cache=1&mode=comprehensive` (new client) —
  AUTHORING: `authored` flag, `authoringProgress {done,total}`, polished
  `focuses[]` (goals/interventions selected + filled by the AI), `chartQuality`.
  Fired in parallel with the audit on modal open; polled every ~4s while
  `authored === false`; stops on modal close, mode flip, or a 90s cap.

Match key between the two payloads: `libraryStdId` (the PCC std id both carry —
SUP-54 stamping already keys on it). `fingerprint` changes mid-session mean the
chart moved — drop the poll result silently (next open regenerates).

**Failure floor:** if generate 409s (org not mapped), errors, or never authors,
the worklist is IDENTICAL to today — audit content, no bar, no banner. The
generate call can only add, never block.

## Backend contract (superltc `.context/careplan-ext-cache-contract.md`)
- miss → deterministic payload (authored:false) + ONE authoring job queued server-side
- hit → cached payload (<1s), authored flag says whether polish landed
- polling the same URL is a cheap cache read; double-open dedupes server-side
- `chartQuality` present ONLY when flags exist: no_active_dx |
  placeholder_dx_codes | no_orders_synced | no_coded_mds

## Tasks

### 1. `generate-api.js` — client (mirrors audit-api.js relay pattern)
`fetchGenerate({ patientId, orgSlug, facilityName })` → GET via API_REQUEST relay
with query string (small payload — no POST needed). Returns raw payload or throws
with `.status` (409 = org unmapped → caller disables the feature quietly).

### 2. `generateModel.js` — PURE model (vitest co-located)
- `authoringPct(progress)` → 0-100 | null
- `shouldPoll(state)` → authored=false && !error && elapsed < CAP
- `polishByStdId(genPayload)` → Map<libraryStdId, focus>
- `applyPolish(toAddItems, polishMap, touchedIds)` → items with polished
  focus content swapped in where (a) stdId matches, (b) row not in touchedIds.
  Returns { items, swappedCount }. NEVER mutates inputs.
- `chartQualityMessage(flags)` → one human sentence per flag, joined.

### 3. Modal wiring (`CarePlanStampModal.jsx`, comprehensive branch)
- Fire `fetchGenerate` in parallel with `fetchAudit` (Promise.allSettled-style:
  audit failure = modal error as today; generate failure = feature off).
- State: `genState = { payload, authored, progress, fingerprint, error }`.
- Poll loop in a `useEffect` keyed on (stage==='ready', mode==='comprehensive',
  genState.authored===false); interval ~4s; cleanup on unmount/mode flip;
  hard cap 90s. Fingerprint change between polls → stop + keep deterministic.
- On authored=true: compute touched rows (any ruleId with non-empty
  auditFocusStates edits or stamped/skipped) → applyPolish over audit.toAdd →
  setAudit with swapped content. Track swap in analytics.

### 4. Worklist UI (`AuditWorklist.jsx` + care-plan-stamp.css, `cpas-wl__` ns)
- Sticky-header strip while authoring: "✨ Polishing plan… {pct}%" with a thin
  progress bar (real % from authoringProgress; indeterminate shimmer when null).
- On swap: strip becomes "✨ Polished N focuses" for ~6s, then hides.
- `chartQuality` banner above the list (amber, dismissible): e.g. "No active
  orders are synced for this resident — order-driven focuses may be missing.
  The plan below is still safe to use."

### 5. Tests
- `generateModel.test.js`: pct math, poll-gate, stdId map, applyPolish
  (swap happy path, touched-row skip, missing stdId skip, no-mutation),
  chartQuality messages.
- Existing worklist tests stay green (`vitest run`).

## Don'ts
- Don't block the worklist render on the generate call — audit paints first.
- Don't swap content into a row the nurse touched (edits, stamps, skips).
- Don't surface a raw flag name to the nurse — always the human sentence.
- Don't keep polling after modal close / 90s / fingerprint change.

Closes SUP-116
