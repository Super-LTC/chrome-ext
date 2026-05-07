// PostHog wrapper with PHI guardrails. Single entry point for all events.
//
// - PostHog inits once on module import. The placeholder key disables PostHog
//   so builds work before the real key is provisioned.
// - Auth is bootstrapped from chrome.storage.local.user; identity transitions
//   are observed via chrome.storage.onChanged.
// - Unknown event names log a dev warning; unknown properties strip silently.
//   PHI-shaped string values drop and emit a phi_guardrail_tripped event
//   without the offending value.

import posthog from 'posthog-js/dist/module.full.no-external';
import {
  EVENT_SCHEMA,
  FORBIDDEN_PROP_SUFFIXES,
  ALLOWED_NAME_LIKE_SUFFIXES,
} from './analytics-schema.js';

const KEY = __POSTHOG_KEY__;
const ENABLED = KEY && KEY !== 'phc_PLACEHOLDER';

const PHI_PATTERNS = [
  { name: 'digits_6plus', re: /\b\d{6,}\b/ },                    // potential MRN
  { name: 'mm_dd_yyyy', re: /\b\d{2}\/\d{2}\/\d{4}\b/ },         // DOB
  { name: 'iso_date', re: /\b\d{4}-\d{2}-\d{2}\b/ },             // DOB-ish
  { name: 'two_capitalized', re: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/ }, // FirstLast
];

function isForbiddenPropName(name) {
  if (ALLOWED_NAME_LIKE_SUFFIXES.some(s => name.endsWith(s))) return false;
  if (FORBIDDEN_PROP_SUFFIXES.some(s => name.endsWith(s))) return true;
  if (name === 'name' || name === 'patient_name') return true;
  if (name.endsWith('_name')) return true;
  return false;
}

function scanForPhi(value) {
  if (typeof value !== 'string') return null;
  for (const { name, re } of PHI_PATTERNS) {
    if (re.test(value)) return name;
  }
  return null;
}

function sanitizeProperties(props) {
  if (!props) return props;
  delete props.$current_url;
  delete props.$pathname;
  delete props.$referrer;
  delete props.$host;
  return props;
}

if (ENABLED) {
  posthog.init(KEY, {
    api_host: 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: false,
    capture_performance: false,
    mask_all_text: false,
    mask_all_element_attributes: false,
    property_blacklist: ['$current_url', '$pathname', '$referrer', '$host'],
    sanitize_properties: sanitizeProperties,
    persistence: 'localStorage',
    advanced_disable_decide: false,
    session_recording: {
      maskAllInputs: false,
      maskTextSelector: undefined,
      recordCrossOriginIframes: false,
      inlineStylesheet: true,
      inlineImages: true,
      collectFonts: true,
    },
  });
  posthog.register({
    surface: 'extension',
    ext_version: chrome?.runtime?.getManifest?.().version || 'unknown',
  });

  if (__DEV_MODE__) {
    posthog.onFeatureFlags(() => {
      const sessionId = posthog.sessionRecording?.sessionId || posthog.get_session_id?.();
      const replayUrl = sessionId
        ? `https://us.posthog.com/project/247257/replay/${sessionId}`
        : '(pending)';
      console.log('[PostHog] session replay active', {
        sessionId,
        replayUrl,
        isRecording: !!posthog.sessionRecording?.started,
      });
    });
  }
}

// Map a thrown error to a SHORT TOKEN for `error_code` props. NEVER returns
// the raw error message — that path can leak PHI / response text. Recognizes
// the `apiRequest` background-script convention `Error("API error: 404")`.
export function toErrorCode(e) {
  if (!e) return 'unknown';
  if (typeof e === 'string') {
    const m = e.match(/API error:\s*(\d{3})/);
    if (m) return `http_${m[1]}`;
    return 'unknown';
  }
  if (typeof e.status === 'number') return `http_${e.status}`;
  if (e.code) return String(e.code);
  if (typeof e.message === 'string') {
    const m = e.message.match(/API error:\s*(\d{3})/);
    if (m) return `http_${m[1]}`;
    if (/not authenticated/i.test(e.message)) return 'not_authenticated';
    if (/network|offline|fetch/i.test(e.message)) return 'network_error';
    if (/timeout/i.test(e.message)) return 'timeout';
  }
  if (e.name) return String(e.name);
  return 'unknown';
}

