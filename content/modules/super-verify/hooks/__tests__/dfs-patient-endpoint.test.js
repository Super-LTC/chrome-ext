/**
 * The DFS-per-resident endpoint, and why the ARD is load-bearing.
 *
 * Reported by Garden Springs (Heritage Painesville), Aug 6 2026: Verify showed a
 * Discharge Function Score of "Met · +7" on an OBRA Quarterly for one resident,
 * and a "12 short" statement on a Quarterly for another. DFS is determined ONCE,
 * on the End of PPS Part A Stay assessment — never on a Quarterly.
 *
 * Root cause was server-side (the route handed back the newest completed stay in
 * a rolling 365-day window whatever assessment you had open), but the server
 * cannot finish the job alone: without the ARD it has no way to tell an
 * End-of-PPS discharge from a Quarterly recorded weeks later. It falls back to
 * the old behaviour when `ardDate` is absent, so omitting it here silently
 * leaves half the bug in place — the failure mode is a WRONG PANEL, not an
 * error, which is exactly the kind that survives a manual smoke test.
 *
 * `getPCCAssessmentMetaFromDOM` already validates the scraped ARD against
 * /^\d{4}-\d{2}-\d{2}$/ and returns null otherwise, so anything non-ISO arrives
 * here as null and must be omitted rather than sent — the backend matches the
 * ARD exactly, and a `MM/DD/YYYY` string would match nothing and blank the
 * callout on the one assessment that should show it.
 */
import { describe, it, expect } from 'vitest';
import { buildDfsEndpoint } from '../useDfsPatient.js';

const base = { patientId: '382366', facilityName: 'Heritage Painesville', orgSlug: 'garden-springs' };

describe('buildDfsEndpoint', () => {
  it('sends the ARD of the assessment under review', () => {
    const url = buildDfsEndpoint({ ...base, ardDate: '2026-07-23' });
    expect(url).toContain('ardDate=2026-07-23');
  });

  it('omits ardDate entirely when the DOM had no scrapeable ARD', () => {
    const url = buildDfsEndpoint({ ...base, ardDate: null });
    expect(url).not.toContain('ardDate');
  });

  it('still carries the params the route requires', () => {
    const url = buildDfsEndpoint({ ...base, ardDate: '2026-07-23' });
    expect(url).toContain('facilityName=Heritage+Painesville');
    expect(url).toContain('orgSlug=garden-springs');
    expect(url).toMatch(/^\/api\/extension\/patients\/382366\/dfs\?/);
  });

  it('encodes a patient id that is not URL-safe', () => {
    const url = buildDfsEndpoint({ ...base, patientId: 'EID_a b', ardDate: null });
    expect(url).toContain('/patients/EID_a%20b/dfs');
  });
});
