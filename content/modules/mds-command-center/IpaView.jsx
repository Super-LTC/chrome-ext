/**
 * IpaView — IPA / new-quarterly payment opportunities tab in the MDS Command Center.
 *
 * Three tiers (matches the design mockup):
 *   1. Recommended        — net-positive: open an assessment
 *   2. Not recommended    — would hurt reimbursement (net loss or no lever)
 *   3. No change          — already coded at tier (collapsed)
 *
 * Each card makes the lever explicit: IPA (Medicare A) vs Quarterly (Medicaid case-mix).
 * "Review" opens a modal with the full gain / stays-counted / would-drop-off ledger,
 * where every service line says whether it's still being administered or would stop.
 */
import { useState } from 'preact/hooks';
import { postIpaAction } from './hooks/useIpaOpportunities.js';
import { track } from '../../utils/analytics.js';
import { openEvidence } from '../../utils/evidence-helpers.js';

// ── Formatting helpers ──

function formatImpact(impact) {
  if (!impact) return { big: '—', unit: '', positive: false, hasLever: false };
  const d = impact.delta ?? 0;
  const sign = d > 0 ? '+' : '';
  if (impact.deltaUnit === 'usd_per_day') {
    const yr = impact.annualized ? ` · ~$${Math.round(impact.annualized / 1000)}k/yr` : '';
    return { big: `${sign}$${Math.round(d)}`, unit: `/day${yr}`, positive: d > 0, hasLever: true };
  }
  if (impact.deltaUnit === 'cmi') {
    return { big: `${sign}${d.toFixed(2)}`, unit: 'nursing CMI', positive: d > 0, hasLever: true };
  }
  return { big: '$0', unit: 'no lever', positive: false, hasLever: false };
}

// The lever pill — the "is this an IPA or a Quarterly?" signal, made unmissable.
function leverMeta(c) {
  if (c.lever === 'ipa') return { cls: 'ipa-pill--ipa', text: 'IPA · Medicare A' };
  if (c.lever === 'quarterly') return { cls: 'ipa-pill--qtr', text: 'Quarterly · Medicaid' };
  return { cls: 'ipa-pill--review', text: 'Quarterly · confirm state' };
}

function gainSummary(c) {
  return (c.triggers || []).map((t) => t.label).join(' · ');
}

// All evidence across a candidate's triggers, flattened — so the card can show
// a real preview of the underlying proof (not just a count).
function allEvidence(c) {
  const out = [];
  for (const t of c.triggers || []) {
    for (const e of t.evidence || []) out.push(e);
  }
  return out;
}

