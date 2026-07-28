import { LegalPage, TERMS } from '@/components/legal/legal-page';

export const metadata = { title: 'Terms of Use · E-SIGNSOFT' };

export default function TermsPage() {
  return <LegalPage title="Terms of Use" updated="28 July 2026" sections={TERMS} home="/" />;
}
