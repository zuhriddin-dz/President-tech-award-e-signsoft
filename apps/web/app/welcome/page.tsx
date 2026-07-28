import { AccountChoice } from './account-choice';

/**
 * The account-type choice, shown once after sign-up (or whenever a signed-in
 * user has no workspace). Personal vs Company — the fork the landing page
 * promised. Both land in the same product; only setup and sharing differ.
 */
export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-ink">
            How will you use eSignSoft?
          </h1>
          <p className="mt-3 text-ink-muted">
            This decides who else can see your agreements. You can add a company workspace later.
          </p>
        </div>
        <AccountChoice />
      </div>
    </div>
  );
}
