// Notifications API Layer for Super LTC Chrome Extension
//
// Backs the "seen" notification system: the red badge on the floating "S"
// button + per-item red dots in the Certs/Queries tabs and 24h report.
//
// Two calls:
//   - fetchSummary() → one facility-scoped request for the whole badge count
//       { actionCount, fyiUnseenCount, report24hUnseen }
//   - markSeen(keys) → best-effort, idempotent; clears FYI items when viewed
//
// Notification key formats (built only via NOTIFICATION_KEYS below):
//   cert_signed:{certificationId}     — sticky (ages out via 7d window)
//   query_signed:{diagnosisQueryId}   — sticky
//   report_24h:{YYYY-MM-DD}           — resets daily (date in key)
//
// Exposed on window.NotificationsAPI for the vanilla fab.js + Preact views.

const NotificationsAPI = {
  /**
   * One request that returns the entire badge breakdown.
   *
   * Certs, queries and the 24h report are scoped to the facility named here.
   * The `mdsTag*` fields are NOT — they span every building the caller can
   * reach, because an assignment does not stop mattering when you switch
   * buildings. They stay separate rather than folded into `actionCount` so the
   * distinction survives the next person to read this.
   *
   * @param {string} facilityName
   * @param {string} orgSlug
   * @returns {Promise<{actionCount:number, fyiUnseenCount:number, report24hUnseen:boolean,
   *   mdsTagActionCount:number, mdsTagUnreadCount:number,
   *   mdsTagToasts:Array<{key:string,itemLabel:string,facilityName:string|null,taggerName:string}>}|null>}
   *   null when the module is unavailable (404/403) or on error — callers
   *   should treat null as "no notification contribution", never throw.
   */
  async fetchSummary(facilityName, orgSlug) {
    if (!facilityName || !orgSlug) return null;
    try {
      const params = new URLSearchParams({ facilityName, orgSlug });
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: `/api/extension/notifications/summary?${params}`,
        options: { method: 'GET' },
      });
      if (!response?.success) return null;
      const d = response.data || {};
      return {
        actionCount: d.actionCount || 0,
        fyiUnseenCount: d.fyiUnseenCount || 0,
        report24hUnseen: !!d.report24hUnseen,
        mdsTagActionCount: d.mdsTagActionCount || 0,
        mdsTagUnreadCount: d.mdsTagUnreadCount || 0,
        mdsTagToasts: Array.isArray(d.mdsTagToasts) ? d.mdsTagToasts : [],
      };
    } catch (err) {
      console.warn('[Notifications] fetchSummary failed:', err);
      return null;
    }
  },

  /**
   * Mark one or more notifications seen for the current user. Best-effort and
   * idempotent server-side — fire and forget; never block UI on it.
   * @param {string[]} keys
   * @returns {Promise<number>} count marked (0 on failure)
   */
  async markSeen(keys) {
    const clean = (Array.isArray(keys) ? keys : []).filter(
      (k) => typeof k === 'string' && k.length > 0
    );
    if (clean.length === 0) return 0;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: '/api/extension/notifications/seen',
        options: { method: 'POST', body: JSON.stringify({ keys: clean }) },
      });
      if (!response?.success) return 0;
      return response.data?.marked || 0;
    } catch (err) {
      console.warn('[Notifications] markSeen failed:', err);
      return 0;
    }
  },
};

// Key builders — the ONLY place key strings are assembled, so the format stays
// in lockstep with the backend's isValidNotificationKey().
const NOTIFICATION_KEYS = {
  certSigned: (id) => `cert_signed:${id}`,
  querySigned: (id) => `query_signed:${id}`,
  report24h: (dateLocal) => `report_24h:${dateLocal}`,
  // Announcement-only. Never a substitute for resolving the assignment.
  mdsAssign: (commentMentionId) => `mds_assign:${commentMentionId}`,
};

window.NotificationsAPI = NotificationsAPI;
window.NOTIFICATION_KEYS = NOTIFICATION_KEYS;
