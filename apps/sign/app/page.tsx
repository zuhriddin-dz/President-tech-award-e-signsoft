/** The signing app only serves /sign/<token> links. A bare visit gets nothing useful. */
export default function Index() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-semibold text-ink">eSignSoft signing</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Open the secure link from your email to review and sign a document.
      </p>
    </div>
  );
}
