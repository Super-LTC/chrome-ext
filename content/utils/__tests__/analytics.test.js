import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * track() strips every property its event's schema entry doesn't list — silently.
 * So a prop a caller adds without a schema line never reaches PostHog, and nothing
 * fails. These pin the props the cert reason button actually sends.
 */

const capture = vi.fn();
vi.mock('posthog-js/dist/module.full.no-external', () => ({
  default: {
    init: vi.fn(),
    register: vi.fn(),
    capture,
    identify: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
    onFeatureFlags: vi.fn(),
  },
}));

// Build-time defines the bundle normally inlines; ENABLED needs one of them on.
vi.stubGlobal('__POSTHOG_KEY__', 'phc_test');
vi.stubGlobal('__ANALYTICS_FORCE_ON__', false);
vi.stubGlobal('__DEV_MODE__', false);
vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.0.0' }) } });

const { track } = await import('../analytics.js');

beforeEach(() => capture.mockClear());

describe('cert reason events keep the checkbox-form tag', () => {
  it('cert_reason_generate_clicked carries form', () => {
    track('cert_reason_generate_clicked', {
      cert_type: 'day_14_recert',
      is_regenerate: true,
      surface: 'send',
      form: 'checkbox',
    });
    expect(capture).toHaveBeenCalledWith('cert_reason_generate_clicked', {
      cert_type: 'day_14_recert',
      is_regenerate: true,
      surface: 'send',
      form: 'checkbox',
    });
  });

  it('cert_reason_generated carries form', () => {
    track('cert_reason_generated', {
      cert_type: 'day_30_recert',
      source: 'rules',
      surface: 'edit',
      form: 'checkbox',
    });
    expect(capture).toHaveBeenCalledWith('cert_reason_generated', {
      cert_type: 'day_30_recert',
      source: 'rules',
      surface: 'edit',
      form: 'checkbox',
    });
  });

  it('still strips props the schema does not list', () => {
    track('cert_reason_generated', { cert_type: 'day_14_recert', source: 'ai', surface: 'send', evidence: 'x' });
    expect(capture.mock.calls[0][1]).not.toHaveProperty('evidence');
  });
});
