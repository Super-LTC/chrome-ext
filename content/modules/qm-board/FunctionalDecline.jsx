/**
 * Surface E — Functional Decline (standalone screen, its own FAB).
 *
 * GG decline left the QM Board (handoff §3) and became its own surface,
 * mirroring the web GgDeclineDashboard. Facility roster grouped by
 * overallSeverity, a Therapy Pickup / QM Decline mode toggle, search, snooze,
 * and the existing per-patient GG chart (GgDeclineDetail) on click.
 *
 *   GET /api/extension/qm-planner/gg-decline-dashboard?facilityName&orgSlug&mode
 *   per-patient drill-in + GG snooze reuse the existing GG endpoints.
 */
import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { track } from '../../utils/analytics.js';
import { useGgDashboard } from './hooks/useGgDashboard.js';
import { useSnooze } from './hooks/useSnooze.js';
import { GgDeclineDetail } from './components/GgDeclineDetail.jsx';
import { ChevronLeft, ChevronRight, Search, X, Clock, Undo2 } from './components/icons.jsx';

const MODES = [
  { value: 'therapy', label: 'Therapy Pickup' },
  { value: 'qm', label: 'QM Decline' },
];
const SEVERITY_GROUPS = [
  { key: 'severe',   label: 'Severe',   tone: 'rose' },
  { key: 'moderate', label: 'Moderate', tone: 'amber' },
  { key: 'mild',     label: 'Mild',     tone: 'sky' },
];

