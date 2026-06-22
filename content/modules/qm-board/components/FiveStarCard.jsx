/**
 * Predicted Five-Star QM card — POINTS-FORWARD (web PR #733, mirrors the
 * incumbent SHP/IntelliLogix report). Headline = Overall: CMS now → trend →
 * projected star, with the actionable "{N} points to {next}★" as the hero number
 * (claims HELD at the CMS-published value, not unknown). Per-domain points rows
 * for Long/Short. The wide claims RANGE is demoted to a small sensitivity
 * footnote. The right rail stays "what's moving the long-stay star". The
 * interactive what-if lives in the full simulator (one link) — this is read-only.
 *
 * Ported from qm-five-star-card.reference.tsx, adapted to Preact + the qmc-/qmf-fs
 * CSS. Board-only: not rendered under the QIP lens (predictor is Five-Star).
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

/**
 * The honest projected star as a RANGE [min,max]. The 5 claims-based five-star
 * measures are unknowable to us, so the directly-computed star is a band:
 *   1..min      → solid amber   (guaranteed floor)
 *   min+1..max  → faint amber   (achievable ceiling)
 *   max+1..5    → grey          (out of reach)
 * Either bound null = no coverage for this axis → reuse the `—` placeholder.
 */
export function RangeStars({ range, size = 'sm' }) {
  const [min, max] = range;
  if (min == null || max == null) return <span className="qmc-text--slate">—</span>;
  const cls = size === 'lg' ? 'qmf-star qmf-star--lg' : 'qmf-star';
  return (
    <span className="qmf-stars">
      {[1, 2, 3, 4, 5].map((i) => {
        const mod = i <= min ? 'qmf-star--on' : i <= max ? 'qmf-star--ceil' : 'qmf-star--off';
        return <Star key={i} className={`${cls} ${mod}`} fill="currentColor" />;
      })}
    </span>
  );
}

/** Compact "min–max★" label (en-dash); collapses to "n★" when min===max. */
export function rangeLabel(range) {
  const [min, max] = range;
  if (min == null || max == null) return '—';
  return min === max ? `${min}★` : `${min}–${max}★`;
}

/** The CMS QSO-25-20-NH hybrid caveat for antipsychotic_long (MDS-only floor). */
const ANTIPSYCHOTIC_HYBRID_CAVEAT =
  'Antipsychotic is now an MDS+claims hybrid (CMS QSO-25-20-NH); MDS-only shown — true rate may be higher.';

/**
 * One per-domain points row: projected star + projected points, the CMS current
 * star, and the actionable "{pointsToNext} pts to {nextStar}★". Falls back to a
 * muted "not enough MDS data yet" when the axis has no MDS coverage (score null).
 */
function DomainRow({ label, axis, pred, cmsStar, hasData }) {
  const prog = pred.score != null ? starProgress(axis, pred.score) : null;
  return (
    <div className="qmf-dom">
      <span className="qmf-dom__left">
        <span className="qmf-dom__label">{label}</span>
        {hasData && pred.score != null ? (
          <>
            <Stars n={pred.predictedStar} />
            <span className="qmf-dom__pts">{Math.round(pred.score)} pts</span>
          </>
        ) : (
          <span className="qmf-dom__nodata">not enough MDS data yet</span>
        )}
        {cmsStar != null && <span className="qmf-dom__cms">(CMS {cmsStar}★)</span>}
      </span>
      {prog && (
        <span className="qmf-dom__prog">
          {prog.nextStar != null ? (
            <span className="qmc-text--slate"><b className="qmf-dom__prog-pts">{prog.pointsToNext} pts</b> to {prog.nextStar}★</span>
          ) : (
            <span className="qmc-text--emerald" style={{ fontWeight: 600 }}>top band</span>
          )}
        </span>
      )}
    </div>
  );
}

/** Compact skeleton shown while the predictor is still fetching, so the slot
 *  reads as "loading" rather than an empty gap (the predictor does a double
 *  facility-rate pass, so it's the slow one). */
