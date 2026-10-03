/**
 * Dismiss / undo for drawer items. Same endpoint the MDS overlay and the item
 * detail view use (POST/DELETE /api/extension/mds/items/:item/decision), plus the
 * structured `reason` the drawer requires.
 */

function scope() {
  const orgSlug = (typeof getOrg === 'function' ? getOrg() : null)?.org;
  const facilityName = window.getChatFacilityInfo?.() || '';
  return { orgSlug, facilityName };
}

/** The decision row's key: the bare item code ("I8000", "O0110H1") and its column. */
export function decisionTarget(item) {
  const mdsItem = String(item?.mdsItem || '');
  const apiCode = mdsItem.includes(':') ? mdsItem.split(':')[0] : mdsItem;
  return { apiCode, mdsColumn: item?.mdsColumn ?? item?.column ?? '' };
}

function syncOverlay(apiCode, mdsColumn, dismissed) {
  const set = window.SuperOverlay?.dismissedItems;
  if (!set) return;
  const key = `${apiCode}-${mdsColumn}`;
  if (dismissed) set.add(key);
  else set.delete(key);
  try {
    chrome.storage.local.set({ superDismissedItems: Array.from(set) });
  } catch {
    /* storage is best-effort */
  }
}

async function send(method, item, assessmentId, extra) {
  const { orgSlug, facilityName } = scope();
  const { apiCode, mdsColumn } = decisionTarget(item);
  const response = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/mds/items/${encodeURIComponent(apiCode)}/decision`,
    options: {
      method,
      body: JSON.stringify({
        externalAssessmentId: assessmentId,
        facilityName,
        orgSlug,
        mdsColumn,
        ...extra,
        ...(window.getMDSContextBodyFields?.() || {}),
      }),
    },
  });
  if (!response?.success) throw new Error(response?.error || 'Request failed');
  return { apiCode, mdsColumn };
}

/** Dismiss with a required reason. Tells every view to re-fetch. */
export async function dismissItem({ item, assessmentId, reason, note }) {
  const { apiCode, mdsColumn } = await send('POST', item, assessmentId, {
    decision: 'disagree',
    reason,
    note: note || '',
  });
  syncOverlay(apiCode, mdsColumn, true);
  window.dispatchEvent(new CustomEvent('super:item-decision', {
    detail: { mdsItem: apiCode, column: mdsColumn, decision: 'disagree' },
  }));
  window.SuperAnalytics?.track?.('mds_item_decision', {
    item_code: apiCode,
    column: String(mdsColumn || ''),
    decision: 'disagree',
    has_reason: true,
    reason,
    surface: 'pdpm_drawer',
  });
}

/** Undo a dismissal. */
export async function undoDismiss({ item, assessmentId }) {
  const { apiCode, mdsColumn } = await send('DELETE', item, assessmentId, {});
  syncOverlay(apiCode, mdsColumn, false);
  window.dispatchEvent(new CustomEvent('super:item-decision', {
    detail: { mdsItem: apiCode, column: mdsColumn, decision: 'undo' },
  }));
  window.SuperAnalytics?.track?.('mds_item_decision_undone', { item_code: apiCode, surface: 'pdpm_drawer' });
}

/**
 * "Go to MDS": scroll to the item when the page is already this assessment's
 * section, otherwise open that section.
 */
export function goToMds(item, assessmentId) {
  const { apiCode, mdsColumn } = decisionTarget(item);
  if (window.scrollToMdsItem?.(apiCode, mdsColumn)) return;
  window.navigateToMDSItem?.(apiCode, assessmentId);
}
