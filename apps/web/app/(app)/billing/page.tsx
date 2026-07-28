import Link from 'next/link';
import { Check, CircleAlert } from 'lucide-react';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { loadMe, loadRequests } from '@/lib/queries';

const TRIAL_DAYS = 14;

/**
 * Plans and billing.
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
      'Up to 5 signers per packet',
      'Sealed copy and Certificate of Completion on every packet',
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
      'Shared workspace — everyone sees the same packets',
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

export default async function BillingPage() {
  const [me, requests] = await Promise.all([loadMe(), loadRequests()]);
  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const daysLeft = tenant
    ? Math.max(
        0,
        TRIAL_DAYS - Math.floor((Date.now() - new Date(tenant.createdAt).getTime()) / 86_400_000),
      )
    : null;
  const sent = requests.filter((r) => !r.deletedAt).length;

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">Plan and billing</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {tenant?.kind === 'personal' ? 'Personal' : 'Company'} workspace · {sent} packet
        {sent === 1 ? '' : 's'} sent
      </p>

      {daysLeft !== null && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-brand-soft px-5 py-4">
          <CircleAlert className="h-5 w-5 shrink-0 text-brand-link" />
          <p className="text-[15px] text-ink">
            {daysLeft > 0 ? (
              <>
                Your trial ends in <strong>{daysLeft}</strong> day{daysLeft === 1 ? '' : 's'}.
              </>
            ) : (
              <>Your trial has ended.</>
            )}{' '}
            Nothing is switched off while billing is still being set up — your packets and signed
            copies stay exactly where they are.
          </p>
        </div>
      )}

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
            DocFlow has no payment processor connected, so there is no checkout to send you to and
            no card on file to charge. When billing opens you will be asked here, once, before
            anything is taken.
          </p>
          <p className="mt-3">
            In the meantime nothing is metered and nothing expires. If you need an invoice or a
            written commitment sooner,{' '}
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
