// Section Transformers for Super LTC Chrome Extension
// Transforms API responses to overlay format for each MDS section

/**
 * Classify *why* a column landed on needs_review, so the overlay can show a
 * calm informational badge instead of a yellow "take a look" nag for the cases
 * that don't actually need the nurse's judgement.
 *
 * Currently detects ONE reason: `ordered_not_administered` — there's a relevant
 * ORDER in the lookback but no administration record (e.g. a PRN oxygen order
 * never given). That's the AI explaining why it isn't coding, not a question.
 *
 * Heuristic over data the solver already persisted (no re-run needed):
 *   needs_review  AND  no firstAdministered/lastAdministered  AND
 *   (an order in the evidence  OR  rationale that explicitly says "order, no admin").
 * Returns null for every other needs_review (those stay normal yellow), and for
 * sections that don't carry order/administration evidence (safe no-op).
 *
 * NOTE: this is a heuristic on existing data. The bulletproof version is the
 * solver emitting an explicit `reviewReason` — when that lands, prefer it:
 *   columnData.reviewReason || deriveReviewReason(columnData)
 */
function deriveReviewReason(columnData) {
  if (!columnData) return null;
  if (columnData.reviewReason) return columnData.reviewReason; // server-provided wins
  const answer = String(columnData.answer ?? '').toLowerCase();
  const isReview = answer === 'needs_review' || columnData.status === 'needs_review';
  if (!isReview) return null;

  const hasAdministration = !!(columnData.firstAdministered || columnData.lastAdministered);
  if (hasAdministration) return null;

  const evidence = Array.isArray(columnData.evidence) ? columnData.evidence : [];
  const hasOrderEvidence = evidence.some(
    (e) => String(e?.sourceType ?? '').toLowerCase() === 'order'
  );
  const rationale = String(columnData.rationale ?? '').toLowerCase();
  const rationaleSaysOrderNoAdmin =
    /\border\b/.test(rationale) &&
    /(no admin|not administered|no administration|without admin|insufficient to code)/.test(rationale);

  return hasOrderEvidence || rationaleSaysOrderNoAdmin ? 'ordered_not_administered' : null;
}

/**
 * Transform Section O API response to overlay format
 */
function transformSectionO(results) {
  const items = [];

  console.log('Super LTC: transformSectionO called with keys:', Object.keys(results || {}));

  // New flat format: results.items[] with columns as object keyed by column letter
  if (results.items && Array.isArray(results.items)) {
    console.log('Super LTC: Found results.items:', results.items.length);
    results.items.forEach(item => {
      if (item.columns) {
        Object.entries(item.columns).forEach(([column, columnData]) => {
          console.log(`Super LTC: >> Adding ${item.mdsItem} col ${column}`);
          items.push({
            mdsItem: item.mdsItem,
            description: item.description || getSectionODescription(item.mdsItem),
            columns: {
              [column]: {
                answer: columnData.answer,
                confidence: columnData.confidence,
                rationale: columnData.rationale,
                evidenceCount: columnData.evidenceCount || 0,
                reviewReason: deriveReviewReason(columnData),
                userDecision: columnData.userDecision || null
              }
            }
          });
        });
      }
    });
  }

  // Legacy format: sectionO.items with comparisons
  if (results.sectionO?.items) {
    console.log('Super LTC: Found sectionO.items:', results.sectionO.items.length);
    results.sectionO.items.forEach(item => {
      if (item.comparisons) {
        item.comparisons.forEach(comparison => {
          const columnData = item.columns?.[comparison.column];
          if (columnData) {
            items.push({
              mdsItem: item.mdsItem,
              description: item.description || getSectionODescription(item.mdsItem),
              columns: {
                [comparison.column]: {
                  answer: columnData.answer,
                  confidence: columnData.confidence,
                  rationale: columnData.rationale,
                  evidenceCount: columnData.evidenceCount || 0,
                  reviewReason: deriveReviewReason(columnData),
                  userDecision: columnData.userDecision || null
                }
              }
            });
          }
        });
      }
    });
  }

  // Legacy format: immunization items (O0250, O0300, O0350)
  if (results.sectionOImmunizations?.comparisons) {
    console.log('Super LTC: Found immunization comparisons:', results.sectionOImmunizations.comparisons.length);
    results.sectionOImmunizations.comparisons.forEach(comparison => {
      items.push({
        mdsItem: comparison.questionCode,
        description: comparison.questionLabel || getSectionODescription(comparison.questionCode),
        columns: {
          '': {
            answer: comparison.solvedAnswer,
            confidence: comparison.confidence,
            rationale: comparison.rationale,
            evidenceCount: comparison.evidenceCount || 0,
            userDecision: comparison.userDecision || null
          }
        }
      });
    });
  }

  console.log('Super LTC: transformSectionO returning', items.length, 'items');
  return { items };
}

