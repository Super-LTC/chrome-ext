/**
 * Shared Five-Star primitives. Ported verbatim from superltc
 * `web/components/five-star/primitives.tsx` — types stripped, everything else
 * intentionally unchanged.
 *
 * Both the regional board and (later) the facility scorecard render through
 * these, so the two screens cannot drift apart visually.
 *
 * Everything here is presentational and pure — no data fetching, no service
 * calls. The payloads arrive already computed from the precompute cache.
 *
 * Styling lives in `content/css/five-star.css`, scoped under `.fivestar`, and is
 * appended to CSS_BUNDLE in css-bootstrap.js (a plain `import './x.css'` does
 * not render in a content script — see that file's header).
 */

/* ── stars ────────────────────────────────────────────────────────────────── */

/**
 * Compact numeric star — `4★` — for DENSE tables where a five-glyph row per cell
 * reads as noise (the regional table has seven star columns; glyph rows there
 * were "too much", per review). The digit carries the value, the single glyph
 * carries "this is a star rating", colour carries published vs projected.
 */
export function StarNum({ value, projected = false, label }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="starnum empty" aria-label={label ?? 'no rating'}>—</span>;
  }
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className={`starnum ${projected ? 'proj' : ''}`}
      role="img"
      aria-label={label ?? `${v} of 5 stars${projected ? ', projected' : ''}`}
    >
      {v}
      <span className="glyph" aria-hidden="true">★</span>
    </span>
  );
}

/**
 * Five literal ★ glyphs, filled to `value`.
 *
 * Glyphs, not digit chips: an earlier revision rendered coloured numbers and
 * read as "crazy visual load", because colour became the only signal and every
 * cell had to be decoded. The count of filled shapes is legible pre-attentively,
 * which frees colour to mean something else (see `projected`).
 *
 * `projected` switches to green, reserved exclusively for OUR forward-looking
 * number so a green star on screen always answers "what will CMS say next?".
 * Renders a text alternative for screen readers rather than five glyph names.
 */
export function Stars({ value, size = 'md', projected = false, label }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="stars" aria-label={label ?? 'no rating'}>—</span>;
  }
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  const cls = ['stars', size === 'md' ? '' : size, projected ? 'proj' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} role="img" aria-label={label ?? `${filled} of 5 stars${projected ? ', projected' : ''}`}>
      <span aria-hidden="true">{'★'.repeat(filled)}</span>
      <span className="off" aria-hidden="true">{'★'.repeat(5 - filled)}</span>
    </span>
  );
}

/* ── numbers ──────────────────────────────────────────────────────────────── */

/** Thousands separators, and an em dash for absent values — never a bare 0. */
export const n = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString());

/**
 * Points as X/Y — Andrew's explicit ask ("do points in like X/Y so they know").
 * A bare 1,337 means nothing without the 2,300 it is measured against.
 */
export const pts = (value, max) => (value == null ? '—' : `${n(value)}/${n(max)}`);

/** One decimal, or an em dash. For star averages on roll-up rows. */
export const avg1 = (v) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1));

/* ── cut-point ladder hover ───────────────────────────────────────────────── */

/**
 * The cut-points hover.
 *
 * A PURE RENDERER. Every judgement it displays already exists on the ladder:
 * `proximity` says whether the band above or the floor below is the story,
 * `band.label` is the pre-formatted range, `band.current` marks where the score
 * sits, and `lowerIsBetter` carries the health-inspection reversal. The UI must
 * not re-derive any of it — a second copy of "is 25 points close?" living in a
 * component is exactly how the screen and the engine start disagreeing.
 *
 * Note `at_risk` outranks `in_reach` by the engine's own rule: a star you could
 * LOSE matters more than one you could gain.
 */
export function CutLadder({ ladder }) {
  if (!ladder?.bands?.length) return null;

  const { title, currentStar, nextStar, pointsAboveFloor, pointsToNextStar, proximity, lowerIsBetter } =
    ladder;

  let tone = '';
  let message = null;

  if (proximity === 'at_risk' && pointsAboveFloor != null) {
    tone = 'risk';
    message = (
      <>
        Only <b>{n(pointsAboveFloor)} pts</b> {lowerIsBetter ? 'from' : 'above'} the {currentStar}★
        {lowerIsBetter ? ' cut' : ' floor'}.
      </>
    );
  } else if (proximity === 'in_reach' && pointsToNextStar != null) {
    tone = 'good';
    message = (
      <>
        Only <b>{n(pointsToNextStar)} pts</b> to {nextStar}★ — in reach.
      </>
    );
  } else if (proximity === 'top_band' && pointsAboveFloor != null) {
    message = (
      <>
        <b>{n(pointsAboveFloor)} pts</b> of cushion in the top band.
      </>
    );
  } else if (pointsToNextStar != null && nextStar != null) {
    message = (
      <>
        <b>{n(pointsToNextStar)} pts</b> to {nextStar}★.
      </>
    );
  }

  return (
    <span className="cutpop" role="tooltip">
      <h4>{title}</h4>
      {message ? (
        <span className={`box ${tone}`}>
          {message}
          {lowerIsBetter ? <> Lower is better.</> : null}
        </span>
      ) : null}
      <span className="ladder">
        {ladder.bands.map((b) => (
          <span key={b.stars} className={`r ${b.current ? 'you' : ''}`}>
            <span>{b.stars}★</span>
            <span>
              {b.label}
              {b.current ? ' ←' : ''}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

/* ── attention pills / tags ───────────────────────────────────────────────── */

/**
 * Maps an attention `kind` to its visual tone. `unactioned` is deliberately
 * amber rather than green: it is NOT part of the projection (the projection
 * assumes nobody acts), so it must not read as a gain already banked.
 */
export const toneForKind = (kind) =>
  (kind === 'risk' ? 'risk' : kind === 'opportunity' ? 'opp' : 'warn');

export const glyphForTone = (tone) =>
  (tone === 'risk' ? '▼' : tone === 'opp' ? '↗' : tone === 'warn' ? '⚠' : '');

export function Pill({ tone, children, onClick }) {
  const Tag_ = onClick ? 'button' : 'span';
  return (
    /* NO_TRACK — a pill is a scope change inside the surface, not a funnel step;
       the destination view emits its own event. */
    <Tag_ className={`pill ${tone}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      {children}
    </Tag_>
  );
}

export function Tag({ tone, children }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/* ── trend ────────────────────────────────────────────────────────────────── */

/** ▲ / ▼ / → for a star delta. Null delta renders nothing, not a flat arrow. */
export function Trend({ delta }) {
  if (delta == null || delta === 0) return null;
  return (
    <span className={`trend ${delta > 0 ? 'up' : 'down'}`} aria-label={delta > 0 ? 'up' : 'down'}>
      {delta > 0 ? '▲' : '▼'}
    </span>
  );
}

/* ── provenance ───────────────────────────────────────────────────────────── */

/**
 * "as of" line for a cached payload.
 *
 * A stale row STILL serves its payload — never a blank screen — so this states
 * age plainly rather than hiding it. Silence about staleness is how a cached
 * screen quietly starts lying.
 */
export function AsOf({ computedAt, asOfLabel, stale }) {
  if (!computedAt && !asOfLabel) return null;
  return (
    <span className={`staleline ${stale ? 'stale' : ''}`}>
      {stale ? 'stale · ' : ''}live {asOfLabel ?? new Date(computedAt).toLocaleTimeString()}
    </span>
  );
}
