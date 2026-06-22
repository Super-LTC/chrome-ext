import { interviewCells } from '../lib/verify-derive.js';
import { openItemInPcc, openUdaInPcc } from '../lib/view-item.js';

// Which MDS item to deep-link for each missing interview.
const ITEM_FOR = { bims: 'C0500', phq9: 'D0300', gg: 'GG0130', pain: 'J0300' };
const TONE_MARK = { ok: '✓', miss: '!', na: '–', pending: '·' };

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function InterviewsSection({ compliance, linkedUdas, assessId, assessmentType }) {
  if (!compliance?.checks) return null;
  const cells = interviewCells(compliance);

  const udaByKey = {};
  (linkedUdas || []).forEach((u) => {
    if (u?.interview) udaByKey[norm(u.interview)] = u;
  });

  return (
    <>
      <div className="sv-sec" data-anchor="uda">
        <h3>Interviews &amp; UDAs</h3>
        <span className="sv-sec__ln" />
        <span className="sv-sec__ct">{assessmentType ? `required for ${assessmentType}` : 'required'}</span>
      </div>
      <div className="sv-wrap">
        <div className="sv-card">
          <div className="sv-udagrid">
            {cells.map((c) => {
              const uda = udaByKey[c.key.toUpperCase()];
              // A linked UDA means it's on file — override a compliance "miss".
              const tone = c.tone === 'ok' || uda ? 'ok' : c.tone;
              const onClick = uda
                ? () => openUdaInPcc(uda.externalAssessmentId)
                : tone === 'miss'
                ? () => openItemInPcc(assessId, ITEM_FOR[c.key])
                : null;
              const sub = uda
                ? `on file${uda.lockedDate ? ` · ${fmtDate(uda.lockedDate)}` : ''}`
                : tone === 'ok' ? 'complete' : tone === 'na' ? 'not applicable' : tone === 'miss' ? 'not done' : '—';
              return (
                <div
                  key={c.key}
                  className={`sv-uda sv-uda--${tone}${onClick ? ' is-clickable' : ''}`}
                  role={onClick ? 'button' : undefined}
                  tabIndex={onClick ? 0 : undefined}
                  onClick={onClick || undefined}
                  title={onClick ? (uda ? 'View UDA in PointClickCare' : `Open ${ITEM_FOR[c.key]} in PointClickCare`) : undefined}
                >
                  <span className="sv-uda__s">{TONE_MARK[tone]}</span>
                  <div>
                    <div className="sv-uda__nm">{c.label}{onClick ? <span className="sv-uda__link"> ↗</span> : null}</div>
                    <div className="sv-uda__sub">{sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
