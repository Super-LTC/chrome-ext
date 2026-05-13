# Backend handoff: JIT patient stub for Care Plan Auto-Pop

**Date:** 2026-05-12
**From:** Chrome extension side (Care Plan Auto-Pop is v0.6, end-to-end verified in PCC against `clientid=923145`)
**Decision needed:** how should the backend treat the PCC `clientid` the extension sends in `/api/extension/care-plan/auto-pop` requests?

## TL;DR — please ship Option B (JIT stub)

The extension sends the PCC `clientid` (e.g. `"923145"`) as `patientId` in the request body. That IS the stable identifier — same number every visit, scoped to the org. The question is what the backend does with it server-side.

**Decision: B. JIT stub.** First request for a never-seen `(orgId, externalPatientId)` pair creates a minimal `patients` row. Future requests resolve via DB. Real PCC patient sync (when it runs later) upserts on `(organization_id, external_patient_id)` unique index and fills in DOB/physician/etc.

## Why B over A or C

| | A: Pass-through | **B: JIT stub** | C: Force sync first |
|---|---|---|---|
| DB writes | None | 1 row, once | Full patient sync |
| Returns real `patient.id`? | No | **Yes** | Yes |
| Telemetry/audit anchor | Broken until sync | **Works day 1** | Works |
| Latency added | 0ms | ~10ms (1 insert) | 15–30s (PCC API) |
| Failure modes | None | Insert race (handle via unique idx) | PCC API rate limits, network |

A is too thin (no internal `patient.id` means we can't hang PostHog events, audit re-runs, or future re-stamps on this patient until sync catches up). C is too heavy (sync isn't reliable enough to gate the modal on it; nurse would wait 30s). B is the goldilocks.

## What the extension sends today

```json
POST /api/extension/care-plan/auto-pop
{
  "patientId": "923145",                            // PCC clientid — THE link
  "orgSlug": "gardenmeadow",
  "facilityName": "Gardensprings Bethesda",         // PCC facility name string
  "scope": "initial",
  "patientName": "DO NOT USE lopez, paul (6306)",   // scraped from PCC page header
  "activeDx": [],                                   // optional, can be empty
  "activeOrders": [],                               // optional, can be empty
  "existingFocusTexts": []                          // for alreadyOnPlan keyword matching
}
```

## Backend flow we want

```ts
// 1. Access check (unchanged): org + facility + user permission
const org = await getBySlug(orgSlug);
const location = await getByPccFacilityName(facilityName, org.id);
const hasAccess = await userHasAccessToLocation(userId, location.id);

// 2. Resolve OR create-stub the patient
let patient = await PatientService.getPatientByExternalId(org.id, patientId);
if (!patient) {
  patient = await PatientService.createStubFromExtension({
    organizationId: org.id,
    locationId: location.id,
    externalPatientId: patientId,                   // "923145"
    name: patientName ?? `Patient ${patientId}`,
    admissionDate: new Date(),
    // Mark so the web app can label it "syncing…" until real sync fills it in
    isExtensionStub: true,
  });
}

// 3. Build proposal context — prefer body-provided over DB
const ctx = {
  patientId: patient.id,                            // ← internal UUID, our anchor
  patientName: patient.name,
  activeDx: body.activeDx ?? loadDxFromDb(patient.id),
  activeOrders: body.activeOrders ?? loadOrdersFromDb(patient.id),
  existingFocusTexts: body.existingFocusTexts,
};

// 4. Run the proposal as today
const proposal = buildAutoPopProposal(ctx, { scope: body.scope });

// 5. Return — but keep PCC clientid out of the response shape for stamping.
//    The extension already overrides proposal.patientId with the PCC clientid
//    from the URL (we got bit by this in v0.5). Just don't put the internal
//    UUID where the extension would use it for PCC POSTs.
return {
  patientId: patient.id,                            // internal UUID, for telemetry
  focuses: proposal.focuses,
  // ...
};
```

## DB requirement (probably already in place)

```sql
ALTER TABLE patients
  ADD CONSTRAINT patients_org_external_unique
  UNIQUE (organization_id, external_patient_id);
```

This is what makes JIT stub safe. Two simultaneous first-time requests can both try to insert; one wins, the other catches the unique violation and re-selects. Standard upsert pattern.

## Schema flag worth adding

`patients.is_extension_stub BOOLEAN DEFAULT FALSE` (or `last_synced_at IS NULL` as proxy). When the regular PCC patient sync runs, it sets this to false (or fills `last_synced_at`). Web app patient list can show "syncing…" pill on stubs. **Optional, can defer.**

## Stamping path — unchanged on backend side

The extension does NOT use the backend's response `patientId` when POSTing to PCC's JSP endpoints. It uses the PCC `clientid` straight from the URL (we got burned by this in v0.5 when backend returned the internal UUID and PCC rejected the stamp with HTTP 555). So whatever you return for `patientId` is fine — the extension uses it only for telemetry.

## Telemetry/audit gains (what this unlocks day 1)

- **PostHog**: events `care_plan_autopop_*` already fire with `patient_id` set to PCC clientid. Now we can join to `patients.external_patient_id` cleanly. Also let us pass through `internal_patient_id` for direct joins.
- **Re-stamp / multi-session**: nurse opens the modal a second time tomorrow → same `patient.id` resolves → alreadyOnPlan can later be enriched server-side using stored history.
- **Audit-on-stamp**: when coverage AI is ready, we can `auditFromCoverage(patient.id)` after a stamp. The stub row makes that wire-able now even if the audit logic comes later.

## Non-goals / what's NOT in this ask

- No new fields needed in the proposal response beyond what's there today.
- No PCC API integration on this path (B is local-only — only writes our own DB).
- Not changing the stamping flow on the extension side.
- Don't try to enrich the stub with PCC API calls in the same request — keep latency tight (<2s for the proposal).

## Verification checklist for the backend agent

When you're done, please verify:

1. First request for a never-seen `(orgId, clientid)` creates a row in `patients` and returns `200`.
2. Second request for the same pair returns `200` quickly without inserting again (DB unique index honored).
3. Two parallel first-time requests both succeed without duplicate rows (insert race handled).
4. The proposal builder works against the JIT stub even though it has no DX/orders in DB (it falls back to body-provided arrays, which may be empty — proposal still returns; UI handles empty proposal).
5. PostHog event `care_plan_autopop_modal_opened` includes both `patient_id` (PCC clientid for back-compat) and `internal_patient_id` (UUID from the JIT stub) if we add it.

## File pointers (extension side, FYI only)

- Request shape: `content/modules/care-plan-stamp/stamp-api.js` (`fetchProposal`)
- Where the override happens: `content/modules/care-plan-stamp/CarePlanStampModal.jsx` `handleStamp` (line ~165, `toStamp.patientId = patientId` from URL)
- Prior strategy doc: `.context/2026-05-12-auto-pop-library-vs-custom.md`
