import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseSectionHtml, parseSectionListing } from '../mds-section-parser.js';

// vitest cwd is the repo root; read fixtures by repo-relative path (jsdom sets
// import.meta.url to a non-file URL, so new URL(...) can't be used here).
const SAMPLE = readFileSync(
  'content/modules/super-verify/lib/__tests__/fixtures/section-sample.html',
  'utf8',
);

describe('parseSectionHtml — real PCC value shapes', () => {
  const { answers } = parseSectionHtml(SAMPLE);

  it('extracts a locked radio value from the selected anchor data-value', () => {
    expect(answers.I0020).toEqual({ value: '12', isLocked: true });
  });

  it('extracts a locked yes/no value from the selected anchor (No → "0")', () => {
    expect(answers.I0100).toEqual({ value: '0', isLocked: true });
  });

  it('extracts a locked free value from readonlyquestionvalue, collapsing whitespace', () => {
    expect(answers.I0020B.isLocked).toBe(true);
    expect(answers.I0020B.value).toBe(
      'J44.9 CHRONIC OBSTRUCTIVE PULMONARY DISEASE, UNSPECIFIED',
    );
  });

  it('extracts a locked numeric readonly value', () => {
    expect(answers.N0300).toEqual({ value: '0', isLocked: true });
  });

  it('extracts an editable (in-progress) radio value, isLocked false', () => {
    expect(answers.GG0130A1).toEqual({ value: '04', isLocked: false });
  });

  it('extracts an editable text/number input value, isLocked false', () => {
    expect(answers.GG0130B1).toEqual({ value: '04', isLocked: false });
  });

  it('coerces a blank editable input to empty string', () => {
    expect(answers.C0700).toEqual({ value: '', isLocked: false });
  });

  it('keeps ack_ acknowledgement keys verbatim', () => {
    expect(answers.ack_I0020).toEqual({ value: '', isLocked: false });
  });

  it('keeps underscore-composite keys verbatim', () => {
    expect(answers.A_SHORTA).toEqual({ value: '1', isLocked: false });
  });

  it('ignores elements whose ids do not look like MDS items', () => {
    expect(answers.saveBtn).toBeUndefined();
    expect(answers.facSearchKeyword).toBeUndefined();
    expect(answers.refreshMDSDataButton).toBeUndefined();
  });
});

describe('parseSectionHtml — input handling', () => {
  it('accepts a Document as well as an HTML string', () => {
    const doc = new DOMParser().parseFromString(SAMPLE, 'text/html');
    expect(parseSectionHtml(doc).answers.I0020).toEqual({ value: '12', isLocked: true });
  });

  it('falls back to the nobr leading code when the selected anchor lacks data-value', () => {
    const html = `<div class="question" id="J1800_wrapper" data-questiontype="rad">
      <ul class="responses">
        <li><a class="selected"><nobr>1. Yes</nobr></a></li>
      </ul></div>`;
    expect(parseSectionHtml(html).answers.J1800.value).toBe('1');
  });

  it('returns an empty answers map for non-MDS markup', () => {
    expect(parseSectionHtml('<div><span id="saveBtn">hi</span></div>').answers).toEqual({});
  });
});

describe('parseSectionHtml — against a real saved PCC section page', () => {
  // demo/ lives at repo root (outside the check-tracking scan); vitest cwd is
  // the repo root, so a plain relative read works.
  const realI = readFileSync('demo/mds-section-i.html', 'utf8');
  const { answers } = parseSectionHtml(realI);

  it('pulls a non-trivial number of real items off the page', () => {
    expect(Object.keys(answers).length).toBeGreaterThan(20);
  });

  it('reads the locked primary-condition radio (I0020 = 12)', () => {
    expect(answers.I0020).toEqual({ value: '12', isLocked: true });
  });

  it('reads a locked diagnosis popup value (I0020B starts with the ICD code)', () => {
    expect(answers.I0020B.isLocked).toBe(true);
    expect(answers.I0020B.value.startsWith('J44.9')).toBe(true);
  });
});

describe('parseSectionListing', () => {
  // Markup mirrors real PCC: code in <h2>, name in .section_label, human
  // status in the title parenthetical, notapplicable encoded in the class.
  it('reads code from <h2>, status from the title, and flags notapplicable as disabled', () => {
    const html = `<div id="mdssectionlist">
      <div class="section_box complete" onclick="location.href='section.xhtml?ESOLassessid=1&sectioncode=A';" title="Identification Information (Signed)">
        <div class="section_label">Identification Information</div><h2>A</h2><div class="section_status">Complete</div>
      </div>
      <div class="section_box notapplicable" title="Functional Status (Not Applicable)">
        <div class="section_label">Functional Status</div><h2>GG</h2><div class="section_status">Remaining: 0</div>
      </div>
    </div>`;
    expect(parseSectionListing(html)).toEqual([
      { code: 'A', status: 'Signed', disabled: false },
      { code: 'GG', status: 'Not Applicable', disabled: true },
    ]);
  });

  it('flags a box with the disabled class even when the title is absent', () => {
    const html = `<div id="mdssectionlist">
      <div class="section_box disabled"><div class="section_label">Correction Request</div><h2>X</h2><div class="section_status">Complete</div></div>
    </div>`;
    expect(parseSectionListing(html)).toEqual([
      { code: 'X', status: 'Complete', disabled: true },
    ]);
  });

  it('falls back to the onclick sectioncode when <h2> is missing, and accepts a Document', () => {
    const html = `<div id="mdssectionlist">
      <div class="section_box complete" onclick="location.href='section.xhtml?ESOLassessid=1&sectioncode=C';" title="Cognitive Patterns (In Progress)">
        <div class="section_label">Cognitive Patterns</div><div class="section_status">Remaining: 3</div>
      </div>
    </div>`;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(parseSectionListing(doc)).toEqual([
      { code: 'C', status: 'In Progress', disabled: false },
    ]);
  });
});

describe('parseSectionListing — against a real saved listing page', () => {
  const summary = readFileSync('demo/mds-summary.html', 'utf8');
  const sections = parseSectionListing(summary);

  it('finds the full section list with valid codes', () => {
    expect(sections.length).toBeGreaterThan(15);
    for (const s of sections) expect(s.code).toMatch(/^[A-Z]+[0-9]*$/);
  });

  it('marks Identification (A) enabled and includes disabled (Not Applicable) sections', () => {
    const a = sections.find((s) => s.code === 'A');
    expect(a).toBeDefined();
    expect(a.disabled).toBe(false);
    expect(sections.some((s) => s.disabled)).toBe(true);
    expect(sections.some((s) => !s.disabled)).toBe(true);
  });
});
