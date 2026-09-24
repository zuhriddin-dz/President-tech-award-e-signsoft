import Link from 'next/link';
import { Check, CircleAlert, Download, FileCheck2, Lock } from 'lucide-react';
import {
  accessLocked,
  API_PATHS,
  PLAN_PRICE_TIYIN,
  TRIAL_DAYS,
  type BillingPlan,
  type Payment,
  type SignatureRequest,
  type TenantAccess,
} from '@docflow/contracts';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { formatSum } from '@/lib/money';
import { loadMe, loadPayments, loadRequests } from '@/lib/queries';
import { CheckoutButtons } from './checkout-button';

/**
 * Plans, and where this workspace stands.
 *
 * One page, two doors: /billing, reached by choice, and EVERY dashboard URL
 * once a workspace's time has run out — the shell renders this in place of the
 * page that was asked for. The second door is why it lists signed documents:
 * they stay the customer's after the trial, and with the rest of the product
 * closed this is the one place left to get them.
 *
 * Payment is taken by Payme or Click on their own pages. Nothing here ever
 * touches a card number, which is also why the buy control is two provider
 * buttons rather than a form.
 */
interface Plan {
  /** Set for a plan that can be bought; absent for "talk to us". */
  id?: BillingPlan;
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  highlight?: boolean;
  features: readonly string[];
}

const PLANS: readonly Plan[] = [
  {
    id: 'personal',
    name: 'Personal',
    price: formatSum(PLAN_PRICE_TIYIN.personal),
    cadence: 'per month',
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
    id: 'company',
    name: 'Company',
    price: formatSum(PLAN_PRICE_TIYIN.company),
    cadence: 'per month',
    blurb: 'A shared workspace with a real audit trail. One price, any number of people.',
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
  const [me, requests, payments] = await Promise.all([loadMe(), loadRequests(), loadPayments()]);
  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const access = tenant?.access ?? null;
  const locked = access ? accessLocked(access) : false;
  const live = requests.filter((r) => !r.deletedAt);
  const signed = live.filter((r) => r.status === 'completed');

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">{headingFor(access)}</h1>
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
            {p.id ? (
              <CheckoutButtons plan={p.id} highlight={p.highlight} />
            ) : (
              <Link href="/help" className="mt-6 block">
                <Button variant="secondary" className="w-full">
                  Get in touch
                </Button>
              </Link>
            )}
          </Card>
        ))}
      </div>

      <PaymentHistory payments={payments} />
    </div>
  );
}

function headingFor(access: TenantAccess | null): string {
  if (access?.state === 'ended') return 'Your free trial has ended';
  if (access?.state === 'lapsed') return 'Your subscription has ended';
  return 'Plan and billing';
}

/** Where the workspace stands, in one sentence — decided by the API, not here. */
function StatusBanner({ access }: { access: TenantAccess }) {
  const trialEnds = DAY_FORMAT.format(new Date(access.trialEndsAt));
  const paidUntil = access.paidUntil ? DAY_FORMAT.format(new Date(access.paidUntil)) : null;

  if (access.state === 'pro') {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-5 py-4">
        <Check className="h-5 w-5 shrink-0 text-success" />
        <p className="text-[15px] text-ink">
          {paidUntil ? (
            <>
              This workspace is paid up to <strong>{paidUntil}</strong>
              {access.daysLeft > 0 && <> — {access.daysLeft} days left</>}. Renewal is manual, so
              pay again below before that date to keep it running.
            </>
          ) : (
            <>This workspace is on a paid plan.</>
          )}
        </p>
      </div>
    );
  }

  if (access.state === 'lapsed') {
    return (
      <div className="mt-5 flex gap-3 rounded-lg border border-danger bg-danger-soft px-5 py-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <p className="text-[15px] text-ink">
          Your subscription ran out on <strong>{paidUntil}</strong>. Sending, uploading and editing
          are paused until it is renewed. Documents you already sent can still be signed, and
          everything already signed stays yours to download below.
        </p>
      </div>
    );
  }

  if (access.state === 'ended') {
    return (
      <div className="mt-5 flex gap-3 rounded-lg border border-danger bg-danger-soft px-5 py-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <p className="text-[15px] text-ink">
          Your {TRIAL_DAYS}-day free trial ended on <strong>{trialEnds}</strong>. Sending, uploading
          and editing are paused until this workspace is on a paid plan. Documents you already sent
          can still be signed, and everything already signed stays yours to download below.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-brand-soft px-5 py-4">
      <CircleAlert className="h-5 w-5 shrink-0 text-brand-link" />
      <p className="text-[15px] text-ink">
        Your free trial ends in <strong>{access.daysLeft}</strong> day
        {access.daysLeft === 1 ? '' : 's'}, on {trialEnds}.
      </p>
    </div>
  );
}

/**
 * What has been paid, and what each payment bought. Abandoned checkouts are
 * left out: a `pending` row is someone who opened a payment page and closed
 * it, which is not a fact worth putting in front of them as if it were a bill.
 */
function PaymentHistory({ payments }: { payments: Payment[] }) {
  const settled = payments.filter((p) => p.status !== 'pending');
  if (settled.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader title="Payments" />
      <div className="px-6 pb-6">
        <ul className="divide-y divide-border">
          {settled.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="font-medium text-ink">{formatSum(p.amountTiyin)}</span>
              <span className="text-ink-muted capitalize">
                {p.plan} · {p.provider}
              </span>
              <span className="ml-auto text-ink-muted">
                {p.status === 'cancelled' ? (
                  <span className="text-danger">Refunded</span>
                ) : (
                  <>
                    Paid {p.paidAt && DAY_FORMAT.format(new Date(p.paidAt))}
                    {p.periodEnd && <> · covers to {DAY_FORMAT.format(new Date(p.periodEnd))}</>}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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
