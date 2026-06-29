# I8000 Overlay — Chrome extension side (design + build notes)

Companion to the backend handoff
(`docs/plans/2026-06-28-section-i-i8000-overlay-contract.md`). Built 2026-06-28.

## What it does

On a PCC **Section I** MDS page, after the normal overlay renders, the extension
fetches `GET /api/extension/mds/sections/I/i8000?include=evidence` and draws two
surfaces:

1. **Inline audit badge** on each entered `#I8000{A–J}_wrapper` row, matched by
   `field`:
   - `agree` → green ✓ "Supported"
   - `disagree` → red ✗ "Weak evidence"
   - `outside_scope` → muted grey "Not a PDPM category" (de-emphasized; dominates)
2. **Suggestions banner** above the "Other" question group:
   "*N diagnoses could add X NTA points*", collapsed by default. Expands to a list
   of `suggestedMissing` (sorted by `ntaPoints` desc) with category · `+N NTA` ·
   status label (`Code it` / `Query needed`, from the shared `sectionIBadgeLabel`).

Both a badge and a suggestion row open a **view-only modal** that reuses the
popover CSS (`super-popover` / `super-backdrop`) for a native feel: status pill,
`+N NTA`, Dx/Tx lines, recommended ICD-10, collapsible rationale, read-only
evidence cards. **No coding/query action in v1** — view only, by request.

## Files

- `content/i8000-overlay/i8000-model.js` — **pure**: `buildI8000ViewModel(envelope)`
  + `auditBadge(verdict)`. Unit-tested (`__tests__/i8000-model.test.js`).
- `content/i8000-overlay/i8000-mock.js` — fixture envelope for preview.
- `content/mds-overlay.js` — DOM layer (search "I8000 Overlay"): `fetchI8000Data`,
  `runI8000Overlay`, `renderI8000AuditBadges`, `renderI8000Banner`,
  `showI8000Modal` + builders. Hooked into `initSuperOverlay` (section === 'I').
- `content/css/i8000-overlay.css` — banner, `super-badge--outside`, modal extras.
  Registered in `content/css-bootstrap.js`.
- `content/utils/analytics-schema.js` — added `i8000_audit_clicked`,
  `i8000_suggestion_clicked` (allowlist is mandatory or events drop).

## Preview before the endpoint deploys

Append **`?i8000=mock`** to the Section I page URL → `fetchI8000Data` returns the
fixture instead of calling the API. Lets you see both surfaces on a real PCC page
today. Remove the param (or it just falls through) once the backend branch
deploys; the live fetch then drives it. The fetch is wrapped so a 404 (undeployed
endpoint) or any error is swallowed — it never breaks the Section I page.

## Design decisions / trade-offs

- **`showPopover` was NOT reused** — it hard-requires agree/disagree/query action
  buttons and fetches evidence from the *section* endpoint. The I8000 modal is a
  dedicated, view-only renderer reusing the same CSS classes instead.
- **`?include=evidence`** so each `result` arrives with evidence inline — no lazy
  second fetch in v1.
- **Read-only evidence cards** (`renderI8000EvidenceCard`) rather than the
  popover's `renderEvidenceCard`, to avoid dead "View Administrations" clicks
  (split-view wiring is a later enhancement).

## Not done yet (follow-ups)

- Verify against the **live** endpoint once the backend branch deploys (only
  mock-verified so far).
- Deep evidence view (split-view PDF/note viewer) from the I8000 modal.
- "Add code" / "Send query" actions (intentionally view-only in v1).
- Demo parity (`demo/demo-mds-overlay*.js` has its own renderers).
