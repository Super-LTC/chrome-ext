/**
 * Discharge Function Score (DFS) card — forward-looking short-stay SNF QRP
 * measure (web round 2). Hero = OUR current rolling-12-mo rate ("your current
 * pace"); CMS's published number is a stale context line; coverage is shown as
 * discharge volume, not a same-window %. Collapsible in-house list (admission →
 * target climb bars, biggest climb first) opens the +/- explorer; collapsible
 * recent-discharges table opens the per-stay outcome drill-in.
 *
 * Ported from qm-handoff/qm-dfs-card.reference.tsx → Preact + the qmc- CSS.
 * Board-only, lazy-fetched (useDfs). `available:false` → honest "match" nudge.
 */
import { useMemo, useState } from 'preact/hooks';
import { ChevronDown, ArrowUp, ArrowDown } from './icons.jsx';
import { DfsExplorer } from './DfsExplorer.jsx';
import { DfsOutcome } from './DfsOutcome.jsx';

const DFS_MAX = 60;
const pct = (p) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`);
const pts = (n) => (n == null ? '—' : Math.round(n).toString());

/** Tone for an in-house resident's climb-to-target (entry → expected). */
function climbTone(climb) {
  if (climb >= 12) return { tone: 'amber', label: `+${Math.round(climb)} climb` };
  if (climb <= 5) return { tone: 'emerald', label: `+${Math.round(climb)} · close` };
  return { tone: 'slate', label: `+${Math.round(climb)}` };
}

export function DfsCard({ dfs, facilityName, orgSlug }) {
  const [showResidents, setShowResidents] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [explore, setExplore] = useState(null);
  const [outcome, setOutcome] = useState(null);

  // In-house residents sorted by biggest climb (entry → target) first.
  const residents = useMemo(
    () =>
      [...(dfs?.inProgress?.residents ?? [])]
        .map((r) => ({ ...r, climb: Math.max(0, r.expected - r.entryScore) }))
        .sort((a, b) => b.climb - a.climb),
    [dfs]
  );
  const bigClimbs = residents.filter((r) => r.climb >= 12).length;

  const completed = dfs?.completed ?? [];
  const met = completed.filter((c) => c.met === true).length;
  const missed = completed.filter((c) => c.met === false).length;
  const excluded = completed.filter((c) => c.excluded).length;

  // Unmatched facility → honest nudge, no fabricated numbers.
  if (!dfs?.available) {
    return (
      <div className="qmc-dfs qmc-rise">
        <div className="qmc-dfs__head">
          <div className="qmc-dfs__title-row">
            <h3 className="qmc-dfs__title">Discharge Function Score</h3>
            <span className="qmc-tag qmc-tag--star">Short-stay · SNF QRP</span>
          </div>
        </div>
        <p className="qmc-dfs__nudge">
          Match this facility to its CMS provider record (Admin → Quality Measures → Facility Matching)
          to show the published Discharge Function Score and benchmark.
        </p>
      </div>
    );
  }

  const cms = dfs.cms;
  // Forward-looking: our current rolling-window rate vs CMS's last *published*
  // number (a different, older window — shown only as context, not a target).
  const vsPublished =
    cms?.rateShown != null && dfs.live.rate != null
      ? Math.round((dfs.live.rate - cms.rateShown) * 100)
      : null;
  const hasLive = dfs.live.denominator > 0;

  return (
    <>
      <section className="qmc-dfs qmc-rise">
        {/* header */}
        <div className="qmc-dfs__head">
          <div>
            <div className="qmc-dfs__title-row">
              <h3 className="qmc-dfs__title">Discharge Function Score</h3>
              <span className="qmc-tag qmc-tag--star">Short-stay · SNF QRP + Five-Star</span>
            </div>
            <p className="qmc-dfs__sub">
              % of short-stay residents who meet their <b>expected</b> discharge function. Higher is better.
            </p>
          </div>
          <span className="qmc-tag qmc-tag--state qmc-dfs__info">Informational</span>
        </div>

        {/* hero: current pace (forward-looking) */}
        <div className="qmc-dfs__hero">
          <div className="qmc-dfs__eyebrow">Your current pace · rolling 12&nbsp;mo</div>
          {hasLive ? (
            <>
              <div className="qmc-dfs__hero-row">
                <span className="qmc-dfs__big">{pct(dfs.live.rate)}</span>
                {vsPublished != null && vsPublished !== 0 && (
                  <span className={`qmc-dfs__vspub qmc-dfs__vspub--${vsPublished > 0 ? 'up' : 'down'}`}>
                    {vsPublished > 0 ? <ArrowUp /> : <ArrowDown />}
                    {Math.abs(vsPublished)} pts vs last published
                  </span>
                )}
              </div>
              <div className="qmc-dfs__hero-meta">
                {dfs.live.numerator} of {dfs.live.denominator} discharges met target
              </div>
            </>
          ) : (
            <div>
              <span className="qmc-dfs__big qmc-dfs__big--empty">—</span>
              <div className="qmc-dfs__hero-meta">No discharges in the window yet — fills in as residents discharge.</div>
            </div>
          )}

          {/* context strip: national + coverage volume + CMS official (older period) */}
          <div className="qmc-dfs__context">
            <span className="qmc-text--slate">National avg <b className="qmc-dfs__ctx-strong">{pct(dfs.nationalRate)}</b></span>
            {hasLive && (
              <span className="qmc-text--emerald qmc-dfs__ctx-cov">✓ based on {dfs.live.denominator} discharges this period</span>
            )}
            {cms?.rateShown != null && (
              <span className="qmc-text--slate">
                CMS official <b>{pct(cms.rateShown)}</b>
                {cms.windowEnd ? ` · as of ${cms.windowEnd} (last published)` : ''}
              </span>
            )}
          </div>
        </div>

        {/* in-house: who you can still move */}
        <div className="qmc-dfs__section">
          <button type="button" className="qmc-dfs__sechead" onClick={() => setShowResidents((s) => !s)}> {/* NO_TRACK */}
            <div>
              <div className="qmc-dfs__sectitle">In-house now — who you can still move</div>
              <div className="qmc-dfs__secsub">They join the rate when they discharge. Push their GG above the target first.</div>
            </div>
            <div className="qmc-dfs__sechead-right">
              <div className="qmc-dfs__secstat">
                <div className="qmc-dfs__secstat-n">{residents.length} residents</div>
                {bigClimbs > 0 && <div className="qmc-dfs__secstat-sub qmc-text--amber">{bigClimbs} big climbs</div>}
              </div>
              <ChevronDown className={`qmc-dfs__chev ${showResidents ? 'qmc-dfs__chev--open' : ''}`} />
            </div>
          </button>

          {showResidents && (
            <div className="qmc-dfs__rows">
              {residents.length === 0 && (
                <div className="qmc-dfs__empty">No in-house short-stay Part A residents.</div>
              )}
              {residents.map((r) => {
                const tone = climbTone(r.climb);
                const entryW = Math.min(100, (r.entryScore / DFS_MAX) * 100);
                const targetL = Math.min(100, (r.expected / DFS_MAX) * 100);
                return (
                  <button key={r.stayId} type="button" data-track="qm_drill_in" data-track-prop-measure-code="dfs" data-track-prop-view="dfs_explorer" className="qmc-dfs-prow" onClick={() => setExplore(r)}>
                    <div className="qmc-dfs-prow__name-col">
                      <div className="qmc-dfs-prow__name">{r.name}</div>
                      <div className="qmc-dfs-prow__sub">day {r.daysOnStay} · tap to explore</div>
                    </div>
                    <div className="qmc-dfs-prow__bar-col">
                      <div className="qmc-dfs-prow__bar">
                        <div className="qmc-dfs-prow__bar-track" />
                        <div className={`qmc-dfs-prow__bar-fill qmc-dfs-prow__bar-fill--${tone.tone}`} style={{ width: `${entryW}%` }} />
                        <div className="qmc-dfs-prow__bar-target" style={{ left: `${targetL}%` }} />
                        <div className="qmc-dfs-prow__bar-entry" style={{ left: `${Math.max(0, entryW - 3)}%` }}>{pts(r.entryScore)}</div>
                        <div className="qmc-dfs-prow__bar-tgtlbl" style={{ left: `${Math.max(0, targetL - 6)}%` }}>target {pts(r.expected)}</div>
                      </div>
                    </div>
                    <div className="qmc-dfs-prow__tag-col">
                      <span className={`qmc-clearchip qmc-clearchip--${tone.tone}`}>{tone.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* completed: already in the rate */}
        <div className="qmc-dfs__section">
          <button type="button" className="qmc-dfs__sechead" onClick={() => setShowCompleted((s) => !s)}> {/* NO_TRACK */}
            <div>
              <div className="qmc-dfs__sectitle">Recent discharges — already in the rate</div>
              <div className="qmc-dfs__secsub">Locked once they discharged. Observed vs risk-adjusted expected.</div>
            </div>
            <div className="qmc-dfs__sechead-right">
              <div className="qmc-dfs__secstat">
                <div className="qmc-dfs__secstat-n qmc-text--emerald">{met} met</div>
                <div className="qmc-dfs__secstat-sub qmc-text--rose">{missed} missed{excluded > 0 ? ` · ${excluded} excl.` : ''}</div>
              </div>
              <ChevronDown className={`qmc-dfs__chev ${showCompleted ? 'qmc-dfs__chev--open' : ''}`} />
            </div>
          </button>

          {showCompleted && (
            <table className="qmc-dfs-table qmc-dfs-table--completed">
              <thead>
                <tr>
                  <th className="qmc-dfs-table__l">Resident</th>
                  <th className="qmc-dfs-table__l">Discharged</th>
                  <th className="qmc-dfs-table__r">Obs</th>
                  <th className="qmc-dfs-table__r">Exp</th>
                  <th className="qmc-dfs-table__r">Result</th>
                </tr>
              </thead>
              <tbody>
                {completed.length === 0 && (
                  <tr><td colSpan={5} className="qmc-dfs__empty">No completed stays in the window yet — coverage builds as residents discharge.</td></tr>
                )}
                {completed.map((c) => (
                  <tr key={c.stayId}
                    className={c.excluded ? 'qmc-dfs-table__row--excl' : 'qmc-dfs-table__row--click'}
                    onClick={c.excluded ? undefined : () => setOutcome({ stayId: c.stayId, name: c.name, dischargeDate: c.dischargeDate })}>
                    <td className="qmc-dfs-table__l">
                      <div className={c.excluded ? 'qmc-text--slate' : 'qmc-dfs-table__name'}>{c.name}</div>
                      {c.primaryCondition && <div className="qmc-dfs-prow__sub">{c.primaryCondition}</div>}
                    </td>
                    <td className="qmc-dfs-table__l qmc-text--slate">{c.dischargeDate ?? '—'}</td>
                    <td className="qmc-dfs-table__r qmc-dfs-table__disch">{pts(c.observed)}</td>
                    <td className="qmc-dfs-table__r qmc-text--slate">{pts(c.expected)}</td>
                    <td className="qmc-dfs-table__r">
                      {c.excluded ? (
                        <span className="qmc-tag qmc-tag--state">Excluded</span>
                      ) : c.met ? (
                        <span className="qmc-clearchip qmc-clearchip--emerald">✓ Met</span>
                      ) : (
                        <span className="qmc-clearchip qmc-clearchip--rose">Missed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {explore && <DfsExplorer resident={explore} onClose={() => setExplore(null)} />}
      {outcome && (
        <DfsOutcome
          facilityName={facilityName}
          orgSlug={orgSlug}
          stayId={outcome.stayId}
          name={outcome.name}
          dischargeDate={outcome.dischargeDate}
          onClose={() => setOutcome(null)}
        />
      )}
    </>
  );
}
