import Link from 'next/link';
import { Check, CircleAlert, Download, FileCheck2, Lock } from 'lucide-react';
import {
  API_PATHS,
  TRIAL_DAYS,
  type SignatureRequest,
  type TenantAccess,
} from '@docflow/contracts';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { loadMe, loadRequests } from '@/lib/queries';

/**
 * Plans, and where this workspace stands.
 *
 * One page, two doors: /billing, reached by choice, and EVERY dashboard URL
 * once a workspace's trial has ended — the shell renders this in place of the
 * page that was asked for. The second door is why it lists signed documents:
 * they stay the customer's after the trial, and with the rest of the product
 * closed this is the one place left to get them.
 *
 * Nothing here can be bought yet — no payment processor is connected. That is
 * stated plainly rather than dressed up with a checkout that fails at the last
 * step: a page that takes a card it cannot charge is worse than one that says
 * so up front.
 */
interface Plan {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  highlight?: boolean;
  features: readonly string[];
}

const PLANS: readonly Plan[] = [
  {
    name: 'Personal',
    price: '$0',
    cadence: 'while in beta',
    blurb: 'One person, everything that makes a signature hold up.',
    features: [
      'Unlimited documents and templates',
      'Up to 5 signers per document',
      'Sealed copy and Certificate of Completion on every document',
      'Signing links that expire and can be cancelled',
      'Tamper verification you can run yourself',
    ],
  },
  {
    name: 'Company',
    price: '$30',
    cadence: 'per user / month',
    blurb: 'A shared workspace with a real audit trail.',
    highlight: true,
    features: [
      'Everything in Personal',
      'Shared workspace — everyone sees the same documents',
      'Signing order, reminders and expiry sweeps',
      'Per-recipient field tagging',
      'Folders, filtering and CSV export',
      'Reports on turnaround and completion',
    ],
  },
  {
    name: 'Scale',
    price: 'Talk to us',
    cadence: '',
    blurb: 'For teams that need it wired into something else.',
    features: [
      'Everything in Company',
      'Send to a list',
      'Public signing links',
      'API access and webhooks',
      'Custom retention and data residency',
    ],
  },
];

const DAY_FORMAT = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' });

export async function GetPro() {
  const [me, requests] = await Promise.all([loadMe(), loadRequests()]);
  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const access = tenant?.access ?? null;
  const locked = access?.state === 'ended';
  const live = requests.filter((r) => !r.deletedAt);
  const signed = live.filter((r) => r.status === 'completed');

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">
        {locked ? 'Your free trial has ended' : 'Plan and billing'}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {tenant?.kind === 'personal' ? 'Personal' : 'Company'} workspace · {live.length} document
        {live.length === 1 ? '' : 's'} sent
      </p>

      {access && <StatusBanner access={access} />}

      {locked && <SignedDocuments requests={signed} />}

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card
            key={p.name}
            className={`flex flex-col p-6 ${p.highlight ? 'border-brand ring-1 ring-brand' : ''}`}
          >
            {p.highlight && (
              <span className="mb-3 self-start rounded-full bg-brand-soft-strong px-2.5 py-1 text-xs font-semibold text-ink">
                Most workspaces
              </span>
            )}
            <h2 className="text-lg font-semibold text-ink">{p.name}</h2>
            <p className="mt-2">
              <span className="text-3xl font-semibold text-ink">{p.price}</span>
              {p.cadence && <span className="ml-1.5 text-sm text-ink-muted">{p.cadence}</span>}
            </p>
            <p className="mt-2 text-sm text-ink-muted">{p.blurb}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-ink">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {f}
                </li>
              ))}
            </ul>
            <Button variant={p.highlight ? 'dark' : 'secondary'} className="mt-6 w-full" disabled>
              Not available yet
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title="Why you cannot pay yet" />
        <div className="px-6 pb-6 text-sm text-ink-muted">
          <p>
            E-SIGNSOFT has no payment processor connected yet, so there is no checkout to send you to
            and no card on file to charge. When billing opens you will be able to upgrade here, and
            you will be asked once, before anything is taken.
          </p>
          <p className="mt-3">
            If you need to keep working in the meantime, or need an invoice,{' '}
            <Link href="/help" className="font-semibold text-brand-link hover:underline">
              get in touch
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}

/** Where the workspace stands, in one sentence — decided by the API, not here. */
function StatusBanner({ access }: { access: TenantAccess }) {
  const ends = DAY_FORMAT.format(new Date(access.trialEndsAt));

  if (access.state === 'pro') {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-5 py-4">
        <Check className="h-5 w-5 shrink-0 text-success" />
        <p className="text-[15px] text-ink">This workspace is on a paid plan.</p>
      </div>
    );
  }

  if (access.state === 'ended') {
    return (
      <div className="mt-5 flex gap-3 rounded-lg border border-danger bg-danger-soft px-5 py-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <p className="text-[15px] text-ink">
          Your {TRIAL_DAYS}-day free trial ended on <strong>{ends}</strong>. Sending, uploading and
          editing are paused until this workspace is on a paid plan. Documents you already sent can
          still be signed, and everything already signed stays yours to download below.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-brand-soft px-5 py-4">
      <CircleAlert className="h-5 w-5 shrink-0 text-brand-link" />
      <p className="text-[15px] text-ink">
        Your free trial ends in <strong>{access.daysLeft}</strong> day
        {access.daysLeft === 1 ? '' : 's'}, on {ends}.
      </p>
    </div>
  );
}

/**
 * What the workspace has already signed, each with its sealed copy and its
 * certificate. The API keeps exactly these two downloads open after the trial
 * (@AllowWhenLocked), because together they are the customer's evidence.
 */
function SignedDocuments({ requests }: { requests: SignatureRequest[] }) {
  const link =
    'inline-flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken';

  return (
    <Card className="mt-6">
      <CardHeader title="Your signed documents" />
      <div className="px-6 pb-6">
        {requests.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing has been signed in this workspace yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <FileCheck2 className="h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{r.documentName}</p>
                  {r.completedAt && (
                    <p className="text-xs text-ink-muted">
                      Signed {DAY_FORMAT.format(new Date(r.completedAt))}
                    </p>
                  )}
                </div>
                <a href={`/api${API_PATHS.signatureRequests}/${r.id}/signed`} download className={link}>
                  <Download className="h-4 w-4" />
                  Signed copy
                </a>
                <a
                  href={`/api${API_PATHS.signatureRequests}/${r.id}/certificate`}
                  download
                  className={link}
                >
                  <Download className="h-4 w-4" />
                  Certificate
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
