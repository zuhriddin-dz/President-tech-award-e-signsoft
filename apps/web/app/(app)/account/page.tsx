import { UserProfile } from '@clerk/nextjs';

/**
 * Your account. Rendered by our identity provider's own component on purpose:
 * password, MFA and connected-account changes are security operations, and
 * re-implementing their forms would mean handling credentials we deliberately
 * never touch. E-SIGNSOFT stores no password.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      <h1 className="text-2xl font-semibold text-ink">Your account</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">
        Your name, photo, email addresses and sign-in security. Adding a photo also ticks the last
        item on your setup checklist.
      </p>
      <div className="mt-6">
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full max-w-none shadow-none border border-border rounded-lg',
            },
          }}
        />
      </div>
    </div>
  );
}
