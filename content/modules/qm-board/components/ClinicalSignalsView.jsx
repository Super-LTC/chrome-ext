/**
 * Surface D — Clinical Signals (Mode 0).
 *
 * Ported from web/components/quality-measures/qm-clinical-signals-view.tsx
 * (PR #626), adapted to Preact + `qmc-` CSS + the extension's snooze hook.
 * Active | Snoozed tabs; per-resident signal modal with AlertCards; optimistic
 * dismiss/undo against the existing preventable-alert-snooze endpoints (these
 * fire super:qm-snooze-changed so the board count refreshes). Diagnosis-source
 * signals render as text-only — no evidence fetch.
 */
import { useMemo, useState } from 'preact/hooks';
import { shortLabel } from '../lib/qm-view-model.js';
import { fullName, prettyDate } from '../lib/qm-tones.js';
import {
  ALERT_META, ALERT_URGENCY, actionableAlerts, qmStakes, signalBreakdown, signalResidents, totalActionable,
} from '../lib/qm-clinical-signals.js';
import { useSnooze } from '../hooks/useSnooze.js';
import { ChevronLeft, ChevronRight, X, Activity, Undo2 } from './icons.jsx';

const DISMISS_DAYS = 30;
const sigKey = (patientId, alertId) => `${patientId}:${alertId}`;

function toast(msg, type = 'error') {
  try { if (window.SuperToast?.show) window.SuperToast.show({ message: msg, type }); else console.warn('[QM]', msg); }
  catch { /* noop */ }
}

