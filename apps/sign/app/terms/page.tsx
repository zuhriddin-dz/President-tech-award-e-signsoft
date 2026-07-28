import { LegalPage, TERMS } from '@/components/legal/legal-page';

export const metadata = { title: 'Terms of Use · DocFlow' };

/**
 * The signer's copy of the terms. Served from THIS app so a person following
 * the footer of a signing link never leaves the origin they are signing on.
 */
export default function TermsPage() {
  return <LegalPage title="Terms of Use" updated="28 July 2026" sections={TERMS} home="/terms" />;
}
