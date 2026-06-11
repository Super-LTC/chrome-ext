import { useState, useCallback, useRef } from 'preact/hooks';

/**
 * Build the recommendedIcd10 payload for a query create call.
 *
 * Guarantees a single entry { code, description } with a NON-EMPTY
 * description whenever any code is resolvable — this is what makes the
 * physician sign-portal's code picker pre-populate so the query is signable.
 * An empty recommendedIcd10 is a silent dead-end (created+sent but unsignable),
 * so we exhaust every description source and finally fall back to the code
 * string itself rather than ever emitting an empty description.
 */
function buildRecommendedIcd10(item, icd10Code, preferredIcd10) {
  const descFor = (code) =>
    (preferredIcd10 && preferredIcd10.code === code ? preferredIcd10.description : '') ||
    (item.recommendedIcd10 || []).find(x => x.code === code)?.description ||
    item.mdsItemName || item.description || code;

  if (icd10Code) {
    return [{ code: icd10Code, description: descFor(icd10Code) }];
  }
  // No single resolved code — fall back to the item's own list, but still
  // ensure each entry has a non-empty description.
  return (item.recommendedIcd10 || [])
    .filter(x => x && x.code)
    .map(x => ({ code: x.code, description: x.description || item.mdsItemName || x.code }));
}

/**
 * Batch query state machine hook
 * States: idle → generating → reviewing → sending → complete
 *
 * Flow:
 *   generate()  — only calls generateNote, collects AI-written notes
 *   (review)    — user edits notes, picks practitioner
 *   sendAll()   — creates queries via createQuery, then sends via sendQuery
 *
 * @param {Object} params
 * @param {string} params.patientId
 * @param {string} params.facilityName
 * @param {string} params.orgSlug
 * @param {string} params.assessmentId
 * @param {Function} params.onComplete - Called after all queries sent successfully
 */
