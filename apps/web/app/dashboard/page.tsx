import Link from 'next/link';
import { redirect } from 'next/navigation';
import { API_PATHS, MeResponseSchema, SignatureRequestListSchema } from '@docflow/contracts';
import type { SignatureRequest } from '@docflow/contracts';
import { apiGet, apiGetOrOnboarding } from '@/lib/api';

/**
 * Dashboard: a signed-in sender's home. Counters + activity come from real
 * signature requests. A user with no workspace yet is sent to the choice.
 */
export default async function DashboardPage() {
  const meResult = await apiGetOrOnboarding(API_PATHS.me, MeResponseSchema);
  if (meResult.status === 'onboarding') redirect('/welcome');
  const me = meResult.status === 'ok' ? meResult.data : null;

  const list = await apiGet(API_PATHS.signatureRequests, SignatureRequestListSchema);
  const requests = list?.requests ?? [];
  const waiting = requests.filter((r) => r.status === 'sent' || r.status === 'viewed');
  const completed = requests.filter((r) => r.status === 'completed');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {me?.tenant ? me.tenant.name : 'Dashboard'}
          </h1>
          {me?.tenant && (
            <p className="mt-1 text-sm text-ink-muted">
              {me.tenant.kind === 'personal' ? 'Personal workspace' : 'Company workspace'} · your
              role: <span className="font-medium text-ink">{me.role}</span>
            </p>
          )}
        </div>
        <Link
          href="/templates"
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
        >
          Send a document
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            ['Waiting for others', waiting.length],
            ['Expiring soon', requests.filter((r) => isExpiringSoon(r)).length],
            ['Completed', completed.length],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <RequestTable title="Waiting for signature" rows={waiting} showSigned={false} />
      <RequestTable title="Signed" rows={completed} showSigned />
    </div>
  );
}

function isExpiringSoon(r: SignatureRequest): boolean {
  if (r.status !== 'sent' && r.status !== 'viewed') return false;
  const days = (new Date(r.expiresAt).getTime() - Date.now()) / 86_400_000;
  return days <= 3;
}

function RequestTable({
  title,
  rows,
  showSigned,
}: {
  title: string;
  rows: SignatureRequest[];
  showSigned: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-muted">
          {showSigned ? 'No signed documents yet.' : 'Nothing waiting — send a document to start.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 font-medium">Document</th>
                <th className="px-5 py-2 font-medium">Signer</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Sent</th>
                {showSigned && <th className="px-5 py-2 font-medium">Signed</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted">
                  <td className="px-5 py-3">
                    <Link href={`/requests/${r.id}`} className="text-ink hover:text-brand">
                      {r.documentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-muted">
                    {r.signerCount > 1 ? (
                      <>
                        {r.signedCount} of {r.signerCount} signed
                        <span className="ml-1 text-xs">
                          ({r.routingMode === 'sequential' ? 'in order' : 'in parallel'})
                        </span>
                      </>
                    ) : (
                      r.recipientEmail
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3 text-ink-muted">
                    {new Date(r.sentAt).toLocaleDateString()}
                  </td>
                  {showSigned && (
                    <td className="px-5 py-3 text-ink-muted">
                      {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SignatureRequest['status'] }) {
  const styles: Record<SignatureRequest['status'], string> = {
    sent: 'bg-brand/10 text-brand',
    viewed: 'bg-warning/10 text-warning',
    completed: 'bg-success/10 text-success',
    voided: 'bg-ink/10 text-ink-muted',
    expired: 'bg-danger/10 text-danger',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
