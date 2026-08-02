/**
 * MDS item conversations — API layer.
 *
 * Exposed on `window.MdsCommentsAPI`, mirroring `NotificationsAPI`'s shape so
 * the vanilla overlay can reach it without an import. Every call goes through
 * the background relay; content scripts never fetch directly.
 *
 * Reads return null on failure rather than throwing. A badge that cannot load
 * must degrade to "no badge", never to a broken MDS page — the nurse came here
 * to code an assessment, not to read comments.
 */

/**
 * The PCC identity tuple every MDS route needs.
 *
 * `externalAssessmentId` is frequently an `EID_…` render handle that matches
 * nothing, which is why the rest ride along — the backend falls back through
 * patient id, MRN, assessment type and ARD. Built from the same helpers the
 * rest of the overlay uses so it cannot drift.
 */
function mdsRefParams() {
  const params = new URLSearchParams();
  const s = window.SuperOverlay || {};
  if (s.facilityName) params.set('facilityName', s.facilityName);
  if (s.orgSlug) params.set('orgSlug', s.orgSlug);
  if (s.assessmentId) params.set('externalAssessmentId', s.assessmentId);
  window.appendMDSContextParams?.(params);
  return params;
}

function mdsRefBody() {
  const s = window.SuperOverlay || {};
  return {
    facilityName: s.facilityName,
    orgSlug: s.orgSlug,
    ...(s.assessmentId ? { externalAssessmentId: s.assessmentId } : {}),
    ...(window.getMDSContextBodyFields?.() || {}),
  };
}

async function call(endpoint, options) {
  const res = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint,
    options,
  });
  if (!res?.success) {
    const err = new Error(res?.error || 'Request failed');
    err.status = res?.status;
    throw err;
  }
  // The worker wraps the server's own {success, data} envelope, so the payload
  // is one level deeper than it looks.
  return res.data;
}

const MdsCommentsAPI = {
  /**
   * Every commented item on the current assessment, keyed `mdsItem + mdsColumn`.
   * ONE call for the whole section — a per-item fetch would be a request per row.
   */
  async fetchBadges() {
    try {
      const data = await call(
        `/api/extension/mds/comment-badges?${mdsRefParams()}`,
        { method: 'GET' }
      );
      const map = {};
      for (const b of data?.badges || []) {
        map[`${b.mdsItem}${b.mdsColumn || ''}`] = b;
      }
      return map;
    } catch (err) {
      console.warn('[MdsComments] badge fetch failed:', err?.message);
      return null;
    }
  },

  /** The conversation on one item, plus the roster and a suggested assignee. */
  async fetchThread(mdsItem, mdsColumn = '') {
    const params = mdsRefParams();
    params.set('mdsItem', mdsItem);
    params.set('mdsColumn', mdsColumn || '');
    return call(`/api/extension/mds/threads?${params}`, { method: 'GET' });
  },

  /** Post a comment. `assignedUserIds` is what makes it an ask rather than a note. */
  async postComment({ mdsItem, mdsColumn = '', message, assignedUserIds = [] }) {
    return call('/api/extension/mds/threads', {
      method: 'POST',
      body: JSON.stringify({
        ...mdsRefBody(),
        mdsItem,
        mdsColumn: mdsColumn || '',
        message,
        assignedUserIds,
      }),
    });
  },

  /**
   * Answer an assignment and close it. The reply is required server-side —
   * an ask you can clear without saying anything is a dismiss with extra steps.
   */
  async replyAndResolve({ commentMentionId, message }) {
    return call('/api/extension/mds/threads/resolve', {
      method: 'POST',
      body: JSON.stringify({ commentMentionId, message }),
    });
  },
};

window.MdsCommentsAPI = MdsCommentsAPI;
