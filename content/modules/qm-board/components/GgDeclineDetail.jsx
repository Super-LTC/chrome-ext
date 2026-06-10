import { useState, useMemo, useEffect } from 'preact/hooks';
import { useGgDetail } from '../hooks/useGgDetail.js';
import { useSnooze } from '../hooks/useSnooze.js';
import { GgItemChart } from './GgItemChart.jsx';
import { formatShortDate } from '../utils/derive.js';
import { track } from '../../../utils/analytics.js';

/**
 * GgDeclineDetail — rich GG decline view matching the web app modal.
 */

const SHIFTS = [
  { key: 'day',     idx: 0, label: 'Day',     color: '#3b82f6' },
  { key: 'evening', idx: 1, label: 'Evening', color: '#22c55e' },
  { key: 'night',   idx: 2, label: 'Night',   color: '#a855f7' },
  { key: 'average', idx: null, label: 'Average', color: '#475569' },
];

const VALUE_LABELS = {
  '01': 'Dependent',
  '02': 'Maximal',
  '03': 'Moderate',
  '04': 'Supervision',
  '05': 'Setup',
  '06': 'Independent',
  '07': 'Refused',
  '09': 'N/A',
  '10': 'Env. limit',
  '88': 'Medical reason',
};

const SHIFT_LABELS = { 0: 'Day', 1: 'Evening', 2: 'Night' };
const SHIFT_COLORS = { 0: '#3b82f6', 1: '#22c55e', 2: '#a855f7' };

const SEVERITY_PILL_CLASS = {
  severe: 'qmb-pill qmb-pill--severe',
  moderate: 'qmb-pill qmb-pill--moderate',
  mild: 'qmb-pill qmb-pill--mild',
};

export function GgDeclineDetail({ alert, facilityName, orgSlug, onBack, mode = 'qm' }) {
  useEffect(() => {
    track('qm_drill_in', { measure_code: alert.qmId || 'gg_decline', view: 'gg_chart' });
  }, [alert.qmId]);

  const { data: gg, loading, error } = useGgDetail({
    patientId: alert.patientId,
    facilityName, orgSlug,
    days: 30,
    mode,
    enabled: true,
  });

  if (loading) {
    return (
      <div className="qmb-detail">
        <SimpleHeader alert={alert} onBack={onBack} />
        <div className="qmb-empty">Loading GG history…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="qmb-detail">
        <SimpleHeader alert={alert} onBack={onBack} />
        <div className="qmb-empty qmb-empty--error">Failed to load: {error}</div>
      </div>
    );
  }
  if (!gg?.decline) {
    return (
      <div className="qmb-detail">
        <SimpleHeader alert={alert} onBack={onBack} />
        <div className="qmb-empty">No GG decline data for this resident.</div>
      </div>
    );
  }

  return (
    <GgDeclineLoaded
      alert={alert}
      gg={gg}
      facilityName={facilityName}
      orgSlug={orgSlug}
      onBack={onBack}
    />
  );
}

