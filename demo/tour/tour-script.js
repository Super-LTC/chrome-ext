// demo/tour/tour-script.js
//
// Guided tour steps — a hands-on, click-through walkthrough. The prospect
// actually clicks the real controls (care-plan shield, AI Code Patient, a code,
// Add, Push, the badges, the FAB actions) so they feel the product. Step shape
// consumed by tour-runner.jsx:
//   { id, chapter, page, selector, title, body, placement, before, advance,
//     event, autoMs, hud, phone }

// Small shared helpers (function declarations are hoisted, so they're usable in
// any step's `before`, regardless of where they're defined in this file).
async function _waitFor(fn, ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const r = fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 120));
  }
  return null;
}

function _closeMeddiagPanels() {
  document.querySelectorAll('.super-meddiag-cp-backdrop, .super-meddiag-q-backdrop')
    .forEach((el) => el.click());
}

// ── Chapter 1 — Smarter diagnosis coding (medical-diagnosis page) ──
const CHAPTER_1 = [
  {
    id: 'c1-intro',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: null,
    placement: 'center',
    title: 'Meet Jane Doe',
    body: "Her MDS is signed and ready to submit. Let's watch Super double-check it against her chart — you drive, just click where it points.",
    advance: 'next',
  },
  {
    id: 'c1-cp-shield',
    chapter: 1,
    page: 'medical-diagnosis',
    // Target the one partially-covered diagnosis (amber) so the "gap to fix"
    // detail lands; green/red shields work identically.
    selector: '.super-meddiag-chip--cp-partial',
    placement: 'left',
    title: 'Care-plan coverage on every diagnosis',
    body: 'Super grades each diagnosis against the care plan — green covered, amber partial, red gap. Click an amber shield to see what is missing.',
    advance: 'click',
  },
  {
    id: 'c1-cp-panel',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-meddiag-cp-panel',
    placement: 'left',
    title: 'The exact gap, spelled out',
    body: "Sleep apnea has a care-plan focus (“Sleep r/t OSA”) but no CPAP-tolerance assessment linked. Super names the precise missing intervention — a survey risk you'd otherwise have to dig for.",
    advance: 'next',
  },
  {
    id: 'c1-aicode-btn',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.super-smart-code-btn',
    placement: 'bottom',
    title: 'Let Super suggest the codes',
    body: 'Now click "AI Code Patient" — Super reads the whole chart and proposes the billable ICD-10 codes.',
    advance: 'click',
    before: async () => { _closeMeddiagPanels(); },
  },
  {
    id: 'c1-icd-code',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-sb__row',
    placement: 'right',
    title: 'Codes ranked by PDPM impact',
    body: 'Super ranks the suggestions by what moves reimbursement. Click a code to see its evidence.',
    advance: 'click',
  },
  {
    id: 'c1-icd-evidence',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__evidence-panel',
    placement: 'left',
    title: 'Every code is backed by evidence',
    body: 'Super pulls the exact chart language behind the code, highlighted in the source — defensible coding, not guesswork.',
    advance: 'next',
  },
  {
    id: 'c1-icd-add',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-evidence-panel__approve',
    placement: 'left',
    title: 'Stage the code',
    body: 'Happy with it? Click Add to stage the code for PCC.',
    advance: 'click',
  },
  {
    id: 'c1-icd-push',
    chapter: 1,
    page: 'medical-diagnosis',
    selector: '.icd10-viewer__push-btn',
    placement: 'bottom',
    title: 'Push it straight into PCC',
    body: 'One click writes the staged codes back to PointClickCare — no retyping, no copy-paste.',
    advance: 'click',
  },
];

// ── Chapter 2 — Catch what the coder missed (mds-section-i page) ──
// First step is on a different page; reaching it from Chapter 1 makes the engine
// persist state and navigate to mds-section-i.html, where the tour resumes here.
const CHAPTER_2 = [
  {
    id: 'c2-legend',
    chapter: 2,
    page: 'mds-section-i',
    selector: null,
    placement: 'center',
    title: 'Super checked every diagnosis',
    body: 'On the MDS itself, Super badges each item: green = it agrees, red = it found something missed, yellow = ask the physician.',
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
    selector: '.cc-pop .sid__ev-card--clickable',
    placement: 'left',
    title: 'Super shows its work',
    body: 'Hgb 9.8, ferritin 12, ferrous sulfate on the MAR — the evidence is right here. Click a source to open it.',
    advance: 'click',
  },
  {
    id: 'c2-anemia-source',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.cc-pop__viewer',
    placement: 'left',
    title: 'The source, right where you are',
    body: 'No chart-digging — the actual MAR opens inline, showing ferrous sulfate given three times a day. Proof in one click.',
    advance: 'next',
  },
  {
    id: 'c2-anemia-agree',
    chapter: 2,
    page: 'mds-section-i',
    selector: '.sid__btn--agree',
    placement: 'top',
    title: 'Resolve it in one click',
    body: 'Convinced? Click Agree and Super codes the anemia — a real NTA point recovered.',
    advance: 'click',
    hud: { ntaPoints: 1 },
    before: async () => {
      const back = document.querySelector('.cc-pop__back-btn');
      if (back) {
        back.click();
        await _waitFor(() => document.querySelector('.sid__btn--agree'));
      }
    },
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
// Open the MDS Command Center via the real FAB, then expand Jane's assessment so
// the HIPPS change + detections preview is visible. The Command Center exposes
// no hook to expand a specific assessment, so we click her active card from
// `before` (idempotently) and wait for her HIPPS line to render.
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
    id: 'c4-fab',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.super-bubble__main',
    placement: 'left',
    title: 'Everything rolls up in Super',
    body: "That's one resident's coding cleaned up. Click the Super button to see what it means for the numbers.",
    advance: 'click',
  },
  {
    id: 'c4-mds-action',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.super-dial__action--mds',
    placement: 'left',
    title: 'Open the MDS Command Center',
    body: 'Click the MDS Command Center — your facility-wide view of every assessment in flight.',
    advance: 'click',
  },
  {
    id: 'c4-hipps',
    chapter: 4,
    page: 'mds-section-i',
    selector: '.mds-cc__ss',
    placement: 'bottom',
    title: 'It rolls up to real dollars',
    body: "Jane's catches move her from HIPPS KAQD to KBQE — added reimbursable acuity that pencils out to real dollars per day.",
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
const CHAPTER_5 = [
  {
    id: 'c5-fab',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.super-bubble__main',
    placement: 'left',
    title: 'Zoom out to the whole building',
    body: 'Super is more than one resident. Click the Super button again.',
    advance: 'click',
    before: async () => window.__superDemoTour?.closeOverlay?.(),
  },
  {
    id: 'c5-qm-action',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.super-dial__action--qm',
    placement: 'left',
    title: 'Open the QM Board',
    body: 'Click the QM Board — every Quality Measure across the facility, in one place.',
    advance: 'click',
  },
  {
    id: 'c5-qm',
    chapter: 5,
    page: 'mds-section-i',
    selector: '.qmc-hero',
    placement: 'bottom',
    title: 'Five-Star, predicted in real time',
    body: 'Super tracks every measure and forecasts your Five-Star rating — so you fix problems before they cost you.',
    advance: 'next',
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
