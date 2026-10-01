import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';

const { GenerateReasonButton } = await import('../components/GenerateReasonButton.jsx');

/**
 * What the nurse is told after a draft comes back. A rules-based or empty result
 * is not the AI's read of the chart, so it must say so; the AI path stays quiet.
 * The standard (prose) form keeps its one existing toast.
 */

let root;
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

async function clickWith(body, props = {}) {
  window.CertAPI.generateClinicalReason.mockResolvedValue(body);
  const onGenerated = vi.fn();
  render(
    h(GenerateReasonButton, {
      certId: 'cert_1',
      certType: 'day_14_recert',
      hasText: false,
      surface: 'send',
      onGenerated,
      ...props,
    }),
    root
  );
  await flush();
  root.querySelector('.cm-gen-btn').click();
  await flush();
  return onGenerated;
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  window.CertAPI = { generateClinicalReason: vi.fn() };
  window.SuperToast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  window.SuperAnalytics = { track: vi.fn(), toErrorCode: () => 'x' };
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe('checkbox form', () => {
  const codes = [{ code: 'pt_ot', auto: true, evidence: 'PT 5x/week' }];

  it('rules-based suggestions ask for review', async () => {
    await clickWith({ clinicalReason: '', source: 'rules', reasonCodes: codes }, { form: 'checkbox' });
    expect(window.SuperToast.info).toHaveBeenCalledWith('Suggestions ready — please review before saving');
  });

  it('no suggestions tells the nurse to check the boxes herself', async () => {
    await clickWith({ clinicalReason: '', source: 'ai', reasonCodes: [] }, { form: 'checkbox' });
    expect(window.SuperToast.info).toHaveBeenCalledTimes(1);
    expect(window.SuperToast.info).toHaveBeenCalledWith('No reasons found in the chart — check the boxes that apply');
  });

  it('empty rules result gets the empty message, not the review one', async () => {
    await clickWith({ clinicalReason: '', source: 'rules', reasonCodes: [] }, { form: 'checkbox' });
    expect(window.SuperToast.info).toHaveBeenCalledTimes(1);
    expect(window.SuperToast.info).toHaveBeenCalledWith('No reasons found in the chart — check the boxes that apply');
  });

  it('a missing reasonCodes counts as none found', async () => {
    await clickWith({ clinicalReason: '', source: 'ai' }, { form: 'checkbox' });
    expect(window.SuperToast.info).toHaveBeenCalledWith('No reasons found in the chart — check the boxes that apply');
  });

  it('AI suggestions show no toast', async () => {
    const onGenerated = await clickWith({ clinicalReason: '', source: 'ai', reasonCodes: codes }, { form: 'checkbox' });
    expect(onGenerated).toHaveBeenCalled();
    expect(window.SuperToast.info).not.toHaveBeenCalled();
  });
});

describe('standard form is unchanged', () => {
  it('fallback still shows the draft toast', async () => {
    await clickWith({ clinicalReason: 'Skilled care.', source: 'fallback' });
    expect(window.SuperToast.info).toHaveBeenCalledWith('Draft ready — please review before saving');
  });

  it('an AI draft shows no toast, and no reasonCodes is not "none found"', async () => {
    await clickWith({ clinicalReason: 'Skilled care.', source: 'ai' });
    expect(window.SuperToast.info).not.toHaveBeenCalled();
  });
});
