import { formatAgo } from '../utils/derive.js';
import { ftagMeta } from '../utils/ftags.js';
import { hasSourceView } from '../utils/source.js';

const RESOLUTION_LABEL = {
  resolved: 'Resolved',
  no_action: 'Dismissed',
  progress_note: 'Progress note',
  auto: 'Auto-cleared',
};

/**
 * HandledList — the Snoozed / Resolved tab bodies. Lighter rows than the open
 * list: status + when, View source, and the reverse action (Unsnooze / Reopen).
 */
export function HandledList({ kind, items, onViewSource, onAction, pending }) {
  if (!items?.length) {
    return (
      <div className="ftp-clean">
        <div className="ftp-clean__title">{kind === 'snoozed' ? 'Nothing snoozed' : 'Nothing resolved recently'}</div>
        <div className="ftp-clean__sub">
          {kind === 'snoozed'
            ? 'Snoozed findings will appear here until their window passes.'
            : 'Findings you resolve — or that auto-clear — show up here.'}
        </div>
      </div>
    );
  }

  return (
    <div className="ftp-hlist">
      {items.map((f) => {
        const meta = ftagMeta(f.ftag);
        const when = kind === 'snoozed'
          ? (f.snoozedUntil ? `snoozed until ${formatAgo(f.snoozedUntil)}` : 'snoozed')
          : `${RESOLUTION_LABEL[f.resolutionType] || 'Resolved'} ${formatAgo(f.resolvedAt || f.raw?.updatedAt)}`;
        return (
          <div className="ftp-hrow" key={f.id}>
            <div className="ftp-hrow__body">
              <div className="ftp-hrow__line1">
                <span className="ftp-hrow__name">{f.patientName}</span>
                <span className="ftp-hrow__tag">{meta?.title || f.ftag}</span>
              </div>
              <div className="ftp-hrow__sub">
                {f.clinicalDetail || f.catalogSubtitle || meta?.subtitle || '—'}
                <span className="ftp-hrow__when">· {when}</span>
              </div>
            </div>
            <div className="ftp-hrow__actions">
              {hasSourceView(f) && (
                <button type="button" className="ftp-iconbtn" data-track="ftag_view_source" data-track-prop-ftag={f.ftag} onClick={() => onViewSource(f)}>
                  View source
                </button>
              )}
              <button
                type="button"
                className="ftp-btn ftp-btn--secondary ftp-btn--sm"
                data-track={kind === 'snoozed' ? 'ftag_unsnooze_clicked' : 'ftag_reopen_clicked'}
                disabled={pending}
                onClick={() => onAction(f)}
              >
                {kind === 'snoozed' ? 'Unsnooze' : 'Reopen'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
