'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Check, ChevronDown, CircleHelp, ListChecks } from 'lucide-react';
import { Button, ProgressBar } from '@/components/ui/primitives';
import { Logo } from '@/components/brand/logo';
import type { GetStartedStep } from './get-started';

/**
 * The product-wide chrome: brand, primary sections, plan state, utilities,
 * account. Section links carry a persistent underline for the active area so
 * "where am I" never depends on colour alone.
 *
 * Onboarding progress lives INSIDE the checklist pill here rather than in a
 * band across the top of every page. The band cost ~52px on every screen in
 * the product to show a number that stops changing after the first week.
 */
const SECTIONS = [
  { href: '/home', label: 'Home' },
  { href: '/agreements', label: 'Packets' },
  { href: '/templates', label: 'Templates' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Admin' },
] as const;

export function TopNav({
  trialDaysLeft,
  steps,
}: {
  trialDaysLeft: number | null;
  steps: GetStartedStep[];
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 items-center gap-6 px-6">
        <Link href="/home" className="flex shrink-0 items-center">
          <Logo size={30} />
        </Link>

        <nav className="flex h-full min-w-0 flex-1 items-stretch gap-1">
          {SECTIONS.map((s) => {
            // /agreements/anything still lights up Packets.
            const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center px-4 text-[15px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-1 rounded-t-full bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {trialDaysLeft !== null && (
            <span className="hidden text-sm font-medium text-ink lg:inline">
              {trialDaysLeft} {trialDaysLeft === 1 ? 'Day' : 'Days'} Left
            </span>
          )}
          <Link href="/billing">
            <Button variant="dark" size="md" className="rounded-full px-5">
              Buy Now
            </Button>
          </Link>

          <SetupPill steps={steps} />

          <a
            href="/help"
            aria-label="Help"
            className="rounded-md p-1.5 text-ink transition-colors hover:bg-surface-sunken"
          >
            <CircleHelp className="h-5 w-5" />
          </a>
          <UserButton appearance={{ elements: { avatarBox: { width: 36, height: 36 } } }} />
        </div>
      </div>
    </header>
  );
}

/**
 * The onboarding checklist, as a pill. Shows how far along you are and what is
 * next; disappears entirely once everything is done, rather than sitting there
 * saying 5/5 forever.
 */
function SetupPill({ steps }: { steps: GetStartedStep[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
      >
        <ListChecks className="h-4 w-4" />
        <span className="hidden sm:inline">
          {done}/{steps.length}
        </span>
        <span className="hidden text-ink-muted xl:inline">· {next.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <div className="border-b border-border px-5 py-4">
            <p className="font-semibold text-ink">Get started</p>
            <ProgressBar value={done} max={steps.length} className="mt-2" />
            <p className="mt-2 text-sm text-ink-muted">
              {done} of {steps.length} done
            </p>
          </div>
          <ol className="py-1">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-sunken"
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                      s.done ? 'bg-success text-white' : 'border-2 border-border-strong'
                    }`}
                  >
                    {s.done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 text-sm ${s.done ? 'text-ink-muted line-through' : 'text-ink'}`}
                  >
                    {s.label}
                  </span>
                  {!s.done && (
                    <span className="text-xs font-semibold text-brand-link">{s.cta}</span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
