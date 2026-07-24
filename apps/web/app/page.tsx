import { auth } from '@clerk/nextjs/server';
import { CreateOrganization } from '@clerk/nextjs';
import { API_PATHS, MeResponseSchema } from '@docflow/contracts';
import { apiGet } from '@/lib/api';

/**
 * Dashboard shell. Operator: a sender who just logged in; their one job here
 * (until Phase 8 gives them real counters) is confirming they're in the right
 * workspace. Everything is display; nothing is a form.
 */
export default async function DashboardPage() {
  const { orgId } = await auth();

  // No active organization → the only useful screen is "create one".
  if (!orgId) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <h1 className="text-xl font-semibold text-ink">Create your workspace</h1>
        <p className="text-sm text-ink-muted">
          Documents, templates and teammates all live inside a workspace.
        </p>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    );
  }

  const me = await apiGet(API_PATHS.me, MeResponseSchema);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {me?.tenant ? me.tenant.name : 'Dashboard'}
        </h1>
        {me ? (
          <p className="mt-1 text-sm text-ink-muted">
            Your role: <span className="font-medium text-ink">{me.role}</span>
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
