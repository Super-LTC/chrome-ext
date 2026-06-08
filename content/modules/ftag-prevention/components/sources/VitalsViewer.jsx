import { useMemo, useState } from 'preact/hooks';
import { useVitals } from '../../hooks/useVitals.js';
import { vitalTypeLabel } from '../../utils/ftags.js';
import { formatDate } from '../../utils/derive.js';

/**
 * VitalsViewer — the net-new source view for F580 / F692.
 *
 * Per backend PR #593 the finding's `source` descriptor carries the vital type
 * AND the clinically-correct date window, so we fetch just that slice (~60 rows
 * vs the full ~6.4k history), render the trend for `source.vitalType`, and ring
 * the rows whose id ∈ source.highlightVitalIds. "Show all vitals" drops the type
 * filter (all types within the same window) — still bounded by dateRange.
 */
export function VitalsViewer({ source, facilityName, orgSlug }) {
  const { patientId, vitalType, highlightVitalIds = [], around, dateRange } = source || {};
  const [showAll, setShowAll] = useState(false);

  // Fetch the type + window slice the finding points at; "Show all" drops the
  // type filter (still inside the same date window when one is present).
  const { vitals, loading, error, retry } = useVitals({
    facilityName, orgSlug, patientId,
    vitalType: showAll ? null : vitalType,
    dateRange,
  });

  const highlightSet = useMemo(() => new Set(highlightVitalIds), [highlightVitalIds]);

  const rows = useMemo(() => {
    const all = Array.isArray(vitals) ? vitals : [];
    const filtered = showAll || !vitalType ? all : all.filter((v) => v.vitalType === vitalType);
    // newest-first already, but be safe
    return [...filtered].sort((a, b) => Date.parse(b.effectiveDate || 0) - Date.parse(a.effectiveDate || 0));
  }, [vitals, vitalType, showAll]);

  const trendPoints = useMemo(() => {
    if (!vitalType) return [];
    const typed = (Array.isArray(vitals) ? vitals : [])
      .filter((v) => v.vitalType === vitalType && v.numericValue != null && !Number.isNaN(Number(v.numericValue)))
      .map((v) => ({ t: Date.parse(v.effectiveDate || 0), y: Number(v.numericValue), id: v.id }))
      .filter((p) => !Number.isNaN(p.t))
      .sort((a, b) => a.t - b.t);
    return typed;
  }, [vitals, vitalType]);

  if (loading) return <div className="ftp-src__loading">Loading vitals…</div>;
  if (error) {
    return (
      <div className="ftp-src__error">
        <div>Couldn’t load vitals — {error}</div>
        <button type="button" className="ftp-linkbtn" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }

  const label = vitalTypeLabel(vitalType) || 'Vitals';

  return (
    <div className="ftp-vitals">
      <div className="ftp-src__head">
        <div className="ftp-src__head-title">
          {label} <span className="ftp-src__head-meta">· {rows.length} reading{rows.length === 1 ? '' : 's'}</span>
        </div>
        {vitalType && (
          <button type="button" className="ftp-linkbtn" onClick={() => setShowAll((s) => !s)}> {/* NO_TRACK */}
            {showAll ? `Show ${label} only` : 'Show all vitals'}
          </button>
        )}
      </div>

      {trendPoints.length >= 2 && <Sparkline points={trendPoints} highlightSet={highlightSet} />}

      {rows.length === 0 ? (
        <div className="ftp-empty">No vitals on record{vitalType ? ` for ${label}` : ''}.</div>
      ) : (
        <table className="ftp-vitals__table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const flagged = highlightSet.has(v.id);
              return (
                <tr key={v.id} className={flagged ? 'ftp-vitals__row--flagged' : ''}>
                  <td className="ftp-mono">
                    {flagged && <span className="ftp-vitals__ring" aria-label="flagged">●</span>}
                    {formatDate(v.effectiveDate)}
                  </td>
                  <td>{vitalTypeLabel(v.vitalType)}</td>
                  <td className="ftp-vitals__val">{v.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {around && (
        <div className="ftp-src__foot">Flagged window anchored around {formatDate(around)}.</div>
      )}
    </div>
  );
}

/**
 * Minimal inline sparkline (no chart lib). Plots numericValue over time and
 * marks highlighted points with a filled ring.
 */
function Sparkline({ points, highlightSet }) {
  const W = 520, H = 90, PAD = 8;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const sx = (t) => PAD + ((t - minX) / spanX) * (W - 2 * PAD);
  const sy = (y) => H - PAD - ((y - minY) / spanY) * (H - 2 * PAD);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.t).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  return (
    <svg className="ftp-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="vitals trend">
      <path d={path} fill="none" stroke="#6366f1" stroke-width="1.5" />
      {points.map((p) => {
        const flagged = highlightSet.has(p.id);
        return (
          <circle
            key={p.id ?? `${p.t}`}
            cx={sx(p.t)}
            cy={sy(p.y)}
            r={flagged ? 4 : 2.5}
            fill={flagged ? '#e11d48' : '#6366f1'}
            stroke={flagged ? '#fff' : 'none'}
            stroke-width={flagged ? 1.5 : 0}
          />
        );
      })}
    </svg>
  );
}
