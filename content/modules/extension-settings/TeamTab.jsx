/**
 * Team subtab — self-serve team management from the extension. Lists the people
 * in the org (scoped to the caller's admin scope by the backend), and lets an
 * admin invite new staff (with an access level + job title + feature bundles) or
 * remove someone. Reads/writes /api/extension/team/* via settings-api.
 *
 * The server re-enforces every delegation rule (scope <= own, buildings in
 * scope, features you hold, keep >=1 org admin) — this UI only renders what the
 * caller is allowed to grant.
 */
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import {
  getTeamMembers,
  getTeamGrantable,
  inviteTeamMember,
  removeTeamMember,
  addTeamDoctor,
  sendTeamDoctorLink,
} from './utils/settings-api.js';
import { Section } from './ui.jsx';
import { track } from '../../utils/analytics.js';

const SCOPE_LABELS = {
  org_admin: 'Org admin',
  region_admin: 'Region admin',
  building_admin: 'Building admin',
  user: 'Staff',
};

const CHECK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** Seed a feature set from a job-title template, clamped to what the actor can grant. */
function seedFromRole(roleModules, grantable) {
  const out = {};
  for (const k of Object.keys(grantable)) out[k] = !!(roleModules?.[k] && grantable[k]);
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

export function TeamTab({ facilityName, orgSlug }) {
  const [view, setView] = useState('list'); // 'list' | 'invite'
  const [team, setTeam] = useState(null);
  const [grantable, setGrantable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canManage, setCanManage] = useState(false);

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
      setTeam(m.team);
      setGrantable(g);
      setCanManage(m.canManage ?? (m.scope && m.scope !== 'user'));
    } catch (e) {
      setError(e.message || 'Could not load your team.');
    } finally {
      setLoading(false);
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

  if (view === 'invite') {
    return (
      <InviteView
        grantable={grantable}
        facilityName={facilityName}
        orgSlug={orgSlug}
        onCancel={() => setView('list')}
        onInvited={() => { setView('list'); load(); }}
      />
    );
  }

  if (view === 'add-doctor') {
    return (
      <AddDoctorView
        grantable={grantable}
        facilityName={facilityName}
        orgSlug={orgSlug}
        onCancel={() => setView('list')}
        onAdded={() => { setView('list'); load(); }}
      />
    );
  }

  return (
    <RosterView
      team={team}
      grantable={grantable}
      canManage={canManage}
      orgSlug={orgSlug}
      onInvite={() => setView('invite')}
      onAddDoctor={() => setView('add-doctor')}
      onChanged={load}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

function RosterView({ team, grantable, canManage, orgSlug, onInvite, onAddDoctor, onChanged }) {
  const people = team?.people ?? [];
  const pending = team?.pendingPeople ?? [];
  const doctors = team?.doctors ?? [];

  return (
    <>
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

        {people.length === 0 && (!canManage || pending.length === 0) ? (
          <div class="sset-empty">
            {canManage ? 'No one here yet. Invite your first teammate.' : 'No teammates in your building yet.'}
          </div>
        ) : null}

        {people.map((p) => (
          <PersonRow key={p.userId} person={p} canManage={canManage} orgSlug={orgSlug} onChanged={onChanged} />
        ))}

        {canManage && pending.length ? (
          <Section label="Invited">
            {pending.map((p) => (
              <div key={p.invitationId} class="sset-person is-pending">
                <div class="sset-person__main">
                  <div class="sset-person__name">{p.email}</div>
                  <div class="sset-person__meta">
                    <span class="sset-badge">{SCOPE_LABELS[p.orgRole] || 'Staff'}</span>
                    <span>Invitation pending</span>
                  </div>
                </div>
              </div>
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
              <DoctorRow
                key={d.practitionerId}
                doctor={d}
                grantable={grantable}
                canManage={canManage}
                orgSlug={orgSlug}
                onChanged={onChanged}
              />
            ))}
          </Section>
        ) : null}
      </div>
    </>
  );
}

function PersonRow({ person, canManage, orgSlug, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const isAdmin = person.orgRole && person.orgRole !== 'user';
  const roleLabel = isAdmin ? SCOPE_LABELS[person.orgRole] : null;
  const buildings = (person.buildingNames || []).join(', ');

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await removeTeamMember(orgSlug, person.userId);
      track('team_member_removed', { source: 'settings' });
      onChanged();
    } catch (e) {
      setErr(e.message || 'Could not remove this person.');
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div class="sset-person">
      <div class="sset-person__main">
        <div class="sset-person__name">{person.name || person.email}</div>
        <div class="sset-person__meta">
          {roleLabel ? <span class="sset-badge sset-badge--admin">{roleLabel}</span> : null}
          {person.snfRole ? <span class="sset-badge">{prettyRole(person.snfRole)}</span> : null}
          {buildings ? <span class="sset-person__bldgs">{buildings}</span> : null}
        </div>
        {err ? <div class="sset-person__err">{err}</div> : null}
      </div>
      {canManage ? (
        confirming ? (
          <div class="sset-person__confirm">
            {/* NO_TRACK — removal is tracked on success in the handler */}
            <button type="button" class="sset-btn sset-btn--danger" disabled={busy} onClick={remove}>
              {busy ? 'Removing…' : 'Remove'}
            </button>
            <button type="button" class="sset-btn sset-btn--ghost" data-track="team_remove_cancelled" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" class="sset-person__remove" data-track="team_remove_opened" onClick={() => setConfirming(true)} aria-label="Remove person">
            Remove
          </button>
        )
      ) : null}
    </div>
  );
}

function DoctorRow({ doctor, grantable, canManage, orgSlug, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const grantableIds = new Set((grantable?.buildings ?? []).map((b) => b.id));
  const locationIds = doctor.locationIds || [];
  const sendLocationId = locationIds.find((id) => grantableIds.has(id)) ?? locationIds[0];
  const key = doctor.status?.key;
  const alreadySent = !!key && key !== 'not_sent' && key !== 'not_started';

  const send = async () => {
    if (!sendLocationId) {
      setMsg('No building in your scope for this doctor.');
      return;
    }
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
        <button
          type="button"
          class="sset-doc-send"
          disabled={busy}
          onClick={send}
        >
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

function prettyRole(snfRole) {
  return String(snfRole)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* Invite                                                              */
/* ------------------------------------------------------------------ */

function InviteView({ grantable, facilityName, orgSlug, onCancel, onInvited }) {
  const scopes = grantable?.scopes?.length ? grantable.scopes : ['user'];
  const roles = grantable?.roles ?? [];
  const grantableModules = grantable?.modules ?? {};
  const bundles = useMemo(
    () => grantableBundles(grantable?.bundles, grantableModules),
    [grantable],
  );
  const allBuildings = grantable?.buildings ?? [];

  const [email, setEmail] = useState('');
  const [scope, setScope] = useState(scopes.includes('user') ? 'user' : scopes[0]);
  const [snfRole, setSnfRole] = useState(roles[0]?.key ?? 'mds_coordinator');
  const [modules, setModules] = useState(() =>
    seedFromRole(roles.find((r) => r.key === (roles[0]?.key))?.modules, grantableModules),
  );
  // Pre-check the building matching the page's facility, if we can find it.
  const [buildingIds, setBuildingIds] = useState(() => {
    const match = allBuildings.find(
      (b) => facilityName && b.name?.toLowerCase() === facilityName.toLowerCase(),
    );
    return new Set(match ? [match.id] : []);
  });

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const isOrgAdmin = scope === 'org_admin';

  const pickRole = (key) => {
    setSnfRole(key);
    const role = roles.find((r) => r.key === key);
    setModules(seedFromRole(role?.modules, grantableModules));
  };

  const toggleBundle = (bundle) => {
    setModules((m) => applyBundle(m, bundle, !bundleFullyOn(m, bundle), grantableModules));
  };

  const toggleBuilding = (id) => {
    setBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!email.trim()) {
      setStatus({ kind: 'err', text: 'Enter an email address.' });
      return;
    }
    if (buildingIds.size === 0) {
      setStatus({ kind: 'err', text: 'Pick at least one building.' });
      return;
    }
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
      });
      track('team_member_invited', { source: 'settings', scope });
      onInvited();
    } catch (e) {
      setStatus({ kind: 'err', text: e.message || 'Could not send the invitation.' });
      setSubmitting(false);
    }
  };

  return (
    <>
      <div class="sset-body">
        <button type="button" class="sset-back" data-track="team_invite_cancelled" onClick={onCancel}>← Back to team</button>

        <Section label="Who">
          <input
            type="email"
            class="sset-input"
            value={email}
            onInput={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Section>

        <Section label="Access level">
          <select class="sset-select sset-select--full" value={scope} onChange={(e) => setScope(e.target.value)}>
            {scopes.map((s) => (
              <option key={s} value={s}>{SCOPE_LABELS[s] || s}</option>
            ))}
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
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </Section>

            <Section label="Features" hint={`${bundles.filter((b) => bundleFullyOn(modules, b)).length} on`}>
              {bundles.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  class={`sset-report${bundleFullyOn(modules, b) ? ' is-on' : ''}`}
                  onClick={() => toggleBundle(b)}
                  aria-pressed={bundleFullyOn(modules, b) ? 'true' : 'false'}
                >
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
                <button
                  key={b.id}
                  type="button"
                  class={`sset-report${buildingIds.has(b.id) ? ' is-on' : ''}`}
                  onClick={() => toggleBuilding(b.id)}
                  aria-pressed={buildingIds.has(b.id) ? 'true' : 'false'}
                >
                  <span class="sset-check">{CHECK}</span>
                  <span class="sset-report__text">
                    <span class="sset-report__title">{b.name}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div class="sset-savebar">
        <div class={`sset-status${status ? ` is-${status.kind}` : ''}`} role="status">
          {status?.text || ''}
        </div>
        <button
          type="button"
          class="sset-btn sset-btn--primary"
          onClick={submit}
          disabled={submitting || !email.trim() || buildingIds.size === 0}
        >
          {submitting ? 'Sending…' : 'Send invitation'}
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
    const match = allBuildings.find(
      (b) => facilityName && b.name?.toLowerCase() === facilityName.toLowerCase(),
    );
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
    if (!firstName.trim() || !lastName.trim()) {
      setStatus({ kind: 'err', text: 'First and last name are required.' });
      return;
    }
    if (!phone.trim()) {
      setStatus({ kind: 'err', text: 'A cell phone is required to send their setup link.' });
      return;
    }
    if (!locationId) {
      setStatus({ kind: 'err', text: 'Pick a building.' });
      return;
    }
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
        <button
          type="button"
          class="sset-btn sset-btn--primary"
          onClick={submit}
          disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim() || !locationId}
        >
          {submitting ? 'Adding…' : 'Add doctor'}
        </button>
      </div>
    </>
  );
}
