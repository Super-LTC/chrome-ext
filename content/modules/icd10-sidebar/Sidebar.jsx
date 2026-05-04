import { h } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { track } from '../../utils/analytics.js';

const BASE_CODE_DESCRIPTIONS = {
  'I69': 'Sequelae of cerebrovascular disease',
  'G30': "Alzheimer's disease",
  'R13': 'Dysphagia',
  'R47': 'Speech disturbances',
  'F03': 'Dementia',
  'F09': 'Mental disorder (physiological)',
  'N18': 'Chronic kidney disease',
  'N40': 'Benign prostatic hyperplasia',
  'M54': 'Dorsalgia',
  'M62': 'Muscle disorders',
  'M46': 'Inflammatory spondylopathies',
  'Z87': 'Personal history',
  'Z94': 'Transplanted organ status',
  'E78': 'Disorders of lipoprotein metabolism',
  'E11': 'Type 2 diabetes mellitus',
  'E66': 'Overweight and obesity',
  'G47': 'Sleep disorders',
  'K21': 'Gastro-esophageal reflux disease',
  'I10': 'Essential hypertension',
  'I49': 'Cardiac arrhythmias',
  'J44': 'COPD',
  'J96': 'Respiratory failure',
  'R93': 'Abnormal diagnostic imaging',
  'R26': 'Gait and mobility abnormalities',
  'R27': 'Coordination disorders',
  'R29': 'Nervous/musculoskeletal symptoms',
  'R33': 'Retention of urine',
  'R41': 'Cognitive symptoms',
  'S12': 'Cervical vertebra fracture',
  'H91': 'Hearing loss'
};

