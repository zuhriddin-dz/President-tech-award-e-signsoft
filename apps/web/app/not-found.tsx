import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/primitives';

/**
 * 404 for the product. Next's default is an unstyled black-on-white line that
 * looks like the site has fallen over, which is worse than the missing page.
 *
 * Note this route is ALSO what a signed-out visitor gets on a protected page:
 * clerkMiddleware's auth.protect() answers with 404 rather than a redirect, so
 * someone following a stale link to /agreements lands here rather than at a
 * sign-in prompt. Hence both routes below — "go to your documents" for a
 * signed-in user who mistyped, "sign in" for the one who is simply logged out.
 * Saying which case applies would mean telling an anonymous caller whether a
 * given page exists, which is the thing auth.protect() is hiding.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <Mark />
            <span className="text-xl font-bold tracking-tight text-ink">E-SIGNSOFT</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-brand-soft text-brand">
          <FileQuestion className="h-7 w-7" />
        </span>
        <p className="text-sm font-semibold tracking-wide text-ink-faint uppercase">Error 404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          We couldn&apos;t find that page
        </h1>
        <p className="max-w-md text-ink-muted">
          The link may be out of date, or the page may have moved. If you were opening a document,
          check the most recent email — a fresh link replaces the one before it.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/home">
            <Button variant="primary">Go to your documents</Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
