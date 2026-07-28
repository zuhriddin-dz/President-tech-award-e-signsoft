import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { TopNav } from '@/components/shell/top-nav';
import type { GetStartedStep } from '@/components/shell/get-started';
import { loadMe, loadRequests, loadTemplates } from '@/lib/queries';

/** Free trial length, in days, from workspace creation. */
const TRIAL_DAYS = 14;

/**
 * The signed-in product shell. Everything under (app) gets the same chrome:
 * one 64px nav bar and nothing else. A caller with no workspace yet never
 * reaches a page — they land on the account choice first.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  if (me.status === 'onboarding') redirect('/welcome');

  const [templates, requests, user] = await Promise.all([
    loadTemplates(),
    loadRequests(),
    currentUser(),
  ]);

  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const steps: GetStartedStep[] = [
    {
      key: 'workspace',
      label: 'Set up your workspace',
      cta: 'Set up',
      href: '/welcome',
      done: tenant !== null,
    },
    {
      key: 'upload',
      label: 'Upload a document',
      cta: 'Upload',
      href: '/templates?new=1',
      done: templates.length > 0,
    },
    {
      key: 'send',
      label: 'Send a packet for signature',
      cta: 'Send',
      href: '/templates',
      done: requests.length > 0,
    },
    {
      key: 'signed',
      label: 'Get your first signature',
      cta: 'View packets',
      href: '/agreements?view=sent',
      done: requests.some((r) => r.status === 'completed'),
    },
    {
      key: 'photo',
      label: 'Add your photo',
      cta: 'Add',
      href: '/account',
      done: Boolean(user?.hasImage),
    },
  ];

  const daysLeft = tenant
    ? Math.max(
        0,
        TRIAL_DAYS - Math.floor((Date.now() - new Date(tenant.createdAt).getTime()) / 86_400_000),
      )
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav trialDaysLeft={daysLeft} steps={steps} />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