function GgDeclineLoaded({ alert, gg, facilityName, orgSlug, onBack }) {
  const [shift, setShift] = useState('average');
  const [viewMode, setViewMode] = useState('charts');
  const [showBaselines, setShowBaselines] = useState(false);

  const decline = gg.decline;
  const scores = gg.scores || [];

  // Build the union of items across baselines, declines, and scores.
  const items = useMemo(() => {
    const itemMap = new Map();
    for (const b of (decline.baselines || [])) {
      itemMap.set(b.mdsKey, { mdsKey: b.mdsKey, name: b.name, baseline: b.value, rawValue: b.rawValue });
    }
    for (const d of (decline.declines || [])) {
      const existing = itemMap.get(d.mdsKey) || { mdsKey: d.mdsKey, name: d.name };
      itemMap.set(d.mdsKey, {
        ...existing,
        baseline: existing.baseline ?? d.baseline,
        worstShiftAverage: d.worstShiftAverage,
        declineMagnitude: d.declineMagnitude,
        severity: d.severity,
      });
    }
    for (const s of scores) {
      if (!s.mdsQuestionKey) continue;
      if (!itemMap.has(s.mdsQuestionKey)) {
        itemMap.set(s.mdsQuestionKey, {
          mdsKey: s.mdsQuestionKey,
          name: s.interventionName || s.mdsQuestionKey,
        });
      }
    }
    return [...itemMap.values()];
  }, [decline, scores]);

  const pointsByItem = useMemo(
    () => buildPointsByItem(scores, items, shift),
    [scores, items, shift]
  );

  const activeShiftColor = SHIFTS.find(s => s.key === shift)?.color || '#3b82f6';
  const severity = decline.overallSeverity;
  const severityClass = severity ? (SEVERITY_PILL_CLASS[severity] || 'qmb-pill') : null;

  return (
    <div className="qmb-detail">
      <div className="qmb-backbar">
        <div className="qmb-backbar__left">
          <button type="button" className="qmb-backbar__btn" onClick={onBack}>‹ Back</button> {/* NO_TRACK */}
          <span className="qmb-backbar__title">{alert.name}</span>
          {severity && <span className={severityClass}>{severity}</span>}
          <div className="qmb-backbar__subline">
            <span>{decline.locationName}</span>
            {decline.mdsArdDate && (
              // NO_TRACK
              <button
                type="button"
                className="qmb-baselines-toggle"
                onClick={() => setShowBaselines(v => !v)}
              >
                · MDS Baseline: <u>{decline.mdsArdDate}</u> <span>{showBaselines ? '▴' : '▾'}</span>
              </button>
            )}
          </div>
        </div>
        <SnoozeControls
          patientId={alert.patientId}
          snooze={gg.snooze}
          kind="gg"
          measureCode={alert.qmId || 'gg'}
          facilityName={facilityName}
          orgSlug={orgSlug}
        />
      </div>

      {showBaselines && <BaselinesPanel baselines={decline.baselines} />}

      {/* Item pills */}
      <div className="qmb-item-pills">
        {items.map(it => {
          const declineItem = (decline.declines || []).find(d => d.mdsKey === it.mdsKey);
          const isDeclined = declineItem && declineItem.declineMagnitude >= 1;
          return (
            <span
              key={it.mdsKey}
              className={`qmb-item-pill ${isDeclined ? `qmb-item-pill--${declineItem.severity || 'declined'}` : ''}`}
            >
              {it.name}
              {isDeclined && (
                <span className="qmb-item-pill__delta">
                  ↘ {declineItem.declineMagnitude.toFixed(declineItem.declineMagnitude % 1 === 0 ? 0 : 1)}pt
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* View controls — NO_TRACK: pure UI sub-elements of GG drill-in */}
      <div className="qmb-view-controls">
        <div className="qmb-seg">
          {/* NO_TRACK */}
          <button type="button"
            className={`qmb-seg__btn ${viewMode === 'charts' ? 'is-active' : ''}`}
            onClick={() => setViewMode('charts')}
          >📊 Charts</button>
          {/* NO_TRACK */}
          <button type="button"
            className={`qmb-seg__btn ${viewMode === 'table' ? 'is-active' : ''}`}
            onClick={() => setViewMode('table')}
          >≡ Table</button>
        </div>

        {viewMode === 'charts' && (
          <div className="qmb-seg">
            {SHIFTS.map(s => (
              // NO_TRACK
              <button
                key={s.key}
                type="button"
                className={`qmb-seg__btn ${shift === s.key ? 'is-active' : ''}`}
                onClick={() => setShift(s.key)}
                style={shift === s.key ? { '--active-color': s.color } : undefined}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'charts' ? (
        <div className="qmb-chart-grid">
          {items.map(it => (
            <GgItemChart
              key={it.mdsKey}
              item={it}
              points={pointsByItem.get(it.mdsKey) || []}
              shiftColor={activeShiftColor}
            />
          ))}
        </div>
      ) : (
        <ScoresTable scores={scores} />
      )}
    </div>
  );
}

/* ─── sub-components ─────────────────────────────────────────────── */

function SimpleHeader({ alert, onBack }) {
  return (
    <div className="qmb-backbar">
      <div>
        <button type="button" className="qmb-backbar__btn" onClick={onBack}>‹ Back</button> {/* NO_TRACK */}
        <span className="qmb-backbar__title">{alert.name}</span>
      </div>
    </div>
  );
}

function BaselinesPanel({ baselines }) {
  if (!baselines || !baselines.length) return null;
  return (
    <div className="qmb-baselines">
      {baselines.map(b => (
        <div className="qmb-baseline-card" key={b.mdsKey}>
          <div className="qmb-baseline-card__top">
            <span className="qmb-baseline-card__name">{b.name}</span>
            <span className="qmb-baseline-card__key">{b.mdsKey}</span>
          </div>
          <div className="qmb-baseline-card__val">
            {b.value == null ? <i>Not in MDS</i> : <b>{b.rawValue || b.value}</b>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SnoozeControls({ patientId, snooze, kind, alertId, measureCode, facilityName, orgSlug }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { snoozeGg, unsnoozeGg, snoozeAlert, unsnoozeAlert, pending } =
    useSnooze({ facilityName, orgSlug });
  const trackMeasure = measureCode || (kind === 'gg' ? 'gg' : 'unknown');

  if (snooze) {
    const until = snooze.snoozedUntil
      ? new Date(snooze.snoozedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    return (
      <button
        type="button"
        className="qmb-snooze-btn qmb-snooze-btn--active"
        data-track="qm_action_clicked"
        data-track-prop-measure-code={trackMeasure}
        data-track-prop-action="unsnooze"
        onClick={async () => {
          try {
            if (kind === 'gg') await unsnoozeGg(patientId, snooze.id);
            else await unsnoozeAlert(patientId, snooze.id);
          } catch (_) { /* hook logs */ }
        }}
        disabled={pending}
      >
        🕒 Unsnooze {until && <span className="qmb-snooze-btn__meta">· until {until}</span>}
      </button>
    );
  }

  const doSnooze = async (days) => {
    try {
      if (kind === 'gg') await snoozeGg(patientId, days, null);
      else await snoozeAlert(patientId, alertId, days, null);
    } catch (_) { /* hook logs */ }
    setMenuOpen(false);
  };

  return (
    <div className="qmb-snooze-wrap">
      {/* NO_TRACK: pure UI menu toggle; the day-pick buttons fire the real action */}
      <button
        type="button"
        className="qmb-snooze-btn"
        onClick={() => setMenuOpen(v => !v)}
        disabled={pending}
      >
        🕒 Snooze {menuOpen ? '▴' : '▾'}
      </button>
      {menuOpen && (
        <div className="qmb-snooze-menu">
          <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={trackMeasure} data-track-prop-action="snooze_1d" onClick={() => doSnooze(1)}>1 day</button>
          <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={trackMeasure} data-track-prop-action="snooze_7d" onClick={() => doSnooze(7)}>7 days</button>
          <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={trackMeasure} data-track-prop-action="snooze_30d" onClick={() => doSnooze(30)}>30 days</button>
        </div>
      )}
    </div>
  );
}

function ScoresTable({ scores }) {
  const sorted = [...scores].sort((a, b) => {
    const d = (b.recordedDate || '').localeCompare(a.recordedDate || '');
    if (d !== 0) return d;
    return (a.shiftIndex || 0) - (b.shiftIndex || 0);
  });
  return (
    <table className="qmb-scores-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Shift</th>
          <th>Item</th>
          <th>Score</th>
          <th>Aide</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(s => (
          <tr key={s.id || `${s.patientId}-${s.recordedDate}-${s.shiftIndex}-${s.mdsQuestionKey}`}>
            <td className="qmb-mono">{formatShortDate(s.recordedDate)}</td>
            <td>{SHIFT_LABELS[s.shiftIndex] || '—'}</td>
            <td>{s.interventionName || s.mdsQuestionKey}</td>
            <td>
              <b>{VALUE_LABELS[s.loggedValue] || '—'}</b>
              <span className="qmb-mono" style={{ marginLeft: 6, color: '#9ca3af' }}>({s.loggedValue})</span>
            </td>
            <td>{s.aideName || '—'}</td>
          </tr>
        ))}
        {sorted.length === 0 && (
          <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', fontStyle: 'italic' }}>No raw scores in window.</td></tr>
        )}
      </tbody>
    </table>
  );
}

/* ─── helpers ────────────────────────────────────────────────────── */

function buildPointsByItem(scores, items, shiftKey) {
  const out = new Map();
  const shiftIdx = shiftKey === 'average' ? null : SHIFTS.find(s => s.key === shiftKey)?.idx;

  for (const it of items) {
    const itemScores = scores.filter(s => s.mdsQuestionKey === it.mdsKey);
    const byDate = new Map();
    for (const s of itemScores) {
      const raw = parseInt(s.loggedValue, 10);
      if (!(raw >= 1 && raw <= 6)) continue; // skip 07/09/10/88 sentinels
      if (shiftIdx != null && s.shiftIndex !== shiftIdx) continue;

      const date = s.recordedDate;
      if (!byDate.has(date)) byDate.set(date, { values: [], entries: [] });
      const bucket = byDate.get(date);
      bucket.values.push(raw);
      bucket.entries.push({
        shift: SHIFT_LABELS[s.shiftIndex] || '—',
        shiftColor: SHIFT_COLORS[s.shiftIndex] || '#64748b',
        value: raw,
        label: VALUE_LABELS[s.loggedValue] || '—',
        aideName: s.aideName || null,
      });
    }

    const points = [...byDate.entries()]
      .map(([date, bucket]) => ({
        date,
        value: bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length,
        entries: bucket.entries,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    out.set(it.mdsKey, points);
  }
  return out;
}