// Helper: Section O MDS item descriptions
function getSectionODescription(mdsItem) {
  const descriptions = {
    'O0110A1': 'Chemotherapy',
    'O0110B1': 'Radiation',
    'O0110C1': 'Oxygen Therapy',
    'O0110D1': 'Suctioning',
    'O0110E1': 'Tracheostomy Care',
    'O0110F1': 'Invasive Mechanical Ventilator',
    'O0110G1': 'Non-invasive Mechanical Ventilator',
    'O0110H1': 'IV Medications',
    'O0110I1': 'Transfusions',
    'O0110J1': 'Dialysis',
    'O0110K1': 'Hospice Care',
    'O0110L1': 'Respite Care',
    'O0110M1': 'Isolation/Quarantine for Infectious Disease',
    'O0110N1': 'Physician Examining',
    'O0110O1': 'IV Access',
    'O0250A': 'Influenza Vaccine Received',
    'O0250C': 'Reason Influenza Vaccine Not Received',
    'O0300A': 'Pneumococcal Vaccine Up to Date',
    'O0300B': 'Reason Pneumococcal Vaccine Not Up to Date',
    'O0350': 'COVID-19 Vaccine Up to Date'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section K API response to overlay format
 * K has individual properties (k0100, k0200, etc.) instead of items array
 */
function transformSectionK(results) {
  const items = [];
  const sectionData = results.sectionK || results;

  // K0100: Swallowing Disorder (subItems A-D, Z)
  // Note: Use empty string as column key so element lookup is K0100A_wrapper, not K0100AA_wrapper
  if (sectionData.k0100) {
    const k0100 = sectionData.k0100;
    // Each subItem becomes a separate overlay item
    Object.entries(k0100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `K0100${subItem}`,
        description: getK0100Description(subItem),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            userDecision: data.userDecision || null
          }
        }
      });
    });
  }

  // K0200: Height and Weight (special - numeric values)
  // Note: Use empty string as column key so element lookup is K0200A_wrapper, not K0200AA_wrapper
  if (sectionData.k0200) {
    const k0200 = sectionData.k0200;
    // Height
    if (k0200.heightInInches !== null) {
      items.push({
        mdsItem: 'K0200A',
        description: 'Height (in inches)',
        columns: {
          '': {
            answer: String(k0200.heightRounded || k0200.heightInInches),
            confidence: 'high',
            rationale: `Height: ${k0200.heightInInches} inches`,
            evidence: k0200.heightEvidence ? [k0200.heightEvidence] : []
          }
        }
      });
    }
    // Weight
    if (k0200.weightInPounds !== null) {
      items.push({
        mdsItem: 'K0200B',
        description: 'Weight (in pounds)',
        columns: {
          '': {
            answer: String(k0200.weightRounded || k0200.weightInPounds),
            confidence: 'high',
            rationale: `Weight: ${k0200.weightInPounds} pounds`,
            evidence: k0200.weightEvidence ? [k0200.weightEvidence] : []
          }
        }
      });
    }
  }

  // K0300: Weight Loss
  // Note: Use empty string as column key so element lookup is K0300_wrapper
  if (sectionData.k0300) {
    items.push({
      mdsItem: 'K0300',
      description: 'Weight Loss',
      columns: {
        '': {
          answer: sectionData.k0300.answer,
          confidence: sectionData.k0300.confidence,
          rationale: sectionData.k0300.rationale,
          evidence: sectionData.k0300.evidence ? [sectionData.k0300.evidence] : []
        }
      }
    });
  }

  // K0310: Weight Gain (not on IPA)
  // Note: Use empty string as column key so element lookup is K0310_wrapper
  if (sectionData.k0310) {
    items.push({
      mdsItem: 'K0310',
      description: 'Weight Gain',
      columns: {
        '': {
          answer: sectionData.k0310.answer,
          confidence: sectionData.k0310.confidence,
          rationale: sectionData.k0310.rationale,
          evidence: sectionData.k0310.evidence ? [sectionData.k0310.evidence] : []
        }
      }
    });
  }

  // K0520: Nutritional Approaches (items A-D, Z with columns 1-4)
  if (sectionData.k0520) {
    Object.entries(sectionData.k0520.items || {}).forEach(([itemKey, itemData]) => {
      // Each K0520 item has columns 1, 2, 3, 4
      const columns = {};
      Object.entries(itemData.columns || {}).forEach(([colNum, colData]) => {
        // Map column numbers to letters for consistency (1->A, 2->B, etc.)
        // Or keep as numbers - let's keep as numbers since that's how K0520 works
        columns[colNum] = {
          answer: colData.answer,
          confidence: colData.confidence,
          rationale: colData.rationale,
          evidenceCount: colData.evidenceCount || 0
        };
      });

      items.push({
        mdsItem: `K0520${itemKey}`,
        description: getK0520Description(itemKey),
        columns: columns
      });
    });
  }

  // K0710: Percent Intake (only if triggered)
  if (sectionData.k0710 && sectionData.k0710.triggered) {
    // K0710 has columns 2 and 3, each with A (percent) and B (fluid intake)
    Object.entries(sectionData.k0710.columns || {}).forEach(([colNum, colData]) => {
      if (colData.A) {
        items.push({
          mdsItem: `K0710A`,
          description: `Percent Intake (Column ${colNum})`,
          columns: {
            [colNum]: {
              answer: String(colData.A.percent),
              confidence: colData.A.confidence,
              rationale: colData.A.rationale,
              evidenceCount: 0
            }
          }
        });
      }
    });
  }

  return { items };
}

// Helper: K0100 sub-item descriptions
function getK0100Description(subItem) {
  const descriptions = {
    A: 'Loss of liquids/solids from mouth',
    B: 'Holding food in mouth/cheeks',
    C: 'Coughing/choking during meals',
    D: 'Complaints of difficulty swallowing',
    Z: 'None of the above'
  };
  return descriptions[subItem] || `Swallowing (${subItem})`;
}

// Helper: K0520 item descriptions
function getK0520Description(itemKey) {
  const descriptions = {
    A: 'Parenteral/IV Feeding',
    B: 'Feeding Tube',
    C: 'Mechanically Altered Diet',
    D: 'Therapeutic Diet',
    Z: 'None of the Above'
  };
  return descriptions[itemKey] || `Nutritional Approach (${itemKey})`;
}

