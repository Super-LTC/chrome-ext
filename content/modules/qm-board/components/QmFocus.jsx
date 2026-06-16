/**
 * Focus mode — the QM board landing (web PR #672).
 *
 * "What do I do this week": the residents you can clear before the quarter
 * locks, plus the freshest clinical signals to watch. Everything else lives one
 * click away on the full board. Ported from qm-focus.reference.tsx, adapted to
 * Preact + the `qmc-`/`qmf-` CSS tone system.
 *
 * Reads off the single board payload (currentlyTriggering + upcoming + alerts).
 * Focus is implicitly the Five-Star "what to do now" view — no lens toggle here
 * (that's board-only); it's handed lens='five_star' from QMBoard.
 */
import { useState } from 'preact/hooks';
import {
  clearGroupForRow, clearGroupForEntry, rowClearsThisQuarter, rowForLens, shortLabel,
} from '../lib/qm-view-model.js';
import { clearTiming, fullName, prettyDate, quarterLabel } from '../lib/qm-tones.js';
import { alertName, signalKey } from '../lib/qm-clinical-signals.js';
import { useSnooze } from '../hooks/useSnooze.js';
import { ArrowRight, ChevronRight, Activity, ClipboardCheck, Star, ArrowUp, ArrowDown } from './icons.jsx';

/** Default snooze length when a nurse dismisses a signal (matches the signals view). */
const DISMISS_DAYS = 30;

/** Calendar days from an ISO date to today (today − iso); date part only. */
function daysAgo(todayIso, iso) {
  const a = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}
function agoLabel(todayIso, iso) {
  if (!iso) return '';
  const d = daysAgo(todayIso, iso);
  return d <= 0 ? 'Today' : d === 1 ? '1d' : `${d}d`;
}

/** Soonest clearing date among a row's triggering clear_mds measures (for sort/primary). */
function clearDateOf(m) {
  return m.cliffInfo?.earliestClearDate ?? m.clearGuidance?.clearDate ?? '9999-12-31';
}
function primaryClearEntry(row) {
  return row.measures
    .filter((m) => m.triggers && clearGroupForEntry(m) === 'clear_mds')
    .sort((a, b) => clearDateOf(a).localeCompare(clearDateOf(b)))[0];
}

