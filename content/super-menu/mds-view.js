// Super Menu MDS View - Dashboard Style v2
import { isPaymentApplicable, getPaymentModeLabel } from '../utils/payment.js';

// ============================================================================
// MAIN VIEW FUNCTIONS
// ============================================================================

async function renderMDSView(forceRefresh = false) {
  const container = document.getElementById('super-menu-content');
  if (!container) return;

  // Priority: manualContext (in-menu nav) > existing context > URL context
  let context;
  if (MDSViewState.manualContext) {
    context = MDSViewState.manualContext;
  } else if (MDSViewState.context && MDSViewState.data && !forceRefresh) {
    // Reuse existing context if we have data and not forcing refresh
    context = MDSViewState.context;
  } else {
    // Default: read from URL
    context = getMDSContext();
  }

  const contextHasChanged = contextChanged(context);
  SuperMenu.mdsContext = context;
  MDSViewState.context = context;

  const needsLoad = !MDSViewState.data || forceRefresh || contextHasChanged;

  if (needsLoad) {
    MDSViewState.loading = true;
    MDSViewState.error = null;
    container.innerHTML = renderMDSLoading(context);

    try {
      await loadMDSData(context, forceRefresh);
      // Clear auto-select tracking on success
      MDSViewState.autoSelectAttempt = null;
    } catch (err) {
      console.error('Super Menu: Failed to load MDS data:', err);
      MDSViewState.error = err.message || 'Failed to load MDS data';
    }
    MDSViewState.loading = false;
  }

  if (MDSViewState.error) {
    // Check if this was an auto-select attempt - fall back to showing MDS list
    if (MDSViewState.autoSelectAttempt) {
      console.log('Super Menu: Auto-select failed, falling back to MDS list');
      const fallback = MDSViewState.autoSelectAttempt;

      // Reset state for patient view
      MDSViewState.error = null;
      MDSViewState.autoSelectAttempt = null;
      MDSViewState.showAllAssessments = true;
      MDSViewState.manualContext = {
        scope: 'patient',
        assessmentId: null,
        patientId: fallback.patientId,
        patientName: fallback.patientName
      };
      MDSViewState.context = MDSViewState.manualContext;

      // Use cached assessments if available, otherwise re-render will fetch
      if (fallback.assessments) {
        MDSViewState.data = {
          scope: 'patient',
          patientId: fallback.patientId,
          patientName: fallback.patientName,
          assessments: fallback.assessments
        };
        container.innerHTML = renderMDSContent(MDSViewState.data, MDSViewState.context);
        setupMDSListeners(container);
      } else {
        // Re-render will fetch patient data
        renderMDSView(true);
      }
      return;
    }
    container.innerHTML = renderMDSError(MDSViewState.error, context);
  } else if (MDSViewState.data) {
    container.innerHTML = renderMDSContent(MDSViewState.data, context);
    setupMDSListeners(container);
  } else {
    container.innerHTML = renderMDSEmpty(context);
  }
}

function contextChanged(newContext) {
  const old = MDSViewState.context;
  if (!old) return true;
  return old.scope !== newContext.scope ||
         old.assessmentId !== newContext.assessmentId ||
         old.patientId !== newContext.patientId;
}

