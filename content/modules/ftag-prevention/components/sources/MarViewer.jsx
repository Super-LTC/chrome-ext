import { useMemo, useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { useFindingMar } from '../../hooks/useFindingMar.js';
import { formatDate } from '../../utils/derive.js';

/**
 * MarViewer — MAR/TAR source view for F684 / F697.
 *
 * Renders the SAME calendar grid (times × days, ✓/codes, legend) the rest of
 * the app uses for administrations — reusing the vanilla builders exposed by
 * mds-overlay.js (`window.buildAdminGridData` / `window.renderAdminGrid`) and
 * the shared `super-admin-*` styles. Data comes from the finding-anchored
 * endpoint /findings/[id]/mar (no MDS assessment id needed). Falls back to a
 * simple table if the builders aren't loaded.
 */
export function MarViewer({ finding, facilityName, orgSlug }) {
  const { data, loading, error, retry } = useFindingMar({
    facilityName, orgSlug, findingId: finding?.id,
  });

  const order = data?.order;
  const records = useMemo(() => (Array.isArray(data?.adminRecords) ? data.adminRecords : []), [data]);

  const grid = useMemo(() => {
    if (!records.length || typeof window.buildAdminGridData !== 'function' || typeof window.renderAdminGrid !== 'function') return null;
    try {
      const gridData = window.buildAdminGridData(records, data.dateRange || {});
      return {
        html: window.renderAdminGrid(gridData, order || {}),
        slots: gridData.times?.length || 0,
        events: typeof window.countAdminEvents === 'function' ? window.countAdminEvents(gridData) : 0,
      };
    } catch (e) {
      console.warn('[FTagPrevention] admin grid build failed, falling back', e);
      return null;
    }
  }, [records, data, order]);

  if (loading) return <div className="ftp-src__loading">Loading MAR/TAR…</div>;
  if (error) {
    return (
      <div className="ftp-src__error">
        <div>Couldn’t load MAR/TAR — {error}</div>
        <button type="button" className="ftp-linkbtn" onClick={retry}>Retry</button> {/* NO_TRACK */}
      </div>
    );
  }

  const isMar = records[0]?.type !== 'treatment' && (order?.category !== 'Treatment');
  const typeBadge = isMar ? 'MAR' : 'TAR';

  return (
    <div className="ftp-mar ftp-mar--grid">
      {order && (
        <div className="super-admin-modal__header">
          <div className="super-admin-modal__title-row">
            <span className="super-admin-modal__icon">{isMar ? '💊' : '⚡'}</span>
            <div className="super-admin-modal__title">
              <span className="super-admin-modal__order-name">{order.name || 'Order'}</span>
              <span className={`super-admin-badge super-admin-badge--${isMar ? 'mar' : 'tar'}`}>{typeBadge}</span>
            </div>
          </div>
          {order.directions && <div className="super-admin-modal__directions">{order.directions}</div>}
          <div className="super-admin-modal__meta">
            {order.category && <span>{order.category}</span>}
            {order.status && <span> · {order.status}</span>}
            {data?.dateRange && <span> · {formatDate(data.dateRange.startDate)} – {formatDate(data.dateRange.endDate)}</span>}
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="ftp-empty">No administration records in this window.</div>
      ) : grid ? (
        <>
          <MarGrid html={grid.html} />
          <div className="super-admin-modal__footer">
            <span className="super-admin-modal__event-count">{grid.events} event{grid.events !== 1 ? 's' : ''}</span>
            <div className="super-admin-legend">
              <span className="super-admin-legend__item super-admin-legend__item--given">✓ Given</span>
              <span className="super-admin-legend__item super-admin-legend__item--refused">2 Refused</span>
              <span className="super-admin-legend__item super-admin-legend__item--loa">3 LOA</span>
              <span className="super-admin-legend__item super-admin-legend__item--hold">5 Hold</span>
            </div>
          </div>
        </>
      ) : (
        <FallbackTable records={records} />
      )}
    </div>
  );
}

/**
 * MarGrid — wraps the injected grid HTML with left/right scroll arrows + edge
 * fades so it's obvious the week grid scrolls horizontally. Arrows scroll the
 * inner `.super-admin-grid-wrapper`; each fades out when there's nothing more
 * that way.
 */
function MarGrid({ html }) {
  const bodyRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const scroller = () => bodyRef.current?.querySelector('.super-admin-grid-wrapper') || bodyRef.current;

  const update = useCallback(() => {
    const el = scroller();
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [html, update]);

  const nudge = (dir) => {
    const el = scroller();
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  return (
    <div className={`ftp-marscroll ${edges.left ? 'has-left' : ''} ${edges.right ? 'has-right' : ''}`}>
      <button type="button" className="ftp-marscroll__arrow ftp-marscroll__arrow--left" aria-label="Scroll earlier" onClick={() => nudge(-1)}> {/* NO_TRACK */}
        <Chevron dir="left" />
      </button>
      <div className="super-admin-modal__body ftp-marscroll__body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />
      <button type="button" className="ftp-marscroll__arrow ftp-marscroll__arrow--right" aria-label="Scroll later" onClick={() => nudge(1)}> {/* NO_TRACK */}
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

/** Minimal table fallback if the shared grid builders aren't available. */
function FallbackTable({ records }) {
  return records.map((rec) => (
    <div className="ftp-mar__record" key={rec.id}>
      <div className="ftp-mar__record-head"><span className="ftp-mar__record-name">{rec.name}</span></div>
      {rec.instructions && <div className="ftp-mar__record-instr">{rec.instructions}</div>}
      <table className="ftp-mar__table">
        <thead><tr><th>Date</th><th>Status</th><th>Detail</th><th>Staff</th></tr></thead>
        <tbody>
          {(rec.events || []).map((ev) => (
            <tr key={ev.id}>
              <td className="ftp-mono">{formatDate(ev.date)}{ev.time ? ` ${ev.time}` : ''}</td>
              <td>{labelStatus(ev.status) || (ev.chartCode ? `Code ${ev.chartCode}` : '—')}</td>
              <td>{ev.value || ''}</td>
              <td className="ftp-mono">{ev.staffInitials || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ));
}

function labelStatus(s) {
  if (!s) return '';
  return String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
