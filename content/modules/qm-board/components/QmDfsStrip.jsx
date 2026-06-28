/**
 * Regional DFS strip. DFS is a 12-month stay-based measure, NOT a quarter-over-
 * quarter rate — so it lives outside the temporal scorecard table. Shows CURRENT
 * (live) vs OFFICIAL (CMS published), the count of in-house residents still
 * coming (NO predicted rate — can't forecast the in-stay outcome reliably), and
 * how the measure plays into the Five-Star ★. Click → the full DFS page.
 *
 * Ported from qm-dfs-strip.reference.tsx → Preact + the qms- tone system.
 */
import { ArrowUpRight, Star, Users } from './icons.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pct = (p) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`);

/** Render a CMS (MM/DD/YYYY) or live (YYYY-MM-DD) date as `MMM YYYY`. */
function monthLabel(s) {
  if (!s) return null;
  let mo = '';
  let yr = '';
  if (s.includes('/')) {
    const [mm, , yyyy] = s.split('/');
    mo = mm ?? '';
    yr = yyyy ?? '';
  } else {
    const [yyyy, mm] = s.split('-');
    mo = mm ?? '';
    yr = yyyy ?? '';
  }
  const idx = parseInt(mo, 10) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${yr}` : null;
}
function windowLabel(start, end) {
  const a = monthLabel(start);
  const b = monthLabel(end);
  if (a && b) return `${a} – ${b}`;
  if (b) return `as of ${b}`;
  return null;
}

/** One of the two rates. `tone` drives the accent (current = emphasis). */
function DfsNumber({ label, sub, rate, numerator, denominator, tone, footnote }) {
  return (
    <div className={`qms-dfsnum qms-dfsnum--${tone}`}>
      <div className="qms-dfsnum__head">
        <span className="qms-dfsnum__label">{label}</span>
        {sub && <span className="qms-dfsnum__sub">{sub}</span>}
      </div>
      {rate != null ? (
        <>
          <div className="qms-dfsnum__rate">{pct(rate)}</div>
          {numerator != null && denominator != null && (
            <div className="qms-dfsnum__frac">{numerator} of {denominator} stays met target</div>
          )}
        </>
      ) : (
        <div className="qms-dfsnum__rate qms-dfsnum__rate--empty">—</div>
      )}
      <div className="qms-dfsnum__foot">{footnote}</div>
    </div>
  );
}

export function QmDfsStrip({ strip, onOpenDfs }) {
  const currentWindow = windowLabel(strip.current.windowStart, strip.current.windowEnd);
  const officialWindow = strip.official ? windowLabel(strip.official.windowStart, strip.official.windowEnd) : null;

  return (
    <div className="qms-dfs">
      <div className="qms-dfs__head">
        <div className="qms-dfs__title-group">
          <span className="qms-dfs__title">Discharge Function</span>
          <span className="qms-dfs__badge">SNF QRP · rolling 12-mo</span>
        </div>
        {onOpenDfs && (
          <button type="button" className="qms-dfs__open" onClick={onOpenDfs}> {/* NO_TRACK */}
            Open detail <ArrowUpRight />
          </button>
        )}
      </div>

      <div className="qms-dfs__rates">
        <DfsNumber
          label="Current"
          sub={currentWindow ?? 'rolling 12-mo'}
          rate={strip.current.rate}
          numerator={strip.current.numerator}
          denominator={strip.current.denominator}
          tone="current"
          footnote={
            strip.current.coveragePct != null
              ? `from discharges we hold · ${Math.round(strip.current.coveragePct)}% of CMS volume`
              : 'from discharges we hold'
          }
        />
        <DfsNumber
          label="CMS Official"
          sub={officialWindow ?? 'last published'}
          rate={strip.official?.rate ?? null}
          numerator={strip.official?.numerator ?? null}
          denominator={strip.official?.denominator ?? null}
          tone="muted"
          footnote={strip.official ? 'published · lags ~2 quarters' : 'no CMS-published score yet'}
        />
      </div>

      {/* in-house coming + how it plays into the Five-Star ★ */}
      <div className="qms-dfs__cells">
        <div className="qms-dfs__cell">
          <Users className="qms-dfs__cellicon" />
          <div>
            <div className="qms-dfs__cellnum"><span className="qms-dfs__big">{strip.inHouseCount}</span> in-house now</div>
            <div className="qms-dfs__cellsub">join the rate when they discharge</div>
          </div>
        </div>
        <div className="qms-dfs__cell">
          <Star className="qms-dfs__cellicon qms-dfs__cellicon--star" fill="currentColor" />
          <div>
            <div className="qms-dfs__cellnum">
              {strip.points != null && strip.maxPoints != null
                ? <><span className="qms-dfs__big">{strip.points}</span> / {strip.maxPoints} pts</>
                : <span className="qms-dfs__big qms-dfs__big--empty">—</span>}
              {' '}to your Five-Star
            </div>
            <div className="qms-dfs__cellsub">already counted in the projected ★ above</div>
          </div>
        </div>
      </div>

      <div className="qms-dfs__foot">
        <span>National avg <b>{pct(strip.nationalRate)}</b></span>
        <span className="qms-dfs__footnote">Higher is better · each completed Part A stay counts once, by discharge date</span>
      </div>
    </div>
  );
}