function resolveBaseCodeDescription(baseCode, fallback) {
  if (BASE_CODE_DESCRIPTIONS[baseCode]) return BASE_CODE_DESCRIPTIONS[baseCode];
  if (!fallback) return baseCode;
  const first = fallback.split(/[,(]/)[0].trim();
  return first.length > 40 ? first.substring(0, 40) + '…' : first;
}

function badgesFromItems(items) {
  let nta = false;
  let slp = false;
  let nursing = false;
  let sectionI = false;
  for (const i of items || []) {
    if (i.category === 'nta') nta = true;
    if (i.category === 'slp') slp = true;
    if (i.pdpmCategory === 'NURSING') nursing = true;
    if (i.pdpmCategory === 'SECTION-I') sectionI = true;
  }
  return { nta, slp, nursing, sectionI };
}

/**
 * v2: derive badges directly from a group's pdpmCategory.
 * Server dropped hasNTA/hasSLP — pdpmCategory is the source of truth.
 */
function badgesFromGroup(g) {
  const cat = g?.pdpmCategory || null;
  return {
    nta: cat === 'NTA',
    slp: cat === 'SLP',
    nursing: cat === 'NURSING',
    sectionI: cat === 'SECTION-I',
  };
}

function buildSections({ topRanked, approved, annotations, flatGroups }) {
  // v2: ranked groups have no annotations[]. Source of truth is pdpmCategory.
  // v1 fallback: derive from annotations.
  const rankedBadges = (g) => {
    if (g.pdpmCategory != null || g.annotations == null) {
      return badgesFromGroup(g);
    }
    return badgesFromItems(g.annotations || []);
  };

  const enrichRanked = (g, prefix, origin) => ({
    kind: 'group',
    // v2 has no groupId; key off origin + base code, which backend confirmed
    // is unique within topRanked / approved respectively.
    key: `${prefix}:${g.groupId || g.groupCode || g.group}`,
    origin,
    originLabel: origin === 'topRanked' ? 'Top picks' : 'Approved',
    // groupKey is the server-side dismiss key — passed verbatim, never transformed.
    groupKey: g.group ?? g.groupCode,
    dismissed: !!g.dismissed,
    rank: g.rank,
    code: g.groupCode || g.group,
    description: g.groupName || g.displayName,
    badges: rankedBadges(g),
    pdpmCategory: g.pdpmCategory || null,
    pdpmCategoryName: g.pdpmCategoryName || null,
    pdpmPoints: g.pdpmPoints,
    mdsItemCode: g.mdsItemCode || null,
    group: g,
  });

  const topPicks = (topRanked || []).map(g => enrichRanked(g, 't', 'topRanked'));
  const approvedRows = (approved || []).map(g => enrichRanked(g, 'a', 'approved'));

  // v2 pre-grouped path: render buckets directly, skip per-mention regrouping.
  if (flatGroups) {
    const flatToRow = (g, origin, prefix) => ({
      kind: 'baseCode',
      key: `${prefix}:${g.groupCode || g.group}`,
      origin,
      originLabel: origin === 'speculative' ? 'Speculative' : 'Other',
      groupKey: g.group ?? g.groupCode,
      dismissed: !!g.dismissed,
      code: g.groupCode || g.group,
      description: resolveBaseCodeDescription(g.groupCode || g.group, g.groupName || g.displayName),
      badges: badgesFromGroup(g),
      count: g.mentionCount ?? g.annotationCount ?? 0,
      baseCode: g.groupCode || g.group,
      // pdpmCategoryName / mdsItemCode are passed through for downstream
      // (query attach uses mdsItemCode; tooltips use pdpmCategoryName).
      pdpmCategory: g.pdpmCategory || null,
      pdpmCategoryName: g.pdpmCategoryName || null,
      mdsItemCode: g.mdsItemCode || null,
      // No items[] in v2 — viewer fetches detail on click.
      items: null,
      flatGroup: g,
    });

    // "Other" rolls up nta + slp + other in v2 since the sidebar already shows
    // NTA/SLP membership via badges; mirror v1's UX of one "Other suggestions"
    // section. Speculative stays distinct.
    const otherCombined = [
      ...(flatGroups.nta || []).map(g => flatToRow(g, 'other', 'o')),
      ...(flatGroups.slp || []).map(g => flatToRow(g, 'other', 'o')),
      ...(flatGroups.other || []).map(g => flatToRow(g, 'other', 'o')),
    ];
    // Dedup by base code (a code can appear in nta/slp/other simultaneously).
    const seen = new Set();
    const otherDeduped = otherCombined.filter(r => {
      if (seen.has(r.code)) return false;
      seen.add(r.code);
      return true;
    });
    otherDeduped.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    const speculative = (flatGroups.speculative || [])
      .map(g => flatToRow(g, 'speculative', 's'))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    return {
      topPicks,
      approved: approvedRows,
      other: otherDeduped,
      speculative,
    };
  }

  // v1 path: re-group flat annotations by 3-char base code.
  const buckets = { other: {}, speculative: {} };
  for (const ann of annotations || []) {
    const baseCode = (ann.icd10Code || '').substring(0, 3);
    if (!baseCode) continue;
    const bucket = ann.category === 'speculative' ? 'speculative' : 'other';
    if (!buckets[bucket][baseCode]) {
      buckets[bucket][baseCode] = { baseCode, items: [], description: '' };
    }
    buckets[bucket][baseCode].items.push(ann);
    if (!buckets[bucket][baseCode].description && ann.description) {
      buckets[bucket][baseCode].description = ann.description;
    }
  }

  const toRows = (bucketObj, prefix) =>
    Object.values(bucketObj)
      .map(g => ({
        kind: 'baseCode',
        key: `${prefix}:${g.baseCode}`,
        origin: prefix === 's' ? 'speculative' : 'other',
        originLabel: prefix === 's' ? 'Speculative' : 'Other',
        groupKey: g.baseCode,
        dismissed: false,
        code: g.baseCode,
        description: resolveBaseCodeDescription(g.baseCode, g.description),
        badges: badgesFromItems(g.items),
        count: g.items.length,
        baseCode: g.baseCode,
        items: g.items,
      }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    topPicks,
    approved: approvedRows,
    other: toRows(buckets.other, 'o'),
    speculative: toRows(buckets.speculative, 's'),
  };
}

function allRows(sections) {
  // Visible rows only — used for auto-select/keyboard nav. Hidden rows are
  // intentionally excluded so dismissing doesn't auto-select the just-hidden code.
  return [
    ...sections.topPicks,
    ...sections.other,
    ...sections.speculative,
    ...sections.approved,
  ];
}

function firstRowKey(sections) {
  if (sections.topPicks.length) return sections.topPicks[0].key;
  if (sections.other.length) return sections.other[0].key;
  if (sections.speculative.length) return sections.speculative[0].key;
  if (sections.approved.length) return sections.approved[0].key;
  return null;
}

function buildSelectionPayload(row) {
  if (!row) return null;
  if (row.kind === 'group') {
    const g = row.group;
    const baseCode = g.groupCode || g.group;
    return {
      category: row.origin,
      groupId: g.groupId,
      groupKey: row.groupKey,
      dismissed: !!row.dismissed,
      baseCode,
      groupName: g.groupName || g.displayName,
      evidenceStrength: g.evidenceStrength || null,
      rationale: g.rationale || null,
      pdpmCategory: g.pdpmCategory || null,
      pdpmCategoryName: g.pdpmCategoryName || null,
      pdpmPoints: g.pdpmPoints,
      mdsItemCode: g.mdsItemCode || null,
      // v2 ranked groups carry no annotations[] — viewer fetches by base code.
      items: g.annotations || null,
    };
  }
  return {
    category: row.origin,
    groupKey: row.groupKey,
    dismissed: !!row.dismissed,
    baseCode: row.baseCode,
    pdpmCategory: row.pdpmCategory || null,
    pdpmCategoryName: row.pdpmCategoryName || null,
    mdsItemCode: row.mdsItemCode || null,
    // v2 flat groups carry no items either. v1 paths still pass them.
    items: row.items || null,
  };
}

function Icon({ name }) {
  if (name === 'check') {
    return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 },
      h('polyline', { points: '20 6 9 17 4 12' }));
  }
  if (name === 'alert') {
    return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 },
      h('path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }),
      h('line', { x1: 12, y1: 9, x2: 12, y2: 13 }),
      h('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 }));
  }
  if (name === 'star') {
    return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 },
      h('polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }));
  }
  if (name === 'eye-off') {
    return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      h('path', { d: 'M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
      h('line', { x1: 1, y1: 1, x2: 23, y2: 23 }));
  }
  if (name === 'chevron') {
    return h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 },
      h('polyline', { points: '6 9 12 15 18 9' }));
  }
  return null;
}

