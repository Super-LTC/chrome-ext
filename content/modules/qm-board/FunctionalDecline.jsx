/**
 * Surface E — Functional Decline (a screen INSIDE the QM Command Center).
 *
 * GG decline is its own screen, reached from a button on the QM dashboard
 * (not its own FAB). Facility roster grouped by overallSeverity, a Therapy
 * Pickup / QM Decline mode toggle, search, snooze, and the existing per-patient
 * GG chart (GgDeclineDetail) on click.
 *
 *   GET /api/extension/qm-planner/gg-decline-dashboard?facilityName&orgSlug&mode
 *   per-patient drill-in + GG snooze reuse the existing GG endpoints.
 */
import { useState, useMemo, useEffect, useCallback } from 'preact/hooks';
import { track } from '../../utils/analytics.js';
import { useGgDashboard } from './hooks/useGgDashboard.js';
import { useSnooze } from './hooks/useSnooze.js';
import { GgDeclineDetail } from './components/GgDeclineDetail.jsx';
import { QmLoading } from './components/QmLoading.jsx';
import { AideScoringView } from './aide-scoring/AideScoringView.jsx';
import { ChevronLeft, ChevronRight, Search, X, Clock, Undo2, Info } from './components/icons.jsx';

const TABS = [
  { value: 'residents', label: 'Residents' },
  { value: 'aides', label: 'Aides' },
];

const MODES = [
  { value: 'therapy', label: 'Therapy Pickup' },
  { value: 'qm', label: 'QM Decline' },
];
const SEVERITY_GROUPS = [
  { key: 'severe',   label: 'Severe',   tone: 'rose' },
  { key: 'moderate', label: 'Moderate', tone: 'amber' },
  { key: 'mild',     label: 'Mild',     tone: 'sky' },
];

