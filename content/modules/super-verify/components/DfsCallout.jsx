import { useState } from 'preact/hooks';
import { DfsExplorer } from '../../qm-board/components/DfsExplorer.jsx';
import { DfsOutcome } from '../../qm-board/components/DfsOutcome.jsx';

/**
 * Discharge Function Score, on the Verify panel.
 *
 * Two states, and they answer different questions:
 *
 *   IN-HOUSE   → "here is the score this resident needs to reach." Actionable:
 *                the stay is open and therapy can still move it. This is the
 *                state Verify had NOTHING for — the DFS evaluator skips any
 *                target that isn't a PPS Discharge, so on a 5-Day the measure
 *                didn't render at all, at exactly the moment it's still useful.
 *
 *   DISCHARGED → "here is what they hit, and whether it met." Retrospective:
 *                DFS locks at PPS Discharge and cannot change within the stay,
 *                so this states the result and puts the per-item detail one
 *                click away rather than filling the card with it.
 *
 * Both drill-ins are the QM Board's EXISTING modals — DfsExplorer (bump each GG
 * item to see what it would take to clear the target) and DfsOutcome (per-item
 * admission → discharge, what gained and what stalled). Verify supplies the
 * entry point, not a second copy of either.
 */

/** 10 GG items scored 1–6, so the floor is 10, not 0. A 0-based bar would
 *  overstate how much room a resident actually has. */
const DFS_MIN = 10;
const DFS_MAX = 60;
const pct = (v) => Math.max(0, Math.min(100, ((v - DFS_MIN) / (DFS_MAX - DFS_MIN)) * 100));

const round = (n) => (n == null ? null : Math.round(n));

export function DfsCallout({ dfs, facilityName, orgSlug }) {
  const [open, setOpen] = useState(null); // 'explorer' | 'outcome' | null

  // Not every resident has a DFS standing — long-stay and non-Part-A cases have
  // none, and that is a normal state, so the callout simply doesn't render.
  if (!dfs?.available) return null;
  const { projection, completed } = dfs;
  if (!projection && !completed) return null;

  // A discharged stay is the more specific answer: if both exist, the stay under
  // review has ended and the result beats the projection.
  const done = completed && completed.excluded !== true ? completed : null;

  if (done) {
    const observed = round(done.observed);
    const expected = round(done.expected);
    const met = done.met === true;
    const gap = observed != null && expected != null ? Math.abs(observed - expected) : null;

    return (
      <>
        <div className="sv-sec" data-anchor="dfs">
          <h3>Discharge function</h3>
          <span className="sv-sec__ln" />
        </div>
        <div className="sv-wrap">
          <div className={`svd svd--${met ? 'met' : 'miss'}`}>
            <div className="svd__bar" />
            <div className="svd__body">
              <div className="svd__eyebrow">Discharge function score</div>
              <div className="svd__hero">
                <span className="svd__big">{observed ?? '—'}</span>
                <span className="svd__vs">
                  target <b>{expected ?? '—'}</b>
                </span>
                <span className={`svd__pill svd__pill--${met ? 'met' : 'miss'}`}>
                  {met ? `Met · +${gap ?? 0}` : `${gap ?? 0} short`}
                </span>
              </div>
              <div className="svd__say">
                {met
                  ? 'At or above this resident’s expected score — the stay counts in your favour.'
                  : 'Below this resident’s expected score, so the stay counts against the measure.'}
              </div>
              {observed != null && expected != null && (
                <>
                  <div className="svd__track">
                    <div className="svd__fill" style={{ width: `${pct(observed)}%` }} />
                    <div className="svd__mark" style={{ left: `${pct(expected)}%` }} />
                  </div>
                  <div className="svd__scale">
                    <span>{DFS_MIN}</span>
                    <span>target {expected}</span>
                    <span>{DFS_MAX}</span>
                  </div>
                </>
              )}
              <div className="svd__foot">
                {/* NO_TRACK — opens the existing per-item outcome drill-in */}
                <button className="sv-btn" onClick={() => setOpen('outcome')}>
                  See where it landed
                </button>
              </div>
            </div>
          </div>
        </div>
        {open === 'outcome' && (
          <DfsOutcome
            facilityName={facilityName}
            orgSlug={orgSlug}
            stayId={done.stayId}
            name={done.name}
            dischargeDate={done.dischargeDate}
            onClose={() => setOpen(null)}
          />
        )}
      </>
    );
  }

  const target = round(projection.expected);
  return (
    <>
      <div className="sv-sec" data-anchor="dfs">
        <h3>Discharge function</h3>
        <span className="sv-sec__ln" />
      </div>
      <div className="sv-wrap">
        <div className="svd svd--target">
          <div className="svd__bar" />
          <div className="svd__body">
            <div className="svd__eyebrow">Discharge function target</div>
            <div className="svd__hero">
              <span className="svd__big">{target ?? '—'}</span>
              <span className="svd__pill svd__pill--target">Risk-adjusted</span>
              {projection.atRisk && <span className="svd__pill svd__pill--risk">At risk</span>}
            </div>
            <div className="svd__say">
              This resident needs to reach <b>{target} of {DFS_MAX}</b> by discharge for the stay
              to count as meeting expectation. Entry was <b>{round(projection.entryScore)}</b>.
            </div>
            <div className="svd__foot">
              {/* NO_TRACK — opens the existing what-would-it-take explorer */}
              <button className="sv-btn sv-btn--primary" onClick={() => setOpen('explorer')}>
                What would it take?
              </button>
              <span className="svd__hint">Day {projection.daysOnStay} of stay</span>
            </div>
          </div>
        </div>
      </div>
      {open === 'explorer' && (
        <DfsExplorer resident={projection} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
