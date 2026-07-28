import Link from 'next/link';
import { Clock, FileCheck2, Send, TriangleAlert } from 'lucide-react';
import type { SignatureRequest } from '@docflow/contracts';
import { Card, CardHeader, EmptyState, ProgressBar, Td, Th } from '@/components/ui/primitives';
import { loadRequests } from '@/lib/queries';
import { relativeTime, shortDate } from '@/lib/format';
import { isLive, statusView } from '@/lib/status';

/**
 * Reports — what the workspace's signing actually looks like. Everything is
 * computed from the envelopes themselves, so nothing here can drift from the
 * agreements list.
 */
export default async function ReportsPage() {
  const all = (await loadRequests()).filter((r) => !r.deletedAt);

  if (all.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1360px] px-8 py-7">
        <h1 className="text-3xl font-semibold text-ink">Reports</h1>
        <Card className="mt-6">
          <EmptyState
            title="No data yet"
            body="Reports appear once you have sent your first agreement."
            action={
              <Link href="/templates" className="mt-2 font-semibold text-brand-link hover:underline">
                Send a document
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const completed = all.filter((r) => r.status === 'completed');
  const live = all.filter(isLive);
  const lost = all.filter((r) => r.status === 'voided' || r.status === 'expired');
  const completionRate = Math.round((completed.length / all.length) * 100);

  // Median, not mean: one envelope that sat for a month shouldn't decide the
  // headline number for a workspace that normally turns around in an hour.
  const turnarounds = completed
    .filter((r) => r.completedAt)
    .map((r) => new Date(r.completedAt!).getTime() - new Date(r.sentAt).getTime())
    .sort((a, b) => a - b);
  const medianMs = turnarounds.length
    ? turnarounds[Math.floor(turnarounds.length / 2)]!
    : null;

  const months = lastMonths(all, 6);
  const peak = Math.max(1, ...months.map((m) => m.sent));

  // Who actually signs: ranked by finished envelopes, not by how often they
  // were asked.
  const bySigner = new Map<string, { sent: number; signed: number }>();
  for (const r of all) {
    const key = r.recipientEmail;
    const row = bySigner.get(key) ?? { sent: 0, signed: 0 };
    row.sent += 1;
    if (r.status === 'completed') row.signed += 1;
    bySigner.set(key, row);
  }
  const topSigners = [...bySigner.entries()]
    .sort((a, b) => b[1].sent - a[1].sent)
    .slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-[1360px] px-8 py-7">
      <h1 className="text-3xl font-semibold text-ink">Reports</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Every figure below is derived from this workspace&apos;s agreements — nothing is estimated.
      </p>

      <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Sent"
          value={all.length}
          hint="agreements, all time"
          icon={<Send className="h-5 w-5" />}
        />
        <Metric
          label="Completed"
          value={completed.length}
          hint={`${completionRate}% of everything sent`}
          icon={<FileCheck2 className="h-5 w-5" />}
          tone="success"
        />
        <Metric
          label="In flight"
          value={live.length}
          hint="waiting on a signature"
          icon={<Clock className="h-5 w-5" />}
          tone="info"
        />
        <Metric
          label="Cancelled or expired"
          value={lost.length}
          hint="never reached completion"
          icon={<TriangleAlert className="h-5 w-5" />}
          tone={lost.length > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader title="Volume by month" />
          <div className="px-6 pb-6">
            <div className="flex h-52 items-end gap-4">
              {months.map((m) => (
                <div key={m.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end justify-center gap-1">
                    <Bar value={m.sent} peak={peak} className="bg-brand/25" title={`${m.sent} sent`} />
                    <Bar
                      value={m.completed}
                      peak={peak}
                      className="bg-brand"
                      title={`${m.completed} completed`}
                    />
                  </div>
                  <span className="truncate text-xs text-ink-muted">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-5 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-brand/25" /> Sent
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-brand" /> Completed
              </span>
            </div>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Turnaround" />
          <div className="px-6 pb-6">
            <p className="text-4xl font-semibold text-ink">
              {medianMs === null ? '—' : humanDuration(medianMs)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              median time from sending to the last signature
            </p>
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink">Completion rate</span>
                <span className="text-sm font-semibold text-ink">{completionRate}%</span>
              </div>
              <ProgressBar value={completed.length} max={all.length} className="mt-2" />
            </div>
            {turnarounds.length > 1 && (
              <dl className="mt-6 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Fastest</dt>
                  <dd className="text-ink">{humanDuration(turnarounds[0]!)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Slowest</dt>
                  <dd className="text-ink">{humanDuration(turnarounds.at(-1)!)}</dd>
                </div>
              </dl>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recipients" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-border">
                <Th>Recipient</Th>
                <Th>Sent to them</Th>
                <Th>Signed</Th>
                <Th>Rate</Th>
              </tr>
            </thead>
            <tbody>
              {topSigners.map(([email, s]) => (
                <tr key={email} className="border-b border-border last:border-b-0">
                  <Td className="font-medium">{email}</Td>
                  <Td className="text-ink-muted">{s.sent}</Td>
                  <Td className="text-ink-muted">{s.signed}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <ProgressBar value={s.signed} max={s.sent} className="w-28" />
                      <span className="text-sm text-ink-muted">
                        {Math.round((s.signed / s.sent) * 100)}%
                      </span>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Recent activity" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-border">
                <Th>Document</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
                <Th>Last change</Th>
              </tr>
            </thead>
            <tbody>
              {all.slice(0, 10).map((r) => {
                const sv = statusView(r.status);
                return (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <Td>
                      <Link href={`/requests/${r.id}`} className="font-medium hover:text-brand-link">
                        {r.documentName}
                      </Link>
                    </Td>
                    <Td>
                      <span className={`text-sm font-medium ${toneClass(sv.tone)}`}>{sv.label}</span>
                    </Td>
                    <Td className="text-ink-muted">{shortDate(r.sentAt)}</Td>
                    <Td className="text-ink-muted">{relativeTime(r.lastChangeAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function toneClass(tone: string): string {
  return (
    {
      success: 'text-success',
      info: 'text-info',
      warning: 'text-warning',
      danger: 'text-danger',
      neutral: 'text-ink-muted',
    }[tone] ?? 'text-ink'
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: 'success' | 'info' | 'danger' | 'neutral';
}) {
  const ring = {
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
    danger: 'bg-danger-soft text-danger',
    neutral: 'bg-surface-sunken text-ink-muted',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${ring}`}>{icon}</span>
      </div>
      <p className="mt-3 text-4xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
    </Card>
  );
}

function Bar({
  value,
  peak,
  className,
  title,
}: {
  value: number;
  peak: number;
  className: string;
  title: string;
}) {
  // Floor at 2px so a month with one envelope is visible, not invisible.
  const h = value === 0 ? 0 : Math.max(2, (value / peak) * 100);
  return (
    <div
      title={title}
      className={`w-1/2 rounded-t-sm ${className}`}
      style={{ height: `${h}%` }}
      aria-label={title}
    />
  );
}

/** Sent/completed counts for the last `count` calendar months, oldest first. */
function lastMonths(rows: SignatureRequest[], count: number) {
  const now = new Date();
  const buckets: { label: string; key: string; sent: number; completed: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      key: `${d.getFullYear()}-${d.getMonth()}`,
      sent: 0,
      completed: 0,
    });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const d = new Date(r.sentAt);
    const bucket = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) continue;
    bucket.sent += 1;
    if (r.status === 'completed') bucket.completed += 1;
  }
  return buckets;
}

function humanDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  return `${Math.round(hours / 24)} days`;
}
