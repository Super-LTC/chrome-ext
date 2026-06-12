import { describe, it, expect } from 'vitest';
import {
  scrapeAssessmentAnswers,
  EmptyScrapeError,
  SessionExpiredError,
} from '../mds-scraper.js';

// Build a section-listing Document with the given sections, mirroring the real
// PCC markup (code in <h2>, status in the title parenthetical, notapplicable
// encoded in the class). sections: [{ code, status, disabled? }]
function listingDoc(sections) {
  const boxes = sections
    .map(
      (s) =>
        `<div class="section_box ${s.disabled ? 'notapplicable' : 'complete'}" title="Section ${s.code} (${s.status})">
           <div class="section_label">Section ${s.code}</div><h2>${s.code}</h2>
         </div>`,
    )
    .join('');
  const html = `<div id="mdssectionlist">${boxes}</div>`;
  return new DOMParser().parseFromString(html, 'text/html');
}

// Minimal section HTML that yields one locked item per section.
function itemHtml(itemId, value) {
  return `<div class="question" id="${itemId}_wrapper" data-questiontype="rad">
    <div class="locked_response"><ul class="responses">
      <li><a data-value="${value}" class="selected"><nobr>${value}</nobr></a></li>
    </ul></div></div>`;
}

describe('scrapeAssessmentAnswers', () => {
  it('discovers sections from the doc, skips disabled, fetches the right URLs', async () => {
    const doc = listingDoc([
      { code: 'A', status: 'Signed' },
      { code: 'B', status: 'Not Applicable' }, // disabled → skipped
      { code: 'C', status: 'Unsigned' },
    ]);
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const code = new URL(url, 'https://x').searchParams.get('sectioncode');
      return itemHtml(`${code}0100`, '1');
    };

    const blob = await scrapeAssessmentAnswers({ assessId: '6189558', fetchImpl, doc });

    expect(calls.sort()).toEqual([
      '/clinical/mds3/section.xhtml?ESOLassessid=6189558&sectioncode=A',
      '/clinical/mds3/section.xhtml?ESOLassessid=6189558&sectioncode=C',
    ]);
    expect(blob.answers.A0100).toEqual({ value: '1', isLocked: true });
    expect(blob.answers.C0100).toEqual({ value: '1', isLocked: true });
    expect(blob.answers.B0100).toBeUndefined();
  });

  it('builds sectionStatuses keyed by section letter', async () => {
    const doc = listingDoc([
      { code: 'A', status: 'Signed' },
      { code: 'GG', status: 'In Progress' },
    ]);
    const fetchImpl = async (url) => {
      const code = new URL(url, 'https://x').searchParams.get('sectioncode');
      return itemHtml(`${code}0100`, '2');
    };
    const blob = await scrapeAssessmentAnswers({ assessId: '1', fetchImpl, doc });
    expect(blob.sectionStatuses).toEqual({ A: 'Signed', GG: 'In Progress' });
  });

  it('caps concurrency at 5', async () => {
    const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']; // 8 sections
    const doc = listingDoc(codes.map((code) => ({ code, status: 'Signed' })));
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async (url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      const code = new URL(url, 'https://x').searchParams.get('sectioncode');
      return itemHtml(`${code}0100`, '1');
    };

    await scrapeAssessmentAnswers({ assessId: '1', fetchImpl, doc });

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1); // proves it actually parallelizes
  });

  it('reports progress after each section completes', async () => {
    const doc = listingDoc([
      { code: 'A', status: 'Signed' },
      { code: 'C', status: 'Signed' },
      { code: 'GG', status: 'Signed' },
    ]);
    const fetchImpl = async (url) => {
      const code = new URL(url, 'https://x').searchParams.get('sectioncode');
      return itemHtml(`${code}0100`, '1');
    };
    const events = [];
    await scrapeAssessmentAnswers({
      assessId: '1',
      fetchImpl,
      doc,
      onProgress: (e) => events.push(e),
    });

    expect(events).toHaveLength(3);
    for (const e of events) expect(e.total).toBe(3);
    expect(events.map((e) => e.done)).toEqual([1, 2, 3]);
    expect(events.map((e) => e.section).sort()).toEqual(['A', 'C', 'GG']);
  });

  it('throws EmptyScrapeError when nothing parseable comes back', async () => {
    const doc = listingDoc([{ code: 'A', status: 'Signed' }]);
    const fetchImpl = async () => '<div>no questions here</div>';
    await expect(
      scrapeAssessmentAnswers({ assessId: '1', fetchImpl, doc }),
    ).rejects.toBeInstanceOf(EmptyScrapeError);
  });

  it('throws SessionExpiredError when a section returns a login page', async () => {
    const doc = listingDoc([
      { code: 'A', status: 'Signed' },
      { code: 'C', status: 'Signed' },
    ]);
    const fetchImpl = async (url) => {
      const code = new URL(url, 'https://x').searchParams.get('sectioncode');
      if (code === 'C') return '<html><head><title>Login - PointClickCare</title></head></html>';
      return itemHtml('A0100', '1');
    };
    await expect(
      scrapeAssessmentAnswers({ assessId: '1', fetchImpl, doc }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
