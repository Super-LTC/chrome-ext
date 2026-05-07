/**
 * ChangesList — recent status changes between coverage runs.
 */
const STATUS_RANK = { covered: 0, partial: 1, missing: 2 };

function isWorse(prev, curr) {
  return (STATUS_RANK[curr] ?? 0) > (STATUS_RANK[prev] ?? 0);
}

export function ChangesList({ changes }) {
  if (!changes || !changes.length) return null;

  return (
    <div class="cpc__changes">
      <div class="cpc__changes-title">Recent changes</div>
      {changes.map((c, i) => {
        const worse = isWorse(c.previousStatus, c.currentStatus);
        return (
          <div class="cpc__change-row" key={i}>
            <span class={`cpc__change-arrow ${worse ? 'cpc__change-arrow--worse' : 'cpc__change-arrow--better'}`}>
              {worse ? '\u2193' : '\u2191'}
            </span>
            {c.code && <span class="cpc__change-code">{c.code}</span>}
            <span class="cpc__item-desc">{c.description || 'Unknown'}</span>
            <span class="cpc__change-transition">
              {c.previousStatus} {'\u2192'} {c.currentStatus}
            </span>
          </div>
        );
      })}
    </div>
  );
}
