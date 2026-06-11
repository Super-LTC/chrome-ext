import { useState, useRef } from 'preact/hooks';

/**
 * Single GG-item chart card matching the web modal:
 *   - Title row: item name + decline/stable badge + optional delta
 *   - Subtitle: baseline label + (if declined) worst-avg
 *   - Chart: semantic Y-axis (Dep→Indep), dashed baseline reference line,
 *            one colored line for the selected shift
 *   - Hover tooltip on each point showing date · shift · score · aide(s)
 *
 * Props:
 *   item: { mdsKey, name, baseline, worstShiftAverage?, severity?, declineMagnitude? }
 *   points: [{
 *     date: 'YYYY-MM-DD',
 *     value: number,
 *     entries: [{ shift, shiftColor?, value, label, aideName }]   // for tooltip
 *   }]
 *   shiftColor: color string for the line
 */
const Y_LABELS = [
  { v: 6, short: 'Indep' },
  { v: 5, short: 'Setup' },
  { v: 4, short: 'Supv' },
  { v: 3, short: 'Mod' },
  { v: 2, short: 'Max' },
  { v: 1, short: 'Dep' },
];

const BASELINE_LONG = {
  6: 'Independent', 5: 'Setup/clean-up', 4: 'Supervision',
  3: 'Moderate', 2: 'Maximal', 1: 'Dependent',
};

const SEVERITY_CLASS = {
  severe: 'qmb-chart-card__badge--severe',
  moderate: 'qmb-chart-card__badge--moderate',
  mild: 'qmb-chart-card__badge--mild',
};

// Line/area color when an item is declining — tracks severity so the dip reads.
const SEV_COLOR = { severe: '#e11d48', moderate: '#d97706', mild: '#0284c7' };