async function loadMDSData(context, forceRefresh = false) {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (!authState.authenticated) {
    throw new Error('Please log in to view MDS data');
  }

  const orgResponse = getOrg();
  const orgSlug = orgResponse?.org;
  const facilityName = getChatFacilityInfo();

  if (!orgSlug || !facilityName) {
    throw new Error('Could not determine organization or facility');
  }

  if (context.scope === 'mds' && context.assessmentId) {
    const params = new URLSearchParams({
      externalAssessmentId: context.assessmentId,
      facilityName,
      orgSlug
    });

    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/mds/pdpm-potential?${params}`,
      options: { method: 'GET' }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to load MDS data');
    }

    // The pdpm-potential endpoint includes queries in outstandingQueries
    MDSViewState.data = result.data;
  } else if (context.scope === 'patient' && context.patientId) {
    // Fetch patient MDSs from new endpoint
    const params = new URLSearchParams({
      facilityName,
      orgSlug
    });

    const result = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      endpoint: `/api/extension/patients/${context.patientId}/assessments?${params}`,
      options: { method: 'GET' }
    });

    console.log('Super Menu: Patient API response:', result);

    if (!result.success) {
      throw new Error(result.error || 'Failed to load patient data');
    }

    // Handle double-wrapped response: result.data.data or result.data
    const responseData = result.data?.data || result.data || result;
    const patientName = responseData.patientName || context.patientName || 'Patient';
    const assessments = responseData.assessments || [];

    console.log('Super Menu: Parsed patient data:', { patientName, assessmentsCount: assessments.length });

    MDSViewState.data = {
      scope: 'patient',
      patientId: context.patientId,
      patientName,
      assessments
    };

    // Cache the patient name for breadcrumbs
    if (patientName && typeof setCachedPatientName === 'function') {
      setCachedPatientName(context.patientId, patientName);
    }
  } else {
    MDSViewState.data = { scope: 'global', assessments: [] };
  }
}

// ============================================================================
// LOADING / ERROR / EMPTY STATES
// ============================================================================

function renderMDSLoading(context) {
  const scopeLabel = {
    mds: 'Loading MDS analysis...',
    patient: 'Loading patient MDSs...',
    global: 'Loading all MDSs...'
  };

  return `
    <div class="super-mds-loading">
      <div class="super-mds-loading__spinner"></div>
      <div class="super-mds-loading__text">${scopeLabel[context.scope] || 'Loading...'}</div>
    </div>
  `;
}

function renderMDSError(error, context) {
  return `
    <div class="super-mds-error">
      <div class="super-mds-error__icon">&#9888;</div>
      <div class="super-mds-error__text">${escapeHtml(error)}</div>
      <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture); MDSCommandCenterLauncher is the live entry point -->
      <button class="super-mds-error__retry" onclick="renderMDSView(true)">Retry</button>
    </div>
  `;
}

function renderMDSEmpty(context) {
  const messages = {
    mds: 'Navigate to an MDS section page to see analysis.',
    patient: 'No MDS assessments found for this patient.',
    global: 'No MDS assessments found.'
  };

  return `
    <div class="super-mds-empty">
      <div class="super-mds-empty__icon">&#128203;</div>
      <div class="super-mds-empty__text">${messages[context.scope] || 'No data available'}</div>
    </div>
  `;
}

// ============================================================================
// MAIN CONTENT RENDERING
// ============================================================================

function renderMDSContent(data, context) {
  const breadcrumb = renderMDSBreadcrumb(data, context);

  if (context.scope === 'mds') {
    // Single MDS view with all the cards
    // Order: HIPPS display, Would Change HIPPS (top priority), Queries, Compliance
    if (data.success) {
      return `
        <div class="super-mds-dashboard">
          ${breadcrumb}
          ${renderHippsDisplay(data)}
          ${renderPaymentBlock(data)}
          ${renderWouldChangeHippsCard(data)}
          ${renderPendingQueriesCard(data)}
          ${renderRecentQueriesCard(data)}
          ${renderComplianceCard(data)}
          ${renderNoHippsChangeSection(data)}
        </div>
      `;
    } else {
      // MDS data failed to load but still show nav header so user can go back
      return `
        <div class="super-mds-dashboard">
          ${breadcrumb}
          <div class="super-mds-error">
            <div class="super-mds-error__icon">&#9888;</div>
            <div class="super-mds-error__text">Unable to load MDS analysis</div>
            <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
            <button class="super-mds-error__retry" onclick="renderMDSView(true)">Retry</button>
          </div>
        </div>
      `;
    }
  } else if (context.scope === 'patient') {
    // Patient view - auto-select latest open MDS unless user wants to see all
    const assessments = data.assessments || [];

    // Find latest open MDS by ARD date
    const openAssessments = assessments.filter(a => a.status === 'open');
    const latestOpen = openAssessments.length > 0
      ? openAssessments.sort((a, b) => new Date(b.ardDate) - new Date(a.ardDate))[0]
      : null;

    // Auto-select if: has open assessment, not showing all, and not already in MDS detail
    if (latestOpen && !MDSViewState.showAllAssessments) {
      // Trigger auto-select - switch to MDS detail view
      setTimeout(() => {
        // Track this auto-select attempt for fallback on error
        MDSViewState.autoSelectAttempt = {
          patientId: context.patientId,
          patientName: data.patientName,
          assessments: assessments // Cache assessments for fallback
        };
        MDSViewState.manualContext = {
          scope: 'mds',
          assessmentId: latestOpen.externalAssessmentId || latestOpen.id,
          patientId: context.patientId,
          patientName: data.patientName
        };
        MDSViewState.context = MDSViewState.manualContext;
        MDSViewState.data = null;
        // Preserve cameFromDashboard state
        renderMDSView();
      }, 0);

      // Show loading while we transition
      return `
        <div class="super-mds-loading">
          <div class="super-mds-loading__spinner"></div>
          <div class="super-mds-loading__text">Loading latest assessment...</div>
        </div>
      `;
    }

    // Show full list (either no open assessments or user requested all)
    return `
      <div class="super-patient-view">
        ${breadcrumb}
        ${renderPatientMDSList(data)}
      </div>
    `;
  } else {
    return `
      ${breadcrumb}
      <div class="super-mds-global-actions">
        <!-- NO_TRACK: vestigial — global MDS panel removed; FAB launches MDS Command Center directly -->
        <button class="mds-cc__launch-btn" id="mds-command-center-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          MDS Command Center
        </button>
      </div>
      ${renderMDSList(data.assessments || [], 'global')}
    `;
  }
}

// ============================================================================
// BREADCRUMB / NAVIGATION HEADER
// ============================================================================

function renderMDSBreadcrumb(data, context) {
  // Simplified breadcrumb with back arrow

  if (context.scope === 'global') {
    // No breadcrumb needed at global level
    return '';
  }

  if (context.scope === 'patient') {
    // Patient view - show back to dashboard
    const patientName = data?.patientName || context.patientName || 'Patient';
    return `
      <div class="super-nav-header">
        <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
        <button class="super-nav-header__back" data-scope="global" title="Back to Dashboard">
          <span class="super-nav-header__back-arrow">&#8592;</span>
          <span class="super-nav-header__back-label">Dashboard</span>
        </button>
        <div class="super-nav-header__title">${escapeHtml(patientName)}</div>
      </div>
    `;
  }

  if (context.scope === 'mds') {
    // Prefer external IDs from API data over context (context might have internal IDs)
    const patientId = data?.assessment?.externalPatientId || data?.assessment?.patientId || context.patientId;
    const patientName = data?.patientName || context.patientName || 'Patient';
    const mdsLabel = data?.assessment ? `${data.assessment.description || 'MDS'}` : 'MDS';
    const assessmentId = data?.assessment?.externalAssessmentId || context.assessmentId;

    // Determine back button destination
    let backButton;
    if (MDSViewState.cameFromDashboard) {
      // Came from facility dashboard - back goes to dashboard
      backButton = `
        <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
        <button class="super-mds-nav-header__back" data-action="back-to-dashboard" title="Back to Dashboard">
          &#8592; Dashboard
        </button>
      `;
    } else {
      // Normal flow - back goes to patient
      backButton = `
        <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
        <button class="super-mds-nav-header__back" data-scope="patient" data-patient-id="${patientId || ''}" title="Back to ${escapeHtml(patientName)}">
          &#8592; ${escapeHtml(patientName)}
        </button>
      `;
    }

    // "Open in PCC" buttons
    const pccButtons = `
      <div class="super-mds-nav-header__actions">
        <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
        <button class="super-mds-nav-header__pcc-btn" data-action="open-patient" data-patient-id="${patientId || ''}" title="Open patient in PCC">
          &#128100;
        </button>
        <!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) -->
        <button class="super-mds-nav-header__pcc-btn" data-action="open-mds" data-assessment-id="${assessmentId || ''}" title="Open MDS in PCC">
          &#128203;
        </button>
      </div>
    `;

    // "View all assessments" link if came from auto-select
    const viewAllLink = MDSViewState.cameFromDashboard || context.patientId ? `
      <a class="super-mds-view-all" data-action="view-all-assessments" data-patient-id="${patientId || ''}">
        View all assessments
      </a>
    ` : '';

    return `
      <div class="super-mds-nav-header">
        ${backButton}
        <div class="super-mds-nav-header__title">${escapeHtml(patientName)} - ${escapeHtml(mdsLabel)}</div>
        ${pccButtons}
      </div>
      ${viewAllLink}
    `;
  }

  return '';
}

// ============================================================================
// HIPPS DISPLAY (Top Section)
// ============================================================================

function renderHippsDisplay(data) {
  const summary = data.summary || {};
  const calculation = data.calculation || {};

  const currentHipps = summary.currentHipps || calculation.hippsCode || '?????';
  const potentialHipps = summary.potentialHippsIfCoded;
  const hasImprovement = summary.hasImprovements && potentialHipps && potentialHipps !== currentHipps;

  return `
    <div class="super-mds-hipps-display">
      <div class="super-mds-hipps-main">
        <div class="super-mds-hipps-current">
          <div class="super-mds-hipps-label">Current HIPPS</div>
          <div class="super-mds-hipps-code">${currentHipps}</div>
        </div>
        ${hasImprovement ? `
          <div class="super-mds-hipps-arrow">&#10140;</div>
          <div class="super-mds-hipps-potential">
            <div class="super-mds-hipps-label super-mds-hipps-label--potential">Potential HIPPS</div>
            <div class="super-mds-hipps-code super-mds-hipps-code--potential">${potentialHipps}</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// COMPLIANCE CARD (Shows ALL 5 checks)
// ============================================================================

function renderComplianceCard(data) {
  const compliance = data.compliance || {};
  const checks = compliance.checks || {};
  const passed = compliance.summary?.passed || 0;
  const total = compliance.summary?.total || 5;

  const checkOrder = ['bims', 'phq9', 'gg', 'orders', 'therapyDocs'];
  const checkLabels = {
    bims: 'BIMS',
    phq9: 'PHQ-9',
    gg: 'GG',
    orders: 'Orders',
    therapyDocs: 'Therapy'
  };

  const checkItems = checkOrder.map(key => {
    const check = checks[key] || { status: 'unknown', message: 'No data' };
    const isPassed = check.status === 'passed';
    const icon = isPassed ? '&#10003;' : '&#10007;';
    const statusClass = isPassed ? 'super-mds-compliance-item--passed' : 'super-mds-compliance-item--failed';

    // Extract specific assessment info from foundUda if available
    const foundUda = check.foundUda;
    let detailText = '';
    let dateText = '';

    if (isPassed && foundUda) {
      // Show the specific assessment name/description
      detailText = foundUda.description || check.message || '';
      // Show both date and locked date in one line
      const assessDate = foundUda.date ? formatDate(foundUda.date) : '';
      const lockedDate = foundUda.lockedDate ? formatDate(foundUda.lockedDate) : '';
      if (assessDate && lockedDate) {
        dateText = `${assessDate} · Locked ${lockedDate}`;
      } else if (lockedDate) {
        dateText = `Locked ${lockedDate}`;
      } else if (assessDate) {
        dateText = assessDate;
      }
    } else {
      // For failed or no foundUda, show the message
      detailText = check.message || '';
    }

    // For orders/therapy, show the count
    const showViewBtn = (key === 'orders' || key === 'therapyDocs') && !isPassed;

    return `
      <div class="super-mds-compliance-item ${statusClass}">
        <span class="super-mds-compliance-item__icon">${icon}</span>
        <span class="super-mds-compliance-item__label">${checkLabels[key]}</span>
        <span class="super-mds-compliance-item__detail">${escapeHtml(detailText)}</span>
        ${dateText ? `<span class="super-mds-compliance-item__date">${dateText}</span>` : ''}
        ${showViewBtn ? `<!-- NO_TRACK: vestigial — MDS panel removed (overlay architecture) --><button class="super-mds-compliance-item__btn" data-action="view-${key}">View</button>` : ''}
      </div>
    `;
  }).join('');

  const statusClass = passed === total ? 'super-mds-card--success' : 'super-mds-card--warning';

  return `
    <div class="super-mds-card ${statusClass} super-mds-card--collapsible" data-section="compliance">
      <div class="super-mds-card__header super-mds-card__header--clickable">
        <span class="super-mds-card__toggle">&#9662;</span>
        <span class="super-mds-card__title">Compliance</span>
        <span class="super-mds-card__badge">${passed}/${total} &#10003;</span>
      </div>
      <div class="super-mds-card__content">
        ${checkItems}
      </div>
    </div>
  `;
}

// ============================================================================
// PAYMENT BLOCK (Hero Card — Revenue Opportunity)
// ============================================================================

function renderPaymentBlock(data) {
  const payment = data.payment;
  if (!isPaymentApplicable(payment)) return '';
  if (!(payment.delta > 0)) return '';

  const label = getPaymentModeLabel(payment);
  const estBadge = payment.isEstimated ? ' <span class="pdpm-an__est-badge">est.</span>' : '';

  switch (payment.mode) {
    case 'medicare': {
      const cur = payment.current?.total;
      const pot = payment.potential?.total;
      const delta = Math.round(payment.delta);
      const rateRow = (cur != null && pot != null) ? `
        <div class="super-mds-payment-rates">
          <span class="super-mds-payment-rate super-mds-payment-rate--current">$${Math.round(cur)}/day</span>
          <span class="super-mds-payment-arrow">&#10140;</span>
          <span class="super-mds-payment-rate super-mds-payment-rate--potential">$${Math.round(pot)}/day</span>
        </div>
      ` : '';
      return `
        <div class="super-mds-payment-block">
          <div class="super-mds-payment-block__label">Revenue Opportunity · ${label}${estBadge}</div>
          ${rateRow}
          <div class="super-mds-payment-delta">+$${delta}/day</div>
        </div>
      `;
    }
    case 'state_rate': {
      const cur = payment.current?.rate;
      const pot = payment.potential?.rate;
      const curGroup = (payment.current?.groupCode || '').replace(/_/g, '');
      const potGroup = (payment.potential?.groupCode || '').replace(/_/g, '');
      const delta = Math.round(payment.delta);
      const rateRow = (cur != null && pot != null) ? `
        <div class="super-mds-payment-rates">
          <span class="super-mds-payment-rate super-mds-payment-rate--current">${curGroup}${curGroup ? ' · ' : ''}$${Math.round(cur)}/day</span>
          <span class="super-mds-payment-arrow">&#10140;</span>
          <span class="super-mds-payment-rate super-mds-payment-rate--potential">${potGroup}${potGroup ? ' · ' : ''}$${Math.round(pot)}/day</span>
        </div>
      ` : '';
      return `
        <div class="super-mds-payment-block">
          <div class="super-mds-payment-block__label">Revenue Opportunity · ${label}${estBadge}</div>
          ${rateRow}
          <div class="super-mds-payment-delta">+$${delta}/day</div>
        </div>
      `;
    }
    case 'cmi': {
      const cur = payment.current?.total;
      const pot = payment.potential?.total;
      const deltaStr = payment.delta.toFixed(3);
      const rateRow = (cur != null && pot != null) ? `
        <div class="super-mds-payment-rates">
          <span class="super-mds-payment-rate super-mds-payment-rate--current">${cur.toFixed(3)} CMI</span>
          <span class="super-mds-payment-arrow">&#10140;</span>
          <span class="super-mds-payment-rate super-mds-payment-rate--potential">${pot.toFixed(3)} CMI</span>
        </div>
      ` : '';
      return `
        <div class="super-mds-payment-block">
          <div class="super-mds-payment-block__label">Revenue Opportunity · ${label}</div>
          ${rateRow}
          <div class="super-mds-payment-delta">+${deltaStr} CMI</div>
        </div>
      `;
    }
    default:
      return '';
  }
}

// ============================================================================
// WOULD CHANGE HIPPS CARD (Green)
// ============================================================================

function renderWouldChangeHippsCard(data) {
  const enhancedDetections = data.enhancedDetections || [];

  // Get items that would change HIPPS and are NOT queries
  const hippsChangingItems = enhancedDetections.filter(d =>
    d.wouldChangeHipps &&
    d.solverStatus !== 'query_sent' &&
    d.solverStatus !== 'awaiting_response'
  );

  if (hippsChangingItems.length === 0) {
    return '';
  }

  const items = hippsChangingItems.map(d => {
    const impactParts = [];
    if (d.impact?.slp?.wouldChangeGroup) {
      impactParts.push(`SLP: ${d.impact.slp.currentGroup} &#8594; ${d.impact.slp.newGroup}`);
    }
    if (d.impact?.nta?.wouldChangeLevel) {
      impactParts.push(`NTA: ${d.impact.nta.currentLevel} &#8594; ${d.impact.nta.newLevel}`);
    }
    if (d.impact?.nursing?.wouldChangeGroup) {
      impactParts.push(`Nursing: ${d.impact.nursing.currentPaymentGroup} &#8594; ${d.impact.nursing.newPaymentGroup}`);
    }
    if (d.impact?.ptot?.wouldChangeGroup) {
      impactParts.push(`PT/OT: ${d.impact.ptot.currentGroup} &#8594; ${d.impact.ptot.newGroup}`);
    }
    const impactStr = impactParts.join(', ');

    const isI8000 = d.mdsItem === 'I8000' || d.mdsItem.startsWith('I8000:');
    const categoryKey = d.mdsColumn || d.i8000CategoryKey || (d.mdsItem.startsWith('I8000:') ? d.mdsItem.replace('I8000:', '') : '');
    const displayCode = isI8000 ? 'I8000' : d.mdsItem;
    const categoryKeyAttr = isI8000 && categoryKey ? ` data-category-key="${escapeHtml(categoryKey)}"` : '';

    return `
      <div class="super-mds-impact-item" data-item="${d.mdsItem}"${categoryKeyAttr}>
        <span class="super-mds-impact-item__code">${escapeHtml(displayCode)}</span>
        <span class="super-mds-impact-item__name">${escapeHtml(d.itemName || '')}</span>
        <span class="super-mds-impact-item__change">${impactStr}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="super-mds-card super-mds-card--green super-mds-card--collapsible" data-section="would-change-hipps">
      <div class="super-mds-card__header super-mds-card__header--clickable">
        <span class="super-mds-card__toggle">&#9662;</span>
        <span class="super-mds-card__icon">&#9889;</span>
        <span class="super-mds-card__title">${hippsChangingItems.length} Would Change HIPPS</span>
      </div>
      <div class="super-mds-card__content">
        ${items}
        <div class="super-mds-card__hint">Click item to code or send query</div>
      </div>
    </div>
  `;
}

