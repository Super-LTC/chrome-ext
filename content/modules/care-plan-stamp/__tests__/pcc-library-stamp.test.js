// content/modules/care-plan-stamp/__tests__/pcc-library-stamp.test.js
//
// Pure body-builders + response parse for the LIBRARY-add stamp path (SUP-54).
// Params mirror the real PCC write curls captured 2026-07-07 (org eac / lib 8).
import { describe, it, expect } from 'vitest';
import {
  buildFocusCreateBody,
  buildFocusEditBody,
  buildGoalWizardBody,
  buildInterWizardBody,
  parseNewFocusId,
  isLibraryFocus,
  partitionByLibrary,
} from '../pcc-library-stamp.js';

const DATE = { date: '07/07/2026', dateDummy: '7/7/2026' };

describe('buildFocusCreateBody (neededit_rev.jsp — create a library focus)', () => {
  const body = buildFocusCreateBody({
    stdNeedId: '4739',
    etiologyIds: ['14226', '14227'],
    text: '',
    clientId: '923145',
    careplanId: '46430',
    miniToken: 'gHGUyKhci4',
  });

  it('marks it a NEW library focus with the library std id', () => {
    expect(body.get('ESOLstdneedid')).toBe('4739');
    expect(body.get('ESOLnewFocus')).toBe('true');
    expect(body.get('ESOLgenneedid')).toBe('-1');
    expect(body.get('ESOLneedid')).toBe('-1');
    expect(body.get('ESOLwizard')).toBe('Y');
    expect(body.get('ESOLpage')).toBe('careplandetail_rev');
    expect(body.get('ESOLtext1')).toBe(''); // empty → PCC assembles text from stem + etiologies
  });

  it('sends one chkbox per selected etiology', () => {
    expect(body.getAll('chkbox')).toEqual(['14226', '14227']);
  });
});

describe('buildFocusEditBody (neededit_rev.jsp — set our wording + review depts)', () => {
  const body = buildFocusEditBody({
    genNeedId: '1071635',
    stdNeedId: '4739',
    description: 'Resident has history of trauma',
    reviewDepartments: ['9123', '9042'],
    clientId: '923145',
    dates: DATE,
    miniToken: 'gHGUyKhci4',
  });

  it('edits the just-created focus (wizard=N, save=Y) with our text', () => {
    expect(body.get('ESOLgenneedid')).toBe('1071635');
    expect(body.get('ESOLwizard')).toBe('N');
    expect(body.get('ESOLsave')).toBe('Y');
    expect(body.get('cp_description')).toBe('Resident has history of trauma');
    expect(body.get('ESOLcareplanid')).toBe('-1');
    expect(body.get('date_initiated')).toBe('07/07/2026');
  });

  it('maps review departments to position_id_one..five slots', () => {
    expect(body.get('position_id_one')).toBe('9123');
    expect(body.get('position_id_two')).toBe('9042');
    expect(body.get('position_id_three')).toBe(''); // unused slots empty
  });
});

describe('parseNewFocusId (recover the new genneedid==needid after create)', () => {
  it('reads it from a redirect to goalwizard (response.url)', () => {
    const url = 'https://x.pointclickcare.com/care/chart/cp/goalwizard_rev.jsp?ESOLgenneedid=1071635&ESOLneedid=1071635&ESOLstdneedid=4739';
    expect(parseNewFocusId('', url)).toBe('1071635');
  });

  it('falls back to ESOLlastneed in the response html (custom-flow shape)', () => {
    expect(parseNewFocusId('ow.document.needs.ESOLlastneed.value = "1071635";', '')).toBe('1071635');
  });

  it('falls back to an embedded ESOLgenneedid in the html', () => {
    expect(parseNewFocusId('<a href="goalwizard_rev.jsp?ESOLgenneedid=1071635&x=1">', '')).toBe('1071635');
  });

  it('returns null when no id is present', () => {
    expect(parseNewFocusId('<html>no id here</html>', 'https://x/neededit_rev.jsp')).toBeNull();
  });
});

describe('buildGoalWizardBody (goalwizard_rev.jsp — add library goals)', () => {
  const body = buildGoalWizardBody({
    genNeedId: '1071635',
    needId: '1071635',
    stdNeedId: '4739',
    goalStdIds: ['2816', '2820'],
    focusDescription: 'Resident has history of trauma',
    clientId: '923145',
    careplanId: '46430',
    miniToken: 'gHGUyKhci4',
  });

  it('saves the checked library goals to the focus', () => {
    expect(body.get('ESOLsave')).toBe('Y');
    expect(body.getAll('chkbox')).toEqual(['2816', '2820']);
    expect(body.get('ESOLgenneedid')).toBe('1071635');
    expect(body.get('ESOLneedid')).toBe('1071635');
    expect(body.get('ESOLstdneedid')).toBe('4739');
    expect(body.get('focus')).toBe('Resident has history of trauma');
  });
});

describe('buildInterWizardBody (interwizard_rev.jsp — add library interventions)', () => {
  const body = buildInterWizardBody({
    genNeedId: '1071635',
    needId: '1071635',
    stdNeedId: '4739',
    interStdIds: ['17747', '15637'],
    clientId: '923145',
    careplanId: '46430',
    miniToken: 'gHGUyKhci4',
    dates: DATE,
  });

  it('saves the checked library interventions to the focus', () => {
    expect(body.get('ESOLsave')).toBe('Y');
    expect(body.getAll('chkbox')).toEqual(['17747', '15637']);
    expect(body.get('ESOLgenneedid')).toBe('1071635');
    expect(body.get('ESOLneedid')).toBe('1071635');
    expect(body.get('ESOLstdneedid')).toBe('4739');
    expect(body.get('initDate')).toBe('07/07/2026');
  });
});

describe('isLibraryFocus (route to library-add vs custom stamp)', () => {
  it('true when the focus carries a usable libraryStdId', () => {
    expect(isLibraryFocus({ libraryStdId: '4739' })).toBe(true);
  });
  it('false for built-in / AI-authored focuses (no id, empty, or -1)', () => {
    expect(isLibraryFocus({})).toBe(false);
    expect(isLibraryFocus({ libraryStdId: '' })).toBe(false);
    expect(isLibraryFocus({ libraryStdId: '-1' })).toBe(false);
    expect(isLibraryFocus(null)).toBe(false);
  });
});

describe('partitionByLibrary (batch the library items; custom-stamp the rest)', () => {
  it('splits goals/interventions into library std ids vs custom items', () => {
    const { libraryStdIds, custom } = partitionByLibrary([
      { description: 'lib goal', libraryStdId: '2816' },
      { description: 'AI goal' },
      { description: 'lib goal 2', libraryStdId: '2820' },
      { description: 'custom -1', libraryStdId: '-1' },
    ]);
    expect(libraryStdIds).toEqual(['2816', '2820']);
    expect(custom.map((c) => c.description)).toEqual(['AI goal', 'custom -1']);
  });
  it('handles an empty/undefined list', () => {
    expect(partitionByLibrary([])).toEqual({ libraryStdIds: [], custom: [] });
    expect(partitionByLibrary()).toEqual({ libraryStdIds: [], custom: [] });
  });
});
