import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download, FileCheck2 } from 'lucide-react';
import { API_PATHS, SignatureRequestDetailSchema } from '@docflow/contracts';
import type { Recipient, SignatureRequestDetail } from '@docflow/contracts';
import { Button, StatusChip } from '@/components/ui/primitives';
import { apiGetOrOnboarding } from '@/lib/api';
import { auditStamp } from '@/lib/format';
import { statusView } from '@/lib/status';
import { VerifyPanel } from './verify-panel';
import { PacketActions } from './packet-actions';

/**
 * Request detail — the sender's evidence view, laid out as the Certificate of
 * Completion it mirrors: envelope header, per-role event tables, and a summary
 * of what the system did and when. Everything here is DISPLAY; the only
 * actions are download, verify, and the lifecycle controls.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await apiGetOrOnboarding(
    `${API_PATHS.signatureRequests}/${id}`,
    SignatureRequestDetailSchema,
  );
  if (result.status === 'onboarding') redirect('/welcome');
  if (result.status !== 'ok') notFound();
  const r = result.data;
  const sv = statusView(r.status);

  const signers = r.recipients.filter((p) => p.role === 'signer');
  const copies = r.recipients.filter((p) => p.role === 'cc');

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/agreements?view=sent" className="text-sm text-ink-muted hover:text-ink">
            ← Packets
          </Link>
          <h1 className="mt-1.5 truncate text-3xl font-semibold text-ink">{r.documentName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone={sv.tone} label={sv.label} icon={sv.icon} />
          {r.status === 'completed' && (
            <>
              <a href={`/api${API_PATHS.signatureRequests}/${r.id}/signed`} download>
                <Button variant="dark" disabled={!r.hasSignedPdf}>
                  <Download className="h-4 w-4" />
                  {r.hasSignedPdf ? 'Download signed document' : 'Preparing…'}
                </Button>
              </a>
              {r.hasCertificate && (
                <a href={`/api${API_PATHS.signatureRequests}/${r.id}/certificate`} download>
                  <Button variant="secondary">
                    <FileCheck2 className="h-4 w-4" />
                    Certificate of Completion
                  </Button>
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* The certificate proper — dense and printable, because this is the
          artefact someone forwards to a lawyer. */}
      <article className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
        <header className="flex items-center justify-between border-b-4 border-brand px-6 py-4">
          <h2 className="text-lg font-bold text-ink">Certificate of Completion</h2>
          <span className="text-sm font-semibold text-brand">E-SIGNSOFT</span>
        </header>

        <Band>Document</Band>
        <div className="grid grid-cols-1 gap-x-10 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Facts
            rows={[
              ['Document Id', r.id],
              ['Subject', r.documentName],
              ['Status', sv.label],
              [
                'Routing',
                r.routingMode === 'sequential' ? 'One after another' : 'Everyone at once',
              ],
            ]}
          />
          <Facts
            rows={[
              ['Signers', String(signers.length)],
              ['Signed', `${r.signedCount} of ${r.signerCount}`],
              ['Copies to', String(copies.length)],
              ['Expires', auditStamp(r.expiresAt)],
            ]}
          />
          <Facts
            rows={[
              ['Sent by', r.senderEmail ?? '—'],
              ['Time Zone', 'UTC (all timestamps below)'],
              ['Tamper seal', r.sealKid ? `Ed25519 · ${r.sealKid}` : 'Pending'],
            ]}
          />
        </div>

        <Band>Record Tracking</Band>
        <div className="px-6 py-4">
          <Facts
            rows={[
              ['Status', 'Original'],
              ['Holder', r.senderEmail ?? '—'],
              ['Location', 'E-SIGNSOFT'],
              ['Created', auditStamp(r.sentAt)],
            ]}
          />
        </div>

        <Band>Signer Events</Band>
        {signers.length === 0 ? (
          <Empty>No signers on this packet.</Empty>
        ) : (
          <div className="divide-y divide-border">
            {signers.map((p) => (
              <SignerRow key={p.id} requestId={r.id} person={p} detail={r} />
            ))}
          </div>
        )}

        <Band>Copy Recipient Events</Band>
        {copies.length === 0 ? (
          <Empty>Nobody was copied on this packet.</Empty>
        ) : (
          <div className="divide-y divide-border">
            {copies.map((p) => (
              <div key={p.id} className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-3">
                <div>
                  <p className="font-semibold text-ink">{p.name ?? p.email}</p>
                  <p className="text-sm text-ink-muted">{p.email}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Security Level: Email, no account required
                  </p>
                </div>
                <div className="flex items-start">
                  <span className="rounded border-2 border-info px-3 py-1 text-sm font-bold tracking-wider text-info">
                    COPIED
                  </span>
                </div>
                <Facts rows={[['Sent', auditStamp(p.sentAt ?? r.sentAt)]]} />
              </div>
            ))}
          </div>
        )}

        <Band>Document Summary Events</Band>
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="pb-2 font-medium">Event</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {(
                [
                  ['Document Sent', 'Hashed / Encrypted', r.sentAt],
                  ['Certified Delivered', 'Security Checked', r.viewedAt],
                  ['Consent Recorded', 'Security Checked', r.consentAt],
                  ['Signing Complete', 'Security Checked', r.completedAt],
                ] as const
              ).map(([event, status, when]) => (
                <tr key={event} className="border-t border-border">
                  <td className="py-2">{event}</td>
                  <td className="py-2 text-ink-muted">{when ? status : '—'}</td>
                  <td className="py-2 font-mono text-xs">{auditStamp(when)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Band>Electronic Record and Signature Disclosure</Band>
        <div className="px-6 py-4 text-sm leading-relaxed text-ink-muted">
          <p>
            Each signer was shown the document before signing and had to affirmatively agree to sign
            electronically before any field could be filled. The time they opened the link, the time
            they agreed, the time they signed, and the network address they used are recorded above.
          </p>
          <p className="mt-3">
            The completed document is fingerprinted with SHA-256 and sealed with an Ed25519
            signature bound to this packet and its completion time. Any change to the file,
            however small, makes verification fail.
          </p>
          {r.documentHash && (
            <p className="mt-3 font-mono text-xs break-all text-ink">SHA-256 {r.documentHash}</p>
          )}
        </div>
      </article>

      <div className="mt-6 flex flex-col gap-6">
        <PacketActions detail={r} />
        {r.status === 'completed' && <VerifyPanel requestId={r.id} detail={r} />}
      </div>
    </div>
  );
}

/** Per-signer block: who they are, their mark, and the timestamps that matter. */
function SignerRow({
  requestId,
  person,
  detail,
}: {
  requestId: string;
  person: Recipient;
  detail: SignatureRequestDetail;
}) {
  const signed = person.status === 'completed';
  return (
    <div className="grid grid-cols-1 gap-6 px-6 py-5 sm:grid-cols-3">
      <div>
        <p className="font-semibold text-ink">{person.name ?? person.email}</p>
        <p className="text-sm text-ink-muted">{person.email}</p>
        {detail.routingMode === 'sequential' && (
          <p className="mt-1 text-xs text-ink-muted">Step {person.routingOrder}</p>
        )}
        <p className="mt-1.5 text-xs text-ink-muted">
          Security Level: Email, single-use link (no account required)
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Signature Adoption: {methodLabel(detail.signatureMethod)}
        </p>
      </div>

      <div>
        {signed ? (
          <figure className="inline-block rounded border border-border-strong bg-surface px-3 py-2">
            <figcaption className="text-[10px] text-ink-muted">Signed by:</figcaption>
            {/* Streamed through the BFF. If the artefact was never stored this
                shows the browser's broken-image state, which is honest. */}
            <img
              src={`/api${API_PATHS.signatureRequests}/${requestId}/recipients/${person.id}/signature`}
              alt={`Signature of ${person.name ?? person.email}`}
              className="h-12 max-w-[220px] object-contain"
            />
            <figcaption className="font-mono text-[10px] tracking-wider text-ink-muted uppercase">
              {person.id.replaceAll('-', '').slice(0, 16)}…
            </figcaption>
          </figure>
        ) : (
          <span className="inline-block rounded border-2 border-border-strong px-3 py-1 text-sm font-bold tracking-wider text-ink-muted">
            {person.status === 'pending' ? 'NOT YET INVITED' : 'AWAITING SIGNATURE'}
          </span>
        )}
      </div>

      <Facts
        rows={[
          ['Sent', auditStamp(person.sentAt)],
          ['Viewed', auditStamp(person.viewedAt)],
          ['Signed', auditStamp(person.completedAt)],
          ['Using IP', person.signerIp ?? '—'],
        ]}
      />
    </div>
  );
}

function methodLabel(method: string | null): string {
  switch (method) {
    case 'typed':
      return 'Pre-selected style (typed)';
    case 'drawn':
      return 'Drawn';
    case 'uploaded':
      return 'Uploaded image';
    default:
      return '—';
  }
}

function Band({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-y border-border bg-surface-sunken px-6 py-2 text-sm font-bold text-ink">
      {children}
    </h3>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-4 text-sm text-ink-muted">{children}</p>;
}

function Facts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 py-1">
          <dt className="w-40 shrink-0 text-ink-muted">{label}</dt>
          <dd className="min-w-0 flex-1 break-all text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
