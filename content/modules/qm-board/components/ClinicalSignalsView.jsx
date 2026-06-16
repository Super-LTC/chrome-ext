/**
 * Surface D — Clinical Signals (Mode 0). Most-changed surface (PR #645).
 *
 * Ported from web/components/quality-measures/qm-clinical-signals-view.tsx,
 * adapted to Preact + `qmc-` CSS + the extension's snooze hook.
 *
 *  - Active | Snoozed tabs.
 *  - Clickable breakdown chips filter the worklist to one alert type.
 *  - Stakes block + What-if switch: each non-excluded signal gets Skip | Code,
 *    the projected QM rate recomputes live (qmStakes(data, summary, codedSet)).
 *  - One row PER signal: confidence-named (alertName, color by a.urgency),
 *    act-before-MDS / open-MDS-now badge, dated added-date (signalDateVerb),
 *    its own Dismiss (or Skip|Code in what-if).
 *  - Exclusions render green ("won't count") and never enter the what-if.
 *  - Optimistic dismiss/undo via the existing preventable-alert-snooze endpoints
 *    (fire super:qm-snooze-changed). Diagnosis signals are text-only.
 */
import { useMemo, useState } from 'preact/hooks';
import { shortLabel } from '../lib/qm-view-model.js';
import { fullName, prettyDate } from '../lib/qm-tones.js';
import {
  ALERT_META, ALERT_URGENCY, alertName, alertIsExcluded, signalDateVerb, signalKey,
  actionableAlerts, qmStakes, signalBreakdown, signalResidents, totalActionable,
} from '../lib/qm-clinical-signals.js';
import { useSnooze } from '../hooks/useSnooze.js';
import { ChevronLeft, X, Activity, Undo2 } from './icons.jsx';

const DISMISS_DAYS = 30;

function toast(msg, type = 'error') {
  try { if (window.SuperToast?.show) window.SuperToast.show({ message: msg, type }); else console.warn('[QM]', msg); }
  catch { /* noop */ }
}

/**
 * Collapsed "added" date for a list row. Signals are sorted date-descending, so
 * signals[0] is the most-recent and signals[0].date === latestSignalDate (the
 * canonical "when this last showed up" — NOT first appearance, which isn't
 * exposed). Verb tracks that most-recent signal's source. The modal shows the
 * full per-signal breakdown with its own dated verb each.
 */
function addedLine(a) {
  const s = a.signals?.[0];
  const date = a.latestSignalDate || s?.date;
  if (!date) return '';
  return `${s ? signalDateVerb(s.source) : 'recorded'} ${prettyDate(date)}`;
}