// ============================================================================
// PENDING QUERIES CARD (Yellow) - Uses data.outstandingQueries
// ============================================================================

function renderPendingQueriesCard(data) {
  // Outstanding queries are in data.outstandingQueries
  const queries = data.outstandingQueries || [];

  // Filter for pending/sent (though outstandingQueries should already be filtered)
  const pendingQueries = queries.filter(q =>
    q.status === 'sent' ||
    q.status === 'pending' ||
    q.status === 'awaiting_response'
  );

  if (pendingQueries.length === 0) {
    return '';
  }

  const items = pendingQueries.map(q => {
    const impact = q.pdpmImpact || {};
    const componentImpacts = impact.componentImpacts || {};
    const wouldChangeHipps = impact.wouldChangeHipps;

    // Build impact string from componentImpacts
    const impactParts = [];
    if (componentImpacts.slp?.wouldChangeGroup) {
      impactParts.push(`SLP: ${componentImpacts.slp.currentGroup} &#8594; ${componentImpacts.slp.newGroup}`);
    }
    if (componentImpacts.nta?.wouldChangeLevel) {
      impactParts.push(`NTA: ${componentImpacts.nta.currentLevel} &#8594; ${componentImpacts.nta.newLevel}`);
    }
    if (componentImpacts.nursing?.wouldChangeGroup) {
      impactParts.push(`Nursing: ${componentImpacts.nursing.currentPaymentGroup} &#8594; ${componentImpacts.nursing.newPaymentGroup}`);
    }
    if (componentImpacts.ptot?.wouldChangeGroup) {
      impactParts.push(`PT/OT: ${componentImpacts.ptot.currentGroup} &#8594; ${componentImpacts.ptot.newGroup}`);
    }
    const impactStr = impactParts.join(', ');

    const sentDate = q.sentAt ? formatRelativeDate(q.sentAt) : '';

    return `
      <div class="super-mds-query-item ${wouldChangeHipps ? 'super-mds-query-item--hipps-change' : ''}" data-item="${q.mdsItem}" data-query-id="${q.id || ''}">
        <span class="super-mds-query-item__code">${escapeHtml(q.mdsItem)}</span>
        <span class="super-mds-query-item__name">${escapeHtml(q.mdsItemName || '')}</span>
        <span class="super-mds-query-item__status">&#9992; sent${sentDate ? ` ${sentDate}` : ''}</span>
        ${impactStr ? `<span class="super-mds-query-item__change">${impactStr}</span>` : ''}
        <span class="super-mds-query-item__arrow">&#10095;</span>
      </div>
    `;
  }).join('');

  // Calculate potential HIPPS from the first query that would change HIPPS
  const hippsChangingQuery = pendingQueries.find(q => q.pdpmImpact?.wouldChangeHipps);
  const potentialHipps = hippsChangingQuery?.pdpmImpact?.newHipps;

  return `
    <div class="super-mds-card super-mds-card--yellow super-mds-card--collapsible" data-section="pending-queries">
      <div class="super-mds-card__header super-mds-card__header--clickable">
        <span class="super-mds-card__toggle">&#9662;</span>
        <span class="super-mds-card__icon">&#9201;</span>
        <span class="super-mds-card__title">Pending Queries (${pendingQueries.length})</span>
        ${potentialHipps ? `<span class="super-mds-card__potential">&#8594; ${potentialHipps}</span>` : ''}
      </div>
      <div class="super-mds-card__content">
        ${items}
        <div class="super-mds-card__hint">Click a query to view details</div>
      </div>
    </div>
  `;
}

// ============================================================================
// RECENTLY SIGNED QUERIES CARD (Blue) - Uses data.recentlySigned from API
// ============================================================================

function renderRecentQueriesCard(data) {
  // Primary source: recentlySigned from API (last 24h signed queries)
  // Fallback to other fields for backwards compatibility
  const recentlySigned = data.recentlySigned || data.signedQueries || data.completedQueries || data.recentQueries || [];

  // Filter for signed status (in case array contains mixed statuses)
  const recentQueries = recentlySigned.filter(q =>
    q.status === 'signed' ||
    q.status === 'completed' ||
    q.status === 'resolved' ||
    q.signedAt // If it has signedAt, it's signed
  );

  if (recentQueries.length === 0) {
    return '';
  }

  const items = recentQueries.map(q => {
    const signedDate = q.signedAt || q.completedAt;
    const needsCoding = q.mdsItemCoded === false;

    return `
      <div class="super-mds-query-item super-mds-query-item--signed ${needsCoding ? 'super-mds-query-item--needs-coding' : ''}"
           data-item="${q.mdsItem}"
           data-query-id="${q.id || ''}"
           data-has-pdf="${q.pdfUrl ? 'true' : 'false'}">
        <span class="super-mds-query-item__code">${escapeHtml(q.mdsItem)}</span>
        <span class="super-mds-query-item__name">${escapeHtml(q.mdsItemName || '')}</span>
        <div class="super-mds-query-item__badges">
          <span class="super-mds-query-item__status super-mds-query-item__status--signed">&#10003; signed</span>
          ${needsCoding ? '<span class="super-mds-query-item__badge super-mds-query-item__badge--coding">Needs Coding</span>' : ''}
        </div>
        ${signedDate ? `<span class="super-mds-query-item__date">${formatRelativeDate(signedDate)}</span>` : ''}
        <span class="super-mds-query-item__arrow">&#10095;</span>
      </div>
    `;
  }).join('');

  // Count how many need coding
  const needsCodingCount = recentQueries.filter(q => q.mdsItemCoded === false).length;
  const badgeText = needsCodingCount > 0 ? `${needsCodingCount} need coding` : '';

  return `
    <div class="super-mds-card super-mds-card--blue super-mds-card--collapsible" data-section="recent-queries">
      <div class="super-mds-card__header super-mds-card__header--clickable">
        <span class="super-mds-card__toggle">&#9662;</span>
        <span class="super-mds-card__icon">&#10003;</span>
        <span class="super-mds-card__title">Recently Signed (${recentQueries.length})</span>
        ${badgeText ? `<span class="super-mds-card__badge super-mds-card__badge--action">${badgeText}</span>` : ''}
      </div>
      <div class="super-mds-card__content">
        ${items}
        <div class="super-mds-card__hint">Click to view query details and PDF</div>
      </div>
    </div>
  `;
}

// ============================================================================
// NO HIPPS CHANGE SECTION (Collapsed)
// ============================================================================

function renderNoHippsChangeSection(data) {
  const enhancedDetections = data.enhancedDetections || [];

  // Get items that don't change HIPPS
  const noChangeItems = enhancedDetections.filter(d =>
    !d.wouldChangeHipps &&
    d.solverStatus !== 'query_sent' &&
    d.solverStatus !== 'awaiting_response' &&
    d.solverStatus !== 'query_signed' &&
    d.solverStatus !== 'coded_correctly'
  );

  if (noChangeItems.length === 0) {
    return '';
  }

  const items = noChangeItems.map(d => {
    const isI8000 = d.mdsItem === 'I8000' || d.mdsItem.startsWith('I8000:');
    const displayCode = isI8000 ? 'I8000' : d.mdsItem;
    const catKey = d.mdsColumn || (d.mdsItem.startsWith('I8000:') ? d.mdsItem.replace('I8000:', '') : '');
    const catKeyAttr = isI8000 && catKey ? ` data-category-key="${escapeHtml(catKey)}"` : '';
    return `
      <div class="super-mds-detection-item" data-item="${d.mdsItem}"${catKeyAttr}>
        <span class="super-mds-detection-item__code">${escapeHtml(displayCode)}</span>
        <span class="super-mds-detection-item__name">${escapeHtml(d.itemName || '')}</span>
        <span class="super-mds-detection-item__section">Section ${escapeHtml(d.section || '?')}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="super-mds-section super-mds-section--collapsible super-mds-section--collapsed" data-section="no-hipps-change">
      <div class="super-mds-section__header">
        <span class="super-mds-section__toggle">&#9662;</span>
        <span class="super-mds-section__title">${noChangeItems.length} Detected (No HIPPS Change)</span>
      </div>
      <div class="super-mds-section__content">
        ${items}
      </div>
    </div>
  `;
}

// ============================================================================
// PATIENT VIEW - MDS LIST
// ============================================================================

function renderPatientMDSList(data) {
  const assessments = data.assessments || [];

  if (assessments.length === 0) {
    return `
      <div class="super-patient-empty">
        <div class="super-patient-empty__icon">&#128203;</div>
        <div class="super-patient-empty__text">No MDS assessments found</div>
        <div class="super-patient-empty__hint">This patient has no MDS assessments on file.</div>
      </div>
    `;
  }

  // Sort: open first, then by ARD date descending
  const sortedAssessments = [...assessments].sort((a, b) => {
    // Open status first
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (b.status === 'open' && a.status !== 'open') return 1;
    // Then by ARD date descending
    return new Date(b.ardDate) - new Date(a.ardDate);
  });

  const mdsCards = sortedAssessments.map(a => {
    const statusClass = a.status === 'open' ? 'super-patient-mds--open' :
                        a.status === 'locked' ? 'super-patient-mds--locked' :
                        'super-patient-mds--completed';

    const statusLabel = a.status === 'open' ? 'OPEN' :
                        a.status === 'locked' ? 'LOCKED' :
                        'COMPLETE';

    // Build info badges
    const infoParts = [];
    if (a.actionCount > 0) {
      infoParts.push(`<span class="super-patient-mds__info super-patient-mds__info--action">${a.actionCount} items</span>`);
    }
    if (a.queryCount > 0) {
      infoParts.push(`<span class="super-patient-mds__info super-patient-mds__info--query">${a.queryCount} ${a.queryCount > 1 ? 'queries' : 'query'}</span>`);
    }

    const hippsDisplay = a.currentHipps || null;
    const hasChange = a.potentialHipps && a.potentialHipps !== a.currentHipps;

    return `
      <div class="super-patient-mds ${statusClass}" data-assessment-id="${a.externalAssessmentId || a.id}">
        <div class="super-patient-mds__main">
          <div class="super-patient-mds__type">${escapeHtml(a.type || 'MDS')}</div>
          <div class="super-patient-mds__meta">
            <span class="super-patient-mds__status">${statusLabel}</span>
            <span class="super-patient-mds__date">${formatDate(a.ardDate)}</span>
          </div>
        </div>
        <div class="super-patient-mds__right">
          ${hippsDisplay ? `
            <div class="super-patient-mds__hipps">
              <span class="super-patient-mds__hipps-code">${hippsDisplay}</span>
              ${hasChange ? `<span class="super-patient-mds__hipps-arrow">&#8594; ${a.potentialHipps}</span>` : ''}
            </div>
          ` : ''}
          ${infoParts.length > 0 ? `<div class="super-patient-mds__infos">${infoParts.join('')}</div>` : ''}
        </div>
        <div class="super-patient-mds__chevron">&#10095;</div>
      </div>
    `;
  }).join('');

  return `
    <div class="super-patient-mds-section">
      <div class="super-patient-mds-section__title">MDS Assessments</div>
      <div class="super-patient-mds-section__list">
        ${mdsCards}
      </div>
    </div>
  `;
}

