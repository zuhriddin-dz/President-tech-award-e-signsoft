import Link from 'next/link';
import { BookOpen, LifeBuoy, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/primitives';

/**
 * Help. Written as answers to the questions this product actually generates —
 * mostly "why did that link stop working", which has a real and slightly
 * surprising answer that is worth stating plainly.
 */
const TOPICS = [
  {
    q: 'Someone says their signing link does not work',
    a: 'A link stops working the moment it is used, cancelled, re-issued, or the packet expires. Only the hash is stored, so a reminder cannot repeat the original URL — sending a reminder issues a fresh link and retires the old one. Open the packet and use Resend; the newest email is always the one that works.',
  },
  {
    q: 'The first person has not signed and everyone else is stuck',
    a: 'In "one after another" order, each person is invited only once the person above them finishes. Open the packet and use Remind, or Resend to issue a fresh link. If it is not going to happen, Cancel — everyone outstanding is told and every link dies.',
  },
  {
    q: 'Can I change a document after sending it?',
    a: 'No. The document and its field layout are snapshotted at send time, so later edits to the template never alter a packet already in flight. That is what makes the sealed copy mean something. Cancel and send again.',
  },
  {
    q: 'How do I prove a signed document has not been altered?',
    a: 'Open the packet and use Verify. The server re-reads the stored file, re-hashes it, and checks the Ed25519 seal bound to that packet and its completion time. Both must pass. A single changed byte fails it.',
  },
  {
    q: 'Does the signer need an account?',
    a: 'No. They open their link, agree to sign electronically, fill their fields, and finish. We record when they opened it, when they agreed, when they signed, and from which address.',
  },
  {
    q: 'Deleting a packet',
    a: 'Delete only hides it from your views. The signed copy and the audit trail are evidence and are always kept — you can restore it from the Deleted tab.',
  },
] as const;

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">Help</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        The questions this product actually generates, answered honestly.
      </p>

      <Card className="mt-6">
        <CardHeader title="Common questions" />
        <dl className="divide-y divide-border px-6 pb-2">
          {TOPICS.map((t) => (
            <div key={t.q} className="py-4">
              <dt className="font-semibold text-ink">{t.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-ink-muted">{t.a}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {(
          [
            [
              <BookOpen key="i" className="h-5 w-5" />,
              'Getting started',
              'Upload a document, place fields, send it. The checklist in the top bar walks you through it.',
              '/templates?new=1',
              'Upload a document',
            ],
            [
              <ShieldCheck key="i" className="h-5 w-5" />,
              'How your data is isolated',
              'Workspace separation is enforced by the database itself, not by application code.',
              '/admin',
              'See the details',
            ],
            [
              <LifeBuoy key="i" className="h-5 w-5" />,
              'Still stuck',
              'Email us with the packet reference from its detail page and we can trace exactly what happened.',
              'mailto:support@docflow.app',
              'support@docflow.app',
            ],
          ] as const
        ).map(([icon, title, body, href, cta]) => (
          <Card key={title} className="flex flex-col p-5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand-link">
              {icon}
            </span>
            <h2 className="mt-3 font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 flex-1 text-sm text-ink-muted">{body}</p>
            <Link
              href={href}
              className="mt-3 text-sm font-semibold text-brand-link hover:underline"
            >
              {cta}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
