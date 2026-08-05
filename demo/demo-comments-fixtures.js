/**
 * Comments / inbox / notifications fixtures for the demo site.
 *
 * Backs three shipped features against in-memory state so the demo is LIVE,
 * not screenshots:
 *   - 24-hour report sign-off rail + comment threads + linked progress note
 *     (/api/extension/24hr-report/finding|action|comment|teammates|finding/note)
 *   - MDS item comment threads + cross-building inbox
 *     (/api/extension/mds/comment-badges|threads|threads/resolve|inbox)
 *   - notification badge summary (/api/extension/notifications/summary|seen)
 *
 * State is module-level and mutable on purpose: posting a comment, resolving
 * an ask, or signing off a finding must be visible on the next fetch, exactly
 * like the real backend. A page reload resets the story to its seed.
 *
 * Consumed only by demo-mock-chrome.js routeApiRequest().
 */

// ── People ──────────────────────────────────────────────────────────────────
// DEMO_USER is "you": comment authorship, delete-your-own-comment, and the
// amber "you were asked" states all key off this id (also returned by the
// chrome.storage.local mock as `user`).
export const DEMO_USER = {
  id: 'demo-user-1',
  name: 'Jordan Avery',
  email: 'jordan.avery@sunnymeadows.com',
};

const DANA = { id: 'demo-user-2', name: 'Dana Whitfield', email: 'dana.whitfield@sunnymeadows.com' };
const PRIYA = { id: 'demo-user-3', name: 'Priya Natarajan', email: 'priya.natarajan@sunnymeadows.com' };
const MARCUS = { id: 'demo-user-4', name: 'Marcus Lee', email: 'marcus.lee@sunnymeadows.com' };

export const DEMO_TEAMMATES = [DEMO_USER, DANA, PRIYA, MARCUS];

const HERE_FACILITY = 'SUNNY MEADOWS DEMO FACILITY';
const AWAY_FACILITY = 'WILLOW CREEK CARE CENTER';

