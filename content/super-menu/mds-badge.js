/**
 * mds-badge.js — pure helpers that decide what a Super badge says.
 *
 * These were previously private to content/mds-overlay.js. They're extracted
 * here so the live overlay AND the demo (demo/components/PCCDemoApp.jsx) share
 * ONE implementation — the badge a coder sees and the popover that opens on
 * click can never disagree about "code it" vs "don't code it" again.
 *
 * Everything here is pure: no DOM, no module globals. determineStatus takes the
 * "already dismissed?" answer as an argument rather than reaching into overlay
 * state, so it's safe to call from anywhere.
 */

/**
 * Normalize an answer to a common format for comparison.
 * Converts yes/no to 1/0, dash to '-', needs_review to null (no answer).
 */
export function normalizeAnswer(answer) {
  if (!answer) return null;
  const lower = String(answer).toLowerCase().trim();

  if (lower === 'yes') return '1';
  if (lower === 'no') return '0';
  if (lower === 'dash') return '-';
  if (lower === 'needs_review') return null; // Treat as no answer for comparison

  return lower;
}

/**
 * Format an answer for display (converts 0/1 to No/Yes for readability).
 * @param {string|number} answer - The answer value
 * @param {boolean} isNumeric - If true, display as-is (don't convert 0/1 to No/Yes)
 */
export function formatAnswerForDisplay(answer, isNumeric = false) {
  if (answer === null || answer === undefined) return '?';
  const str = String(answer).trim();

  // For numeric fields (like day counts), display as-is
  if (isNumeric) {
    return str;
  }

  // Convert 0/1 to No/Yes for better readability
  if (str === '0') return 'No';
  if (str === '1') return 'Yes';
  if (str === '-') return '-';

  return str.toUpperCase();
}

/**
 * Section I only: a short, scannable label describing WHAT a diagnosis item
 * needs, so a coder can act without opening the popover. Replaces the blunt
 * "Yes/No/?" badge text on review & mismatch badges with "Diagnosis needed",
 * "Treatment needed", "Query needed", etc.
 *
 * Derived purely from the Section I runner's `status` plus the two validation
 * gates it already returns on every diagnosis item:
 *   - diagnosisPassed    — the chart documents the diagnosis
 *   - activeStatusPassed — active treatment / orders were found
 *
 * Returns null for items where the plain Yes/No is already clear (dont_code) or
 * it isn't a recognized Section I status — letting the caller fall back to the
 * existing answer text.
 *
 * @param {Object} [aiAnswer] - { status, diagnosisPassed, activeStatusPassed }
 * @returns {string|null}
 */
export function sectionIBadgeLabel(aiAnswer = {}) {
  const { status, diagnosisPassed: dx, activeStatusPassed: tx } = aiAnswer || {};

  switch (status) {
    case 'code':
      return 'Code it';

    case 'needs_physician_query':
      // Treatment is documented but the diagnosis isn't — the fix is a physician
      // query, not direct coding.
      return 'Query needed';

    case 'needs_review':
      if (dx === false && tx === true) return 'Diagnosis needed';
      if (dx === true && tx === false) return 'Treatment needed';
      if (dx === false && tx === false) return 'Evidence needed';
      return 'Needs review';

    default:
      // dont_code / error / unknown → caller shows plain Yes/No.
      return null;
  }
}

/**
 * Decide a badge's comparison status from the AI answer and the coded PCC answer.
 *
 * @param {Object} aiAnswer - { status, answer, reviewReason, isNumeric, ... }
 * @param {string|null} pccAnswer - the value currently coded on the page
 * @param {Object} [opts]
 * @param {boolean} [opts.dismissed] - the coder already acted on this item
 * @returns {'dismissed'|'info'|'review'|'match'|'mismatch'}
 */
export function determineStatus(aiAnswer, pccAnswer, opts = {}) {
  // 1. Dismissed — the nurse already acted on this one.
  if (opts.dismissed) {
    return 'dismissed';
  }

  // 2a. Informational needs_review (e.g. "ordered, not administered"): the AI is
  //     EXPLAINING why it isn't coding, not asking for a judgement. Render a calm
  //     info badge — clickable to view evidence/MAR-TAR — instead of a yellow nag.
  if (aiAnswer.reviewReason === 'ordered_not_administered') {
    return 'info';
  }

  // 2b. Carve-out: Section I physician-query / other needs-review items keep their
  //     own "review" state even if the coded value happens to match — sending a
  //     query is a distinct workflow, not a simple agree/disagree.
  if (
    aiAnswer.status === 'needs_physician_query' ||
    aiAnswer.status === 'needs_review' ||
    aiAnswer.answer?.toLowerCase() === 'needs_review'
  ) {
    return 'review';
  }

  // 3. Derive the AI's effective value. Section I encodes it as a status
  //    (code = Yes, dont_code = No); every other section carries it in `answer`.
  let aiValue;
  if (aiAnswer.status === 'dont_code') {
    aiValue = '0'; // No
  } else if (aiAnswer.status === 'code') {
    aiValue = '1'; // Yes
  } else {
    aiValue = normalizeAnswer(aiAnswer.answer);
  }
  const pccValue = normalizeAnswer(pccAnswer);

  // 4. AGREEMENT WINS. If the nurse has already coded a value on the page,
  //    compare to THAT first — regardless of the AI's confidence or any backend
  //    comparison status. Matching her on-screen answer is always green; a real
  //    difference is always red. (Previously a low/medium-confidence item, or a
  //    stale backend `comparisonStatus`, forced yellow even when she'd entered
  //    the identical answer — that's the "yellow even though I agree" bug.)
  if (pccValue) {
    return aiValue === pccValue ? 'match' : 'mismatch';
  }

  // 5. Nothing coded yet → a heads-up, not an error. Yellow ("take a look"),
  //    never red. Nothing is wrong; she simply hasn't filled it in.
  return 'review';
}
