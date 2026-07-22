/**
 * Team subtab — full self-serve team management from the extension. Lists the
 * people in the org (scoped to the caller's admin scope by the backend) and lets
 * an admin drill into a person to change their access level, features, and
 * buildings, remove them, or manage a pending invite (copy link / reset temp
 * password / delete) — plus invite new staff (email link or temp password).
 * Reads/writes /api/extension/team/* via settings-api.
 *
 * Navigation-heavy: roster → person/pending detail → focused editor screens, each
 * with a "← Back". The server re-enforces every delegation rule (scope ≤ own,
 * buildings in scope, features you hold, keep ≥1 org admin, can't manage
 * yourself) — this UI only renders what the caller is allowed to do.
 */
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  getTeamMembers,
  getTeamGrantable,
  getTeamMemberPermissions,
  inviteTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  updateTeamMemberPermissions,
  updateTeamMemberLocations,
  resetInvitationPassword,
  deleteInvitation,
  addTeamDoctor,
  sendTeamDoctorLink,
  getTeamRegions,
  getTeamRegion,
  createTeamRegion,
  renameTeamRegion,
  deleteTeamRegion,
  addRegionBuildings,
  removeRegionBuildings,
  addRegionMember,
  removeRegionMember,
} from './utils/settings-api.js';
import { Section } from './ui.jsx';
import { track } from '../../utils/analytics.js';

const SCOPE_LABELS = {
  org_admin: 'Org admin',
  region_admin: 'Region admin',
  building_admin: 'Building admin',
  user: 'Staff',
};
const SCOPE_ORDER = ['org_admin', 'region_admin', 'building_admin', 'user'];
const SCOPE_DESC = {
  org_admin: 'Full access to the whole organization.',
  region_admin: 'Manages the buildings in their region.',
  building_admin: 'Manages their assigned building(s).',
  user: 'Regular staff — no team management.',
};

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const CHEVRON_DOWN = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const BUILDING = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </svg>
);