export function FunctionalDeclineView({ facilityName, orgSlug, onBack }) {
  const [tab, setTab] = useState('residents');
  const [mode, setMode] = useState('therapy');
  const [query, setQuery] = useState('');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [selected, setSelected] = useState(null); // { patientId, name } | null

  useEffect(() => { track('functional_decline_opened', { source: 'qm_board' }); }, []);

  const { data, loading, error, retry } = useGgDashboard({ facilityName, orgSlug, mode });
  const { snoozeGg, unsnoozeGg, pending } = useSnooze({ facilityName, orgSlug });

  const q = query.trim().toLowerCase();
  const patients = useMemo(() => (data?.patients ?? []).filter((p) => !q || p.patientName.toLowerCase().includes(q)), [data, q]);
  const snoozed = data?.snoozedPatients ?? [];
  const summary = data?.summary ?? { total: 0, withDecline: 0, severe: 0, moderate: 0, mild: 0, snoozed: 0 };

  const doSnooze = useCallback(async (patientId) => { try { await snoozeGg(patientId, 30, null); } catch { /* hook logs */ } }, [snoozeGg]);
  const doUnsnooze = useCallback(async (patientId, snoozeId) => { try { await unsnoozeGg(patientId, snoozeId); } catch { /* hook logs */ } }, [unsnoozeGg]);

  // Per-patient drill-in (reuses the GG chart view, which has its own back bar).
  if (selected) {
    return (
      <div className="qmc">
        <GgDeclineDetail
          alert={{ patientId: selected.patientId, name: selected.name, qmId: 'gg_decline' }}
          facilityName={facilityName} orgSlug={orgSlug} mode={mode}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="qmc" style={{ gap: '16px' }}>
      {/* Breadcrumb back to the Command Center */}
      <div className="qmc-bc">
        <button type="button" className="qmc-bc__back" onClick={onBack}><ChevronLeft /> Command Center</button> {/* NO_TRACK */}
        <span style={{ color: 'var(--slate-300)' }}>/</span>
        <div className="qmc-bc__crumb">Functional Decline</div>
        {tab === 'aides' && (
          <>
            <span style={{ color: 'var(--slate-300)' }}>/</span>
            <div className="qmc-bc__crumb">Aides</div>
          </>
        )}
      </div>

      {/* Top-level Residents | Aides toggle */}
      <div className="qmc-tabs">
        {TABS.map((t) => (
          <button key={t.value} type="button" className={tab === t.value ? 'qmc-tab qmc-tab--on' : 'qmc-tab'} onClick={() => setTab(t.value)}> {/* NO_TRACK */}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'aides' ? (
        <AideScoringView facilityName={facilityName} orgSlug={orgSlug} />
      ) : loading ? (
        <QmLoading title="Loading functional-decline roster" />
      ) : error ? (
        <div className="qmc-error">
          <div>Failed to load decline data</div>
          <div className="qmc-error__detail">{error}</div>
          <button type="button" className="qmc-retry" onClick={retry}>Retry</button> {/* NO_TRACK */}
        </div>
      ) : (
        <>
          {/* Mode toggle + search */}
          <div className="qmc-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="qmc-tabs">
                {MODES.map((m) => (
                  <button key={m.value} type="button" className={mode === m.value ? 'qmc-tab qmc-tab--on' : 'qmc-tab'} onClick={() => { setMode(m.value); setQuery(''); }}> {/* NO_TRACK */}
                    {m.label}
                  </button>
                ))}
              </div>
              <button type="button" className={`qmc-info-btn ${showInfo ? 'qmc-info-btn--on' : ''}`} onClick={() => setShowInfo((v) => !v)} aria-label="What's this?"> {/* NO_TRACK */}
                <Info />
              </button>
            </div>
            <div className="qmc-search">
              <Search />
              <input value={query} onInput={(e) => setQuery(e.target.value)} placeholder="Search patients" />
              {query && <button type="button" className="qmc-search__clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button> /* NO_TRACK */}
            </div>
          </div>

          {showInfo && <DeclineExplainer mode={mode} onClose={() => setShowInfo(false)} />}

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
        </>
      )}
    </div>
  );
}

function DeclineExplainer({ mode, onClose }) {
  return (
    <div className="qmc-explain">
      <button type="button" className="qmc-explain__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
      <div className="qmc-explain__lead">
        <strong>Functional Decline</strong> is an <em>early-warning</em> screen: it compares each resident's
        <strong> daily CNA GG documentation</strong> against their <strong>baseline from the last completed MDS</strong> —
        catching decline <em>before</em> it locks on the next assessment. (The QM Board, by contrast, reads CMS measures
        off already-locked MDS pairs.)
      </div>
      <div className="qmc-explain__modes">
        <div className={`qmc-explain__mode ${mode === 'therapy' ? 'qmc-explain__mode--on' : ''}`}>
          <div className="qmc-explain__mode-name">Therapy Pickup</div>
          <div className="qmc-explain__mode-sub">Find sustained declines worth a therapy eval — less noise.</div>
          <ul className="qmc-explain__list">
            <li><b>7-day</b> lookback of CNA scores</li>
            <li><b>75%</b> of shift scores must be below baseline</li>
            <li>≥3 scores per shift</li>
          </ul>
        </div>
        <div className={`qmc-explain__mode ${mode === 'qm' ? 'qmc-explain__mode--on' : ''}`}>
          <div className="qmc-explain__mode-name">QM Decline</div>
          <div className="qmc-explain__mode-sub">Early warning before the ADL-Decline QM trips — more sensitive.</div>
          <ul className="qmc-explain__list">
            <li><b>3-day</b> lookback of CNA scores</li>
            <li><b>100%</b> of shift scores must be below baseline</li>
            <li>≥2 scores per shift</li>
          </ul>
        </div>
      </div>
      <div className="qmc-explain__foot">
        Both modes track the same 5 GG items (Eating, Sit-to-Lying, Sit-to-Stand, Toilet Transfer, Walk&nbsp;10ft).
        Alert when Walk&nbsp;10ft drops ≥1pt, or any other item drops ≥2pt (or ≥1pt across 2+ items). A resident can
        surface here before the QM Board flags them — that's by design.
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

const SEV_TONE = { severe: 'rose', moderate: 'amber', mild: 'sky' };
const fmtGg = (v) => (v == null ? '—' : Number.isInteger(v) ? `${v}` : v.toFixed(1));

function PatientRow({ patient, tone, pending, onOpen, onSnooze }) {
  const declines = patient.declines ?? [];
  return (
    <div className="qmc-prow qmc-prow--fd">
      <span className={`qmc-prow__dot qmc-dot--${tone}`} />
      <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="gg_decline" data-track-prop-view="resident" className="qmc-prow__main" onClick={onOpen}>
        <span className="qmc-prow__name-row">
          <span className="qmc-prow__name">{patient.patientName}</span>
          {patient.locationName && <span className="qmc-row__meta">{patient.locationName}</span>}
        </span>
        <div className="qmc-fd-chips">
          {declines.length === 0 && <span className="qmc-row__meta">decline flagged — open for detail</span>}
          {declines.map((d) => {
            const t = SEV_TONE[d.severity] ?? 'slate';
            return (
              <span key={d.mdsKey} className={`qmc-chip qmc-chip--${t}`} title={`${d.name}: baseline ${fmtGg(d.baseline)} → worst ${fmtGg(d.worstShiftAverage)} (−${fmtGg(d.declineMagnitude)})`}>
                <span className="qmc-fd-chip__name">{d.name}</span>
                <b className="qmc-fd-chip__val">{fmtGg(d.baseline)}<span className="qmc-fd-chip__arrow"> ↓ </span>{fmtGg(d.worstShiftAverage)}</b>
              </span>
            );
          })}
        </div>
      </button>
      <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code="gg" data-track-prop-action="snooze_30d" className="qmc-undo" disabled={pending} onClick={onSnooze}>
        <Clock style={{ width: '14px', height: '14px' }} /> Snooze
      </button>
      <ChevronRight className="qmc-row__chev" />
    </div>
  );
}
