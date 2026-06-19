// demo/tour/tour-script.js

// ── Chapter 1 — ICD-10 coding (medical-diagnosis page) ──
const CHAPTER_1 = [
  {
    id: 'c1-intro',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: null,
    placement: 'center',
    title: 'Meet Jane Doe',
    body: "Her MDS is signed and ready to submit. Watch Super double-check it against her chart — starting with her diagnoses.",
    advance: 'next',
  },
  {
    id: 'c1-cp-header',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-meddiag-th--cp',
    placement: 'bottom',
    title: 'Care-plan coverage at a glance',
    body: 'Super grades every active diagnosis against the care plan: green is fully covered, amber is partial, red has no matching focus or intervention.',
    advance: 'next',
  },
  {
    id: 'c1-cp-shield',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-meddiag-chip--cp',
    placement: 'left',
    title: 'Click a shield to dig in',
    body: 'Each shield opens the care-plan focus and interventions that cover that diagnosis — so a gap is one click from a fix.',
    advance: 'click',
  },
  {
    id: 'c1-q-chip',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-meddiag-chip--q',
    placement: 'left',
    title: 'Query status, per diagnosis',
    body: 'See at a glance which diagnoses have an open clarification query — pending, signed, or overdue — without leaving the chart.',
    advance: 'next',
    before: async () => window.__superDemoTour?.closeOverlay?.(),
  },
  {
    id: 'c1-icd-sidebar',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__sidebar',
    placement: 'right',
    title: 'AI-suggested ICD-10 codes',
    body: 'Super scans the chart and suggests billable ICD-10 codes, grouped by PDPM impact.',
    advance: 'next',
    before: async () => window.__superDemoTour?.openIcd10?.(),
  },
  {
    id: 'c1-icd-evidence',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__evidence-panel',
    placement: 'left',
    title: 'Every code is backed by evidence',
    body: 'Click any suggestion to see the exact chart language that supports it — defensible coding, not guesswork.',
    advance: 'next',
  },
  {
    id: 'c1-icd-estimate',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__estimate-btn',
    placement: 'top',
    title: 'See the PDPM impact before committing',
    body: 'Estimate the reimbursement effect of these codes up front, so you only push what moves the needle.',
    advance: 'next',
  },
];

// ── Chapter 2 — Section I active-diagnosis detection (mds-section-i page) ──
// The first step lives on a different page, so reaching it from Chapter 1
// makes the engine persist state and navigate to mds-section-i.html, where the
// tour re-boots and resumes here.
const CHAPTER_2 = [
  {
    id: 'c2-legend',
    chapter: 2,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'Super checked every diagnosis',
    body: 'Green = Super agrees with the coding. Red = Super found something the coder missed. Yellow = ask the physician.',
    advance: 'next',
  },
  {
    id: 'c2-anemia-badge',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.super-badge[data-mds-item="I0200"]',
    placement: 'bottom',
    title: 'A missed diagnosis, flagged in red',
    body: "Super flagged anemia that wasn't coded. Click the badge to see why.",
    advance: 'click',
  },
  {
    id: 'c2-anemia-evidence',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.cc-pop .sid__step-summary',
    placement: 'left',
    title: 'Backed by the chart',
    body: 'Hgb 9.8, ferritin 12, and ferrous sulfate on the MAR all point to iron-deficiency anemia — a real NTA point worth money that the coding missed.',
    advance: 'next',
  },
  {
    id: 'c2-anemia-agree',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.sid__btn--agree',
    placement: 'top',
    title: 'Resolve it in one click',
    body: 'Agree and Super resolves it — one click.',
    advance: 'click',
    hud: { ntaPoints: 1 },
  },
];

// ── Chapter 3 — Physician query + phone mockup (mds-section-i page) ──
// The UTI item needs a doctor's sign-off. We walk the query flow end-to-end,
// then show what the physician receives on a phone mockup, and finally resolve
// the badge once they "sign" it back.
const CHAPTER_3 = [
  {
    id: 'c3-uti-badge',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.super-badge[data-mds-item="I2300"]',
    placement: 'bottom',
    title: 'This one needs a doctor',
    body: "UTI is supported by the chart, but it needs a physician's sign-off before it can be coded. Click the badge.",
    advance: 'click',
  },
  {
    id: 'c3-query-btn',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.cc-pop .sid__btn--primary',
    placement: 'top',
    title: 'Super already drafted the query',
    body: 'No blank form — Super wrote the clarification note with the evidence attached. Click Query Physician.',
    advance: 'click',
  },
  {
    id: 'c3-query-review',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.dqm__textarea',
    placement: 'left',
    title: 'Review the note',
    body: 'This is the note the physician sees — editable, but ready to go. Continue when you’re happy.',
    advance: 'next',
  },
  {
    id: 'c3-query-next',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.dqm__footer .dqm__btn--primary',
    placement: 'top',
    title: 'On to the physician',
    body: 'Click Next to pick who signs it.',
    advance: 'click',
  },
  {
    id: 'c3-query-pract',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.dqm__pract-list',
    placement: 'left',
    title: 'Pick the attending',
    body: 'Choose the physician — Super attaches all the supporting evidence automatically.',
    advance: 'click',
  },
  {
    id: 'c3-send',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.dqm__footer .dqm__btn--primary',
    placement: 'top',
    title: 'Send it',
    body: 'Send the query — the doctor gets a text instantly. No phone calls, no faxes.',
    advance: 'event',
    event: 'tour:query-sent',
  },
  {
    id: 'c3-phone-incoming',
    chapter: 3,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'What the doctor receives',
    body: "Here's the text (and an email) that lands on the physician's phone — with the evidence one tap away.",
    advance: 'next',
    phone: { state: 'incoming' },
  },
  {
    id: 'c3-phone-typing',
    chapter: 3,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'They review and reply',
    body: 'Because the evidence is right there, they respond in seconds.',
    advance: 'auto',
    autoMs: 1800,
    phone: { state: 'typing' },
  },
  {
    id: 'c3-phone-signed',
    chapter: 3,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'Signed — and it flows back',
    body: 'The diagnosis is confirmed and flows straight back into the MDS. The badge resolves automatically.',
    advance: 'next',
    phone: { state: 'signed' },
    before: async () => {
      window.__superDemoTour?.resolveBadge?.('I2300', 'agree');
      window.dispatchEvent(new CustomEvent('demo:toast', {
        detail: { type: 'success', message: 'UTI confirmed by physician — coded' },
      }));
    },
  },
];