function LeafRow({ leaf, baseCode, focused, staged, onClick }) {
  const cls = ['icd10-sb__leaf'];
  if (focused) cls.push('icd10-sb__leaf--focused');
  if (staged) cls.push('icd10-sb__leaf--staged');
  const cat = leaf.pdpmCategory || null;
  let badgeLabel = null, badgeClass = null;
  if (cat) {
    badgeClass = cat.toLowerCase().replace(/[^a-z]/g, '');
    badgeLabel = cat === 'NTA' && leaf.pdpmPoints != null
      ? `NTA +${leaf.pdpmPoints}`
      : cat === 'NURSING' ? 'NURS' : cat === 'SECTION-I' ? 'I' : cat;
  }
  return h('div', {
    class: cls.join(' '),
    onClick: () => onClick(baseCode, leaf),
    title: leaf.description,
  },
    staged && h('span', { class: 'icd10-sb__leaf-check', 'aria-label': 'Staged' }, h(Icon, { name: 'check' })),
    h('span', { class: 'icd10-sb__leaf-code' }, leaf.code),
    h('span', { class: 'icd10-sb__leaf-desc' }, leaf.description || ''),
    badgeLabel && h('span', { class: `icd10-sb__leaf-badge icd10-sb__leaf-badge--${badgeClass}` }, badgeLabel),
  );
}

