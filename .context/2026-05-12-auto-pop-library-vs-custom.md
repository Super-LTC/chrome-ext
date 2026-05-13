# Auto-Pop architecture: where we landed (revised) — note for backend

**From**: chrome-ext side
**Date**: 2026-05-12 (revised after seeing per-org variance live)
**Status**: extension-only changes, no backend work needed

---

## TL;DR — the thesis flipped

Initial reaction after watching nurses' mental model was "switch to library-linked stamping." We then pulled per-facility wizards from 4 orgs and the picture changed. **The right v0 architecture is the one you shipped: custom-text stamping with corpus-grounded shells that auto-fill blanks PCC leaves to the nurse.** What needs fixing is the **extension UX**, not the architecture.

Bottom line: backend work for v0.5 is **none**. All changes are extension-side.

---

## What we saw across 4 orgs

Library IDs, category IDs, and `stdNeedId`s are **all facility-scoped, not universal**:

| Org | "PCC default" library ID | Custom libraries | Category ID range |
|---|---|---|---|
| Bethesda (eac) | `8` | (none observed) | 3-digit (608, 347, 377) |
| Empire | `8` | `66` EMPC LIBRARY, `86` BASELINE ADMISSION | 3-digit (595, 615) |
| Eduro | `120` | `18/451` Eduro Nursing, `68` Eduro Activity, `211` *Dycora | 5-digit (89202, 89210) |
| (4th org) | (none — no "PCC DEFAULT") | granular per-domain libraries (`49 Activity`, `38 CAA Functional`, `39 Code Status`, `45 Cognition`…) | varies |

Notable:
- Eduro's "PCC DEFAULT LIBRARY" is `libraryId=120`, not `8`.
- `stdNeedId` is scoped to a facility's `(libraryId, diagcatId)` — not transferable across orgs.
- Some orgs have decomposed PCC's default library into ~30 granular libraries (one per domain).

**Implication**: a static mapping table from our `rule_id` → PCC IDs is impossible. We'd need either per-org scrape + semantic match (weeks of backend work, ongoing maintenance) or per-org manual mapping (high-touch onboarding). Neither is shippable in a sprint.

---

## What this means for your custom-text architecture

It was the right v0 call. Two reasons that hold up:

1. **Decoupled from per-org library variance.** Stamping `cp_description` as text works identically at Bethesda and Eduro. Library-linked stamping does not.
2. **Auto-fills the blanks PCC explicitly leaves to the nurse.** Real Eduro library focuses:
   ```
   "Communication with others in activities is impaired due to:"
   "Different interest in activities r/t"
   "Difficulty starting and staying involved in recreational activities as evidenced by:"
   "Displays inappropriate behavior during group activities exhibited by:"
   "Language barrier that prevents/hinders participation in activities.
    Primary Language: ________________"
   "Level of activity participation changes due to:"
   ```
   PCC ships these with **explicit blanks** — `r/t`, `due to:`, `as evidenced by:`, `exhibited by:`, literal `________________`. The nurse normally types after these. Our factor extractors fill them automatically (`r/t weakness, gait/balance, dementia`). **This is the value-add.** Library-linked stamping loses it entirely.

The "specifically non-specific" rule remains correct. The factor extractors remain correct. The 45 entries remain correct.

## What was wrong was the extension's UI

Three issues, all extension-side:

### 1. Textareas-by-default fight the value prop
A nurse who sees 10 focuses × 1 statement + 2 goals + 6 interventions = 90 textareas open by default infers "I'm supposed to edit all this." She isn't. The library is the shell; patient-specific stuff (drug names, doses, "2-person assist") gets added AFTER stamping in PCC's native UI — same as if she'd added the focus by hand.

**Fix**: collapse to a card view by default. Each focus shows a summary (include/skip toggle, focus statement preview, "2 goals · 6 interventions"). Expand-on-click reveals textareas for the rare case where she wants to edit before stamping.

### 2. No way to "add more" from PCC's actual library
Nurses' mental model is "pick from a list, check boxes." Our modal gives them our 10 auto-picks and that's it. If they want to add (say) a hospice focus or something facility-specific, they have to close our modal and use PCC's native wizard.