/** Fresh-looking relative timestamps, minutes back from page load. */
function ago(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

let idSeq = 100;
function nextId(prefix) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 24-hour report — per-finding activity (sign-off trail + comments + note)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * findingId → { reviewStatus, actions[], comments[], followup }.
 * Shapes match useFindingActivity.js / FindingTrail.jsx:
 *   action:  { id, action, note?, actorName, actorEmail, createdAt }
 *   comment: { id, userId, authorName, authorEmail, message, createdAt }
 *   followup:{ status: 'detected'|'confirmed', summary, detectedAt, detectedPccNoteId }
 */
const findingActivity = {
  // Unwitnessed fall — Dana flagged it and asked a question; nobody answered yet.
  'f-24-1': {
    reviewStatus: 'needs_input',
    actions: [
      {
        id: 'act-1',
        action: 'needs_input',
        note: 'Neuro checks are ordered but I do not see them started on the eMAR.',
        actorName: DANA.name,
        actorEmail: DANA.email,
        createdAt: ago(95),
      },
    ],
    comments: [
      {
        id: 'cmt-1',
        userId: DANA.id,
        authorName: DANA.name,
        authorEmail: DANA.email,
        message: '@Jordan Avery can you confirm the q15 neuro checks actually started on nights?',
        createdAt: ago(94),
      },
    ],
    followup: null,
  },
  // GG decline — your own comment, so the demo can show delete-your-own.
  'f-24-2': {
    reviewStatus: 'open',
    actions: [],
    comments: [
      {
        id: 'cmt-2',
        userId: DEMO_USER.id,
        authorName: DEMO_USER.name,
        authorEmail: DEMO_USER.email,
        message: 'PT eval is on the schedule for tomorrow AM — will update after.',
        createdAt: ago(40),
      },
    ],
    followup: null,
  },
  // New UTI — the whole loop closed: commented, note written in PCC, auto-linked,
  // signed off via the note prompt.
  'f-24-3': {
    reviewStatus: 'resolved',
    actions: [
      {
        id: 'act-2',
        action: 'resolved',
        note: 'Added a progress note in PointClickCare.',
        actorName: PRIYA.name,
        actorEmail: PRIYA.email,
        createdAt: ago(130),
      },
    ],
    comments: [
      {
        id: 'cmt-3',
        userId: PRIYA.id,
        authorName: PRIYA.name,
        authorEmail: PRIYA.email,
        message: 'Dr. Patel called back — cipro started, culture pending. Writing the note now.',
        createdAt: ago(140),
      },
    ],
    followup: {
      status: 'confirmed',
      summary: 'Ciprofloxacin 500mg BID started per Dr. Patel; culture pending.',
      detectedAt: ago(128),
      detectedPccNoteId: 'demo-note-1',
    },
  },
};

/** The linked-note text behind "View note" on f-24-3. */
const linkedNotes = {
  'f-24-3': {
    type: 'Nursing Note',
    text:
      'Late entry. MD Patel returned call at 0315 regarding positive UA for resident in 205. ' +
      'New order received: Ciprofloxacin 500mg PO BID x7 days, first dose given 0340. ' +
      'Urine culture and sensitivity sent to lab, results pending. ' +
      'Resident afebrile at 0400, denies flank pain. Will continue to monitor I&O and mental status. ' +
      'Family (daughter) notified of new order at 0715.',
  },
};

function emptyActivity() {
  return { reviewStatus: 'open', actions: [], comments: [], followup: null };
}

function activityFor(findingId) {
  if (!findingActivity[findingId]) findingActivity[findingId] = emptyActivity();
  return findingActivity[findingId];
}

/** GET /24hr-report/finding */
export function get24hrFindingActivity(findingId) {
  const a = activityFor(findingId);
  // Copies, not the live arrays: hooks keep the returned arrays as state and
  // append to them locally — handing out the store's own arrays would make a
  // later store push show up twice on screen.
  return {
    reviewStatus: a.reviewStatus,
    actions: [...a.actions],
    comments: [...a.comments],
    followup: a.followup ? { ...a.followup } : null,
  };
}

/** POST /24hr-report/action */
export function apply24hrAction({ findingId, action, note }) {
  const a = activityFor(findingId);
  a.actions.push({
    id: nextId('act'),
    action,
    ...(note ? { note } : {}),
    actorName: DEMO_USER.name,
    actorEmail: DEMO_USER.email,
    createdAt: new Date().toISOString(),
  });
  a.reviewStatus = action === 'reopened' ? 'open' : action;
  return { finding: { reviewStatus: a.reviewStatus } };
}

/** POST /24hr-report/comment */
export function post24hrComment({ findingId, message }) {
  const a = activityFor(findingId);
  const comment = {
    id: nextId('cmt'),
    userId: DEMO_USER.id,
    authorName: DEMO_USER.name,
    authorEmail: DEMO_USER.email,
    message,
    createdAt: new Date().toISOString(),
  };
  a.comments.push(comment);
  return { comment };
}

/** DELETE /24hr-report/comment/:id */
export function delete24hrComment(commentId) {
  for (const a of Object.values(findingActivity)) {
    a.comments = a.comments.filter((c) => c.id !== commentId);
  }
  return { deleted: true };
}

/** GET /24hr-report/finding/note */
export function get24hrLinkedNote(findingId) {
  return { note: linkedNotes[findingId] || null };
}

/** POST /24hr-report/finding/link-note */
export function link24hrNote({ findingId, pccNoteId }) {
  const a = activityFor(findingId);
  a.followup = {
    status: 'detected',
    summary: 'Progress note written in PointClickCare.',
    detectedAt: new Date().toISOString(),
    detectedPccNoteId: pccNoteId || 'demo-note-linked',
  };
  return { linked: true };
}

/**
 * Collapsed rows show status pill / comment count / note chip from the LIST
 * payload, before any row is expanded — merge live state onto each finding.
 */
export function decorate24hrFindings(findings) {
  return (findings || []).map((f) => {
    const a = findingActivity[f.id];
    if (!a) return f;
    return {
      ...f,
      reviewStatus: a.reviewStatus,
      commentCount: a.comments.length,
      followup: a.followup,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MDS item threads + badges
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Threads keyed by `${mdsItem}${mdsColumn}`. The demo has one assessment story,
 * so assessment-scoped fetches (inbox rows) and page-scoped fetches (bubbles)
 * resolve to the same thread — which is also what makes "post here, see it in
 * the inbox" work.
 *
 * comment shape matches comment-thread.js commentHtml():
 *   { authorName, authorEmail, message, createdAt, assignedTo?: [{name}] }
 */
const mdsThreads = {
  // Dana (regional) asked YOU about I0600 from another building — the amber
  // bubble, the "Asked of you" inbox row, and Reply & resolve all hang off this.
  I0600: {
    mdsItem: 'I0600',
    mdsColumn: '',
    itemLabel: 'I0600 Heart Failure (e.g. CHF)',
    patientLabel: 'Doe, Jane · 308-B',
    facilityName: AWAY_FACILITY,
    assessmentId: 'demo-assess-willow-1',
    externalAssessmentId: 'EXT-991204',
    resolved: false,
    unreadForMe: false,
    myAssignmentId: 'mention-1',
    askedByName: DANA.name,
    comments: [
      {
        authorName: DANA.name,
        authorEmail: DANA.email,
        message:
          'Hospital packet has an echo with EF 38% but I only see "cardiomyopathy" in the dx list. Should this be coded as active CHF? Can you check the cardiology consult before we lock?',
        createdAt: ago(180),
        assignedTo: [{ name: DEMO_USER.name }],
      },
    ],
  },
  // A live conversation you are following — grey bubble with a count, unread
  // dot in the inbox.
  I2900: {
    mdsItem: 'I2900',
    mdsColumn: '',
    itemLabel: 'I2900 Diabetes Mellitus',
    patientLabel: 'Doe, Jane · 308-B',
    facilityName: HERE_FACILITY,
    assessmentId: 'demo-assess-sunny-1',
    externalAssessmentId: 'EXT-486025',
    resolved: false,
    unreadForMe: true,
    myAssignmentId: null,
    askedByName: PRIYA.name,
    comments: [
      {
        authorName: PRIYA.name,
        authorEmail: PRIYA.email,
        message: 'A1c on the admission labs was 8.9 — insulin sliding scale is on the MAR, so this looks active to me.',
        createdAt: ago(300),
        assignedTo: [{ name: MARCUS.name }],
      },
      {
        authorName: MARCUS.name,
        authorEmail: MARCUS.email,
        message: 'Agreed, endocrinology note from 3/12 confirms. Coding Yes.',
        createdAt: ago(55),
      },
    ],
  },
  // History: an ask that was answered and closed. Collapsed under "Resolved".
  I5800: {
    mdsItem: 'I5800',
    mdsColumn: '',
    itemLabel: 'I5800 Depression (Other Than Bipolar)',
    patientLabel: 'Reyes, Marcus · 214-A',
    facilityName: HERE_FACILITY,
    assessmentId: 'demo-assess-sunny-2',
    externalAssessmentId: 'EXT-486031',
    resolved: true,
    unreadForMe: false,
    myAssignmentId: null,
    askedByName: DANA.name,
    comments: [
      {
        authorName: DANA.name,
        authorEmail: DANA.email,
        message: 'PHQ-9 came back 14 but I do not see a dx — was this ever confirmed with Dr. Okafor?',
        createdAt: ago(2880),
        assignedTo: [{ name: PRIYA.name }],
      },
      {
        authorName: PRIYA.name,
        authorEmail: PRIYA.email,
        message: 'Yes — confirmed on the 3/28 visit, dx added to the chart. Coding Yes and resolving.',
        createdAt: ago(2760),
      },
    ],
  },
};

function threadKeyOf(t) {
  return `mds:${t.assessmentId}:${t.mdsItem}${t.mdsColumn || ''}`;
}

function findMdsThread(mdsItem, mdsColumn) {
  return mdsThreads[`${mdsItem}${mdsColumn || ''}`] || null;
}

/** GET /mds/comment-badges — every commented item, keyed for CommentBadges. */
export function getMdsCommentBadges() {
  const badges = [];
  for (const t of Object.values(mdsThreads)) {
    if (!t.comments.length) continue;
    badges.push({
      mdsItem: t.mdsItem,
      mdsColumn: t.mdsColumn || '',
      count: t.comments.length,
      awaitingMe: !!t.myAssignmentId && !t.resolved,
    });
  }
  return { badges };
}

/** GET /mds/threads — the conversation + roster + suggestion for one item. */
export function getMdsThread(mdsItem, mdsColumn) {
  const t = findMdsThread(mdsItem, mdsColumn);
  if (!t) {
    // A NEW thread: no conversation yet, but suggest who to ask — Marcus
    // "opened this MDS", the same pre-fill the real backend computes.
    return {
      comments: [],
      teammates: DEMO_TEAMMATES.filter((p) => p.id !== DEMO_USER.id),
      suggestion: {
        suggestions: [
          { userId: MARCUS.id, name: MARCUS.name, email: MARCUS.email, reason: 'opened_this_mds' },
        ],
      },
      myAssignmentId: null,
    };
  }
  return {
    comments: [...t.comments],
    teammates: DEMO_TEAMMATES.filter((p) => p.id !== DEMO_USER.id),
    suggestion: null,
    myAssignmentId: t.resolved ? null : t.myAssignmentId,
  };
}

/** POST /mds/threads — post a comment / start an ask. */
export function postMdsComment({ mdsItem, mdsColumn, message, assignedUserIds }) {
  const key = `${mdsItem}${mdsColumn || ''}`;
  let t = mdsThreads[key];
  if (!t) {
    t = mdsThreads[key] = {
      mdsItem,
      mdsColumn: mdsColumn || '',
      itemLabel: `${mdsItem} MDS item`,
      patientLabel: 'Doe, Jane · 308-B',
      facilityName: HERE_FACILITY,
      assessmentId: 'demo-assess-sunny-1',
      externalAssessmentId: 'EXT-486025',
      resolved: false,
      unreadForMe: false,
      myAssignmentId: null,
      askedByName: null,
      comments: [],
    };
  }
  const assigned = DEMO_TEAMMATES.filter((p) => (assignedUserIds || []).includes(p.id));
  t.comments.push({
    authorName: DEMO_USER.name,
    authorEmail: DEMO_USER.email,
    message,
    createdAt: new Date().toISOString(),
    ...(assigned.length ? { assignedTo: assigned.map((p) => ({ name: p.name })) } : {}),
  });
  if (assigned.length) {
    t.resolved = false;
    t.askedByName = DEMO_USER.name;
  }
  return { posted: true };
}

/** POST /mds/threads/resolve — answer the ask addressed to you and close it. */
export function resolveMdsAssignment({ commentMentionId, message }) {
  const t = Object.values(mdsThreads).find((x) => x.myAssignmentId === commentMentionId);
  if (!t) return { resolved: false };
  t.comments.push({
    authorName: DEMO_USER.name,
    authorEmail: DEMO_USER.email,
    message,
    createdAt: new Date().toISOString(),
  });
  t.myAssignmentId = null;
  t.resolved = true;
  return { resolved: true };
}

/** GET /mds/inbox — rows across every building, live state included. */
export function getMdsInbox() {
  const rows = Object.values(mdsThreads).map((t) => {
    const last = t.comments[t.comments.length - 1];
    return {
      threadKey: threadKeyOf(t),
      source: 'mds_item',
      mdsItem: t.mdsItem,
      mdsColumn: t.mdsColumn || '',
      itemLabel: t.itemLabel,
      patientLabel: t.patientLabel,
      facilityName: t.facilityName,
      pccFacilityName: t.facilityName,
      assessmentId: t.assessmentId,
      externalAssessmentId: t.externalAssessmentId,
      resolved: t.resolved,
      awaitingMe: !!t.myAssignmentId && !t.resolved,
      mentionsMe: !!t.myAssignmentId,
      unread: t.unreadForMe && !t.resolved,
      askedByName: t.askedByName,
      messageCount: t.comments.length,
      lastMessage: {
        authorName: last?.authorName || 'Someone',
        message: last?.message || '',
        createdAt: last?.createdAt || new Date().toISOString(),
      },
    };
  });

  // One 24-hour finding where Dana mentioned you — "Open the report" jumps
  // straight to that finding inside the 24hr panel.
  const fall = findingActivity['f-24-1'];
  rows.push({
    threadKey: '24hr:demo-report-2026-04-24:f-24-1',
    source: 'report_finding',
    reportId: 'demo-report-2026-04-24',
    findingId: 'f-24-1',
    reportDateLocal: '2026-04-24',
    itemLabel: 'Unwitnessed floor-find at 0412',
    patientLabel: 'Novak, Eleanor · 312-A',
    facilityName: HERE_FACILITY,
    pccFacilityName: HERE_FACILITY,
    resolved: fall.reviewStatus === 'resolved',
    awaitingMe: false,
    mentionsMe: true,
    unread: fall.reviewStatus !== 'resolved',
    askedByName: DANA.name,
    messageCount: fall.comments.length,
    lastMessage: {
      authorName: DANA.name,
      message: fall.comments[0]?.message || '',
      createdAt: fall.comments[0]?.createdAt || new Date().toISOString(),
    },
  });

  return { rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// Notifications summary
// ═══════════════════════════════════════════════════════════════════════════

let report24hSeen = false;

/** GET /notifications/summary — computed from live thread/finding state. */
export function getNotificationsSummary() {
  const threads = Object.values(mdsThreads);
  const tagActionCount = threads.filter((t) => t.myAssignmentId && !t.resolved).length;
  const tagUnreadCount = threads.filter((t) => t.unreadForMe && !t.resolved).length;
  const fall = findingActivity['f-24-1'];
  const tagMentionCount = fall.reviewStatus === 'resolved' ? 0 : 1;
  return {
    actionCount: 0,
    fyiUnseenCount: 0,
    report24hUnseen: !report24hSeen,
    tagActionCount,
    tagMentionCount,
    tagUnreadCount,
    tagToasts: [],
  };
}

/** POST /notifications/seen */
export function markNotificationsSeen(keys) {
  const clean = Array.isArray(keys) ? keys : [];
  for (const key of clean) {
    if (String(key).startsWith('report_24h:')) report24hSeen = true;
  }
  return { marked: clean.length };
}

/** Called by the demo when the user opens a thread — clears its unread dot. */
export function markMdsThreadRead(mdsItem, mdsColumn) {
  const t = findMdsThread(mdsItem, mdsColumn);
  if (t) t.unreadForMe = false;
}