export function ClinicalSignalsView({ preventableAlerts: data, currentlyTriggering, facilityName, orgSlug, onBack }) {
  const summary = currentlyTriggering?.summary ?? { byMeasure: {} };
  const { snoozeAlert, unsnoozeAlert } = useSnooze({ facilityName, orgSlug });

  const [tab, setTab] = useState('active');
  const [openId, setOpenId] = useState(null);
  const [sessionSnoozes, setSessionSnoozes] = useState(new Map());
  const [unsnoozed, setUnsnoozed] = useState(new Set());

  if (!data) return <div className="qmc-empty">No clinical-signal data.</div>;

  const isSnoozed = (patientId, a) => {
    const k = sigKey(patientId, a.id);
    if (unsnoozed.has(k)) return false;
    return !!a.snooze || sessionSnoozes.has(k);
  };

  async function dismiss(patientId, alertId) {
    const k = sigKey(patientId, alertId);
    const until = new Date(Date.now() + DISMISS_DAYS * 86_400_000).toISOString();
    setSessionSnoozes((prev) => new Map(prev).set(k, { id: 'pending', snoozedUntil: until }));
    setUnsnoozed((prev) => { const n = new Set(prev); n.delete(k); return n; });
    try {
      const r = await snoozeAlert(patientId, alertId, DISMISS_DAYS);
      const snz = r?.snooze ?? r;
      setSessionSnoozes((prev) => new Map(prev).set(k, { id: snz?.id ?? 'pending', snoozedUntil: snz?.snoozedUntil ?? until }));
    } catch {
      setSessionSnoozes((prev) => { const n = new Map(prev); n.delete(k); return n; });
      toast('Could not dismiss — try again');
    }
  }

  async function undo(patientId, alertId, snoozeId) {
    const k = sigKey(patientId, alertId);
    setUnsnoozed((prev) => new Set(prev).add(k));
    setSessionSnoozes((prev) => { const n = new Map(prev); n.delete(k); return n; });
    try {
      if (snoozeId && snoozeId !== 'pending') await unsnoozeAlert(patientId, snoozeId);
    } catch {
      setUnsnoozed((prev) => { const n = new Set(prev); n.delete(k); return n; });
      toast('Could not un-snooze — try again');
    }
  }

  // Active view: drop snoozed signals (and null .snooze so helpers count them).
  const liveData = useMemo(() => ({
    ...data,
    patients: data.patients.map((p) => ({
      ...p,
      events: p.events.filter((a) => !isSnoozed(p.patientId, a)).map((a) => ({ ...a, snooze: null })),
      canaries: p.canaries.filter((a) => !isSnoozed(p.patientId, a)).map((a) => ({ ...a, snooze: null })),
    })),
  }), [data, sessionSnoozes, unsnoozed]);

  const snoozedItems = useMemo(() => {
    const out = [];
    for (const p of data.patients) {
      for (const a of [...p.events, ...p.canaries]) {
        if (a.suppressedByExistingCoding || !isSnoozed(p.patientId, a)) continue;
        const session = sessionSnoozes.get(sigKey(p.patientId, a.id));
        const snz = session ?? (a.snooze ? { id: a.snooze.id, snoozedUntil: a.snooze.snoozedUntil } : null);
        out.push({ patient: p, alert: a, snoozeId: snz?.id ?? null, snoozedUntil: snz?.snoozedUntil ?? null });
      }
    }
    return out;
  }, [data, sessionSnoozes, unsnoozed]);

  const residents = signalResidents(liveData);
  const total = totalActionable(liveData);
  const breakdown = signalBreakdown(liveData);
  const stakes = qmStakes(liveData, summary);
  const open = residents.find((p) => p.patientId === openId) ?? null;

  return (
    <div className="qmc" style={{ gap: '16px' }}>
      <div className="qmc-bc">
        <button type="button" className="qmc-bc__back" onClick={onBack}><ChevronLeft /> Command Center</button> {/* NO_TRACK */}
        <span style={{ color: 'var(--slate-300)' }}>/</span>
        <div className="qmc-bc__crumb">Clinical Signals</div>
      </div>

      <div className="qmc-tabs">
        {['active', 'snoozed'].map((t) => (
          <button key={t} type="button" className={tab === t ? 'qmc-tab qmc-tab--on' : 'qmc-tab'} onClick={() => setTab(t)}> {/* NO_TRACK */}
            {t === 'active' ? 'Active' : 'Snoozed'} <span style={{ fontFamily: 'ui-monospace,monospace' }}>{t === 'active' ? total : snoozedItems.length}</span>
          </button>
        ))}
      </div>

      {tab === 'active' ? (
        <>
          <div className="qmc-hero qmc-rise qmc-hero--amber">
            <div className="qmc-eyebrow"><Activity /> Clinical Signals · {prettyDate(data.facilityDate)}</div>
            <div className="qmc-hero__big">
              <span className="qmc-hero__num">{total}</span>
              <span className="qmc-hero__sub">new clinical signals<br /><small>orders, labs &amp; diagnoses that may trip a QM at the next MDS</small></span>
            </div>
            {breakdown.length > 0 && (
              <div className="qmc-breakdown">
                {breakdown.map((b) => (
                  <span key={b.id} className="qmc-breakdown__chip"><span className="qmc-breakdown__n">{b.count}</span>{b.short}</span>
                ))}
              </div>
            )}
            {stakes.length > 0 && (
              <div className="qmc-stakes">
                <div className="qmc-seclabel" style={{ marginBottom: '4px' }}>If these get coded</div>
                {stakes.map((s) => (
                  <div key={s.qmId} className="qmc-stakes__row">
                    <span style={{ fontWeight: 500, color: 'var(--slate-800)' }}>{shortLabel(s.qmId, s.qmId)}</span>
                    <span style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--slate-400)' }}>{s.curPct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--slate-300)' }}>→</span>
                    <span className="qmc-text--amber" style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 600 }}>~{s.projPct.toFixed(1)}%</span>
                    <span style={{ fontSize: '11px', color: 'var(--slate-400)' }}>if all {s.added} code · worst case</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {residents.length === 0 ? (
            <div className="qmc-allclear">No new clinical signals — nothing trending toward a QM.</div>
          ) : (
            <div className="qmc-rows">
              {residents.map((p) => <SignalRow key={p.patientId} patient={p} onClick={() => setOpenId(p.patientId)} />)}
            </div>
          )}
        </>
      ) : (
        <SnoozedList items={snoozedItems} onUndo={undo} />
      )}

      {tab === 'active' && open && (
        <SignalModal patient={open} summary={summary} onClose={() => setOpenId(null)} onDismiss={dismiss} />
      )}
    </div>
  );
}

function SignalRow({ patient, onClick }) {
  const alerts = actionableAlerts(patient);
  return (
    <button type="button" data-track="qm_drill_in" data-track-prop-measure-code="signal" data-track-prop-view="signals" className="qmc-row" onClick={onClick}>
      <div className="qmc-row__body">
        <div className="qmc-row__name-line">
          <span className="qmc-row__name">{fullName(patient)}</span>
          {patient.externalPatientId && <span className="qmc-row__meta">{patient.externalPatientId}</span>}
        </div>
        <div className="qmc-row__pills">
          {alerts.map((a, i) => {
            const tone = ALERT_URGENCY[a.urgency]?.tone ?? 'slate';
            return (
              <span key={`${a.id}-${i}`} className={`qmc-chip qmc-chip--${tone}`}>
                <span className={`qmc-dot qmc-dot--${tone}`} style={{ width: '6px', height: '6px' }} />
                {ALERT_META[a.id]?.short ?? a.id}
              </span>
            );
          })}
        </div>
      </div>
      <ChevronRight className="qmc-row__chev" />
    </button>
  );
}