/**
 * Transform Section I API response to overlay format
 * Section I - Active Diagnoses
 * Path: run.results.sectionI.items
 */
function transformSectionI(results, itemSummaries) {
  const items = [];
  const sectionIData = results.sectionI?.items || results.items || {};
  const summaries = itemSummaries || {};

  Object.entries(sectionIData).forEach(([mdsItem, data]) => {
    // Skip items with no recommendation (dont_code with no evidence)
    // But include items that need coding or physician query
    if (data.status === 'dont_code' && data.confidence !== 'low') {
      // Still include dont_code items so we can show mismatches
    }

    // Merge per-item summaries from itemSummaries (Dx/Tx live there, not on each item)
    const itemSummary = summaries[mdsItem] || {};

    items.push({
      mdsItem: mdsItem,
      description: getSectionIDescription(mdsItem),
      columns: {
        '': {
          answer: data.answer,
          confidence: data.confidence || 'medium',
          rationale: data.rationale || '',
          evidenceCount: data.evidenceCount || 0,
          status: data.status, // code, needs_physician_query, dont_code
          triggers: data.triggers, // for needs_physician_query items
          suggestedIcd10: data.suggestedIcd10,
          // Query-related fields for needs_physician_query items
          mdsItemName: data.kbCategory?.categoryName || getSectionIDescription(mdsItem),
          queryReason: data.queryReason || '',
          keyFindings: data.keyFindings || [],
          queryEvidenceCount: data.queryEvidenceCount || 0,
          recommendedIcd10: data.recommendedIcd10 || data.suggestedIcd10 || [],
          aiGeneratedNote: data.aiGeneratedNote || '',
          // Step summaries — check item-level first, then itemSummaries lookup
          diagnosisSummary: data.diagnosisSummary || itemSummary.diagnosisSummary || null,
          treatmentSummary: data.treatmentSummary || itemSummary.treatmentSummary || null,
          diagnosisPassed: data.validation?.diagnosisPassed ?? data.diagnosisPassed ?? itemSummary.diagnosisPassed ?? null,
          activeStatusPassed: data.validation?.activeStatusPassed ?? data.activeStatusPassed ?? data.treatmentPassed ?? itemSummary.activeStatusPassed ?? itemSummary.treatmentPassed ?? null,
          // User decision (agree/disagree) from server
          userDecision: data.userDecision || null
        }
      }
    });
  });

  return { items };
}

/**
 * Transform Section E API response to overlay format
 * Section E - Behavior
 * Path: run.results (e0100, e0200, e0300, etc.)
 */
function transformSectionE(results) {
  const items = [];
  const sectionData = results.sectionE || results;

  // E0100: Potential Indicators of Psychosis (subItems A, B, Z)
  if (sectionData.e0100) {
    Object.entries(sectionData.e0100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `E0100${subItem}`,
        description: getSectionEDescription(`E0100${subItem}`),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0
          }
        }
      });
    });
  }

  // E0200: Behavioral Symptoms - Frequency (subItems A, B, C with frequencyCode)
  if (sectionData.e0200) {
    Object.entries(sectionData.e0200.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `E0200${subItem}`,
        description: getSectionEDescription(`E0200${subItem}`),
        columns: {
          '': {
            answer: String(data.frequencyCode),
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            distinctDates: data.distinctDates
          }
        }
      });
    });
  }

  // E0300: Overall Presence of Behavioral Symptoms (derived)
  if (sectionData.e0300) {
    items.push({
      mdsItem: 'E0300',
      description: getSectionEDescription('E0300'),
      columns: {
        '': {
          answer: String(sectionData.e0300.answer),
          confidence: 'high',
          rationale: sectionData.e0300.rationale,
          evidenceCount: 0
        }
      }
    });
  }

  // E0500: Impact on Resident
  if (sectionData.e0500 && !sectionData.e0500.skipped) {
    items.push({
      mdsItem: 'E0500',
      description: getSectionEDescription('E0500'),
      columns: {
        '': {
          answer: sectionData.e0500.answer,
          confidence: sectionData.e0500.confidence,
          rationale: sectionData.e0500.rationale,
          evidenceCount: sectionData.e0500.evidenceCount || 0
        }
      }
    });
  }

  // E0600: Impact on Others
  if (sectionData.e0600 && !sectionData.e0600.skipped) {
    items.push({
      mdsItem: 'E0600',
      description: getSectionEDescription('E0600'),
      columns: {
        '': {
          answer: sectionData.e0600.answer,
          confidence: sectionData.e0600.confidence,
          rationale: sectionData.e0600.rationale,
          evidenceCount: sectionData.e0600.evidenceCount || 0
        }
      }
    });
  }

  // E0800: Rejection of Care (frequencyCode)
  if (sectionData.e0800) {
    items.push({
      mdsItem: 'E0800',
      description: getSectionEDescription('E0800'),
      columns: {
        '': {
          answer: String(sectionData.e0800.frequencyCode),
          confidence: sectionData.e0800.confidence,
          rationale: sectionData.e0800.rationale,
          evidenceCount: sectionData.e0800.evidenceCount || 0,
          distinctDates: sectionData.e0800.distinctDates
        }
      }
    });
  }

  // E0900: Wandering (frequencyCode)
  if (sectionData.e0900) {
    items.push({
      mdsItem: 'E0900',
      description: getSectionEDescription('E0900'),
      columns: {
        '': {
          answer: String(sectionData.e0900.frequencyCode),
          confidence: sectionData.e0900.confidence,
          rationale: sectionData.e0900.rationale,
          evidenceCount: sectionData.e0900.evidenceCount || 0,
          distinctDates: sectionData.e0900.distinctDates
        }
      }
    });
  }

  // E1000: Wandering Impact (subItems A, B)
  if (sectionData.e1000 && !sectionData.e1000.skipped) {
    Object.entries(sectionData.e1000.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `E1000${subItem}`,
        description: getSectionEDescription(`E1000${subItem}`),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0
          }
        }
      });
    });
  }

  // E1100: Change in Behavior Symptoms (changeCode, 90-day lookback)
  if (sectionData.e1100 && !sectionData.e1100.skipped) {
    items.push({
      mdsItem: 'E1100',
      description: getSectionEDescription('E1100'),
      columns: {
        '': {
          answer: String(sectionData.e1100.changeCode),
          confidence: sectionData.e1100.confidence,
          rationale: sectionData.e1100.rationale,
          evidenceCount: sectionData.e1100.evidenceCount || 0
        }
      }
    });
  }

  return { items };
}

