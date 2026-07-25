import { AccountChoice } from './account-choice';

/**
 * The account-type choice, shown once after sign-up (or whenever a signed-in
 * user has no workspace). Personal vs Company — the fork the landing page
 * promised. Both land in the same product; only setup differs.
 */
export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          How will you use DocFlow?
        </h1>
        <p className="mt-2 text-ink-muted">You can always add a company workspace later.</p>
      </div>
      <AccountChoice />
    </div>
  );
}