/** Seed a feature set from a job-title template, clamped to what the actor can grant. */
function seedFromRole(roleModules, grantable) {
  const out = {};
  for (const k of Object.keys(grantable)) out[k] = !!(roleModules?.[k] && grantable[k]);
  return out;
}
/** Clamp an arbitrary feature set to what the actor can grant. */
function clampModules(modules, grantable) {
  const out = {};
  for (const k of Object.keys(grantable)) out[k] = !!(modules?.[k] && grantable[k]);
  return out;
}
/** A bundle is "on" only when every one of its features is granted. */
function bundleFullyOn(modules, bundle) {
  return bundle.modules.every((m) => modules[m] === true);
}
/** Flip every (grantable) feature in a bundle on/off. */
function applyBundle(modules, bundle, on, grantable) {
  const next = { ...modules };
  for (const m of bundle.modules) next[m] = on && !!grantable[m];
  return next;
}
/** Only bundles with at least one grantable feature are worth showing. */
function grantableBundles(bundles, grantable) {
  return (bundles || []).filter((b) => b.modules.some((m) => grantable[m]));
}
function prettyRole(snfRole) {
  return String(snfRole)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
/** Every grantable feature on — the "full access" default for someone with nothing set yet. */
function allGrantableOn(grantable) {
  const out = {};
  for (const k of Object.keys(grantable || {})) out[k] = !!grantable[k];
  return out;
}
/** True when a module set has every grantable feature on (i.e. full access). */
function isAllOn(modules, grantable) {
  const keys = Object.keys(grantable || {}).filter((k) => grantable[k]);
  return keys.length > 0 && keys.every((k) => modules?.[k] === true);
}

/** A tappable settings-style row: label on the left, current value + chevron on the right. */
function NavRow({ label, value, onClick }) {
  return (
    <button type="button" class="sset-navrow" data-track="team_detail_drilldown" onClick={onClick}>
      <span class="sset-navrow__label">{label}</span>
      <span class="sset-navrow__value">
        {value ? <span class="sset-navrow__val">{value}</span> : null}
        {CHEVRON}
      </span>
    </button>
  );
}

/** A labelled control block (label + optional sub) that doesn't clip its children. */
function Ctl({ label, sub, children }) {
  return (
    <div class="sset-ctl">
      <span class="sset-ctl__label">{label}</span>
      {sub ? <div class="sset-ctl__sub">{sub}</div> : null}
      {children}
    </div>
  );
}

/**
 * Inline picker: shows the current value as a select-like button; tap to expand a
 * radio list of options in place (no floating menu → nothing to clip or mis-place).
 * options: [{ value, label, desc? }].
 */
function Picker({ value, options, onChange, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  if (open && !disabled) {
    return (
      <div class="sset-picker__list">
        {options.map((o) => (
          // NO_TRACK — inline picker selection (the calling screen tracks the resulting save)
          <button key={o.value} type="button" class={`sset-report${o.value === value ? ' is-on' : ''}`} onClick={() => { onChange(o.value); setOpen(false); }}>
            <span class="sset-check">{CHECK}</span>
            <span class="sset-report__text">
              <span class="sset-report__title">{o.label}</span>
              {o.desc ? <span class="sset-report__desc">{o.desc}</span> : null}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <button type="button" class="sset-picker__btn" data-track="team_picker_opened" disabled={disabled} onClick={() => setOpen(true)}>
      <span class="sset-picker__val">{cur?.label ?? placeholder ?? 'Select…'}</span>
      {CHEVRON_DOWN}
    </button>
  );
}

export function TeamTab({ facilityName, orgSlug }) {
  // nav: {view:'list'|'invite'|'add-doctor'} | {view:'person', id} | {view:'pending', id}
  const [nav, setNav] = useState({ view: 'list' });
  const [sub, setSub] = useState('people'); // list-level sub-tab: people | doctors | regions
  const [team, setTeam] = useState(null);
  const [grantable, setGrantable] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [scope, setScope] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [webBaseUrl, setWebBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyData = (m, g) => {
    setTeam(m.team);
    setGrantable(g);
    setCanManage(m.canManage ?? (m.scope && m.scope !== 'user'));
    setScope(m.scope ?? null);
    setSelfId(m.selfUserId ?? null);
    setWebBaseUrl(m.webBaseUrl || '');
  };

  const load = useCallback(async () => {
    if (!orgSlug) {
      setError('Open this on a facility page so we know your organization.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, g] = await Promise.all([getTeamMembers(orgSlug), getTeamGrantable(orgSlug)]);
      applyData(m, g);
    } catch (e) {
      setError(e.message || 'Could not load your team.');
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  // Silent reload — refresh data without the full-screen spinner, so an open
  // detail screen updates in place after a save.
  const refresh = useCallback(async () => {
    try {
      const [m, g] = await Promise.all([getTeamMembers(orgSlug), getTeamGrantable(orgSlug)]);
      applyData(m, g);
    } catch {
      /* the action's own error already surfaced; keep showing what we have */
    }
  }, [orgSlug]);

  useEffect(() => {
    track('team_tab_opened', { source: 'settings' });
    load();
  }, [load]);

  if (loading) {
    return (
      <div class="sset-body">
        <div class="sset-loading"><div class="sset-spinner" /><span>Loading your team…</span></div>
      </div>
    );
  }

  if (error) {
    return (
      <div class="sset-body">
        <div class="sset-notice">
          <div class="sset-notice__title">Couldn't load your team</div>
          <div class="sset-notice__text">{error}</div>
          {orgSlug ? (
            <button type="button" class="sset-btn sset-btn--ghost" style="margin-top:10px;" data-track="team_load_retry" onClick={load}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (nav.view === 'invite') {
    return (
      <InviteView
        grantable={grantable}
        facilityName={facilityName}
        orgSlug={orgSlug}
        onCancel={() => setNav({ view: 'list' })}
        onInvited={() => { setNav({ view: 'list' }); load(); }}
      />
    );
  }

  if (nav.view === 'add-doctor') {
    return (
      <AddDoctorView
        grantable={grantable}
        facilityName={facilityName}
        orgSlug={orgSlug}
        onCancel={() => setNav({ view: 'list' })}
        onAdded={() => { setNav({ view: 'list' }); load(); }}
      />
    );
  }

  if (nav.view === 'person') {
    const person = (team?.people ?? []).find((p) => p.userId === nav.id);
    if (!person) {
      return <GoneNotice text="This person is no longer on the team." onBack={() => setNav({ view: 'list' })} />;
    }
    return (
      <PersonDetailView
        person={person}
        grantable={grantable}
        orgSlug={orgSlug}
        isSelf={person.userId === selfId}
        onBack={() => setNav({ view: 'list' })}
        onChanged={refresh}
        onRemoved={() => { setNav({ view: 'list' }); load(); }}
      />
    );
  }

  if (nav.view === 'pending') {
    const pending = (team?.pendingPeople ?? []).find((p) => p.invitationId === nav.id);
    if (!pending) {
      return <GoneNotice text="This invitation is no longer pending." onBack={() => setNav({ view: 'list' })} />;
    }
    return (
      <PendingDetailView
        pending={pending}
        orgSlug={orgSlug}
        webBaseUrl={webBaseUrl}
        onBack={() => setNav({ view: 'list' })}
        onChanged={refresh}
        onDeleted={() => { setNav({ view: 'list' }); load(); }}
      />
    );
  }

  // List level — a sub-tab bar (People / Doctors / Regions) instead of one long scroll.
  const subTabs = <SubTabs sub={sub} setSub={setSub} team={team} isOrgAdmin={scope === 'org_admin'} />;
  if (sub === 'doctors') {
    return (
      <DoctorsView subTabs={subTabs} team={team} grantable={grantable} canManage={canManage} orgSlug={orgSlug}
        onAddDoctor={() => setNav({ view: 'add-doctor' })} onChanged={refresh} />
    );
  }
  if (sub === 'regions' && scope === 'org_admin') {
    return <RegionsView subTabs={subTabs} orgSlug={orgSlug} grantable={grantable} team={team} onChanged={refresh} />;
  }
  return (
    <PeopleView subTabs={subTabs} team={team} grantable={grantable} canManage={canManage} selfId={selfId}
      onInvite={() => setNav({ view: 'invite' })}
      onOpenPerson={(id) => setNav({ view: 'person', id })}
      onOpenPending={(id) => setNav({ view: 'pending', id })} />
  );
}

/** The Team tab's sub-tab bar. */
function SubTabs({ sub, setSub, team, isOrgAdmin }) {
  const items = [
    { key: 'people', label: 'People', n: (team?.people ?? []).length },
    { key: 'doctors', label: 'Doctors', n: (team?.doctors ?? []).length },
  ];
  if (isOrgAdmin) items.push({ key: 'regions', label: 'Regions' });
  return (
    <nav class="sset-subtabs">
      {items.map((s) => (
        <button key={s.key} type="button" data-track="team_subtab_selected" class={`sset-subtab${sub === s.key ? ' is-active' : ''}`} onClick={() => setSub(s.key)}>
          {s.label}{typeof s.n === 'number' ? <span class="sset-subtab__n">{s.n}</span> : null}
        </button>
      ))}
    </nav>
  );
}

function GoneNotice({ text, onBack }) {
  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_detail_back" onClick={onBack}>← Back to team</button>
      <div class="sset-empty">{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

function PeopleView({ subTabs, team, grantable, canManage, selfId, onInvite, onOpenPerson, onOpenPending }) {
  const people = team?.people ?? [];
  const pending = team?.pendingPeople ?? [];
  const buildings = grantable?.buildings ?? [];
  const [q, setQ] = useState('');
  const [bldg, setBldg] = useState(''); // '' = all buildings

  const needle = q.trim().toLowerCase();
  const shownPeople = people.filter((p) => {
    if (needle && !`${p.name || ''} ${p.email || ''}`.toLowerCase().includes(needle)) return false;
    if (bldg && !(p.locationIds || []).includes(bldg)) return false;
    return true;
  });

  const bldgOptions = [{ value: '', label: 'All buildings' }, ...buildings.map((b) => ({ value: b.id, label: b.name }))];
  const showFilters = people.length > 4 || buildings.length > 1;

  return (
    <div class="sset-body">
      {subTabs}
      <div class="sset-team-head">
        <div class="sset-team-head__count">
          {people.length} {people.length === 1 ? 'person' : 'people'}
          {canManage && pending.length ? ` · ${pending.length} invited` : ''}
        </div>
        {canManage ? (
          <button type="button" class="sset-btn sset-btn--primary" data-track="team_invite_opened" onClick={onInvite}>
            Invite someone
          </button>
        ) : null}
      </div>

      {showFilters ? (
        <>
          <div class="sset-search">
            <input type="text" class="sset-input" value={q} onInput={(e) => setQ(e.target.value)} placeholder="Search people…" />
          </div>
          {buildings.length > 1 ? (
            <div class="sset-ctl"><Picker value={bldg} options={bldgOptions} onChange={setBldg} placeholder="All buildings" /></div>
          ) : null}
        </>
      ) : null}

      {shownPeople.length === 0 ? (
        <div class="sset-empty">
          {needle || bldg
            ? 'No one matches those filters.'
            : canManage ? 'No one here yet. Invite your first teammate.' : 'No teammates in your building yet.'}
        </div>
      ) : (
        <div class="sset-pgrid">
          {shownPeople.map((p) => (
            <PersonCard key={p.userId} person={p} canManage={canManage} isSelf={p.userId === selfId} onOpen={onOpenPerson} />
          ))}
        </div>
      )}

      {canManage && pending.length ? (
        <Section label="Invited">
          {pending.map((p) => (
            <PendingRow key={p.invitationId} pending={p} onOpen={onOpenPending} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

/** One name if they're in a few buildings, "First +N" when they span more. */
function buildingLabel(person) {
  const names = person.buildingNames || [];
  if (names.length === 0) {
    const n = (person.locationIds || []).length;
    return n === 0 ? 'No building' : `${n} buildings`;
  }
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

function DoctorsView({ subTabs, team, grantable, canManage, orgSlug, onAddDoctor, onChanged }) {
  const doctors = team?.doctors ?? [];
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? doctors.filter((d) => `${d.name || ''} ${d.title || ''}`.toLowerCase().includes(needle))
    : doctors;

  return (
    <div class="sset-body">
      {subTabs}
      <div class="sset-team-head">
        <div class="sset-team-head__count">{doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'}</div>
        {canManage ? (
          <button type="button" class="sset-btn sset-btn--primary" data-track="team_add_doctor_opened" onClick={onAddDoctor}>
            Add doctor
          </button>
        ) : null}
      </div>

      {doctors.length > 6 ? (
        <div class="sset-search">
          <input type="text" class="sset-input" value={q} onInput={(e) => setQ(e.target.value)} placeholder="Search doctors…" />
        </div>
      ) : null}

      {doctors.length === 0 ? (
        <div class="sset-empty">No doctors yet.{canManage ? ' Add one to text them a setup link.' : ''}</div>
      ) : shown.length === 0 ? (
        <div class="sset-empty">No doctors match that search.</div>
      ) : (
        shown.map((d) => (
          <DoctorRow key={d.practitionerId} doctor={d} grantable={grantable} canManage={canManage} orgSlug={orgSlug} onChanged={onChanged} />
        ))
      )}
    </div>
  );
}

function PersonCard({ person, canManage, isSelf, onOpen }) {
  const isAdmin = person.orgRole && person.orgRole !== 'user';
  const roleLabel = isAdmin ? SCOPE_LABELS[person.orgRole] : null;
  const clickable = canManage;
  const open = () => { if (clickable) onOpen(person.userId); };
  return (
    <button type="button" class="sset-pcard" data-track="team_person_opened" style={clickable ? undefined : 'cursor:default;'} onClick={open}>
      <div class="sset-pcard__name">
        {person.name || person.email}
        {isSelf ? <span class="sset-person__you"> · You</span> : null}
      </div>
      <div class="sset-pcard__meta">
        {roleLabel ? <span class="sset-badge sset-badge--admin">{roleLabel}</span> : null}
        {person.snfRole ? <span class="sset-badge">{prettyRole(person.snfRole)}</span> : null}
      </div>
      <div class="sset-pcard__bldg">{BUILDING}<span>{buildingLabel(person)}</span></div>
    </button>
  );
}

function PendingRow({ pending, onOpen }) {
  const open = () => onOpen(pending.invitationId);
  return (
    <div
      class="sset-person sset-person--nav is-pending"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
    >
      <div class="sset-person__main">
        <div class="sset-person__name">{pending.email}</div>
        <div class="sset-person__meta">
          <span class="sset-badge">{SCOPE_LABELS[pending.orgRole] || 'Staff'}</span>
          <span>{pending.hasTempPassword ? 'Temp password' : 'Email invite'}</span>
        </div>
      </div>
      <span class="sset-person__chev">{CHEVRON}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Person detail + editors                                             */
/* ------------------------------------------------------------------ */

function PersonDetailView({ person, grantable, orgSlug, isSelf, onBack, onChanged, onRemoved }) {
  const [orgRole, setOrgRole] = useState(person.orgRole); // optimistic — updates instantly
  const [savingRole, setSavingRole] = useState(false);
  const [confirmOrgAdmin, setConfirmOrgAdmin] = useState(false);
  const [roleErr, setRoleErr] = useState(null);
  const isOrgAdmin = orgRole === 'org_admin';

  const scopeOptions = SCOPE_ORDER
    .filter((s) => (grantable?.scopes ?? []).includes(s) || s === orgRole)
    .map((s) => ({ value: s, label: SCOPE_LABELS[s], desc: SCOPE_DESC[s] }));

  const applyRole = async (next) => {
    if (next === orgRole) return;
    // Granting org admin is high blast radius — confirm first.
    if (next === 'org_admin' && !confirmOrgAdmin) { setConfirmOrgAdmin(true); return; }
    const prev = orgRole;
    setOrgRole(next); // optimistic — no waiting/freezing
    setConfirmOrgAdmin(false);
    setSavingRole(true);
    setRoleErr(null);
    try {
      await updateTeamMemberRole(person.userId, { orgSlug, orgRole: next });
      track('team_member_role_changed', { source: 'settings', scope: next });
      onChanged();
    } catch (e) {
      setOrgRole(prev); // revert on failure
      setRoleErr(e.message || 'Could not change access level.');
    } finally {
      setSavingRole(false);
    }
  };

  const accessCtl = (
    <Ctl label="Access level">
      <Picker value={orgRole} options={scopeOptions} disabled={savingRole} onChange={applyRole} />
      {confirmOrgAdmin ? (
        <div class="sset-coverage" style="padding:10px 2px 0;">
          <strong>Make this person an org admin?</strong> Full access to every building, every
          feature, and all patient data in this organization.
          <div class="sset-person__confirm" style="margin-top:8px;">
            {/* NO_TRACK — role change tracked on success in applyRole() */}
            <button type="button" class="sset-btn sset-btn--primary" onClick={() => applyRole('org_admin')}>
              Make org admin
            </button>
            <button type="button" class="sset-btn sset-btn--ghost" data-track="team_orgadmin_cancelled" onClick={() => setConfirmOrgAdmin(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {roleErr ? <div class="sset-status is-err" style="padding:6px 2px 0;">{roleErr}</div> : null}
    </Ctl>
  );
  const danger = (
    <Section label="Danger zone">
      <RemoveRow person={person} orgSlug={orgSlug} onRemoved={onRemoved} />
    </Section>
  );

  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_detail_back" onClick={onBack}>← Back to team</button>
      <div class="sset-detail-head">
        <div class="sset-detail-head__name">{person.name || person.email}</div>
        <div class="sset-detail-head__sub">{person.email}</div>
      </div>

      {isSelf ? (
        <div class="sset-coverage">This is you — ask another admin to change your access.</div>
      ) : isOrgAdmin ? (
        <div class="sset-form">
          {accessCtl}
          <div class="sset-fullaccess">
            <span class="sset-badge sset-badge--admin">Org admin</span>
            <span><strong>Full access</strong> — every building and feature.</span>
          </div>
          {danger}
        </div>
      ) : (
        <>
          <div class="sset-cols">
            <div class="sset-col">
              {accessCtl}
              <PersonFeatures person={person} grantable={grantable} orgSlug={orgSlug} onChanged={onChanged} />
            </div>
            <PersonBuildings person={person} grantable={grantable} orgSlug={orgSlug} onChanged={onChanged} />
          </div>
          {danger}
        </>
      )}
    </div>
  );
}

/**
 * Right column of the person detail: their buildings as an instant-save checklist
 * (toggle = save, optimistic). Region-derived buildings are shown read-only.
 */
function PersonBuildings({ person, grantable, orgSlug, onChanged }) {
  const allBuildings = grantable?.buildings ?? [];
  const viaRegion = useMemo(() => new Set(person.viaRegionLocationIds ?? []), [person]);
  const nameById = useMemo(() => new Map(allBuildings.map((b) => [b.id, b.name])), [allBuildings]);
  const viaRegionNames = useMemo(() => [...viaRegion].map((id) => nameById.get(id)).filter(Boolean), [viaRegion, nameById]);

  const [ids, setIds] = useState(() => new Set((person.locationIds ?? []).filter((id) => !viaRegion.has(id))));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState('');

  const needle = filter.trim().toLowerCase();
  const shown = needle ? allBuildings.filter((b) => b.name.toLowerCase().includes(needle)) : allBuildings;

  const toggle = async (id) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id); else next.add(id);
    setIds(next); // optimistic
    setBusy(true);
    setStatus(null);
    try {
      await updateTeamMemberLocations(person.userId, { orgSlug, locationIds: [...next] });
      track('team_member_buildings_saved', { source: 'settings' });
      if (onChanged) onChanged();
    } catch (e) {
      setIds((prev) => { const r = new Set(prev); if (r.has(id)) r.delete(id); else r.add(id); return r; }); // revert
      setStatus({ kind: 'err', text: e.message || 'Could not update buildings.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="sset-col">
      <Section label="Buildings" hint={`${ids.size} selected`}>
        {allBuildings.length === 0 ? (
          <div class="sset-coverage">No buildings available to assign.</div>
        ) : (
          <>
            {allBuildings.length > 8 ? (
              <div style="padding:10px 12px 2px;">
                <input type="text" class="sset-input" value={filter} onInput={(e) => setFilter(e.target.value)} placeholder="Search buildings…" />
              </div>
            ) : null}
            <div class="sset-bldg-list">
              {shown.length === 0 ? (
                <div class="sset-coverage">No buildings match.</div>
              ) : shown.map((b) => (
                // NO_TRACK — building toggle tracked on success in toggle()
                <button key={b.id} type="button" class={`sset-report${ids.has(b.id) ? ' is-on' : ''}`} disabled={busy} onClick={() => toggle(b.id)} aria-pressed={ids.has(b.id) ? 'true' : 'false'}>
                  <span class="sset-check">{CHECK}</span>
                  <span class="sset-report__text"><span class="sset-report__title">{b.name}</span></span>
                </button>
              ))}
            </div>
          </>
        )}
      </Section>
      {viaRegionNames.length ? (
        <Section label="From a region" sub="Managed by region membership — change on the Regions tab.">
          {viaRegionNames.map((name) => (
            <div key={name} class="sset-report" style="cursor:default;">
              <span class="sset-report__text"><span class="sset-report__title">{name}</span></span>
            </div>
          ))}
        </Section>
      ) : null}
      {status ? <div class="sset-status is-err" style="padding:6px 2px;">{status.text}</div> : null}
    </div>
  );
}

function RemoveRow({ person, orgSlug, onRemoved }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await removeTeamMember(orgSlug, person.userId);
      track('team_member_removed', { source: 'settings' });
      onRemoved();
    } catch (e) {
      setErr(e.message || 'Could not remove this person.');
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div class="sset-removerow">
      {err ? <div class="sset-person__err">{err}</div> : null}
      {confirming ? (
        <div class="sset-person__confirm">
          {/* NO_TRACK — removal is tracked on success in the handler */}
          <button type="button" class="sset-btn sset-btn--danger" disabled={busy} onClick={remove}>
            {busy ? 'Removing…' : 'Remove from team'}
          </button>
          <button type="button" class="sset-btn sset-btn--ghost" data-track="team_remove_cancelled" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" class="sset-btn sset-btn--danger sset-btn--block" data-track="team_remove_opened" onClick={() => setConfirming(true)}>
          Remove from team
        </button>
      )}
    </div>
  );
}

/**
 * Inline features for the person detail: read = chips of what they hold (or "Full
 * access"); Edit expands in place to a job-title picker + bundle editor where each
 * bundle opens to its sub-features. No separate screen. Mirrors the web.
 */
function PersonFeatures({ person, grantable, orgSlug, onChanged }) {
  const grantableModules = grantable?.modules ?? {};
  const moduleLabels = grantable?.moduleLabels ?? {};
  const roles = grantable?.roles ?? [];
  const bundles = useMemo(() => grantableBundles(grantable?.bundles, grantableModules), [grantable]);

  const [snfRole, setSnfRole] = useState(person.snfRole ?? roles[0]?.key ?? 'mds_coordinator');
  const [modules, setModules] = useState(null); // null = loading
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await getTeamMemberPermissions(person.userId, orgSlug);
        if (cancelled) return;
        setSnfRole(cur.snfRole ?? person.snfRole ?? roles[0]?.key ?? 'mds_coordinator');
        // null modules = grandfathered full access → show everything on (mirrors the web).
        setModules(cur.modules ? clampModules(cur.modules, grantableModules) : allGrantableOn(grantableModules));
      } catch {
        if (!cancelled) setModules(allGrantableOn(grantableModules));
      }
    })();
    return () => { cancelled = true; };
  }, [person.userId, orgSlug]);

  const startEdit = () => { setDraft(modules); setExpanded(new Set()); setStatus(null); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(null); setExpanded(new Set()); setStatus(null); };
  const pickRole = (key) => { setSnfRole(key); setDraft(seedFromRole(roles.find((r) => r.key === key)?.modules, grantableModules)); };
  const setFeatures = (keys, on) => setDraft((d) => { const n = { ...d }; for (const k of keys) n[k] = on && !!grantableModules[k]; return n; });
  const toggleExpand = (key) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateTeamMemberPermissions(person.userId, { orgSlug, snfRole, modules: draft });
      track('team_member_features_saved', { source: 'settings' });
      setModules(draft);
      setEditing(false);
      setExpanded(new Set());
      if (onChanged) onChanged();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not save features.' });
    } finally {
      setSaving(false);
    }
  };

  if (modules === null) {
    return <div class="sset-ctl"><span class="sset-ctl__label">Features</span><div class="sset-coverage" style="padding:8px 2px;">Loading…</div></div>;
  }

  // Read view — chips.
  if (!editing) {
    const held = bundles.filter((b) => b.modules.some((m) => modules[m]));
    return (
      <div class="sset-ctl">
        <div class="sset-ctl__label-row">
          <span class="sset-ctl__label" style="margin:0;">Features</span>
          {/* NO_TRACK — opens the inline editor; the save is the tracked event */}
          <button type="button" class="sset-editlink" onClick={startEdit}>Edit</button>
        </div>
        {isAllOn(modules, grantableModules) ? (
          <div class="sset-featurechips"><span class="sset-badge sset-badge--admin">Full access</span></div>
        ) : held.length === 0 ? (
          <div class="sset-coverage" style="padding:6px 2px;">No features — click Edit to grant some.</div>
        ) : (
          <div class="sset-featurechips">
            {held.map((b) => (
              <span key={b.key} class="sset-badge">{b.label}{bundleFullyOn(modules, b) ? '' : ' · some'}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Edit view — job title + expandable bundle / sub-feature editor.
  const draftAllOn = isAllOn(draft, grantableModules);
  const onCount = bundles.filter((b) => bundleFullyOn(draft, b)).length;
  return (
    <div class="sset-ctl">
      <Ctl label="Job title" sub="A starting point — flip individual features below.">
        <Picker value={snfRole} options={roles.map((r) => ({ value: r.key, label: r.label }))} onChange={pickRole} />
      </Ctl>
      <Section label="Features" hint={draftAllOn ? 'Full access' : `${onCount} on`}>
        {bundles.map((b) => {
          const feats = b.modules.filter((m) => grantableModules[m]);
          const onN = feats.filter((m) => draft[m]).length;
          const fully = feats.length > 0 && onN === feats.length;
          const isOpen = expanded.has(b.key);
          return (
            <div key={b.key}>
              <div class="sset-bundle">
                {/* NO_TRACK — feature toggle is persisted on Save */}
                <button type="button" class={`sset-report${fully ? ' is-on' : ''}`} onClick={() => setFeatures(feats, !fully)}>
                  <span class="sset-check">{CHECK}</span>
                  <span class="sset-report__text">
                    <span class="sset-report__title">{b.label}</span>
                    <span class="sset-report__desc">{onN}/{feats.length} on</span>
                  </span>
                </button>
                <button type="button" class="sset-bundle-exp" data-track="team_bundle_expanded" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => toggleExpand(b.key)}>
                  {isOpen ? CHEVRON_DOWN : CHEVRON}
                </button>
              </div>
              {isOpen ? (
                <div class="sset-subfeatures">
                  {feats.map((m) => (
                    // NO_TRACK — sub-feature toggle is persisted on Save
                    <button type="button" key={m} class={`sset-report${draft[m] ? ' is-on' : ''}`} onClick={() => setFeatures([m], !draft[m])}>
                      <span class="sset-check">{CHECK}</span>
                      <span class="sset-report__text"><span class="sset-report__title">{moduleLabels[m] || m}</span></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </Section>
      {status ? <div class="sset-status is-err" style="padding:0 2px 8px;">{status.text}</div> : null}
      <div class="sset-person__confirm" style="padding:0 2px;">
        {/* NO_TRACK — features-saved is tracked in save() */}
        <button type="button" class="sset-btn sset-btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" class="sset-btn sset-btn--ghost" data-track="team_features_cancelled" disabled={saving} onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pending invite detail                                               */
/* ------------------------------------------------------------------ */

function PendingDetailView({ pending, orgSlug, webBaseUrl, onBack, onChanged, onDeleted }) {
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState(null);

  const link = webBaseUrl ? `${webBaseUrl}/signup?token=${pending.token}` : '';

  const copy = async () => {
    if (!link) { setStatus({ kind: 'err', text: 'Invite link unavailable.' }); return; }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus({ kind: 'err', text: link });
    }
  };

  const savePw = async () => {
    if (pw.length < 8) { setStatus({ kind: 'err', text: 'Password must be at least 8 characters.' }); return; }
    setSavingPw(true);
    setStatus(null);
    try {
      await resetInvitationPassword(pending.invitationId, { orgSlug, password: pw });
      track('team_invite_password_reset', { source: 'settings' });
      setResetting(false);
      setPw('');
      setStatus({ kind: 'ok', text: `New temporary password set. Share it with ${pending.email}.` });
      await onChanged();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not update the password.' });
    } finally {
      setSavingPw(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    setStatus(null);
    try {
      await deleteInvitation(orgSlug, pending.invitationId);
      track('team_invite_deleted', { source: 'settings' });
      onDeleted();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not delete the invitation.' });
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_detail_back" onClick={onBack}>← Back to team</button>
      <div class="sset-detail-head">
        <div class="sset-detail-head__name">{pending.email}</div>
        <div class="sset-detail-head__badges">
          <span class="sset-badge sset-badge--admin">{SCOPE_LABELS[pending.orgRole] || 'Staff'}</span>
          <span class="sset-badge">{pending.hasTempPassword ? 'Temp password' : 'Email link'}</span>
        </div>
      </div>

      {status ? <div class={`sset-status is-${status.kind}`} style="padding:0 2px 10px;">{status.text}</div> : null}

      <Section label="Invitation">
        {pending.hasTempPassword ? (
          resetting ? (
            <div style="padding:12px 14px;">
              <input type="text" class="sset-input" value={pw} onInput={(e) => setPw(e.target.value)} placeholder="New temp password (min 8 characters)" />
              <div class="sset-person__confirm" style="margin-top:8px;">
                {/* NO_TRACK — password-reset event fired in savePw() on success */}
                <button type="button" class="sset-btn sset-btn--primary" disabled={savingPw} onClick={savePw}>
                  {savingPw ? 'Saving…' : 'Set password'}
                </button>
                <button type="button" class="sset-btn sset-btn--ghost" data-track="team_reset_pw_cancelled" disabled={savingPw} onClick={() => { setResetting(false); setPw(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <NavRow label="Set a new temp password" onClick={() => setResetting(true)} />
          )
        ) : (
          <button type="button" class="sset-navrow" data-track="team_invite_link_copied" onClick={copy}>
            <span class="sset-navrow__label">{copied ? 'Invite link copied ✓' : 'Copy invite link'}</span>
          </button>
        )}
      </Section>

      <Section label="Danger zone">
        {confirmDel ? (
          <div class="sset-person__confirm" style="padding:12px 14px;">
            {/* NO_TRACK — invite-deleted event fired in del() on success */}
            <button type="button" class="sset-btn sset-btn--danger" disabled={deleting} onClick={del}>
              {deleting ? 'Deleting…' : 'Delete invitation'}
            </button>
            <button type="button" class="sset-btn sset-btn--ghost" data-track="team_delete_cancelled" disabled={deleting} onClick={() => setConfirmDel(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" class="sset-btn sset-btn--danger sset-btn--block" style="margin:12px 14px;" data-track="team_delete_opened" onClick={() => setConfirmDel(true)}>
            Delete invitation
          </button>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite                                                              */
/* ------------------------------------------------------------------ */

function InviteView({ grantable, facilityName, orgSlug, onCancel, onInvited }) {
  const scopes = grantable?.scopes?.length ? grantable.scopes : ['user'];
  const roles = grantable?.roles ?? [];
  const grantableModules = grantable?.modules ?? {};
  const bundles = useMemo(() => grantableBundles(grantable?.bundles, grantableModules), [grantable]);
  const allBuildings = grantable?.buildings ?? [];

  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('email'); // 'email' | 'temp'
  const [tempPassword, setTempPassword] = useState('');
  const [scope, setScope] = useState(scopes.includes('user') ? 'user' : scopes[0]);
  const [snfRole, setSnfRole] = useState(roles[0]?.key ?? 'mds_coordinator');
  const [modules, setModules] = useState(() =>
    seedFromRole(roles.find((r) => r.key === (roles[0]?.key))?.modules, grantableModules),
  );
  const [buildingIds, setBuildingIds] = useState(() => {
    const match = allBuildings.find((b) => facilityName && b.name?.toLowerCase() === facilityName.toLowerCase());
    return new Set(match ? [match.id] : []);
  });

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bldgFilter, setBldgFilter] = useState('');

  const isOrgAdmin = scope === 'org_admin';
  const isTemp = method === 'temp';

  const pickRole = (key) => {
    setSnfRole(key);
    const role = roles.find((r) => r.key === key);
    setModules(seedFromRole(role?.modules, grantableModules));
  };
  const toggleBundle = (bundle) => setModules((m) => applyBundle(m, bundle, !bundleFullyOn(m, bundle), grantableModules));
  const toggleBuilding = (id) => setBuildingIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const bNeedle = bldgFilter.trim().toLowerCase();
  const shownBuildings = bNeedle ? allBuildings.filter((b) => b.name.toLowerCase().includes(bNeedle)) : allBuildings;
  const onCount = bundles.filter((b) => bundleFullyOn(modules, b)).length;
  const scopeOptions = scopes.map((s) => ({ value: s, label: SCOPE_LABELS[s] || s, desc: SCOPE_DESC[s] }));
  const roleOptions = roles.map((r) => ({ value: r.key, label: r.label }));

  const submit = async () => {
    if (!email.trim()) { setStatus({ kind: 'err', text: 'Enter an email address.' }); return; }
    if (isTemp && tempPassword.length < 8) { setStatus({ kind: 'err', text: 'Temp password must be at least 8 characters.' }); return; }
    if (buildingIds.size === 0) { setStatus({ kind: 'err', text: 'Pick at least one building.' }); return; }
    setSubmitting(true);
    setStatus(null);
    try {
      await inviteTeamMember({
        orgSlug,
        email: email.trim(),
        role: scope,
        snfRole: isOrgAdmin ? undefined : snfRole,
        modules: isOrgAdmin ? undefined : modules,
        locationIds: Array.from(buildingIds),
        tempPassword: isTemp ? tempPassword : undefined,
      });
      track('team_member_invited', { source: 'settings', scope, method });
      onInvited();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not send the invitation.' });
      setSubmitting(false);
    }
  };

  const disabled = submitting || !email.trim() || buildingIds.size === 0 || (isTemp && tempPassword.length < 8);

  return (
    <>
      <div class="sset-body">
        <div class="sset-form">
        <button type="button" class="sset-back" data-track="team_invite_cancelled" onClick={onCancel}>← Back to team</button>

        <Ctl label="Who">
          <input type="email" class="sset-input" value={email} onInput={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Ctl>

        <Ctl label="Access level">
          <Picker value={scope} options={scopeOptions} onChange={setScope} />
        </Ctl>

        {isOrgAdmin ? (
          <div class="sset-fullaccess">
            <span class="sset-badge sset-badge--admin">Org admin</span>
            <span><strong>Full access</strong> to every feature and the whole organization.</span>
          </div>
        ) : (
          <>
            <Ctl label="Job title" sub="Sets which features they start with.">
              <Picker value={snfRole} options={roleOptions} onChange={pickRole} />
            </Ctl>

            {/* Features live behind Advanced — the job title already picked a sensible default. */}
            <button type="button" class={`sset-adv${showAdvanced ? ' is-open' : ''}`} data-track="team_invite_advanced_toggled" onClick={() => setShowAdvanced((v) => !v)}>
              <span>Advanced — customize features ({onCount} on)</span>
              {CHEVRON_DOWN}
            </button>
            {showAdvanced ? (
              <Section label="Features">
                {bundles.map((b) => (
                  <button key={b.key} type="button" data-track="team_feature_toggled" class={`sset-report${bundleFullyOn(modules, b) ? ' is-on' : ''}`} onClick={() => toggleBundle(b)} aria-pressed={bundleFullyOn(modules, b) ? 'true' : 'false'}>
                    <span class="sset-check">{CHECK}</span>
                    <span class="sset-report__text">
                      <span class="sset-report__title">{b.label}</span>
                      <span class="sset-report__desc">{b.description}</span>
                    </span>
                  </button>
                ))}
              </Section>
            ) : null}
          </>
        )}

        <Section label="Buildings" hint={`${buildingIds.size} selected`}>
          {allBuildings.length === 0 ? (
            <div class="sset-coverage">No buildings available to assign.</div>
          ) : (
            <>
              {allBuildings.length > 8 ? (
                <div style="padding:10px 12px 2px;">
                  <input type="text" class="sset-input" value={bldgFilter} onInput={(e) => setBldgFilter(e.target.value)} placeholder="Search buildings…" />
                </div>
              ) : null}
              <div class="sset-bldg-list">
                {shownBuildings.length === 0 ? (
                  <div class="sset-coverage">No buildings match.</div>
                ) : shownBuildings.map((b) => (
                  <button key={b.id} type="button" data-track="team_building_toggled" class={`sset-report${buildingIds.has(b.id) ? ' is-on' : ''}`} onClick={() => toggleBuilding(b.id)} aria-pressed={buildingIds.has(b.id) ? 'true' : 'false'}>
                    <span class="sset-check">{CHECK}</span>
                    <span class="sset-report__text"><span class="sset-report__title">{b.name}</span></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Section>

        <Ctl label="How they sign in">
          <div class="sset-seg">
            <button type="button" data-track="team_invite_method_email" class={`sset-seg__opt${method === 'email' ? ' is-active' : ''}`} onClick={() => setMethod('email')}>
              Email link<small>They set their own password</small>
            </button>
            <button type="button" data-track="team_invite_method_temp" class={`sset-seg__opt${method === 'temp' ? ' is-active' : ''}`} onClick={() => setMethod('temp')}>
              Temp password<small>You set it and share it</small>
            </button>
          </div>
          {isTemp ? (
            <input type="text" class="sset-input" style="margin-top:8px;" value={tempPassword} onInput={(e) => setTempPassword(e.target.value)} placeholder="Temporary password (min 8 characters)" />
          ) : null}
        </Ctl>
        </div>
      </div>

      <div class="sset-savebar">
        <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">{status?.text || ''}</div>
        {/* NO_TRACK — invite is tracked on success (team_member_invited) in submit() */}
        <button type="button" class="sset-btn sset-btn--primary" onClick={submit} disabled={disabled}>
          {submitting ? (isTemp ? 'Creating…' : 'Sending…') : (isTemp ? 'Create account' : 'Send invitation')}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Add doctor                                                          */
/* ------------------------------------------------------------------ */

const DOCTOR_TITLES = ['MD', 'DO', 'NP', 'PA'];

function AddDoctorView({ grantable, facilityName, orgSlug, onCancel, onAdded }) {
  const allBuildings = grantable?.buildings ?? [];
  const defaultBuildingId = () => {
    const match = allBuildings.find((b) => facilityName && b.name?.toLowerCase() === facilityName.toLowerCase());
    return match?.id ?? allBuildings[0]?.id ?? '';
  };

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('MD');
  const [locationId, setLocationId] = useState(defaultBuildingId);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) { setStatus({ kind: 'err', text: 'First and last name are required.' }); return; }
    if (!phone.trim()) { setStatus({ kind: 'err', text: 'A cell phone is required to send their setup link.' }); return; }
    if (!locationId) { setStatus({ kind: 'err', text: 'Pick a building.' }); return; }
    setSubmitting(true);
    setStatus(null);
    try {
      await addTeamDoctor({
        orgSlug,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone.trim(),
        title: title.trim() || undefined,
        locationId,
      });
      track('team_doctor_added', { source: 'settings' });
      onAdded();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not add the doctor.' });
      setSubmitting(false);
    }
  };

  const titleOptions = DOCTOR_TITLES.map((t) => ({ value: t, label: t }));
  const buildingOptions = allBuildings.map((b) => ({ value: b.id, label: b.name }));

  return (
    <>
      <div class="sset-body">
        <div class="sset-form">
        <button type="button" class="sset-back" data-track="team_add_doctor_cancelled" onClick={onCancel}>← Back to team</button>

        <div class="sset-coverage" style="padding:0 2px 14px;">
          Add a physician to a building. They'll appear under <strong>Doctors</strong> below — then
          tap <strong>Send link</strong> to text them a setup link so they can e-sign certifications.
        </div>

        <Ctl label="Name">
          <div class="sset-doc-names">
            <input type="text" class="sset-input" value={firstName} onInput={(e) => setFirstName(e.target.value)} placeholder="First name" />
            <input type="text" class="sset-input" value={lastName} onInput={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
        </Ctl>

        <Ctl label="Cell phone" sub="Where we text their setup link.">
          <input type="tel" class="sset-input" value={phone} onInput={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </Ctl>

        <Ctl label="Title">
          <Picker value={title} options={titleOptions} onChange={setTitle} />
        </Ctl>

        <Ctl label="Building">
          {allBuildings.length === 0 ? (
            <div class="sset-coverage">No buildings available to assign.</div>
          ) : (
            <Picker value={locationId} options={buildingOptions} onChange={setLocationId} placeholder="Pick a building" />
          )}
        </Ctl>
        </div>
      </div>

      <div class="sset-savebar">
        <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">{status?.text || ''}</div>
        {/* NO_TRACK — doctor add is tracked on success (team_doctor_added) in submit() */}
        <button type="button" class="sset-btn sset-btn--primary" onClick={submit} disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim() || !locationId}>
          {submitting ? 'Adding…' : 'Add doctor'}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Doctor row (roster)                                                 */
/* ------------------------------------------------------------------ */

function DoctorRow({ doctor, grantable, canManage, orgSlug, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const grantableIds = new Set((grantable?.buildings ?? []).map((b) => b.id));
  const locationIds = doctor.locationIds || [];
  const sendLocationId = locationIds.find((id) => grantableIds.has(id)) ?? locationIds[0];
  const key = doctor.status?.key;
  const alreadySent = !!key && key !== 'not_sent' && key !== 'not_started';

  const send = async () => {
    if (!sendLocationId) { setMsg('No building in your scope for this doctor.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      await sendTeamDoctorLink({ orgSlug, practitionerId: doctor.practitionerId, locationId: sendLocationId });
      track('team_doctor_link_sent', { source: 'settings' });
      onChanged();
    } catch (e) {
      setMsg(e.message || 'Could not send the link.');
      setBusy(false);
    }
  };

  return (
    <div class="sset-person">
      <div class="sset-person__main">
        <div class="sset-person__name">{doctor.name}{doctor.title ? `, ${doctor.title}` : ''}</div>
        <div class="sset-person__meta">
          <span class={docBadgeClass(key)}>{doctor.status?.label || 'Not sent'}</span>
          {doctor.status?.stalled ? <span class="sset-person__bldgs">needs a nudge</span> : null}
        </div>
        {msg ? <div class="sset-person__err">{msg}</div> : null}
      </div>
      {canManage ? (
        // NO_TRACK — doctor link send is tracked on success in send()
        <button type="button" class="sset-doc-send" disabled={busy} onClick={send}>
          {busy ? 'Sending…' : alreadySent ? 'Resend' : 'Send link'}
        </button>
      ) : null}
    </div>
  );
}

function docBadgeClass(key) {
  if (key === 'signed' || key === 'enrolled') return 'sset-badge sset-badge--ok';
  if (key === 'forward_sent' || key === 'clicked') return 'sset-badge sset-badge--info';
  return 'sset-badge';
}

/* ------------------------------------------------------------------ */
/* Regions (org admin only)                                            */
/* ------------------------------------------------------------------ */

/**
 * List + create regions, then drill into one. A region groups buildings; its
 * members become region admins over every building in it. Org-admin only (the
 * backend re-enforces). Mirrors the web RegionsView.
 */
function RegionsView({ subTabs, orgSlug, grantable, team, onChanged }) {
  const [regions, setRegions] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [status, setStatus] = useState(null);

  const loadRegions = useCallback(async () => {
    try {
      const res = await getTeamRegions(orgSlug);
      setRegions(res.regions ?? []);
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load regions.');
    }
  }, [orgSlug]);

  useEffect(() => { loadRegions(); }, [loadRegions]);

  if (selectedId) {
    return (
      <RegionDetailView
        regionId={selectedId}
        orgSlug={orgSlug}
        grantable={grantable}
        team={team}
        onChanged={onChanged}
        onBack={() => { setSelectedId(null); loadRegions(); if (onChanged) onChanged(); }}
        onDeleted={() => { setSelectedId(null); loadRegions(); if (onChanged) onChanged(); }}
      />
    );
  }

  const createRegion = async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingNew(true);
    setStatus(null);
    try {
      const res = await createTeamRegion({ orgSlug, name });
      track('team_region_created', { source: 'settings' });
      setNewName('');
      setCreating(false);
      await loadRegions();
      if (res?.region?.id) setSelectedId(res.region.id); // jump in to add buildings/people
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not create the region.' });
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div class="sset-body">
      {subTabs}

      <Section label="Regions" sub="A region groups buildings. Add someone to a region and they manage every building in it.">
        {creating ? (
          <div class="sset-region-create">
            <input class="sset-input" type="text" placeholder="Region name (e.g. North)" value={newName} onInput={(e) => setNewName(e.target.value)} autofocus />
            <div class="sset-person__confirm" style="margin-top:8px;">
              {/* NO_TRACK — team_region_created fired in createRegion() on success */}
              <button type="button" class="sset-btn sset-btn--primary" disabled={savingNew || !newName.trim()} onClick={createRegion}>
                {savingNew ? 'Creating…' : 'Create region'}
              </button>
              <button type="button" class="sset-btn sset-btn--ghost" data-track="team_region_create_cancelled" disabled={savingNew} onClick={() => { setCreating(false); setNewName(''); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="sset-btn sset-btn--ghost sset-adddoc" data-track="team_region_create_opened" onClick={() => setCreating(true)}>
            + New region
          </button>
        )}
        {status ? <div class="sset-status is-err" style="padding:6px 2px 0;">{status.text}</div> : null}
      </Section>

      {regions === null ? (
        <div class="sset-loading"><div class="sset-spinner" /><span>Loading regions…</span></div>
      ) : error ? (
        <div class="sset-empty">{error}</div>
      ) : regions.length === 0 ? (
        <div class="sset-empty">No regions yet. Create one to group buildings.</div>
      ) : (
        regions.map((r) => (
          <NavRow
            key={r.id}
            label={r.name}
            value={`${r.buildingCount} ${r.buildingCount === 1 ? 'building' : 'buildings'} · ${r.memberCount} ${r.memberCount === 1 ? 'person' : 'people'}`}
            onClick={() => setSelectedId(r.id)}
          />
        ))
      )}
    </div>
  );
}

/**
 * One region: rename, add/remove buildings, add/remove members (region admins),
 * delete. Buildings come from grantable (all org buildings for an org admin);
 * member candidates come from the roster (people + pending invites).
 */
function RegionDetailView({ regionId, orgSlug, grantable, team, onBack, onDeleted }) {
  const [detail, setDetail] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState(false); // a building/member mutation is in flight
  const [status, setStatus] = useState(null);
  const [addingBldg, setAddingBldg] = useState(false);
  const [pickedBldgs, setPickedBldgs] = useState(new Set());
  const [addingMember, setAddingMember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const res = await getTeamRegion(orgSlug, regionId);
      setDetail(res.detail);
      setName(res.detail?.name ?? '');
      setError(null);
    } catch (e) {
      setError(e.message || 'Could not load this region.');
    }
  }, [orgSlug, regionId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const allBuildings = grantable?.buildings ?? [];
  const currentBldgIds = useMemo(() => new Set((detail?.buildings ?? []).map((b) => b.id)), [detail]);
  const candidateBldgs = useMemo(() => allBuildings.filter((b) => !currentBldgIds.has(b.id)), [allBuildings, currentBldgIds]);

  const memberUserIds = useMemo(() => new Set((detail?.members ?? []).filter((m) => m.kind !== 'pending').map((m) => m.userId)), [detail]);
  const memberInviteIds = useMemo(() => new Set((detail?.members ?? []).filter((m) => m.kind === 'pending').map((m) => m.userId)), [detail]);
  const candidatePeople = (team?.people ?? []).filter((p) => !memberUserIds.has(p.userId));
  const candidatePending = (team?.pendingPeople ?? []).filter((p) => !memberInviteIds.has(p.invitationId));

  const saveName = async () => {
    const n = name.trim();
    if (!n || n === detail?.name) return;
    setSavingName(true);
    setStatus(null);
    try {
      await renameTeamRegion(regionId, { orgSlug, name: n });
      track('team_region_renamed', { source: 'settings' });
      await loadDetail();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not rename the region.' });
    } finally {
      setSavingName(false);
    }
  };

  const toggleBldg = (id) => setPickedBldgs((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const addBuildings = async () => {
    if (pickedBldgs.size === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      await addRegionBuildings(regionId, { orgSlug, locationIds: [...pickedBldgs] });
      track('team_region_buildings_added', { source: 'settings' });
      setPickedBldgs(new Set());
      setAddingBldg(false);
      await loadDetail();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not add those buildings.' });
    } finally {
      setBusy(false);
    }
  };

  const removeBuilding = async (locationId) => {
    setBusy(true);
    setStatus(null);
    try {
      await removeRegionBuildings(regionId, { orgSlug, locationIds: [locationId] });
      track('team_region_building_removed', { source: 'settings' });
      await loadDetail();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not remove that building.' });
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (body) => {
    setBusy(true);
    setStatus(null);
    try {
      await addRegionMember(regionId, { orgSlug, ...body });
      track('team_region_member_added', { source: 'settings' });
      await loadDetail();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not add that person.' });
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (m) => {
    setBusy(true);
    setStatus(null);
    try {
      const body = m.kind === 'pending' ? { invitationId: m.userId } : { userId: m.userId };
      await removeRegionMember(regionId, { orgSlug, ...body });
      track('team_region_member_removed', { source: 'settings' });
      await loadDetail();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not remove that person.' });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setStatus(null);
    try {
      await deleteTeamRegion(orgSlug, regionId);
      track('team_region_deleted', { source: 'settings' });
      onDeleted();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not delete the region.' });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (detail === null) {
    return (
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_region_back" onClick={onBack}>← Regions</button>
        {error ? <div class="sset-empty">{error}</div> : <div class="sset-loading"><div class="sset-spinner" /><span>Loading region…</span></div>}
      </div>
    );
  }

  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_region_back" onClick={onBack}>← Regions</button>

      <Section label="Region name">
        <div class="sset-region-name">
          <input class="sset-input" type="text" value={name} onInput={(e) => setName(e.target.value)} />
          {/* NO_TRACK — team_region_renamed fired in saveName() on success */}
          <button type="button" class="sset-btn sset-btn--ghost" disabled={savingName || !name.trim() || name.trim() === detail.name} onClick={saveName}>
            {savingName ? 'Saving…' : 'Rename'}
          </button>
        </div>
      </Section>

      <Section label="Buildings" sub="Everyone in this region gets access to every building here." hint={`${detail.buildings.length}`}>
        {detail.buildings.length === 0 ? <div class="sset-empty">No buildings yet.</div> : (
          detail.buildings.map((b) => (
            <div key={b.id} class="sset-person">
              <span class="sset-person__main"><span class="sset-person__name">{b.name}</span></span>
              {/* NO_TRACK — team_region_building_removed fired in removeBuilding() */}
              <button type="button" class="sset-btn sset-btn--ghost" style="flex:0 0 auto;" disabled={busy} onClick={() => removeBuilding(b.id)}>Remove</button>
            </div>
          ))
        )}
        {addingBldg ? (
          <div class="sset-region-picker">
            {candidateBldgs.length === 0 ? <div class="sset-empty">No more buildings to add.</div> : (
              <div class="sset-bldg-list">
                {candidateBldgs.map((b) => (
                  <button key={b.id} type="button" class={`sset-report${pickedBldgs.has(b.id) ? ' is-on' : ''}`} data-track="team_region_bldg_toggled" onClick={() => toggleBldg(b.id)} aria-pressed={pickedBldgs.has(b.id) ? 'true' : 'false'}>
                    <span class="sset-check">{CHECK}</span>
                    <span class="sset-report__text"><span class="sset-report__title">{b.name}</span></span>
                  </button>
                ))}
              </div>
            )}
            <div class="sset-person__confirm" style="margin-top:8px;">
              {/* NO_TRACK — team_region_buildings_added fired in addBuildings() on success */}
              <button type="button" class="sset-btn sset-btn--primary" disabled={busy || pickedBldgs.size === 0} onClick={addBuildings}>
                {busy ? 'Adding…' : pickedBldgs.size ? `Add ${pickedBldgs.size}` : 'Add'}
              </button>
              <button type="button" class="sset-btn sset-btn--ghost" data-track="team_region_add_bldg_cancelled" disabled={busy} onClick={() => { setAddingBldg(false); setPickedBldgs(new Set()); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          candidateBldgs.length ? (
            <button type="button" class="sset-btn sset-btn--ghost sset-adddoc" data-track="team_region_add_bldg_opened" onClick={() => setAddingBldg(true)}>
              + Add buildings
            </button>
          ) : null
        )}
      </Section>

      <Section label="People" sub="Region admins — they manage every building above." hint={`${detail.members.length}`}>
        {detail.members.length === 0 ? <div class="sset-empty">No one yet.</div> : (
          detail.members.map((m) => (
            <div key={(m.kind === 'pending' ? 'i' : 'u') + m.userId} class={`sset-person${m.kind === 'pending' ? ' is-pending' : ''}`}>
              <span class="sset-person__main">
                <span class="sset-person__name">{m.name || m.email}</span>
                <span class="sset-person__meta">{m.kind === 'pending' ? 'Pending invite' : m.email}</span>
              </span>
              {/* NO_TRACK — team_region_member_removed fired in removeMember() */}
              <button type="button" class="sset-btn sset-btn--ghost" style="flex:0 0 auto;" disabled={busy} onClick={() => removeMember(m)}>Remove</button>
            </div>
          ))
        )}
        {addingMember ? (
          <div class="sset-region-picker">
            {candidatePeople.length === 0 && candidatePending.length === 0 ? (
              <div class="sset-empty">Everyone's already in this region.</div>
            ) : (
              <div class="sset-bldg-list">
                {candidatePeople.map((p) => (
                  // NO_TRACK — team_region_member_added fired in addMember() on success
                  <button key={`u${p.userId}`} type="button" class="sset-report" disabled={busy} onClick={() => addMember({ userId: p.userId })}>
                    <span class="sset-report__text"><span class="sset-report__title">{p.name || p.email}</span><span class="sset-report__desc">{p.email}</span></span>
                  </button>
                ))}
                {candidatePending.map((p) => (
                  // NO_TRACK — team_region_member_added fired in addMember() on success
                  <button key={`i${p.invitationId}`} type="button" class="sset-report" disabled={busy} onClick={() => addMember({ invitationId: p.invitationId })}>
                    <span class="sset-report__text"><span class="sset-report__title">{p.email}</span><span class="sset-report__desc">Pending invite</span></span>
                  </button>
                ))}
              </div>
            )}
            <div class="sset-person__confirm" style="margin-top:8px;">
              <button type="button" class="sset-btn sset-btn--ghost" data-track="team_region_add_member_done" disabled={busy} onClick={() => setAddingMember(false)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="sset-btn sset-btn--ghost sset-adddoc" data-track="team_region_add_member_opened" onClick={() => setAddingMember(true)}>
            + Add person
          </button>
        )}
      </Section>

      <div class="sset-removerow">
        {confirmDelete ? (
          <div class="sset-person__confirm">
            {/* NO_TRACK — team_region_deleted fired in doDelete() on success */}
            <button type="button" class="sset-btn sset-btn--danger" disabled={deleting} onClick={doDelete}>
              {deleting ? 'Deleting…' : 'Delete region'}
            </button>
            <button type="button" class="sset-btn sset-btn--ghost" data-track="team_region_delete_cancelled" disabled={deleting} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" class="sset-btn sset-btn--danger sset-btn--block" data-track="team_region_delete_opened" onClick={() => setConfirmDelete(true)}>
            Delete region
          </button>
        )}
      </div>

      {status ? <div class="sset-status is-err" style="padding:8px 2px;">{status.text}</div> : null}
    </div>
  );
}
