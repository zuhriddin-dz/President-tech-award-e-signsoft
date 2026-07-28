import Link from 'next/link';
import { Mark } from '@/components/brand/logo';
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-muted px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <Mark />
        <span className="text-2xl font-bold tracking-tight text-ink">eSignSoft</span>
      </Link>
      <SignUp />
      <p className="max-w-sm text-center text-sm text-ink-muted">
        Next you&apos;ll choose a personal or company workspace — that decides who else can see the
        agreements you send.
      </p>
    </div>
  );
}

