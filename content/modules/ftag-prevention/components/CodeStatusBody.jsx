import { useState } from 'preact/hooks';
import { formatAgo } from '../utils/derive.js';
import { ftagMeta } from '../utils/ftags.js';

/**
 * CodeStatusBody — the F678 (Code Status / CPR) card body. Replaces the generic
 * detail/meta block for code-status findings with:
 *
 *   <headline>                       (e.g. "Code status conflict in the chart")
 *   Record     Full Code
 *   Order      Full Code
 *   Care plan  DNR        ← tinted   (the minority value pops)
 *   Form       —
 *   ⤷ Care plan says DNR; chart says Full Code — reconcile.
 *   Code Status / CPR · flagged about 6 hours ago
 *
 * Stacked (not one line) because the overlay column is narrow.
 */
export function CodeStatusBody({ finding }) {
  const cs = finding.codeStatus;
  const meta = ftagMeta(finding.ftag);
  const [showDetails, setShowDetails] = useState(false);
  if (!cs) return null;

  const detailRows = cs.rows.filter((r) => r.detail);

  return (
    <>
      {finding.clinicalDetail && (
        <div className="ftp-frow__detail">
          <span className="ftp-frow__detail-text">{finding.clinicalDetail}</span>
        </div>
      )}

      <div className="ftp-cs">
        {cs.rows.map((r) => (
          <div className={`ftp-cs__row ${r.isMinority ? 'ftp-cs__row--minority' : ''}`} key={r.key}>
            <span className="ftp-cs__label">{r.label}</span>
            <span className="ftp-cs__value">
              {r.value}
              {r.stale && <span className="ftp-cs__muted"> (old)</span>}
              {r.docMeta && r.docMeta.documentType && (
                <span className="ftp-cs__muted"> · {r.docMeta.documentType}</span>
              )}
              {r.docMeta && r.docMeta.confidence && (
                <span className="ftp-cs__muted ftp-cs__muted--cap"> · {r.docMeta.confidence}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {cs.reconcile && (
        <div className="ftp-cs__reconcile">
          <span className="ftp-cs__reconcile-arrow" aria-hidden="true">⤷</span>
          <span>{cs.reconcile}</span>
        </div>
      )}

      {detailRows.length > 0 && (
        <div className="ftp-cs__disclosure">
          <button
            type="button"
            className="ftp-cs__disclosure-toggle"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          > {/* NO_TRACK */}
            {showDetails ? 'Hide order & care-plan details' : 'Show order & care-plan details'}
            <span className={`ftp-cs__chev ${showDetails ? 'is-open' : ''}`} aria-hidden="true">▸</span>
          </button>

          {showDetails && (
            <div className="ftp-cs__details">
              {detailRows.map((r) => (
                <div className="ftp-cs__detail" key={r.key}>
                  <div className="ftp-cs__detail-label">{r.label}</div>
                  {r.detail.kind === 'order' && (
                    <div className="ftp-cs__detail-text">{r.detail.text}</div>
                  )}
                  {r.detail.kind === 'care_plan' && (
                    <>
                      {r.detail.focus && <div className="ftp-cs__detail-text">{r.detail.focus}</div>}
                      {r.detail.goals.length > 0 && (
                        <div className="ftp-cs__detail-sub">
                          <span className="ftp-cs__detail-sublabel">Goals</span>
                          <ul className="ftp-cs__detail-list">
                            {r.detail.goals.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                      {r.detail.interventions.length > 0 && (
                        <div className="ftp-cs__detail-sub">
                          <span className="ftp-cs__detail-sublabel">Interventions</span>
                          <ul className="ftp-cs__detail-list">
                            {r.detail.interventions.map((iv, i) => <li key={i}>{iv}</li>)}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ftp-frow__meta">
        <span className="ftp-frow__tagname">{meta?.title || finding.catalogTitle}</span>
        <span className="ftp-frow__ago">flagged {formatAgo(finding.triggeredAt)}</span>
      </div>
    </>
  );
}
