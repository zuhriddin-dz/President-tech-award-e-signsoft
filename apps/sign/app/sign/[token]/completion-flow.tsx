'use client';

import { useState } from 'react';
import { CircleCheck, Download, FileCheck, Loader2, Printer, X } from 'lucide-react';

/**
 * What happens after Finish — DocuSign's post-signing sequence, which is the
 * moment a signer is most willing to keep a copy and open an account.
 *
 * Deliberately NOT included: a form that emails this document to an address
 * the visitor types. This page is reachable by anyone holding the link, and
 * such a form would be an open mail relay sending attacker-chosen recipients
 * a real document from our domain. Every party on the agreement is already
 * emailed their copy automatically by the server.
 */
export function CompletionFlow({
  token,
  documentName,
  signerEmail,
  artifactsReady,
}: {
  token: string;
  documentName: string;
  signerEmail: string;
  artifactsReady: boolean;
}) {
  const [stage, setStage] = useState<'timeline' | 'account' | 'closed'>('timeline');

  const signedUrl = `/relay/${encodeURIComponent(token)}/signed`;
  const certUrl = `/relay/${encodeURIComponent(token)}/certificate`;
  // The signing app holds no credentials, so account creation happens on the
  // product itself. We hand over only the address we already verified.
  const signUpUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'}/sign-up?email=${encodeURIComponent(signerEmail)}`;

  if (stage === 'closed') {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <CircleCheck className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-2xl font-semibold text-ink">You&apos;re all done</h1>
          <p className="mt-2 text-sm text-ink-muted">
            A copy of <strong className="text-ink">{documentName}</strong> and its Certificate of
            Completion are on their way to{' '}
            <span className="font-medium text-ink">{signerEmail}</span>.
          </p>
          <Downloads ready={artifactsReady} signedUrl={signedUrl} certUrl={certUrl} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-darkest/40 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-2xl">
        <div className="flex justify-end px-5 pt-4">
          <button
            type="button"
            onClick={() => setStage('closed')}
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {stage === 'timeline' ? (
          <div className="grid grid-cols-1 gap-10 px-10 pt-2 pb-10 md:grid-cols-2">
            <div>
              <h1 className="mb-7 text-2xl font-semibold text-ink">
                Securely manage agreements with just one more step
              </h1>
              <ol className="relative flex flex-col gap-8 border-l-2 border-border pl-6">
                <Step title="You received a request to sign" done />
                <Step title="You signed" body="Sender has been notified" done />
                <Step
                  title="Completed"
                  body="All parties received a completed copy."
                  done
                  current
                />
              </ol>
              <button
                type="button"
                onClick={() => setStage('account')}
                className="mt-6 text-sm font-semibold text-brand hover:underline"
              >
                Save a Copy
              </button>
            </div>

            <div className="flex flex-col justify-center border-t border-border pt-8 md:border-t-0 md:border-l md:pt-0 md:pl-10">
              <h2 className="text-2xl font-semibold text-ink">Finish setting up your free account</h2>
              <p className="mt-3 text-[15px] font-medium text-ink">{signerEmail}</p>
              <p className="mt-3 text-sm text-ink-muted">
                Keep every agreement you sign in one place, and send your own — free to start.
              </p>
              <a
                href={signUpUrl}
                className="mt-6 inline-flex items-center justify-center rounded-md bg-brand-deep px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-darkest"
              >
                Create your free account
              </a>
              <button
                type="button"
                onClick={() => setStage('account')}
                className="mt-3 inline-flex items-center justify-center rounded-md bg-surface-sunken px-6 py-3 text-sm font-semibold text-ink hover:bg-border"
              >
                No Thanks
              </button>
              <p className="mt-4 text-xs text-ink-muted">
                We never ask for a password on this page. Account setup happens on DocFlow itself.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 px-10 pt-2 pb-10 md:grid-cols-[1fr_260px]">
            <div>
              <h1 className="text-2xl font-semibold text-ink">
                Access the most recent copy anytime in a free account
              </h1>
              <p className="mt-3 text-[15px] font-medium text-ink">{signerEmail}</p>
              <p className="mt-3 text-sm text-ink-muted">
                Your signed copy of <strong className="text-ink">{documentName}</strong> and its
                Certificate of Completion have already been emailed to every party. An account
                keeps them all together and lets you check any signature is still intact.
              </p>
              <a
                href={signUpUrl}
                className="mt-6 inline-flex items-center justify-center rounded-md bg-brand-deep px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-darkest"
              >
                Create your free account
              </a>
              <button
                type="button"
                onClick={() => setStage('closed')}
                className="mt-3 ml-0 inline-flex items-center justify-center rounded-md bg-surface-sunken px-6 py-3 text-sm font-semibold text-ink hover:bg-border md:ml-3"
              >
                No Thanks
              </button>
            </div>

            <div className="border-t border-border pt-8 md:border-t-0 md:border-l md:pt-0 md:pl-8">
              <h2 className="text-xl font-semibold text-ink">Save as a PDF</h2>
              <Downloads ready={artifactsReady} signedUrl={signedUrl} certUrl={certUrl} compact />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Downloads({
  ready,
  signedUrl,
  certUrl,
  compact = false,
}: {
  ready: boolean;
  signedUrl: string;
  certUrl: string;
  compact?: boolean;
}) {
  if (!ready) {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your signed copy…
      </p>
    );
  }
  return (
    <div className={`flex flex-col gap-2 ${compact ? 'mt-4' : 'mt-6'}`}>
      <a
        href={signedUrl}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-hover"
      >
        <Download className="h-4 w-4" />
        Download signed document
      </a>
      <a
        href={certUrl}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border-strong px-5 py-3 text-sm font-semibold text-ink hover:bg-surface-muted"
      >
        <FileCheck className="h-4 w-4" />
        Certificate of Completion
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        <Printer className="h-4 w-4" />
        Print
      </button>
    </div>
  );
}

function Step({
  title,
  body,
  done,
  current = false,
}: {
  title: string;
  body?: string;
  done: boolean;
  current?: boolean;
}) {
  return (
    <li className="relative">
      <span
        className={`absolute top-0.5 -left-[31px] h-4 w-4 rounded-full ring-4 ring-surface ${
          current ? 'bg-success' : done ? 'bg-border-strong' : 'bg-border'
        }`}
      />
      <p className={`font-semibold ${current ? 'text-ink' : 'text-ink'}`}>{title}</p>
      {body && <p className="mt-0.5 text-sm text-ink-muted">{body}</p>}
    </li>
  );
}