**Fix**: at modal-open, scrape this facility's `needwizard_rev.jsp` to discover its libraries + categories. Show an expandable "Browse PCC library" panel at the bottom of the modal. Nurse drills in, checks any standard focuses she wants to add, and they get queued for stamping. These ones stamp **library-linked** (`addNeed(stdNeedId)` chain) since we have the real IDs scoped to her session — no static mapping needed, no per-org backend work.

### 3. DNR/code_status picker is confusing
It substitutes `___` in the focus statement, but the substitution isn't prominent and nurses reasonably wonder "did I just update the resident's code status?" The answer is no — we documented an advance directive on the care plan; the resident's actual code status field is updated elsewhere.

**Fix**: add a one-line hint under the picker that says exactly this. Lock the focus textarea read-only once a code status is picked (so the substitution can't be accidentally clobbered).

---

## What the modal looks like after

```
┌──────────────────────────────────────────────┐
│ Auto-Populate Care Plan       lopez, paul  × │
├──────────────────────────────────────────────┤
│ FOCUSES (auto-picked)                        │
│                                              │
│ ✓ Falls      "Safety, potential for falls/   │
│              injury r/t weakness, dementia"  │
│              2 goals · 6 interventions  ▾    │
│                                              │
│ ✓ Skin       "Skin integrity at risk r/t     │
│              age, mobility deficit"          │
│              2 goals · 5 interventions  ▾    │
│                                              │
│ − Self-Care  ON PLAN ("Self-care deficit")   │
│              skipped — already on this plan  │
│                                              │
│ ... 7 more focuses                           │
│                                              │
├──────────────────────────────────────────────┤
│ BROWSE PCC LIBRARY  (add more focuses)    ▾  │
│   ▸ Library: HCG Care Plan Library           │
│   ▸ Library: PCC Default Library             │
│   ▸ Library: Activity                        │
│   ...                                        │
├──────────────────────────────────────────────┤
│ 9 of 10 focuses selected · 0 added from lib  │
│                              Cancel  Stamp 9 │
└──────────────────────────────────────────────┘
```

Clicking a focus row's `▾` expands to show textareas (current behavior). Clicking "Browse PCC library" expands a wizard-style browser: pick library → pick category → check focuses to add. Those get queued + stamped via PCC's wizard endpoints we've already mapped (`addNeed` → `etiologieswizard` → `neededit` chain).

---

## Concrete plan

All extension-side. No backend changes for v0.5.

1. **Collapse focuses to card view by default** (~2 hr). Existing edit pane stays — it's behind the expand toggle.
2. **DNR clarifying hint + lock focus text on pick** (~15 min).
3. **PCC library browser panel** (~3-4 hr).
   - Scrape libraries + categories at modal-open from this facility's wizard endpoints
   - Lazy-load focuses per category on expand
   - Checkbox UI; checked focuses join the stamp queue
4. **Library-linked stamp pipeline** (~2-3 hr).
   - For "browse-added" focuses, use `addNeed(stdNeedId)` → `etiologieswizard` → `neededit_rev` chain instead of `neededitcust_rev`
   - Our auto-picks keep using custom-text stamping (no change)
   - Hybrid stamp orchestrator handles both
5. **Polish**: progress UI updated for hybrid stamp; analytics events updated.

Total: ~1 day. Doable in a session.

---

## What we'd want from you eventually (not blocking)

- **Acknowledge the strategy** — we're keeping custom-text, fixing UX. No corpus changes needed.
- **Heads-up on placeholder patterns** — when authoring new library entries, the more explicit the trailing blank (`r/t`, `due to:`, the `___` literal), the more obvious it is what the nurse needs vs. what we filled. Maybe a soft convention.
- **Future v1+ thought**: per-org library scrape + semantic matching is still a worthwhile direction for "deep" library integration — but it's a research project, not a sprint task. We can punt indefinitely while custom-text + library-browse covers the workflow.

---

## What's actually in our code today (changing)

```
content/modules/care-plan-stamp/
├── CarePlanStampModal.jsx     ← refactor: card-view default, expand-to-edit, browse panel
├── pcc-stamp.js                ← extend: createCustomFocus stays + add createLibraryFocus chain
├── pcc-discover.js             ← extend: scrapeLibraryTree(patientId, careplanId)
├── stamp-api.js                ← no change
├── inject-button.js            ← no change
```

The 45-entry corpus library + factor extractors + `RULE_KEYWORDS` + `auditProposalAgainstExistingFocuses` all keep doing what they do.
