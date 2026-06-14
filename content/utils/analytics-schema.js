// Event name → allowed property names.
// Unknown event names log a dev warning and drop. Unknown property names are
// stripped silently before send.
//
// Conventions:
// - Event names: noun_verb_pastTense, snake_case
// - Allowed properties: never include patient identifiers, URLs, or free-text.
//   Use buckets / counts / categorical strings.
// - Property name suffixes that are ALWAYS rejected by analytics.js regardless
//   of schema: _text, _message, _query, _body, _content, _url, _name (except
//   names ending in ALLOWED_NAME_LIKE_SUFFIXES).

export const EVENT_SCHEMA = {
  // === Lifecycle & auth ===
  extension_loaded: [],
  user_logged_in: ['method'],
  user_logged_out: [],
  auth_failed: ['reason'],
  update_banner_shown: ['current_version', 'latest_version'],
  update_banner_clicked: ['action', 'current_version', 'latest_version'],
  update_check_failed: ['error_code'],
  // Fires once per session when disk version is ahead of running version —
  // i.e. the Windows updater swapped files but the user hasn't reloaded yet.
  // Lets us see who is sitting on stale runtimes.
  update_disk_drift: ['running_version', 'disk_version'],

  // === Super menu (FAB + panel) ===
  fab_clicked: ['fab'],
  panel_opened: ['tab', 'source'],
  panel_closed: ['duration_ms'],
  panel_tab_switched: ['from_tab', 'to_tab'],

  // === Per-module opens ===
  dashboard_viewed: ['source'],
  mds_view_opened: ['source'],
  facility_dashboard_viewed: ['source'],
  chat_opened: ['source'],
  qm_board_opened: ['source'],
  query_items_opened: ['source'],
  mds_command_center_opened: ['source'],
  mds_planner_opened: ['source'],
  report_24hr_opened: ['source'],
  ard_estimator_opened: ['source'],
  pdpm_analyzer_opened: ['source'],
  dx_confirmation_opened: ['source', 'dx_count'],
  cert_view_opened: ['source'],
  cert_discharged_tab_opened: ['source'],
  cert_discharged_load_more: ['page'],
  care_plan_coverage_opened: ['source'],
  care_plan_stamp_submitted: ['source'],
  rounding_reports_opened: ['source'],
  rounding_session_started: ['source'],
  rounding_session_opened: ['session_status'],
  rounding_qr_opened: ['source'],
  rounding_qr_link_copied: [],
  rounding_pdf_downloaded: ['source'],
  rounding_session_deleted: ['source'],
  uda_viewer_opened: ['source'],
  icd10_viewer_opened: ['source'],

  // === Managed Care (create in extension; open runs via dashboard handoff) ===
  mc_panel_opened: ['source', 'scope'],        // source: 'fab'|'header'; scope: 'patient'|'all'
  mc_wizard_opened: ['prefilled'],             // prefill block found?
  mc_run_created: ['payer_type', 'doc_type_count', 'used_preset'],
  mc_preset_saved: [],
  mc_run_opened: ['status'],                   // opened the real dashboard editor for a run
  mc_run_archived: ['from_status'],
  mc_location_mode_changed: ['mode'],          // 'this'|'all'
  mc_run_completed_toast: ['status'],          // 'completed'|'failed'

  // === Drill-ins & engagement ===
  mds_section_expanded: ['section_code'],
  mds_item_clicked: ['item_code'],

  // Inline AI-verdict badge on the PCC MDS page (the "Super: Yes/No" pill next
  // to each question). Click opens the popover. Pair with `pdpm_item_drilled_in`
  // to compare inline-vs-sidebar entry paths.
  mds_badge_clicked: ['item_code', 'column', 'status'],
  // User accepted/rejected the AI suggestion. `surface` tells you which UI:
  //   'mds_overlay_popover' — inline badge popover on the PCC MDS page
  //   'pdpm_sidebar'        — PDPM Analyzer item detail view
  // `has_reason` only applies to disagree.
  mds_item_decision: ['item_code', 'column', 'decision', 'has_reason', 'surface'],

  // "Run it" on-demand pipeline (assessment not synced / unsolved → trigger a
  // hard sync + full solver run). `surface`: 'section_overlay' | 'pdpm_analyzer'.
  // `code`: originating 404 — 'ASSESSMENT_NOT_FOUND' | 'NO_RUN_YET'.
  mds_run_triggered: ['surface', 'code'],
  mds_run_completed: ['surface', 'code', 'sections_total', 'duration_ms_bucket'],
  mds_run_failed: ['surface', 'code', 'duration_ms_bucket'],

  // Interview-coverage chips on the PCC MDS List → In Progress screen.
  // `_shown` fires once per batch round trip; `_row_clicked` opens the detail popover.
  mds_list_coverage_shown: ['rows', 'ok', 'not_synced'],
  mds_list_coverage_row_clicked: ['required', 'needed'],

  facility_dashboard_tab_switched: ['from_tab', 'to_tab'],
  facility_dashboard_resident_clicked: [],

  qm_tile_clicked: ['measure_code'],
  qm_action_clicked: ['measure_code', 'action'],
  qm_evidence_opened: ['measure_code'],
  qm_drill_in: ['measure_code', 'view'],
  functional_decline_opened: ['source'],

  query_item_clicked: ['item_code'],
  query_evidence_opened: ['item_code', 'evidence_type'],
  query_evidence_filtered: ['filter'],
  query_modal_opened: [],
  query_modal_closed: ['reason'],

  mds_cc_view_switched: ['from_view', 'to_view'],
  mds_cc_item_popover_opened: ['item_code'],
  mds_cc_item_actioned: ['item_code', 'action'],

  mds_planner_view_switched: ['from_view', 'to_view'],
  mds_planner_event_clicked: ['event_type'],

  report_24hr_filter_changed: ['filter', 'value'],
  report_24hr_finding_clicked: ['finding_type'],
  report_24hr_export_clicked: ['format'],

  ard_estimator_estimated: ['duration_ms', 'has_recommendation'],
  ard_estimator_recommendation_accepted: [],
  ard_estimator_recommendation_dismissed: [],

  pdpm_breakdown_viewed: ['component'],
  pdpm_item_drilled_in: ['item_code'],

  dx_confirmed: ['code'],
  dx_rejected: ['code', 'reason'],
  dx_confirmation_completed: ['confirmed_count', 'rejected_count'],

  cert_clicked: ['cert_type'],

  care_plan_gap_clicked: ['gap_type'],

  uda_assessment_clicked: ['assessment_type'],

  icd10_code_clicked: ['code', 'source'],
  icd10_evidence_opened: ['code'],
  icd10_pdf_opened: ['code', 'page_count'],
  icd10_pdf_page_changed: ['code', 'from_page', 'to_page'],
  icd10_search_used: ['query_length_bucket'],

  evidence_viewer_opened: ['type', 'source'],
  evidence_viewer_closed: ['type', 'duration_ms'],

  // === Feedback module ===
  feedback_modal_opened: ['source'],
  feedback_submit_started: ['sentiment', 'has_screenshot', 'message_length_bucket'],
  feedback_submit_succeeded: ['duration_ms'],
  feedback_submit_failed: ['error_code'],
  feedback_modal_dismissed: [],

  // === Async funnels ===
  query_send_started: ['item_code', 'recipient_role'],
  query_send_succeeded: ['duration_ms'],
  query_send_failed: ['error_code'],

  chat_stream_started: [],
  chat_stream_completed: ['duration_ms'],
  chat_stream_failed: ['error_code'],
  chat_session_cleared: [],

  api_request_failed: ['endpoint', 'status'],

  // === Cross-cutting ===
  pcc_page_viewed: ['page_type', 'section', 'has_patient_context'],
  error_shown: ['surface', 'error_code', 'error_type'],
  error_caught: ['surface', 'error_code'],

  // === Care Plan — Initial (auto-pop) flow ===
  // patient_id / focus_id (patient-linked record ids) and `detail` (clinical
  // free-text) are deliberately NOT listed — the guardrail would strip them and
  // we don't want them anyway. Counts, buckets, and `scope` (initial|single)
  // carry the analytical signal.
  care_plan_autopop_button_clicked: [],
  care_plan_autopop_modal_opened: ['n_proposed', 'n_already_on_plan'],
  care_plan_autopop_stamp_clicked: ['scope', 'n_focuses_to_stamp', 'n_focuses_skipped'],
  care_plan_autopop_stamped: ['scope', 'n_proposed', 'n_stamped', 'n_goals', 'n_interventions', 'n_failed', 'duration_ms'],
  care_plan_autopop_library_focus_added: [],
  care_plan_autopop_view_care_plan_clicked: [],

  // === Care Plan — Comprehensive (audit) flow ===
  care_plan_audit_opened_from_button: ['n_existing_focus_texts'],
  care_plan_audit_opened_from_banner: [],
  care_plan_audit_opened_from_review_page: [],
  care_plan_audit_modal_opened: ['n_to_add', 'n_to_verify', 'n_to_remove', 'has_coverage_check_data'],
  care_plan_audit_dashboard_viewed: [],
  care_plan_audit_step_entered: ['step', 'bucket'],
  care_plan_audit_step_exited: ['from_step'],
  care_plan_audit_scope_toggled: ['from_mode', 'to_mode'],
  care_plan_audit_item_resolved: ['from_bucket'],
  care_plan_audit_item_skipped: ['rule_id'],
  // NOTE: emit call is currently MISSING in code — VerifyBucketPane comments
  // claim it's tracked in the modal's _verifyAuditItem handler, but neither the
  // handler nor the track() call exist. Allowlisted so it works once wired up.
  care_plan_audit_item_verified: ['from_bucket'],
  care_plan_audit_verify_dismissed: ['kind'],
  care_plan_audit_partial_stamped: ['source', 'n_interventions', 'caa'],
  care_plan_audit_remove_kept: [],
  care_plan_audit_remove_kept_click: [],
  care_plan_audit_commit: ['source'],
  care_plan_audit_commit_stamped: ['scope', 'n_focuses', 'n_goals', 'n_interventions'],

  // === F-Tag Prevention ===
  // `ftag` is the survey tag code (e.g. "F684") — categorical.
  ftag_prevention_opened: ['source'],
  ftag_filter_clicked: ['ftag'],
  ftag_finding_resolved: ['ftag', 'resolution_type'],
  ftag_finding_snoozed: ['ftag', 'days'],
  ftag_finding_unsnoozed: ['ftag'],
  ftag_finding_reopened: ['ftag'],
  ftag_finding_progress_note_opened: ['ftag'],
  ftag_finding_progress_note: ['ftag'],
  ftag_view_source: ['ftag'],
  ftag_open_patient: ['ftag'],
  ftag_open_pcc_chart: ['ftag'],
  ftag_open_pcc_order: ['ftag'],
  ftag_unsnooze_clicked: ['ftag'],
  ftag_reopen_clicked: ['ftag'],

  // === ICD-10 dismiss ===
  icd10_code_dismissed: ['code', 'origin'],
  icd10_code_undismissed: ['code', 'origin'],

  // === Query print / urgent notify ===
  query_print_started: ['item_code'],
  query_print_succeeded: ['duration_ms'],
  query_print_failed: ['error_code'],
  query_urgent_notify_failed: ['error_code'],

  // === Certifications ===
  cert_view_document: ['cert_type'],

  // === Meta (PHI guardrail tripwire) ===
  phi_guardrail_tripped: ['event_name', 'prop_name', 'pattern'],
};

// Property name suffixes that are forbidden regardless of event schema.
export const FORBIDDEN_PROP_SUFFIXES = [
  '_text', '_message', '_query', '_body', '_content', '_url',
];

// Exception list: names ending in these suffixes are CATEGORICAL, not free-text.
// Checked before FORBIDDEN_PROP_SUFFIXES (which catches names like *_name) and
// before the *_name default rejection.
export const ALLOWED_NAME_LIKE_SUFFIXES = [
  '_type',
  '_pattern_name',
  '_event_type',
  '_finding_type',
  '_assessment_type',
  '_gap_type',
  '_cert_type',
  '_evidence_type',
  '_error_type',
  '_page_type',
];