export function FiveStarCardLoading() {
  return (
    <div className="qmf-fs qmf-fs--compact qmf-fs--loading qmc-rise" aria-busy="true">
      <div className="qmf-fs__eyebrow">
        <Star className="qmf-star qmf-star--on" fill="currentColor" /> Predicted Five-Star QM
        <span className="qmf-fs__spinner" aria-hidden="true" />
      </div>
      <div className="qmf-fs__loadrow">
        <span className="qmf-skel qmf-skel--stars" />
        <span className="qmf-skel qmf-skel--line" />
      </div>
      <div className="qmf-fs__loadtext">Predicting your Five-Star QM rating…</div>
    </div>
  );
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

  // Points-forward: the claims-held anchor-shift projection drives everything.
  const ovProg = live.overall.score != null ? starProgress('overall', live.overall.score) : null;
  const range = prediction.starRange;
  const present = prediction.measuresPresent;
  const qip = prediction.qip;
  const hasHybrid = sorted.some((m) => m.id === 'antipsychotic_long');

  return (
    <div className="qmf-fs qmf-fs--compact qmc-rise">
      <div className="qmf-fs__top">
        {/* Headline: Overall, points-forward */}
        <div className="qmf-fs__lead">
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
              <span className="qmf-fs__caplabel">Projected</span>
              <Stars n={live.overall.predictedStar} size="lg" />
            </div>
          </div>

          {/* Hero actionable line — mirrors "Points to higher star level: N" */}
          <div className="qmf-fs__hero">
            {ovProg ? (
              ovProg.nextStar != null ? (
                <span><span className="qmc-text--amber" style={{ fontWeight: 700 }}>{ovProg.pointsToNext} points</span> to {ovProg.nextStar}★ overall</span>
              ) : (
                <span className="qmc-text--emerald">Overall is in the top band</span>
              )
            ) : (
              <span className="qmc-text--slate">Overall projection pending MDS data</span>
            )}
          </div>

          {/* Per-domain points rows */}
          <div className="qmf-fs__domains">
            <DomainRow label="Long-stay" axis="long" pred={live.ls} cmsStar={prediction.anchor.ls}
              hasData={present ? present.long > 0 : live.ls.score != null} />
            <DomainRow label="Short-stay" axis="short" pred={live.ss} cmsStar={prediction.anchor.ss}
              hasData={present ? present.short > 0 : live.ss.score != null} />
          </div>

          {qip && (
            <div className="qmf-fs__qip">
              {qip.state} QIP: {qip.points}/{qip.maxPoints} pts
              <span className="qmf-fs__qip-note">(MDS clinical portion)</span>
            </div>
          )}

          {/* Claims sensitivity — demoted footnote, NOT the headline */}
          {range && rangeLabel(range.overall) !== '—' && (
            <div className="qmf-fs__sensitivity">
              Claims sensitivity: overall could land <span className="qmf-fs__sensitivity-val">{rangeLabel(range.overall)}</span> if the unpublished claims measures swing.
            </div>
          )}
        </div>

        {/* What's moving — ±pts is the primary signal, names secondary */}
        <div className="qmf-fs__movers qmf-fs__movers--compact">
          <div className="qmf-fs__movers-title">What's moving the long-stay star</div>
          <ul className="qmf-fs__movers-list">
            {sorted.slice(0, 5).map((m) => {
              const isHybrid = m.id === 'antipsychotic_long';
              return (
                <li key={m.id} className="qmf-fs__mover">
                  {m.deltaPts > 0 ? <ArrowUp className="qmc-text--emerald qmf-fs__mover-arrow" />
                    : m.deltaPts < 0 ? <ArrowDown className="qmc-text--rose qmf-fs__mover-arrow" />
                    : <Minus className="qmc-text--slate qmf-fs__mover-arrow" />}
                  <span className="qmf-fs__mover-name">{shortLabel(m.id, m.label)}</span>
                  {isHybrid && <span className="qmf-fs__hybrid" title={ANTIPSYCHOTIC_HYBRID_CAVEAT}>MDS-only</span>}
                  <span className="qmf-fs__mover-mag">{Math.abs(m.deltaPts)}</span>
                </li>
              );
            })}
            {sorted.length === 0 && <li className="qmc-text--slate">No long-stay MDS measures yet.</li>}
          </ul>
          {hasHybrid && (
            <p className="qmf-fs__hybrid-note">
              <span className="qmc-text--amber" style={{ fontWeight: 600 }}>MDS-only</span> — {ANTIPSYCHOTIC_HYBRID_CAVEAT}
            </p>
          )}
        </div>
      </div>

      {/* One-line caption + simulator link */}
      <div className="qmf-fs__foot">
        <p className="qmf-fs__caption qmf-fs__caption--oneline">
          Claims held at the CMS-published value{prediction.anchor.period ? ` (period ${prediction.anchor.period})` : ''};
          MDS measures projected from your rolling 4-quarter rates (discharged residents included).
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
