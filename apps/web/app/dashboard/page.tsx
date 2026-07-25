import { redirect } from 'next/navigation';
import { API_PATHS, MeResponseSchema } from '@docflow/contracts';
import { apiGetOrOnboarding } from '@/lib/api';

/**
 * Dashboard shell. Operator: a signed-in sender confirming they're in the
 * right workspace. A user with no workspace yet is sent to the account choice.
 */
export default async function DashboardPage() {
  const result = await apiGetOrOnboarding(API_PATHS.me, MeResponseSchema);
  if (result.status === 'onboarding') redirect('/welcome');

  const me = result.status === 'ok' ? result.data : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {me?.tenant ? me.tenant.name : 'Dashboard'}
        </h1>
        {me?.tenant ? (
          <p className="mt-1 text-sm text-ink-muted">
            {me.tenant.kind === 'personal' ? 'Personal workspace' : 'Company workspace'} · your role:{' '}
            <span className="font-medium text-ink">{me.role}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-warning">
            Workspace data is unavailable right now — if this persists, make sure the API is
            running, then refresh.
          </p>
        )}
      </div>

      {/* Overview counters — the UX-blueprint trio; live numbers arrive in Phase 8. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            ['Waiting for others', '0'],
            ['Expiring soon', '0'],
            ['Completed', '0'],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-ink">Agreement activity</h2>
        <p className="mt-3 text-sm text-ink-muted">
          Nothing here yet — sending your first document arrives in an upcoming milestone.
        </p>
      </div>
    </div>
  );
}
