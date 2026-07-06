import { useState, useEffect, useCallback } from 'preact/hooks';
import { unwrap } from '../utils/api.js';

/** Namespaced dismissal kinds the backend accepts (shared resident_dismissals table). */
export const FL_QIP_PROGNOSIS_KIND = 'fl_qip:prognosis';
export const FL_QIP_FLU_KIND = 'fl_qip:flu';

/**
 * useFlQip — Florida QIP Official-vs-Projected + coding-accuracy for the Regional
 * scorecard. Mirrors the web QmFlQipView data flow against the extension routes:
 *
 *   GET    /api/extension/qm-planner/fl-qip-official          → { ...comparison, coding }
 *   PATCH  /api/extension/qm-planner/fl-qip-official          → { ...comparison }  (persist non-MDS inputs)
 *   POST   /api/extension/qm-planner/fl-qip-coding-dismissal  → { coding }         (dismiss)
 *   DELETE /api/extension/qm-planner/fl-qip-coding-dismissal  → { coding }         (undo)
 *
 * Only meaningful for FL facilities — the caller gates on facilityState === 'FL'.
 */
export function useFlQip({ facilityName, orgSlug }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const qs = new URLSearchParams({ facilityName: facilityName || '', orgSlug: orgSlug || '' }).toString();

  useEffect(() => {
    if (!facilityName || !orgSlug) return undefined;
    let live = true;
    setLoading(true);
    setError(false);
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/qm-planner/fl-qip-official?${qs}`,
      options: { method: 'GET' },
    })
      .then((res) => {
        if (!live) return;
        if (res?.success) setData(unwrap(res.data));
        else setError(true);
      })
      .catch(() => { if (live) setError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [facilityName, orgSlug]);

  const call = useCallback(async (endpoint, method, body) => {
    const res = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint,
      options: {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
    });
    if (!res?.success) throw new Error(res?.error || 'Request failed');
    return unwrap(res.data);
  }, []);

  /** Save the non-MDS inputs (partial), replace with the fresh comparison (coding preserved). */
  const saveInputs = useCallback(async (inputs) => {
    const fresh = await call(`/api/extension/qm-planner/fl-qip-official?${qs}`, 'PATCH', inputs);
    setData((prev) => ({ ...(prev || {}), ...fresh }));
    return fresh;
  }, [call, qs]);

  /** Dismiss / undo a coding opportunity; server returns the fresh coding block. */
  const setDismiss = useCallback(async (patientId, kind, dismiss) => {
    const out = await call(`/api/extension/qm-planner/fl-qip-coding-dismissal?${qs}`, dismiss ? 'POST' : 'DELETE', { patientId, kind });
    if (out && out.coding) setData((prev) => (prev ? { ...prev, coding: out.coding } : prev));
    return out;
  }, [call, qs]);

  return { data, setData, loading, error, saveInputs, setDismiss };
}
