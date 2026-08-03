/**
 * The deferral set and its reasons.
 *
 * These are pinned rather than trusted because the banner they drive is the
 * whole point of the QIP drill: for these four measures the SCORED number is
 * CMS's published rate, while the roster on screen is our live MDS view. Drop a
 * measure from the set and the roster silently starts masquerading as the input
 * behind a number it did not produce — which is the confusion #1068 existed to
 * kill, reintroduced without a single test going red.
 */
import { describe, it, expect } from 'vitest';
import {
  FL_ADJUSTED_MEASURES,
  FL_QIP_DEFERRAL_REASONS,
  deferralReasonFor,
  resolveDeferralReason,
} from '../fl-qip-deferral.js';

describe('FL QIP deferral', () => {
  it('defers exactly the four measures FL scores from CMS', () => {
    expect([...FL_ADJUSTED_MEASURES].sort()).toEqual([
      'antipsychotic_long',
      'bb_new_worsened',
      'influenza_vaccine',
      'pressure_ulcer_long',
    ]);
  });

  it('gives every deferred measure a reason to show', () => {
    // A deferred measure with no reason renders a banner with a blank in it,
    // which reads as a bug rather than as an explanation.
    for (const id of FL_ADJUSTED_MEASURES) {
      expect(FL_QIP_DEFERRAL_REASONS[id], `no reason for ${id}`).toBeTruthy();
    }
  });

  it('distinguishes WHY each one defers rather than saying "deferred"', () => {
    // Risk-adjusted, claims-based and wrong-cohort are different problems and
    // lead a reader to different conclusions.
    expect(FL_QIP_DEFERRAL_REASONS.pressure_ulcer_long).toMatch(/risk-adjusted/);
    expect(FL_QIP_DEFERRAL_REASONS.antipsychotic_long).toMatch(/pharmacy-claims/);
    expect(FL_QIP_DEFERRAL_REASONS.influenza_vaccine).toMatch(/Oct-Mar|season/);
  });

  it('returns no reason for a measure FL scores from our own MDS', () => {
    expect(deferralReasonFor('uti')).toBeUndefined();
    expect(deferralReasonFor('falls_major_injury')).toBeUndefined();
  });

  it('returns the reason for a deferred measure', () => {
    expect(deferralReasonFor('bb_new_worsened')).toBe(FL_QIP_DEFERRAL_REASONS.bb_new_worsened);
  });
});

describe('resolveDeferralReason — server wording wins', () => {
  it('prefers the server map over our copy', () => {
    // The whole point of #1084: one source of the words.
    const server = { uti: 'SERVER SAYS SO' };
    expect(resolveDeferralReason('uti', server)).toBe('SERVER SAYS SO');
  });

  it('trusts the server map even when it OMITS a measure we think is deferred', () => {
    // If the server is authoritative it is authoritative both ways. Merging our
    // set in would resurrect the drift this field exists to remove — and would
    // show a banner for a measure the server no longer defers.
    expect(resolveDeferralReason('pressure_ulcer_long', { uti: 'x' })).toBeUndefined();
  });

  it('falls back to our copy only when the payload carries no map at all', () => {
    // The deploy bridge: a pre-#1084 payload has no `scoringDeferrals`.
    expect(resolveDeferralReason('pressure_ulcer_long', undefined))
      .toBe(FL_QIP_DEFERRAL_REASONS.pressure_ulcer_long);
    expect(resolveDeferralReason('pressure_ulcer_long', null))
      .toBe(FL_QIP_DEFERRAL_REASONS.pressure_ulcer_long);
  });

  it('still says nothing for a non-deferred measure on either path', () => {
    expect(resolveDeferralReason('falls_major_injury', undefined)).toBeUndefined();
    expect(resolveDeferralReason('falls_major_injury', { uti: 'x' })).toBeUndefined();
  });

  it('stays constants-only so the drill can import it freely', async () => {
    // The web keeps this module separate because importing the DB-backed
    // comparison stack into a client component broke the prod build (#1070).
    // Here the equivalent hazard is pulling scoring logic into the lazy QM
    // chunk. Nothing but data should ever be exported from this file.
    const mod = await import('../fl-qip-deferral.js');
    const unexpected = Object.entries(mod)
      .filter(([k, v]) => typeof v === 'function'
        && !['deferralReasonFor', 'resolveDeferralReason'].includes(k))
      .map(([k]) => k);
    expect(unexpected).toEqual([]);
  });
});
