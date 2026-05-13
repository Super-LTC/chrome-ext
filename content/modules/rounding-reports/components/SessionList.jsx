import { useState } from 'preact/hooks';
import { RoundingAPI } from '../api/rounding-api.js';
import { generateMissingItemsPdf } from '../lib/rounding-report.js';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function progressLabel(s) {
  if (s.status === 'completed' && s.totalItems != null) {
    return `${s.checkedItems ?? 0} / ${s.totalItems} items`;
  }
  if (s.checkCount != null) return `${s.checkCount} items`;
  return null;
}

function SessionCard({ session, onOpen, onDelete, facilityName, orgSlug, onToast }) {
  const isInProgress = session.status === 'in_progress';
  const date = fmtDate(session.startedAt);
  const startedTime = fmtTime(session.startedAt);
  const completedTime = session.completedAt ? fmtTime(session.completedAt) : null;
  const items = progressLabel(session);
  const by = session.completedByName || session.createdByName || '';
  const [pdfBusy, setPdfBusy] = useState(false);

  async function handleSavePdf(e) {
    e.stopPropagation();
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const data = await RoundingAPI.detail({ sessionId: session.id, facilityName, orgSlug });
      const { rowCount } = await generateMissingItemsPdf(data.detail);
      onToast?.({ type: 'success', message: `PDF saved (${rowCount} missing item${rowCount === 1 ? '' : 's'})` });
    } catch (err) {
      console.error('[Rounding] PDF failed:', err);
      onToast?.({ type: 'error', message: 'Failed to generate PDF' });
    } finally {
      setPdfBusy(false);
    }
  }

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirm('Delete this rounding session? This cannot be undone.')) return;
    onDelete(session.id);
  }

  return (
    <div
      class={`rr-session-card${isInProgress ? ' rr-session-card--active' : ''}`}
      onClick={() => onOpen(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(session.id); }}
    >
      <div class="rr-session-card__main">
        <div class="rr-session-card__date">{date}</div>
        <div class="rr-session-card__stats">
          <span>🕐 {startedTime}{completedTime ? ` → ${completedTime}` : ''}</span>
          {session.patientCount != null && <span>👥 {session.patientCount} patients</span>}
          {items && <span>✓ {items}</span>}
        </div>
        {by && <div class="rr-session-card__meta">by {by}</div>}
      </div>
      <div class="rr-session-card__side">
        <span class={`rr-session-card__pill${isInProgress ? ' rr-session-card__pill--live' : ' rr-session-card__pill--done'}`}>
          {isInProgress ? 'In Progress' : 'Completed'}
        </span>
        <div class="rr-session-card__actions">
          {!isInProgress && (
            <button
              class="rr-icon-btn"
              type="button"
              onClick={handleSavePdf}
              disabled={pdfBusy}
              title="Save PDF of missing items"
              aria-label="Save PDF"
              data-track="rounding_pdf_downloaded"
              data-track-prop-source="list"
            >
              {pdfBusy ? '…' : '📄'}
            </button>
          )}
          {/* NO_TRACK */}
          <button
            class="rr-icon-btn rr-icon-btn--danger"
            type="button"
            onClick={handleDelete}
            title="Delete session"
            aria-label="Delete session"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

export function SessionList({
  sessions, loading, error, moduleDisabled,
  onOpen, onStart, onDelete, onToast,
  facilityName, orgSlug,
}) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      await onStart();
    } catch (err) {
      console.error('[RoundingReports] start failed:', err);
      setStartError(err.message || 'Failed to start round');
    } finally {
      setStarting(false);
    }
  }

  if (moduleDisabled) {
    return (
      <div class="rr-banner rr-banner--info">
        <strong>Compliance module isn't enabled for this facility.</strong>
        <div>Contact your admin to enable rounding reports.</div>
      </div>
    );
  }

  if (loading && sessions.length === 0) {
    return <div class="rr-loading">Loading rounding reports…</div>;
  }

  if (error) {
    return <div class="rr-banner rr-banner--error">{error}</div>;
  }

  return (
    <div class="rr-list">
      <div class="rr-list__toolbar">
        <div class="rr-list__title">
          <h2>Rounding Reports</h2>
          <div class="rr-list__sub">Physical care-plan verification checklists</div>
        </div>
        <button
          class="rr-btn rr-btn--primary"
          onClick={handleStart}
          disabled={starting}
          type="button"
          data-track="rounding_session_started"
          data-track-prop-source="list"
        >
          {starting ? 'Starting…' : '+ Start New Round'}
        </button>
      </div>

      {startError && <div class="rr-banner rr-banner--error">{startError}</div>}

      {sessions.length === 0 ? (
        <div class="rr-empty">
          <div class="rr-empty__title">No rounding reports yet</div>
          <div class="rr-empty__hint">Start your first round to begin checking care-plan interventions across the facility.</div>
        </div>
      ) : (
        <div class="rr-list__cards">
          {sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              onOpen={onOpen}
              onDelete={onDelete}
              onToast={onToast}
              facilityName={facilityName}
              orgSlug={orgSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
