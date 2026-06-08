import { VitalsViewer } from './VitalsViewer.jsx';
import { MarViewer } from './MarViewer.jsx';
import { NotesViewer } from './NotesViewer.jsx';
import { OrderViewer } from './OrderViewer.jsx';
import { DocumentViewer } from './DocumentViewer.jsx';
import { evidenceRows } from '../../utils/derive.js';
import { effectiveSourceKind } from '../../utils/source.js';

/**
 * SourceView — dispatches on the (effective) FtagSource `kind` to the right
 * clinical view. The union is: mar | vitals | order | notes | document | none.
 */
export function SourceView({ finding, facilityName, orgSlug }) {
  const kind = effectiveSourceKind(finding);

  switch (kind) {
    case 'vitals':
      return <VitalsViewer source={finding.source} facilityName={facilityName} orgSlug={orgSlug} />;
    case 'mar':
      return <MarViewer finding={finding} facilityName={facilityName} orgSlug={orgSlug} />;
    case 'notes':
      return <NotesViewer source={finding.source} finding={finding} />;
    case 'order':
      return <OrderViewer source={finding.source} finding={finding} />;
    case 'document':
      return <DocumentViewer source={finding.source} facilityName={facilityName} orgSlug={orgSlug} />;
    case 'none':
    default:
      return <NoneView finding={finding} />;
  }
}

/** F883 + any finding missing the IDs needed to open a view — show text only. */
function NoneView({ finding }) {
  const ev = evidenceRows(finding?.evidence);
  return (
    <div className="ftp-none">
      {finding?.rationale
        ? <p className="ftp-none__rationale">{finding.rationale}</p>
        : <p className="ftp-none__rationale ftp-none__rationale--muted">No source view for this finding — review the evidence below.</p>}
      {ev.length > 0 && (
        <dl className="ftp-none__grid">
          {ev.map((e, i) => (
            <div className="ftp-none__pair" key={i}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
