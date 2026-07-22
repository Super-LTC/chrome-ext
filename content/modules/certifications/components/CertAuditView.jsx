import { useState, useMemo } from 'preact/hooks';
import { useAuditCerts } from '../hooks/useAuditCerts.js';
import { CertTypeBadge } from './CertTypeBadge.jsx';
import { groupCertsByStay, filterCertsBySearch } from '../cert-grouping.js';
import { parseDateOnly } from '../cert-urgency.js';
import { track } from '../../../utils/analytics.js';

/**
 * CertAuditView — the "All" sub-tab of the Certs view.
 *
 * A facility-wide roster of EVERY certification (all statuses, all time), for a
 * 100% compliance audit. It ignores the discharge-grace / 7-day-signed windows
 * the other tabs apply, so an MDS coordinator can reconcile against their own
 * records and export a CSV.
 *
 * Rendered patient → stay → certs (a patient can have several Part A stays), so
 * a resident's whole cert chain reads as one block instead of scattered rows.
 *
 * Two scopes are deliberately different here, and the UI says so:
 *   - status + signed-date filters are SERVER-side and drive the query;
 *   - the search box is CLIENT-side and only covers rows already loaded.
 * "Export CSV" always pulls the entire server-filtered set regardless of what's
 * on screen or typed in the search box.
 */

/** Patients are expanded by default until the loaded set gets unwieldy. */
const AUTO_COLLAPSE_OVER = 12;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'signed', label: 'Signed' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'revoked', label: 'Revoked' },
];

const TYPE_LABELS = {
  initial: 'Initial',
  day_14_recert: 'Day 14 Recert',
  day_30_recert: 'Day 30 Recert',
};

const STATUS_LABELS = {
  pending: 'Pending',
  sent: 'Sent',
  signed: 'Signed',
  delayed: 'Delayed',
  skipped: 'Skipped',
  revoked: 'Revoked',
};

/**
 * Display date. Goes through `parseDateOnly` so a 'YYYY-MM-DD' value is read at
 * LOCAL midnight — `new Date('2026-03-17')` parses as UTC midnight and then
 * renders as Mar 16 in any US timezone.
 */
function fmtDate(dateStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr ? String(dateStr).slice(0, 10) : '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * For the CSV — ISO date so it sorts/opens cleanly in a spreadsheet. Built from
 * local date parts rather than `toISOString()`, which would re-introduce the
 * same UTC shift for timestamped values.
 */
function isoDate(dateStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return dateStr ? String(dateStr).slice(0, 10) : '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function payerLabel(payerType) {
  if (payerType === 'managed_care') return 'Managed';
  if (payerType === 'medicare') return 'Medicare';
  return payerType || '';
}

function signedBy(cert) {
  if (!cert.signedByName) return '';
  return cert.signedByTitle ? `${cert.signedByName}, ${cert.signedByTitle}` : cert.signedByName;
}

/** RFC-4180 field escaping. */
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  ['Patient', c => c.patientName],
  ['PCC ID', c => c.patientExternalId],
  ['Cert Type', c => TYPE_LABELS[c.type] || c.type],
  ['Status', c => STATUS_LABELS[c.status] || c.status],
  ['Due Date', c => isoDate(c.dueDate)],
  ['Signed Date', c => isoDate(c.signedAt)],
  ['Signed By', c => signedBy(c)],
  ['Medicare Day', c => (c.medicareDayAtDue ?? '')],
  ['Payer', c => payerLabel(c.payerType)],
  ['Part A Start', c => isoDate(c.partAStartDate)],
  ['Stay Status', c => c.stayStatus || ''],
];

function buildCsv(certs) {
  const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(',');
  const rows = certs.map(c => CSV_COLUMNS.map(([, get]) => csvCell(get(c))).join(','));
  return [header, ...rows].join('\r\n');
}

function slugifyFacility(name) {
  return (name || 'facility').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'facility';
}

