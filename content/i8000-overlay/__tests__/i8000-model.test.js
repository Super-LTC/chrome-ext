import { describe, test, expect } from 'vitest';
import { buildI8000ViewModel, auditBadge } from '../i8000-model.js';

// A minimal "ok" envelope shaped like GET /api/extension/mds/sections/I/i8000.
function okEnvelope(overrides = {}) {
  return {
    success: true,
    state: 'ok',
    i8000: {
      runId: 'run_1',
      solvedAt: '2026-06-28T12:00:00.000Z',
      stale: false,
      auditedExisting: [],
      suggestedMissing: [],
      summary: {
        enteredCount: 0,
        agreeCount: 0,
        disagreeCount: 0,
        outsideScopeCount: 0,
        suggestedCount: 0,
        potentialNtaPoints: 0,
        slotsAvailable: 10,
      },
      ...overrides,
    },
  };
}

describe('auditBadge', () => {
  test('agree → green "Supported"', () => {
    expect(auditBadge('agree')).toEqual({ kind: 'agree', label: 'Supported' });
  });
  test('disagree → red "Weak evidence"', () => {
    expect(auditBadge('disagree')).toEqual({ kind: 'disagree', label: 'Weak evidence' });
  });
  test('outside_scope → muted "Not a PDPM category"', () => {
    expect(auditBadge('outside_scope')).toEqual({ kind: 'outside', label: 'Not a PDPM category' });
  });
  test('unknown verdict → null', () => {
    expect(auditBadge('whatever')).toBeNull();
  });
});

describe('buildI8000ViewModel — non-ok states', () => {
  test('no_run passes state through with nothing to render', () => {
    const vm = buildI8000ViewModel({ success: true, state: 'no_run' });
    expect(vm.state).toBe('no_run');
    expect(vm.hasAudits).toBe(false);
    expect(vm.hasSuggestions).toBe(false);
  });

  test('skipped passes state through with nothing to render', () => {
    const vm = buildI8000ViewModel({ success: true, state: 'skipped', skippedReason: 'discharge' });
    expect(vm.state).toBe('skipped');
    expect(vm.hasAudits).toBe(false);
    expect(vm.hasSuggestions).toBe(false);
  });

  test('null / missing response → empty ok-less model, no throw', () => {
    const vm = buildI8000ViewModel(null);
    expect(vm.state).toBeNull();
    expect(vm.audits).toEqual([]);
    expect(vm.banner.suggestions).toEqual([]);
  });
});

describe('buildI8000ViewModel — audits', () => {
  test('maps each audited row to a verdict badge, preserving field/code/reason/result', () => {
    const vm = buildI8000ViewModel(
      okEnvelope({
        auditedExisting: [
          { field: 'I8000A', enteredCode: 'J432', enteredDisplay: 'J43.2 Centrilobular emphysema', verdict: 'agree', categoryKey: 'NTA:50', reason: 'Documented', result: { status: 'code' } },
          { field: 'I8000C', enteredCode: 'R627', enteredDisplay: 'R62.7 Adult failure to thrive', verdict: 'outside_scope', categoryKey: null, reason: '', result: null },
        ],
      })
    );
    expect(vm.hasAudits).toBe(true);
    expect(vm.audits).toHaveLength(2);
    expect(vm.audits[0]).toMatchObject({
      field: 'I8000A',
      enteredDisplay: 'J43.2 Centrilobular emphysema',
      verdict: 'agree',
      badge: { kind: 'agree', label: 'Supported' },
    });
    expect(vm.audits[1].badge).toEqual({ kind: 'outside', label: 'Not a PDPM category' });
    expect(vm.audits[1].result).toBeNull();
  });

  test('forwards row-level Dx/Tx summaries + pass flags for the modal', () => {
    const vm = buildI8000ViewModel(
      okEnvelope({
        auditedExisting: [
          {
            field: 'I8000A', enteredCode: 'J432', enteredDisplay: 'J43.2', verdict: 'agree',
            categoryKey: 'NTA:50', reason: 'Documented',
            diagnosisSummary: 'Pulmonology note documents emphysema', diagnosisPassed: true,
            treatmentSummary: 'Home O2 + tiotropium', activeStatusPassed: true,
            result: { status: 'code' },
          },
        ],
      })
    );
    expect(vm.audits[0]).toMatchObject({
      diagnosisSummary: 'Pulmonology note documents emphysema',
      diagnosisPassed: true,
      treatmentSummary: 'Home O2 + tiotropium',
      activeStatusPassed: true,
    });
  });

  test('falls back to result-nested Dx/Tx when not at row level', () => {
    const vm = buildI8000ViewModel(
      okEnvelope({
        auditedExisting: [
          {
            field: 'I8000A', enteredCode: 'J432', enteredDisplay: 'J43.2', verdict: 'agree',
            categoryKey: 'NTA:50', reason: 'Documented',
            result: { status: 'code', diagnosisSummary: 'nested dx', diagnosisPassed: true },
          },
        ],
      })
    );
    expect(vm.audits[0].diagnosisSummary).toBe('nested dx');
    expect(vm.audits[0].diagnosisPassed).toBe(true);
  });
});

describe('buildI8000ViewModel — suggestions', () => {
  test('sorts suggestions by ntaPoints desc and attaches a status label from the result', () => {
    const vm = buildI8000ViewModel(
      okEnvelope({
        suggestedMissing: [
          { categoryKey: 'NTA:41', categoryName: 'Diabetic Retinopathy', component: 'NTA', ntaPoints: 1, result: { status: 'code', diagnosisPassed: true, activeStatusPassed: true } },
          { categoryKey: 'NTA:50', categoryName: 'Pulmonary Fibrosis', component: 'NTA', ntaPoints: 3, result: { status: 'needs_physician_query', diagnosisPassed: false, activeStatusPassed: true } },
        ],
        summary: { enteredCount: 0, agreeCount: 0, disagreeCount: 0, outsideScopeCount: 0, suggestedCount: 2, potentialNtaPoints: 4, slotsAvailable: 6 },
      })
    );
    expect(vm.hasSuggestions).toBe(true);
    expect(vm.banner.suggestions.map((s) => s.categoryKey)).toEqual(['NTA:50', 'NTA:41']);
    expect(vm.banner.suggestions[0].statusLabel).toBe('Query needed');
    expect(vm.banner.suggestions[1].statusLabel).toBe('Code it');
  });

  test('banner carries headline counts and a slots-full flag', () => {
    const vm = buildI8000ViewModel(
      okEnvelope({
        summary: { enteredCount: 10, agreeCount: 1, disagreeCount: 0, outsideScopeCount: 9, suggestedCount: 2, potentialNtaPoints: 4, slotsAvailable: 0 },
      })
    );
    expect(vm.banner.suggestionCount).toBe(2);
    expect(vm.banner.potentialNtaPoints).toBe(4);
    expect(vm.banner.slotsAvailable).toBe(0);
    expect(vm.banner.slotsFull).toBe(true);
  });
});
