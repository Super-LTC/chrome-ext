/**
 * Comprehensive API response mocks for the demo environment.
 *
 * Each key maps to the shape expected by the corresponding hook:
 *   - dashboard       → useCommandCenter
 *   - docRisks        → useDocRisks
 *   - pdpmPotential   → usePDPMAnalyzer (keyed by assessmentId)
 *   - patientAssessments → usePDPMAnalyzer patient scope (keyed by patientId)
 *   - itemDetail      → useItemDetail (keyed by MDS code)
 *   - queryableItems  → useQueryItems
 *   - practitioners   → useBatchQuery
 */

export const DEMO_API_RESPONSES = {
  // ════════════════════════════════════════════
  // DASHBOARD (useCommandCenter)
  // ════════════════════════════════════════════
  dashboard: {
    assessments: [
      {
        id: '4860265',
        externalAssessmentId: '4860265',
        patientId: '2657226',
        patientName: 'Doe, Jane',
        assessmentType: 'Quarterly',
        ardDate: '2026-01-13',
        status: 'open',
        payerType: 'medicaid',
        assessmentClass: 'obra',
        isHippsOpportunityPrimary: true,
        deadlines: {
          urgency: 'urgent',
          ardDaysRemaining: 3,
          transmissionDue: '2026-01-27'
        },
        udaSummary: {
          bims: 'complete',
          phq9: 'missing',
          gg: 'complete'
        },
        pdpm: {
          hasImprovements: true,
          currentHipps: 'KAQD',
          potentialHipps: 'KBQE',
          payment: {
            currentDaily: 482.50,
            potentialDaily: 538.20,
            remainingDays: 14
          }
        },
        compliance: {
          summary: { passed: 4, total: 5 },
          checks: {
            bims: { status: 'passed' },
            phq9: { status: 'failed', message: 'PHQ-9 not found in lookback period' },
            gg: { status: 'passed' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 14, total: 18 },
        detectionSummary: {
          total: 4,
          hippsChanging: 3,
          docRisks: { total: 1, diagnosisMissing: 1, treatmentMissing: 0 }
        }
      },
      {
        id: '4862100',
        externalAssessmentId: '4862100',
        patientId: '2657300',
        patientName: 'Smith, Robert',
        assessmentType: '5-Day PPS',
        ardDate: '2026-01-10',
        status: 'open',
        payerType: 'medicare',
        assessmentClass: 'pps',
        isHippsOpportunityPrimary: true,
        deadlines: {
          urgency: 'overdue',
          ardDaysRemaining: -4,
          transmissionDue: '2026-01-24'
        },
        udaSummary: {
          bims: 'complete',
          phq9: 'complete',
          gg: 'in_progress'
        },
        pdpm: {
          hasImprovements: true,
          currentHipps: 'CBQJ',
          potentialHipps: 'CBQL',
          payment: {
            currentDaily: 610.80,
            potentialDaily: 645.30,
            remainingDays: 26
          }
        },
        compliance: {
          summary: { passed: 5, total: 5 },
          checks: {
            bims: { status: 'passed' },
            phq9: { status: 'passed' },
            gg: { status: 'passed' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 12, total: 18 },
        detectionSummary: {
          total: 5,
          hippsChanging: 2,
          docRisks: { total: 2, diagnosisMissing: 1, treatmentMissing: 1 }
        }
      },
      {
        id: '4863500',
        externalAssessmentId: '4863500',
        patientId: '2657450',
        patientName: 'Johnson, Mary',
        assessmentType: '5-Day PPS',
        ardDate: '2026-01-20',
        status: 'open',
        payerType: 'medicare',
        assessmentClass: 'pps',
        isHippsOpportunityPrimary: false,
        deadlines: {
          urgency: 'approaching',
          ardDaysRemaining: 7,
          transmissionDue: '2026-02-03'
        },
        udaSummary: {
          bims: 'complete',
          phq9: 'complete',
          gg: 'complete'
        },
        pdpm: {
          hasImprovements: false,
          currentHipps: 'LAQF',
          potentialHipps: null
        },
        compliance: {
          summary: { passed: 5, total: 5 },
          checks: {
            bims: { status: 'passed' },
            phq9: { status: 'passed' },
            gg: { status: 'passed' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 16, total: 18 },
        detectionSummary: {
          total: 0,
          hippsChanging: 0,
          docRisks: { total: 0, diagnosisMissing: 0, treatmentMissing: 0 }
        }
      },
      {
        id: '4864001',
        externalAssessmentId: '4864001',
        patientId: '2657501',
        patientName: 'Wilson, James',
        assessmentType: 'Annual',
        ardDate: '2026-01-25',
        status: 'open',
        payerType: 'medicaid',
        assessmentClass: 'obra',
        isHippsOpportunityPrimary: false,
        deadlines: {
          urgency: 'on_track',
          ardDaysRemaining: 12,
          transmissionDue: '2026-02-08'
        },
        udaSummary: {
          bims: 'complete',
          phq9: 'complete',
          gg: 'missing'
        },
        pdpm: {
          hasImprovements: false,
          currentHipps: 'KAQD',
          potentialHipps: null
        },
        compliance: {
          summary: { passed: 4, total: 5 },
          checks: {
            bims: { status: 'passed' },
            phq9: { status: 'passed' },
            gg: { status: 'failed', message: 'GG assessment not locked' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 10, total: 18 },
        detectionSummary: {
          total: 1,
          hippsChanging: 0,
          docRisks: { total: 0, diagnosisMissing: 0, treatmentMissing: 0 }
        }
      },
      {
        id: '4855102',
        externalAssessmentId: '4855102',
        patientId: '2657226',
        patientName: 'Doe, Jane',
        assessmentType: 'Annual',
        ardDate: '2025-12-15',
        status: 'locked',
        payerType: 'medicaid',
        assessmentClass: 'obra',
        isHippsOpportunityPrimary: false,
        deadlines: {
          urgency: 'completed',
          ardDaysRemaining: -30,
          transmissionDue: '2025-12-29'
        },
        udaSummary: {
          bims: 'locked_in_range',
          phq9: 'locked_in_range',
          gg: 'locked_in_range'
        },
        pdpm: {
          hasImprovements: false,
          currentHipps: 'KAQD',
          potentialHipps: null
        },
        compliance: {
          summary: { passed: 5, total: 5 },
          checks: {
            bims: { status: 'passed' },
            phq9: { status: 'passed' },
            gg: { status: 'passed' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 18, total: 18 },
        detectionSummary: {
          total: 0,
          hippsChanging: 0,
          docRisks: { total: 0, diagnosisMissing: 0, treatmentMissing: 0 }
        }
      },
      {
        id: '4865200',
        externalAssessmentId: '4865200',
        patientId: '2657300',
        patientName: 'Smith, Robert',
        assessmentType: 'Interim Payment',
        ardDate: '2026-01-24',
        status: 'open',
        payerType: 'medicare',
        assessmentClass: 'pps',
        isHippsOpportunityPrimary: false,
        deadlines: {
          urgency: 'approaching',
          ardDaysRemaining: 10,
          transmissionDue: '2026-02-07'
        },
        udaSummary: {
          bims: 'near_miss',
          phq9: 'complete',
          gg: 'complete'
        },
        pdpm: {
          hasImprovements: false,
          currentHipps: 'CBQJ',
          potentialHipps: null
        },
        compliance: {
          summary: { passed: 4, total: 5 },
          checks: {
            bims: { status: 'failed', message: 'BIMS near miss — locked outside lookback' },
            phq9: { status: 'passed' },
            gg: { status: 'passed' },
            orders: { status: 'passed' },
            therapyDocs: { status: 'passed' }
          }
        },
        sectionProgress: { completed: 8, total: 18 },
        detectionSummary: {
          total: 0,
          hippsChanging: 0,
          docRisks: { total: 0, diagnosisMissing: 0, treatmentMissing: 0 }
        }
      }
    ],

    summary: {
      totalAssessments: 6,
      openAssessments: 5,
      overdue: 1,
      urgent: 1,
      approaching: 2,
      onTrack: 1,
      hippsOpportunities: 2,
      totalRevenueOpportunity: '$780/day'
    },

    outstandingQueries: [
      {
        id: 'q-003',
        mdsAssessmentId: '4860265',
        patientName: 'Doe, Jane',
        mdsItem: 'I4900',
        mdsItemName: 'Schizophrenia',
        status: 'sent',
        sentAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        ardDaysRemaining: 3,
        assessmentPayment: { currentDaily: 482.50, potentialDaily: 538.20, remainingDays: 14 },
        sentTo: [{ firstName: 'Demo', lastName: 'Provider', title: 'MD' }]
      },
      {
        id: 'q-004',
        mdsAssessmentId: '4862100',
        patientName: 'Smith, Robert',
        mdsItem: 'I5100',
        mdsItemName: 'Quadriplegia',
        status: 'sent',
        sentAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        ardDaysRemaining: -4,
        assessmentPayment: { currentDaily: 610.80, potentialDaily: 645.30, remainingDays: 26 },
        sentTo: [{ firstName: 'Sample', lastName: 'Doctor', title: 'DO' }]
      },
      {
        id: 'q-001',
        mdsAssessmentId: '4860265',
        patientName: 'Doe, Jane',
        mdsItem: 'I5600',
        mdsItemName: 'Malnutrition',
        status: 'pending',
        ardDaysRemaining: 3,
        assessmentPayment: { currentDaily: 482.50, potentialDaily: 538.20, remainingDays: 14 }
      }
    ],

    recentlySigned: [
      {
        id: 'q-005',
        mdsAssessmentId: '4860265',
        patientName: 'Doe, Jane',
        mdsItem: 'I6200',
        mdsItemName: 'Diabetes Mellitus',
        status: 'signed',
        signedAt: new Date(Date.now() - 86400000).toISOString(),
        mdsItemCoded: false,
        hasPdf: true,
        practitioner: { firstName: 'Demo', lastName: 'Provider', title: 'MD' },
        selectedIcd10Code: 'E11.9'
      }
    ]
  },

  // ════════════════════════════════════════════
  // DOC RISKS (useDocRisks)
  // ════════════════════════════════════════════
  docRisks: {
    summary: { total: 3, diagnosisMissing: 2, treatmentMissing: 1 },
    items: [
      {
        patientName: 'Doe, Jane',
        assessmentType: 'Quarterly',
        mdsItem: 'I5600',
        itemName: 'Malnutrition',
        missingDiagnosis: true,
        missingTreatment: false,
        rationale: 'Nutrition assessment documents significant weight loss (12.6%), low albumin/prealbumin, and PO intake <50%, but no ICD-10 code for malnutrition on Med Diag.'
      },
      {
        patientName: 'Smith, Robert',
        assessmentType: '5-Day PPS',
        mdsItem: 'I4300',
        itemName: 'Diabetes with PVD',
        missingDiagnosis: true,
        missingTreatment: false,
        rationale: 'Lab results and medication list support diabetes diagnosis, but no PVD code documented.'
      },
      {
        patientName: 'Smith, Robert',
        assessmentType: '5-Day PPS',
        mdsItem: 'O0400A3',
        itemName: 'IV Medications',
        missingDiagnosis: false,
        missingTreatment: true,
        rationale: 'MAR shows IV antibiotic course, but treatment not reflected on active treatment plan.'
      }
    ]
  },

  // ════════════════════════════════════════════
  // PDPM POTENTIAL (usePDPMAnalyzer - keyed by assessmentId)
  // ════════════════════════════════════════════
  pdpmPotential: {
    '4860265': {
      patientName: 'Doe, Jane',
      assessment: {
        id: '4860265',
        externalAssessmentId: '4860265',
        externalPatientId: '2657226',
        patientId: '2657226',
        description: 'Quarterly',
        ardDate: '2026-01-13',
        status: 'open'
      },
      summary: {
        currentHipps: 'KAQD',
        potentialHippsIfCoded: 'KBQE',
        hasImprovements: true,
        totalActionableItems: 3
      },
      calculation: {
        hippsCode: 'KAQD',
        ptot: 'TK',
        slp: 'SA',
        nursing: 'CA1',
        nta: 'ND'
      },
      payment: {
        currentDaily: 482.50,
        potentialDaily: 538.20,
        remainingDays: 14
      },
      enhancedDetections: [
        {
          mdsItem: 'I5600',
          itemName: 'Malnutrition',
          section: 'I',
          wouldChangeHipps: true,
          solverStatus: 'detected',
          confidence: 0.95,
          rationale: 'Nutrition assessment documents significant weight loss (12.6% in 3 months), low albumin (2.9) and prealbumin (12), PO intake <50%, with supplementation orders supporting malnutrition diagnosis.',
          evidence: [
            { sourceType: 'progress-note', sourceId: 'doc-nutr-001', quote: 'Weight Loss: 17 lbs (12.6%) in past 3 months. PO Intake: < 50% meals/est. needs. Moderate protein-calorie malnutrition.', documentName: 'Nutrition Progress Note' },
            { sourceType: 'lab_result', sourceId: 'doc-nutr-002', quote: 'Albumin: 2.9 g/dL (Low), Prealbumin: 12 mg/dL (Low)', documentName: 'Nutrition Lab Panel' }
          ],
          impact: {
            nta: { wouldChangeGroup: true, currentGroup: 'ND', newGroup: 'NE' }
          }
        },
        {
          mdsItem: 'I4300',
          itemName: 'Diabetes with Peripheral Vascular Disease',
          section: 'I',
          wouldChangeHipps: true,
          solverStatus: 'detected',
          confidence: 0.85,
          rationale: 'Lab results show elevated HbA1c and medication list includes diabetic medications. Progress note documents PVD symptoms.',
          evidence: [
            { sourceType: 'lab_result', sourceId: 'doc-081', quote: 'HbA1c: 8.2%, GFR 42, Creatinine 1.8', documentName: 'Lab Results 1/18' },
            { sourceType: 'progress-note', sourceId: 'doc-082', quote: 'Bilateral lower extremity edema with diminished pedal pulses noted.', documentName: 'MD Progress Note' }
          ],
          impact: {
            nta: { wouldChangeLevel: true, currentLevel: 'ND', newLevel: 'NE' }
          }
        },
        {
          mdsItem: 'O0400A3',
          itemName: 'IV Medications',
          section: 'O',
          wouldChangeHipps: true,
          solverStatus: 'detected',
          confidence: 0.95,
          rationale: 'MAR shows active IV antibiotic course (Vancomycin) during lookback period.',
          evidence: [
            { sourceType: 'order', sourceId: 'order-080', quote: 'Vancomycin 1g IV Q12H - administered 1/12, 1/13', documentName: 'MAR' }
          ],
          impact: {
            nursing: { wouldChangeGroup: true, currentPaymentGroup: 'CA1', newPaymentGroup: 'CB1' }
          }
        },
        {
          mdsItem: 'I2900',
          itemName: 'Drug/Medication induced depression',
          section: 'I',
          wouldChangeHipps: false,
          solverStatus: 'detected',
          confidence: 0.72,
          rationale: 'PHQ-9 assessment missing. Multiple medications on profile associated with depressive side effects.',
          evidence: [
            { sourceType: 'progress-note', sourceId: 'doc-083', quote: 'Patient reports feeling down and having little interest in activities.', documentName: 'Nursing Assessment' }
          ]
        }
      ],
      outstandingQueries: [
        {
          id: 'q-003',
          mdsItem: 'I4900',
          mdsItemName: 'Schizophrenia',
          status: 'sent',
          sentAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          pdpmImpact: { wouldChangeHipps: false }
        }
      ],
      recentlySigned: [
        {
          id: 'q-005',
          mdsItem: 'I6200',
          mdsItemName: 'Diabetes Mellitus',
          status: 'signed',
          signedAt: new Date(Date.now() - 86400000).toISOString(),
          mdsItemCoded: false
        }
      ],
      compliance: {
        summary: { passed: 4, total: 5 },
        checks: {
          bims: { status: 'passed', message: 'BIMS completed', foundUda: { description: 'BIMS Assessment', date: '2026-01-12', lockedDate: '2026-01-12' } },
          phq9: { status: 'failed', message: 'PHQ-9 not found in lookback period' },
          gg: { status: 'passed', message: 'GG completed', foundUda: { description: 'GG Functional Assessment', date: '2026-01-11', lockedDate: '2026-01-12' } },
          orders: { status: 'passed', message: 'All orders signed' },
          therapyDocs: { status: 'passed', message: 'Therapy documentation complete' }
        }
      }
    },

    '4862100': {
      patientName: 'Smith, Robert',
      assessment: {
        id: '4862100',
        externalAssessmentId: '4862100',
        externalPatientId: '2657300',
        patientId: '2657300',
        description: '5-Day PPS',
        ardDate: '2026-01-10',
        status: 'open'
      },
      summary: {
        currentHipps: 'CBQJ',
        potentialHippsIfCoded: 'CBQL',
        hasImprovements: true,
        totalActionableItems: 5
      },
      calculation: {
        hippsCode: 'CBQJ',
        ptot: 'TL',
        slp: 'SB',
        nursing: 'CB2',
        nta: 'NF'
      },
      payment: {
        currentDaily: 610.80,
        potentialDaily: 645.30,
        remainingDays: 26
      },
      enhancedDetections: [
        {
          mdsItem: 'I5100',
          itemName: 'Hemiplegia/Hemiparesis',
          section: 'I',
          wouldChangeHipps: true,
          solverStatus: 'detected',
          confidence: 0.96,
          rationale: 'Post-CVA left hemiparesis well documented in PT/OT evaluations.',
          evidence: [
            { sourceType: 'progress-note', sourceId: 'doc-084', quote: 'Left-sided hemiparesis with 2/5 strength in left upper and lower extremities.', documentName: 'PT Evaluation' }
          ],
          impact: {
            ptot: { wouldChangeGroup: true, currentGroup: 'TL', newGroup: 'TM' }
          }
        },
        {
          mdsItem: 'K0510A',
          itemName: 'Parenteral/IV Feeding',
          section: 'K',
          wouldChangeHipps: true,
          solverStatus: 'detected',
          confidence: 0.88,
          rationale: 'IV fluids administered during lookback period per MAR records.',
          evidence: [
            { sourceType: 'order', sourceId: 'order-081', quote: 'D5 1/2NS 1000ml IV at 75ml/hr - running', documentName: 'MAR' }
          ],
          impact: {
            nta: { wouldChangeLevel: true, currentLevel: 'NF', newLevel: 'NG' }
          }
        }
      ],
      outstandingQueries: [
        {
          id: 'q-004',
          mdsItem: 'I5100',
          mdsItemName: 'Quadriplegia',
          status: 'sent',
          sentAt: new Date(Date.now() - 5 * 86400000).toISOString(),
          pdpmImpact: { wouldChangeHipps: false }
        }
      ],
      recentlySigned: [],
      compliance: {
        summary: { passed: 5, total: 5 },
        checks: {
          bims: { status: 'passed', message: 'BIMS completed' },
          phq9: { status: 'passed', message: 'PHQ-9 completed' },
          gg: { status: 'passed', message: 'GG completed' },
          orders: { status: 'passed', message: 'All orders signed' },
          therapyDocs: { status: 'passed', message: 'Therapy documentation complete' }
        }
      }
    }
  },

  // ════════════════════════════════════════════
  // PATIENT ASSESSMENTS (usePDPMAnalyzer patient scope)
  // ════════════════════════════════════════════
  patientAssessments: {
    '2657226': {
      patientName: 'Doe, Jane',
      assessments: [
        {
          id: '4860265',
          externalAssessmentId: '4860265',
          type: 'Quarterly',
          assessmentType: 'Quarterly',
          ardDate: '2026-01-13',
          status: 'open',
          currentHipps: 'KAQD',
          hipps: 'KAQD'
        },
        {
          id: '4855102',
          externalAssessmentId: '4855102',
          type: 'Annual',
          assessmentType: 'Annual',
          ardDate: '2025-12-15',
          status: 'locked',
          currentHipps: 'KAQD',
          hipps: 'KAQD'
        }
      ]
    },
    '2657300': {
      patientName: 'Smith, Robert',
      assessments: [
        {
          id: '4862100',
          externalAssessmentId: '4862100',
          type: '5-Day PPS',
          assessmentType: '5-Day PPS',
          ardDate: '2026-01-10',
          status: 'open',
          currentHipps: 'CBQJ',
          hipps: 'CBQJ'
        }
      ]
    }
  },

  // ════════════════════════════════════════════
  // CERTIFICATION DASHBOARD (useCertDashboard)
  // ════════════════════════════════════════════
  certDashboard: {
    pending: 4,
    overdue: 1,
    dueSoon: 2,
    signedLast7Days: 3
  },

  // ════════════════════════════════════════════
  // CERTIFICATIONS LIST (useCertifications)
  // ════════════════════════════════════════════
  certifications: [
    // ── Stay 001: Doe, Jane (Medicare Part A) ──
    {
      id: 'cert-001',
      patientId: '2657226',
      patientName: 'Doe, Jane',
      status: 'pending',
      type: 'initial',
      sequenceNumber: 0,
      payerType: 'medicare',
      partAStayId: 'stay-001',
      partAStartDate: '2025-12-20',
      currentMedicareDay: 45,
      admitDate: '2025-12-20',
      certPeriodStart: '2025-12-20',
      certPeriodEnd: '2026-01-19',
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      clinicalReason: 'Requires skilled nursing for IV antibiotic therapy and wound management following surgical debridement of sacral pressure ulcer. Patient also requires daily PT/OT for functional mobility restoration.',
      estimatedDays: 30,
      planForDischarge: 'home_with_services',
      assignedPractitioner: { id: 'pract-001', name: 'Dr. Demo Provider', title: 'MD' },
      sends: [],
      certChain: [
        { type: 'initial', status: 'pending', dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] }
      ]
    },
    {
      id: 'cert-004',
      patientId: '2657226',
      patientName: 'Doe, Jane',
      status: 'signed',
      type: 'day_14_recert',
      sequenceNumber: 1,
      payerType: 'medicare',
      partAStayId: 'stay-001',
      partAStartDate: '2025-12-20',
      currentMedicareDay: 45,
      admitDate: '2025-12-20',
      certPeriodStart: '2025-12-20',
      certPeriodEnd: '2026-01-19',
      dueDate: '2026-01-10',
      clinicalReason: 'Continued skilled nursing for wound care and IV medications. Wound showing slow but steady improvement with granulation tissue forming.',
      estimatedDays: 30,
      planForDischarge: 'home_with_services',
      signedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      signedByName: 'Dr. Demo Provider',
      signedByTitle: 'MD',
      signedByPractitionerId: 'pract-001',
      sends: [
        { sentAt: new Date(Date.now() - 6 * 86400000).toISOString(), practitionerName: 'Dr. Demo Provider', practitionerTitle: 'MD', smsStatus: 'delivered' }
      ],
      certChain: [
        { type: 'initial', status: 'signed', dueDate: '2025-12-30' },
        { type: 'day_14_recert', status: 'signed', dueDate: '2026-01-10' }
      ]
    },

    // ── Stay 002: Smith, Robert (Medicare Part A) ──
    {
      id: 'cert-006',
      patientId: '2657300',
      patientName: 'Smith, Robert',
      status: 'pending',
      type: 'initial',
      sequenceNumber: 0,
      payerType: 'medicare',
      partAStayId: 'stay-002',
      partAStartDate: '2025-11-15',
      currentMedicareDay: 78,
      admitDate: '2025-11-15',
      certPeriodStart: '2025-11-15',
      certPeriodEnd: '2025-12-15',
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
      clinicalReason: '',
      estimatedDays: null,
      planForDischarge: null,
      assignedPractitioner: null,
      sends: [],
      certChain: [
        { type: 'initial', status: 'pending', dueDate: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0] },
        { type: 'day_14_recert', status: 'pending', dueDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0] }
      ]
    },
    {
      id: 'cert-002',
      patientId: '2657300',
      patientName: 'Smith, Robert',
      status: 'pending',
      type: 'day_14_recert',
      sequenceNumber: 1,
      payerType: 'medicare',
      partAStayId: 'stay-002',
      partAStartDate: '2025-11-15',
      currentMedicareDay: 78,
      admitDate: '2025-11-15',
      certPeriodStart: '2026-01-15',
      certPeriodEnd: '2026-02-14',
      dueDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
      clinicalReason: 'Post-CVA rehabilitation requiring daily PT/OT/SLP. Patient demonstrating slow but measurable functional gains. Left hemiparesis persists — requires max assist for transfers.',
      estimatedDays: 30,
      planForDischarge: 'home_with_services',
      assignedPractitioner: { id: 'pract-002', name: 'Dr. Sample Doctor', title: 'DO' },
      sends: [],
      certChain: [
        { type: 'initial', status: 'signed', dueDate: '2025-12-15' },
        { type: 'day_14_recert', status: 'pending', dueDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0] }
      ]
    },

    // ── Johnson, Mary (Managed Care) ──
    {
      id: 'cert-003',
      patientId: '2657450',
      patientName: 'Johnson, Mary',
      status: 'sent',
      type: 'initial',
      sequenceNumber: 0,
      payerType: 'managed_care',
      partAStayId: null,
      partAStartDate: null,
      currentMedicareDay: null,
      admitDate: '2026-01-05',
      certPeriodStart: '2026-01-05',
      certPeriodEnd: '2026-02-04',
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      clinicalReason: 'Skilled nursing for medication management and fall prevention program. Patient with complex polypharmacy requiring daily nursing assessment.',
      estimatedDays: 30,
      planForDischarge: 'long_term_care',
      assignedPractitioner: { id: 'pract-001', name: 'Dr. Demo Provider', title: 'MD' },
      sends: [
        { sentAt: new Date(Date.now() - 2 * 86400000).toISOString(), practitionerName: 'Dr. Demo Provider', practitionerTitle: 'MD', smsStatus: 'delivered' }
      ],
      certChain: [
        { type: 'initial', status: 'sent', dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0] }
      ]
    },

    // ── Wilson, James (Managed Care — Skipped) ──
    {
      id: 'cert-005',
      patientId: '2657501',
      patientName: 'Wilson, James',
      status: 'skipped',
      type: 'initial',
      sequenceNumber: 0,
      payerType: 'managed_care',
      partAStayId: null,
      partAStartDate: null,
      currentMedicareDay: null,
      admitDate: '2026-01-02',
      certPeriodStart: '2026-01-02',
      certPeriodEnd: '2026-02-01',
      dueDate: '2026-01-12',
      skipReason: 'Payer does not require certification for this stay type.',
      sends: [],
      certChain: [
        { type: 'initial', status: 'skipped', dueDate: '2026-01-12' }
      ]
    },

    // ── Anderson, Patricia (Medicare Part A — Day 30 recert delayed) ──
    {
      id: 'cert-007',
      patientId: '2657600',
      patientName: 'Anderson, Patricia',
      status: 'pending',
      type: 'day_30_recert',
      sequenceNumber: 2,
      isDelayed: true,
      payerType: 'medicare',
      partAStayId: 'stay-003',
      partAStartDate: '2025-11-01',
      currentMedicareDay: 92,
      admitDate: '2025-11-01',
      certPeriodStart: '2026-01-01',
      certPeriodEnd: '2026-01-31',
      dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
      clinicalReason: 'Continued skilled nursing for tracheostomy care, ventilator weaning protocol, and respiratory therapy. Patient on gradual weaning schedule.',
      estimatedDays: 30,
      planForDischarge: 'long_term_care',
      assignedPractitioner: { id: 'pract-003', name: 'Jane Specialist, NP', title: 'NP' },
      sends: [],
      certChain: [
        { type: 'initial', status: 'signed', dueDate: '2025-11-20' },
        { type: 'day_14_recert', status: 'signed', dueDate: '2025-12-15' },
        { type: 'day_30_recert', status: 'pending', dueDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0] }
      ]
    }
  ],

  // ════════════════════════════════════════════
  // ITEM DETAIL (useItemDetail - keyed by MDS code)
  // ════════════════════════════════════════════
  itemDetail: {
    'I0400': {
      item: {
        mdsItem: 'I0400',
        itemName: 'Coronary Artery Disease (CAD)',
        section: 'I',
        description: 'I0400 — Has the resident been diagnosed with coronary artery disease (CAD)?',
        status: 'needs_physician_query',
        validation: {
          diagnosisCheck: { passed: false },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'progress-note',
            sourceId: 'doc-020',
            documentName: 'Cardiology Consult',
            displayName: 'Cardiology Consult — 12/18/2025',
            effectiveDate: '2025-12-18',
            quote: 'History of coronary artery disease s/p PCI with drug-eluting stent to LAD in 2022. Chronic stable angina well controlled on current regimen.',
            rationale: 'Specialist documentation of established CAD diagnosis with interventional history.',
            pageNumber: 1
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-021',
            documentName: 'H&P — Admission',
            displayName: 'H&P — Admission — 12/20/2025',
            effectiveDate: '2025-12-20',
            quote: 'PMH: CAD s/p stent, HTN, DM type 2, CKD stage 3. Continue home medications.',
            rationale: 'Admission history documenting CAD as part of past medical history.',
            pageNumber: 1
          },
          {
            sourceType: 'order',
            sourceId: 'mar-010',
            documentName: 'MAR',
            displayName: 'MAR — 01/27/2026',
            effectiveDate: '2026-01-27',
            quote: 'Aspirin 81mg PO daily — administered 0800. Atorvastatin 40mg PO QHS — administered 2100. Metoprolol succinate 25mg PO BID — administered 0800, 2000.',
            rationale: 'Active medications consistent with CAD treatment regimen.'
          }
        ],
        keyFindings: [
          'Cardiology consult documents CAD s/p PCI with DES to LAD (2022)',
          'No ICD-10 code for CAD on current problem list',
          'Active CAD medications: aspirin, atorvastatin, metoprolol'
        ]
      },
      diagnosisSummary: 'PCC response is "No" but clinical documentation suggests possible CAD. Cardiology consult from 12/2025 references chronic stable angina and coronary stenting history. No ICD-10 code for CAD on current problem list.',
      treatmentSummary: 'Patient on aspirin 81mg daily, atorvastatin 40mg daily, and metoprolol 25mg BID — consistent with CAD management.'
    },

    'I0700': {
      item: {
        mdsItem: 'I0700',
        itemName: 'Hypertension (HTN)',
        section: 'I',
        description: 'I0700 — Has the resident been diagnosed with hypertension?',
        status: 'code',
        validation: {
          diagnosisCheck: { passed: true },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'progress-note',
            sourceId: 'doc-025',
            documentName: 'MD Progress Note',
            displayName: 'MD Progress Note — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'HTN stable on current regimen. BP today 138/82. Continue lisinopril and amlodipine. Recheck BP in 2 weeks.',
            rationale: 'Physician documentation confirming active hypertension management.',
            pageNumber: 1
          },
          {
            sourceType: 'order',
            sourceId: 'mar-012',
            documentName: 'MAR',
            displayName: 'MAR — 01/27/2026',
            effectiveDate: '2026-01-27',
            quote: 'Lisinopril 20mg PO daily — administered 0800. Amlodipine 5mg PO daily — administered 0800.',
            rationale: 'Active antihypertensive medications on MAR.'
          }
        ],
        keyFindings: [
          'Active ICD-10 code I10 on problem list',
          'BP 138/82 on latest vitals — within target range',
          'Lisinopril 20mg + amlodipine 5mg daily regimen'
        ]
      },
      diagnosisSummary: 'Hypertension well documented with active ICD-10 code I10 on problem list. Vital signs and medication regimen confirm active management.',
      treatmentSummary: 'Lisinopril 20mg daily, amlodipine 5mg daily. BP monitoring per protocol with parameters documented.'
    },

    'I0900': {
      item: {
        mdsItem: 'I0900',
        itemName: 'Peripheral Vascular Disease (PVD) or Peripheral Arterial Disease (PAD)',
        section: 'I',
        description: 'I0900 — Has the resident been diagnosed with peripheral vascular disease (PVD) or peripheral arterial disease (PAD)?',
        status: 'needs_physician_query',
        validation: {
          diagnosisCheck: { passed: false },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'progress-note',
            sourceId: 'doc-003',
            documentName: 'MD Progress Note',
            displayName: 'MD Progress Note — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Bilateral lower extremity edema with diminished pedal pulses noted. Continue compression stockings. Monitor for skin breakdown.',
            rationale: 'Physical findings consistent with PVD but not definitively diagnosed.',
            pageNumber: 1
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-030',
            documentName: 'Nursing Assessment',
            displayName: 'Nursing Assessment — 01/25/2026',
            effectiveDate: '2026-01-25',
            quote: 'Bilateral pedal edema 2+, feet cool to touch, diminished DP pulses bilaterally. Skin intact, no ulcerations. Compression stockings applied.',
            rationale: 'Nursing assessment documenting vascular symptoms needing clinical correlation.',
            pageNumber: 1
          }
        ],
        keyFindings: [
          'Bilateral LE edema with diminished pedal pulses',
          'Symptoms overlap with diabetic neuropathy — clarification needed',
          'No PVD/PAD ICD-10 code on problem list',
          'Compression stockings ordered but no specific PVD treatment plan'
        ]
      },
      diagnosisSummary: 'Documentation is ambiguous. Progress notes describe bilateral lower extremity edema and diminished pedal pulses, but these symptoms could also indicate diabetic neuropathy or venous insufficiency. No definitive PVD/PAD diagnosis on problem list.',
      treatmentSummary: 'Compression stockings ordered. Diabetic foot care protocol in place. Vascular checks BID — but no specific PVD treatment plan.'
    },

    'I2000': {
      item: {
        mdsItem: 'I2000',
        itemName: 'Diabetes Mellitus (DM)',
        section: 'I',
        description: 'I2000 — Has the resident been diagnosed with diabetes mellitus (DM)?',
        status: 'code',
        validation: {
          diagnosisCheck: { passed: true },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'lab_result',
            sourceId: 'doc-006',
            documentName: 'Lab Results',
            displayName: 'Lab Results — 01/18/2026',
            effectiveDate: '2026-01-18',
            quote: 'HbA1c: 8.2%, Fasting glucose: 186 mg/dL. Diabetes management suboptimal — consider medication adjustment.',
            rationale: 'Lab values confirming active diabetes with suboptimal control.'
          },
          {
            sourceType: 'order',
            sourceId: 'mar-001',
            documentName: 'MAR',
            displayName: 'MAR — 01/27/2026',
            effectiveDate: '2026-01-27',
            quote: 'Metformin 500mg PO BID — administered 0800, 1800. Blood glucose AC: 0730=168, 1130=142, 1730=195. HS: 2100=156.',
            rationale: 'Active diabetic medication and glucose monitoring.'
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-025',
            documentName: 'MD Progress Note',
            displayName: 'MD Progress Note — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'DM type 2 — HbA1c elevated at 8.2%. Will increase metformin and add sliding scale insulin for glucose >200.',
            rationale: 'Physician management of diabetes with medication adjustment.',
            pageNumber: 1
          }
        ],
        keyFindings: [
          'ICD-10 E11.9 on active problem list',
          'HbA1c 8.2% — suboptimal glycemic control',
          'Metformin 500mg BID + glucose monitoring AC & HS',
          'Physician adjusting regimen — adding sliding scale insulin'
        ]
      },
      diagnosisSummary: 'Type 2 diabetes well documented. ICD-10 E11.9 on active problem list. Lab monitoring and multiple diabetic medications confirm active diagnosis.',
      treatmentSummary: 'Metformin 500mg BID, blood glucose monitoring AC & HS, diabetic diet, podiatry consult Q3 months.'
    },

    'I5600': {
      item: {
        mdsItem: 'I5600',
        itemName: 'Malnutrition',
        section: 'I',
        description: 'I5600 — Malnutrition (protein or calorie) or at risk for malnutrition.',
        status: 'recommend_coding',
        validation: {
          diagnosisCheck: { passed: true },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            evidenceId: 'uda-demo-nutrition-v3',
            sourceType: 'uda',
            sourceId: 'demo-nutrition-v3',
            displayName: 'Nutrition Assessment - V 3 (2/27/2026)',
            effectiveDate: '2026-02-27',
            date: '2026-02-27',
            quote: 'Existing diagnosis of Protein/Calorie Malnutrition? (NTA point): Yes',
            quoteText: 'Existing diagnosis of Protein/Calorie Malnutrition? (NTA point): Yes',
            rationale: 'Dietitian-signed nutrition assessment documents existing protein/calorie malnutrition.',
            evidenceRole: 'supporting'
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-nutr-001',
            documentName: 'Nutrition Progress Note',
            displayName: 'Nutrition Progress Note — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Weight Loss: 17 lbs (12.6%) in past 3 months. PO Intake: < 50% meals/est. needs. Moderate protein-calorie malnutrition diagnosed.',
            rationale: 'Dietitian assessment documenting malnutrition with objective weight loss and intake data.',
            pageNumber: 2,
            pdfData: {
              filename: 'NUTRITION_01_22_36001641.PDF',
              title: 'Nutrition Progress Note',
              pages: 2,
              pageContent: {
                1: [
                  { text: 'NUTRITION PROGRESS NOTE', highlight: false },
                  { text: 'Patient: Doe, Jane', highlight: false },
                  { text: 'Date: 01/22/2026', highlight: false },
                  { text: 'Dietitian: Sarah Kim, RD, LD', highlight: false },
                  { text: '', highlight: false },
                  { text: 'NUTRITIONAL STATUS:', highlight: false },
                  { text: 'Current Weight: 118 lbs (53.5 kg)', highlight: false },
                  { text: 'Usual Body Weight: 135 lbs (61.2 kg)', highlight: false },
                  { text: 'Weight Loss: 17 lbs (12.6%) in past 3 months', highlight: 'keyword' },
                  { text: '', highlight: false },
                  { text: 'DIETARY INTAKE:', highlight: false },
                  { text: 'Ongoing PO Intake: < 50% meals/est. needs', highlight: 'keyword' },
                  { text: 'Patient reports decreased appetite and early satiety.', highlight: false },
                  { text: 'Difficulty with textures due to dysphagia.', highlight: 'contextual' }
                ],
                2: [
                  { text: 'LABORATORY VALUES:', highlight: false },
                  { text: 'Albumin: 2.9 g/dL (Low)', highlight: 'keyword' },
                  { text: 'Prealbumin: 12 mg/dL (Low)', highlight: 'keyword' },
                  { text: 'Total Protein: 5.8 g/dL (Low)', highlight: false },
                  { text: '', highlight: false },
                  { text: 'MALNUTRITION DIAGNOSIS:', highlight: false },
                  { text: 'Moderate protein-calorie malnutrition based on:', highlight: 'keyword' },
                  { text: '- Significant unintentional weight loss (>10% in 3 months)', highlight: false },
                  { text: '- Inadequate oral intake (<50% estimated needs)', highlight: false },
                  { text: '- Low albumin and prealbumin', highlight: false },
                  { text: '', highlight: false },
                  { text: 'RECOMMENDATIONS:', highlight: false },
                  { text: '1. Fortified foods - pudding, cereal, milk', highlight: false },
                  { text: '2. Ensure Plus BID with meals', highlight: false },
                  { text: '3. Liberalized diet texture per SLP recommendations', highlight: false },
                  { text: '4. Weekly weights', highlight: false },
                  { text: '5. Re-evaluate in 1 week', highlight: false }
                ]
              }
            }
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-nutr-002',
            documentName: 'Nutrition Lab Panel',
            displayName: 'Nutrition Lab Panel — 01/20/2026',
            effectiveDate: '2026-01-20',
            quote: 'Albumin: 2.9 g/dL (Low), Prealbumin: 12 mg/dL (Low). Low values suggest malnutrition and/or inflammatory state.',
            rationale: 'Lab values confirming malnutrition with low albumin and prealbumin.',
            pdfData: {
              filename: 'LAB_NUTRITION_01_20_38001789.PDF',
              title: 'Nutrition Panel Results',
              pages: 1,
              content: [
                { text: 'LABORATORY REPORT', highlight: false },
                { text: 'Patient: Doe, Jane', highlight: false },
                { text: 'Date Collected: 01/20/2026 06:15', highlight: false },
                { text: '', highlight: false },
                { text: 'NUTRITION PANEL:', highlight: false },
                { text: '', highlight: false },
                { text: 'Albumin: 2.9 g/dL                    (L) Ref: 3.5-5.0', highlight: 'keyword' },
                { text: 'Prealbumin: 12 mg/dL                 (L) Ref: 18-38', highlight: 'keyword' },
                { text: 'Total Protein: 5.8 g/dL              (L) Ref: 6.0-8.3', highlight: false },
                { text: 'Transferrin: 165 mg/dL               (L) Ref: 200-360', highlight: false },
                { text: '', highlight: false },
                { text: 'Note: Low albumin and prealbumin suggest malnutrition', highlight: 'keyword' },
                { text: 'and/or inflammatory state. Clinical correlation advised.', highlight: false }
              ]
            }
          },
          {
            sourceType: 'order',
            sourceId: 'doc-nutr-004',
            documentName: 'MAR - Ensure Plus',
            displayName: 'MAR — Ensure Plus 8oz BID — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Ensure Plus 8oz BID with meals for nutritional supplementation',
            rationale: 'Oral nutrition supplement order supports malnutrition diagnosis and active treatment.',
            marData: {
              medication: 'Ensure Plus 8 OZ Oral Liquid',
              route: 'ORAL',
              instructions: 'Give 8 oz Ensure Plus by mouth twice daily with lunch and dinner for nutritional supplementation and malnutrition treatment',
              frequency: 'BID with meals',
              dateRange: { start: '2026-01-22', end: '2026-01-28' },
              administrations: [
                { date: '2026-01-22', time: 'Lunch', status: 'given' },
                { date: '2026-01-22', time: 'Dinner', status: 'given' },
                { date: '2026-01-23', time: 'Lunch', status: 'given' },
                { date: '2026-01-23', time: 'Dinner', status: 'refused' },
                { date: '2026-01-24', time: 'Lunch', status: 'given' },
                { date: '2026-01-24', time: 'Dinner', status: 'given' },
                { date: '2026-01-25', time: 'Lunch', status: 'given' },
                { date: '2026-01-25', time: 'Dinner', status: 'given' },
                { date: '2026-01-26', time: 'Lunch', status: 'given' },
                { date: '2026-01-26', time: 'Dinner', status: 'refused' },
                { date: '2026-01-27', time: 'Lunch', status: 'given' },
                { date: '2026-01-27', time: 'Dinner', status: 'given' },
                { date: '2026-01-28', time: 'Lunch', status: 'given' },
                { date: '2026-01-28', time: 'Dinner', status: 'given' }
              ]
            }
          },
          {
            sourceType: 'order',
            sourceId: 'doc-nutr-003',
            documentName: 'MAR - Fortified Cereal',
            displayName: 'MAR — Fortified Cereal 6oz QD — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Fortified Cereal 6 oz QD to increase caloric and protein intake',
            rationale: 'Nutrition intervention order for fortified foods supports malnutrition treatment.',
            marData: {
              medication: 'Fortified Cereal 6 OZ',
              route: 'ORAL',
              instructions: 'Give 6 oz fortified cereal by mouth once daily to increase caloric and protein intake for malnutrition',
              frequency: 'Daily with breakfast',
              dateRange: { start: '2026-01-22', end: '2026-01-28' },
              administrations: [
                { date: '2026-01-22', time: 'Breakfast', status: 'given' },
                { date: '2026-01-23', time: 'Breakfast', status: 'given' },
                { date: '2026-01-24', time: 'Breakfast', status: 'given' },
                { date: '2026-01-25', time: 'Breakfast', status: 'refused' },
                { date: '2026-01-26', time: 'Breakfast', status: 'given' },
                { date: '2026-01-27', time: 'Breakfast', status: 'given' },
                { date: '2026-01-28', time: 'Breakfast', status: 'given' }
              ]
            }
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-nutr-006',
            documentName: 'Weight Monitoring Flow Sheet',
            displayName: 'Weight Monitoring — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Weight trend: 135 lbs → 128 lbs → 118 lbs. Total loss: 17 lbs (12.6%). >10% in 3 months = SEVERE weight loss.',
            rationale: 'Nursing documentation of progressive weight loss meeting malnutrition criteria.',
            pdfData: {
              filename: 'NURSING_WEIGHTS_01_22_38001945.PDF',
              title: 'Weight Monitoring Flow Sheet',
              pages: 1,
              content: [
                { text: 'WEIGHT MONITORING - 3 MONTH TREND', highlight: false },
                { text: 'Patient: Doe, Jane', highlight: false },
                { text: 'Date: 01/22/2026', highlight: false },
                { text: '', highlight: false },
                { text: 'WEIGHT HISTORY:', highlight: false },
                { text: '10/22/2025: 135.0 lbs (Usual body weight)', highlight: false },
                { text: '11/15/2025: 132.5 lbs (-2.5 lbs)', highlight: false },
                { text: '12/20/2025: 128.0 lbs (-7.0 lbs from usual)', highlight: 'keyword' },
                { text: '01/15/2026: 120.5 lbs (-14.5 lbs from usual)', highlight: 'keyword' },
                { text: '01/22/2026: 118.0 lbs (-17.0 lbs from usual)', highlight: 'keyword' },
                { text: '', highlight: false },
                { text: 'WEIGHT LOSS PERCENTAGE:', highlight: false },
                { text: 'Total Loss: 17 lbs over 3 months', highlight: 'keyword' },
                { text: 'Percentage: 12.6% of usual body weight', highlight: 'keyword' },
                { text: '', highlight: false },
                { text: 'SIGNIFICANCE:', highlight: false },
                { text: '>10% weight loss in 3 months = SEVERE weight loss', highlight: 'keyword' },
                { text: 'Meets criteria for malnutrition diagnosis', highlight: 'keyword' },
                { text: '', highlight: false },
                { text: 'INTERVENTIONS INITIATED:', highlight: false },
                { text: '- Dietary consult completed', highlight: false },
                { text: '- Nutritional supplements ordered', highlight: false },
                { text: '- Weekly weight monitoring ongoing', highlight: false }
              ]
            }
          }
        ],
        keyFindings: [
          'Weight loss 12.6% (17 lbs) in 3 months — meets severe weight loss criteria',
          'Albumin 2.9 g/dL and Prealbumin 12 mg/dL — both below normal',
          'PO intake <50% of estimated needs documented by dietitian',
          'Ensure Plus BID and fortified cereal QD ordered as interventions',
          'No malnutrition ICD-10 code on active problem list'
        ],
        recommendedIcd10: [
          { code: 'E44.0', description: 'Moderate protein-calorie malnutrition' },
          { code: 'E46', description: 'Unspecified protein-calorie malnutrition' }
        ]
      },
      diagnosisSummary: 'Nutrition assessment from 1/22 documents moderate protein-calorie malnutrition: 12.6% weight loss in 3 months, PO intake <50%, albumin 2.9, prealbumin 12. No malnutrition ICD-10 code on active problem list.',
      treatmentSummary: 'Ensure Plus 8oz BID, fortified cereal 6oz QD, pureed diet with nectar thick liquids, weekly weights, dietitian follow-up.',
      carePlan: {
        onCarePlan: true,
        items: ['Ensure Plus 8oz BID between meals', 'Weekly weights every Monday AM', 'Dietitian follow-up monthly', 'Calorie count x 3 days if intake worsens']
      }
    },

    'I4300': {
      item: {
        mdsItem: 'I4300',
        itemName: 'Diabetes Mellitus with Peripheral Vascular Disease',
        section: 'I',
        description: 'Active diagnosis of Diabetes Mellitus combined with Peripheral Vascular Disease.',
        status: 'needs_physician_query',
        validation: {
          diagnosisCheck: { passed: true },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'lab_result',
            sourceId: 'doc-006',
            documentName: 'Lab Results',
            displayName: 'Lab Results — 01/18/2026',
            effectiveDate: '2026-01-18',
            quote: 'HbA1c: 8.2%, Fasting glucose: 186 mg/dL, GFR: 42, Creatinine: 1.8',
            rationale: 'Lab values confirming uncontrolled diabetes with renal involvement.'
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-003',
            documentName: 'MD Progress Note',
            displayName: 'MD Progress Note — 01/22/2026',
            effectiveDate: '2026-01-22',
            quote: 'Bilateral lower extremity edema with diminished pedal pulses noted. Continue diabetic foot care protocol. Compression stockings ordered.',
            rationale: 'Physician documentation of peripheral vascular disease symptoms.',
            pageNumber: 1
          },
          {
            sourceType: 'order',
            sourceId: 'mar-001',
            documentName: 'MAR',
            displayName: 'MAR — 01/27/2026',
            effectiveDate: '2026-01-27',
            quote: 'Metformin 500mg PO BID — administered 0800, 1800',
            rationale: 'Active diabetes medication administration.'
          }
        ],
        keyFindings: [
          'DM well documented with HbA1c 8.2%',
          'PVD symptoms noted but no specific ICD-10 on problem list',
          'Metformin 500mg BID + vascular checks per protocol'
        ]
      },
      diagnosisSummary: 'Diabetes well documented with medications and lab monitoring. PVD symptoms noted in progress notes but no specific ICD-10 code on problem list.',
      treatmentSummary: 'Metformin 500mg BID, blood glucose monitoring AC & HS, vascular checks per protocol.',
      carePlan: {
        onCarePlan: true,
        items: ['Blood glucose monitoring AC and HS', 'Diabetic foot care and vascular checks', 'Consistent carbohydrate meal plan']
      }
    },

    'O0400A3': {
      item: {
        mdsItem: 'O0400A3',
        itemName: 'IV Medications',
        section: 'O',
        description: 'IV Medications — received any type of IV medications during the lookback period.',
        status: 'code',
        rationale: 'Vancomycin 1g IV Q12H administered during lookback period for suspected cellulitis.',
        evidence: [
          {
            sourceType: 'order',
            sourceId: 'mar-002',
            documentName: 'MAR',
            displayName: 'MAR — 01/13/2026',
            effectiveDate: '2026-01-13',
            quote: 'Vancomycin 1g IV Q12H — administered 1/12 2200, 1/13 1000, 1/13 2200',
            rationale: 'IV medication administration documented in MAR during lookback period.'
          },
          {
            sourceType: 'progress-note',
            sourceId: 'doc-003',
            documentName: 'MD Progress Note',
            displayName: 'MD Progress Note — 01/12/2026',
            effectiveDate: '2026-01-12',
            quote: 'Started Vancomycin IV for suspected cellulitis. Monitor labs and clinical response.',
            rationale: 'Physician order for IV antibiotic corroborating MAR records.',
            pageNumber: 1
          }
        ]
      },
      diagnosisSummary: null,
      treatmentSummary: 'Vancomycin 1g IV Q12H administered during lookback period for suspected infection.'
    },

    'I2900': {
      item: {
        mdsItem: 'I2900',
        itemName: 'Drug/Medication Induced Depression',
        section: 'I',
        description: 'Drug or medication-induced depression — depression caused by or associated with medication side effects.',
        status: 'dont_code',
        validation: {
          diagnosisCheck: { passed: false },
          treatmentCheck: { passed: false }
        },
        evidence: [
          {
            sourceType: 'progress-note',
            sourceId: 'doc-007',
            documentName: 'Nursing Assessment',
            displayName: 'Nursing Assessment — 01/25/2026',
            effectiveDate: '2026-01-25',
            quote: 'Patient reports feeling down and having little interest in activities. Declined recreational therapy today. States she "just wants to rest."',
            rationale: 'Nursing documentation of depressive symptoms.',
            pageNumber: 1
          }
        ],
        keyFindings: [
          'PHQ-9 not completed during lookback period',
          'Beta-blockers and opioids on profile — depressive side effects possible',
          'Nursing notes mention low mood and decreased activity'
        ]
      },
      diagnosisSummary: 'PHQ-9 not completed during lookback period. Multiple medications on profile (beta-blockers, opioids) associated with depressive side effects. Nursing notes mention low mood.',
      treatmentSummary: 'No active antidepressant therapy. No mental health referral on file.',
      carePlan: { onCarePlan: false }
    },

    'I5100': {
      item: {
        mdsItem: 'I5100',
        itemName: 'Hemiplegia/Hemiparesis',
        section: 'I',
        description: 'Hemiplegia or hemiparesis — paralysis or weakness affecting one side of the body.',
        status: 'code',
        validation: {
          diagnosisCheck: { passed: true },
          treatmentCheck: { passed: true }
        },
        evidence: [
          {
            sourceType: 'progress-note',
            sourceId: 'doc-010',
            documentName: 'PT Evaluation',
            displayName: 'PT Evaluation — 01/06/2026',
            effectiveDate: '2026-01-06',
            quote: 'Left-sided hemiparesis with 2/5 strength in left upper and lower extremities. Requires max assist for transfers and ambulation.',
            rationale: 'PT evaluation documenting hemiparesis severity and functional impact.',
            pageNumber: 1
          }
        ],
        keyFindings: [
          'Left hemiparesis following CVA — well documented',
          '2/5 strength left UE and LE',
          'PT 5x/week + OT 5x/week for functional mobility'
        ]
      },
      diagnosisSummary: 'Left hemiparesis following CVA well documented across PT, OT, and physician notes.',
      treatmentSummary: 'Receiving PT 5x/week and OT 5x/week for functional mobility and ADL training.',
      carePlan: {
        onCarePlan: true,
        items: ['PT 5x/week for functional mobility', 'OT 5x/week for ADL training', 'Fall prevention and safety awareness', 'Transfer training with progressive assist reduction']
      }
    },

    'K0510A': {
      item: {
        mdsItem: 'K0510A',
        itemName: 'Parenteral/IV Feeding',
        section: 'K',
        description: 'Parenteral or IV feeding received during the lookback period.',
        status: 'code',
        rationale: 'IV fluids (D5 1/2NS) administered during lookback period for hydration management.',
        evidence: [
          {
            sourceType: 'order',
            sourceId: 'mar-003',
            documentName: 'MAR',
            displayName: 'MAR — 01/08/2026',
            effectiveDate: '2026-01-08',
            quote: 'D5 1/2NS 1000ml IV at 75ml/hr — running continuously',
            rationale: 'Active IV fluid administration documented in MAR.'
          }
        ]
      },
      diagnosisSummary: null,
      treatmentSummary: 'IV fluids (D5 1/2NS) administered during lookback period for hydration management.'
    },

    // ── Section I items with no existing detail (populated for demo) ──

    'I0100': {
      item: {
        mdsItem: 'I0100', itemName: 'Cancer', section: 'I',
        description: 'I0100 — Does the resident have a current or active diagnosis of cancer?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-040', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'No active cancer diagnosis. History of basal cell carcinoma excised 2019, no recurrence. Last dermatology follow-up 6/2025 — clear.',
            rationale: 'Physician documentation confirming no active cancer.', pageNumber: 1 }
        ],
        keyFindings: ['History of BCC excised 2019 — no recurrence', 'Dermatology follow-up clear 06/2025']
      },
      diagnosisSummary: 'No active cancer diagnosis found. History of basal cell carcinoma excised in 2019 with no recurrence documented.',
      treatmentSummary: 'No active cancer treatment. Routine dermatology follow-up only.',
      carePlan: { onCarePlan: false }
    },

    'I0200': {
      item: {
        mdsItem: 'I0200', itemName: 'Anemia', section: 'I',
        description: 'I0200 — Does the resident have a current diagnosis of anemia (e.g., iron deficiency, B12, folate)?',
        status: 'code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-041', documentName: 'Lab Results', displayName: 'Lab Results — 01/15/2026', effectiveDate: '2026-01-15',
            quote: 'Hemoglobin: 9.8 g/dL (L), Hematocrit: 29.4% (L), MCV: 76 fL (L), Ferritin: 12 ng/mL (L). Iron deficiency anemia.',
            rationale: 'Lab values consistent with iron deficiency anemia.' },
          { sourceType: 'order', sourceId: 'mar-041', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
            quote: 'Ferrous sulfate 325mg PO TID — administered 0800, 1200, 1800.',
            rationale: 'Active iron supplementation for anemia treatment.' }
        ],
        keyFindings: ['Hgb 9.8, Hct 29.4%, Ferritin 12 — iron deficiency anemia', 'Ferrous sulfate 325mg TID active on MAR']
      },
      diagnosisSummary: 'Iron deficiency anemia documented with ICD-10 D50.9. Lab values confirm: Hgb 9.8, Ferritin 12.',
      treatmentSummary: 'Ferrous sulfate 325mg TID. Follow-up labs ordered in 4 weeks.',
      carePlan: {
        onCarePlan: true,
        items: ['Iron supplementation with meals', 'CBC and iron panel recheck in 4 weeks', 'Monitor for signs of GI bleeding']
      }
    },

    'I0300': {
      item: {
        mdsItem: 'I0300', itemName: 'Atrial Fibrillation or Other Dysrhythmias', section: 'I',
        description: 'I0300 — Does the resident have atrial fibrillation or other dysrhythmias?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-042', documentName: 'Cardiology Consult', displayName: 'Cardiology Consult — 12/18/2025', effectiveDate: '2025-12-18',
            quote: 'Normal sinus rhythm on 12-lead ECG. No history of atrial fibrillation or other dysrhythmias. Holter monitor 2025 showed no significant arrhythmias.',
            rationale: 'Cardiology documentation confirming no dysrhythmia.', pageNumber: 1 }
        ],
        keyFindings: ['Normal sinus rhythm on ECG', 'Holter monitor 2025 — no arrhythmias']
      },
      diagnosisSummary: 'No atrial fibrillation or dysrhythmia documented. ECG shows normal sinus rhythm. Holter monitor negative.',
      treatmentSummary: 'No antiarrhythmic therapy required.',
      carePlan: { onCarePlan: false }
    },

    'I0500': {
      item: {
        mdsItem: 'I0500', itemName: 'Deep Venous Thrombosis (DVT)', section: 'I',
        description: 'I0500 — Does the resident have a current diagnosis of deep venous thrombosis (DVT)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-043', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'No history of DVT or PE. Lower extremity edema attributed to venous insufficiency, not thrombotic. Duplex ultrasound 11/2025 negative for DVT.',
            rationale: 'Physician documentation ruling out DVT.', pageNumber: 1 }
        ],
        keyFindings: ['Duplex US 11/2025 negative for DVT', 'LE edema attributed to venous insufficiency']
      },
      diagnosisSummary: 'No DVT documented. Duplex ultrasound 11/2025 negative. Lower extremity edema from venous insufficiency.',
      treatmentSummary: 'No anticoagulation for DVT. Compression stockings for venous insufficiency only.',
      carePlan: { onCarePlan: false }
    },

    'I0600': {
      item: {
        mdsItem: 'I0600', itemName: 'Heart Failure', section: 'I',
        description: 'I0600 — Does the resident have heart failure (e.g., CHF, pulmonary edema)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-044', documentName: 'Cardiology Consult', displayName: 'Cardiology Consult — 12/18/2025', effectiveDate: '2025-12-18',
            quote: 'Echocardiogram 12/2025: LVEF 58%, no wall motion abnormalities, no valvular disease. No clinical evidence of heart failure.',
            rationale: 'Cardiology evaluation ruling out heart failure.', pageNumber: 2 },
          { sourceType: 'progress-note', sourceId: 'doc-045', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'No signs of fluid overload. Lungs clear bilaterally. No peripheral edema concerning for CHF. BNP 45 pg/mL (normal).',
            rationale: 'Physical exam and labs ruling out heart failure.', pageNumber: 1 }
        ],
        keyFindings: ['Echo LVEF 58% — normal', 'BNP 45 pg/mL — normal', 'No signs of fluid overload']
      },
      diagnosisSummary: 'No heart failure documented. Echo shows preserved EF at 58%. BNP within normal limits.',
      treatmentSummary: 'No heart failure therapy. Current cardiac medications for HTN/CAD only.',
      carePlan: { onCarePlan: false }
    },

    'I0800': {
      item: {
        mdsItem: 'I0800', itemName: 'Orthostatic Hypotension', section: 'I',
        description: 'I0800 — Does the resident have orthostatic hypotension?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-046', documentName: 'Nursing Assessment', displayName: 'Nursing Assessment — 01/25/2026', effectiveDate: '2026-01-25',
            quote: 'Orthostatic vitals: Supine 134/80, Standing 128/76 (1 min), 130/78 (3 min). No dizziness or lightheadedness reported. Negative orthostatic screen.',
            rationale: 'Nursing assessment with negative orthostatic vitals.', pageNumber: 1 }
        ],
        keyFindings: ['Orthostatic vitals negative — no significant BP drop', 'No symptoms of dizziness on standing']
      },
      diagnosisSummary: 'No orthostatic hypotension documented. Orthostatic vital signs within normal parameters.',
      treatmentSummary: 'No specific orthostatic hypotension treatment. Fall precautions in place for general safety.',
      carePlan: { onCarePlan: false }
    },

    'I1100': {
      item: {
        mdsItem: 'I1100', itemName: 'Cirrhosis', section: 'I',
        description: 'I1100 — Does the resident have cirrhosis?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-047', documentName: 'Lab Results', displayName: 'Lab Results — 01/15/2026', effectiveDate: '2026-01-15',
            quote: 'LFTs: AST 28 U/L (normal), ALT 22 U/L (normal), Albumin 3.8 g/dL (normal), Total bilirubin 0.9 mg/dL (normal). No evidence of hepatic dysfunction.',
            rationale: 'Normal liver function tests ruling out cirrhosis.' }
        ],
        keyFindings: ['LFTs all within normal limits', 'No hepatic dysfunction documented']
      },
      diagnosisSummary: 'No cirrhosis documented. Liver function tests all within normal range.',
      treatmentSummary: 'No hepatic disease management required.',
      carePlan: { onCarePlan: false }
    },

    'I1200': {
      item: {
        mdsItem: 'I1200', itemName: 'GERD', section: 'I',
        description: 'I1200 — Does the resident have gastroesophageal reflux disease (GERD)?',
        status: 'code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-048', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'GERD well controlled on current PPI. No breakthrough symptoms. Continue omeprazole 20mg daily.',
            rationale: 'Physician documentation of active GERD with treatment.', pageNumber: 1 },
          { sourceType: 'order', sourceId: 'mar-048', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
            quote: 'Omeprazole 20mg PO daily — administered 0730 (30 min before breakfast).',
            rationale: 'Active PPI therapy for GERD.' }
        ],
        keyFindings: ['GERD on active problem list with ICD-10 K21.0', 'Omeprazole 20mg daily — well controlled']
      },
      diagnosisSummary: 'GERD well documented on problem list. Active PPI therapy with good symptom control.',
      treatmentSummary: 'Omeprazole 20mg daily. Dietary modifications — elevated HOB, no late meals.',
      carePlan: {
        onCarePlan: true,
        items: ['PPI administered 30 min before breakfast', 'HOB elevated 30 degrees at night', 'Avoid late meals — nothing 3 hours before bed']
      }
    },

    'I2100': {
      item: {
        mdsItem: 'I2100', itemName: 'Thyroid Disorder', section: 'I',
        description: 'I2100 — Does the resident have a thyroid disorder (e.g., hypothyroidism, hyperthyroidism)?',
        status: 'code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-049', documentName: 'Lab Results', displayName: 'Lab Results — 01/15/2026', effectiveDate: '2026-01-15',
            quote: 'TSH: 6.8 mIU/L (H), Free T4: 0.7 ng/dL (L-normal). Subclinical hypothyroidism on levothyroxine therapy.',
            rationale: 'Lab values confirming hypothyroidism under treatment.' },
          { sourceType: 'order', sourceId: 'mar-049', documentName: 'MAR', displayName: 'MAR — 01/27/2026', effectiveDate: '2026-01-27',
            quote: 'Levothyroxine 75mcg PO daily — administered 0630 (on empty stomach, 30 min before food).',
            rationale: 'Active thyroid replacement therapy.' }
        ],
        keyFindings: ['TSH 6.8 — suboptimally controlled hypothyroidism', 'Levothyroxine 75mcg daily active on MAR']
      },
      diagnosisSummary: 'Hypothyroidism documented with ICD-10 E03.9. TSH 6.8 on latest labs — dose adjustment may be needed.',
      treatmentSummary: 'Levothyroxine 75mcg daily. TSH recheck ordered in 6 weeks.',
      carePlan: {
        onCarePlan: true,
        items: ['Levothyroxine on empty stomach at 0630', 'TSH recheck in 6 weeks', 'Hold calcium/iron 4 hours after dose']
      }
    },

    'I2300': {
      item: {
        mdsItem: 'I2300', itemName: 'Hyperglycemia', section: 'I',
        description: 'I2300 — Does the resident have hyperglycemia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-050', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'Blood glucose elevations are attributed to known diabetes mellitus (I2000), not a separate hyperglycemia diagnosis. Covered under DM management plan.',
            rationale: 'Glucose elevations accounted for under DM diagnosis.', pageNumber: 1 }
        ],
        keyFindings: ['Glucose elevations managed under DM (I2000)', 'No separate hyperglycemia diagnosis']
      },
      diagnosisSummary: 'No separate hyperglycemia diagnosis. Blood glucose elevations managed under diabetes mellitus (I2000).',
      treatmentSummary: 'Glucose management covered under DM treatment plan — metformin, sliding scale, monitoring.',
      carePlan: { onCarePlan: false }
    },

    'I4200': {
      item: {
        mdsItem: 'I4200', itemName: 'Multi-Drug Resistant Organism (MDRO)', section: 'I',
        description: 'I4200 — Does the resident have an infection with a multi-drug resistant organism (MDRO)?',
        status: 'code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-051', documentName: 'Microbiology Report', displayName: 'Microbiology Report — 01/10/2026', effectiveDate: '2026-01-10',
            quote: 'Urine culture: E. coli >100,000 CFU/mL. ESBL-producing. Resistant to ampicillin, ciprofloxacin, TMP-SMX. Sensitive to meropenem, nitrofurantoin.',
            rationale: 'Culture confirming ESBL-producing E. coli — qualifies as MDRO.' },
          { sourceType: 'order', sourceId: 'mar-051', documentName: 'MAR', displayName: 'MAR — 01/12/2026', effectiveDate: '2026-01-12',
            quote: 'Nitrofurantoin 100mg PO BID x 7 days — started 01/12. Contact precautions initiated per infection control protocol.',
            rationale: 'Active antibiotic treatment for MDRO infection.' }
        ],
        keyFindings: ['ESBL-producing E. coli in urine culture', 'Contact precautions initiated', 'Treated with nitrofurantoin 100mg BID']
      },
      diagnosisSummary: 'MDRO infection documented: ESBL-producing E. coli UTI confirmed by culture 01/10/2026.',
      treatmentSummary: 'Nitrofurantoin 100mg BID x 7 days. Contact precautions per infection control protocol.',
      carePlan: {
        onCarePlan: true,
        items: ['Contact precautions per infection control', 'Antibiotic with food to reduce GI upset', 'Repeat urine culture after antibiotics complete', 'Monitor for C. diff symptoms']
      }
    },

    'I4400': {
      item: {
        mdsItem: 'I4400', itemName: 'Pneumonia', section: 'I',
        description: 'I4400 — Does the resident have pneumonia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-052', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'Lungs clear to auscultation bilaterally. No cough, fever, or respiratory distress. Chest X-ray 01/05 — no infiltrates. No active pneumonia.',
            rationale: 'Clinical exam and imaging ruling out pneumonia.', pageNumber: 1 }
        ],
        keyFindings: ['Lungs CTA bilaterally', 'CXR 01/05 — no infiltrates', 'No respiratory symptoms']
      },
      diagnosisSummary: 'No pneumonia documented. Chest X-ray clear, lungs clear on exam, no respiratory symptoms.',
      treatmentSummary: 'No pneumonia treatment. Pneumococcal and influenza vaccines up to date.',
      carePlan: { onCarePlan: false }
    },

    'I4500': {
      item: {
        mdsItem: 'I4500', itemName: 'Septicemia', section: 'I',
        description: 'I4500 — Does the resident have septicemia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-053', documentName: 'Lab Results', displayName: 'Lab Results — 01/15/2026', effectiveDate: '2026-01-15',
            quote: 'WBC: 7.2 (normal), Lactate: 1.1 mmol/L (normal), Procalcitonin: 0.04 ng/mL (normal). Blood cultures 01/10 — no growth at 5 days.',
            rationale: 'Labs and cultures ruling out septicemia.' }
        ],
        keyFindings: ['Blood cultures negative at 5 days', 'WBC, lactate, procalcitonin all normal']
      },
      diagnosisSummary: 'No septicemia documented. Blood cultures negative, inflammatory markers normal.',
      treatmentSummary: 'No sepsis treatment. UTI treated with targeted antibiotics only.',
      carePlan: { onCarePlan: false }
    },

    'I4900': {
      item: {
        mdsItem: 'I4900', itemName: 'Schizophrenia', section: 'I',
        description: 'I4900 — Does the resident have schizophrenia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-054', documentName: 'Psychiatric Evaluation', displayName: 'Psychiatric Evaluation — 12/15/2025', effectiveDate: '2025-12-15',
            quote: 'No history of schizophrenia or psychotic disorders. Psychiatric review of systems negative for hallucinations, delusions, or disorganized thinking.',
            rationale: 'Psychiatric evaluation confirming no schizophrenia.', pageNumber: 1 }
        ],
        keyFindings: ['Psychiatric evaluation negative for psychotic disorders', 'No antipsychotic medications on profile']
      },
      diagnosisSummary: 'No schizophrenia documented. Psychiatric evaluation negative for psychotic symptoms.',
      treatmentSummary: 'No antipsychotic medications prescribed.',
      carePlan: { onCarePlan: false }
    },

    'I5200': {
      item: {
        mdsItem: 'I5200', itemName: 'Paraplegia', section: 'I',
        description: 'I5200 — Does the resident have paraplegia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-055', documentName: 'PT Evaluation', displayName: 'PT Evaluation — 01/06/2026', effectiveDate: '2026-01-06',
            quote: 'Left hemiparesis noted (see I5100) but bilateral lower extremity function preserved. Patient ambulates with rolling walker and min assist. No paraplegia.',
            rationale: 'PT evaluation confirming no paraplegia.', pageNumber: 1 }
        ],
        keyFindings: ['Bilateral LE function preserved', 'Ambulates with walker and min assist']
      },
      diagnosisSummary: 'No paraplegia documented. Left hemiparesis (I5100) but both lower extremities functional.',
      treatmentSummary: 'PT 5x/week for mobility. No paraplegia-specific treatment needed.',
      carePlan: { onCarePlan: false }
    },

    'I5250': {
      item: {
        mdsItem: 'I5250', itemName: 'Quadriplegia', section: 'I',
        description: 'I5250 — Does the resident have quadriplegia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-056', documentName: 'PT Evaluation', displayName: 'PT Evaluation — 01/06/2026', effectiveDate: '2026-01-06',
            quote: 'Right upper and lower extremities with full strength 5/5. Left-sided weakness 2-3/5 from CVA. No quadriplegia — functional use of right side.',
            rationale: 'PT documentation ruling out quadriplegia.', pageNumber: 1 }
        ],
        keyFindings: ['Right side full strength 5/5', 'Left side weakness from CVA only — not quadriplegia']
      },
      diagnosisSummary: 'No quadriplegia documented. Right-sided extremities with full strength. Left hemiparesis only.',
      treatmentSummary: 'No quadriplegia-specific interventions. PT/OT for left-sided weakness.',
      carePlan: { onCarePlan: false }
    },

    'I5300': {
      item: {
        mdsItem: 'I5300', itemName: 'Aphasia', section: 'I',
        description: 'I5300 — Does the resident have aphasia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-057', documentName: 'SLP Evaluation', displayName: 'SLP Evaluation — 01/20/2026', effectiveDate: '2026-01-20',
            quote: 'No aphasia documented. Communication intact. Swallowing evaluation only — dysphagia noted but language function preserved.',
            rationale: 'SLP evaluation found no aphasia.', pageNumber: 1 }
        ],
        keyFindings: ['No aphasia documented in clinical records', 'Communication abilities intact per SLP evaluation']
      },
      diagnosisSummary: 'No aphasia documented. SLP evaluation focused on swallowing/dysphagia only.',
      treatmentSummary: 'No aphasia-specific therapy. SLP treating dysphagia only.',
      carePlan: { onCarePlan: false }
    },

    'I5350': {
      item: {
        mdsItem: 'I5350', itemName: 'Non-Alzheimer Dementia', section: 'I',
        description: 'I5350 — Does the resident have non-Alzheimer dementia (e.g., vascular, Lewy body)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-058', documentName: 'Neurology Consult', displayName: 'Neurology Consult — 12/20/2025', effectiveDate: '2025-12-20',
            quote: 'MMSE 22/30 — mild cognitive impairment likely related to CVA sequelae. Does not meet criteria for dementia diagnosis at this time. Monitor and reassess in 3 months.',
            rationale: 'Neurology evaluation — cognitive impairment from CVA but not dementia.', pageNumber: 2 }
        ],
        keyFindings: ['MMSE 22/30 — mild cognitive impairment', 'CVA-related, not dementia per neurology', 'Reassess in 3 months']
      },
      diagnosisSummary: 'No non-Alzheimer dementia documented. Mild cognitive impairment from CVA — does not meet dementia criteria per neurology.',
      treatmentSummary: 'Cognitive stimulation activities. Neurology follow-up in 3 months for reassessment.',
      carePlan: { onCarePlan: false }
    },

    'I5400': {
      item: {
        mdsItem: 'I5400', itemName: 'Alzheimer Disease', section: 'I',
        description: 'I5400 — Does the resident have Alzheimer disease?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-059', documentName: 'Neurology Consult', displayName: 'Neurology Consult — 12/20/2025', effectiveDate: '2025-12-20',
            quote: 'No clinical features suggestive of Alzheimer disease. Cognitive changes are acute post-CVA, not progressive degenerative pattern. No cholinesterase inhibitors indicated.',
            rationale: 'Neurology ruling out Alzheimer disease.', pageNumber: 2 }
        ],
        keyFindings: ['Cognitive changes acute post-CVA, not progressive', 'No Alzheimer features per neurology']
      },
      diagnosisSummary: 'No Alzheimer disease documented. Cognitive impairment attributed to CVA, not neurodegenerative disease.',
      treatmentSummary: 'No Alzheimer-specific medications. No cholinesterase inhibitors or memantine.',
      carePlan: { onCarePlan: false }
    },

    'I5500': {
      item: {
        mdsItem: 'I5500', itemName: 'Multiple Sclerosis', section: 'I',
        description: 'I5500 — Does the resident have multiple sclerosis (MS)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-060', documentName: 'Neurology Consult', displayName: 'Neurology Consult — 12/20/2025', effectiveDate: '2025-12-20',
            quote: 'No history of multiple sclerosis. Left-sided weakness is consistent with ischemic stroke, not demyelinating disease. MRI brain shows old infarct, no white matter lesions.',
            rationale: 'Neurology ruling out MS — findings consistent with stroke.', pageNumber: 3 }
        ],
        keyFindings: ['MRI — old infarct, no MS-type white matter lesions', 'Weakness from stroke, not demyelination']
      },
      diagnosisSummary: 'No multiple sclerosis documented. MRI shows old infarct only, no demyelinating lesions.',
      treatmentSummary: 'No MS disease-modifying therapy. Neurological deficits managed as CVA sequelae.',
      carePlan: { onCarePlan: false }
    },

    'I5700': {
      item: {
        mdsItem: 'I5700', itemName: 'Schizophrenia (Section I)', section: 'I',
        description: 'I5700 — Does the resident have schizophrenia?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-061', documentName: 'Psychiatric Evaluation', displayName: 'Psychiatric Evaluation — 12/15/2025', effectiveDate: '2025-12-15',
            quote: 'No history or symptoms of schizophrenia. See I4900 evaluation. Mental status exam: oriented x3, no psychotic features, thought process linear and goal-directed.',
            rationale: 'Psychiatric evaluation negative for schizophrenia.', pageNumber: 1 }
        ],
        keyFindings: ['No psychotic features on mental status exam', 'Thought process linear and goal-directed']
      },
      diagnosisSummary: 'No schizophrenia. Psychiatric evaluation negative — no psychotic symptoms.',
      treatmentSummary: 'No antipsychotic medications. No psychiatric treatment for psychosis.',
      carePlan: { onCarePlan: false }
    },

    'I5800': {
      item: {
        mdsItem: 'I5800', itemName: 'Anxiety Disorder', section: 'I',
        description: 'I5800 — Does the resident have an anxiety disorder?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-062', documentName: 'Psychiatric Evaluation', displayName: 'Psychiatric Evaluation — 12/15/2025', effectiveDate: '2025-12-15',
            quote: 'GAD-7 score: 4 (minimal anxiety). Patient reports occasional worry about health but no panic attacks, avoidance behaviors, or functional impairment from anxiety.',
            rationale: 'Psychiatric screening negative for anxiety disorder.', pageNumber: 1 }
        ],
        keyFindings: ['GAD-7 score 4 — minimal anxiety', 'No panic attacks or avoidance behaviors']
      },
      diagnosisSummary: 'No anxiety disorder documented. GAD-7 score 4 — minimal, subclinical anxiety only.',
      treatmentSummary: 'No anxiolytic medications. Supportive counseling available PRN.',
      carePlan: { onCarePlan: false }
    },

    'I5900': {
      item: {
        mdsItem: 'I5900', itemName: 'PTSD', section: 'I',
        description: 'I5900 — Does the resident have post-traumatic stress disorder (PTSD)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-063', documentName: 'Psychiatric Evaluation', displayName: 'Psychiatric Evaluation — 12/15/2025', effectiveDate: '2025-12-15',
            quote: 'No history of PTSD. Patient denies traumatic experiences, nightmares, flashbacks, or hypervigilance. PC-PTSD-5 screen negative.',
            rationale: 'PTSD screening negative.', pageNumber: 2 }
        ],
        keyFindings: ['PC-PTSD-5 screen negative', 'No trauma history, nightmares, or flashbacks']
      },
      diagnosisSummary: 'No PTSD documented. Screening negative — no traumatic stress symptoms.',
      treatmentSummary: 'No PTSD-specific treatment or trauma-focused therapy.',
      carePlan: { onCarePlan: false }
    },

    'I5950': {
      item: {
        mdsItem: 'I5950', itemName: 'Psychotic Disorder', section: 'I',
        description: 'I5950 — Does the resident have a psychotic disorder (other than schizophrenia)?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-064', documentName: 'Psychiatric Evaluation', displayName: 'Psychiatric Evaluation — 12/15/2025', effectiveDate: '2025-12-15',
            quote: 'No psychotic features identified. No hallucinations (auditory or visual), no delusions, no disorganized speech. Reality testing intact.',
            rationale: 'Psychiatric evaluation ruling out psychotic disorder.', pageNumber: 1 }
        ],
        keyFindings: ['No hallucinations or delusions', 'Reality testing intact']
      },
      diagnosisSummary: 'No psychotic disorder documented. Psychiatric evaluation — no hallucinations, delusions, or disorganized thinking.',
      treatmentSummary: 'No antipsychotic medications. No psychosis treatment.',
      carePlan: { onCarePlan: false }
    },

    'I6000': {
      item: {
        mdsItem: 'I6000', itemName: 'Asthma / COPD / Chronic Lung Disease', section: 'I',
        description: 'I6000 — Does the resident have asthma, COPD, or chronic lung disease?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-065', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'Lungs clear to auscultation bilaterally. No wheezing, rhonchi, or prolonged expiratory phase. No history of asthma, COPD, or chronic lung disease. SpO2 97% on room air.',
            rationale: 'Clinical exam negative for chronic lung disease.', pageNumber: 1 },
          { sourceType: 'progress-note', sourceId: 'doc-066', documentName: 'Chest X-Ray Report', displayName: 'Chest X-Ray — 01/05/2026', effectiveDate: '2026-01-05',
            quote: 'Lungs clear bilaterally. No hyperinflation. Normal cardiac silhouette. No pleural effusion.',
            rationale: 'Chest imaging with no evidence of chronic lung disease.' }
        ],
        keyFindings: ['Lungs CTA — no wheezing or rhonchi', 'SpO2 97% on room air', 'CXR — no hyperinflation or chronic changes']
      },
      diagnosisSummary: 'No asthma, COPD, or chronic lung disease documented. Lungs clear, SpO2 97%, imaging normal.',
      treatmentSummary: 'No bronchodilators or inhaled corticosteroids. No supplemental oxygen.',
      carePlan: { onCarePlan: false }
    },

    'I6100': {
      item: {
        mdsItem: 'I6100', itemName: 'Respiratory Failure', section: 'I',
        description: 'I6100 — Does the resident have respiratory failure?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-067', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'Respiratory status stable. SpO2 97% on room air. No supplemental oxygen required. ABG not indicated — no clinical concern for respiratory failure.',
            rationale: 'Clinical assessment ruling out respiratory failure.', pageNumber: 1 }
        ],
        keyFindings: ['SpO2 97% on room air — no supplemental O2', 'No respiratory distress or failure']
      },
      diagnosisSummary: 'No respiratory failure documented. Oxygenation adequate on room air.',
      treatmentSummary: 'No supplemental oxygen. No respiratory support devices.',
      carePlan: { onCarePlan: false }
    },

    'I6200': {
      item: {
        mdsItem: 'I6200', itemName: 'None of the Above (Respiratory)', section: 'I',
        description: 'I6200 — None of the above respiratory conditions.',
        status: 'dont_code',
        evidence: [],
        rationale: 'No respiratory conditions identified in I6000-I6100. This is a confirmation item.'
      },
      diagnosisSummary: null,
      treatmentSummary: null
    },

    'I6300': {
      item: {
        mdsItem: 'I6300', itemName: 'None of the Above (Additional)', section: 'I',
        description: 'I6300 — None of the above additional conditions.',
        status: 'dont_code',
        evidence: [],
        rationale: 'Confirmation item — no additional conditions in this category.'
      },
      diagnosisSummary: null,
      treatmentSummary: null
    },

    'I6500': {
      item: {
        mdsItem: 'I6500', itemName: 'Seizure Disorder / Epilepsy', section: 'I',
        description: 'I6500 — Does the resident have a seizure disorder or epilepsy?',
        status: 'dont_code',
        validation: { diagnosisCheck: { passed: true }, treatmentCheck: { passed: true } },
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-068', documentName: 'Neurology Consult', displayName: 'Neurology Consult — 12/20/2025', effectiveDate: '2025-12-20',
            quote: 'No seizure history. Post-CVA prophylactic seizure medication not indicated per current guidelines. EEG not required. No witnessed seizure activity.',
            rationale: 'Neurology evaluation confirming no seizure disorder.', pageNumber: 3 }
        ],
        keyFindings: ['No seizure history', 'No prophylactic anticonvulsants indicated post-CVA', 'No witnessed seizure activity']
      },
      diagnosisSummary: 'No seizure disorder or epilepsy documented. Neurology evaluation negative.',
      treatmentSummary: 'No anticonvulsant medications. No seizure precautions beyond standard post-CVA monitoring.',
      carePlan: { onCarePlan: false }
    },

    'I7900': {
      item: {
        mdsItem: 'I7900', itemName: 'None of the Above (Neurological)', section: 'I',
        description: 'I7900 — None of the above neurological conditions (besides those already coded).',
        status: 'dont_code',
        evidence: [],
        rationale: 'Hemiparesis (I5100) and Malnutrition (I5600) are coded. No additional neurological conditions apply.'
      },
      diagnosisSummary: null,
      treatmentSummary: null
    },

    'I8000': {
      item: {
        mdsItem: 'I8000', itemName: 'Additional Active Diagnoses', section: 'I',
        description: 'I8000 — Does the resident have additional active diagnoses not captured above?',
        status: 'dont_code',
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-069', documentName: 'MD Progress Note', displayName: 'MD Progress Note — 01/22/2026', effectiveDate: '2026-01-22',
            quote: 'Active problem list reviewed. All active diagnoses captured in Sections I0100-I7900. CKD Stage 3, Obesity, and Chronic pain documented in problem list but not MDS-reportable in Section I.',
            rationale: 'Physician review confirming all Section I diagnoses captured.', pageNumber: 1 }
        ],
        keyFindings: ['All Section I diagnoses captured above', 'CKD Stage 3, Obesity, Chronic pain on problem list — not Section I items']
      },
      diagnosisSummary: 'No additional Section I diagnoses to capture. Other active conditions (CKD, obesity, chronic pain) not reportable here.',
      treatmentSummary: 'All active treatments documented under their respective Section I items.',
      carePlan: { onCarePlan: false }
    }
  },

  // ════════════════════════════════════════════
  // QUERYABLE ITEMS (useQueryItems)
  // ════════════════════════════════════════════
  queryableItems: {
    assessment: {
      id: '4860265',
      externalAssessmentId: '4860265',
      patientId: '2657226',
      patientName: 'Doe, Jane',
      description: 'Quarterly',
      ardDate: '2026-01-13'
    },
    summary: {
      totalItems: 6,
      queryRecommended: 3,
      alreadyCoded: 1,
      recommendCoding: 2
    },
    items: [
      {
        mdsItem: 'I5600',
        mdsItemName: 'Malnutrition',
        pdpmCategoryName: 'Malnutrition',
        section: 'I',
        solverStatus: 'needs_physician_query',
        confidence: 0.95,
        rationale: 'Nutrition assessment documents significant weight loss (12.6%), low albumin (2.9) and prealbumin (12), PO intake <50%. No malnutrition ICD-10 code on active problem list — physician confirmation needed.',
        keyFindings: [
          'Weight loss 12.6% (17 lbs) in 3 months — severe',
          'Albumin 2.9 g/dL, Prealbumin 12 mg/dL — both low',
          'PO intake <50% of estimated needs',
          'Ensure Plus BID and fortified cereal ordered',
          'No malnutrition ICD-10 on problem list'
        ],
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-nutr-001', quote: 'Weight Loss: 17 lbs (12.6%) in past 3 months. PO Intake < 50%. Moderate protein-calorie malnutrition.', documentName: 'Nutrition Progress Note' },
          { sourceType: 'lab_result', sourceId: 'doc-nutr-002', quote: 'Albumin: 2.9 g/dL (Low), Prealbumin: 12 mg/dL (Low)', documentName: 'Nutrition Lab Panel' }
        ],
        queryEvidence: [
          { sourceType: 'progress-note', sourceId: 'doc-nutr-001', quote: 'Weight Loss: 17 lbs (12.6%) in past 3 months. Moderate protein-calorie malnutrition diagnosed based on significant unintentional weight loss, inadequate oral intake, and low albumin/prealbumin.', documentName: 'Nutrition Progress Note', effectiveDate: '2026-01-22' },
          { sourceType: 'lab_result', sourceId: 'doc-nutr-002', quote: 'Albumin: 2.9 g/dL (Low), Prealbumin: 12 mg/dL (Low). Low values suggest malnutrition.', documentName: 'Nutrition Lab Panel', effectiveDate: '2026-01-20' },
          { sourceType: 'order', sourceId: 'doc-nutr-004', quote: 'Ensure Plus 8oz BID with meals for nutritional supplementation', documentName: 'MAR - Ensure Plus', effectiveDate: '2026-01-22' }
        ],
        recommendedIcd10: [
          { code: 'E44.0', description: 'Moderate protein-calorie malnutrition' },
          { code: 'E46', description: 'Unspecified protein-calorie malnutrition' }
        ],
        existingQuery: null
      },
      {
        mdsItem: 'I4300',
        mdsItemName: 'Diabetes with PVD',
        pdpmCategoryName: 'Diabetes with Peripheral Vascular Disease',
        section: 'I',
        solverStatus: 'needs_physician_query',
        confidence: 0.85,
        rationale: 'Lab results confirm diabetes. PVD symptoms documented but no specific PVD ICD-10 code. Physician query needed to confirm combination diagnosis.',
        keyFindings: [
          'HbA1c 8.2% — uncontrolled diabetes',
          'Diminished pedal pulses documented',
          'No PVD diagnosis on problem list'
        ],
        evidence: [
          { sourceType: 'lab_result', sourceId: 'doc-081', quote: 'HbA1c: 8.2%, GFR: 42', documentName: 'Lab Results' },
          { sourceType: 'progress-note', sourceId: 'doc-082', quote: 'Bilateral lower extremity edema with diminished pedal pulses.', documentName: 'MD Progress Note' }
        ],
        queryEvidence: [
          { sourceType: 'lab_result', sourceId: 'doc-081', quote: 'HbA1c: 8.2%, Fasting glucose: 186 mg/dL', documentName: 'Lab Results', effectiveDate: '2026-01-18' },
          { sourceType: 'progress-note', sourceId: 'doc-082', quote: 'Bilateral lower extremity edema with diminished pedal pulses noted.', documentName: 'MD Progress Note', effectiveDate: '2026-01-22' }
        ],
        recommendedIcd10: [
          { code: 'E11.51', description: 'Type 2 DM with diabetic peripheral angiopathy' }
        ],
        existingQuery: null
      },
      {
        mdsItem: 'I2900',
        mdsItemName: 'Drug/Medication Induced Depression',
        pdpmCategoryName: 'Drug/Medication Induced Depression',
        section: 'I',
        solverStatus: 'needs_physician_query',
        confidence: 0.72,
        rationale: 'PHQ-9 missing. Nursing notes document depressive symptoms. Multiple medications with depressive side-effect profiles on MAR.',
        keyFindings: [
          'PHQ-9 assessment not completed',
          'Patient reports feeling down',
          'Multiple medications with depression side effects'
        ],
        evidence: [
          { sourceType: 'progress-note', sourceId: 'doc-083', quote: 'Patient reports feeling down and having little interest in activities.', documentName: 'Nursing Assessment' }
        ],
        queryEvidence: [
          { sourceType: 'progress-note', sourceId: 'doc-083', quote: 'Patient reports feeling down and having little interest in activities. Declined recreational therapy.', documentName: 'Nursing Assessment', effectiveDate: '2026-01-25' }
        ],
        recommendedIcd10: [
          { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' }
        ],
        existingQuery: null
      },
      {
        mdsItem: 'O0400A3',
        mdsItemName: 'IV Medications',
        pdpmCategoryName: 'IV Medications',
        section: 'O',
        solverStatus: 'recommend_coding',
        confidence: 0.95,
        rationale: 'MAR confirms IV antibiotic administration during lookback period. This is a treatment item — can be coded based on documentation without physician query.',
        keyFindings: [
          'Vancomycin IV administered during lookback',
          'Physician order on file',
          'Can be coded without query'
        ],
        evidence: [
          { sourceType: 'order', sourceId: 'order-080', quote: 'Vancomycin 1g IV Q12H — administered 1/12, 1/13', documentName: 'MAR' }
        ],
        queryEvidence: [],
        recommendedIcd10: [],
        existingQuery: null
      },
      {
        mdsItem: 'I4900',
        mdsItemName: 'Schizophrenia',
        pdpmCategoryName: 'Schizophrenia',
        section: 'I',
        solverStatus: 'needs_physician_query',
        confidence: 0.45,
        rationale: 'Historical mention in old discharge summary. No recent documentation supporting active diagnosis.',
        keyFindings: [
          'Historical mention only',
          'No active symptoms documented',
          'Query already sent'
        ],
        evidence: [],
        queryEvidence: [],
        recommendedIcd10: [
          { code: 'F20.9', description: 'Schizophrenia, unspecified' }
        ],
        existingQuery: {
          id: 'q-003',
          status: 'sent',
          sentAt: new Date(Date.now() - 2 * 86400000).toISOString()
        }
      },
      {
        mdsItem: 'E11.9',
        mdsItemName: 'Type 2 Diabetes Mellitus',
        pdpmCategoryName: 'Diabetes Mellitus',
        section: 'I',
        solverStatus: 'already_coded',
        confidence: 0.98,
        rationale: 'E11.9 is on active problem list and well documented in clinical records.',
        keyFindings: [
          'ICD-10 E11.9 on problem list',
          'Active medications (Metformin)',
          'Lab monitoring in place'
        ],
        evidence: [
          { sourceType: 'diagnosis_list', quote: 'E11.9 - Type 2 Diabetes Mellitus without complications', documentName: 'Active Problem List' }
        ],
        queryEvidence: [],
        recommendedIcd10: [],
        existingQuery: null
      }
    ]
  },

  // ════════════════════════════════════════════
  // PRACTITIONERS (useBatchQuery)
  // ════════════════════════════════════════════
  practitioners: [
    {
      id: 'pract-001',
      firstName: 'Demo',
      lastName: 'Provider',
      title: 'MD',
      name: 'Dr. Demo Provider',
      phone: '555-0101'
    },
    {
      id: 'pract-002',
      firstName: 'Sample',
      lastName: 'Doctor',
      title: 'DO',
      name: 'Dr. Sample Doctor',
      phone: '555-0102'
    },
    {
      id: 'pract-003',
      firstName: 'Jane',
      lastName: 'Specialist',
      title: 'NP',
      name: 'Jane Specialist, NP',
      phone: '555-0103'
    }
  ],

  // ════════════════════════════════════════════════════════════════════════════
  // ARD RECOMMENDATION (useArdEstimator)
  // 14-day ARD window for Doe, Jane (admit 2026-01-10).
  //
  // Patient story: post-acute SNF admission after pneumonia w/ sepsis.
  // Hospital stay 2026-01-08 → 2026-01-10 included IV vancomycin + IV fluids.
  // Active comorbidities: Type 2 DM, HTN, CAD, mild PVD, mild CHF, COPD,
  // mild expressive aphasia (post-stroke 2024), depression (home meds),
  // mechanically altered (puree) diet.
  //
  // PDPM NTA point ceiling (FY2025 CMS), if every item is captured:
  //   I2900 Diabetes ........... 2
  //   I6100 COPD ............... 2
  //   I2000 Pneumonia .......... 1
  //   I2100 Septicemia ......... 2
  //   I4300 Aphasia ............ 1
  //   O0110H1 IV Medications ... 5  (7-day lookback before ARD)
  //   ── total ──────────────── 13   → NTA Level NA (≥12)
  // Without IV meds capture: 8  → NTA Level NC (6–8)
  //
  // Day-by-day evolution (key milestones):
  //   Days 1–3: PHQ-9 not yet administered, query responses for pneumonia /
  //             sepsis / IV meds not back. Only diagnoses on hospital
  //             face-sheet count (DM, COPD, aphasia) ⇒ 5 NTA pts (NE).
  //             Nursing = "Clinically Complex" (CBC1) — no PHQ-9 → no
  //             depression-end-split bump.
  //   Day 4   : PHQ-9 done (D0150 score 9). Pneumonia + Septicemia
  //             query responses returned ⇒ +3 NTA → 8 pts (NC).
  //             Depression coded → nursing CDE end-split bump.
  //   Day 5–7 : IV-medication query response returned (+5 NTA) → 13 pts
  //             (NA). RECOMMENDED ARD WINDOW.  IV med 7-day lookback still
  //             includes hospital admin on 2026-01-10.
  //   Day 8   : Lookback 1/2 → 1/8 plus ARD = 1/17 covers hospital IV meds
  //             on 1/8–1/10 — still capturable.
  //   Day 9+  : Lookback no longer reaches 1/10 → O0110H1 lost (-5 NTA),
  //             back down to 8 pts (NC).
  // ════════════════════════════════════════════════════════════════════════════
  ardRecommendation: {
    success: true,
    externalAssessmentId: '4860265',
    admissionDate: '2026-01-10',
    recommendedDayNumber: 5,
    potentialPpd: 612,        // achievable ceiling at recommended day
    potentialNtaPoints: 12,   // I2900(2) + I6200(2) + I1700(1) + I2500(2) + O0110H1b(5) = 12 → NA
    sectionsMissing: [],
    scores: [
      // Day 1 (admit night): face-sheet dx only. NTA = DM(2) + COPD(2) = 4 → ND.
      // Nursing: pneumonia/sepsis treated at hospital, vitals stable on
      //   admit. PHQ-9 not done yet. Maps to Reduced Physical Function (PA1)
      //   with low function score until SCH triggers fire.
      {
        dayNumber: 1, dayDate: '2026-01-10',
        hippsCode: 'PDC11', estimatedPpd: 478,
        nursingMainCategory: 'Reduced Physical Function', nursingPaymentGroup: 'PBC1',
        ntaLevel: 'ND', ntaPoints: 4,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      // Days 2–3: SNF vanco given on Day 2 → O0110H1b captures (+5 NTA → 9, NB).
      //   Still pre-PHQ-9, MDRO/wound queries pending.
      {
        dayNumber: 2, dayDate: '2026-01-11',
        hippsCode: 'PDB11', estimatedPpd: 522,
        nursingMainCategory: 'Reduced Physical Function', nursingPaymentGroup: 'PBC1',
        ntaLevel: 'NB', ntaPoints: 9,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      {
        dayNumber: 3, dayDate: '2026-01-12',
        hippsCode: 'PDB11', estimatedPpd: 522,
        nursingMainCategory: 'Reduced Physical Function', nursingPaymentGroup: 'PBC1',
        ntaLevel: 'NB', ntaPoints: 9,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      // Day 4: PHQ-9 done (score 11) → depression. Pneumonia+fever (J1550A)
      //   triggers Special Care High nursing → HBC2 (function 6–10, with
      //   depression). MDRO query back+ → +1 NTA (10 pts, still NB).
      {
        dayNumber: 4, dayDate: '2026-01-13',
        hippsCode: 'HDB21', estimatedPpd: 580,
        nursingMainCategory: 'Special Care High', nursingPaymentGroup: 'HBC2',
        ntaLevel: 'NB', ntaPoints: 10,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      // Day 5 (RECOMMENDED): wound-infection query back+ → +2 NTA = 12 → NA.
      //   All time-sensitive items captured.
      {
        dayNumber: 5, dayDate: '2026-01-14',
        hippsCode: 'HDA21', estimatedPpd: 612,
        nursingMainCategory: 'Special Care High', nursingPaymentGroup: 'HBC2',
        ntaLevel: 'NA', ntaPoints: 12,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      {
        dayNumber: 6, dayDate: '2026-01-15',
        hippsCode: 'HDA21', estimatedPpd: 612,
        nursingMainCategory: 'Special Care High', nursingPaymentGroup: 'HBC2',
        ntaLevel: 'NA', ntaPoints: 12,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      {
        dayNumber: 7, dayDate: '2026-01-16',
        hippsCode: 'HDA21', estimatedPpd: 612,
        nursingMainCategory: 'Special Care High', nursingPaymentGroup: 'HBC2',
        ntaLevel: 'NA', ntaPoints: 12,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
      {
        dayNumber: 8, dayDate: '2026-01-17',
        hippsCode: 'HDA21', estimatedPpd: 612,
        nursingMainCategory: 'Special Care High', nursingPaymentGroup: 'HBC2',
        ntaLevel: 'NA', ntaPoints: 12,
        slpGroup: 'SC', ptotGroup: 'TB'
      },
    ],
    classifiedItems: [
      // ── Always captured (face-sheet diagnoses, no time-sensitivity) ──────
      {
        mdsItem: 'I2900',
        mdsColumn: '',
        description: 'Diabetes Mellitus',
        classification: 'always_captured',
        ntaPoints: 2,
        pdpmComponents: ['nta'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      // CMS NTA Table 2: COPD/Asthma/Chronic Lung Disease is captured at I6200, not I6100.
      {
        mdsItem: 'I6200',
        mdsColumn: '',
        description: 'Asthma/COPD/Chronic Lung Disease',
        classification: 'always_captured',
        ntaPoints: 2,
        pdpmComponents: ['nta'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      // Aphasia (I4300) is an SLP comorbidity, NOT an NTA item — it does not
      // appear in CMS PDPM Table 2 (NTA Comorbidity Score Calculation).
      {
        mdsItem: 'I4300',
        mdsColumn: '',
        description: 'Aphasia (SLP comorbidity)',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: ['slp'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      {
        mdsItem: 'I0700',
        mdsColumn: '',
        description: 'Hypertension',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: [],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      {
        mdsItem: 'I0400',
        mdsColumn: '',
        description: 'Coronary Artery Disease (CAD)',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: [],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      {
        mdsItem: 'I0600',
        mdsColumn: '',
        description: 'Heart Failure',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: [],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      {
        mdsItem: 'I0900',
        mdsColumn: '',
        description: 'Peripheral Vascular Disease',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: [],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },
      // K0510B (mechanically altered diet) — SLP component, captured every day.
      {
        mdsItem: 'K0510',
        mdsColumn: 'B1',
        description: 'Mechanically Altered Diet (puree)',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: ['slp'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      },

      // ── Time-sensitive: PHQ-9 / Depression nursing end-split ─────────────
      // D0150 must be administered during 7-day look-back before ARD. RAI
      // convention: on this admit it isn't completed until day 4. PHQ-9 score
      // ≥10 triggers depression end-split (CBC1 → CBC2 nursing bump).
      {
        mdsItem: 'D0150',
        mdsColumn: '',
        description: 'PHQ-9 Resident Mood Interview',
        classification: 'time_sensitive_at_risk',
        ntaPoints: 0,
        pdpmComponents: ['nursing'],
        nursingInfo: null,
        queryStatus: null,
        firstAdministered: '2026-01-13',
        lastAdministered: '2026-01-13',
        capturedOnDays: [4,5,6,7,8],
        solverAnswer: 'yes',
        queryPdpmImpact:
          'Administered Day 4, score 11 (≥10) — qualifies as depressed per PDPM (D0160 Total Severity Score ≥10). Triggers the depression end-split for the nursing case-mix group. ARD on Days 1–3 (before PHQ-9) misses this end-split.'
      },

      // ── Queryable NTA items (per CMS NTA Table 2) ───────────────────────
      // I1700 MDRO — hospital wound culture grew MRSA; coding requires
      // active dx at SNF admit. +1 NTA when confirmed.
      {
        mdsItem: 'I1700',
        mdsColumn: '',
        description: 'Multi-Drug Resistant Organism (MRSA)',
        classification: 'item_to_query',
        ntaPoints: 1,
        pdpmComponents: ['nta'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [4,5,6,7,8],
        solverAnswer: 'needs_review',
        queryPdpmImpact:
          'Hospital wound culture (1/9): MRSA positive, sensitive to vancomycin. Query MD to confirm dx active at SNF admit → +1 NTA via I1700.'
      },
      // I2500 Wound Infection — PICC site cellulitis on transfer note.
      // +2 NTA when confirmed. Captured Day 5+ assuming query response back.
      {
        mdsItem: 'I2500',
        mdsColumn: '',
        description: 'Wound Infection (other than UTI)',
        classification: 'item_to_query',
        ntaPoints: 2,
        pdpmComponents: ['nta'],
        nursingInfo: null,
        queryStatus: null,
        capturedOnDays: [5,6,7,8],
        solverAnswer: 'needs_review',
        queryPdpmImpact:
          'Hospital DC nursing note 1/10 documents PICC site erythema and induration. Query MD to confirm cellulitis dx active at SNF admit → +2 NTA via I2500.'
      },
      // O0110H1b "IV Medications, Post-admit" — captures IV meds administered
      // WHILE A RESIDENT (at the SNF) within the 7-day ARD look-back. Per
      // RAI Chapter 3, hospital IV doses are coded in O0110H column 1 ("while
      // NOT a resident") and do NOT score NTA. Only "while a resident" counts.
      // For Doe Jane: hospital vanco continued at SNF on 1/11 (Day 2) for
      // 1 dose before transition to PO. Any ARD on Day 2+ captures +5 NTA.
      {
        mdsItem: 'O0110',
        mdsColumn: 'H1',
        description: 'IV Medications (post-admit, while a resident)',
        classification: 'time_sensitive_at_risk',
        ntaPoints: 5,
        pdpmComponents: ['nta'],
        nursingInfo: null,
        queryStatus: null,
        firstAdministered: '2026-01-11',
        lastAdministered: '2026-01-11',
        capturedOnDays: [2,3,4,5,6,7,8],
        solverAnswer: 'needs_review',
        queryPdpmImpact:
          'IV vancomycin continued at the SNF on 1/11 (Day 2) for 1 dose before stepping down to PO. ARD on Day 2 or later keeps 1/11 inside the 7-day O0110H1 look-back → +5 NTA via O0110H1b. ARD on admit night (Day 1) captures nothing here (no SNF dose given yet).'
      },

      // ── Always-captured GG and SLP items (informational) ────────────────
      {
        mdsItem: 'GG0170',
        mdsColumn: 'C1',
        description: 'Functional Mobility — Bed Mobility',
        classification: 'always_captured',
        ntaPoints: 0,
        pdpmComponents: ['ptot', 'nursing'],
        nursingInfo: { category: 'Special Care High', mainCategory: 'Special Care High' },
        queryStatus: null,
        capturedOnDays: [1,2,3,4,5,6,7,8],
        solverAnswer: 'coded',
        queryPdpmImpact: ''
      }
    ]
  }
};