export function QmFocus({
  data, upcoming, alerts, prediction, lens = 'five_star', facilityState,
  facilityName, orgSlug, onOpenBoard, onOpenResident, onOpenSignals,
}) {
  const [dismissed, setDismissed] = useState(new Set());
  const { snoozeAlert } = useSnooze({ facilityName, orgSlug });

  // Optimistic dismiss → snooze (same endpoint/length as the full signals view).
  async function dismissSignal(patientId, alertId) {
    const key = signalKey(patientId, alertId);
    setDismissed((prev) => new Set(prev).add(key));
    try {
      await snoozeAlert(patientId, alertId, DISMISS_DAYS);
    } catch {
      /* optimistic — keep it dismissed locally even if the snooze call fails */
    }
  }

  const summary = data.summary;
  const today = data.facilityDate ?? '';
  const qEnd = summary.currentQuarterEnd;
  const qDays = summary.daysUntilQuarterEnd;

  const allRows = data.patients.map((p) => rowForLens(p, lens, facilityState));
  const triggering = allRows.filter((r) => r.triggeringCount > 0);

  const clearThisWeek = triggering
    .filter((r) => clearGroupForRow(r) === 'clear_mds' && rowClearsThisQuarter(r, qEnd))
    .map((r) => ({ row: r, entry: primaryClearEntry(r) }))
    .filter((x) => !!x.entry)
    .sort((a, b) => clearDateOf(a.entry).localeCompare(clearDateOf(b.entry)))
    .slice(0, 6);

  // Signals arrive pre-pruned to the last 7 days + newest-first from the server.
  // Just flatten, drop suppressed/snoozed/locally-dismissed, take the top ~5.
  const watch = (alerts?.patients ?? [])
    .flatMap((p) => [...p.events, ...p.canaries].map((a) => ({ a, p })))
    .filter(({ a }) => !a.suppressedByExistingCoding && !a.snooze)
    .filter(({ a, p }) => !dismissed.has(signalKey(p.patientId, a.id)))
    .sort((x, y) => (y.a.latestSignalDate || '').localeCompare(x.a.latestSignalDate || ''))
    .slice(0, 5);

  const clinicalCount = triggering.filter((r) => clearGroupForRow(r) === 'clinical').length;
  const lockedCount = triggering.filter((r) => clearGroupForRow(r) === 'locked').length;
  const nextQuarterCount = triggering.filter(
    (r) => clearGroupForRow(r) === 'clear_mds' && !rowClearsThisQuarter(r, qEnd)
  ).length;
  const crosserCount = upcoming?.upcomingPatients?.length ?? 0;
  const clearCount = allRows.length - triggering.length;

  const cliffTone = qDays <= 14 ? 'rose' : qDays <= 30 ? 'amber' : 'sky';
  const cliffFrac = Math.max(0.03, Math.min(1, qDays / 91));

  return (
    <div className="qmc qmf">
      {/* ── header: what to do this week + quarter cliff ── */}
      <div className="qmc-hero qmc-rise">
        <div className="qmc-hero__top">
          <div>
            <div className="qmc-eyebrow"><ClipboardCheck /> Focus · what to do this week</div>
            <div className="qmc-hero__big">
              <span className="qmc-hero__num">{clearThisWeek.length}</span>
              <span className="qmc-hero__sub">
                to clear this quarter · <b>{watch.length}</b> to watch<br />
                <small>{triggering.length} of {allRows.length} triggering · {summary.longStayPatients} long / {summary.shortStayPatients} short</small>
              </span>
            </div>
          </div>
          <div className="qmf-head__right">
            {/* Predicted-★ chip — board-only predictor surfaced compactly in Focus.
                Hidden under the QIP lens and when CMS hasn't matched/published. */}
            {prediction?.available && prediction.anchor.qm != null && lens !== 'qip' && (
              <div className="qmf-pchip">
                <div className="qmf-pchip__label">Predicted QM</div>
                <div className="qmf-pchip__row">
                  <Star className="qmf-star qmf-star--on" fill="currentColor" />
                  <span className="qmf-pchip__num">{prediction.predicted.overall.predictedStar ?? prediction.anchor.qm}</span>
                  {prediction.predicted.overall.trend === 'up' && <ArrowUp className="qmc-text--emerald qmf-fs__trend" />}
                  {prediction.predicted.overall.trend === 'down' && <ArrowDown className="qmc-text--rose qmf-fs__trend" />}
                </div>
                <div className="qmf-pchip__cms">CMS {prediction.anchor.qm}★</div>
              </div>
            )}
            <div className="qmc-quarter">
              <div className="qmc-quarter__row">
                <div className="qmc-quarter__label"><Activity /> {quarterLabel(qEnd)} locks {prettyDate(qEnd)}</div>
                <div className={`qmc-quarter__days qmc-text--${cliffTone}`}>{qDays}<span>d</span></div>
              </div>
              <div className="qmc-bar">
                <div className={`qmc-bar__fill qmc-bar__fill--${cliffTone === 'rose' ? 'rose' : cliffTone === 'amber' ? 'amber' : 'sky'}`}
                     style={{ width: `${cliffFrac * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── clear this week ── */}
      <div>
        <div className="qmf-sec__head">
          <span className="qmc-dot qmc-dot--emerald" />
          <span className="qmf-sec__label">Clear this week</span>
          <span className="qmf-sec__count">{clearThisWeek.length}</span>
          <span className="qmf-sec__hint">· schedule an assessment — these move this quarter's star</span>
        </div>
        {clearThisWeek.length === 0 ? (
          <div className="qmc-empty">Nothing clearable before the quarter locks.</div>
        ) : (
          <div className="qmf-list">
            {clearThisWeek.map(({ row, entry }) => {
              const time = clearTiming(entry, row, today);
              return (
                <button key={row.patientId} type="button" data-track="qm_drill_in" data-track-prop-measure-code={entry.id} data-track-prop-view="focus_clear"
                  className="qmf-clearrow" onClick={() => onOpenResident(row, entry)}>
                  <span className="qmf-clearrow__icon"><ClipboardCheck /></span>
                  <div className="qmf-clearrow__body">
                    <div className="qmf-clearrow__name">
                      {fullName(row)}
                      <span className="qmf-clearrow__meta">
                        {row.stayType}{row.payerClassification ? ` · ${row.payerClassification}` : ''}{row.target ? ` · MDS ${prettyDate(row.target.ardDate)}` : ''}
                      </span>
                    </div>
                    <div className="qmf-clearrow__action">
                      <span className="qmc-text--slate">Clears</span>
                      <span className="qmc-chip qmc-chip--emerald">{shortLabel(entry.id, entry.label)}</span>
                      <span className="qmc-text--slate">· schedule an MDS</span>
                    </div>
                  </div>
                  <span className="qmc-clearchip qmc-clearchip--emerald">{time.short}</span>
                  <ChevronRight className="qmf-clearrow__chev" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── watch: freshest clinical signals ── */}
      <div>
        <div className="qmf-sec__head">
          <span className="qmc-dot qmc-dot--sky" />
          <span className="qmf-sec__label">Watch — new clinical signals</span>
          <span className="qmf-sec__count">{watch.length}</span>
          <span className="qmf-sec__hint">· last 7 days · newest first · may trip a QM at the next MDS</span>
        </div>
        {watch.length === 0 ? (
          <div className="qmc-empty">No new signals this week.</div>
        ) : (
          <div className="qmf-list">
            {watch.map(({ a, p }) => (
              <div key={signalKey(p.patientId, a.id)} className="qmf-watchrow">
                <button type="button" className="qmf-watchrow__main" onClick={() => onOpenSignals(p.patientId)}> {/* NO_TRACK */}
                  <span className="qmf-watchrow__ago">{agoLabel(today, a.latestSignalDate)}</span>
                  <div className="qmf-watchrow__body">
                    <div className="qmf-watchrow__title">{alertName(a)} — {fullName(p)}</div>
                    <div className="qmf-watchrow__sub">{a.suggestedAction}</div>
                  </div>
                </button>
                <button type="button" data-track="qm_action_clicked" data-track-prop-measure-code={a.qmId} data-track-prop-action="snooze_30d"
                  className="qmf-watchrow__dismiss" onClick={() => dismissSignal(p.patientId, a.id)}>Dismiss</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── footer: the rest lives on the board ── */}
      <div className="qmf-footer">
        <div className="qmf-footer__counts">
          <Activity className="qmc-text--slate" />
          <span>
            Also on the board:{' '}
            <b className="qmc-text--amber">{clinicalCount} need a clinical fix</b> ·{' '}
            <b className="qmc-text--slate">{nextQuarterCount} clear next quarter</b> ·{' '}
            <b className="qmc-text--violet">{crosserCount} crossing day-101</b>
            {lockedCount > 0 ? <> · <b className="qmc-text--slate">{lockedCount} locked</b></> : null} ·{' '}
            <b className="qmc-text--slate">{clearCount} clear</b>
          </span>
        </div>
        <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code="open_full_board"
          className="qmf-footer__btn" onClick={onOpenBoard}>
          Open full QM Board <ArrowRight />
        </button>
      </div>
    </div>
  );
}