function LeafList({ baseCode, leaves, focusedLeafCode, stagedLeafSet, onSelectLeaf }) {
  if (!leaves) {
    return h('div', { class: 'icd10-sb__leaves icd10-sb__leaves--loading' },
      h('span', { class: 'icd10-sb__leaves-loading-text' }, 'Loading…')
    );
  }
  if (leaves.length === 0) {
    return h('div', { class: 'icd10-sb__leaves icd10-sb__leaves--empty' },
      h('span', { class: 'icd10-sb__leaves-empty-text' }, 'No mentions found')
    );
  }
  return h('div', { class: 'icd10-sb__leaves' },
    leaves.map(leaf => h(LeafRow, {
      key: leaf.code,
      leaf,
      baseCode,
      focused: focusedLeafCode === leaf.code,
      staged: stagedLeafSet.has(leaf.code),
      onClick: onSelectLeaf,
    }))
  );
}

function Row({ row, selected, onClick, staged, approved, hidden, onDismiss, onUndismiss, dismissDisabled }) {
  const [busy, setBusy] = useState(false);
  const cls = ['icd10-sb__row'];
  if (selected) cls.push('icd10-sb__row--selected');
  if (row.rank != null) cls.push('icd10-sb__row--ranked');
  if (hidden) cls.push('icd10-sb__row--hidden');
  // Staged takes precedence over approved visually (it's the active in-flight state).
  if (staged) cls.push('icd10-sb__row--staged');
  else if (approved) cls.push('icd10-sb__row--approved');
  const b = row.badges || {};
  const hasAnyBadge = b.nta || b.slp || b.nursing || b.sectionI;
  const ptsLabel = (row.pdpmPoints != null) ? ` +${row.pdpmPoints}` : '';
  const tooltip = row.pdpmCategoryName ? `${row.pdpmCategoryName}${ptsLabel}` : null;

  const showDismiss = !hidden && !!onDismiss && !dismissDisabled && !!row.groupKey;
  const showUndo = hidden && !!onUndismiss && !!row.groupKey;

  const handleDismiss = (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    Promise.resolve(onDismiss(row.groupKey, row)).finally(() => {
      setTimeout(() => setBusy(false), 500);
    });
  };
  const handleUndo = (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    Promise.resolve(onUndismiss(row.groupKey, row)).finally(() => {
      setTimeout(() => setBusy(false), 500);
    });
  };

  return h('div', {
    class: cls.join(' '),
    onClick: () => onClick(row.key),
  },
    row.rank != null && !hidden && h('span', { class: 'icd10-sb__rank' }, `#${row.rank}`),
    h('span', { class: 'icd10-sb__code' }, row.code),
    h('span', { class: 'icd10-sb__desc', title: row.description }, row.description),
    hidden && row.originLabel && h('span', { class: 'icd10-sb__origin-chip', title: `Hidden from ${row.originLabel}` }, row.originLabel),
    hasAnyBadge && !hidden && h('span', { class: 'icd10-sb__badges', title: tooltip || undefined },
      b.nta && h('span', { class: 'icd10-sb__badge icd10-sb__badge--nta' },
        row.pdpmPoints != null ? `NTA +${row.pdpmPoints}` : 'NTA'
      ),
      b.slp && h('span', { class: 'icd10-sb__badge icd10-sb__badge--slp' }, 'SLP'),
      b.nursing && h('span', { class: 'icd10-sb__badge icd10-sb__badge--nursing' }, 'NURS'),
      b.sectionI && h('span', { class: 'icd10-sb__badge icd10-sb__badge--sectioni' }, 'I')
    ),
    showDismiss && h('button', {
      type: 'button',
      class: 'icd10-sb__dismiss',
      title: 'Hide for this stay. Will return on readmission.',
      'aria-label': `Hide ${row.code}`,
      disabled: busy,
      onClick: handleDismiss,
    }, '×'),
    showUndo && h('button', {
      type: 'button',
      class: 'icd10-sb__undo',
      title: 'Bring this code back to the list',
      'aria-label': `Undo hide ${row.code}`,
      disabled: busy,
      onClick: handleUndo,
    }, 'Undo')
  );
}

