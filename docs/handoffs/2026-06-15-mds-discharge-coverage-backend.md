# Backend ask — interview-coverage correctness for DISCHARGE assessments

**Route:** `GET /api/extension/mds/interview-coverage`
**From:** chrome-ext (MDS interview auto-scheduler, on the New/Change MDS popup)
**Why now:** The popup lets nurses schedule **discharge** MDS assessments. Discharge requirements depend on the discharge type (A0310F), planned/unplanned (A0310G), and whether it's also a SNF Part A PPS discharge (A0310H). We need to confirm the route returns the **correct required interview set** for discharges — today the frontend can only *guess* a `description` string from the A0310 codes, and we're not sure the route maps that guess correctly.

---

## The problem

The popup never exposes a PCC "assessment description" string (like `"Medicare - 5 Day /"`) — it only exposes the **A0310 codes**. So the frontend *derives* a `description` from those codes and sends it. For scheduled assessments (5-Day / Quarterly / etc.) that's been fine. For **discharges** the requirement logic is more conditional (planned vs unplanned, PPS-discharge), so a wrong/unrecognized description string risks the route returning the wrong required interviews — a clinical-correctness bug.

Concrete case (the screenshot that prompted this): standalone OBRA discharge —
`A0310A=blank, A0310B=blank, A0310F=10 (return not anticipated), A0310G=1 (Planned), A0310H=No`.
Expected required interviews (per RAI): **BIMS + PHQ-9 + Pain + Section GG** (planned discharge → resident interviews are done). If unplanned (`A0310G=2`) it should be **GG only**.

---

## What the frontend sends today

For that case, the query is:
```
ardDate=2026-06-15
description=Discharge - return not anticipated      ← derived from A0310F=10
a0310g=1. Planned                                   ← derived from A0310G=1
a0310a=-1  a0310b=-1  a0310c=  a0310f=10            ← raw codes (forward-compat)
a0310gCode=1  a0310h=0                              ← NEW: now also sent (raw)
patientExternalId, facilityName, orgSlug
```

Frontend derivation (best-effort, `lib/coverage-query.js`):
| Field | Mapping |
|---|---|
| `description` (discharge) | A0310F=10 → `"Discharge - return not anticipated"` · 11 → `"Discharge - return anticipated"` · 12 → `"Death in Facility"` |
| `a0310g` | A0310G=1 → `"1. Planned"` · 2 → `"2. Unplanned"` · else omitted |
| raw codes | `a0310a/b/c/f` always; **now also `a0310gCode` (raw 1/2) and `a0310h` (raw 0/1)** |

---

## Questions to confirm / fix

1. **Discharge `description` strings.** Does the route recognize the three derived discharge strings above and map them to the correct requirements? If yes, list the exact strings you match on. **If no / fragile — strongly preferred:** determine discharge requirements directly from the **raw codes** `a0310f` + `a0310gCode` + `a0310h` (all now sent), so the frontend stops guessing description text. Same question applies generally, but discharge is where it bites first.

2. **Planned vs unplanned (A0310G).** Confirm: planned OBRA discharge (`A0310F=10/11`, `A0310G=1`) → BIMS + PHQ + Pain + GG; unplanned (`A0310G=2`) → **GG only**. Is the `"1. Planned"` / `"2. Unplanned"` string format what you expect, or should we send the raw `1`/`2` (we now send both)?

3. **A0310H — SNF Part A PPS Discharge.** Does a PPS Part A discharge change the required set (it collects Section GG discharge performance)? Should the route use `a0310h`? Edge to nail down: an **unplanned** OBRA discharge (GG-only) that is **also** a PPS discharge (`A0310H=1`) — is GG still the only requirement, or do interviews come back? We now send `a0310h`; tell us if/how you use it.

4. **Death in facility (A0310F=12).** Confirm → tracking, **no** interviews and no GG required (empty `interviews[]`).

5. **Standalone discharge** (`A0310A` and `A0310B` blank, only `A0310F` set). Confirm handled — the original coverage handoff says yes, but please confirm with the codes above, since `a0310a`/`a0310b` arrive as `-1` (PCC's blank-option value), not empty string.

6. **GG window on a discharge.** What window does GG use when the ARD is a discharge (vs the `ARD−2…ARD` used for non-PPS)? Confirm `recommendedScheduleDate` is still "do it by" = window end for discharges.

---

## The ask, in one line

Either (a) confirm our derived discharge `description` strings produce the correct required-interview set for all of {planned/unplanned × return-not-anticipated/anticipated/death × PPS-discharge yes/no}, **or** (b) switch the route to derive discharge requirements from the raw `a0310f` + `a0310gCode` + `a0310h` we now send — and reply with the authoritative input contract so we can drop the guessing.
