// Regression tests for scrapePccPublicIdFromDOM() — hyphenated MRNs.
//
// The MRN (pccPublicId) is the extension's durable patient anchor: on an
// EID-flipped MDS page it is the only identifier that survives, and the backend
// maps it to the numeric external id. The scraper matched `\(([A-Z0-9]{4,})\)`,
// which rejects any MRN carrying a hyphen — a common PCC format. Those
// facilities sent NO pccPublicId at all, so every /mds/* call from them resolved
// on the scraped numeric client id alone, with nothing behind it.
//
// The strict (hyphen-free) pattern still runs first and wins, so facilities that
// resolve an MRN today resolve the same one. The hyphen pass is a second look
// that only fires when the strict pass found nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import { scrapePccPublicIdFromDOM } from '../client-id.js';

beforeEach(() => {
  document.title = '';
  document.body.innerHTML = '';
});

describe('scrapePccPublicIdFromDOM()', () => {
  it('reads a plain alphanumeric MRN from the title (unchanged)', () => {
    document.title = 'Section N - Doe, Jane (AC72452125)';
    expect(scrapePccPublicIdFromDOM()).toBe('AC72452125');
  });

  it('reads a HYPHENATED MRN from the title', () => {
    document.title = 'MDS 3.0 Section I - Doe, Jane (482-9137)';
    expect(scrapePccPublicIdFromDOM()).toBe('482-9137');
  });

  it('reads a hyphenated MRN from the resident header when the title has none', () => {
    document.body.innerHTML = '<div class="residentName">Doe, Jane (AC4829-137)</div>';
    expect(scrapePccPublicIdFromDOM()).toBe('AC4829-137');
  });

  it('prefers the hyphen-free id when both shapes are present (no behaviour change)', () => {
    document.title = 'Doe, Jane (AC72452125) - visit (482-9137)';
    expect(scrapePccPublicIdFromDOM()).toBe('AC72452125');
  });

  it('still rejects all-caps decorations with no digit', () => {
    document.title = 'Section A (OBRA) - Doe, Jane';
    expect(scrapePccPublicIdFromDOM()).toBeNull();
  });

  it('rejects a parenthesised ISO date — an ARD is not an MRN', () => {
    document.title = 'Section I (2026-09-11)';
    expect(scrapePccPublicIdFromDOM()).toBeNull();
  });

  it('rejects a parenthesised US date', () => {
    document.title = 'Admitted (06-13-2025)';
    expect(scrapePccPublicIdFromDOM()).toBeNull();
  });

  it('rejects a leading or trailing hyphen', () => {
    document.title = 'Doe, Jane (-4829137) and (4829137-)';
    expect(scrapePccPublicIdFromDOM()).toBeNull();
  });

  it('picks the MRN out of a title that also carries a date', () => {
    document.title = 'Section I (2026-09-11) - Doe, Jane (482-9137)';
    expect(scrapePccPublicIdFromDOM()).toBe('482-9137');
  });
});
