'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrganization } from '@clerk/nextjs';
import { API_PATHS } from '@docflow/contracts';
import { Button, Card } from '@/components/ui/primitives';

type Mode = 'choose' | 'company';

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
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  if (mode === 'company') {
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <p className="text-sm text-ink-muted">Name your company workspace to continue.</p>
        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard"
          skipInvitationScreen
        />
        <button className="text-sm text-ink-muted hover:text-ink" onClick={() => setMode('choose')}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="flex flex-col p-6">
        <h2 className="text-lg font-semibold text-ink">Personal</h2>
        <p className="mt-2 flex-1 text-sm text-ink-muted">
          Just you. Send and sign documents under your own workspace. Perfect for freelancers and
          individuals.
        </p>
        <Button className="mt-4" onClick={startPersonal} disabled={busy}>
          {busy ? 'Setting up…' : 'Use a personal account'}
        </Button>
      </Card>

      <Card className="flex flex-col p-6">
        <h2 className="text-lg font-semibold text-ink">Company</h2>
        <p className="mt-2 flex-1 text-sm text-ink-muted">
          A shared workspace for your team, with roles and members. Best for businesses sending
          documents together.
        </p>
        <Button className="mt-4" variant="ghost" onClick={() => setMode('company')} disabled={busy}>
          Set up a company
        </Button>
      </Card>

      {error && <p className="sm:col-span-2 text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
