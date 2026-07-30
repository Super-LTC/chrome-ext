import { describe, it, expect } from 'vitest';
import { noteIdFromFormUrl } from '../utils/captureWrittenNote.js';

/**
 * The one thing this guard exists to prevent: recording a note the nurse merely
 * READ as the note she wrote.
 *
 * PCC's note window is somewhere a nurse navigates. She clicks "Add progress
 * note", meets an e-signature attestation, and often goes to look at an
 * existing note before committing to one. Matching `ESOLpnid` anywhere in
 * whatever URL that window happens to be showing captures whatever she was
 * last looking at — including another resident's chart — and stores it as
 * "Progress note added by <her name>" on a finding about someone else.
 */

const ORIGIN = 'https://www21.pointclickcare.com';
const form = (params) => `${ORIGIN}/care/chart/ipn/newipn.jsp?${params}`;

describe('noteIdFromFormUrl', () => {
  it('takes the id from this resident’s saved note form', () => {
    expect(noteIdFromFormUrl(form('ESOLclientid=44521&res_pn=Y&ESOLpnid=7604501'), '44521')).toBe(
      '7604501'
    );
  });

  it('ignores the blank form', () => {
    expect(
      noteIdFromFormUrl(form('ESOLclientid=44521&res_pn=Y&ESOLpnid=-1'), '44521')
    ).toBeNull();
  });

  it('refuses a note belonging to a DIFFERENT resident', () => {
    // She opened resident 99999's note in the same window.
    expect(
      noteIdFromFormUrl(form('ESOLclientid=99999&res_pn=Y&ESOLpnid=7604501'), '44521')
    ).toBeNull();
  });

  it('refuses an id riding on a page that is not the note form', () => {
    // The id appears, but this is the notes LIST, not a saved note.
    const list = `${ORIGIN}/clinical/client/progressnotesviewall.xhtml?ESOLclientid=44521&ESOLpnid=7604501`;
    expect(noteIdFromFormUrl(list, '44521')).toBeNull();
  });

  it('refuses an id smuggled through a return-url parameter', () => {
    const bounced = `${ORIGIN}/care/chart/ipn/login.jsp?returnUrl=${encodeURIComponent(
      form('ESOLclientid=44521&ESOLpnid=7604501')
    )}`;
    expect(noteIdFromFormUrl(bounced, '44521')).toBeNull();
  });

  it('refuses a non-numeric or over-long id', () => {
    expect(noteIdFromFormUrl(form('ESOLclientid=44521&ESOLpnid=abc'), '44521')).toBeNull();
    expect(
      noteIdFromFormUrl(form(`ESOLclientid=44521&ESOLpnid=${'9'.repeat(50)}`), '44521')
    ).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(noteIdFromFormUrl('', '44521')).toBeNull();
    expect(noteIdFromFormUrl('not a url', '44521')).toBeNull();
    expect(noteIdFromFormUrl(form('ESOLpnid=1'), null)).toBeNull();
  });

  it('compares the client id as a string, so a numeric prop still matches', () => {
    expect(noteIdFromFormUrl(form('ESOLclientid=44521&ESOLpnid=88'), 44521)).toBe('88');
  });
});