// Helper: Section E MDS item descriptions
function getSectionEDescription(mdsItem) {
  const descriptions = {
    'E0100A': 'Hallucinations',
    'E0100B': 'Delusions',
    'E0100Z': 'None of the above (Psychosis)',
    'E0200A': 'Physical behavioral symptoms',
    'E0200B': 'Verbal behavioral symptoms',
    'E0200C': 'Other behavioral symptoms',
    'E0300': 'Overall presence of behavioral symptoms',
    'E0500': 'Impact on resident',
    'E0600': 'Impact on others',
    'E0800': 'Rejection of care',
    'E0900': 'Wandering',
    'E1000A': 'Wandering - places at risk',
    'E1000B': 'Wandering - intrudes on others',
    'E1100': 'Change in behavior symptoms'
  };
  return descriptions[mdsItem] || mdsItem;
}

// Helper: Section I MDS item descriptions
function getSectionIDescription(mdsItem) {
  const descriptions = {
    'I2100': 'Septicemia',
    'I2500': 'Wound Infection',
    'I2900': 'Diabetes Mellitus',
    'I5600': 'Malnutrition',
    'I1100': 'Cirrhosis',
    'I1700': 'MDRO',
    'I2000': 'Pneumonia',
    'I4300': 'Aphasia',
    'I6200': 'Asthma/COPD',
    'I6300': 'Respiratory Failure'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section M API response to overlay format
 * Section M - Skin Conditions
 * Path: run.results.comparisons (flat at root, not wrapped)
 */
function transformSectionM(results) {
  const items = [];
  const comparisons = results.comparisons || [];

  comparisons.forEach(comparison => {
    const supporting = Array.isArray(comparison.supportingWounds) ? comparison.supportingWounds : [];
    const evidence = supporting.map(sw => {
      const woundDescriptor = [sw.woundType, sw.location && `at ${sw.location}`, sw.stage && `Stage ${sw.stage}`]
        .filter(Boolean).join(' ');
      return {
        quote: sw.quote || woundDescriptor || '',
        displayName: sw.sourceDescription || 'Supporting documentation',
        sourceDate: sw.sourceDate || null,
        sourceType: sw.sourceType || undefined,
        sourceId: sw.sourceId || undefined
      };
    }).filter(ev => ev.quote || ev.displayName);

    const rationale = comparison.rationale
      || `AI recommends: ${comparison.solvedValue}, Currently coded: ${comparison.codedValue || 'not coded'}`;

    items.push({
      mdsItem: comparison.mdsItem,
      description: comparison.mdsLabel || getSectionMDescription(comparison.mdsItem),
      columns: {
        '': {
          answer: comparison.solvedValue,
          confidence: comparison.status === 'match' ? 'high' : 'medium',
          rationale,
          evidence,
          evidenceCount: evidence.length,
          comparisonStatus: comparison.status, // match, mismatch, not_coded, needs_review
          userDecision: comparison.userDecision || null
        }
      }
    });
  });

  return { items };
}

// Helper: Section M MDS item descriptions
function getSectionMDescription(mdsItem) {
  const descriptions = {
    'M0100': 'Determination of Pressure Ulcer Risk',
    'M0150': 'Risk of Pressure Ulcers',
    'M0210A': 'Unhealed Pressure Ulcer Stage 2',
    'M0210B': 'Unhealed Pressure Ulcer Stage 3',
    'M0210C': 'Unhealed Pressure Ulcer Stage 4',
    'M0300A': 'Stage 1 Pressure Ulcers',
    'M0300B': 'Stage 2 Pressure Ulcers',
    'M0300C': 'Stage 3 Pressure Ulcers',
    'M0300D': 'Stage 4 Pressure Ulcers',
    'M0300E': 'Unstageable - Deep Tissue',
    'M0300F': 'Unstageable - Slough/Eschar',
    'M0300G': 'Unstageable - Suspected Deep Tissue',
    'M1030': 'Venous/Arterial Ulcers',
    'M1040': 'Other Skin Conditions'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section N API response to overlay format
 * Section N - Medications
 * Path: run.results (n0300, n0350a, n0350b, n0415, n0450, n2001, n2003, n2005)
 */
function transformSectionN(results) {
  const items = [];
  const sectionData = results.sectionN || results;

  // N0300: Number of days injections received (NUMERIC - day count 0-7)
  if (sectionData.n0300) {
    items.push({
      mdsItem: 'N0300',
      description: getSectionNDescription('N0300'),
      columns: {
        '': {
          answer: String(sectionData.n0300.answer),
          confidence: sectionData.n0300.confidence,
          rationale: sectionData.n0300.rationale,
          evidenceCount: sectionData.n0300.evidenceCount || 0,
          distinctDays: sectionData.n0300.distinctDays,
          injections: sectionData.n0300.injections,
          lookbackWindow: sectionData.n0300.lookbackWindow,
          isNumeric: true
        }
      }
    });
  }

  // N0350A: Insulin injections - days received (NUMERIC - day count 0-7)
  if (sectionData.n0350a) {
    items.push({
      mdsItem: 'N0350A',
      description: getSectionNDescription('N0350A'),
      columns: {
        '': {
          answer: String(sectionData.n0350a.answer),
          confidence: sectionData.n0350a.confidence,
          rationale: sectionData.n0350a.rationale,
          evidenceCount: sectionData.n0350a.evidenceCount || 0,
          distinctDays: sectionData.n0350a.distinctDays,
          insulinInjections: sectionData.n0350a.insulinInjections,
          lookbackWindow: sectionData.n0350a.lookbackWindow,
          isNumeric: true
        }
      }
    });
  }

  // N0350B: Insulin order changes (NUMERIC - day count 0-7)
  if (sectionData.n0350b) {
    items.push({
      mdsItem: 'N0350B',
      description: getSectionNDescription('N0350B'),
      columns: {
        '': {
          answer: String(sectionData.n0350b.answer),
          confidence: sectionData.n0350b.confidence,
          rationale: sectionData.n0350b.rationale,
          evidenceCount: sectionData.n0350b.evidenceCount || 0,
          distinctDays: sectionData.n0350b.distinctDays,
          orderChanges: sectionData.n0350b.orderChanges,
          lookbackWindow: sectionData.n0350b.lookbackWindow,
          isNumeric: true
        }
      }
    });
  }

  // N0415: High-Risk Drug Classes (A-K, Z with columns 1 and 2)
  if (sectionData.n0415) {
    Object.entries(sectionData.n0415).forEach(([drugClass, data]) => {
      if (!data.result) return;

      const col1 = data.result.column1;
      const col2 = data.result.column2;

      // Column 1: Was the medication taken?
      if (col1) {
        items.push({
          mdsItem: `N0415${drugClass}`,
          description: `${data.description || getSectionNDescription(`N0415${drugClass}`)}`,
          columns: {
            '1': {
              answer: col1.answer,
              confidence: col1.confidence,
              rationale: col1.rationale,
              evidenceCount: 0,
              // Forward an EXPLICIT solver-provided reason only (no heuristic for N —
              // its payload lacks the order/admin evidence to derive one safely).
              // The N solver sets 'ordered_not_administered' when meds in this class
              // were ordered but never given in the lookback → calm info badge.
              reviewReason: col1.reviewReason || null,
              medicationsTaken: col1.medicationsTaken,
              // Drug names that were ordered-but-not-given (answer stays 'no'); shown
              // as "Ordered, not given: <drug>" so the nurse sees why we coded No.
              medicationsOrderedNotGiven: col1.medicationsOrderedNotGiven || []
            }
          }
        });
      }

      // Column 2: Documented indication? (only if col1 is yes)
      if (col2 && col1?.answer === 'yes') {
        items.push({
          mdsItem: `N0415${drugClass}`,
          description: `${data.description || getSectionNDescription(`N0415${drugClass}`)} - Indication`,
          columns: {
            '2': {
              answer: col2.answer,
              confidence: col2.confidence,
              rationale: col2.rationale,
              evidenceCount: 0,
              reviewReason: col2.reviewReason || null, // explicit solver reason only (see col 1)
              medicationsWithIndication: col2.medicationsWithIndication
            }
          }
        });
      }
    });
  }

  // N0450: Antipsychotic Medication Review
  if (sectionData.n0450) {
    // N0450A: Was antipsychotic received?
    if (sectionData.n0450.n0450a) {
      items.push({
        mdsItem: 'N0450A',
        description: getSectionNDescription('N0450A'),
        columns: {
          '': {
            answer: String(sectionData.n0450.n0450a.answer),
            confidence: sectionData.n0450.n0450a.confidence,
            rationale: sectionData.n0450.n0450a.rationale,
            evidenceCount: sectionData.n0450.n0450a.evidenceCount || 0,
            routineMedications: sectionData.n0450.n0450a.routineMedications,
            prnMedications: sectionData.n0450.n0450a.prnMedications
          }
        }
      });
    }

    // N0450B: GDR attempted?
    if (sectionData.n0450.n0450b) {
      items.push({
        mdsItem: 'N0450B',
        description: getSectionNDescription('N0450B'),
        columns: {
          '': {
            answer: String(sectionData.n0450.n0450b.answer),
            confidence: sectionData.n0450.n0450b.confidence,
            rationale: sectionData.n0450.n0450b.rationale,
            evidenceCount: sectionData.n0450.n0450b.evidenceCount || 0,
            gdrDate: sectionData.n0450.n0450b.gdrDate
          }
        }
      });
    }

    // N0450C: Date of last GDR attempt
    if (sectionData.n0450.n0450c) {
      items.push({
        mdsItem: 'N0450C',
        description: getSectionNDescription('N0450C'),
        columns: {
          '': {
            answer: sectionData.n0450.n0450c,
            confidence: 'high',
            rationale: `Last GDR attempt: ${sectionData.n0450.n0450c}`,
            evidenceCount: 0
          }
        }
      });
    }
  }

  // N2001: Drug Regimen Review (5-Day PPS only)
  if (sectionData.n2001) {
    items.push({
      mdsItem: 'N2001',
      description: getSectionNDescription('N2001'),
      columns: {
        '': {
          answer: String(sectionData.n2001.answer),
          confidence: sectionData.n2001.confidence,
          rationale: sectionData.n2001.rationale,
          evidenceCount: sectionData.n2001.evidenceCount || 0,
          issuesFound: sectionData.n2001.issuesFound
        }
      }
    });
  }

  // N2003: Medication Follow-up (only if N2001 = 1)
  if (sectionData.n2003) {
    items.push({
      mdsItem: 'N2003',
      description: getSectionNDescription('N2003'),
      columns: {
        '': {
          answer: String(sectionData.n2003.answer),
          confidence: sectionData.n2003.confidence,
          rationale: sectionData.n2003.rationale,
          evidenceCount: sectionData.n2003.evidenceCount || 0,
          physicianContacted: sectionData.n2003.physicianContacted,
          contactDate: sectionData.n2003.contactDate
        }
      }
    });
  }

  // N2005: Medication Intervention (PPS Discharge only)
  if (sectionData.n2005) {
    items.push({
      mdsItem: 'N2005',
      description: getSectionNDescription('N2005'),
      columns: {
        '': {
          answer: String(sectionData.n2005.answer),
          confidence: sectionData.n2005.confidence,
          rationale: sectionData.n2005.rationale,
          evidenceCount: sectionData.n2005.evidenceCount || 0,
          issueEvents: sectionData.n2005.issueEvents
        }
      }
    });
  }

  return { items };
}

// Helper: Section N MDS item descriptions
function getSectionNDescription(mdsItem) {
  const descriptions = {
    'N0300': 'Number of days injections received',
    'N0350A': 'Insulin injections - days received',
    'N0350B': 'Insulin - orders changed',
    'N0415A': 'Antipsychotic',
    'N0415B': 'Antianxiety',
    'N0415C': 'Antidepressant',
    'N0415D': 'Hypnotic',
    'N0415E': 'Anticoagulant',
    'N0415F': 'Antibiotic',
    'N0415G': 'Diuretic',
    'N0415H': 'Opioid',
    'N0415I': 'Antiplatelet',
    'N0415J': 'Hypoglycemic',
    'N0415K': 'Anticonvulsant',
    'N0415Z': 'None of the above',
    'N0450A': 'Antipsychotic medication received',
    'N0450B': 'GDR attempted',
    'N0450C': 'Date of last GDR attempt',
    'N2001': 'Drug regimen review',
    'N2003': 'Medication follow-up',
    'N2005': 'Medication intervention'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section J API response to overlay format
 * Section J - Health Conditions
 * Path: run.results (j0100, j1100, j1300, j1400, j1700, j1800, j1900, j2000)
 */
function transformSectionJ(results) {
  const items = [];
  const sectionData = results.sectionJ || results;

  // J0100: Pain Management (subItems A, B, C - numeric 0/1)
  if (sectionData.j0100) {
    Object.entries(sectionData.j0100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `J0100${subItem}`,
        description: getSectionJDescription(`J0100${subItem}`),
        columns: {
          '': {
            answer: String(data.answer),
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            lookbackWindow: sectionData.j0100.lookbackWindow
          }
        }
      });
    });

    // Include pain medications info if available
    if (sectionData.j0100.painMedications) {
      const scheduled = sectionData.j0100.painMedications.scheduled || [];
      const prn = sectionData.j0100.painMedications.prn || [];
      // This data is available on the j0100A/B items for display
    }
  }

  // J1100: Shortness of Breath (subItems A, B, C, Z)
  if (sectionData.j1100) {
    Object.entries(sectionData.j1100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `J1100${subItem}`,
        description: getSectionJDescription(`J1100${subItem}`),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            lookbackWindow: sectionData.j1100.lookbackWindow
          }
        }
      });
    });
  }

  // J1300: Current Tobacco Use
  if (sectionData.j1300) {
    items.push({
      mdsItem: 'J1300',
      description: getSectionJDescription('J1300'),
      columns: {
        '': {
          answer: String(sectionData.j1300.answer),
          confidence: sectionData.j1300.confidence,
          rationale: sectionData.j1300.rationale,
          evidenceCount: sectionData.j1300.evidenceCount || 0
        }
      }
    });
  }

  // J1400: Prognosis (life expectancy < 6 months)
  if (sectionData.j1400) {
    items.push({
      mdsItem: 'J1400',
      description: getSectionJDescription('J1400'),
      columns: {
        '': {
          answer: String(sectionData.j1400.answer),
          confidence: sectionData.j1400.confidence,
          rationale: sectionData.j1400.rationale,
          evidenceCount: sectionData.j1400.evidenceCount || 0,
          isHospiceEnrolled: sectionData.j1400.isHospiceEnrolled,
          prognosisDocumented: sectionData.j1400.prognosisDocumented
        }
      }
    });
  }

  // J1700: Fall History on Admission (if present)
  if (sectionData.j1700 && !sectionData.j1700.skipped) {
    items.push({
      mdsItem: 'J1700',
      description: getSectionJDescription('J1700'),
      columns: {
        '': {
          answer: String(sectionData.j1700.answer),
          confidence: sectionData.j1700.confidence,
          rationale: sectionData.j1700.rationale,
          evidenceCount: sectionData.j1700.evidenceCount || 0
        }
      }
    });
  }

  // J1800: Any Falls Since Admission
  if (sectionData.j1800) {
    items.push({
      mdsItem: 'J1800',
      description: getSectionJDescription('J1800'),
      columns: {
        '': {
          answer: String(sectionData.j1800.answer),
          confidence: sectionData.j1800.confidence,
          rationale: sectionData.j1800.rationale,
          evidenceCount: 0,
          fallCount: sectionData.j1800.fallCount,
          falls: sectionData.j1800.falls,
          lookbackWindow: sectionData.j1800.lookbackWindow
        }
      }
    });
  }

  // J1900: Number of Falls (subItems A, B, C - only if J1800 > 0)
  if (sectionData.j1900 && !sectionData.j1900.skipped) {
    Object.entries(sectionData.j1900.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `J1900${subItem}`,
        description: getSectionJDescription(`J1900${subItem}`),
        columns: {
          '': {
            answer: String(data.countCode),
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: 0,
            actualCount: data.actualCount,
            falls: data.falls
          }
        }
      });
    });
  }

  // J2000: Prior Surgery (if present)
  if (sectionData.j2000 && !sectionData.j2000.skipped) {
    items.push({
      mdsItem: 'J2000',
      description: getSectionJDescription('J2000'),
      columns: {
        '': {
          answer: String(sectionData.j2000.answer),
          confidence: sectionData.j2000.confidence,
          rationale: sectionData.j2000.rationale,
          evidenceCount: sectionData.j2000.evidenceCount || 0
        }
      }
    });
  }

  return { items };
}

