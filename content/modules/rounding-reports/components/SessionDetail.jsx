import { useMemo, useState } from 'preact/hooks';
import { HistoryDots, StatusBadge } from './StatusBadge.jsx';
import { deriveWing, generateMissingItemsPdf, locationSortKey, parsePccLocation } from '../lib/rounding-report.js';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isHeic(url) {
  return /\.heic($|\?)/i.test(String(url || ''));
}

function PhotoStrip({ urls, alt }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div class="rr-check__photos">
      {urls.map((url) => (
        isHeic(url) ? (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" class="rr-check__photo-heic">
            📎 Photo (HEIC)
          </a>
        ) : (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" class="rr-check__photo-link">
            <img src={url} alt={alt} class="rr-check__photo" loading="lazy" />
          </a>
        )
      ))}
    </div>
  );
}

function NotesAccordion({ notes }) {
  const [open, setOpen] = useState(false);
  if (!notes) return null;
  return (
    <div class="rr-check__notes-wrap">
      {/* NO_TRACK */}
      <button
        type="button"
        class="rr-check__notes-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        📝 {open ? 'Hide notes' : 'View notes'}
      </button>
      {open && <div class="rr-check__notes">{notes}</div>}
    </div>
  );
}

function CheckRow({ check }) {
  const photoCount = check.photoUrls?.length || 0;
  return (
    <li class="rr-check">
      <div class="rr-check__head">
        <div class="rr-check__text">{check.interventionText}</div>
        <div class="rr-check__head-right">
          {photoCount > 0 && (
            <span class="rr-check__photo-chip" title={`${photoCount} photo${photoCount === 1 ? '' : 's'}`}>
              📷 {photoCount}
            </span>
          )}
          <StatusBadge status={check.status} />
        </div>
      </div>
      {check.physicalCheckHint && (
        <div class="rr-check__hint">{check.physicalCheckHint}</div>
      )}
      <NotesAccordion notes={check.notes} />
      <PhotoStrip urls={check.photoUrls} alt={check.interventionText} />
      {check.history && check.history.length > 0 && (
        <div class="rr-check__history">
          <span class="rr-check__history-label">Last {check.history.length}:</span>
          <HistoryDots history={check.history} />
        </div>
      )}
    </li>
  );
}

function PatientBlock({ patient, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const checks = patient.checks || [];
  const total = checks.length;
  const completed = checks.filter(c => c.status && c.status !== 'pending').length;
  const parsed = parsePccLocation(patient.currentLocation);
  const groupLabel = patient.group === 'skilled' ? 'SKL'
    : patient.group === 'long_term' ? 'LTC'
    : null;
  const pct = total > 0 ? completed / total : 0;
  // Circle progress ring (24px). Stroke offset math for a 22-circumference ring.
  const R = 9;
  const C = 2 * Math.PI * R;
  const dash = C * pct;
  return (
    <div class={`rr-patient${open ? ' rr-patient--open' : ''}`}>
      {/* NO_TRACK */}
      <button
        class="rr-patient__head"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <span class="rr-patient__ring" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r={R} fill="none" stroke="#e5e7eb" stroke-width="2.5" />
            <circle
              cx="12" cy="12" r={R}
              fill="none"
              stroke={pct === 1 ? '#22c55e' : '#6366f1'}
              stroke-width="2.5"
              stroke-dasharray={`${dash} ${C}`}
              stroke-linecap="round"
              transform="rotate(-90 12 12)"
            />
          </svg>
        </span>
        {parsed.room ? (
          <span class="rr-patient__room-chip" title={patient.currentLocation || ''}>
            {parsed.room}
          </span>
        ) : (
          <span class="rr-patient__room-chip rr-patient__room-chip--empty">—</span>
        )}
        <span class="rr-patient__id">
          <span class="rr-patient__name">{patient.patientName}</span>
          {groupLabel && <span class="rr-patient__group">{groupLabel}</span>}
          <span class="rr-patient__sub">{parsed.hall || 'Hall'}</span>
        </span>
        <span class="rr-patient__count">
          <span class="rr-patient__count-num">{completed}/{total}</span>
          <span class={`rr-patient__chev${open ? ' rr-patient__chev--open' : ''}`}>›</span>
        </span>
      </button>
      {open && (
        <ul class="rr-checks">
          {checks.map(c => <CheckRow key={c.id} check={c} />)}
        </ul>
      )}
    </div>
  );
}

function WingSection({ label, patients, defaultOpenFirst }) {
  if (!patients || patients.length === 0) return null;
  return (
    <section class="rr-group">
      {label && (
        <h3 class="rr-group__title">
          Hall {label} <span class="rr-group__count">({patients.length})</span>
        </h3>
      )}
      {patients.map((p, i) => (
        <PatientBlock key={p.patientId} patient={p} defaultOpen={defaultOpenFirst && i === 0} />
      ))}
    </section>
  );
}

function matchesSearch(p, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    p.patientName.toLowerCase().includes(needle) ||
    (p.currentLocation?.toLowerCase().includes(needle) ?? false)
  );
}