function CollapsibleHeader({ label, count, icon, open, onToggle, variant }) {
  const cls = ['icd10-sb__section-hdr', 'icd10-sb__section-hdr--collapsible'];
  if (variant) cls.push(`icd10-sb__section-hdr--${variant}`);
  return h('button', {
    type: 'button',
    class: cls.join(' '),
    onClick: onToggle,
    'aria-expanded': open,
  },
    icon && h('span', { class: 'icd10-sb__section-icon' }, h(Icon, { name: icon })),
    h('span', { class: 'icd10-sb__section-label' }, label),
    h('span', { class: 'icd10-sb__section-count' }, count),
    h('span', { class: `icd10-sb__section-chevron ${open ? 'icd10-sb__section-chevron--open' : ''}` },
      h(Icon, { name: 'chevron' })
    )
  );
}

function StaticHeader({ label, icon }) {
  return h('div', { class: 'icd10-sb__section-hdr icd10-sb__section-hdr--static' },
    icon && h('span', { class: 'icd10-sb__section-icon' }, h(Icon, { name: icon })),
    h('span', { class: 'icd10-sb__section-label' }, label)
  );
}

export function Sidebar({ topRanked = [], approved = [], annotations = [], flatGroups = null, onSelect, stagedBaseCodes = null, approvedBaseCodes = null, onDismiss, onUndismiss, dismissDisabled = false, onExpandRow = null, onSelectLeaf = null, stagedLeafCodes = null, focusedLeafCode = null }) {
  const stagedSet = stagedBaseCodes instanceof Set ? stagedBaseCodes : new Set(stagedBaseCodes || []);
  const approvedSet = approvedBaseCodes instanceof Set ? approvedBaseCodes : new Set(approvedBaseCodes || []);
  const stagedLeafSet = stagedLeafCodes instanceof Set ? stagedLeafCodes : new Set(stagedLeafCodes || []);
  const isStaged = (row) => stagedSet.has(row.code) || stagedSet.has(row.baseCode);
  const isApproved = (row) => approvedSet.has(row.code) || approvedSet.has(row.baseCode);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [speculativeOpen, setSpeculativeOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);
  const autoSelectedForRef = useRef(null);

  // Selected row's leaves auto-load and render inline. No user-driven
  // expand/collapse — only the selected row reveals its leaves, and only
  // when there's more than one (single-leaf bases get no nested list).
  const [leavesByCode, setLeavesByCode] = useState(() => new Map());
  const [loadingCodes, setLoadingCodes] = useState(() => new Set());

  const leafExpandable = typeof onExpandRow === 'function' && typeof onSelectLeaf === 'function';

  // Optimistic overrides: { [groupKey]: { dismissed: true|false } }.
  // Applied on top of server `dismissed` until the next refetch reconciles.
  const [optimisticOverrides, setOptimisticOverrides] = useState({});

  const rawSections = useMemo(
    () => buildSections({ topRanked, approved, annotations, flatGroups }),
    [topRanked, approved, annotations, flatGroups]
  );

  // Reconcile: clear optimistic entries that now match server state.
  useEffect(() => {
    setOptimisticOverrides(prev => {
      if (!prev || Object.keys(prev).length === 0) return prev;
      const allRowsList = [
        ...rawSections.topPicks,
        ...rawSections.approved,
        ...rawSections.other,
        ...rawSections.speculative,
      ];
      const byKey = new Map();
      for (const r of allRowsList) if (r.groupKey) byKey.set(r.groupKey, !!r.dismissed);
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        if (byKey.has(k) && byKey.get(k) === prev[k].dismissed) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rawSections]);

  // Partition each bucket into visible vs hidden using merged dismissed state.
  const sections = useMemo(() => {
    const isDismissed = (row) => {
      const ovr = row.groupKey != null ? optimisticOverrides[row.groupKey] : null;
      return ovr ? ovr.dismissed : !!row.dismissed;
    };
    const split = (rows) => {
      const visible = [], hidden = [];
      for (const r of rows) (isDismissed(r) ? hidden : visible).push(r);
      return { visible, hidden };
    };
    const tp = split(rawSections.topPicks);
    const ap = split(rawSections.approved);
    const ot = split(rawSections.other);
    const sp = split(rawSections.speculative);
    return {
      topPicks: tp.visible,
      approved: ap.visible,
      other: ot.visible,
      speculative: sp.visible,
      hidden: [...tp.hidden, ...ap.hidden, ...ot.hidden, ...sp.hidden],
    };
  }, [rawSections, optimisticOverrides]);

  const validKeys = useMemo(() => {
    const set = new Set();
    for (const r of allRows(sections)) set.add(r.key);
    return set;
  }, [sections]);

  const handleDismiss = (groupKey, row) => {
    if (!groupKey) return;
    setOptimisticOverrides(prev => ({ ...prev, [groupKey]: { dismissed: true } }));
    // Open the Hidden collapse so the user can see where the code went.
    setHiddenOpen(true);
    if (!onDismiss) return;
    Promise.resolve(onDismiss(groupKey, row)).catch(() => {
      // Rollback on failure. Viewer is responsible for surfacing the toast.
      setOptimisticOverrides(prev => {
        const next = { ...prev };
        delete next[groupKey];
        return next;
      });
    });
  };

  const handleUndismiss = (groupKey, row) => {
    if (!groupKey) return;
    setOptimisticOverrides(prev => ({ ...prev, [groupKey]: { dismissed: false } }));
    if (!onUndismiss) return;
    Promise.resolve(onUndismiss(groupKey, row)).catch(() => {
      setOptimisticOverrides(prev => {
        const next = { ...prev };
        delete next[groupKey];
        return next;
      });
    });
  };

  useEffect(() => {
    const current = selectedKey && validKeys.has(selectedKey) ? selectedKey : null;
    if (current) return;
    const next = firstRowKey(sections);
    if (!next) return;
    // Only auto-select once per unique "first row" to avoid fighting user clicks
    if (autoSelectedForRef.current === next) return;
    autoSelectedForRef.current = next;
    setSelectedKey(next);
    const row = allRows(sections).find(r => r.key === next);
    if (row && onSelect) onSelect(buildSelectionPayload(row));
  }, [sections, selectedKey, validKeys, onSelect]);

  // Auto-fetch leaves for the selected row's base code. Cached after first
  // fetch so re-selecting the same row is instant. Only fires when the
  // sidebar has been wired with onExpandRow (otherwise tree mode is off).
  useEffect(() => {
    if (!leafExpandable || !selectedKey) return;
    const row = allRows(sections).find(r => r.key === selectedKey);
    const code = row?.code;
    if (!code) return;
    if (leavesByCode.has(code) || loadingCodes.has(code)) return;
    let cancelled = false;
    setLoadingCodes(prev => new Set([...prev, code]));
    Promise.resolve(onExpandRow(code, row))
      .then(leaves => {
        if (cancelled) return;
        setLeavesByCode(prev => new Map(prev).set(code, leaves || []));
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[Sidebar] leaf fetch failed:', err);
        setLeavesByCode(prev => new Map(prev).set(code, []));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingCodes(prev => { const n = new Set(prev); n.delete(code); return n; });
      });
    return () => { cancelled = true; };
  }, [selectedKey, sections, leafExpandable, onExpandRow, leavesByCode, loadingCodes]);

  const handleClick = (key) => {
    setSelectedKey(key);
    const row = allRows(sections).find(r => r.key === key)
             || sections.hidden.find(r => r.key === key);
    if (row) {
      // Apply the optimistic override so the panel sees the user-perceived
      // dismissed state, not just what the server last returned.
      const ovr = row.groupKey != null ? optimisticOverrides[row.groupKey] : null;
      const merged = ovr ? { ...row, dismissed: ovr.dismissed } : row;
      // ICD-10 code is reference data — safe categorical value, never PHI.
      track('icd10_code_clicked', { code: row.code, source: 'sidebar' });
      if (onSelect) onSelect(buildSelectionPayload(merged));
    }
  };

  const showApproved = sections.approved.length > 0;
  const showOther = sections.other.length > 0;
  const showSpeculative = sections.speculative.length > 0;

  // Helper: render Row + (optional) nested LeafList. Leaves auto-render only
  // for the selected row, and only when there's more than one leaf — a
  // single-leaf base is identical to the row itself, no nesting needed.
  const renderRowAndLeaves = (row, opts = {}) => {
    const isHidden = !!opts.hidden;
    const isSelected = opts.selected ?? (selectedKey === row.key);
    const rowProps = {
      key: row.key,
      row,
      selected: isSelected,
      onClick: handleClick,
      staged: opts.staged ?? isStaged(row),
      approved: opts.approved ?? isApproved(row),
      hidden: isHidden,
      onDismiss: opts.hidden ? undefined : handleDismiss,
      onUndismiss: opts.hidden ? handleUndismiss : undefined,
      dismissDisabled,
    };
    const out = [h(Row, rowProps)];

    const leaves = leavesByCode.get(row.code);
    const isLoading = loadingCodes.has(row.code);
    const shouldShowLeaves = leafExpandable && isSelected && !isHidden && (
      // While loading, render the loading shell so the user sees something
      // happen without flicker. Once loaded, only render if >1 leaf.
      (leaves == null && isLoading) || (leaves != null && leaves.length > 1)
    );
    if (shouldShowLeaves) {
      out.push(h(LeafList, {
        key: `${row.key}::leaves`,
        baseCode: row.code,
        leaves: leaves || null,
        focusedLeafCode,
        stagedLeafSet,
        onSelectLeaf: (baseCode, leaf) => {
          if (typeof onSelectLeaf === 'function') {
            onSelectLeaf(baseCode, leaf.code, leaf.description, row);
          }
        },
      }));
    }
    return out;
  };

  return h('div', { class: 'icd10-sb' },
    showApproved && h('section', { class: 'icd10-sb__section' },
      h(CollapsibleHeader, {
        label: 'Approved',
        count: sections.approved.length,
        icon: 'check',
        open: approvedOpen,
        onToggle: () => setApprovedOpen(v => !v),
        variant: 'approved',
      }),
      approvedOpen && h('div', { class: 'icd10-sb__section-body' },
        sections.approved.flatMap(row => renderRowAndLeaves(row))
      )
    ),

    h('section', { class: 'icd10-sb__section' },
      h(StaticHeader, { label: 'Top picks', icon: 'star' }),
      h('div', { class: 'icd10-sb__section-body' },
        sections.topPicks.length > 0
          ? sections.topPicks.flatMap(row => renderRowAndLeaves(row))
          : h('div', { class: 'icd10-sb__empty' }, 'No suggestions yet')
      )
    ),

    showOther && h('section', { class: 'icd10-sb__section' },
      h(StaticHeader, { label: 'Other suggestions' }),
      h('div', { class: 'icd10-sb__section-body' },
        sections.other.flatMap(row => renderRowAndLeaves(row))
      )
    ),

    showSpeculative && h('section', { class: 'icd10-sb__section' },
      h(CollapsibleHeader, {
        label: 'Speculative',
        count: sections.speculative.length,
        icon: 'alert',
        open: speculativeOpen,
        onToggle: () => setSpeculativeOpen(v => !v),
        variant: 'warning',
      }),
      speculativeOpen && h('div', { class: 'icd10-sb__section-body' },
        sections.speculative.flatMap(row => renderRowAndLeaves(row))
      )
    ),

    sections.hidden.length > 0 && h('section', { class: 'icd10-sb__section icd10-sb__section--hidden' },
      h(CollapsibleHeader, {
        label: 'Hidden',
        count: sections.hidden.length,
        icon: 'eye-off',
        open: hiddenOpen,
        onToggle: () => setHiddenOpen(v => !v),
        variant: 'hidden',
      }),
      hiddenOpen && h('div', { class: 'icd10-sb__section-body' },
        sections.hidden.flatMap(row => renderRowAndLeaves(row, { hidden: true, selected: false, staged: false, approved: false }))
      )
    )
  );
}
