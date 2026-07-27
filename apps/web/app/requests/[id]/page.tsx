import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { API_PATHS, SignatureRequestDetailSchema } from '@docflow/contracts';
import type { SignatureRequestDetail } from '@docflow/contracts';
import { apiGetOrOnboarding } from '@/lib/api';
import { VerifyPanel } from './verify-panel';

/**
 * Request detail — the sender's evidence view, laid out like the Certificate of
 * Completion it mirrors: what was sent, the ceremony timeline with the signer's
 * network details, and the tamper evidence. Everything here is DISPLAY; the
 * only actions are download and verify.
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-ink-muted hover:text-ink">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{r.documentName}</h1>
          <StatusPill status={r.status} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">Reference {r.id}</p>
      </div>

      {r.status === 'completed' && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api${API_PATHS.signatureRequests}/${r.id}/signed`}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              r.hasSignedPdf
                ? 'bg-brand text-brand-ink hover:opacity-90'
                : 'pointer-events-none bg-surface-muted text-ink-muted'
            }`}
          >
            {r.hasSignedPdf ? 'Download signed document' : 'Preparing signed copy…'}
          </a>
          {r.hasCertificate && (
            <a
              href={`/api${API_PATHS.signatureRequests}/${r.id}/certificate`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
            >
              Certificate of Completion
            </a>
          )}
        </div>
      )}

      <Section title="Document">
        <Row label="Document" value={r.documentName} />
        <Row label="Sent by" value={r.senderEmail ?? '—'} />
      </Section>

      <Section title={r.recipients.length > 1 ? 'Recipients' : 'Signer'}>
        {r.recipients.length > 0 ? (
          r.recipients.map((p) => (
            <Row
              key={p.id}
              label={
                r.routingMode === 'sequential' ? `Step ${p.routingOrder}` : roleLabel(p.role)
              }
              value={p.name ? `${p.name} · ${p.email}` : p.email}
              sub={[
                p.status,
                p.completedAt ? `signed ${fmt(p.completedAt)}` : null,
                p.signerIp ? `from ${p.signerIp}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))
        ) : (
          <>
            <Row label="Name" value={r.recipientName ?? '—'} />
            <Row label="Email" value={r.recipientEmail} />
          </>
        )}
        <Row label="Signature method" value={methodLabel(r.signatureMethod)} />
      </Section>

      <Section title="Ceremony timeline">
        <Row label="Sent" value={fmt(r.sentAt)} />
        <Row label="First opened" value={fmt(r.viewedAt)} sub={r.viewedIp ? `from ${r.viewedIp}` : undefined} />
        <Row label="Consent to sign electronically" value={fmt(r.consentAt)} />
        <Row label="Signed" value={fmt(r.completedAt)} sub={r.signerIp ? `from ${r.signerIp}` : undefined} />
        <Row label="Expires" value={fmt(r.expiresAt)} />
        {r.signerUserAgent && <Row label="Browser" value={r.signerUserAgent} mono />}
      </Section>

      {r.status === 'completed' && <VerifyPanel requestId={r.id} detail={r} />}
    </div>
  );
}

function roleLabel(role: string): string {
  return role === 'cc' ? 'Receives a copy' : 'Signer';
}

function methodLabel(method: string | null): string {
  switch (method) {
    case 'typed':
      return 'Typed signature';
    case 'drawn':
      return 'Drawn signature';
    case 'uploaded':
      return 'Uploaded signature image';
    default:
      return '—';
  }
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
      </div>
      <dl className="divide-y divide-border">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 px-5 py-2.5">
      <dt className="w-56 shrink-0 text-sm text-ink-muted">{label}</dt>
      <dd className={`min-w-0 flex-1 break-all text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
        {sub && <span className="ml-2 text-xs text-ink-muted">{sub}</span>}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: SignatureRequestDetail['status'] }) {
  const styles: Record<SignatureRequestDetail['status'], string> = {
    sent: 'bg-brand/10 text-brand',
    viewed: 'bg-warning/10 text-warning',
    completed: 'bg-success/10 text-success',
    voided: 'bg-ink/10 text-ink-muted',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