// Helper: Section J MDS item descriptions
function getSectionJDescription(mdsItem) {
  const descriptions = {
    'J0100A': 'Scheduled pain medication regimen',
    'J0100B': 'PRN pain medications received',
    'J0100C': 'Non-medication pain intervention',
    'J1100A': 'Shortness of breath with exertion',
    'J1100B': 'Shortness of breath at rest',
    'J1100C': 'Shortness of breath lying flat',
    'J1100Z': 'None of the above (Dyspnea)',
    'J1300': 'Current tobacco use',
    'J1400': 'Prognosis less than 6 months',
    'J1700': 'Fall history on admission',
    'J1800': 'Any falls since admission',
    'J1900A': 'Falls with no injury',
    'J1900B': 'Falls with injury (not major)',
    'J1900C': 'Falls with major injury',
    'J2000': 'Prior surgery'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section L API response to overlay format
 * Section L - Oral/Dental Status
 * Path: run.results (l0200)
 */
function transformSectionL(results) {
  const items = [];
  const sectionData = results.sectionL || results;

  // L0200: Dental (subItems A-F, Z)
  if (sectionData.l0200) {
    Object.entries(sectionData.l0200.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `L0200${subItem}`,
        description: getSectionLDescription(`L0200${subItem}`),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            lookbackWindow: sectionData.l0200.lookbackWindow
          }
        }
      });
    });
  }

  return { items };
}

