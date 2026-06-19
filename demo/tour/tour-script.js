// demo/tour/tour-script.js
//
// Guided tour steps. Kept deliberately tight (~15 steps) — a prospect should
// feel the product, not slog through it. Each chapter is a few high-signal
// beats. Step shape consumed by tour-runner.jsx:
//   { id, chapter, page, selector, title, body, placement, before, advance,
//     event, autoMs, hud, phone }

// ── Chapter 1 — Smarter diagnosis coding (medical-diagnosis page) ──
const CHAPTER_1 = [
  {
    id: 'c1-intro',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: null,
    placement: 'center',
    title: 'Meet Jane Doe',
    body: "Her MDS is signed and ready to submit. Watch Super double-check it against her chart in about two minutes — starting with her diagnoses.",
    advance: 'next',
  },
  {
    id: 'c1-coverage',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-meddiag-th--cp',
    placement: 'bottom',
    title: 'Coverage & queries, at a glance',
    body: 'Super grades every diagnosis against the care plan (green = covered, amber = partial, red = gap) and tracks open physician queries — right inside the chart.',
    advance: 'next',
  },
  {
    id: 'c1-icd',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__sidebar',
    placement: 'right',
    title: 'AI-suggested ICD-10 codes',
    body: 'Super scans the chart and suggests billable ICD-10 codes grouped by PDPM impact — each backed by the exact chart language, with the reimbursement effect estimated before you commit.',
    advance: 'next',
    before: async () => window.__superDemoTour?.openIcd10?.(),
  },
];

// ── Chapter 2 — Catch what the coder missed (mds-section-i page) ──
// First step is on a different page; reaching it from Chapter 1 makes the
// engine persist state and navigate to mds-section-i.html, where the tour
// re-boots and resumes here.
const CHAPTER_2 = [
  {
    id: 'c2-legend',
    chapter: 2,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'Super checked every diagnosis',
    body: 'On the MDS itself, Super badges each item: green = it agrees with the coding, red = it found something missed, yellow = ask the physician.',
    advance: 'next',
  },
  {
    id: 'c2-anemia-badge',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.super-badge[data-mds-item="I0200"]',
    placement: 'bottom',
    title: 'A missed diagnosis, flagged in red',
    body: "Super flagged anemia that wasn't coded. Click the badge to see the evidence.",
    advance: 'click',
  },
  {
    id: 'c2-anemia-agree',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.sid__btn--agree',
    placement: 'top',
    title: 'Backed by the chart — resolve in one click',
    body: 'Hgb 9.8, ferritin 12, and ferrous sulfate on the MAR all point to iron-deficiency anemia — a real NTA point the coding missed. Click Agree and Super resolves it.',
    advance: 'click',
    hud: { ntaPoints: 1 },
  },
];

// ── Chapter 3 — Close the loop with the physician (mds-section-i page) ──
const CHAPTER_3 = [
  {
    id: 'c3-uti-badge',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.super-badge[data-mds-item="I2300"]',
    placement: 'bottom',
    title: 'This one needs a doctor',
    body: "UTI is supported by the chart, but it needs a physician's sign-off before coding. Click the badge.",
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
    id: 'c3-send',
    chapter: 3,
    page: 'mds-section-i',
    selector: '.dqm__footer',
    placement: 'top',
    title: 'Pick the physician and send',
    body: 'Choose the attending and hit send — the doctor gets a text (and email) instantly. No phone calls, no faxes.',
    advance: 'event',
    event: 'tour:query-sent',
  },
  {
    id: 'c3-phone-incoming',
    chapter: 3,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'What the physician receives',
    body: "Here's the text that lands on their phone — with the supporting evidence one tap away.",
    advance: 'next',
    phone: { state: 'incoming' },
    // Close the lingering evidence popover so the phone has the stage.
    before: async () => window.__superDemoTour?.closeOverlay?.(),
  },
  {
    id: 'c3-phone-signed',
    chapter: 3,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'Signed — and it flows back',
    body: 'They confirm in seconds, and the diagnosis flows straight back into the MDS. The badge resolves automatically.',
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

// ── Chapter 4 — See the revenue impact (mds-section-i page) ──
// Open the MDS Command Center and expand Jane's assessment so the HIPPS change
// + detections preview is visible. The Command Center exposes no hook to expand
// a specific assessment, so we click her active card from `before` (idempotently)
// and wait for her HIPPS line to render.
async function _waitFor(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

async function _openJanePreview() {
  window.__superDemoTour?.openOverlay?.('commandCenter');
  await _waitFor(() => document.querySelector('.mds-cc__card'));
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
    id: 'c4-hipps',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__ss',
    placement: 'bottom',
    title: "It rolls up to real dollars",
    body: "In Super's Command Center, these catches move Jane from HIPPS KAQD to KBQE — added reimbursable acuity that pencils out to real dollars per day.",
    advance: 'next',
    before: _openJanePreview,
    hud: { dollarsPerDay: 42 },
  },
  {
    id: 'c4-detections',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__ps-items',
    placement: 'bottom',
    title: 'Every catch is backed by evidence',
    body: 'Malnutrition, diabetes with PVD, IV medications — each finding driving the change links straight to the chart language behind it.',
    advance: 'next',
    before: _openJanePreview,
  },
];

// ── Chapter 5 — Your whole facility (mds-section-i page) ──
// Each step swaps to a different overlay via `before` (setOverlay replaces the
// active overlay, so no explicit close is needed between them). finishTour
// closes the last overlay so the end card lands on a clean page.
const CHAPTER_5 = [
  {
    id: 'c5-qm',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.qmc-hero',
    placement: 'bottom',
    title: 'Beyond one resident',
    body: 'Zoom out: Super tracks every Quality Measure and predicts your Five-Star rating in real time.',
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('qm'),
  },
  {
    id: 'c5-24hr',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.thr__severity-strip',
    placement: 'bottom',
    title: 'Every shift, summarized',
    body: "And the 24-hour report turns each shift's changes into a clean clinical summary — so nothing gets lost in handoff.",
    advance: 'next',
    before: async () => window.__superDemoTour?.openOverlay?.('24hr'),
  },
];

export const STEPS = [
  ...CHAPTER_1,
  ...CHAPTER_2,
  ...CHAPTER_3,
  ...CHAPTER_4,
  ...CHAPTER_5,
];

// Chapter title-card copy, keyed by chapter number. Shown as a brief branded
// interstitial whenever the tour enters a new chapter.
export const CHAPTERS = {
  1: 'Smarter diagnosis coding',
  2: 'Catch what the coder missed',
  3: 'Close the loop with the physician',
  4: 'See the revenue impact',
  5: 'Your whole facility',
};