export function SessionDetail({ detail, loading, error, onBack, onShowQR, onToast }) {
  const [search, setSearch] = useState('');
  const [hallFilter, setHallFilter] = useState('all');
  const [pdfBusy, setPdfBusy] = useState(false);

  async function handleSavePdf() {
    if (!detail || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { rowCount } = await generateMissingItemsPdf(detail);
      onToast?.({ type: 'success', message: `PDF saved (${rowCount} missing item${rowCount === 1 ? '' : 's'})` });
    } catch (err) {
      console.error('[Rounding] PDF failed:', err);
      onToast?.({ type: 'error', message: 'Failed to generate PDF' });
    } finally {
      setPdfBusy(false);
    }
  }

  const allPatients = detail?.patients || [];

  const availableHalls = useMemo(() => {
    const set = new Set();
    for (const p of allPatients) {
      const wing = deriveWing(parsePccLocation(p.currentLocation));
      if (wing) set.add(wing);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [allPatients]);

  const visiblePatients = useMemo(() => {
    const filtered = allPatients.filter(p => {
      if (!matchesSearch(p, search)) return false;
      if (hallFilter !== 'all') {
        const wing = deriveWing(parsePccLocation(p.currentLocation));
        if (wing !== hallFilter) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const [aw, ar, an] = locationSortKey(a.currentLocation, a.patientName);
      const [bw, br, bn] = locationSortKey(b.currentLocation, b.patientName);
      if (aw !== bw) return aw.localeCompare(bw, undefined, { numeric: true });
      if (ar !== br) return ar - br;
      return an.localeCompare(bn);
    });
  }, [allPatients, search, hallFilter]);

  const wingGroups = useMemo(() => {
    if (availableHalls.length <= 1) {
      // Flat list — no headers when only one wing parses (or none).
      return [{ wing: null, patients: visiblePatients }];
    }
    const map = new Map();
    for (const p of visiblePatients) {
      const wing = deriveWing(parsePccLocation(p.currentLocation)) || 'Other';
      if (!map.has(wing)) map.set(wing, []);
      map.get(wing).push(p);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([wing, patients]) => ({ wing, patients }));
  }, [visiblePatients, availableHalls]);

  if (loading && !detail) return <div class="rr-loading">Loading session…</div>;
  if (error) {
    return (
      <div class="rr-detail">
        {/* NO_TRACK */}
        <button class="rr-btn rr-btn--ghost" onClick={onBack} type="button">← Back</button>
        <div class="rr-banner rr-banner--error">{error}</div>
      </div>
    );
  }
  if (!detail) return null;

  const session = detail.session;
  const isInProgress = session.status === 'in_progress';
  const completedCount = detail.completedChecks ?? 0;
  const totalCount = detail.totalChecks ?? 0;

  return (
    <div class="rr-detail">
      <div class="rr-detail__topbar">
        {/* NO_TRACK */}
        <button class="rr-btn rr-btn--ghost" onClick={onBack} type="button">← Reports</button>
      </div>

      <header class="rr-detail__header">
        <div class="rr-detail__title">
          <span class={`rr-session-card__dot${isInProgress ? ' rr-session-card__dot--live' : ''}`} aria-hidden="true" />
          <span>{isInProgress ? 'In progress' : 'Completed'}</span>
          <span class="rr-detail__sep">·</span>
          <span>started {fmtTime(session.startedAt)}</span>
          {session.completedAt && (
            <>
              <span class="rr-detail__sep">·</span>
              <span>completed {fmtTime(session.completedAt)}</span>
            </>
          )}
        </div>
        <div class="rr-detail__stats">
          {completedCount} / {totalCount} items checked · {allPatients.length} patients
        </div>
        <div class="rr-detail__cta-row">
          {isInProgress && (
            <button class="rr-btn rr-btn--primary" onClick={onShowQR} type="button" data-track="rounding_qr_opened" data-track-prop-source="detail_header">
              📱 Send to phone (QR)
            </button>
          )}
          {!isInProgress && (
            <button
              class="rr-btn rr-btn--secondary"
              onClick={handleSavePdf}
              disabled={pdfBusy}
              type="button"
              data-track="rounding_pdf_downloaded"
              data-track-prop-source="detail_header"
            >
              📄 {pdfBusy ? 'Saving…' : 'Save PDF'}
            </button>
          )}
        </div>
      </header>

      <div class="rr-detail__controls">
        <input
          class="rr-search"
          type="text"
          placeholder="Search by name or room #…"
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        {availableHalls.length > 1 && (
          <select
            class="rr-hall-filter"
            value={hallFilter}
            onChange={(e) => setHallFilter(e.currentTarget.value)}
          >
            <option value="all">All halls ({availableHalls.length})</option>
            {availableHalls.map(h => (
              <option key={h} value={h}>Hall {h}</option>
            ))}
          </select>
        )}
      </div>

      {visiblePatients.length === 0 ? (
        <div class="rr-empty">
          <div class="rr-empty__title">No patients match</div>
          <div class="rr-empty__hint">Try a different search or clear the hall filter.</div>
        </div>
      ) : (
        wingGroups.map((g, gi) => (
          <WingSection
            key={g.wing || 'flat'}
            label={g.wing}
            patients={g.patients}
            defaultOpenFirst={gi === 0}
          />
        ))
      )}
    </div>
  );
}
