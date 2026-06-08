import { ftagMeta } from '../utils/ftags.js';

/**
 * CardsStrip — compact filter pills on top, one per F-tag, doubling as the
 * filter. Each pill is `[count] Plain-English name` (nurses don't know F-tag
 * numbers; the code lives in the tooltip). Clicking a pill filters the list
 * below to that tag; the "All" pill clears the filter. Kept short to leave the
 * scrollable list as much room as possible.
 */
const ACCENT = { critical: 'hot', high: 'warn', standard: 'std' };

export function CardsStrip({ tiles, total, activeTag, onSelect }) {
  return (
    <div className="ftp-cards" role="tablist" aria-label="Filter by F-tag">
      <button
        type="button"
        className={`ftp-card ftp-card--all ${!activeTag ? 'is-active' : ''}`}
        onClick={() => onSelect(null)}
        data-track="ftag_filter_clicked"
        data-track-prop-ftag="all"
      >
        <span className="ftp-card__count">{total}</span>
        <span className="ftp-card__name">All findings</span>
      </button>

      {tiles.map((t) => {
        const meta = ftagMeta(t.tag);
        const accent = ACCENT[t.worstSeverity] || 'std';
        return (
          <button
            type="button"
            key={t.tag}
            className={`ftp-card ftp-card--${accent} ${activeTag === t.tag ? 'is-active' : ''}`}
            title={t.tag}
            onClick={() => onSelect(activeTag === t.tag ? null : t.tag)}
            data-track="ftag_filter_clicked"
            data-track-prop-ftag={t.tag}
          >
            <span className={`ftp-card__count ftp-card__count--${accent}`}>{t.count}</span>
            <span className="ftp-card__name">{meta?.title || t.tag}</span>
          </button>
        );
      })}
    </div>
  );
}
