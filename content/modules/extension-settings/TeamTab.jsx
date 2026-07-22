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

export function TeamTab({ facilityName, orgSlug }) {
  // nav: {view:'list'|'invite'|'add-doctor'} | {view:'person', id} | {view:'pending', id}
  const [nav, setNav] = useState({ view: 'list' });
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

  if (nav.view === 'regions') {
    return (
      <RegionsView
        orgSlug={orgSlug}
        grantable={grantable}
        team={team}
        // Region membership changes people's building access, so reload the roster on the way out.
        onBack={() => { setNav({ view: 'list' }); load(); }}
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

  return (
    <RosterView
      team={team}
      grantable={grantable}
      canManage={canManage}
      isOrgAdmin={scope === 'org_admin'}
      selfId={selfId}
      orgSlug={orgSlug}
      onInvite={() => setNav({ view: 'invite' })}
      onAddDoctor={() => setNav({ view: 'add-doctor' })}
      onManageRegions={() => setNav({ view: 'regions' })}
      onOpenPerson={(id) => setNav({ view: 'person', id })}
      onOpenPending={(id) => setNav({ view: 'pending', id })}
      onChanged={refresh}
    />
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

function RosterView({ team, grantable, canManage, isOrgAdmin, selfId, orgSlug, onInvite, onAddDoctor, onManageRegions, onOpenPerson, onOpenPending, onChanged }) {
  const people = team?.people ?? [];
  const pending = team?.pendingPeople ?? [];
  const doctors = team?.doctors ?? [];

  return (
    <div class="sset-body">
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

      {/* Regions are an org-level grouping; only org admins manage them. */}
      {isOrgAdmin ? (
        <div class="sset-region-entry">
          <NavRow label="Regions" value="Manage" onClick={onManageRegions} />
        </div>
      ) : null}

      {people.length === 0 && (!canManage || pending.length === 0) ? (
        <div class="sset-empty">
          {canManage ? 'No one here yet. Invite your first teammate.' : 'No teammates in your building yet.'}
        </div>
      ) : null}

      {people.map((p) => (
        <PersonRow key={p.userId} person={p} canManage={canManage} isSelf={p.userId === selfId} onOpen={onOpenPerson} />
      ))}

      {canManage && pending.length ? (
        <Section label="Invited">
          {pending.map((p) => (
            <PendingRow key={p.invitationId} pending={p} onOpen={onOpenPending} />
          ))}
        </Section>
      ) : null}

      {doctors.length || canManage ? (
        <Section label="Doctors" hint={doctors.length ? `${doctors.length}` : undefined}>
          {canManage ? (
            <button type="button" class="sset-btn sset-btn--ghost sset-adddoc" data-track="team_add_doctor_opened" onClick={onAddDoctor}>
              + Add doctor
            </button>
          ) : null}
          {doctors.length === 0 ? <div class="sset-empty">No doctors yet.</div> : null}
          {doctors.map((d) => (
            <DoctorRow key={d.practitionerId} doctor={d} grantable={grantable} canManage={canManage} orgSlug={orgSlug} onChanged={onChanged} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function PersonRow({ person, canManage, isSelf, onOpen }) {
  const isAdmin = person.orgRole && person.orgRole !== 'user';
  const roleLabel = isAdmin ? SCOPE_LABELS[person.orgRole] : null;
  const buildings = (person.buildingNames || []).join(', ');
  const clickable = canManage;

  const open = () => clickable && onOpen(person.userId);
  return (
    <div
      class={`sset-person${clickable ? ' sset-person--nav' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? open : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
    >
      <div class="sset-person__main">
        <div class="sset-person__name">
          {person.name || person.email}
          {isSelf ? <span class="sset-person__you"> · You</span> : null}
        </div>
        <div class="sset-person__meta">
          {roleLabel ? <span class="sset-badge sset-badge--admin">{roleLabel}</span> : null}
          {person.snfRole ? <span class="sset-badge">{prettyRole(person.snfRole)}</span> : null}
          {buildings ? <span class="sset-person__bldgs">{buildings}</span> : null}
        </div>
      </div>
      {clickable ? <span class="sset-person__chev">{CHEVRON}</span> : null}
    </div>
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
  const [screen, setScreen] = useState('menu'); // 'menu' | 'access' | 'features' | 'buildings'
  const isOrgAdmin = person.orgRole === 'org_admin';

  if (screen === 'access') {
    return <AccessLevelEditor person={person} grantable={grantable} orgSlug={orgSlug} onBack={() => setScreen('menu')} onChanged={onChanged} />;
  }
  if (screen === 'features') {
    return <FeaturesEditor person={person} grantable={grantable} orgSlug={orgSlug} onBack={() => setScreen('menu')} onChanged={onChanged} />;
  }
  if (screen === 'buildings') {
    return <BuildingsEditor person={person} grantable={grantable} orgSlug={orgSlug} onBack={() => setScreen('menu')} onChanged={onChanged} />;
  }

  const scopeLabel = SCOPE_LABELS[person.orgRole] || 'Staff';
  const roleLabel = person.snfRole ? prettyRole(person.snfRole) : 'No job title';
  const buildings = (person.buildingNames || []).join(', ') || 'None';

  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_detail_back" onClick={onBack}>← Back to team</button>
      <div class="sset-detail-head">
        <div class="sset-detail-head__name">{person.name || person.email}</div>
        <div class="sset-detail-head__sub">{person.email}</div>
      </div>

      {isSelf ? (
        <div class="sset-coverage">This is you — ask another admin to change your access.</div>
      ) : (
        <>
          <Section label="Access">
            <NavRow label="Access level" value={scopeLabel} onClick={() => setScreen('access')} />
            {isOrgAdmin ? (
              <div class="sset-coverage" style="border-top:1px solid var(--sset-hair);">
                Org admins have full access to every building and feature.
              </div>
            ) : (
              <>
                <NavRow label="Features" value={roleLabel} onClick={() => setScreen('features')} />
                <NavRow label="Buildings" value={buildings} onClick={() => setScreen('buildings')} />
              </>
            )}
          </Section>

          <Section label="Danger zone">
            <RemoveRow person={person} orgSlug={orgSlug} onRemoved={onRemoved} />
          </Section>
        </>
      )}
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

function AccessLevelEditor({ person, grantable, orgSlug, onBack, onChanged }) {
  const scopes = grantable?.scopes ?? [];
  const options = SCOPE_ORDER.filter((s) => scopes.includes(s) || s === person.orgRole);
  const [busy, setBusy] = useState(false);
  const [confirmOrgAdmin, setConfirmOrgAdmin] = useState(false);
  const [status, setStatus] = useState(null);

  const apply = async (next) => {
    if (next === person.orgRole) { onBack(); return; }
    // Granting org admin is high blast radius — confirm first.
    if (next === 'org_admin' && !confirmOrgAdmin) { setConfirmOrgAdmin(true); return; }
    setBusy(true);
    setStatus(null);
    try {
      await updateTeamMemberRole(person.userId, { orgSlug, orgRole: next });
      track('team_member_role_changed', { source: 'settings', scope: next });
      await onChanged();
      onBack();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not change access level.' });
      setBusy(false);
      setConfirmOrgAdmin(false);
    }
  };

  return (
    <div class="sset-body">
      <button type="button" class="sset-back" data-track="team_editor_back" onClick={onBack}>← {person.name || person.email}</button>
      <Section label="Access level" sub="What this person can manage across the organization.">
        {options.map((s) => (
          // NO_TRACK — role change is tracked on success in apply()
          <button key={s} type="button" class={`sset-report${person.orgRole === s ? ' is-on' : ''}`} disabled={busy} onClick={() => apply(s)}>
            <span class="sset-check">{CHECK}</span>
            <span class="sset-report__text">
              <span class="sset-report__title">{SCOPE_LABELS[s]}</span>
              <span class="sset-report__desc">{SCOPE_DESC[s]}</span>
            </span>
          </button>
        ))}
      </Section>

      {confirmOrgAdmin ? (
        <div class="sset-coverage">
          <strong>Make this person an org admin?</strong> They'll get full access to every building,
          every feature, and all patient data in this organization.
          <div class="sset-person__confirm" style="margin-top:10px;">
            {/* NO_TRACK — role change is tracked on success in apply() */}
            <button type="button" class="sset-btn sset-btn--primary" disabled={busy} onClick={() => apply('org_admin')}>
              Make org admin
            </button>
            <button type="button" class="sset-btn sset-btn--ghost" data-track="team_orgadmin_cancelled" disabled={busy} onClick={() => setConfirmOrgAdmin(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {status ? <div class="sset-status is-err" style="padding:2px 14px 12px;">{status.text}</div> : null}
    </div>
  );
}

function FeaturesEditor({ person, grantable, orgSlug, onBack, onChanged }) {
  const grantableModules = grantable?.modules ?? {};
  const roles = grantable?.roles ?? [];
  const bundles = useMemo(() => grantableBundles(grantable?.bundles, grantableModules), [grantable]);

  const [snfRole, setSnfRole] = useState(person.snfRole ?? roles[0]?.key ?? 'mds_coordinator');
  const [modules, setModules] = useState(null); // null → loading current features
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await getTeamMemberPermissions(person.userId, orgSlug);
        if (cancelled) return;
        setSnfRole(cur.snfRole ?? person.snfRole ?? roles[0]?.key ?? 'mds_coordinator');
        setModules(clampModules(cur.modules ?? {}, grantableModules));
      } catch {
        if (cancelled) return;
        const tpl = roles.find((r) => r.key === person.snfRole)?.modules;
        setModules(seedFromRole(tpl, grantableModules));
      }
    })();
    return () => { cancelled = true; };
  }, [person.userId, orgSlug]);

  const pickRole = (key) => {
    setSnfRole(key);
    const role = roles.find((r) => r.key === key);
    setModules(seedFromRole(role?.modules, grantableModules));
  };
  const toggleBundle = (b) => setModules((m) => applyBundle(m, b, !bundleFullyOn(m, b), grantableModules));

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateTeamMemberPermissions(person.userId, { orgSlug, snfRole, modules });
      track('team_member_features_saved', { source: 'settings' });
      await onChanged();
      onBack();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not save features.' });
      setSaving(false);
    }
  };

  if (modules === null) {
    return (
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_editor_back" onClick={onBack}>← {person.name || person.email}</button>
        <div class="sset-loading"><div class="sset-spinner" /><span>Loading their access…</span></div>
      </div>
    );
  }

  return (
    <>
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_editor_back" onClick={onBack}>← {person.name || person.email}</button>
        <Section label="Job title" sub="Sets a starting point for their features — adjust below.">
          <select class="sset-select sset-select--full" value={snfRole} onChange={(e) => pickRole(e.target.value)}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </Section>
        <Section label="Features" hint={`${bundles.filter((b) => bundleFullyOn(modules, b)).length} on`}>
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
      </div>
      <div class="sset-savebar">
        <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">{status?.text || ''}</div>
        {/* NO_TRACK — features-saved event fired in save() on success */}
        <button type="button" class="sset-btn sset-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save features'}
        </button>
      </div>
    </>
  );
}

function BuildingsEditor({ person, grantable, orgSlug, onBack, onChanged }) {
  const allBuildings = grantable?.buildings ?? [];
  const viaRegion = useMemo(() => new Set(person.viaRegionLocationIds ?? []), [person]);
  const nameById = useMemo(() => new Map(allBuildings.map((b) => [b.id, b.name])), [allBuildings]);
  const viaRegionNames = useMemo(
    () => [...viaRegion].map((id) => nameById.get(id)).filter(Boolean),
    [viaRegion, nameById],
  );

  const [ids, setIds] = useState(() => new Set((person.locationIds ?? []).filter((id) => !viaRegion.has(id))));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const toggle = (id) => setIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await updateTeamMemberLocations(person.userId, { orgSlug, locationIds: Array.from(ids) });
      track('team_member_buildings_saved', { source: 'settings' });
      await onChanged();
      onBack();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not save buildings.' });
      setSaving(false);
    }
  };

  return (
    <>
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_editor_back" onClick={onBack}>← {person.name || person.email}</button>
        <Section label="Buildings" hint={`${ids.size} selected`}>
          {allBuildings.length === 0 ? (
            <div class="sset-coverage">No buildings available to assign.</div>
          ) : (
            <div class="sset-bldg-list">
              {allBuildings.map((b) => (
                <button key={b.id} type="button" data-track="team_building_toggled" class={`sset-report${ids.has(b.id) ? ' is-on' : ''}`} onClick={() => toggle(b.id)} aria-pressed={ids.has(b.id) ? 'true' : 'false'}>
                  <span class="sset-check">{CHECK}</span>
                  <span class="sset-report__text"><span class="sset-report__title">{b.name}</span></span>
                </button>
              ))}
            </div>
          )}
        </Section>
        {viaRegionNames.length ? (
          <Section label="From a region" sub="Managed by region membership — change these on the web.">
            {viaRegionNames.map((name) => (
              <div key={name} class="sset-report" style="cursor:default;">
                <span class="sset-report__text"><span class="sset-report__title">{name}</span></span>
              </div>
            ))}
          </Section>
        ) : null}
      </div>
      <div class="sset-savebar">
        <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">{status?.text || ''}</div>
        {/* NO_TRACK — buildings-saved event fired in save() on success */}
        <button type="button" class="sset-btn sset-btn--primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save buildings'}
        </button>
      </div>
    </>
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
        <button type="button" class="sset-back" data-track="team_invite_cancelled" onClick={onCancel}>← Back to team</button>

        <Section label="Who">
          <input type="email" class="sset-input" value={email} onInput={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Section>

        <Section label="How they sign in">
          <div class="sset-seg">
            <button type="button" data-track="team_invite_method_email" class={`sset-seg__opt${method === 'email' ? ' is-active' : ''}`} onClick={() => setMethod('email')}>
              Email link<small>They set their own password</small>
            </button>
            <button type="button" data-track="team_invite_method_temp" class={`sset-seg__opt${method === 'temp' ? ' is-active' : ''}`} onClick={() => setMethod('temp')}>
              Temp password<small>You set it and share it</small>
            </button>
          </div>
          {isTemp ? (
            <div style="padding:0 12px 12px;">
              <input type="text" class="sset-input" value={tempPassword} onInput={(e) => setTempPassword(e.target.value)} placeholder="Temporary password (min 8 characters)" />
            </div>
          ) : null}
        </Section>

        <Section label="Access level">
          <select class="sset-select sset-select--full" value={scope} onChange={(e) => setScope(e.target.value)}>
            {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s] || s}</option>)}
          </select>
        </Section>

        {isOrgAdmin ? (
          <div class="sset-coverage">
            Org admins have full access to every feature and can manage the whole organization.
          </div>
        ) : (
          <>
            <Section label="Job title" sub="Sets a starting point for their features — adjust below.">
              <select class="sset-select sset-select--full" value={snfRole} onChange={(e) => pickRole(e.target.value)}>
                {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Section>

            <Section label="Features" hint={`${bundles.filter((b) => bundleFullyOn(modules, b)).length} on`}>
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
          </>
        )}

        <Section label="Buildings" hint={`${buildingIds.size} selected`}>
          {allBuildings.length === 0 ? (
            <div class="sset-coverage">No buildings available to assign.</div>
          ) : (
            <div class="sset-bldg-list">
              {allBuildings.map((b) => (
                <button key={b.id} type="button" data-track="team_building_toggled" class={`sset-report${buildingIds.has(b.id) ? ' is-on' : ''}`} onClick={() => toggleBuilding(b.id)} aria-pressed={buildingIds.has(b.id) ? 'true' : 'false'}>
                  <span class="sset-check">{CHECK}</span>
                  <span class="sset-report__text"><span class="sset-report__title">{b.name}</span></span>
                </button>
              ))}
            </div>
          )}
        </Section>
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

  return (
    <>
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_add_doctor_cancelled" onClick={onCancel}>← Back to team</button>

        <Section label="Doctor">
          <div class="sset-doc-names">
            <input type="text" class="sset-input" value={firstName} onInput={(e) => setFirstName(e.target.value)} placeholder="First name" />
            <input type="text" class="sset-input" value={lastName} onInput={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </div>
        </Section>

        <Section label="Cell phone" sub="Used to text them their setup link.">
          <input type="tel" class="sset-input" value={phone} onInput={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </Section>

        <Section label="Title">
          <select class="sset-select sset-select--full" value={title} onChange={(e) => setTitle(e.target.value)}>
            {DOCTOR_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Section>

        <Section label="Building">
          {allBuildings.length === 0 ? (
            <div class="sset-coverage">No buildings available to assign.</div>
          ) : (
            <select class="sset-select sset-select--full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {allBuildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </Section>
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
function RegionsView({ orgSlug, grantable, team, onBack }) {
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
        onBack={() => { setSelectedId(null); loadRegions(); }}
        onDeleted={() => { setSelectedId(null); loadRegions(); }}
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
      <button type="button" class="sset-back" data-track="team_regions_back" onClick={onBack}>← Back to team</button>

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
