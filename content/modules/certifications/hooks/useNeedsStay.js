import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * Residents whose census shows a skilled payer but who have no cert stay,
 * plus whether managed-care certs are on for the facility.
 *
 * Endpoint: GET /api/extension/certifications/needs-stay
 *
 * Facility-wide: pass a null facilityName (per-patient overlay) to skip the
 * request. fetchNeedsStay never throws — a failure just means no section.
 */
export function useNeedsStay({ facilityName, orgSlug }) {
  const [items, setItems] = useState([]);
  const [managedCareEnabled, setManagedCareEnabled] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!facilityName || !orgSlug || !window.CertAPI?.fetchNeedsStay) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await window.CertAPI.fetchNeedsStay(facilityName, orgSlug);
      setItems(data.needsStay || []);
      setManagedCareEnabled(data.managedCareEnabled ?? null);
    } catch (err) {
      console.error('[Certifications] Failed to fetch needs-stay list:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [facilityName, orgSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { items, managedCareEnabled, loading, refetch: fetchData };
}
