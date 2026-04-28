import { useState, useEffect } from 'preact/hooks';

export function useItemDetail(mdsItem, categoryKey, context) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mdsItem || !context?.assessmentId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);

    async function fetchDetail() {
      try {
        // Resolve facilityName and orgSlug the same way usePDPMAnalyzer does
        const orgResponse = getOrg();
        const orgSlug = orgResponse?.org;
        const facilityName = window.getChatFacilityInfo?.() || '';

        if (!orgSlug || !facilityName) {
          throw new Error('Could not determine organization or facility');
        }

        const colonIdx = mdsItem.indexOf(':');
        const apiCode = colonIdx >= 0 ? mdsItem.slice(0, colonIdx) : mdsItem;
        // I8000:NTA:18 → categoryKey "NTA:18" when caller didn't pass one explicitly
        const derivedCategoryKey = colonIdx >= 0 ? mdsItem.slice(colonIdx + 1) : null;
        const finalCategoryKey = categoryKey || derivedCategoryKey;

        let endpoint = `/api/extension/mds/items/${encodeURIComponent(apiCode)}?externalAssessmentId=${context.assessmentId}&facilityName=${encodeURIComponent(facilityName)}&orgSlug=${encodeURIComponent(orgSlug)}`;
        if (finalCategoryKey) endpoint += `&categoryKey=${encodeURIComponent(finalCategoryKey)}`;

        console.log('[useItemDetail] fetch', {
          mdsItem,
          apiCode,
          passedCategoryKey: categoryKey,
          derivedCategoryKey,
          finalCategoryKey,
          endpoint,
        });

        chrome.runtime.sendMessage({ type: 'API_REQUEST', endpoint }, (resp) => {
          if (cancelled) return;
          if (resp?.success) setData(resp.data);
          else setError(resp?.error || 'Failed to load item detail');
          setLoading(false);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load item detail');
          setLoading(false);
        }
      }
    }

    fetchDetail();
    return () => { cancelled = true; };
  }, [mdsItem, categoryKey, context?.assessmentId]);

  return { data, loading, error };
}