export function ClinicalSignalsView({ preventableAlerts: data, currentlyTriggering, facilityName, orgSlug, onBack, initialOpenPatientId }) {
  const summary = currentlyTriggering?.summary ?? { byMeasure: {} };
  const { snoozeAlert, unsnoozeAlert } = useSnooze({ facilityName, orgSlug });

  const [tab, setTab] = useState('active');
  const [chip, setChip] = useState(null);          // alertId filter | null
  // Deep-link: a Focus "Watch" signal click seeds the resident modal open.
  const [openId, setOpenId] = useState(initialOpenPatientId ?? null); // resident modal
  const [whatIf, setWhatIf] = useState(false);
  const [skipped, setSkipped] = useState(new Set()); // signalKeys marked Skip
  const [sessionSnoozes, setSessionSnoozes] = useState(new Map());
  const [unsnoozed, setUnsnoozed] = useState(new Set());

  if (!data) return <div className="qmc-empty">No clinical-signal data.</div>;

  const isSnoozed = (patientId, a) => {
    const k = signalKey(patientId, a.id);
    if (unsnoozed.has(k)) return false;
    return !!a.snooze || sessionSnoozes.has(k);
  };

  async function dismiss(patientId, alertId) {
    const k = signalKey(patientId, alertId);
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
    const k = signalKey(patientId, alertId);
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
        const session = sessionSnoozes.get(signalKey(p.patientId, a.id));
        const snz = session ?? (a.snooze ? { id: a.snooze.id, snoozedUntil: a.snooze.snoozedUntil } : null);
        out.push({ patient: p, alert: a, snoozeId: snz?.id ?? null, snoozedUntil: snz?.snoozedUntil ?? null });
      }
    }
    return out;
  }, [data, sessionSnoozes, unsnoozed]);

  const residents = signalResidents(liveData);
  const total = totalActionable(liveData);
  const breakdown = signalBreakdown(liveData);

  // What-if: coded = every non-excluded actionable signal not marked Skip.
  const codedSet = useMemo(() => {
    const s = new Set();
    for (const p of liveData.patients)
      for (const a of actionableAlerts(p)) {
        if (alertIsExcluded(a)) continue;
        const k = signalKey(p.patientId, a.id);
        if (!skipped.has(k)) s.add(k);
      }
    return s;
  }, [liveData, skipped]);
  const stakes = whatIf ? qmStakes(liveData, summary, codedSet) : qmStakes(liveData, summary);

  const setSkip = (patientId, alertId, value) => setSkipped((prev) => {
    const k = signalKey(patientId, alertId);
    const n = new Set(prev);
    if (value) n.add(k); else n.delete(k);
    return n;
  });

  const open = residents.find((p) => p.patientId === openId) ?? null;
  const shownResidents = chip ? residents.filter((p) => actionableAlerts(p).some((a) => a.id === chip)) : residents;

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
                  <button key={b.id} type="button" /* NO_TRACK */
                    className={`qmc-breakdown__chip ${chip === b.id ? 'qmc-breakdown__chip--on' : ''}`}
                    onClick={() => setChip(chip === b.id ? null : b.id)}>
                    <span className="qmc-breakdown__n">{b.count}</span>{b.short}
                  </button>
                ))}
                {chip && (
                  <button type="button" className="qmc-reset" onClick={() => setChip(null)}><X /> clear filter</button> /* NO_TRACK */
                )}
              </div>
            )}

            {stakes.length > 0 && (
              <div className="qmc-stakes">
                <div className="qmc-stakes__head">
                  <span className="qmc-seclabel" style={{ margin: 0 }}>If these get coded</span>
                  <span className="qmc-wif__row">
                    <span className="qmc-pts__hint">What-if</span>
                    <button type="button" role="switch" aria-checked={whatIf} onClick={() => setWhatIf((v) => !v)} /* NO_TRACK */
                      className={`qmc-switch ${whatIf ? 'qmc-switch--on' : ''}`}><span className="qmc-switch__knob" /></button>
                  </span>
                </div>
                {stakes.map((s) => (
                  <div key={s.qmId} className="qmc-stakes__row">
                    <span style={{ fontWeight: 500, color: 'var(--slate-800)' }}>{shortLabel(s.qmId, s.qmId)}</span>
                    <span style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--slate-400)' }}>{s.curPct.toFixed(1)}%</span>
                    <span style={{ color: 'var(--slate-300)' }}>→</span>
                    <span className="qmc-text--amber" style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 600 }}>{whatIf ? '' : '~'}{s.projPct.toFixed(1)}%</span>
                    <span style={{ fontSize: '11px', color: 'var(--slate-400)' }}>{whatIf ? `${s.added} coded` : `if all ${s.added} code · worst case`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {shownResidents.length === 0 ? (
            <div className="qmc-allclear">No new clinical signals — nothing trending toward a QM.</div>
          ) : (
            <div className="qmc-worklist">
              {shownResidents.map((p) => {
                const signals = actionableAlerts(p).filter((a) => !chip || a.id === chip);
                return (
                  <div key={p.patientId} className="qmc-sigblock">
                    <button type="button" className="qmc-sigblock__name" onClick={() => setOpenId(p.patientId)} /* NO_TRACK */>
                      {fullName(p)}{p.externalPatientId ? <span className="qmc-row__meta"> · {p.externalPatientId}</span> : null}
                    </button>
                    <div className="qmc-rows">
                      {signals.map((a, i) => (
                        <SignalLine key={`${a.id}-${i}`} patient={p} alert={a} whatIf={whatIf}
                          skipped={skipped.has(signalKey(p.patientId, a.id))}
                          onOpen={() => setOpenId(p.patientId)}
                          onSkip={() => setSkip(p.patientId, a.id, true)}
                          onCode={() => setSkip(p.patientId, a.id, false)}
                          onDismiss={() => dismiss(p.patientId, a.id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
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

function SignalLine({ patient, alert: a, whatIf, skipped, onOpen, onSkip, onCode, onDismiss }) {
  // Keep row clicks (open the detail modal) separate from the inline action buttons.
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const onKeyDown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } };
  const rowProps = {
    role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown,
    'aria-label': `${alertName(a)} — open detail`,
  };
  if (alertIsExcluded(a)) {
    const ex = a.exclusions[0];
    return (
      <div className="qmc-sigline qmc-sigline--excluded qmc-sigline--clickable" {...rowProps}>
        <div className="qmc-sigline__main">
          <span className="qmc-chip qmc-chip--emerald"><span className="qmc-dot qmc-dot--emerald" style={{ width: '6px', height: '6px' }} />{alertName(a)}</span>
          <span className="qmc-sigline__qm">→ {shortLabel(a.qmId, a.qmId)}</span>
          <span className="qmc-text--emerald" style={{ fontSize: '11px', fontWeight: 600 }}>excluded · won't count</span>
        </div>
        <div className="qmc-sigline__sub">Excluded: {ex.description}{ex.code ? ` (${ex.code})` : ''}{ex.date ? ` · documented ${prettyDate(ex.date)}` : ''}</div>
      </div>
    );
  }
  const tone = ALERT_URGENCY[a.urgency]?.tone ?? 'slate';
  return (
    <div className="qmc-sigline qmc-sigline--clickable" {...rowProps}>
      <div className="qmc-sigline__main">
        <span className={`qmc-chip qmc-chip--${tone}`}><span className={`qmc-dot qmc-dot--${tone}`} style={{ width: '6px', height: '6px' }} />{alertName(a)}</span>
        <span className="qmc-sigline__qm">→ {shortLabel(a.qmId, a.qmId)}</span>
        <span className={`qmc-tag ${ALERT_META[a.id]?.dodgeable ? 'qmc-tag--star' : 'qmc-tag--state'}`}>{ALERT_META[a.id]?.dodgeable ? 'act before MDS' : 'open MDS now'}</span>
        <span className="qmc-sigline__date">{addedLine(a)}</span>
        {whatIf ? (
          <div className="qmc-toggle qmc-sigline__act">
            <button type="button" className={skipped ? 'qmc-toggle--kept' : ''} onClick={stop(onSkip)}>Skip</button> {/* NO_TRACK */}
            <button type="button" className={!skipped ? 'qmc-toggle--on' : ''} onClick={stop(onCode)}>Code</button> {/* NO_TRACK */}
          </div>
        ) : (
          <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={a.qmId} data-track-prop-action="snooze_30d" className="qmc-dismiss qmc-sigline__act" onClick={stop(onDismiss)}>Dismiss</button>
        )}
      </div>
    </div>
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
              <span className="qmc-chip qmc-chip--slate">{alertName(alert)}</span>
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

function AlertCard({ alert: a, summary, onDismiss }) {
  const excluded = alertIsExcluded(a);
  const tone = excluded ? 'emerald' : (ALERT_URGENCY[a.urgency]?.tone ?? 'slate');
  const counts = summary.byMeasure?.[a.qmId];
  const ex = a.exclusions?.[0];
  return (
    <div className="qmc-msec">
      <div className="qmc-msec__head">
        <span className={`qmc-chip qmc-chip--${tone}`}>
          <span className={`qmc-dot qmc-dot--${tone}`} style={{ width: '6px', height: '6px' }} />
          {alertName(a)}
        </span>
        <span className="qmc-msec__title">→ {shortLabel(a.qmId, a.qmId)}</span>
        {excluded ? (
          <span className="qmc-tag qmc-tag--star" style={{ background: 'var(--emerald-50)', color: 'var(--emerald-700)', borderColor: 'var(--emerald-200)' }}>won't count</span>
        ) : (
          <>
            <span className={`qmc-tag ${ALERT_META[a.id]?.dodgeable ? 'qmc-tag--star' : 'qmc-tag--state'}`}>{ALERT_META[a.id]?.dodgeable ? 'act before MDS' : 'open MDS now'}</span>
            <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={a.qmId} data-track-prop-action="snooze_30d" className="qmc-dismiss" onClick={onDismiss}>Dismiss</button>
          </>
        )}
      </div>

      {excluded && ex && (
        <div className="qmc-action-box" style={{ background: 'var(--emerald-50)', borderColor: 'var(--emerald-200)', color: 'var(--emerald-700)' }}>
          Excluded: {ex.description}{ex.code ? ` (${ex.code})` : ''}{ex.date ? ` · documented ${prettyDate(ex.date)}` : ''}
        </div>
      )}

      <div className="qmc-sig-list">
        {(a.signals ?? []).slice(0, 4).map((s, i) => (
          <div key={`${s.refId ?? i}`} className="qmc-sig">
            <span className="qmc-sig__src">{s.source}</span>
            <span className="qmc-sig__text">{s.text}</span>
            <span className="qmc-sig__date">{signalDateVerb(s.source)} {prettyDate(s.date)}</span>
          </div>
        ))}
      </div>

      {!excluded && <div className="qmc-action-box"><strong>Action:</strong> {a.suggestedAction}</div>}
      {counts && counts.applicable - counts.excluded > 0 && (
        <div className="qmc-row__meta" style={{ marginTop: '6px' }}>
          {shortLabel(a.qmId, a.qmId)} rate today: {((100 * counts.triggering) / Math.max(1, counts.applicable - counts.excluded)).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