// Helper: Section L MDS item descriptions
function getSectionLDescription(mdsItem) {
  const descriptions = {
    'L0200A': 'Broken or loosely fitting dentures',
    'L0200B': 'No natural teeth or tooth fragments',
    'L0200C': 'Abnormal mouth tissue',
    'L0200D': 'Obvious cavity or broken natural teeth',
    'L0200E': 'Inflamed or bleeding gums, loose teeth',
    'L0200F': 'Difficulty with chewing',
    'L0200Z': 'None of the above (Dental)'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section H API response to overlay format
 * Section H - Bladder and Bowel
 * Path: run.results (h0100, h0200, h0300, h0400, h0500, h0600)
 */
function transformSectionH(results) {
  const items = [];
  const sectionData = results.sectionH || results;

  // H0100: Appliances (subItems A-D, Z)
  // A = Indwelling catheter, B = External catheter, C = Ostomy, D = Intermittent cath, Z = None
  if (sectionData.h0100) {
    Object.entries(sectionData.h0100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `H0100${subItem}`,
        description: getSectionHDescription(`H0100${subItem}`),
        columns: {
          '': {
            answer: data.answer,
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            ostomyType: data.ostomyType // For H0100C
          }
        }
      });
    });
  }

  // H0200: Urinary Toileting Program (may be skipped if not applicable)
  if (sectionData.h0200 && !sectionData.h0200.skipped) {
    // H0200A: Trial toileting program attempted
    if (sectionData.h0200.a !== undefined) {
      items.push({
        mdsItem: 'H0200A',
        description: getSectionHDescription('H0200A'),
        columns: {
          '': {
            answer: sectionData.h0200.a.answer,
            confidence: sectionData.h0200.a.confidence,
            rationale: sectionData.h0200.a.rationale,
            evidenceCount: sectionData.h0200.a.evidenceCount || 0
          }
        }
      });
    }
    // H0200B: Response to program
    if (sectionData.h0200.b !== undefined) {
      items.push({
        mdsItem: 'H0200B',
        description: getSectionHDescription('H0200B'),
        columns: {
          '': {
            answer: sectionData.h0200.b.answer,
            confidence: sectionData.h0200.b.confidence,
            rationale: sectionData.h0200.b.rationale,
            evidenceCount: sectionData.h0200.b.evidenceCount || 0
          }
        }
      });
    }
    // H0200C: Current toileting program
    if (sectionData.h0200.c !== undefined) {
      items.push({
        mdsItem: 'H0200C',
        description: getSectionHDescription('H0200C'),
        columns: {
          '': {
            answer: sectionData.h0200.c.answer,
            confidence: sectionData.h0200.c.confidence,
            rationale: sectionData.h0200.c.rationale,
            evidenceCount: sectionData.h0200.c.evidenceCount || 0
          }
        }
      });
    }
  }

  // H0300: Urinary Continence (frequencyCode 0-9)
  if (sectionData.h0300) {
    items.push({
      mdsItem: 'H0300',
      description: getSectionHDescription('H0300'),
      columns: {
        '': {
          answer: String(sectionData.h0300.code),
          confidence: sectionData.h0300.confidence,
          rationale: sectionData.h0300.rationale,
          evidenceCount: sectionData.h0300.evidenceCount || 0,
          incontinenceEpisodeDates: sectionData.h0300.incontinenceEpisodeDates,
          lookbackWindow: sectionData.h0300.lookbackWindow
        }
      }
    });
  }

  // H0400: Bowel Continence (frequencyCode 0-9)
  if (sectionData.h0400) {
    items.push({
      mdsItem: 'H0400',
      description: getSectionHDescription('H0400'),
      columns: {
        '': {
          answer: String(sectionData.h0400.code),
          confidence: sectionData.h0400.confidence,
          rationale: sectionData.h0400.rationale,
          evidenceCount: sectionData.h0400.evidenceCount || 0,
          incontinenceEpisodeDates: sectionData.h0400.incontinenceEpisodeDates,
          lookbackWindow: sectionData.h0400.lookbackWindow
        }
      }
    });
  }

  // H0500: Bowel Toileting Program (may be skipped)
  if (sectionData.h0500 && !sectionData.h0500.skipped) {
    items.push({
      mdsItem: 'H0500',
      description: getSectionHDescription('H0500'),
      columns: {
        '': {
          answer: sectionData.h0500.answer,
          confidence: sectionData.h0500.confidence,
          rationale: sectionData.h0500.rationale,
          evidenceCount: sectionData.h0500.evidenceCount || 0
        }
      }
    });
  }

  // H0600: Bowel Patterns (may be skipped)
  if (sectionData.h0600 && !sectionData.h0600.skipped) {
    items.push({
      mdsItem: 'H0600',
      description: getSectionHDescription('H0600'),
      columns: {
        '': {
          answer: sectionData.h0600.answer,
          confidence: sectionData.h0600.confidence,
          rationale: sectionData.h0600.rationale,
          evidenceCount: sectionData.h0600.evidenceCount || 0
        }
      }
    });
  }

  return { items };
}