// ============================================================================
// LIST VIEW (Legacy/Global)
// ============================================================================

function renderMDSList(assessments, scope) {
  if (!assessments || assessments.length === 0) {
    return `
      <div class="super-mds-list-empty">
        <div class="super-mds-list-empty__text">
          ${scope === 'patient' ? 'No MDS assessments found for this patient.' : 'No MDS assessments available.'}
        </div>
        <div class="super-mds-list-empty__hint">
          ${scope === 'global' ? 'Navigate to a patient or MDS page to see data.' : ''}
        </div>
      </div>
    `;
  }

  const items = assessments.map(a => {
    const hippsDisplay = a.potentialHipps && a.potentialHipps !== a.currentHipps
      ? `${a.currentHipps || '?????'} &#8594; ${a.potentialHipps}`
      : a.currentHipps || '';

    return `
      <div class="super-mds-list-card" data-assessment-id="${a.externalAssessmentId || a.id}">
        <div class="super-mds-list-card__header">
          <span class="super-mds-list-card__patient">${escapeHtml(a.patientName || 'Unknown')}</span>
          <span class="super-mds-list-card__type">${escapeHtml(a.description || 'MDS')} (${formatDate(a.ardDate)})</span>
        </div>
        ${hippsDisplay ? `<div class="super-mds-list-card__hipps">${hippsDisplay}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="super-mds-list">
      <div class="super-mds-list__items">
        ${items}
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupMDSListeners(container) {
  // Collapsible sections (legacy)
  container.querySelectorAll('.super-mds-section--collapsible .super-mds-section__header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('super-mds-section--collapsed');
    });
  });

  // Collapsible cards
  container.querySelectorAll('.super-mds-card--collapsible .super-mds-card__header--clickable').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking on a button inside the header
      if (e.target.closest('.super-mds-card__btn')) return;
      header.parentElement.classList.toggle('super-mds-card--collapsed');
    });
  });

  // Compliance view buttons
  container.querySelectorAll('.super-mds-compliance-item__btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action) {
        handleComplianceAction(action);
      }
    });
  });

  // Impact items (Would Change HIPPS)
  container.querySelectorAll('.super-mds-impact-item').forEach(item => {
    item.addEventListener('click', () => {
      const mdsItem = item.dataset.item;
      const categoryKey = item.dataset.categoryKey || null;
      console.log('Super Menu: Impact item clicked, dataset:', JSON.stringify(item.dataset), 'mdsItem:', mdsItem, 'categoryKey:', categoryKey);
      if (mdsItem) {
        handleImpactItemClick(mdsItem, categoryKey);
      }
    });
  });

  // Query items (Outstanding and Signed)
  container.querySelectorAll('.super-mds-query-item').forEach(item => {
    item.addEventListener('click', () => {
      const queryId = item.dataset.queryId;
      const mdsItem = item.dataset.item;
      handleQueryClick(queryId, mdsItem);
    });
  });

  // Detection items (No HIPPS Change)
  container.querySelectorAll('.super-mds-detection-item').forEach(item => {
    item.addEventListener('click', () => {
      const mdsItem = item.dataset.item;
      if (mdsItem) {
        navigateToMDSItem(mdsItem);
      }
    });
  });

  // Nav header back buttons (new simplified navigation)
  container.querySelectorAll('.super-nav-header__back').forEach(btn => {
    btn.addEventListener('click', () => {
      const scope = btn.dataset.scope;
      const patientId = btn.dataset.patientId;
      const action = btn.dataset.action;

      if (action === 'back-to-dashboard') {
        // Go back to facility dashboard - clear all state
        MDSViewState.manualContext = null;
        MDSViewState.context = null;
        MDSViewState.data = null;
        MDSViewState.cameFromDashboard = false;
        MDSViewState.showAllAssessments = false;
        if (typeof switchView === 'function') {
          switchView('dashboard');
        }
      } else if (scope === 'global') {
        // Go back to dashboard view - clear manual context
        MDSViewState.manualContext = null;
        MDSViewState.context = null;
        MDSViewState.data = null;
        MDSViewState.cameFromDashboard = false;
        if (typeof switchView === 'function') {
          switchView('dashboard');
        }
      } else if (scope === 'patient' && patientId) {
        // Go back to patient view
        MDSViewState.manualContext = {
          scope: 'patient',
          assessmentId: null,
          patientId,
          patientName: MDSViewState.data?.patientName || null
        };
        MDSViewState.context = MDSViewState.manualContext;
        MDSViewState.data = null;
        MDSViewState.showAllAssessments = true; // Show list when going back
        renderMDSView();
      }
    });
  });

  // MDS nav header back button (for MDS view with dashboard drill-down)
  container.querySelectorAll('.super-mds-nav-header__back').forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('MDS nav back button clicked');
      const action = btn.dataset.action;
      const scope = btn.dataset.scope;
      const patientId = btn.dataset.patientId;
      console.log('Back button data:', { action, scope, patientId });

      if (action === 'back-to-dashboard') {
        // Go back to facility dashboard
        console.log('Going back to dashboard');
        MDSViewState.manualContext = null;
        MDSViewState.context = null;
        MDSViewState.data = null;
        MDSViewState.cameFromDashboard = false;
        MDSViewState.showAllAssessments = false;
        if (typeof switchView === 'function') {
          switchView('dashboard');
        }
      } else if (scope === 'patient' && patientId) {
        // Go back to patient view
        MDSViewState.manualContext = {
          scope: 'patient',
          assessmentId: null,
          patientId,
          patientName: MDSViewState.data?.patientName || null
        };
        MDSViewState.context = MDSViewState.manualContext;
        MDSViewState.data = null;
        MDSViewState.cameFromDashboard = false;
        MDSViewState.showAllAssessments = true;
        renderMDSView();
      }
    });
  });

  // "Open in PCC" buttons
  container.querySelectorAll('.super-mds-nav-header__pcc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const patientId = btn.dataset.patientId;
      const assessmentId = btn.dataset.assessmentId;

      const currentUrl = new URL(window.location.href);
      const origin = currentUrl.origin;

      if (action === 'open-patient' && patientId) {
        window.location.href = `${origin}/admin/client/cp_residentdashboard.jsp?ESOLrow=1&ESOLclientid=${patientId}`;
      } else if (action === 'open-mds' && assessmentId) {
        window.location.href = `${origin}/clinical/mds3/sectionlisting.xhtml?ESOLassessid=${assessmentId}`;
      }
    });
  });

  // "View all assessments" link
  container.querySelectorAll('[data-action="view-all-assessments"]').forEach(link => {
    link.addEventListener('click', () => {
      const patientId = link.dataset.patientId;
      if (patientId) {
        MDSViewState.manualContext = {
          scope: 'patient',
          assessmentId: null,
          patientId,
          patientName: MDSViewState.data?.patientName || null
        };
        MDSViewState.context = MDSViewState.manualContext;
        MDSViewState.data = null;
        MDSViewState.showAllAssessments = true; // Force show full list
        MDSViewState.cameFromDashboard = false;
        renderMDSView();
      }
    });
  });

  // Legacy breadcrumb navigation (keep for compatibility)
  container.querySelectorAll('.super-mds-breadcrumb__item--link').forEach(item => {
    item.addEventListener('click', () => {
      const scope = item.dataset.scope;
      const patientId = item.dataset.patientId;

      if (scope === 'global') {
        MDSViewState.context = { scope: 'global', assessmentId: null, patientId: null };
      } else if (scope === 'patient' && patientId) {
        MDSViewState.context = { scope: 'patient', assessmentId: null, patientId };
      }
      MDSViewState.data = null;
      renderMDSView(true);
    });
  });

  // Patient MDS cards (new patient view)
  container.querySelectorAll('.super-patient-mds').forEach(card => {
    card.addEventListener('click', () => {
      const assessmentId = card.dataset.assessmentId;
      if (assessmentId) {
        const currentPatientId = MDSViewState.context?.patientId;
        const currentPatientName = MDSViewState.data?.patientName;
        // Set manual context for in-menu navigation
        MDSViewState.manualContext = {
          scope: 'mds',
          assessmentId,
          patientId: currentPatientId,
          patientName: currentPatientName
        };
        MDSViewState.context = MDSViewState.manualContext;
        MDSViewState.data = null;
        renderMDSView();
      }
    });
  });

  // Legacy list item clicks
  container.querySelectorAll('.super-mds-list-card').forEach(card => {
    card.addEventListener('click', () => {
      const assessmentId = card.dataset.assessmentId;
      if (assessmentId) {
        MDSViewState.context = { scope: 'mds', assessmentId, patientId: MDSViewState.context?.patientId };
        MDSViewState.data = null;
        renderMDSView(true);
      }
    });
  });

  // MDS Command Center launch button
  const cmdCenterBtn = container.querySelector('#mds-command-center-btn');
  if (cmdCenterBtn) {
    cmdCenterBtn.addEventListener('click', () => {
      MDSCommandCenterLauncher.open();
    });
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function handleComplianceAction(action) {
  console.log('Compliance action:', action);
  // TODO: Implement view unsigned orders/therapy docs
}

async function handleImpactItemClick(mdsItem, categoryKey) {
  console.log('Impact item clicked:', mdsItem, categoryKey ? `(categoryKey: ${categoryKey})` : '');

  // For display, use clean code (not composite key like "I8000:NTA:18")
  const displayTitle = categoryKey ? 'I8000' : mdsItem;

  // Show loading modal
  SuperModal.show({
    title: displayTitle,
    icon: '&#9889;',
    content: `
      <div class="super-evidence__loading">
        <div class="super-modal__spinner"></div>
        <span>Loading item details...</span>
      </div>
    `,
    actions: [],
    size: 'medium',
    className: 'super-evidence-modal'
  });

  try {
    // Fetch item data from API
    const itemData = await fetchMDSItem(mdsItem, categoryKey);

    if (!itemData.success) {
      throw new Error(itemData.error || 'Failed to load item data');
    }

    // Get assessment context for the modal
    const assessmentContext = {
      assessmentId: MDSViewState.manualContext?.assessmentId || MDSViewState.context?.assessmentId,
      patientId: MDSViewState.context?.patientId,
      patientName: MDSViewState.data?.patientName
    };

    // Close loading modal and show evidence modal
    SuperModal.close(false);
    window.EvidenceModal.show(itemData, assessmentContext);

  } catch (error) {
    console.error('Super Menu: Failed to fetch MDS item data:', error);
    window.SuperAnalytics?.track?.('error_shown', {
      surface: 'mds_item_load',
      error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
      error_type: 'api_error',
    });
    SuperModal.showError(`Failed to load: ${error.message}`);
    SuperModal.updateActions([{
      label: 'Close',
      variant: 'secondary',
      action: () => SuperModal.close()
    }]);
  }
}

/**
 * Fetch MDS item details from the API
 * @param {string} itemCode - MDS item code (e.g., "I5600") or composite key (e.g., "I8000:NTA:18")
 * @param {string|null} categoryKey - For I8000 items, the category key (e.g., "NTA:18")
 * @returns {Promise<Object>}
 */
async function fetchMDSItem(itemCode, categoryKey) {
  const authState = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (!authState.authenticated) {
    throw new Error('Please log in to view item details');
  }

  const orgResponse = getOrg();
  const orgSlug = orgResponse?.org;
  const facilityName = getChatFacilityInfo();
  const assessmentId = MDSViewState.manualContext?.assessmentId || MDSViewState.context?.assessmentId;

  if (!orgSlug || !facilityName) {
    throw new Error('Could not determine organization or facility');
  }

  if (!assessmentId) {
    throw new Error('No assessment context available');
  }

  const params = new URLSearchParams({
    externalAssessmentId: assessmentId,
    facilityName,
    orgSlug
  });

  // For I8000 items, use base code + categoryKey param
  // categoryKey can be passed explicitly, or parsed from composite key like "I8000:NTA:18"
  const resolvedCategoryKey = categoryKey || (itemCode.startsWith('I8000:') ? itemCode.replace('I8000:', '') : null);
  const apiItemCode = resolvedCategoryKey ? 'I8000' : itemCode;
  if (resolvedCategoryKey) {
    params.set('categoryKey', resolvedCategoryKey);
  }
  console.log('Super Menu: fetchMDSItem itemCode:', itemCode, 'categoryKey:', categoryKey, 'resolvedCategoryKey:', resolvedCategoryKey, 'apiItemCode:', apiItemCode, 'url:', `/api/extension/mds/items/${apiItemCode}?${params}`);

  const result = await chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    endpoint: `/api/extension/mds/items/${apiItemCode}?${params}`,
    options: { method: 'GET' }
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to load item data');
  }

  return result.data || result;
}

