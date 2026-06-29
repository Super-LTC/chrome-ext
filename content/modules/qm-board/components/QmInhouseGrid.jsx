/**
 * In-house Grid — the existing QM measure grid (reuses `MeasureTile` + `DfsTile`,
 * the same tiles the QM Board overview renders). Each tile = one measure with
 * its count; click → that measure's resident worklist (MeasureDetail, hosted by
 * the QmInhouse shell). This is the build we already had; the in-house surface
 * drops it in rather than reinventing it.
 *
 * Ported from qm-inhouse-grid.reference.tsx → Preact (QmDfsTile → DfsTile).
 */
import { useMemo } from 'preact/hooks';
import { MeasureTile } from './QmOverview.jsx';
import { DfsTile } from './DfsTile.jsx';
import { entryUrgency } from '../lib/qm-tones.js';
import { measureInLens } from '../lib/qm-view-model.js';
import { Activity } from './icons.jsx';

export function QmInhouseGrid({ board, lens, facilityState, dfs, onOpenMeasure, onOpenDfs }) {
  const data = board.currentlyTriggering;

  const crosserByMeasure = useMemo(() => {
    const m = {};
    for (const p of board.upcoming.upcomingPatients) for (const h of p.projectedHits) m[h.id] = (m[h.id] ?? 0) + 1;
    return m;
  }, [board.upcoming.upcomingPatients]);

  const tiles = useMemo(() => {
    return data.measuresEvaluated
      .map((meta) => {
        const counts = data.summary.byMeasure[meta.id] ?? { triggering: 0, excluded: 0, applicable: 0 };
        const urgencies = [];
        for (const p of data.patients) {
          const e = p.measures.find((m) => m.id === meta.id);
          if (e?.triggers) urgencies.push(entryUrgency(e));
        }
        return { meta, counts, urgencies };
      })
      // Discharge Function is the dedicated DFS tile (appended below), not a generic tile.
      .filter((x) => x.meta.id !== 'discharge_function' && x.counts.applicable > 0 && measureInLens(x.meta.id, lens, facilityState))
      .sort((a, b) => b.counts.triggering - a.counts.triggering);
  }, [data.measuresEvaluated, data.summary.byMeasure, data.patients, lens, facilityState]);

  return (
    <div className="qmi-grid">
      <div className="qmi-grid__head">
        <Activity className="qmi-grid__icon" />
        By measure
        <span className="qmi-grid__hint">· click for the resident worklist</span>
      </div>
      <div className="qmi-grid__tiles">
        {tiles.map((x, i) => (
          <MeasureTile
            key={x.meta.id}
            {...x}
            soon={crosserByMeasure[x.meta.id] ?? 0}
            windowed={null}
            delay={i * 22}
            onClick={() => onOpenMeasure(x.meta.id)}
            onViewDenominator={() => {}}
          />
        ))}
        {dfs?.available && lens !== 'qip' && onOpenDfs && (
          <DfsTile dfs={dfs} delay={tiles.length * 22} onClick={onOpenDfs} />
        )}
      </div>
      {tiles.length === 0 && (
        <div className="qmc-empty">No {lens === 'qip' ? 'QIP ' : ''}measures applicable for this facility.</div>
      )}
    </div>
  );
}
