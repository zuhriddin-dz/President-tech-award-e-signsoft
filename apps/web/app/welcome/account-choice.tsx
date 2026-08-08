'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrganization, useAuth, useOrganizationList } from '@clerk/nextjs';
import { Building2, Check, UserRound } from 'lucide-react';
import { API_PATHS } from '@docflow/contracts';
import { Button } from '@/components/ui/primitives';

type Mode = 'choose' | 'company';

/**
 * Personal vs company. The distinction is real and worth getting right at
 * sign-up: a company workspace is shared with colleagues, a personal one never
 * is, and moving documents between them later is not something we offer.
 */
export function AccountChoice() {
  const router = useRouter();
  const { isLoaded: authLoaded, orgId } = useAuth();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  /** The user has asked for a company workspace and we are awaiting the claim. */
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server picks the workspace from the session token's org claim, and that
   * claim exists only once an organization is ACTIVE. Clerk's
   * afterCreateOrganizationUrl navigated the moment the org was created, which
   * raced that update: /home asked the API with a token still carrying no org,
   * got ONBOARDING_REQUIRED, and was redirected straight back here. "Set up a
   * company" therefore looked like it did nothing, and trying again created a
   * second organization. So wait for the claim instead of assuming it.
   *
   * Gated on `entering` deliberately. Navigating on orgId alone would fire on
   * mount too, and if the server ever disagreed the two pages would redirect
   * at each other forever.
   */
  useEffect(() => {
    if (entering && authLoaded && orgId) router.replace('/home');
  }, [entering, authLoaded, orgId, router]);

  /** Companies this user already belongs to — may exist without one being active. */
  const memberships = userMemberships?.data ?? [];

  async function startPersonal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api${API_PATHS.onboardingPersonal}`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not set up your workspace.');
      router.push('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  /**
   * Open a company this user is already a member of. Without this, someone who
   * returns with no active organization is offered only "create" and quietly
   * accumulates a duplicate workspace on every visit.
   */
  async function openCompany(organizationId: string) {
    setBusy(true);
    setError(null);
    setEntering(true);
    try {
      await setActive?.({ organization: organizationId });
      // The effect above navigates once the org claim reaches the session.
    } catch {
      setError('Could not open that workspace.');
      setEntering(false);
      setBusy(false);
    }
  }

  if (mode === 'company') {
    return (
      <div className="mt-10 flex flex-col items-center gap-5">
        <p className="text-sm text-ink-muted">Name your company workspace to continue.</p>
        {/* No afterCreateOrganizationUrl: navigating here would race the org
            claim reaching the session. The effect above waits for it. */}
        <CreateOrganization skipInvitationScreen />
        {entering && (
          <p className="text-sm text-ink-muted">Opening your workspace…</p>
        )}
        <button
          className="text-sm font-semibold text-brand-link hover:underline"
          onClick={() => {
            setEntering(false);
            setMode('choose');
          }}
        >
          ← Back to the choice
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Choice
          icon={<UserRound className="h-6 w-6" />}
          title="Personal"
          body="Just you. Send and sign under your own workspace — right for freelancers, contractors and one-person businesses."
          points={['Your documents only', 'Free to start', 'Add a company workspace any time']}
          action={
            <Button variant="dark" size="lg" className="w-full" onClick={startPersonal} disabled={busy}>
              {busy ? 'Setting up…' : 'Use a personal account'}
            </Button>
          }
        />
        <Choice
          icon={<Building2 className="h-6 w-6" />}
          title="Company"
          body="A shared workspace for your team, with members and roles. Right for businesses where more than one person sends documents."
          points={['Shared agreements and templates', 'Owner / admin / member roles', 'Isolated from every other company']}
          action={
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => {
                // Arm the wait before Clerk can create anything, so the claim
                // is never missed between creation and this state landing.
                setEntering(true);
                setMode('company');
              }}
              disabled={busy}
            >
              {memberships.length > 0 ? 'Set up another company' : 'Set up a company'}
            </Button>
          }
        />
      </div>

      {/* Already a member somewhere, but nothing active: offer the door in
          rather than only the door to a new, duplicate workspace. */}
      {memberships.length > 0 && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <h3 className="text-sm font-semibold text-ink">Your company workspaces</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {memberships.map((m) => (
              <li key={m.organization.id} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <Building2 className="h-4 w-4 text-ink-muted" />
                  {m.organization.name}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openCompany(m.organization.id)}
                  disabled={busy}
                >
                  {busy && entering ? 'Opening…' : 'Open'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}
    </>
  );
}

function Choice({
  icon,
  title,
  body,
  points,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  points: string[];
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-7 transition-shadow hover:shadow-md">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
        {icon}
      </span>
      <h2 className="mt-4 text-xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
      <ul className="mt-4 flex flex-1 flex-col gap-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-ink">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-6">{action}</div>
    </div>
  );
}