async function handleQueryClick(queryId, mdsItem) {
  console.log('Query clicked:', queryId, mdsItem);

  // Find the query in the data - check all possible locations including recentlySigned
  const allQueries = [
    ...(MDSViewState.data?.outstandingQueries || []),
    ...(MDSViewState.data?.recentlySigned || []),
    ...(MDSViewState.data?.signedQueries || []),
    ...(MDSViewState.data?.completedQueries || [])
  ];

  let query = allQueries.find(q => q.id === queryId);

  // If query is missing key fields (like status or locationName), fetch full details
  if (query && (!query.status || !query.locationName)) {
    console.log('Super Menu: Query has incomplete data, fetching full details...');

    // Show loading modal
    if (window.SuperModal) {
      SuperModal.show({
        title: 'Loading Query...',
        icon: '&#9201;',
        content: `
          <div class="super-modal__loading">
            <div class="super-modal__spinner"></div>
            <span>Loading query details...</span>
          </div>
        `,
        actions: [],
        size: 'small'
      });
    }

    try {
      // Fetch full query from API
      if (window.QueryAPI?.getQuery) {
        const fullQuery = await QueryAPI.getQuery(queryId);
        // Merge with existing data (preserve mdsItemCoded from recentlySigned)
        query = { ...query, ...fullQuery };
        console.log('Super Menu: Fetched full query:', query);
      }
    } catch (error) {
      console.error('Super Menu: Failed to fetch query details:', error);
      window.SuperAnalytics?.track?.('error_shown', {
        surface: 'query_details_load',
        error_code: (window.SuperAnalytics?.toErrorCode?.(error) ?? 'unknown'),
        error_type: 'api_error',
      });
      if (window.SuperModal) {
        SuperModal.close();
      }
      if (window.SuperToast) {
        SuperToast.error('Failed to load query details');
      }
      return;
    }

    // Close loading modal
    if (window.SuperModal) {
      SuperModal.close(false);
    }
  }

  if (!query) {
    console.error('Super Menu: Query not found:', queryId);
    return;
  }

  // Use the existing QueryDetailModal if available
  if (window.QueryDetailModal) {
    // Build a result object that the modal expects
    const result = {
      recommendation: query.aiGeneratedNote || query.nurseEditedNote || query.queryReason || '',
      icd10Code: query.selectedIcd10Code || query.recommendedIcd10?.[0]?.code,
      icd10Description: query.selectedIcd10Description || query.recommendedIcd10?.[0]?.description
    };

    // Pass additional context for signed queries
    const options = {
      showPdfButton: !!query.pdfUrl || query.status === 'signed',
      pdfUrl: query.pdfUrl,
      showCodingStatus: query.mdsItemCoded !== undefined,
      mdsItemCoded: query.mdsItemCoded
    };

    window.QueryDetailModal.show(query, result, options);
  } else {
    console.warn('Super Menu: QueryDetailModal not available');
  }
}

