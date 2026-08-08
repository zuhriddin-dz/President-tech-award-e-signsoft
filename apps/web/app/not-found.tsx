import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/primitives';

/**
 * 404 for the product. Next's default is an unstyled black-on-white line that
 * looks like the site has fallen over, which is worse than the missing page.
 *
 * The mark leads and the status code is not shown: "Error 404" tells a visitor
 * nothing they can act on, and a page that opens with an error code reads as a
 * broken system rather than a wrong address. The logo says where they are; the
 * sentence says what happened; the buttons say what to do next.
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-6 py-20 text-center">
      <Link href="/" className="flex flex-col items-center gap-3" aria-label="E-SIGNSOFT home">
        <Mark size={64} />
        <span className="text-3xl font-bold tracking-tight text-ink">E-SIGNSOFT</span>
      </Link>

      <h1 className="mt-2 text-xl font-semibold text-ink">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-ink-muted">
        The link may be out of date, or the page may have moved. If you were opening a document,
        check the most recent email — a fresh link replaces the one before it.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <Link href="/home">
          <Button variant="primary" className="bg-brand-link hover:bg-brand-hover">
            Go to your documents
          </Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
