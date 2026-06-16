/**
 * Predicted Five-Star QM card (web UX redesign). Headline = CMS anchor →
 * predicted QM star; the right rail is "what's moving the long-stay star" as
 * compact ▲/▼ rows (green up = helping, red down = dragging) + measure name + a
 * tiny faint magnitude. The interactive what-if lives in the full simulator now
 * (one "Open full simulator →" link), not inline — this card is read-only.
 *
 * Ported from qm-five-star-card.reference.tsx, adapted to Preact + the qmc-/qmf-fs CSS.
 * Board-only: not rendered under the QIP lens (predictor is Five-Star, LS-only).
 */
import { starProgress } from '../lib/five-star-predictor.js';
import { shortLabel } from '../lib/qm-view-model.js';
import { Star, ArrowUp, ArrowDown, Minus } from './icons.jsx';

/** A compact star pill: 1–5 filled stars (or "—" when unknown). */
export function Stars({ n, size = 'sm' }) {
  if (n == null) return <span className="qmc-text--slate">—</span>;
  const cls = size === 'lg' ? 'qmf-star qmf-star--lg' : 'qmf-star';
  return (
    <span className="qmf-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= n ? 'qmf-star--on' : 'qmf-star--off'}`} fill="currentColor" />
      ))}
    </span>
  );
}

export function TrendArrow({ trend }) {
  if (trend === 'up') return <ArrowUp className="qmc-text--emerald qmf-fs__trend" />;
  if (trend === 'down') return <ArrowDown className="qmc-text--rose qmf-fs__trend" />;
  if (trend === 'flat') return <Minus className="qmc-text--slate qmf-fs__trend" />;
  return null;
}

export function FiveStarCard({ prediction, onOpenSimulator }) {
  if (!prediction?.available) {
    if (!prediction || prediction.reason === 'excluded') return null; // not a SNF — nothing to show
    const msg =
      prediction.reason === 'cms_suppressed'
        ? 'Matched to CMS, but no Five-Star QM rating is published for this facility yet.'
        : 'Not linked to a CMS rating yet — an admin can match this facility in Admin → Quality Measures → Facility Matching.';
    return (
      <div className="qmf-fs__nudge">
        <span className="qmf-fs__nudge-title">Predicted Five-Star QM</span> — {msg}
      </div>
    );
  }

  const live = prediction.predicted;
  const sorted = [...prediction.perMeasure].sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts));
  const lsProg = live.ls.score != null ? starProgress('long', live.ls.score) : null;

  return (
    <div className="qmf-fs qmf-fs--compact qmc-rise">
      <div className="qmf-fs__top">
        {/* Headline: anchor → predicted QM star */}
        <div>
          <div className="qmf-fs__eyebrow">
            <Star className="qmf-star qmf-star--on" fill="currentColor" /> Predicted Five-Star QM
          </div>
          <div className="qmf-fs__headline">
            <div className="qmf-fs__col">
              <span className="qmf-fs__caplabel">CMS now</span>
              <Stars n={prediction.anchor.qm} />
            </div>
            <TrendArrow trend={live.overall.trend} />
            <div className="qmf-fs__col">
              <span className="qmf-fs__caplabel">Predicted</span>
              <Stars n={live.overall.predictedStar} size="lg" />
            </div>
          </div>
          <div className="qmf-fs__stays">
            <span>
              Long-stay <b>{live.ls.predictedStar ?? '—'}★</b>
              {prediction.anchor.ls != null && <span className="qmc-text--slate"> (CMS {prediction.anchor.ls})</span>}
            </span>
            <span>
              Short-stay <b>{live.ss.predictedStar ?? '—'}★</b>
              <span className="qmc-text--slate"> (held at CMS)</span>
            </span>
          </div>
          {lsProg && (
            <div className="qmf-fs__progress">
              {lsProg.nextStar != null ? (
                <>~{lsProg.pointsToNext} pts from long-stay <b>{lsProg.nextStar}★</b></>
              ) : (
                <span className="qmc-text--emerald" style={{ fontWeight: 600 }}>top long-stay band</span>
              )}
            </div>
          )}
        </div>

        {/* What's moving — ▲/▼ arrow is the primary signal, names secondary, magnitude faint */}
        <div className="qmf-fs__movers qmf-fs__movers--compact">
          <div className="qmf-fs__movers-title">What's moving the long-stay star</div>
          <ul className="qmf-fs__movers-list">
            {sorted.slice(0, 5).map((m) => (
              <li key={m.id} className="qmf-fs__mover">
                {m.deltaPts > 0 ? <ArrowUp className="qmc-text--emerald qmf-fs__mover-arrow" />
                  : m.deltaPts < 0 ? <ArrowDown className="qmc-text--rose qmf-fs__mover-arrow" />
                  : <Minus className="qmc-text--slate qmf-fs__mover-arrow" />}
                <span className="qmf-fs__mover-name">{shortLabel(m.id, m.label)}</span>
                <span className="qmf-fs__mover-mag">{Math.abs(m.deltaPts)}</span>
              </li>
            ))}
            {sorted.length === 0 && <li className="qmc-text--slate">No long-stay MDS measures yet.</li>}
          </ul>
        </div>
      </div>

      {/* One-line caption + simulator link */}
      <div className="qmf-fs__foot">
        <p className="qmf-fs__caption qmf-fs__caption--oneline">
          CMS published star{prediction.anchor.period ? ` (${prediction.anchor.period})` : ''}, shifted by your live
          long-stay MDS measures · claims &amp; short-stay held at CMS.
        </p>
        {onOpenSimulator && (
          <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code="open_simulator" className="qmf-fs__simlink" onClick={onOpenSimulator}>
            Open full simulator →
          </button>
        )}
      </div>
    </div>
  );
}