/**
 * Navigate to the MDS section page in PCC for a given item code
 * @param {string} itemCode - MDS item code (e.g., "I5600" → Section I)
 */
function navigateToMDSItem(itemCode, overrideAssessmentId) {
  console.log('Navigate to MDS item:', itemCode);

  if (!itemCode) {
    console.error('Super Menu: No item code provided for navigation');
    return;
  }

  // Extract section letter from item code (e.g., "I5600" → "I")
  const section = itemCode.charAt(0).toUpperCase();
  const assessmentId = overrideAssessmentId || MDSViewState.manualContext?.assessmentId || MDSViewState.context?.assessmentId;

  if (!assessmentId) {
    console.error('Super Menu: No assessment ID available for navigation');
    SuperToast?.warning('Unable to navigate: no assessment context');
    return;
  }

  // Build PCC MDS section URL
  // Correct format: /clinical/mds3/section.xhtml?ESOLassessid=XXX&sectioncode=I
  // Preserve the origin (including subdomain like www21)
  const currentUrl = new URL(window.location.href);
  const origin = currentUrl.origin; // e.g., https://www21.pointclickcare.com

  const sectionUrl = `${origin}/clinical/mds3/section.xhtml?ESOLassessid=${assessmentId}&sectioncode=${section}`;

  console.log('Super Menu: Navigating to MDS section:', sectionUrl);

  // Navigate in current tab
  window.location.href = sectionUrl;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(dateStr);
}