function downloadCsv(filename, csv) {
  // Prepend a UTF-8 BOM so Excel reads accented names correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CertAuditView({ facilityName, orgSlug }) {
  const [status, setStatus] = useState('');
  const [signedAfter, setSignedAfter] = useState('');
  const [signedBefore, setSignedBefore] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  // Patients the nurse explicitly toggled, keyed by patientKey → bool. Anything
  // absent falls back to the size-based default so the list stays readable.
  const [overrides, setOverrides] = useState({});

  const {
    certs, total, hasMore, loading, loadingMore, error, loadMore, fetchAll, refetch,
  } = useAuditCerts({ facilityName, orgSlug, enabled: true, status, signedAfter, signedBefore });

  // Search + grouping are both client-side over the loaded pages.
  const groups = useMemo(
    () => groupCertsByStay(filterCertsBySearch(certs, search)),
    [certs, search]
  );

  const defaultOpen = groups.length <= AUTO_COLLAPSE_OVER;
  const isOpen = (key) => overrides[key] ?? defaultOpen;
  const toggle = (key) => setOverrides((o) => ({ ...o, [key]: !(o[key] ?? defaultOpen) }));
  const setAll = (open) => {
    setOverrides(Object.fromEntries(groups.map((g) => [g.patientKey, open])));
  };

  const shownCerts = groups.reduce((n, g) => n + g.certCount, 0);
  const searching = !!search.trim();

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const all = await fetchAll();
      if (all.length === 0) {
        window.SuperToast?.info?.('No certifications match these filters');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`cert-audit-${slugifyFacility(facilityName)}-${stamp}.csv`, buildCsv(all));
      track('cert_audit_exported', { count: all.length });
      window.SuperToast?.success?.(`Exported ${all.length} certification${all.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('[Certifications] Audit CSV export failed:', err);
      window.SuperToast?.error?.('Failed to export — please try again');
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = !!(status || signedAfter || signedBefore);

  return (
    <div class="cert-audit">
      {/* Client-side lookup over loaded rows — server filters live below it. */}
      {/* NO_TRACK — typing is not a business event */}
      <input
        type="search"
        class="cert-audit__search"
        value={search}
        onInput={(e) => setSearch(e.currentTarget.value)}
        placeholder="Search loaded residents by name or MRN…"
        aria-label="Search loaded certifications by patient name or MRN"
      />

      {/* Filter + export toolbar */}
      <div class="cert-audit__toolbar">
        <div class="cert-audit__filter-group">
          {/* NO_TRACK */}
          <select
            class="cert-audit__select"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value)}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label class="cert-audit__date-label">
            Signed from
            {/* NO_TRACK */}
            <input
              type="date"
              class="cert-audit__date"
              value={signedAfter}
              max={signedBefore || undefined}
              onChange={(e) => setSignedAfter(e.currentTarget.value)}
            />
          </label>
          <label class="cert-audit__date-label">
            to
            {/* NO_TRACK */}
            <input
              type="date"
              class="cert-audit__date"
              value={signedBefore}
              min={signedAfter || undefined}
              onChange={(e) => setSignedBefore(e.currentTarget.value)}
            />
          </label>
          {hasFilters && (
            // NO_TRACK
            <button
              class="cert-audit__clear"
              onClick={() => { setStatus(''); setSignedAfter(''); setSignedBefore(''); }}
            >
              Clear
            </button>
          )}
        </div>
        {/* NO_TRACK — explicit event fired in handleExport */}
        <button
          class="cert-audit__export"
          onClick={handleExport}
          disabled={exporting || loading || certs.length === 0}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {(signedAfter || signedBefore) && (
        <p class="cert-audit__hint">
          Date range filters on the <strong>signed</strong> date, so it narrows to signed certifications only.
        </p>
      )}

      {searching && hasMore && (
        <p class="cert-audit__hint">
          Searching the <strong>{certs.length}</strong> rows loaded so far — load more below to widen it.
        </p>
      )}

      {/* States */}
      {loading && (
        <div class="mds-cc__state-container">
          <div class="mds-cc__spinner" />
          <p class="mds-cc__state-text">Loading certification audit…</p>
        </div>
      )}

      {!loading && error && (
        <div class="mds-cc__state-container">
          <div class="mds-cc__state-icon">{'⚠'}</div>
          <p class="mds-cc__state-text">{error}</p>
          {/* NO_TRACK */}
          <button class="mds-cc__retry-btn" onClick={refetch}>Retry</button>
        </div>
      )}

      {!loading && !error && certs.length === 0 && (
        <div class="mds-cc__state-container">
          <div class="mds-cc__state-icon">{'\u{1F4CB}'}</div>
          <p class="mds-cc__state-text">
            {hasFilters ? 'No certifications match these filters' : 'No certifications found for this facility'}
          </p>
        </div>
      )}

      {/* Search found nothing in the loaded pages — distinct from "no rows at all". */}
      {!loading && !error && certs.length > 0 && groups.length === 0 && (
        <div class="mds-cc__state-container">
          <div class="mds-cc__state-icon">{'\u{1F50D}'}</div>
          <p class="mds-cc__state-text">No one matching “{search}” in the {certs.length} loaded</p>
          {hasMore && (
            <p class="cert-audit__hint">
              Search only covers loaded rows — load more, or narrow with the filters above.
            </p>
          )}
        </div>
      )}

      {/* Grouped list: patient → stay → certs */}
      {!loading && !error && groups.length > 0 && (
        <>
          <div class="cert-audit__count">
            <span>
              {searching
                ? `${groups.length} patient${groups.length === 1 ? '' : 's'} · ${shownCerts} of ${certs.length} loaded`
                : `${groups.length} patient${groups.length === 1 ? '' : 's'} · ${certs.length} of ${total} certification${total === 1 ? '' : 's'}`}
            </span>
            {/* NO_TRACK — view affordance, not a business event */}
            <button
              class="cert-audit__expand-all"
              onClick={() => setAll(!groups.every((g) => isOpen(g.patientKey)))}
            >
              {groups.every((g) => isOpen(g.patientKey)) ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          <div class="cert-audit__groups">
            {groups.map((group) => {
              const open = isOpen(group.patientKey);
              return (
                <div class="cert-audit__patient" key={group.patientKey}>
                  {/* NO_TRACK — expand/collapse is intra-view navigation */}
                  <button
                    class="cert-audit__patient-head"
                    onClick={() => toggle(group.patientKey)}
                    aria-expanded={open ? 'true' : 'false'}
                  >
                    <span class={`cert-audit__chevron${open ? ' is-open' : ''}`} aria-hidden="true">›</span>
                    <span class="cert-audit__patient-name">{group.patientName}</span>
                    {group.patientExternalId && (
                      <span class="cert-audit__mrn">MRN {group.patientExternalId}</span>
                    )}
                    <span class="cert-audit__patient-spacer" />
                    {group.actionNeededCount > 0 && (
                      <span class="cert-audit__rollup">{group.actionNeededCount} need action</span>
                    )}
                    <span class="cert-audit__patient-count">
                      {group.certCount} cert{group.certCount === 1 ? '' : 's'}
                    </span>
                  </button>

                  {open && group.stays.map((stay) => (
                    <div class="cert-audit__stay" key={stay.stayId}>
                      <div class="cert-audit__stay-head">
                        {payerLabel(stay.payerType) && (
                          <span class="cert-audit__stay-payer">{payerLabel(stay.payerType)}</span>
                        )}
                        {stay.medicareDay != null && <span>Day {stay.medicareDay}</span>}
                        {stay.partAStartDate && <span>Part A {fmtDate(stay.partAStartDate)}</span>}
                        {stay.stayStatus && (
                          <span class={`cert-audit__stay-status cert-audit__stay-status--${stay.stayStatus}`}>
                            {stay.stayStatus}
                          </span>
                        )}
                        {stay.nextDue && <span>Next due {fmtDate(stay.nextDue)}</span>}
                      </div>

                      <div class="cert-audit__certs">
                        {stay.certs.map((cert) => (
                          <div class="cert-audit__cert" key={cert.id}>
                            <CertTypeBadge type={cert.type} />
                            <span class={`cert-audit__status cert-audit__status--${cert.status}`}>
                              {STATUS_LABELS[cert.status] || cert.status}
                            </span>
                            <span class="cert-audit__cert-due">Due {fmtDate(cert.dueDate) || '—'}</span>
                            <span class="cert-audit__cert-signer">
                              {cert.signedAt
                                ? `Signed ${fmtDate(cert.signedAt)}${signedBy(cert) ? ` · ${signedBy(cert)}` : ''}`
                                : ''}
                            </span>
                            {cert.isNewlySigned && (
                              <span class="cert-audit__newly-signed">Just signed</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {hasMore && (
            // NO_TRACK
            <button class="cert__load-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
