import { describe, it, expect, beforeEach } from 'vitest';
import { render, h } from 'preact';
import { CommandCenterHeader } from '../CommandCenterHeader.jsx';

/** Care Plan + Rounding tabs are drawn only when care plans are on at the building. */
let root;
const tabLabels = () => [...root.querySelectorAll('.mds-cc__view-tab')].map((b) => b.textContent.trim());

function mount(props = {}) {
  render(
    h(CommandCenterHeader, {
      summary: {},
      facilityName: 'Test Facility',
      onClose: () => {},
      activeView: 'assessments',
      onViewChange: () => {},
      viewMode: 'list',
      onViewModeChange: () => {},
      ...props,
    }),
    root
  );
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root');
});

describe('CommandCenterHeader care plan tabs', () => {
  it('carePlanEnabled=false → no Care Plan, no Rounding', () => {
    mount({ carePlanEnabled: false, complianceGaps: 4 });
    const labels = tabLabels();
    expect(labels.some((l) => l.startsWith('Care Plan'))).toBe(false);
    expect(labels).not.toContain('Rounding');
    expect(labels.length).toBeGreaterThan(0); // the rest of the header still renders
  });

  it('carePlanEnabled=true → both tabs', () => {
    mount({ carePlanEnabled: true });
    const labels = tabLabels();
    expect(labels.some((l) => l.startsWith('Care Plan'))).toBe(true);
    expect(labels).toContain('Rounding');
  });

  it('prop omitted → both tabs (unchanged default)', () => {
    mount({});
    const labels = tabLabels();
    expect(labels.some((l) => l.startsWith('Care Plan'))).toBe(true);
    expect(labels).toContain('Rounding');
  });
});