// Parse numeric HTTP status out of an error if present (for api_request_failed).
// Returns null when no status can be safely inferred.
export function toHttpStatus(e) {
  if (!e) return null;
  if (typeof e.status === 'number') return e.status;
  const msg = typeof e === 'string' ? e : e.message;
  if (typeof msg === 'string') {
    const m = msg.match(/API error:\s*(\d{3})/);
    if (m) return Number(m[1]);
  }
  return null;
}

export function track(eventName, props = {}) {
  if (!ENABLED) return;

  const schema = EVENT_SCHEMA[eventName];
  if (!schema) {
    if (__DEV_MODE__) console.warn(`[analytics] Unknown event: ${eventName}`);
    return;
  }

  const sanitized = {};
  for (const [k, v] of Object.entries(props)) {
    if (!schema.includes(k)) continue;
    if (isForbiddenPropName(k)) {
      posthog.capture('phi_guardrail_tripped', {
        event_name: eventName,
        prop_name: k,
        pattern: 'forbidden_suffix',
      });
      continue;
    }
    const phiPattern = scanForPhi(v);
    if (phiPattern) {
      posthog.capture('phi_guardrail_tripped', {
        event_name: eventName,
        prop_name: k,
        pattern: phiPattern,
      });
      continue;
    }
    sanitized[k] = v;
  }

  posthog.capture(eventName, sanitized);
}

export function identify(user) {
  if (!ENABLED || !user?.id) return;
  posthog.identify(user.id, {
    email: user.email,
    role: user.role,
    ext_version: chrome?.runtime?.getManifest?.().version || 'unknown',
  });
  if (user.facilityId) {
    posthog.group('facility', user.facilityId, { name: user.facilityName });
  }
}

// Update the person's version-related props. Called from UpdateChecker after
// it reads the disk manifest, so PostHog person profiles show:
//   ext_version          — what's currently loaded in this Chrome process
//   ext_disk_version     — what's on disk (may be ahead if updater swapped files)
//   ext_disk_drift       — true when disk > running (user hasn't reloaded)
//
// The disk check runs every 5 min — without dedup that's a $set event per
// person every 5 min all day. Only push to PostHog when a value actually
// changes (in-memory cache, reset on page load, which is fine: PostHog person
// props are durable, so re-sending unchanged values is pure waste).
let _lastVersionPropsKey = null;
export function setVersionProperties({ runningVersion, diskVersion, driftDetected }) {
  if (!ENABLED) return;
  const props = {
    ext_version: String(runningVersion || 'unknown'),
  };
  if (diskVersion) props.ext_disk_version = String(diskVersion);
  if (typeof driftDetected === 'boolean') props.ext_disk_drift = driftDetected;

  const key = `${props.ext_version}|${props.ext_disk_version || ''}|${props.ext_disk_drift ?? ''}`;
  if (key === _lastVersionPropsKey) return;
  _lastVersionPropsKey = key;

  try {
    posthog.setPersonProperties(props);
  } catch (e) {
    if (__DEV_MODE__) console.warn('[analytics] setPersonProperties failed', e);
  }
}

export function reset() {
  if (!ENABLED) return;
  posthog.reset();
}

export function setPccContext({ pageType, section, hasPatientContext }) {
  if (!ENABLED) return;
  posthog.register({
    pcc_page_type: pageType || 'unknown',
    pcc_section: section || null,
    pcc_has_patient_context: !!hasPatientContext,
  });
}

async function bootstrapAuth() {
  try {
    const { user } = await chrome.storage.local.get('user');
    if (user) identify(user);
  } catch (e) {
    if (__DEV_MODE__) console.warn('[analytics] auth bootstrap failed', e);
  }
}

if (ENABLED && typeof chrome !== 'undefined' && chrome.storage) {
  bootstrapAuth();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.user) return;
    const next = changes.user.newValue;
    if (next) {
      identify(next);
      track('user_logged_in', { method: 'oauth_extension' });
    } else {
      track('user_logged_out');
      reset();
    }
  });
}

// Expose globally so vanilla scripts loaded as classic <script> tags (which
// can't ES-import this module) can still emit events. Demos that don't bundle
// analytics simply leave window.SuperAnalytics undefined → callers no-op.
if (typeof window !== 'undefined') {
  window.SuperAnalytics = { track, identify, reset, setPccContext, toErrorCode, toHttpStatus };
}
