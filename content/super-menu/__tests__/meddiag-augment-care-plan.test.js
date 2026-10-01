import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../meddiag-augment.js';

/**
 * The Med-Diag list's CP column goes away when status-overview says
 * `carePlanEnabled: false` (care plans switched off at the building). The Query
 * column rides the same response and must stay. An older server that doesn't
 * send the field keeps the column.
 */
const M = window.MedDiagAugment;

function table() {
  document.body.innerHTML = `
    <table id="meddiaglisting">
      <thead><tr><th>Code</th><th>Description</th><th>Created Date</th><th>Created By</th></tr></thead>
      <tbody>
        <tr><td>E11.9</td><td>Type 2 diabetes</td><td>2026-01-01</td><td>RN</td></tr>
        <tr><td>I10</td><td>Hypertension</td><td>2026-01-01</td><td>RN</td></tr>
      </tbody>
    </table>`;
}

function respond(extra) {
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async () => ({
        success: true,
        data: {
          success: true,
          diagnoses: [
            { code: 'E11.9', carePlanStatus: { status: 'covered' } },
            { code: 'I10' },
          ],
          ...extra,
        },
      })),
    },
  };
}

const count = (sel) => document.querySelectorAll(sel).length;

beforeEach(() => {
  table();
  M._showCarePlan = true;
  M._data = null;
  M._patientId = 'p1';
  M._facilityName = 'Test Facility';
  M._orgSlug = 'org';
});

describe('MedDiagAugment Care Plan column', () => {
  it('carePlanEnabled=false → no CP header or cells, Query column intact', async () => {
    respond({ carePlanEnabled: false });
    await M._fetchAndRender();
    expect(count('.super-meddiag-th--cp')).toBe(0);
    expect(count('.super-meddiag-cell--cp')).toBe(0);
    expect(count('.super-meddiag-th--q')).toBe(1);
    expect(count('.super-meddiag-cell--q')).toBe(2);

    // The 60s refresh must not bring it back.
    await M._fetchAndRender();
    expect(count('.super-meddiag-th--cp')).toBe(0);
    expect(count('.super-meddiag-cell--cp')).toBe(0);
    expect(count('.super-meddiag-cell--q')).toBe(2);
  });

  it('carePlanEnabled=true → CP column with shields', async () => {
    respond({ carePlanEnabled: true });
    await M._fetchAndRender();
    expect(count('.super-meddiag-th--cp')).toBe(1);
    expect(count('.super-meddiag-cell--cp')).toBe(2);
    expect(count('.super-meddiag-chip--cp')).toBe(2);
  });

  it('field absent (older server) → CP column unchanged', async () => {
    respond({});
    await M._fetchAndRender();
    expect(count('.super-meddiag-th--cp')).toBe(1);
    expect(count('.super-meddiag-cell--cp')).toBe(2);
  });

  it('CP and Query cells sit before the last two PCC columns, in that order', async () => {
    respond({});
    await M._fetchAndRender();
    const ths = [...document.querySelectorAll('#meddiaglisting thead th')].map((t) => t.textContent.trim());
    expect(ths).toEqual(['Code', 'Description', 'CP', 'Query', 'Created Date', 'Created By']);
  });
});