function SnoozedList({ items, onUndo }) {
  if (items.length === 0) return <div className="qmc-empty">Nothing snoozed.</div>;
  return (
    <div className="qmc-rows">
      {items.map(({ patient, alert, snoozeId, snoozedUntil }, i) => (
        <div key={`${patient.patientId}-${alert.id}-${i}`} className="qmc-snoozed">
          <div className="qmc-row__body">
            <div className="qmc-row__name-line">
              <span className="qmc-row__name" style={{ color: 'var(--slate-700)' }}>{fullName(patient)}</span>
              <span className="qmc-chip qmc-chip--slate">{ALERT_META[alert.id]?.short ?? alert.id}</span>
              <span className="qmc-row__meta">→ {shortLabel(alert.qmId, alert.qmId)}</span>
            </div>
            {snoozedUntil && <div className="qmc-row__meta" style={{ marginTop: '2px' }}>snoozed until {prettyDate(snoozedUntil)}</div>}
          </div>
          <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={alert.qmId} data-track-prop-action="unsnooze" className="qmc-undo" onClick={() => onUndo(patient.patientId, alert.id, snoozeId)}>
            <Undo2 /> Undo
          </button>
        </div>
      ))}
    </div>
  );
}

function SignalModal({ patient, summary, onClose, onDismiss }) {
  const alerts = actionableAlerts(patient);
  return (
    <div className="qmc qmc-modal-overlay" onClick={onClose}>
      <div className="qmc-modal qmc-modal-in" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="qmc-modal__head">
          <div style={{ minWidth: 0 }}>
            <div className="qmc-modal__name">{fullName(patient)}</div>
            <div className="qmc-modal__meta">{patient.externalPatientId ?? '—'} · {alerts.length} clinical signal{alerts.length === 1 ? '' : 's'}</div>
          </div>
          <button type="button" className="qmc-modal__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
        </div>
        <div className="qmc-modal__body">
          {alerts.map((a, i) => <AlertCard key={`${a.id}-${i}`} alert={a} summary={summary} onDismiss={() => onDismiss(patient.patientId, a.id)} />)}
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert, summary, onDismiss }) {
  const tone = ALERT_URGENCY[alert.urgency]?.tone ?? 'slate';
  const dodgeable = ALERT_META[alert.id]?.dodgeable;
  const counts = summary.byMeasure?.[alert.qmId];
  return (
    <div className="qmc-msec">
      <div className="qmc-msec__head">
        <span className={`qmc-chip qmc-chip--${tone}`}>
          <span className={`qmc-dot qmc-dot--${tone}`} style={{ width: '6px', height: '6px' }} />
          {ALERT_META[alert.id]?.short ?? alert.id}
        </span>
        <span className="qmc-msec__title">→ {shortLabel(alert.qmId, alert.qmId)}</span>
        <span className={`qmc-tag ${dodgeable ? 'qmc-tag--star' : 'qmc-tag--state'}`}>{dodgeable ? 'act before MDS' : 'open MDS now'}</span>
        <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={alert.qmId} data-track-prop-action="snooze_30d" className="qmc-dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
      <div className="qmc-sig-list">
        {alert.signals.slice(0, 4).map((s, i) => (
          <div key={`${s.refId ?? i}`} className="qmc-sig">
            <span className="qmc-sig__src">{s.source}</span>
            <span className="qmc-sig__text">{s.text}</span>
            <span className="qmc-sig__date">{prettyDate(s.date)}</span>
          </div>
        ))}
      </div>
      <div className="qmc-action-box"><strong>Action:</strong> {alert.suggestedAction}</div>
      {counts && counts.applicable - counts.excluded > 0 && (
        <div className="qmc-row__meta" style={{ marginTop: '6px' }}>
          {shortLabel(alert.qmId, alert.qmId)} rate today: {((100 * counts.triggering) / Math.max(1, counts.applicable - counts.excluded)).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
