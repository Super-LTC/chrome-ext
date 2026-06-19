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

export const STEPS = [
  ...CHAPTER_1,
  ...CHAPTER_2,
];
