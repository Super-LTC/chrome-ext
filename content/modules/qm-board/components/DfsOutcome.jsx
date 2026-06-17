/**
 * Completed-discharge outcome drill-in (#54). Fetches a stay's per-item
 * admission → discharge breakdown on open and shows what gained / stalled and
 * how the total landed vs the risk-adjusted expected (why it met/missed).
 *
 *   GET /api/extension/qm-planner/dfs/stay/{stayId}?facilityName&orgSlug
 *     → { success, data: DfsStayOutcome }
 *
 * Ported from qm-handoff/qm-dfs-outcome.reference.tsx → Preact + the qmc- CSS +
 * the background-worker fetch (the web hit /api/facilities/{id}/… directly).
 */
import { useEffect, useState } from 'preact/hooks';
import { unwrap } from '../utils/api.js';
import { X } from './icons.jsx';

export function DfsOutcome({ facilityName, orgSlug, stayId, name, dischargeDate, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ facilityName, orgSlug });
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/dfs/stay/${encodeURIComponent(stayId)}?${params}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        setData(res?.success ? unwrap(res.data) : null);
        setLoading(false);
      })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug, stayId]);

  const met = data?.met === true;
  const delta = data?.delta ?? null;
  const rows = data?.rows ?? [];

  return (
    <div className="qmc qmc-modal-overlay" onClick={onClose}>
      <div className="qmc-modal qmc-modal-in qmc-dfs-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="qmc-modal__head">
          <div style={{ minWidth: 0 }}>
            <div className="qmc-dfs-modal__title-row">
              <span className="qmc-modal__name">{name}</span>
              {data && !data.excluded && (
                <span className={`qmc-clearchip qmc-clearchip--${met ? 'emerald' : 'rose'}`}>
                  {met ? '✓ Met' : delta != null ? `Missed by ${Math.abs(Math.round(delta))}` : 'Missed'}
                </span>
              )}
              {data?.excluded && <span className="qmc-tag qmc-tag--state">Excluded</span>}
            </div>
            <p className="qmc-modal__meta">
              {dischargeDate ? `Discharged ${dischargeDate} · ` : ''}what actually happened, by item — admission vs the discharge MDS.
            </p>
          </div>
          <button type="button" className="qmc-modal__close" onClick={onClose} aria-label="Close"><X /></button> {/* NO_TRACK */}
        </div>

        {/* summary — pinned */}
        {data && !data.excluded && (
          <div className="qmc-dfs-outcome__summary">
              <span className="qmc-dfs-outcome__big">
                {Math.round(data.observed ?? 0)}<span className="qmc-dfs-outcome__big-sub"> observed</span>
              </span>
              <span className="qmc-dfs-outcome__vs">vs</span>
              <span className="qmc-dfs-outcome__big qmc-dfs-outcome__big--exp">
                {Math.round(data.expected ?? 0)}<span className="qmc-dfs-outcome__big-sub"> expected</span>
              </span>
              <span className={`qmc-dfs-outcome__delta ${met ? 'qmc-text--emerald' : 'qmc-text--rose'}`}>
                {delta != null ? `${delta >= 0 ? '+' : ''}${Math.round(delta)}` : '—'}
            </span>
          </div>
        )}

        {/* per-item table — the scroll region */}
        <div className="qmc-dfs-outcome__scroll">
          {loading ? (
            <div className="qmc-dfs-outcome__state">Loading…</div>
          ) : !data ? (
            <div className="qmc-dfs-outcome__state">Couldn’t load this stay.</div>
          ) : rows.length === 0 ? (
            <div className="qmc-dfs-outcome__state qmc-dfs-outcome__state--left">
              {data.excluded
                ? `Excluded from the measure${data.exclusionReason ? ` (${String(data.exclusionReason).replace(/_/g, ' ')})` : ''} — no per-item breakdown.`
                : 'Per-item breakdown unavailable for this stay.'}
            </div>
          ) : (
            <table className="qmc-dfs-table">
              <thead>
                <tr>
                  <th className="qmc-dfs-table__l">GG item</th>
                  <th className="qmc-dfs-table__r">Adm</th>
                  <th className="qmc-dfs-table__r">Disch</th>
                  <th className="qmc-dfs-table__r">Δ</th>
                  <th className="qmc-dfs-table__r">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // GG items round to 1–6 for display; imputed cells are continuous.
                  const adm = r.admission == null ? null : Math.round(r.admission);
                  const disch = r.discharge == null ? null : Math.round(r.discharge);
                  const d = adm != null && disch != null ? disch - adm : null;
                  const tone = d == null ? 'qmc-text--slate' : d > 0 ? 'qmc-text--emerald' : d < 0 ? 'qmc-text--rose' : 'qmc-text--slate';
                  const word = d == null ? '—' : d > 0 ? 'gained' : d < 0 ? 'declined' : 'stalled';
                  return (
                    <tr key={r.code} className={d === 0 ? 'qmc-dfs-table__row--stalled' : ''}>
                      <td className="qmc-dfs-table__l">
                        {r.label}
                        {(r.admissionImputed || r.dischargeImputed) && <span className="qmc-dfs-item__imp"> imp</span>}
                      </td>
                      <td className="qmc-dfs-table__r qmc-text--slate">{adm ?? '—'}</td>
                      <td className="qmc-dfs-table__r qmc-dfs-table__disch">{disch ?? '—'}</td>
                      <td className={`qmc-dfs-table__r ${tone}`}>{d == null ? '—' : `${d >= 0 ? '+' : ''}${d}`}</td>
                      <td className={`qmc-dfs-table__r ${tone}`}>{word}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* footer note — pinned */}
        <div className="qmc-dfs-explore__foot">
          <p className="qmc-dfs-explore__note">
            Observed sums the discharge GG items (imputed where not charted); expected is the risk-adjusted target.
            The gap = which items stalled.
          </p>
        </div>
      </div>
    </div>
  );
}