// ============================================================================
// MDS COMMAND CENTER LAUNCHER
// Follows the same dynamic import pattern as ICD10Viewer / showQueryItems()
// ============================================================================

const MDSCommandCenterLauncher = {
  _overlayEl: null,
  _preactUnmount: null,
  _hidden: false,

  async open(opts) {
    // If hidden (user went to analyzer), just show it again
    if (this._overlayEl && this._hidden) {
      this._overlayEl.style.display = '';
      this._hidden = false;
      // Re-attach escape handler
      this._escapeHandler = (e) => {
        if (e.key === 'Escape') this.close();
      };
      document.addEventListener('keydown', this._escapeHandler);
      return;
    }

    if (this._overlayEl) return; // Already open

    // Check for restore state from page navigation
    let initialExpandedId = opts?.initialExpandedId || null;

    // Get org slug and facility name (same pattern as loadMDSData)
    let facilityName, orgSlug;
    try {
      const orgResponse = getOrg();
      orgSlug = orgResponse?.org;
      facilityName = getChatFacilityInfo();
    } catch (e) {
      console.error('[MDSCommandCenter] Could not get org/facility:', e);
    }

    // Create overlay mount point
    const overlayEl = document.createElement('div');
    overlayEl.id = 'mds-command-center-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    // Escape key to close
    this._escapeHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escapeHandler);

    try {
      // Dynamic import — Vite code-splits this chunk automatically
      const [{ render, h }, { MDSCommandCenter }] = await Promise.all([
        import('preact'),
        import('../modules/mds-command-center/MDSCommandCenter.jsx')
      ]);

      render(
        h(MDSCommandCenter, {
          facilityName: facilityName || '',
          orgSlug: orgSlug || '',
          initialExpandedId,
          onClose: (closeOpts) => {
            if (closeOpts?.hide) {
              this.hide();
            } else {
              this.close();
            }
          }
        }),
        overlayEl
      );

      this._preactUnmount = () => render(null, overlayEl);
    } catch (err) {
      console.error('[MDSCommandCenter] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    }
  },

  /** Hide the command center (preserves state) */
  hide() {
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._overlayEl) {
      this._overlayEl.style.display = 'none';
      this._hidden = true;
    }
  },

  close() {
    this._hidden = false;
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  }
};