// Helper: Section H MDS item descriptions
function getSectionHDescription(mdsItem) {
  const descriptions = {
    'H0100A': 'Indwelling catheter',
    'H0100B': 'External catheter',
    'H0100C': 'Ostomy',
    'H0100D': 'Intermittent catheterization',
    'H0100Z': 'None of the above (Appliances)',
    'H0200A': 'Urinary toileting program attempted',
    'H0200B': 'Response to urinary toileting program',
    'H0200C': 'Current urinary toileting program',
    'H0300': 'Urinary continence',
    'H0400': 'Bowel continence',
    'H0500': 'Bowel toileting program',
    'H0600': 'Bowel patterns'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform Section P API response to overlay format
 * Section P - Restraints
 * Path: run.results (p0100, p0200)
 */
function transformSectionP(results) {
  const items = [];
  const sectionData = results.sectionP || results;

  // P0100: Physical Restraints (subItems A-H with frequencyCode 0-3)
  if (sectionData.p0100) {
    Object.entries(sectionData.p0100.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `P0100${subItem}`,
        description: getSectionPDescription(`P0100${subItem}`),
        columns: {
          '': {
            answer: String(data.frequencyCode),
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            distinctDates: data.distinctDates
          }
        }
      });
    });
  }

  // P0200: Bed Rail for Positioning (subItems A-D, may be skipped)
  if (sectionData.p0200 && !sectionData.p0200.skipped) {
    Object.entries(sectionData.p0200.subItems || {}).forEach(([subItem, data]) => {
      items.push({
        mdsItem: `P0200${subItem}`,
        description: getSectionPDescription(`P0200${subItem}`),
        columns: {
          '': {
            answer: String(data.frequencyCode),
            confidence: data.confidence,
            rationale: data.rationale,
            evidenceCount: data.evidenceCount || 0,
            distinctDates: data.distinctDates
          }
        }
      });
    });
  }

  return { items };
}