export function useBatchQuery({ patientId, facilityName, orgSlug, assessmentId, onComplete }) {
  const [state, setState] = useState('idle'); // idle, generating, reviewing, sending, complete
  const [generatedQueries, setGeneratedQueries] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const abortRef = useRef(false);

  /**
   * Generate AI notes for selected items (no queries created yet)
   * @param {Array} selectedItems - Items to generate notes for
   */
  const generate = useCallback(async (selectedItems) => {
    if (selectedItems.length === 0) return;

    setState('generating');
    setError(null);
    setProgress({ current: 0, total: selectedItems.length });
    abortRef.current = false;

    const results = [];

    try {
      // Fetch practitioners in parallel with note generation
      const practitionersPromise = window.QueryAPI.fetchPractitioners(facilityName, orgSlug);

      // Generate notes sequentially to avoid rate limiting
      for (let i = 0; i < selectedItems.length; i++) {
        if (abortRef.current) break;

        const item = selectedItems[i];
        const itemName = item.pdpmCategoryName || item.mdsItemName || item.mdsItem;
        setProgress({ current: i, total: selectedItems.length, currentItemName: itemName });

        try {
          // Generate AI note only — no query creation yet
          const noteData = await window.QueryAPI.generateNote(
            item.mdsItem,
            item
          );

          results.push({
            item,
            noteText: noteData.note,
            preferredIcd10: noteData.preferredIcd10,
            icd10Options: noteData.icd10Options
          });
        } catch (err) {
          console.error(`[BatchQuery] Failed to generate note for ${item.mdsItem}:`, err);
          results.push({
            item,
            noteText: '',
            error: err.message
          });
        }
      }

      setProgress({ current: selectedItems.length, total: selectedItems.length });

      // Wait for practitioners
      try {
        const practList = await practitionersPromise;
        setPractitioners(practList);
      } catch (err) {
        console.error('[BatchQuery] Failed to fetch practitioners:', err);
        setPractitioners([]);
      }

      // Filter out items that failed note generation entirely
      const successfulResults = results.filter(r => r.noteText);
      setGeneratedQueries(successfulResults);

      if (successfulResults.length === 0) {
        setError('Failed to generate any notes. Please try again.');
        setState('idle');
      } else {
        setState('reviewing');
      }
    } catch (err) {
      console.error('[BatchQuery] Generation failed:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'batch_query_generate',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message);
      setState('idle');
    }
  }, [patientId, facilityName, orgSlug, assessmentId]);

  /**
   * Update the note text for a specific item (by mdsItem code)
   */
  const updateNote = useCallback((mdsItem, newNote) => {
    setGeneratedQueries(prev =>
      prev.map(gq =>
        gq.item.mdsItem === mdsItem ? { ...gq, noteText: newNote } : gq
      )
    );
  }, []);

  /**
   * Update the selected ICD-10 code for a specific item
   */
  const updateIcd10 = useCallback((mdsItem, icd10Code) => {
    setGeneratedQueries(prev =>
      prev.map(gq =>
        gq.item.mdsItem === mdsItem ? { ...gq, selectedIcd10: icd10Code } : gq
      )
    );
  }, []);

  /**
   * Create and send all queries to the selected practitioner
   */
  const sendAll = useCallback(async () => {
    if (!selectedPractitionerId || generatedQueries.length === 0) return;

    setState('sending');
    setError(null);
    setProgress({ current: 0, total: generatedQueries.length });
    abortRef.current = false;

    const sentQueries = [];

    try {
      for (let i = 0; i < generatedQueries.length; i++) {
        if (abortRef.current) break;

        const { item, noteText, selectedIcd10, preferredIcd10 } = generatedQueries[i];
        setProgress({ current: i, total: generatedQueries.length });

        // Resolve the code to seed. Fall back to the source row code
        // (item.icd10Code) so we ALWAYS have a code even when note
        // generation returned no preferredIcd10 (thin evidence).
        const icd10Code = selectedIcd10 || preferredIcd10?.code || item.icd10Code || null;
        // HARD REQUIREMENT: recommendedIcd10 must carry a single code with a
        // NON-EMPTY description, otherwise the physician sign-portal's code
        // picker comes up empty and the query is created+sent but impossible
        // to sign (silent dead-end). Seed the description from the strongest
        // source available; never ship an empty recommendedIcd10.
        const recommendedIcd10 = buildRecommendedIcd10(item, icd10Code, preferredIcd10);

        try {
          // Step 1: Create the query
          const { query } = await window.QueryAPI.createQuery({
            patientId,
            facilityName,
            orgSlug,
            mdsAssessmentId: assessmentId,
            mdsItem: item.mdsItem,
            mdsItemName: item.pdpmCategoryName || item.mdsItemName || item.mdsItem,
            queryReason: item.rationale || '',
            keyFindings: item.keyFindings || [],
            queryEvidence: item.queryEvidence || item.evidence || [],
            recommendedIcd10,
            aiGeneratedNote: noteText
          });

          // Step 2: Send to practitioner
          await window.QueryAPI.sendQuery(
            query.id,
            [selectedPractitionerId],
            noteText
          );

          sentQueries.push({ ...query, mdsItem: item.mdsItem });
        } catch (err) {
          console.error(`[BatchQuery] Failed to create/send query for ${item.mdsItem}:`, err);
          window.SuperAnalytics?.track?.('error_caught', {
            surface: 'batch_query_send_item',
            error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
          });
        }
      }

      setProgress({ current: generatedQueries.length, total: generatedQueries.length });
      setState('complete');

      if (onComplete) {
        const practitioner = practitioners.find(
          p => String(p.id ?? p.practitionerId ?? p.personId) === String(selectedPractitionerId)
        );
        const practitionerName = practitioner
          ? (practitioner.firstName && practitioner.lastName
            ? `${practitioner.firstName} ${practitioner.lastName}${practitioner.title ? `, ${practitioner.title}` : ''}`
            : practitioner.name || 'Provider')
          : 'Provider';
        onComplete(sentQueries, practitionerName);
      }
    } catch (err) {
      console.error('[BatchQuery] Send failed:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'batch_query_send',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message);
      setState('reviewing');
    }
  }, [patientId, facilityName, orgSlug, assessmentId, generatedQueries, selectedPractitionerId, practitioners, onComplete]);

  /**
   * Create queries (without sending) and download a print-preview PDF for each.
   * Mirrors sendAll but swaps the send step for printQueryPdf.
   */
  const printAll = useCallback(async () => {
    if (generatedQueries.length === 0) return;

    setState('sending'); // reuse sending state so the progress UI shows
    setError(null);
    setProgress({ current: 0, total: generatedQueries.length, label: 'printing' });
    abortRef.current = false;

    let printed = 0;
    let lastError = null;

    try {
      for (let i = 0; i < generatedQueries.length; i++) {
        if (abortRef.current) break;

        const { item, noteText, selectedIcd10, preferredIcd10 } = generatedQueries[i];
        setProgress({ current: i, total: generatedQueries.length, label: 'printing' });

        const icd10Code = selectedIcd10 || preferredIcd10?.code || item.icd10Code || null;
        const recommendedIcd10 = buildRecommendedIcd10(item, icd10Code, preferredIcd10);
        const icd10Description = recommendedIcd10[0]?.description || '';

        try {
          // Step 1: create the query so we have an id
          const { query } = await window.QueryAPI.createQuery({
            patientId,
            facilityName,
            orgSlug,
            mdsAssessmentId: assessmentId,
            mdsItem: item.mdsItem,
            mdsItemName: item.pdpmCategoryName || item.mdsItemName || item.mdsItem,
            queryReason: item.rationale || '',
            keyFindings: item.keyFindings || [],
            queryEvidence: item.queryEvidence || item.evidence || [],
            recommendedIcd10,
            aiGeneratedNote: noteText
          });

          // Step 2: trigger the print-preview PDF download
          const topic = String(item.mdsItem || 'query')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
          const filename = `query-${topic}-${String(query.id).slice(0, 8)}.pdf`;

          await window.QueryAPI.printQueryPdf(query.id, {
            code: icd10Code || '',
            description: icd10Description,
            filename
          });
          printed++;
        } catch (err) {
          lastError = err;
          console.error(`[BatchQuery] Failed to print query for ${item.mdsItem}:`, err);
          window.SuperAnalytics?.track?.('error_caught', {
            surface: 'batch_query_print_item',
            error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
          });
        }
      }

      setProgress({ current: generatedQueries.length, total: generatedQueries.length, label: 'printing' });
      setState('reviewing'); // return to review state — user may still want to send

      if (printed > 0) {
        window.SuperToast?.success?.(
          printed === 1 ? 'Print preview downloaded' : `${printed} print previews downloaded`
        );
      } else if (lastError) {
        setError(lastError.message);
        window.SuperToast?.error?.(`Failed to print: ${lastError.message}`);
      }
    } catch (err) {
      console.error('[BatchQuery] Print failed:', err);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'batch_query_print',
        error_code: (window.SuperAnalytics?.toErrorCode?.(err) ?? 'unknown'),
        error_type: 'api_error',
      });
      setError(err.message);
      setState('reviewing');
    }
  }, [patientId, facilityName, orgSlug, assessmentId, generatedQueries]);

  /**
   * Go back from reviewing to idle
   */
  const backToSelection = useCallback(() => {
    setState('idle');
    setGeneratedQueries([]);
    setProgress({ current: 0, total: 0 });
  }, []);

  /**
   * Reset everything
   */
  const reset = useCallback(() => {
    setState('idle');
    setGeneratedQueries([]);
    setPractitioners([]);
    setSelectedPractitionerId(null);
    setProgress({ current: 0, total: 0 });
    setError(null);
    abortRef.current = false;
  }, []);

  /**
   * Abort current operation
   */
  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    state,
    generatedQueries,
    practitioners,
    selectedPractitionerId,
    setSelectedPractitionerId,
    progress,
    error,
    generate,
    updateNote,
    updateIcd10,
    sendAll,
    printAll,
    backToSelection,
    reset,
    abort
  };
}