export function FunctionalDecline({ facilityName, orgSlug, onClose }) {
  const [mode, setMode] = useState('therapy');
  const [query, setQuery] = useState('');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [selected, setSelected] = useState(null); // { patientId, name } | null

  useEffect(() => { track('functional_decline_opened', { source: 'fab' }); }, []);

  const { data, loading, error, retry } = useGgDashboard({ facilityName, orgSlug, mode });
  const { snoozeGg, unsnoozeGg, pending } = useSnooze({ facilityName, orgSlug });

  const q = query.trim().toLowerCase();
  const patients = useMemo(() => (data?.patients ?? []).filter((p) => !q || p.patientName.toLowerCase().includes(q)), [data, q]);
  const snoozed = data?.snoozedPatients ?? [];
  const summary = data?.summary ?? { total: 0, withDecline: 0, severe: 0, moderate: 0, mild: 0, snoozed: 0 };

  const doSnooze = useCallback(async (patientId) => { try { await snoozeGg(patientId, 30, null); } catch { /* hook logs */ } }, [snoozeGg]);
  const doUnsnooze = useCallback(async (patientId, snoozeId) => { try { await unsnoozeGg(patientId, snoozeId); } catch { /* hook logs */ } }, [unsnoozeGg]);

  return (
    <div className="qmb__overlay" role="dialog" aria-modal="true" aria-labelledby="fd-title">
      <div className="qmb__backdrop" onClick={onClose}></div>
      <div className="qmb__modal">
        <header className="qmb__header">
          <div className="qmb__title-row">
            <div className="qmb__title-group">
              <h2 className="qmb__title" id="fd-title">Functional Decline</h2>
              {facilityName && <span className="qmb__facility">{facilityName}</span>}
            </div>
            <button type="button" className="qmb__close" onClick={onClose} aria-label="Close"> {/* NO_TRACK */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </header>

        {selected ? (
          <div className="qmc-scroll qmc">
            <GgDeclineDetail
              alert={{ patientId: selected.patientId, name: selected.name, qmId: 'gg_decline' }}
              facilityName={facilityName} orgSlug={orgSlug} mode={mode}
              onBack={() => setSelected(null)}
            />
          </div>
        ) : loading ? (
          <div className="qmc-loading">Loading functional-decline roster…</div>
        ) : error ? (
          <div className="qmc-error">
            <div>Failed to load decline data</div>
            <div className="qmc-error__detail">{error}</div>
            <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
          </div>
        ) : (
          <div className="qmc-scroll qmc" style={{ gap: '16px' }}>
            {/* Mode toggle + summary */}
            <div className="qmc-toolbar">
              <div className="qmc-tabs">
                {MODES.map((m) => (
                  <button key={m.value} type="button" className={mode === m.value ? 'qmc-tab qmc-tab--on' : 'qmc-tab'} onClick={() => { setMode(m.value); setQuery(''); }}> {/* NO_TRACK */}
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="qmc-search">
                <Search />
                <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Search patients" />
                {query && <button type="button" className="qmc-search__clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button> /* NO_TRACK */}
              </div>
            </div>

            <div className="qmc-fd-summary">
              <SummaryCard n={summary.withDecline} label="With decline" tone="slate" />
              <SummaryCard n={summary.severe} label="Severe" tone="rose" />
              <SummaryCard n={summary.moderate} label="Moderate" tone="amber" />
              <SummaryCard n={summary.mild} label="Mild" tone="sky" />
            </div>

            {(summary.snoozed > 0 || snoozed.length > 0) && (
              <div className="qmc-collapsible">
                <button type="button" className="qmc-collapsible__head" onClick={() => setShowSnoozed((s) => !s)}> {/* NO_TRACK */}
                  {showSnoozed ? <ChevronLeft style={{ transform: 'rotate(-90deg)' }} /> : <ChevronRight />}
                  <Clock style={{ width: '14px', height: '14px' }} />
                  {snoozed.length || summary.snoozed} snoozed
                </button>
                {showSnoozed && (
                  <div className="qmc-collapsible__body qmc-rows">
                    {snoozed.map((p) => (
                      <div key={p.patientId} className="qmc-snoozed">
                        <button type="button" className="qmc-prow__main" onClick={() => setSelected({ patientId: p.patientId, name: p.patientName })} /* NO_TRACK */>
                          <span className="qmc-row__name">{p.patientName}</span>
                          <span className="qmc-row__meta" style={{ display: 'block', marginTop: '2px' }}>
                            {p.overallSeverity ? `${p.overallSeverity} · ` : ''}until {p.snooze?.snoozedUntil ? new Date(p.snooze.snoozedUntil).toLocaleDateString() : '—'}
                          </span>
                        </button>
                        <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code="gg" data-track-prop-action="unsnooze" className="qmc-undo" disabled={pending} onClick={() => doUnsnooze(p.patientId, p.snooze?.snoozeId)}>
                          <Undo2 /> Unsnooze
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Roster grouped by severity */}
            <div className="qmc-worklist">
              {SEVERITY_GROUPS.map((g) => {
                const rows = patients.filter((p) => p.overallSeverity === g.key);
                if (rows.length === 0) return null;
                return (
                  <div key={g.key}>
                    <div className="qmc-ghead">
                      <span className={`qmc-dot qmc-dot--${g.tone}`} />
                      <span className="qmc-group__label">{g.label}</span>
                      <span className="qmc-group__count">{rows.length}</span>
                    </div>
                    <div className="qmc-rows">
                      {rows.map((p) => (
                        <PatientRow key={p.patientId} patient={p} tone={g.tone} pending={pending}
                          onOpen={() => setSelected({ patientId: p.patientId, name: p.patientName })}
                          onSnooze={() => doSnooze(p.patientId)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {patients.length === 0 && (
                <div className="qmc-allclear">{q ? 'No patients match your search.' : 'No residents with functional decline.'}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ n, label, tone }) {
  return (
    <div className="qmc-fd-card">
      <span className={`qmc-fd-card__n qmc-text--${tone}`}>{n}</span>
      <span className="qmc-fd-card__label">{label}</span>
    </div>
  );
}

function PatientRow({ patient, tone, pending, onOpen, onSnooze }) {
  const declines = patient.declines ?? [];
  return (
    <div className="qmc-prow">
      <span className={`qmc-prow__dot qmc-dot--${tone}`} />
      <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="gg_decline" data-track-prop-view="resident" className="qmc-prow__main" onClick={onOpen}>
        <span className="qmc-prow__name">{patient.patientName}</span>
        <span className="qmc-prow__meta">
          {patient.locationName ? `${patient.locationName} · ` : ''}{declines.length} item{declines.length === 1 ? '' : 's'} declined
          {declines.length ? ` · ${declines.slice(0, 3).map((d) => d.name).join(', ')}${declines.length > 3 ? '…' : ''}` : ''}
        </span>
      </button>
      <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code="gg" data-track-prop-action="snooze_30d" className="qmc-undo" disabled={pending} onClick={onSnooze}>
        <Clock style={{ width: '14px', height: '14px' }} /> Snooze
      </button>
      <ChevronRight className="qmc-row__chev" />
    </div>
  );
}
