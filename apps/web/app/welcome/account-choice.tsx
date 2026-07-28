'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrganization } from '@clerk/nextjs';
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
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (mode === 'company') {
    return (
      <div className="mt-10 flex flex-col items-center gap-5">
        <p className="text-sm text-ink-muted">Name your company workspace to continue.</p>
        <CreateOrganization afterCreateOrganizationUrl="/home" skipInvitationScreen />
        <button
          className="text-sm font-semibold text-brand-link hover:underline"
          onClick={() => setMode('choose')}
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
              onClick={() => setMode('company')}
              disabled={busy}
            >
              Set up a company
            </Button>
          }
        />
      </div>
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
