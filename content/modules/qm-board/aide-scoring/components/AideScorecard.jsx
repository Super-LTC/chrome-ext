/**
 * AideScorecard — plain-English per-aide CNA scoring scorecard (Preact port of
 * the web clarity redesign, PR #808). Shared by the expandable roster row and,
 * via the same helpers, the printed PDF. Written for nurse managers, not
 * analysts — a quick, non-mathy read:
 *   - one-line verdict ("rates residents more independent than the team")
 *   - "vs. the team" per-category: less dep. / on track / more dep. (+ a bar)
 *   - "getting more accurate?" — a plain verdict; the chart only appears once
 *     there's enough weekly history to be meaningful
 *   - "recent scores to review" — clearly dated (date + shift), newest first,
 *     shown as "Her 4 · Team avg 2.0 ▲" instead of signed deviations
 */
import {
  SHIFT_LABELS, BAR_MAX, MIN_TREND_WEEKS,
  gradeTone, verdictOf, categoryLabel, trendVerdict, fmtDate,
} from '../lib/aide-scoring.js';

export function AideScorecard({ detail, dateRangeLabel, forPrint = false }) {
  const summary = detail?.summary;
  const verdict = verdictOf(summary);

  return (
    <div className="qmc-sc">
      {/* Header — identity on the left, grade badge on the right */}
      <div className="qmc-sc__head">
        <div className="qmc-sc__id">
          <div className="qmc-sc__name">{detail.aideName}</div>
          <div className="qmc-sc__sub">
            {summary?.assessmentCount ?? 0} scores · {summary?.uniquePatients ?? 0} residents
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </div>
        </div>
        {summary && (
          <div
            className={`qmc-grade qmc-grade--lg qmc-grade--${gradeTone(summary.grade)}`}
            title={`Scoring-accuracy grade (${summary.gradeScore}/100)`}
          >
            {summary.grade}
          </div>
        )}
      </div>

      {/* Plain verdict — a colored status dot + one sentence */}
      <div className="qmc-sc__verdict">
        <span className={`qmc-dot qmc-dot--${verdict.tone}`} />
        <p className="qmc-sc__verdict-line">{verdict.line}</p>
      </div>

      {/* vs. the team + trend — divider/gutter so they don't crowd */}
      <div className="qmc-sc__grid">
        <CategoryBars detail={detail} />
        <div className="qmc-sc__col qmc-sc__col--trend">
          <TrendChart detail={detail} />
        </div>
      </div>

      {/* Recent scores to review */}
      <RecentScores scores={detail.scores} forPrint={forPrint} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// vs. the team — per-category, plain dependence labels + a simple bar
// ---------------------------------------------------------------------------

function CategoryBars({ detail }) {
  const cats = [...(detail?.categoryDeviations ?? [])].sort(
    (a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation)
  );

  if (cats.length === 0) {
    return (
      <div className="qmc-sc__col">
        <div className="qmc-sc__seclabel">vs. the team</div>
        <div className="qmc-sc__empty">No category data.</div>
      </div>
    );
  }

  return (
    <div className="qmc-sc__col">
      <div className="qmc-sc__seclabel">vs. the team</div>
      <p className="qmc-sc__caption">How her scores compare to coworkers, by task.</p>
      <div className="qmc-cats">
        {cats.map((c) => {
          const { word, tone } = categoryLabel(c.averageDeviation, c.isSignificant);
          const width = (Math.min(Math.abs(c.averageDeviation), BAR_MAX) / BAR_MAX) * 50;
          const lessDep = c.averageDeviation < 0; // scored above the team
          return (
            <div key={c.mdsKey} className="qmc-cat">
              <div className="qmc-cat__name" title={c.name}>{c.name}</div>
              <div className={`qmc-cat__word qmc-text--${tone}`}>{word}</div>
              {/* more dep. ← matches → less dep.; bar leans toward the side she favors */}
              <div className="qmc-cat__track">
                <div className="qmc-cat__zero" />
                {c.isSignificant ? (
                  <div
                    className={`qmc-cat__bar qmc-cat__bar--${lessDep ? 'r' : 'l'} qmc-bg--${tone}`}
                    style={{ width: `${width}%` }}
                  />
                ) : (
                  <div className={`qmc-cat__ondot qmc-bg--${tone}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="qmc-cat__scale">
        <span>more dep.</span>
        <span>matches</span>
        <span>less dep.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// getting more accurate? — plain verdict; chart only with enough history
// ---------------------------------------------------------------------------

const TREND_W = 300;
const TREND_H = 84;
const TREND_PAD = 12;

function TrendChart({ detail }) {
  const pts = detail?.trend ?? [];

  // Not enough weekly history yet → one muted line, no sparse/misleading chart.
  if (pts.length < MIN_TREND_WEEKS) {
    return (
      <div>
        <div className="qmc-sc__seclabel">getting more accurate?</div>
        <div className="qmc-sc__empty">Not enough history yet — trend shows after ~{MIN_TREND_WEEKS} weeks.</div>
      </div>
    );
  }

  const verdict = trendVerdict(pts);
  // Accuracy = closeness to peers. Plot |dev| but invert so "matches team" is at
  // the TOP (up = good) — the intuitive read for a manager.
  const mags = pts.map((p) => Math.abs(p.averageDeviation));
  const maxAbs = Math.max(1, ...mags);
  const x = (i) => TREND_PAD + (i / (pts.length - 1)) * (TREND_W - 2 * TREND_PAD);
  const y = (mag) => TREND_PAD + (mag / maxAbs) * (TREND_H - 2 * TREND_PAD); // 0 → top, max → bottom

  const linePath = mags
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m).toFixed(1)}`)
    .join(' ');

  return (
    <div>
      <div className="qmc-sc__trendhead">
        <div className="qmc-sc__seclabel" style={{ margin: 0 }}>getting more accurate?</div>
        <span className={`qmc-sc__trendverdict qmc-text--${verdict.tone}`}>{verdict.arrow} {verdict.word}</span>
      </div>
      <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="qmc-trend" style={{ maxHeight: TREND_H }}>
        <path d={linePath} fill="none" stroke="#64748b" strokeWidth={1.75} strokeLinejoin="round" />
        {mags.map((m, i) => (
          <circle key={i} cx={x(i)} cy={y(m)} r={2.75}
            fill={m <= 0.5 ? '#10b981' : m <= 1.5 ? '#64748b' : '#ef4444'} />
        ))}
      </svg>
      <div className="qmc-trend__axis">
        <span>{fmtDate(pts[0].weekStart)}</span>
        <span className="qmc-trend__axis-mid">matches team = higher</span>
        <span>{fmtDate(pts[pts.length - 1].weekStart)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// recent scores to review — clearly dated, newest first
// ---------------------------------------------------------------------------

function RecentScores({ scores, forPrint }) {
  // Scores where the aide differed from the team, newest first — the ones worth
  // a look. Fall back to all scores if none are flagged significant upstream.
  const notable = (scores ?? []).filter((s) => Math.abs(s.deviation) >= 1);
  const pool = notable.length > 0 ? notable : (scores ?? []);
  const rows = [...pool]
    .sort((a, b) => String(b.recordedDate).localeCompare(String(a.recordedDate)))
    .slice(0, forPrint ? 12 : 6);

  if (rows.length === 0) return null;

  return (
    <div className="qmc-sc__recent">
      <div className="qmc-sc__seclabel">recent scores to review</div>
      <p className="qmc-sc__caption">
        Her score vs. coworkers&rsquo; average for that resident &amp; shift.{' '}
        <span className="qmc-sc__caption-key">Scale: 1 = fully dependent &rarr; 6 = independent.</span>
      </p>
      <div className="qmc-recent">
        {rows.map((s, i) => {
          const lessDep = s.deviation < 0; // scored above the team
          return (
            <div key={i} className="qmc-recent__row">
              <div className="qmc-recent__when">{fmtDate(s.recordedDate)} · {SHIFT_LABELS[s.shiftIndex] ?? s.shiftIndex}</div>
              <div className="qmc-recent__who">
                <span className="qmc-recent__name">{s.patientName}</span>
                <span className="qmc-recent__cat"> · {s.categoryName}</span>
              </div>
              <div className="qmc-recent__scores">
                Her <span className="qmc-recent__her">{s.aideScore}</span>
                <span className="qmc-recent__mid"> · </span>
                Team avg <span className="qmc-recent__team">{s.peerAverage != null ? s.peerAverage.toFixed(1) : '—'}</span>
              </div>
              <div className={`qmc-recent__arrow qmc-text--${lessDep ? 'sky' : 'rose'}`}>{lessDep ? '▲' : '▼'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
