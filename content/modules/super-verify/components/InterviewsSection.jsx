import { interviewCells } from '../lib/verify-derive.js';
import { openItemInPcc } from '../lib/view-item.js';

// Which MDS item to deep-link for each missing interview.
const ITEM_FOR = { bims: 'C0500', phq9: 'D0300', gg: 'GG0130', pain: 'J0300' };
const TONE_MARK = { ok: '✓', miss: '!', na: '–', pending: '·' };

export function InterviewsSection({ compliance, assessId, assessmentType }) {
  if (!compliance?.checks) return null;
  const cells = interviewCells(compliance);
  const missing = cells.filter((c) => c.tone === 'miss');

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
            {cells.map((c) => (
              <div key={c.key} className={`sv-uda sv-uda--${c.tone}`}>
                <span className="sv-uda__s">{TONE_MARK[c.tone]}</span>
                <div>
                  <div className="sv-uda__nm">{c.label}</div>
                  <div className="sv-uda__sub">{c.message || (c.tone === 'ok' ? 'complete' : c.tone === 'na' ? 'not applicable' : c.tone === 'miss' ? 'missing' : '—')}</div>
                </div>
              </div>
            ))}
          </div>

          {missing.map((c) => (
            <div key={c.key} className="sv-uda-action">
              <div className="sv-divide" />
              <div className="sv-arow">
                <div className="sv-arow__ic sv-ic--warn">!</div>
                <div className="sv-arow__main">
                  <div className="sv-arow__t">{c.label} interview not done</div>
                  <div className="sv-arow__d">Required per the CMS item set. Lock without it and the assessment is incomplete.</div>
                </div>
              </div>
              <div className="sv-acts">
                {/* NO_TRACK — opens the interview's MDS item in PCC */}
                <button className="sv-btn sv-btn--pri" onClick={() => openItemInPcc(assessId, ITEM_FOR[c.key])}>View {ITEM_FOR[c.key]}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
