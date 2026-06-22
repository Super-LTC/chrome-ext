// Medicare A certification — gated on a non-null medACert (skilled stays only).
// Action wiring (Send for signature) awaits the cert signature-request endpoint;
// for now this surfaces the recert status + deep-links the cert in PCC.

const CERT_TYPE_LABEL = {
  initial: 'Initial certification',
  day_14_recert: 'Recertification (day 14)',
  day_30_recert: 'Recertification (day 30)',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CertSection({ medACert, onToast }) {
  if (!medACert) return null;
  const cert = medACert.nextCert;

  return (
    <>
      <div className="sv-sec" data-anchor="cert">
        <h3>Medicare A certification</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">skilled stay · day {medACert.currentMedicareDay}</span>
      </div>
      <div className="sv-wrap">
        {!cert ? (
          <div className="sv-empty"><span className="sv-empty__c">✓</span> Certifications signed and up to date.</div>
        ) : (
          <div className="sv-card">
            <div className="sv-arow">
              <div className="sv-arow__ic sv-ic--warn">★</div>
              <div className="sv-arow__main">
                <div className="sv-arow__t">
                  {CERT_TYPE_LABEL[cert.type] || 'Certification'} due
                  <span className="sv-b sv-b--warn">Day {medACert.currentMedicareDay} · {cert.status}</span>
                </div>
                <div className="sv-arow__d">
                  Part A skilled stay. Cert <b>due {fmtDate(cert.dueDate)}</b> is{' '}
                  <b>{cert.status === 'signed' ? 'signed' : 'not yet signed'}</b> by the physician.
                </div>
              </div>
            </div>
            <div className="sv-acts">
              {/* NO_TRACK — cert signature-request endpoint not yet wired into verify */}
              <button className="sv-btn sv-btn--pri" onClick={() => onToast('Cert signature request — coming soon')}>Send for signature</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
