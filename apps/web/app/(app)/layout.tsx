import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { accessLocked } from '@docflow/contracts';
import { GetPro } from '@/components/billing/get-pro';
import { TopNav } from '@/components/shell/top-nav';
import type { GetStartedStep } from '@/components/shell/get-started';
import { loadMe, loadRequests, loadTemplates } from '@/lib/queries';

/**
 * Pages that stay reachable once a trial has ended: the way to pay, the way to
 * ask for help, and the person's own account. Every other page shows Get Pro.
 */
const OPEN_WHEN_LOCKED = ['/billing', '/help', '/account'];

/**
 * The signed-in product shell. Everything under (app) gets the same chrome:
 * one 64px nav bar and nothing else. A caller with no workspace yet never
 * reaches a page — they land on the account choice first.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  if (me.status === 'onboarding') redirect('/welcome');

  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const access = tenant?.access ?? null;

  // Time over — the free trial ran out, or a paid month did — so every page in
  // the product becomes the Get Pro page, whatever URL was asked for, except
  // the few a locked customer still needs. The API already refuses the work
  // itself (402 TRIAL_ENDED); this is only so the screen says WHY, instead of
  // showing a dashboard full of failed loads.
  if (access && accessLocked(access)) {
    const path = (await headers()).get('x-pathname') ?? '';
    const open = OPEN_WHEN_LOCKED.some((p) => path === p || path.startsWith(`${p}/`));
    return (
      <div className="flex min-h-screen flex-col">
        <TopNav trialDaysLeft={null} steps={[]} locked />
        <main className="min-h-0 flex-1">{open ? children : <GetPro />}</main>
      </div>
    );
  }

  const [templates, requests, user] = await Promise.all([
    loadTemplates(),
    loadRequests(),
    currentUser(),
  ]);

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
      label: 'Send a document for signature',
      cta: 'Send',
      href: '/templates',
      done: requests.length > 0,
    },
    {
      key: 'signed',
      label: 'Get your first signature',
      cta: 'View documents',
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

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        trialDaysLeft={access?.state === 'trial' ? access.daysLeft : null}
        steps={steps}
        pro={access?.state === 'pro'}
      />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
