/**
 * Route-level loading UI for the signing app.
 *
 * Self-contained rather than importing the product's spinner: this app shares
 * no component code with apps/web on purpose, so that a change over there
 * cannot alter what a stranger is shown while a document resolves.
 */
export default function Loading() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
      <span role="status" className="inline-flex items-center text-brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.18" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span className="sr-only">Loading document</span>
      </span>
      <p className="text-sm text-ink-muted" aria-hidden="true">
        Loading document…
      </p>
    </main>
  );
}