// ── Chapter 4 — MDS Command Center / PDPM impact (mds-section-i page) ──
// Every finding from the earlier chapters rolls up into the PDPM picture. We
// open Super's MDS Command Center, then expand Jane's assessment to surface the
// HIPPS change and the "would change HIPPS" detections that drive revenue.
//
// The Command Center exposes no hook to expand a specific assessment, so the
// HIPPS/detection steps click Jane's active card from `before` (idempotently —
// only if her preview isn't already open) and wait for her HIPPS line to render.
async function _waitFor(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

// Open the Command Center and expand Jane Doe's active (non-completed)
// assessment so the HIPPS line + detections preview is visible.
async function _openJanePreview() {
  window.__superDemoTour?.openOverlay?.('commandCenter');
  await _waitFor(() => document.querySelector('.mds-cc__card'));
  // If Jane's HIPPS line is already showing, don't re-click (that would toggle
  // the card shut).
  const janeOpen = () => {
    const ss = document.querySelector('.mds-cc__ss');
    return ss && /KAQD/.test(ss.textContent);
  };
  if (janeOpen()) return;
  const jane = await _waitFor(() =>
    [...document.querySelectorAll('.mds-cc__card')].find((c) => {
      const n = c.querySelector('.mds-cc__card-name');
      return n && /Doe, Jane/.test(n.textContent) && !/Completed/.test(c.textContent);
    })
  );
  jane?.click();
  await _waitFor(janeOpen);
}

const CHAPTER_4 = [
  {
    id: 'c4-open',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__stats-strip',
    placement: 'bottom',
    title: 'Where it all adds up',
    body: "Open Super's MDS Command Center — every finding rolls up into the PDPM picture for the whole facility.",
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('commandCenter'),
  },
  {
    id: 'c4-hipps',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__ss',
    placement: 'left',
    title: "Jane's HIPPS moves",
    body: 'These catches move Jane from HIPPS KAQD to KBQE — added reimbursable acuity that pencils out to real dollars per day.',
    advance: 'next',
    before: _openJanePreview,
    hud: { dollarsPerDay: 42 },
  },
  {
    id: 'c4-detections',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__ps-items',
    placement: 'left',
    title: 'Each catch is a revenue opportunity',
    body: 'Malnutrition, diabetes with PVD, IV medications — each item is backed by chart evidence. Click any to drill in.',
    advance: 'next',
    before: _openJanePreview,
  },
  {
    id: 'c4-close',
    chapter: 4,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: "That's the loop",
    body: 'From a single missed code to facility-wide reimbursement — Super closes the gap end to end.',
    advance: 'next',
    before: async () => window.__superDemoTour?.closeOverlay?.(),
  },
];

// ── Chapter 5 — Facility features: QM Board / 24-hour Report / Care Plan ──
// We've followed one resident end to end; now we zoom out to the whole
// facility. Each step swaps to a different overlay via its `before` (setOverlay
// replaces the active overlay, so no explicit close is needed between them).
// The final step closes everything so the tour ends with a clean page.
const CHAPTER_5 = [
  {
    id: 'c5-qm-open',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.qmc-hero',
    placement: 'left',
    title: 'Beyond one resident: your whole facility',
    body: 'Super tracks every Quality Measure and your Five-Star rating in real time.',
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('qm'),
  },
  {
    id: 'c5-qm-measure',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.qmf-clearrow',
    placement: 'left',
    title: 'Down to the resident driving it',
    body: "Each measure shows where you stand and what's driving it.",
    advance: 'next',
  },
  {
    id: 'c5-24hr',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.thr__severity-strip',
    placement: 'bottom',
    title: 'The last shift, at a glance',
    body: "The 24-hour report turns the last shift's changes into a clean clinical summary.",
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('24hr'),
  },
  {
    id: 'c5-coverage',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.cpc__score',
    placement: 'left',
    title: 'Nothing falls through the cracks',
    body: 'And care-plan coverage shows which diagnoses still need a care plan.',
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('coverage'),
  },
  {
    id: 'c5-close',
    chapter: 5,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'One resident, or the whole building',
    body: 'From a single missed code to facility-wide quality and reimbursement — Super has the whole picture covered.',
    advance: 'next',
    before: async () => window.__superDemoTour?.closeOverlay?.(),
  },
];

export const STEPS = [
  ...CHAPTER_1,
  ...CHAPTER_2,
  ...CHAPTER_3,
  ...CHAPTER_4,
  ...CHAPTER_5,
];
