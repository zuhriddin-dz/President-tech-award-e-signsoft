import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-muted px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <Mark />
        <span className="text-2xl font-bold tracking-tight text-ink">eSignSoft</span>
      </Link>
      <SignIn />
    </div>
  );
}

