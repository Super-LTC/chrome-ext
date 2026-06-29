/**
 * In-house MDS surface — "Currently triggering · in house". The MDS coordinator's
 * day-to-day worklist: what's triggering on the ACTIVE census now (not the
 * windowed/official rate — that's the regional QM Board). Stripped of QIP /
 * Five-Star / rate numbers. One dataset, three lenses (List / Grid / Calendar) +
 * clinical signals pulled out to a banner.
 *
 * Ported from qm-inhouse.reference.tsx → Preact + the qmc-/qmi- tone system.
 * Measure / signals / DFS navigation is delegated to QMBoard's view stack (the
 * grid's measure-tap pushes the existing MeasureDetail), so this surface stays
 * self-contained and doesn't re-thread quarter-rates/rolling.
 */
import { useState } from 'preact/hooks';
import { buildInhouseView } from '../lib/qm-inhouse-view.js';
import { useGgDashboard } from '../hooks/useGgDashboard.js';
import { QmInhouseList } from './QmInhouseList.jsx';
import { QmInhouseGrid } from './QmInhouseGrid.jsx';
import { QmInhouseCalendar } from './QmInhouseCalendar.jsx';
import { Bell, ArrowUpRight, List, Grid, CalendarDays, Activity } from './icons.jsx';

export function QmInhouse({ board, lens, facilityState, dfs, facilityName, orgSlug, onOpenResident, onOpenSignals, onOpenMeasure, onOpenDfs, onOpenFunctional }) {
  const [view, setView] = useState('list'); // 'list' | 'grid' | 'calendar'
  const v = buildInhouseView(board, lens, facilityState);

  // Async "severe" count for the Functional decline badge — reuses the existing
  // gg-decline-dashboard roster (non-blocking; the badge pops in when it lands).
  const { data: ggData } = useGgDashboard({ facilityName, orgSlug, mode: 'therapy' });
  const severeDecline = ggData?.summary?.severe ?? null;

  const tab = (id, label, Icon) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      className={`qmi-tab ${view === id ? 'qmi-tab--on' : ''}`}
      onClick={() => setView(id)}
    > {/* NO_TRACK */}
      <Icon className="qmi-tab__icon" /> {label}
    </button>
  );

  return (
    <div className="qmc qmi">
      {/* ── header: the unmissable in-house framing + the view toggle ── */}
      <div className="qmi-head qmc-rise">
        <div className="qmi-head__top">
          <div>
            <div className="qmc-eyebrow qmc-text--emerald">Currently triggering · in house</div>
            <div className="qmi-head__sub">
              <span className="qmi-head__num">{v.triggeringResidents}</span> of{' '}
              <span>{v.totalResidents}</span> residents in house are triggering — what you can still work.{' '}
              <span className="qmc-text--slate">(Not the published/windowed rate — that's the QM Board.)</span>
            </div>
          </div>
          <div className="qmi-head__actions">
            {onOpenFunctional && (
              <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code="open_functional" data-track-prop-view="coordinator"
                className="qmi-fnlink" onClick={onOpenFunctional}>
                <Activity className="qmi-fnlink__icon" /> Functional decline
                {severeDecline != null && severeDecline > 0 && (
                  <span className="qmi-fnlink__badge" title={`${severeDecline} severe functional decline${severeDecline === 1 ? '' : 's'}`}>{severeDecline}</span>
                )}
              </button>
            )}
            <div className="qmi-toggle" role="tablist" aria-label="In-house view">
              {tab('list', 'List', List)}
              {tab('grid', 'Grid', Grid)}
              {tab('calendar', 'Calendar', CalendarDays)}
            </div>
          </div>
        </div>
      </div>

      {/* ── signals banner: pulled out of the worklist, links to its own view ── */}
      {v.signalTotal > 0 && (
        <button type="button" className="qmi-signals" onClick={() => onOpenSignals()}> {/* NO_TRACK */}
          <span className="qmi-signals__left">
            <span className="qmi-signals__icon"><Bell /></span>
            <span className="qmi-signals__text">
              <span className="qmi-signals__lead">New clinical signals · </span>
              {v.signals.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? ' · ' : ''}
                  <span className="qmi-signals__count">{s.count}</span> {s.label}
                </span>
              ))}
            </span>
          </span>
          <span className="qmi-signals__view">View <ArrowUpRight /></span>
        </button>
      )}

      {/* ── active body ── */}
      {view === 'list' ? (
        <QmInhouseList board={board} lens={lens} facilityState={facilityState} onOpenResident={onOpenResident} />
      ) : view === 'grid' ? (
        <QmInhouseGrid
          board={board}
          lens={lens}
          facilityState={facilityState}
          dfs={dfs}
          onOpenMeasure={onOpenMeasure}
          onOpenDfs={onOpenDfs}
        />
      ) : (
        <QmInhouseCalendar board={board} lens={lens} facilityState={facilityState} onOpenResident={onOpenResident} />
      )}
    </div>
  );
}