// ── Evidence helpers ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format an ISO date (YYYY-MM-DD…) as "Jul 6" — parse the parts directly to avoid TZ drift.
function fmtDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[+m[2] - 1]} ${+m[3]}`;
}

const SOURCE_LABELS = {
  order: 'Order',
  'progress-note': 'Progress note',
  progress_note: 'Progress note',
  document: 'Document',
  uda: 'Assessment',
  mar: 'MAR',
  tar: 'TAR',
};

function sourceLabel(t) {
  if (!t) return 'Source';
  return SOURCE_LABELS[t] || (t.charAt(0).toUpperCase() + t.slice(1).replace(/[-_]/g, ' '));
}

// Open the underlying source in the shared in-extension evidence viewer.
function openEvidenceSource(e) {
  if (!e || !e.sourceId || e.linkable === false) return;
  track('ipa_evidence_open', { sourceType: e.sourceType });
  // Orders open the MAR/TAR administration modal. There's no MDS assessment in
  // this facility-level view, so the backend derives the window from the order.
  if (e.sourceType === 'order' && typeof window.showAdministrationModal === 'function') {
    window.showAdministrationModal(e.sourceId);
    return;
  }
  // Everything else — progress notes, documents, UDAs, labs — routes through the
  // shared evidence dispatcher (clinical-note / document / uda viewers, etc.).
  openEvidence({
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    id: e.sourceId,
    evidenceId: e.sourceId,
    quote: e.text,
    quoteText: e.text,
  });
}

function keepsLine(c) {
  const stays = (c.loseItLedger || []).filter((l) => l.stays);
  if (!stays.length) return null;
  return stays.map((l) => l.label).join(', ');
}

/**
 * Soonest capture deadline across the candidate's triggers (v6 backend fields):
 * a trigger whose service has ENDED carries captureWindowClosesAt — the last day a
 * new assessment's lookback can still capture it. Null when everything is active.
 */
function soonestDeadline(c) {
  const dates = (c.triggers || []).map((t) => t.captureWindowClosesAt).filter(Boolean).sort();
  return dates[0] || null;
}

// ── Review modal ──

function ReviewModal({ candidate, onClose, onActed }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const imp = formatImpact(candidate.impact);
  const lever = leverMeta(candidate);
  const isLoss = candidate.tier === 'not_recommended';
  const gains = candidate.triggers || [];
  const keeps = (candidate.loseItLedger || []).filter((l) => l.stays);
  const drops = (candidate.loseItLedger || []).filter((l) => !l.stays);
  const needsVerify = gains.some((t) => t.needsNurseVerify);

  const confirm = async () => {
    setBusy(true);
    track('ipa_review_confirmed', { lever: candidate.lever, tier: candidate.tier });
    await postIpaAction(candidate.id, 'accept');
    setDone(true);
    setBusy(false);
    onActed?.();
  };

  return (
    <div class="ipa-modal-overlay" onClick={onClose}>
      <div class="ipa-modal" onClick={(e) => e.stopPropagation()}>
        <div class={`ipa-modal__head${isLoss ? ' ipa-modal__head--loss' : ''}`}>
          <button class="ipa-modal__x" data-track="ipa_modal_close" onClick={onClose}>×</button>
          <div class="ipa-modal__who">{candidate.patientName || 'Resident'}</div>
          <div class="ipa-modal__sub">
            <span class={`ipa-pill ${lever.cls}`}>{lever.text}</span>
          </div>
        </div>

        <div class="ipa-modal__body">
          <div class={`ipa-netbox${imp.positive ? '' : ' ipa-netbox--flat'}${isLoss ? ' ipa-netbox--loss' : ''}`}>
            <div>
              <div class="ipa-netbox__n">{imp.big}</div>
              <div class="ipa-netbox__u">{imp.unit}</div>
            </div>
            {candidate.impact?.currentHipps && (
              <div class="ipa-netbox__hipps">
                current <b>{candidate.impact.currentHipps}</b>
                <br />→ <b>{candidate.impact.potentialHipps}</b>
              </div>
            )}
          </div>
          {candidate.impact?.leverNote && <div class="ipa-modal__note">{candidate.impact.leverNote}</div>}

          {gains.length > 0 && (
            <div class="ipa-ledger ipa-ledger--gain">
              <h4>You'll gain</h4>
              {gains.map((t) => (
                <div class="ipa-trigger" key={t.mdsItem}>
                  <div class="ipa-trigger__head">
                    <div class="ipa-trigger__main">
                      <span class="ipa-trigger__label">{t.label}</span>
                      {t.needsNurseVerify && <span class="ipa-verify">nurse-verify</span>}
                    </div>
                    <div class="ipa-trigger__meta">
                      {t.mdsItem && <span class="ipa-trigger__code">Code {t.mdsItem}</span>}
                      {t.firstSeen && <span class="ipa-trigger__seen">new since {fmtDate(t.firstSeen)}</span>}
                    </div>
                  </div>
                  {t.captureWindowClosesAt && (
                    <div class="ipa-trigger__ended">
                      ⏳ {t.serviceEndedAt ? `Service ended ${fmtDate(t.serviceEndedAt)} — ` : ''}an assessment with an ARD by <b>{fmtDate(t.captureWindowClosesAt)}</b> can still capture this
                    </div>
                  )}
                  {(t.evidence || []).length > 0 && (
                    <div class="ipa-ev-list">
                      {(t.evidence || []).map((e, i) => {
                        const linkable = e.sourceId && e.linkable !== false;
                        const inner = (
                          <>
                            <span class="ipa-ev__meta">
                              <span class="ipa-ev__type">{sourceLabel(e.sourceType)}</span>
                              {e.date && <span class="ipa-ev__date">{fmtDate(e.date)}</span>}
                              {linkable && <span class="ipa-ev__go">View {'→'}</span>}
                            </span>
                            <span class="ipa-ev__text">{e.text}</span>
                          </>
                        );
                        // Clickable evidence is a button with a clear affordance;
                        // non-linkable evidence renders as plain proof text.
                        return linkable ? (
                          <button
                            class="ipa-ev ipa-ev--link"
                            key={i}
                            type="button"
                            data-track="ipa_evidence_open"
                            onClick={() => openEvidenceSource(e)}
                          >
                            {inner}
                          </button>
                        ) : (
                          <div class="ipa-ev" key={i}>{inner}</div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {keeps.length > 0 && (
            <div class="ipa-ledger ipa-ledger--keep">
              <h4>Stays counted</h4>
              {keeps.map((l) => (
                <div class="ipa-lrow" key={l.mdsItem}>
                  <span class="ipa-lrow__ic">✓</span>
                  <span class="ipa-lrow__txt"><b>{l.label}</b><span class="ipa-admin ipa-admin--on">{l.adminNote}</span></span>
                </div>
              ))}
            </div>
          )}

          {drops.length > 0 && (
            <div class="ipa-ledger ipa-ledger--lose">
              <h4>Would drop off</h4>
              {drops.map((l) => (
                <div class="ipa-lrow" key={l.mdsItem}>
                  <span class="ipa-lrow__ic">✕</span>
                  <span class="ipa-lrow__txt"><b>{l.label}</b><span class="ipa-admin ipa-admin--off">{l.adminNote}</span></span>
                </div>
              ))}
            </div>
          )}

          {needsVerify && (
            <div class="ipa-modal__verify">⚠ Nurse-verify: confirm the service is actually being delivered and documented before coding.</div>
          )}
          {isLoss && (
            <div class="ipa-modal__verify ipa-modal__verify--loss">Opening now would lower the rate — the value that drops off outweighs the gain. Wait until it resolves.</div>
          )}
        </div>

        <div class="ipa-modal__actions">
          {done ? (
            <div class="ipa-modal__done">✓ Marked — now open the assessment in PCC for this resident.</div>
          ) : (
            <>
              <button class="ipa-btn" data-track="ipa_modal_cancel" onClick={onClose}>Cancel</button>
              <button class="ipa-btn ipa-btn--primary" data-track="ipa_modal_confirm" disabled={busy} onClick={confirm}>
                {busy ? 'Saving…' : isLoss ? 'Open anyway' : 'Confirm & open'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card ──

function Card({ candidate, onReview, onAction }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const imp = formatImpact(candidate.impact);
  const lever = leverMeta(candidate);
  const isLoss = candidate.tier === 'not_recommended';
  const keeps = keepsLine(candidate);
  const drops = (candidate.loseItLedger || []).filter((l) => !l.stays);
  const evidence = allEvidence(candidate);
  const topEv = evidence[0];
  const moreEv = evidence.length - 1;

  return (
    <div class={`ipa-card${isLoss ? ' ipa-card--loss' : ''}`}>
      <div class="ipa-card__top">
        <div class="ipa-card__who">{candidate.patientName || 'Resident'}</div>
        <span class={`ipa-pill ${lever.cls}`}>{lever.text}</span>
      </div>

      <div class={`ipa-card__impact${imp.positive ? ' ipa-card__impact--pos' : ''}${isLoss ? ' ipa-card__impact--neg' : ''}`}>
        <span class="ipa-card__big">{imp.big}</span>
        <span class="ipa-card__unit">{imp.unit}</span>
        {candidate.impact?.changed && candidate.impact?.currentHipps && (
          <span class="ipa-card__hipps">{candidate.impact.currentHipps} → {candidate.impact.potentialHipps}</span>
        )}
      </div>

      <div class="ipa-card__gain"><b>New:</b> {gainSummary(candidate)}</div>

      {!isLoss && soonestDeadline(candidate) && (
        <div class="ipa-card__deadline">⏳ Treatment ended — capture window closes {fmtDate(soonestDeadline(candidate))}</div>
      )}

      {topEv && (
        <div class="ipa-card__evidence">
          <span class="ipa-card__ev-tag">{sourceLabel(topEv.sourceType)}{topEv.date ? ` · ${fmtDate(topEv.date)}` : ''}</span>
          <span class="ipa-card__ev-text">{topEv.text}</span>
          {moreEv > 0 && <span class="ipa-card__ev-more">+{moreEv}</span>}
        </div>
      )}

      {isLoss ? (
        <div class="ipa-card__reason">
          {drops.length > 0
            ? `Opening would drop ${drops.map((d) => d.label).join(', ')} — ${drops[0].adminNote}. Net loss vs the gain.`
            : (candidate.impact?.leverNote || 'No reimbursement lever here.')}
        </div>
      ) : (
        keeps && <div class="ipa-card__keeps">✓ Keeps: {keeps} (still administered)</div>
      )}

      <div class="ipa-card__actions">
        {!isLoss && (
          <button class="ipa-btn ipa-btn--primary" data-track="ipa_review_open" onClick={() => onReview(candidate)}>Review &amp; open</button>
        )}
        {isLoss && (
          <button class="ipa-btn" data-track="ipa_see_why" onClick={() => onReview(candidate)}>See why</button>
        )}
        <button class="ipa-btn ipa-btn--ghost" data-track="ipa_dismiss" onClick={() => onAction(candidate.id, 'dismiss')}>Dismiss</button>
        <div class="ipa-kebab-wrap">
          <button class="ipa-kebab" data-track="ipa_menu_open" onClick={() => setMenuOpen((v) => !v)}>⋯</button>
          {menuOpen && (
            <div class="ipa-menu">
              <button data-track="ipa_snooze" onClick={() => { setMenuOpen(false); onAction(candidate.id, 'snooze'); }}>Snooze 7 days</button>
              <div class="ipa-menu__hint">Dismiss hides it 90 days. Either way it returns on its own if the picture changes.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root view ──

export function IpaView({ candidates, counts, loading, error, onRefetch }) {
  const [reviewing, setReviewing] = useState(null);
  const [noChangeOpen, setNoChangeOpen] = useState(false);

  const act = async (id, action) => {
    await postIpaAction(id, action);
    track('ipa_card_action', { action });
    onRefetch?.();
  };

  if (loading) return <div class="ipa-empty">Loading opportunities…</div>;
  if (error) return <div class="ipa-empty">Couldn't load — <button class="ipa-link" data-track="ipa_retry" onClick={onRefetch}>retry</button></div>;

  const recommended = candidates.filter((c) => c.tier === 'recommended');
  const notRec = candidates.filter((c) => c.tier === 'not_recommended');
  const noChange = candidates.filter((c) => c.tier === 'no_change');

  if (!candidates.length) {
    return <div class="ipa-empty">No IPA or new-quarterly opportunities right now. Checked daily.</div>;
  }

  return (
    <div class="ipa-view">
      <div class="ipa-tallies">
        <div class="ipa-tally ipa-tally--good"><b>{recommended.length}</b><span>worth opening</span></div>
        <div class="ipa-tally ipa-tally--warn"><b>{notRec.length}</b><span>not recommended</span></div>
        <div class="ipa-tally"><b>{noChange.length}</b><span>no change</span></div>
      </div>

      {recommended.length > 0 && (
        <>
          <div class="ipa-section-label">Recommended — open an assessment</div>
          {recommended.map((c) => <Card key={c.id} candidate={c} onReview={setReviewing} onAction={act} />)}
        </>
      )}

      {notRec.length > 0 && (
        <>
          <div class="ipa-section-label">Not recommended — would hurt reimbursement</div>
          {notRec.map((c) => <Card key={c.id} candidate={c} onReview={setReviewing} onAction={act} />)}
        </>
      )}

      {noChange.length > 0 && (
        <div class="ipa-nochange">
          <button class="ipa-nochange__toggle" data-track="ipa_nochange_toggle" onClick={() => setNoChangeOpen((v) => !v)}>
            {noChangeOpen ? '▾' : '▸'} No change — {noChange.length} already coded at their current tier
          </button>
          {noChangeOpen && noChange.map((c) => <Card key={c.id} candidate={c} onReview={setReviewing} onAction={act} />)}
        </div>
      )}

      {reviewing && (
        <ReviewModal
          candidate={reviewing}
          onClose={() => setReviewing(null)}
          onActed={() => { setReviewing(null); onRefetch?.(); }}
        />
      )}
    </div>
  );
}
