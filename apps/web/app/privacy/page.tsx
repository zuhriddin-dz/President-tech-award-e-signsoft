import { LegalPage, PRIVACY } from '@/components/legal/legal-page';

export const metadata = { title: 'Privacy · E-SIGNSOFT' };

export default function PrivacyPage() {
  return <LegalPage title="Privacy" updated="28 July 2026" sections={PRIVACY} home="/" />;
}
