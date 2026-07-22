import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, h } from 'preact';

// The view imports the analytics funnel, which reads a build-time define.
vi.mock('../../../utils/analytics.js', () => ({ track: () => {}, toErrorCode: () => 'x' }));

const { CertAuditView } = await import('../components/CertAuditView.jsx');

/**
 * The "All" tab: patient → stay → certs grouping, client-side search over the
 * loaded pages, and — the regression that motivated this file — date rendering
 * that does not drift a day. `new Date('2026-03-17')` parses as UTC midnight and
 * renders as Mar 16 in any US timezone; every date here must read back exactly.
 */

let root;
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 10)); };
const qa = (sel) => [...root.querySelectorAll(sel)];
const q = (sel) => root.querySelector(sel);
const text = () => root.textContent;

const CERTS = [
  { id: 'a1', patientId: 'p1', patientName: 'Ada Lovelace', patientExternalId: '40122',
    partAStayId: 's1', partAStartDate: '2026-03-12', payerType: 'medicare', stayStatus: 'active',
    currentMedicareDay: 17, type: 'initial', sequenceNumber: 1, status: 'signed',
    dueDate: '2026-03-17', signedAt: '2026-03-16', signedByName: 'R. Reyes', signedByTitle: 'MD' },
  { id: 'a2', patientId: 'p1', patientName: 'Ada Lovelace', patientExternalId: '40122',
    partAStayId: 's1', partAStartDate: '2026-03-12', payerType: 'medicare', stayStatus: 'active',
    currentMedicareDay: 17, type: 'day_14_recert', sequenceNumber: 2, status: 'sent',
    dueDate: '2026-03-26', actionNeeded: true },
  // Same patient, earlier stay — exercises the multi-stay tier.
  { id: 'a0', patientId: 'p1', patientName: 'Ada Lovelace', patientExternalId: '40122',
    partAStayId: 's0', partAStartDate: '2026-01-05', payerType: 'managed_care', stayStatus: 'ended',
    type: 'initial', sequenceNumber: 1, status: 'signed', dueDate: '2026-01-10' },
  { id: 'm1', patientId: 'p2', patientName: 'Marcus Webb', patientExternalId: '39880',
    partAStayId: 's2', partAStartDate: '2026-06-20', payerType: 'managed_care', stayStatus: 'active',
    currentMedicareDay: 3, type: 'initial', sequenceNumber: 1, status: 'signed',
    dueDate: '2026-06-25', signedAt: '2026-06-24', isNewlySigned: true },
];

function mount(props = {}) {
  render(h(CertAuditView, { facilityName: 'Harmony Care', orgSlug: 'harmony', ...props }), root);
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  root = document.getElementById('host');
  window.CertAPI = {
    fetchAuditCerts: vi.fn().mockResolvedValue({
      certs: CERTS, total: 128, hasMore: true, limit: 100, offset: 0,
    }),
  };
});

describe('CertAuditView — grouped audit list', () => {
  it('groups certs under their patient, newest stay first', async () => {
    mount();
    await flush();
    const names = qa('.cert-audit__patient-name').map((el) => el.textContent);
    expect(names).toEqual(['Ada Lovelace', 'Marcus Webb']);

    // Ada has two stays; the June-... no, the March stay is newer than January.
    const adaStays = qa('.cert-audit__patient')[0].querySelectorAll('.cert-audit__stay');
    expect(adaStays).toHaveLength(2);
    expect(adaStays[0].textContent).toContain('Mar 12, 2026');
    expect(adaStays[1].textContent).toContain('Jan 5, 2026');
  });

  it('renders date-only values without a timezone off-by-one', async () => {
    mount();
    await flush();
    // Each of these is the exact input value, not one day earlier.
    expect(text()).toContain('Due Mar 17, 2026');   // dueDate 2026-03-17
    expect(text()).toContain('Signed Mar 16, 2026'); // signedAt 2026-03-16
    expect(text()).toContain('Part A Mar 12, 2026'); // partAStartDate 2026-03-12
    // The drifted-by-one renderings must not appear anywhere.
    expect(text()).not.toContain('Part A Mar 11');
    expect(text()).not.toContain('Next due Mar 25');
    expect(text()).not.toContain('Part A Jan 4');
  });

  it('rolls up the action-needed count on the patient header', async () => {
    mount();
    await flush();
    const rollups = qa('.cert-audit__rollup').map((el) => el.textContent);
    expect(rollups).toEqual(['1 need action']); // only Ada's sent day-14
  });

  it('surfaces the next open due date on the stay line', async () => {
    mount();
    await flush();
    // The signed initial is earlier but finished, so next due is the day-14.
    expect(text()).toContain('Next due Mar 26, 2026');
  });

  it('flags a newly signed cert', async () => {
    mount();
    await flush();
    expect(q('.cert-audit__newly-signed')).toBeTruthy();
  });

  it('filters client-side by name and by MRN', async () => {
    mount();
    await flush();
    const search = q('.cert-audit__search');

    search.value = 'marcus';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();
    expect(qa('.cert-audit__patient-name').map((e) => e.textContent)).toEqual(['Marcus Webb']);

    search.value = '40122';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();
    expect(qa('.cert-audit__patient-name').map((e) => e.textContent)).toEqual(['Ada Lovelace']);
  });

  it('says search only covers loaded rows when more pages remain', async () => {
    mount();
    await flush();
    const search = q('.cert-audit__search');
    search.value = 'nobody-here';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();
    expect(text()).toContain('No one matching');
    expect(text()).toContain('Search only covers loaded rows');
  });
});
