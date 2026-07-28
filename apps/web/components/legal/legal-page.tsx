import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

/**
 * Shared shell + copy for the two legal pages, so the wording a signer reads
 * on the public signing app and the wording a sender reads in the product can
 * never drift apart. Deliberately short and specific: a policy nobody can
 * finish reading protects nobody.
 */
export interface LegalSection {
  heading: string;
  body: string[];
}

export const TERMS: LegalSection[] = [
  {
    heading: 'What E-SIGNSOFT does',
    body: [
      'E-SIGNSOFT lets you send a document for electronic signature, and gives every completed document a sealed copy plus a Certificate of Completion recording who signed, when, and from where.',
      'You are responsible for the content of what you send and for having the right to send it to the people you address it to.',
    ],
  },
  {
    heading: 'Electronic signatures',
    body: [
      'Signing electronically through E-SIGNSOFT is intended to create a binding signature under the US ESIGN Act and UETA, and equivalent regimes elsewhere. Before anyone can sign they are shown the Electronic Record and Signature Disclosure and must actively agree to it.',
      'Some documents cannot be signed electronically by law — wills, certain family-law and court filings, and some notices. It is your responsibility to know whether that applies to a document you send.',
    ],
  },
  {
    heading: 'Your documents',
    body: [
      'Your documents are yours. We store them so the service can work, and so the audit trail behind a signature remains provable. We do not sell them, and we do not use their contents to train models.',
      'Deleting a packet hides it from your views. The signed copy and its audit trail are retained as evidence — if you need them destroyed outright, ask us and we will do it and confirm.',
    ],
  },
  {
    heading: 'Availability and liability',
    body: [
      'The service is provided as-is while in beta. We do not promise uninterrupted availability, and our liability is limited to the amount you have paid us, which during the beta is nothing.',
      'Nothing here limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If we change these terms in a way that materially affects you, we will tell you before the change takes effect.',
    ],
  },
];

export const PRIVACY: LegalSection[] = [
  {
    heading: 'What we collect',
    body: [
      'Account details: your name, email address, and workspace. Sign-in itself is handled by our identity provider — E-SIGNSOFT never stores your password.',
      'Documents you upload and send, and the field values entered on them.',
      'Signing evidence: when a link was opened, when consent was given, when the document was signed, and the IP address and browser used at each step. This is the proof that makes a signature stand up, so it is recorded deliberately and shown on the Certificate of Completion.',
    ],
  },
  {
    heading: 'What we do not do',
    body: [
      'We do not sell your data. We do not use the contents of your documents to train models. We do not share documents with anyone outside your workspace, except the recipients you address them to.',
    ],
  },
  {
    heading: 'How your data is separated',
    body: [
      'Every record carries a workspace identifier, and the database itself refuses to return rows belonging to another workspace. The rule lives in the database rather than in application code, so a mistake in the application cannot expose another customer’s documents.',
      'The public signing app holds no database and no keys. It forwards a fixed, short list of request shapes and can do nothing else.',
    ],
  },
  {
    heading: 'Signing links',
    body: [
      'A signing link is a single-use secret. We store only its hash, never the link itself — which is also why a reminder cannot repeat the original link and must issue a new one.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You can ask for a copy of your data, ask us to correct it, or ask us to delete it. Where a document is evidence of a completed signature we may need to retain it, and we will tell you if that applies and why.',
      'Contact: privacy@esignsoft.com',
    ],
  },
];

export function LegalPage({
  title,
  updated,
  sections,
  home = '/',
}: {
  title: string;
  updated: string;
  sections: LegalSection[];
  home?: string;
}) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href={home}>
            <Logo size={26} />
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/terms" className="text-ink-muted hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="text-ink-muted hover:text-ink">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Last updated {updated}</p>

        <div className="mt-8 flex flex-col gap-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-ink">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-2.5 text-[15px] leading-relaxed text-ink-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
