/**
 * The signing app's 404 — and the only page a failed signing link ever
 * reaches, whatever went wrong.
 *
 * DELIBERATELY UNINFORMATIVE. The API answers every /sign/* failure with the
 * same 404 so that a caller holding a guessed token cannot tell it apart from
 * one holding a real token that has expired. That property is worth nothing if
 * this page then explains which it was: "this link has expired" confirms the
 * token was real, and "invalid link" confirms it was not, which together turn
 * the page into an oracle for testing guesses.
 *
 * So the copy below covers every case at once — wrong, expired, already used,
 * cancelled, superseded by a resend — and names none of them. The remedy is
 * the same for all of them anyway: go back to the newest email, or ask the
 * sender. Nothing here is a dead end for a legitimate signer.
 *
 * No link back to the product either. This app is credential-poor by design
 * and reached by strangers; it should not become a navigation surface.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        This link isn&apos;t available
      </h1>
      <p className="text-ink-muted">
        Signing links are single-use and time-limited, and a new one replaces the last. Please open
        the most recent email you received.
      </p>
      <p className="text-sm text-ink-faint">
        If you no longer have it, ask the sender to resend the document.
      </p>
    </main>
  );
}