export function GgItemChart({ item, points, shiftColor = '#3b82f6' }) {
  const W = 520, H = 196;
  const PAD_LEFT = 46, PAD_RIGHT = 16, PAD_TOP = 16, PAD_BOTTOM = 22;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const bottomY = H - PAD_BOTTOM;

  const [hover, setHover] = useState(null); // { i, x, y }
  const svgRef = useRef(null);

  const declined = item.declineMagnitude && item.declineMagnitude >= 1;
  const sevColor = declined ? (SEV_COLOR[item.severity] || SEV_COLOR.mild) : null;
  const lineColor = sevColor || shiftColor;
  const gid = `gg-grad-${item.mdsKey}`;

  const badge = declined
    ? `↓ ${item.declineMagnitude.toFixed(item.declineMagnitude % 1 === 0 ? 0 : 1)}pt`
    : 'Stable';
  const badgeCls = declined
    ? (SEVERITY_CLASS[item.severity] || 'qmb-chart-card__badge--mild')
    : 'qmb-chart-card__badge--stable';

  const baselineLabel = item.baseline != null
    ? `${BASELINE_LONG[item.baseline] || '—'} (${String(item.baseline).padStart(2, '0')})`
    : 'Not in MDS';

  const yFor = (v) => PAD_TOP + innerH - ((v - 1) / 5) * innerH;
  const n = points.length;
  const xFor = (i) => n <= 1 ? PAD_LEFT + innerW / 2 : PAD_LEFT + (i / (n - 1)) * innerW;

  const hasLine = n > 0;
  const linePath = hasLine
    ? points.map((p, i) => `${i ? 'L' : 'M'}${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ')
    : '';
  // Filled area under the line (down to the chart floor).
  const areaPath = hasLine
    ? `${linePath} L${xFor(n - 1).toFixed(1)} ${bottomY} L${xFor(0).toFixed(1)} ${bottomY} Z`
    : '';

  // Worst (lowest) point — the eye should land on the dip.
  let worstI = -1, worstV = Infinity;
  points.forEach((p, i) => { if (p.value < worstV) { worstV = p.value; worstI = i; } });

  const firstDate = points[0]?.date || '';
  const lastDate = points[points.length - 1]?.date || '';

  const hoveredPoint = hover ? points[hover.i] : null;
  const tooltipOnLeft = hover && hover.x > W * 0.62;

  return (
    <div className="qmb-chart-card">
      <div className="qmb-chart-card__head">
        <div className="qmb-chart-card__title-group">
          <h4 className="qmb-chart-card__title">{item.name}</h4>
          {item.baseline != null && (
            <div className="qmb-chart-card__sub">
              Baseline: <b>{baselineLabel}</b>
              {declined && item.worstShiftAverage != null && (
                <> → Worst avg: <b style={{ color: sevColor || '#b91c1c' }}>{item.worstShiftAverage.toFixed(1)}</b></>
              )}
            </div>
          )}
        </div>
        <span className={`qmb-chart-card__badge ${badgeCls}`}>{badge}</span>
      </div>

      <div className="qmb-chart-card__svg-wrap">
        <svg
          ref={svgRef}
          className="qmb-chart-card__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={lineColor} stop-opacity="0.16" />
              <stop offset="100%" stop-color={lineColor} stop-opacity="0" />
            </linearGradient>
          </defs>

          {/* light solid gridlines + Y labels */}
          {Y_LABELS.map(({ v, short }) => (
            <g key={v}>
              <line x1={PAD_LEFT} y1={yFor(v)} x2={W - PAD_RIGHT} y2={yFor(v)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD_LEFT - 8} y={yFor(v) + 3.5} fontSize="10" fill="#cbd5e1" textAnchor="end">{short}</text>
            </g>
          ))}

          {/* baseline reference (faint, no overflowing label — the header states it) */}
          {item.baseline != null && (
            <line
              x1={PAD_LEFT} y1={yFor(item.baseline)} x2={W - PAD_RIGHT} y2={yFor(item.baseline)}
              stroke="#94a3b8" strokeWidth="1.25" strokeDasharray="5 4" opacity="0.7"
            />
          )}

          {/* area + line */}
          {hasLine && (
            <>
              <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
              <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.25"
                strokeLinejoin="round" strokeLinecap="round" />
              {/* worst point highlight */}
              {worstI >= 0 && declined && (
                <circle cx={xFor(worstI)} cy={yFor(worstV)} r="5.5" fill="none" stroke={lineColor} strokeWidth="1.5" opacity="0.45" />
              )}
              {points.map((p, i) => (
                <g key={`${p.date}-${i}`}>
                  <circle cx={xFor(i)} cy={yFor(p.value)} r={hover?.i === i ? 4.5 : 2.4}
                    fill="#fff" stroke={lineColor} strokeWidth={hover?.i === i ? 2 : 1.5} />
                  <circle cx={xFor(i)} cy={yFor(p.value)} r="14" fill="transparent"
                    onMouseEnter={() => setHover({ i, x: xFor(i), y: yFor(p.value) })} style={{ cursor: 'pointer' }} />
                </g>
              ))}
            </>
          )}

          {/* vertical guide on hovered point */}
          {hover && (
            <line x1={hover.x} y1={PAD_TOP} x2={hover.x} y2={bottomY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
          )}

          {/* x-axis date labels */}
          {firstDate && <text x={PAD_LEFT} y={H - 5} fontSize="10" fill="#cbd5e1">{shortDate(firstDate)}</text>}
          {lastDate && lastDate !== firstDate && (
            <text x={W - PAD_RIGHT} y={H - 5} fontSize="10" fill="#cbd5e1" textAnchor="end">{shortDate(lastDate)}</text>
          )}

          {!hasLine && (
            <text x={PAD_LEFT + innerW / 2} y={PAD_TOP + innerH / 2} fontSize="12" fill="#cbd5e1" textAnchor="middle" fontStyle="italic">No scores in window</text>
          )}
        </svg>

        {/* HTML tooltip — absolutely positioned over the SVG */}
        {hoveredPoint && (
          <div
            className="qmb-chart-tooltip"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: `${(hover.y / H) * 100}%`,
              transform: tooltipOnLeft
                ? 'translate(-100%, -50%) translateX(-10px)'
                : 'translate(0, -50%) translateX(10px)',
            }}
          >
            <div className="qmb-chart-tooltip__date">{shortDate(hoveredPoint.date)}</div>
            {hoveredPoint.entries && hoveredPoint.entries.length > 0 ? (
              hoveredPoint.entries.map((e, ei) => (
                <div className="qmb-chart-tooltip__row" key={ei}>
                  <span className="qmb-chart-tooltip__dot" style={{ background: e.shiftColor || shiftColor }}></span>
                  <span className="qmb-chart-tooltip__shift">{e.shift || '—'}:</span>
                  <span className="qmb-chart-tooltip__label"><b>{e.label}</b> <span style={{ color: '#9ca3af' }}>({e.value})</span></span>
                  {e.aideName && <span className="qmb-chart-tooltip__aide">— {e.aideName}</span>}
                </div>
              ))
            ) : (
              <div className="qmb-chart-tooltip__row">
                <span className="qmb-chart-tooltip__dot" style={{ background: shiftColor }}></span>
                <span className="qmb-chart-tooltip__label"><b>{scoreLabel(hoveredPoint.value)}</b> ({hoveredPoint.value.toFixed(1)})</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${Number(m)}/${Number(d)}`;
}

function scoreLabel(v) {
  if (v == null) return '—';
  const r = Math.round(v);
  return BASELINE_LONG[r] || '—';
}
