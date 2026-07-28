import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-muted px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <Mark />
        <span className="text-2xl font-bold tracking-tight text-ink">DocFlow</span>
      </Link>
      <SignUp />
      <p className="max-w-sm text-center text-sm text-ink-muted">
        Next you&apos;ll choose a personal or company workspace — that decides who else can see the
        agreements you send.
      </p>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="h-8 w-8" aria-hidden>
      <rect width="28" height="28" rx="7" fill="var(--color-brand)" />
      <path d="M9 7h6.5L20 11.5V21H9z" fill="#fff" opacity="0.92" />
      <path d="M15.5 7v4.5H20" fill="var(--color-brand-soft)" />
      <path
        d="M11 17.6c1.6-.4 2.3-2.6 3.1-2.6.9 0 .6 2.2 1.6 2.2.7 0 1.2-.9 2.3-.9"
        stroke="var(--color-brand)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
