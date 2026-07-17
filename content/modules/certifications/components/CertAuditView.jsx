import { useState } from 'preact/hooks';
import { useAuditCerts } from '../hooks/useAuditCerts.js';
import { CertTypeBadge } from './CertTypeBadge.jsx';
import { track } from '../../../utils/analytics.js';

/**
 * CertAuditView — the "Audit" sub-tab of the Certs view.
 *
 * A flat, facility-wide roster of EVERY certification (all statuses, all time),
 * for a 100% compliance audit. Unlike the other tabs it is NOT stay-grouped and
 * ignores the discharge-grace / 7-day-signed windows — it lists the complete set
 * so an MDS coordinator can reconcile against their own records and export a CSV.
 *
 * Filters (status + signed-date range) are handled here and drive the backend
 * query directly; the on-screen list is paginated ("Load more"), while "Export
 * CSV" always pulls the entire filtered set regardless of what's on screen.
 */

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

/** YYYY-MM-DD (date-only column, no timezone shift). */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr).slice(0, 10);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** For the CSV — ISO date so it sorts/opens cleanly in a spreadsheet. */
function isoDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr).slice(0, 10);
  return d.toISOString().slice(0, 10);
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
  const [exporting, setExporting] = useState(false);

  const {
    certs, total, hasMore, loading, loadingMore, error, loadMore, fetchAll, refetch,
  } = useAuditCerts({ facilityName, orgSlug, enabled: true, status, signedAfter, signedBefore });

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

      {/* Table */}
      {!loading && !error && certs.length > 0 && (
        <>
          <div class="cert-audit__count">
            Showing {certs.length} of {total} certification{total === 1 ? '' : 's'}
          </div>
          <div class="cert-audit__table-wrap">
            <table class="cert-audit__table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Signed</th>
                  <th>Signed By</th>
                  <th>Payer</th>
                </tr>
              </thead>
              <tbody>
                {certs.map(cert => (
                  <tr key={cert.id}>
                    <td class="cert-audit__cell-patient">{cert.patientName}</td>
                    <td><CertTypeBadge type={cert.type} /></td>
                    <td>
                      <span class={`cert-audit__status cert-audit__status--${cert.status}`}>
                        {STATUS_LABELS[cert.status] || cert.status}
                      </span>
                    </td>
                    <td class="cert-audit__cell-date">{fmtDate(cert.dueDate)}</td>
                    <td class="cert-audit__cell-date">{fmtDate(cert.signedAt)}</td>
                    <td class="cert-audit__cell-signer">{signedBy(cert) || '—'}</td>
                    <td>{payerLabel(cert.payerType) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