// ============================================================================
// PDPM ANALYZER LAUNCHER
// ============================================================================

const PDPMAnalyzerLauncher = {
  _overlayEl: null,
  _preactUnmount: null,
  _context: null,
  _edgeTab: null,

  open(context, opts) {
    if (this._overlayEl) {
      this.close(false); // Close existing without marking as dismissed
    }

    this._context = context;
    const initialMode = opts?.mode || 'modal';
    const fromCommandCenter = opts?.fromCommandCenter === true;

    // Remove edge tab if it exists (panel is opening)
    this._removeEdgeTab();

    const overlayEl = document.createElement('div');
    overlayEl.id = 'pdpm-analyzer-overlay';
    document.body.appendChild(overlayEl);
    this._overlayEl = overlayEl;

    this._escapeHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._escapeHandler);

    Promise.all([
      import('preact'),
      import('../modules/pdpm-analyzer/PDPMAnalyzer.jsx')
    ]).then(([{ render, h }, { PDPMAnalyzer }]) => {
      render(
        h(PDPMAnalyzer, {
          context: context,
          onClose: () => this.close(),
          initialMode: initialMode,
          fromCommandCenter: fromCommandCenter,
        }),
        overlayEl
      );
      this._preactUnmount = () => render(null, overlayEl);
    }).catch(err => {
      console.error('[PDPMAnalyzer] Failed to load module:', err);
      overlayEl.remove();
      this._overlayEl = null;
    });
  },

  close(userDismissed = true) {
    const context = this._context;

    // Track user dismissal so auto-open doesn't re-open for this assessment
    if (userDismissed && context?.assessmentId) {
      try {
        sessionStorage.setItem('super_analyzer_dismissed', context.assessmentId);
      } catch (_) {}
    }

    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
    if (this._preactUnmount) {
      this._preactUnmount();
      this._preactUnmount = null;
    }
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
    this._context = null;

    // Show edge tab on MDS pages so user can quickly re-open
    if (userDismissed && context?.scope === 'mds' && context.assessmentId) {
      this._showEdgeTab(context);
    }

    // Restore Command Center if it was hidden
    if (MDSCommandCenterLauncher._hidden) {
      MDSCommandCenterLauncher.open();
    }
  },

  _showEdgeTab(context) {
    this._removeEdgeTab();
    const tab = document.createElement('button');
    tab.id = 'pdpm-analyzer-edge-tab';
    tab.className = 'pdpm-an__edge-tab';
    tab.innerHTML = '<span class="pdpm-an__edge-tab-icon">\u276E</span><span class="pdpm-an__edge-tab-label">PDPM</span>';
    tab.title = 'Reopen PDPM Analyzer';
    tab.addEventListener('click', () => {
      // Clear dismissal and reopen
      try { sessionStorage.removeItem('super_analyzer_dismissed'); } catch (_) {}
      this.open(context, { mode: 'panel' });
    });
    document.body.appendChild(tab);
    this._edgeTab = tab;
  },

  _removeEdgeTab() {
    if (this._edgeTab) {
      this._edgeTab.remove();
      this._edgeTab = null;
    }
  },

  isOpen() {
    return !!this._overlayEl;
  }
};

// Make available globally for cross-file access
window.renderMDSView = renderMDSView;
window.renderMDSContent = renderMDSContent;
window.setupMDSListeners = setupMDSListeners;
window.loadMDSData = loadMDSData;
window.formatRelativeDate = formatRelativeDate;
window.navigateToMDSItem = navigateToMDSItem;
window.MDSCommandCenterLauncher = MDSCommandCenterLauncher;
window.PDPMAnalyzerLauncher = PDPMAnalyzerLauncher;
