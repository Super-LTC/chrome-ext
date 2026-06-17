/**
 * AideScorecard — per-aide CNA scoring scorecard (Preact port of
 * aide-scorecard.react-reference.tsx). Shared by the expandable roster row.
 *   - headline status (how far above/below the MDS baseline they score)
 *   - per-category diverging bars ("where you're missing")
 *   - a weekly trend line ("are they improving?")
 *   - a plain-English coaching line
 *   - a few concrete examples
 */
import { useState } from 'preact/hooks';
import {
  SHIFT_LABELS, BAR_MAX, signed, gradeTone, deviationTone, statusOf, coachingLine,
} from '../lib/aide-scoring.js';
import { ChevronRight } from '../../components/icons.jsx';

export function AideScorecard({ detail, dateRangeLabel, forPrint = false }) {
  const summary = detail?.summary;
  const status = statusOf(summary);
  const headlineTone = deviationTone(summary?.overallAverageDeviation ?? 0, summary?.isSignificant ?? false);
  // Examples are calm-by-default: collapsed on screen, expanded for the printed PDF.
  const [showExamples, setShowExamples] = useState(forPrint);
  const totalScores = detail?.scores?.length ?? 0;
  const examples = [...(detail?.scores ?? [])]
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, 6);

  return (
    <div className="qmc-sc">
      {/* Header */}
      <div className="qmc-sc__head">
        <div className="qmc-sc__id">
          <div className="qmc-sc__name">{detail.aideName}</div>
          <div className="qmc-sc__sub">
            {summary?.assessmentCount ?? 0} scores · {summary?.uniquePatients ?? 0} patients
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </div>
        </div>
        <div className="qmc-sc__headright">
          <div className="qmc-sc__headcol">
            <div className={`qmc-sc__big qmc-text--${headlineTone}`}>
              {summary ? signed(summary.overallAverageDeviation) : '—'}
            </div>
            <span className={`qmc-pill qmc-pill--${status.tone}`}>{status.label}</span>
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
      </div>

      {/* Coaching line */}
      <p className="qmc-sc__coach">{coachingLine(detail)}</p>

      {/* Category bars + trend */}
      <div className="qmc-sc__grid">
        <CategoryBars detail={detail} />
        <TrendChart detail={detail} />
      </div>

      {/* Examples — collapsed by default on screen, expanded for print */}
      {examples.length > 0 && (
        <div className="qmc-sc__examples">
          <button type="button" className="qmc-sc__extoggle" aria-expanded={showExamples} onClick={() => setShowExamples((v) => !v)}> {/* NO_TRACK */}
            <ChevronRight className={`qmc-sc__exchev${showExamples ? ' qmc-sc__exchev--open' : ''}`} />
            <span className="qmc-sc__seclabel" style={{ margin: 0 }}>Score Examples</span>
            <span className="qmc-sc__excount">({totalScores})</span>
          </button>
          {showExamples && (
          <table className="qmc-extbl">
            <thead>
              <tr>
                <th className="qmc-extbl__l">Patient</th>
                <th className="qmc-extbl__l">Category</th>
                <th className="qmc-extbl__c">Aide</th>
                <th className="qmc-extbl__c">Baseline</th>
                <th className="qmc-extbl__c">Shift</th>
                <th className="qmc-extbl__r">Date</th>
              </tr>
            </thead>
            <tbody>
              {examples.map((s, i) => (
                <tr key={i}>
                  <td className="qmc-extbl__l qmc-extbl__name">{s.patientName}</td>
                  <td className="qmc-extbl__l qmc-extbl__cat">{s.categoryName}</td>
                  <td className={`qmc-extbl__c qmc-extbl__mono qmc-text--${deviationTone(s.deviation)}`}>{s.aideScore}</td>
                  <td className="qmc-extbl__c qmc-extbl__mono qmc-extbl__muted">{s.baselineScore}</td>
                  <td className="qmc-extbl__c qmc-extbl__muted">{SHIFT_LABELS[s.shiftIndex] || s.shiftIndex}</td>
                  <td className="qmc-extbl__r qmc-extbl__muted">{s.recordedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-category diverging bars — "where you're missing"
// ---------------------------------------------------------------------------

function CategoryBars({ detail }) {
  const cats = [...(detail?.categoryDeviations ?? [])].sort(
    (a, b) => Math.abs(b.averageDeviation) - Math.abs(a.averageDeviation)
  );

  return (
    <div className="qmc-sc__col">
      <div className="qmc-sc__seclabel">By Category · vs MDS baseline</div>
      {cats.length === 0 ? (
        <div className="qmc-sc__empty">No category data.</div>
      ) : (
        <>
          <div className="qmc-cats">
            {cats.map((c) => {
              const dev = c.averageDeviation; // baseline - score
              const width = (Math.min(Math.abs(dev), BAR_MAX) / BAR_MAX) * 50; // % of half-track
              const above = dev < 0; // scored higher than baseline (high)
              const tone = !c.isSignificant ? 'emerald' : above ? 'sky' : 'rose';
              return (
                <div key={c.mdsKey} className="qmc-cat">
                  <div className="qmc-cat__label" title={c.name}>{c.name}</div>
                  <div className="qmc-cat__track">
                    <div className="qmc-cat__zero" />
                    <div
                      className={`qmc-cat__bar qmc-cat__bar--${above ? 'r' : 'l'} qmc-bg--${tone}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <div className={`qmc-cat__val qmc-text--${deviationTone(dev, c.isSignificant)}`}>{signed(dev)}</div>
                </div>
              );
            })}
          </div>
          <div className="qmc-cat__legend">
            <span className="qmc-text--rose">↤ scores low</span>
            <span className="qmc-text--sky">scores high ↦</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly trend — "are they improving?"
// ---------------------------------------------------------------------------

const TREND_W = 300;
const TREND_H = 92;
const TREND_PAD = 10;

function TrendChart({ detail }) {
  const pts = detail?.trend ?? [];

  if (pts.length === 0) {
    return (
      <div className="qmc-sc__col">
        <div className="qmc-sc__seclabel">Trend · weekly average</div>
        <div className="qmc-sc__empty">No trend data.</div>
      </div>
    );
  }

  // Display value flips sign so + = above baseline.
  const vals = pts.map((p) => -p.averageDeviation);
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const x = (i) =>
    TREND_PAD + (pts.length === 1 ? (TREND_W - 2 * TREND_PAD) / 2 : (i / (pts.length - 1)) * (TREND_W - 2 * TREND_PAD));
  const y = (v) => TREND_H / 2 - (v / maxAbs) * (TREND_H / 2 - TREND_PAD);

  const linePath = vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');

  return (
    <div className="qmc-sc__col">
      <div className="qmc-sc__seclabel">Trend · weekly average</div>
      <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="qmc-trend" style={{ maxHeight: TREND_H }}>
        <line x1={TREND_PAD} y1={TREND_H / 2} x2={TREND_W - TREND_PAD} y2={TREND_H / 2}
          stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth={1} />
        <text x={TREND_W - TREND_PAD} y={TREND_H / 2 - 3} textAnchor="end" fontSize={8} fill="#94a3b8">baseline</text>
        <path d={linePath} fill="none" stroke="#475569" strokeWidth={1.75} strokeLinejoin="round" />
        {vals.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={2.75}
            fill={Math.abs(pts[i].averageDeviation) > 0.5 ? (v > 0 ? '#0ea5e9' : '#f43f5e') : '#10b981'} />
        ))}
      </svg>
      <div className="qmc-trend__axis">
        <span>{pts[0].weekStart.slice(5)}</span>
        {pts.length > 1 && <span>{pts[pts.length - 1].weekStart.slice(5)}</span>}
      </div>
    </div>
  );
}
