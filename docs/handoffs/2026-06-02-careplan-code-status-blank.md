# Backend handoff — Care Plan "Code Status" stamps a raw `___` (saved as `_` in PCC)

**Date:** 2026-06-02
**Area:** Care Plan Auto-Pop proposal (`POST /api/extension/care-plan/auto-pop`)
**Severity:** Medium — produces a malformed focus on the resident's live care plan
**Status:** Extension-side guard shipped (surfaces + blocks the blank). **Root cause is backend — needs a data fix.**

---

## Symptom (what the nurse sees)

On the **Code Status** focus, the focus statement is:

> Resident has an established advance directive: **___**

The `___` is a fill-in-the-blank the nurse is supposed to complete (the actual
directive / code status). Today it slips through the wizard unflagged, gets
stamped as-is, and **PCC saves it to the care plan as a single `_`** (PCC trims/
collapses the underscores on save). The resident ends up with a meaningless
"advance directive: _" focus.

---

## Root cause — the blank is the wrong segment kind

The proposal payload carries each focus as `description` + `descriptionSegments`.
The extension renders/edits via the segments. A fillable blank is supposed to be
a **token** segment:

```jsonc
{ "kind": "token", "tokenKey": "code_status", "needsFilling": true, "value": "___" }
```

When a segment is a token with `needsFilling: true`, the extension:
1. renders an **input** (free-text box or picker chip) for the nurse, and
2. **blocks stamping** until it's filled (the "⚠ needs input" gate).

But for the advance-directive line, the backend is emitting the blank **inside a
plain text segment** instead:

```jsonc
// what we're getting (BAD) — every segment is kind:"text", the "___" is just literal text
{
  "description": "Resident has an established advance directive: ___",
  "descriptionSegments": [
    { "kind": "text", "value": "Resident has an established advance directive: ___" }
  ]
}
```

Because it's a `kind:"text"` segment, the extension has no idea it's a blank:
no input is rendered, the needs-input gate doesn't fire, and the literal `___`
gets stamped. (Confirmed: the example payload the nurse pasted shows every
segment as `kind:"text"`.)

---

## The fix we need from the backend

Emit the advance-directive blank as a **fillable segment**, one of:

**Option A — free-text token (minimum fix):**
```jsonc
{
  "descriptionSegments": [
    { "kind": "text",  "value": "Resident has an established advance directive: " },
    { "kind": "token", "tokenKey": "advance_directive", "needsFilling": true, "value": "___",
      "placeholder": "e.g. DNR, Full Code, DNI, Comfort Care" }
  ]
}
```

**Option B — code-status dropdown (preferred for this field):** same shape but
with an enumerated option set so the nurse picks instead of typing
(Full Code / DNR / DNI / Comfort Care / DNH …). This is the highest-quality fix —
code status is a closed vocabulary and free text invites typos/abbreviation drift.

Either way: the blank must be a `token` segment with `needsFilling: true`, **not**
text. Same goes for any other focus that bakes a `___` / `(SPECIFY)` / trailing-
colon blank into a text segment — those will now be blocked by the guard (below).

---

## What the extension already does (so the bug stops shipping silently)

As of this change the extension treats a residual underscore blank (`/_{3,}/`)
in a composed focus **description** as "needs input" **regardless of segment
kind** — previously the check was guarded behind "has no segments", which is
exactly why the all-text code-status focus slipped through. See
`content/modules/care-plan-stamp/CarePlanStampModal.jsx`:

- new helper `_descNeedsInput(description, descriptionSegments)`
- wired into the Initial-flow needs-input gate, the FocusList sort/badge, and the
  three Comprehensive (audit) gates.

Effect: the Code Status focus now shows **⚠ needs input**, the "Add all" and
"Add this one" buttons are **disabled** for it, and the nurse can fill it via the
manual free-text edit (✎) before stamping. **This is a safety net, not the cure** —
without a real input/picker the nurse still has to hand-edit. The clean UX
(rendered input or dropdown) only happens once the backend emits a proper token
segment per above.

---

## Repro / verification

1. Open Care Plan Auto-Pop on a resident where Code Status is proposed.
2. **Before backend fix:** Code Status now shows "⚠ needs input"; Add buttons
   disabled until the nurse manually edits the `___` out.
3. **After backend fix (Option A/B):** the advance-directive blank renders as an
   input/picker; filling it clears the gate and stamps the real value — no `_`
   lands in PCC.

**Backend checklist:**
- [ ] Find the focus template/rule for `universal.code_status` (advance-directive line).
- [ ] Split the `___` out of the text segment into a `kind:"token"`,
      `needsFilling:true` segment (Option A) or a dropdown-backed token (Option B).
- [ ] Audit other focus templates for `___` / `(SPECIFY)` / trailing-colon blanks
      embedded in `kind:"text"` segments — same class of bug.