// Helper: Section P MDS item descriptions
function getSectionPDescription(mdsItem) {
  const descriptions = {
    'P0100A': 'Full bed rails on all open sides',
    'P0100B': 'Other types of bed rails',
    'P0100C': 'Trunk restraint',
    'P0100D': 'Limb restraint',
    'P0100E': 'Chair prevents rising',
    'P0100F': 'Mitts',
    'P0100G': 'Self-release seat belt',
    'P0100H': 'Other types of restraints',
    'P0200A': 'Bed rail - bed mobility',
    'P0200B': 'Bed rail - transfer',
    'P0200C': 'Bed rail - enables turning',
    'P0200D': 'Bed rail - resident requested'
  };
  return descriptions[mdsItem] || mdsItem;
}

/**
 * Transform API response based on section type
 */
function transformAPIResponse(apiResponse, section) {
  const { run } = apiResponse;
  const results = run.results;
  const itemSummaries = apiResponse.itemSummaries || {};

  // Section-specific transformers
  switch (section) {
    case 'E':
      return transformSectionE(results);
    case 'H':
      return transformSectionH(results);
    case 'I':
      return transformSectionI(results, itemSummaries);
    case 'J':
      return transformSectionJ(results);
    case 'K':
      return transformSectionK(results);
    case 'L':
      return transformSectionL(results);
    case 'M':
      return transformSectionM(results);
    case 'N':
      return transformSectionN(results);
    case 'O':
      return transformSectionO(results);
    case 'P':
      return transformSectionP(results);
    default:
      console.warn(`Super LTC: No transformer for section ${section}`);
      return { items: [] };
  }
}

window.transformAPIResponse = transformAPIResponse;
