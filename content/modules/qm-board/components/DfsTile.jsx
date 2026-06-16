/**
 * DFS as a quiet grid tile (informational, higher-is-better). Unlike the count
 * tiles, it's rate-led: the big number is the rolling-12mo rate, benchmarked
 * against the national average (a fill bar + a national tick). Tapping opens the
 * full DFS page. Render only when dfs.available && lens !== 'qip' (caller gates).
 *
 * Ported from qm-handoff/qm-dfs-tile.reference.tsx → Preact + the qmc- tile CSS.
 */
import { dfsTileStats } from '../lib/qm-dfs-view.js';
import { ArrowUp, ArrowDown } from './icons.jsx';

export function DfsTile({ dfs, delay, onClick }) {
  const { ratePct, vsNationalPts, discharges, tone } = dfsTileStats(dfs);
  const nationalPct = dfs.nationalRate == null ? null : dfs.nationalRate * 100;
  const toneText = tone === 'good' ? 'emerald' : tone === 'bad' ? 'rose' : 'slate';

  return (
    <button type="button" data-track="qm_tile_clicked" data-track-prop-measure-code="dfs"
      className="qmc-tile qmc-rise" style={{ animationDelay: `${delay}ms` }} onClick={onClick}>
      <div className="qmc-tile__top">
        <div style={{ minWidth: 0 }}>
          <div className="qmc-tile__name">Discharge Function</div>
          <div className="qmc-tile__meta">
            <span className="qmc-tile__code">DFS</span>
            <span className="qmc-tag qmc-tag--qrp">5★ · QRP</span>
          </div>
        </div>
        <div className={`qmc-tile__count ${ratePct != null ? '' : 'qmc-tile__count--zero'}`}>
          {ratePct != null ? `${ratePct}%` : '—'}
        </div>
      </div>

      {/* benchmark bar: rate fill + national tick (fills the dots-row height of sibling tiles) */}
      <div className="qmc-dfstile__bench">
        {ratePct != null ? (
          <div className="qmc-dfstile__bar">
            <div className={`qmc-dfstile__fill qmc-dfstile__fill--${tone}`} style={{ width: `${Math.min(100, ratePct)}%` }} />
            {nationalPct != null && (
              <div className="qmc-dfstile__tick" style={{ left: `${Math.min(100, nationalPct)}%` }} title={`National ${nationalPct.toFixed(1)}%`} />
            )}
          </div>
        ) : (
          <span className="qmc-dfstile__empty">No discharges yet</span>
        )}
      </div>

      <div className="qmc-tile__foot">
        <span className={`qmc-tile__foot-action qmc-dfstile__vs qmc-text--${toneText}`}>
          {vsNationalPts == null ? 'Informational'
            : vsNationalPts === 0 ? 'At national avg'
            : (<>{vsNationalPts > 0 ? <ArrowUp className="qmc-dfstile__arrow" /> : <ArrowDown className="qmc-dfstile__arrow" />}{Math.abs(vsNationalPts)} pts vs nat'l</>)}
        </span>
        <span className="qmc-tile__rate">{discharges} discharge{discharges === 1 ? '' : 's'}</span>
      </div>
    </button>
  );
}
