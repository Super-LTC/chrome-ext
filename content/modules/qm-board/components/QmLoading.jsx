/**
 * QmLoading — a playful, on-theme loading scene for the QM surfaces.
 *
 * A pulsing survey-shield with twinkling Five-Stars, a cluster of real QM
 * measure chips that bob/cascade like they're being tallied, a cycling
 * status quip, and an indeterminate shimmer bar. Pure CSS animation + one
 * interval for the quip rotation.
 */
import { useState, useEffect } from 'preact/hooks';
import { ShieldCheck } from './icons.jsx';

// Real measures, tone-coded like the board tiles.
const CHIPS = [
  { label: 'UTI', code: 'N024', tone: 'sky' },
  { label: 'Catheter', code: 'N026', tone: 'violet' },
  { label: 'Falls w/ Injury', code: 'N013', tone: 'rose' },
  { label: 'Antipsychotic', code: 'N047', tone: 'amber' },
  { label: 'ADL Decline', tone: 'sky' },
  { label: 'Pressure Ulcer', tone: 'rose' },
  { label: 'Depression', code: 'N030', tone: 'violet' },
  { label: 'Weight Loss', code: 'N029', tone: 'amber' },
  { label: 'Restraints', code: 'N027', tone: 'slate' },
  { label: 'Walk Indep.', code: 'N035', tone: 'sky' },
];

const QUIPS = [
  'Counting catheters…',
  'Checking for UTIs…',
  'Tallying falls…',
  'Weighing residents…',
  'Scoring Five-Star…',
  'Finding the levers…',
  'Sorting at-risk from destined…',
  'Reading the cliff dates…',
  'Pairing the evidence…',
];

export function QmLoading({ title = 'Building your QM board' }) {
  const [q, setQ] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setQ((n) => (n + 1) % QUIPS.length), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="qmc qmc-load">
      <div className="qmc-load__stage">
        <span className="qmc-load__star qmc-load__star--a">★</span>
        <span className="qmc-load__star qmc-load__star--b">★</span>
        <span className="qmc-load__star qmc-load__star--c">★</span>
        <span className="qmc-load__ring" />
        <span className="qmc-load__shield"><ShieldCheck /></span>
      </div>

      <div className="qmc-load__chips">
        {CHIPS.map((c, i) => (
          <span key={c.label} className={`qmc-load__chip qmc-chip qmc-chip--${c.tone}`} style={{ animationDelay: `${i * 0.12}s` }}>
            {c.label}{c.code && <b className="qmc-load__code">{c.code}</b>}
          </span>
        ))}
      </div>

      <div className="qmc-load__title">{title}</div>
      <div className="qmc-load__quip">{QUIPS[q]}</div>
      <div className="qmc-load__bar"><span /></div>
    </div>
  );
}
