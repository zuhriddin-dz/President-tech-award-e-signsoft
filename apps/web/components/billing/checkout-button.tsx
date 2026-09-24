'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  API_PATHS,
  CheckoutResponseSchema,
  type BillingPlan,
  type PaymentProvider,
} from '@docflow/contracts';
import { Button } from '@/components/ui/primitives';

const PROVIDERS: { id: PaymentProvider; label: string }[] = [
  { id: 'payme', label: 'Payme' },
  { id: 'click', label: 'Click' },
];

/**
 * The two ways to pay for one plan.
 *
 * Both providers are offered side by side rather than behind a chooser: in
 * Uzbekistan most people have one of the two apps and not always both, and
 * making someone pick a provider before they can see whether theirs is even
 * supported is a step that only ever loses sales.
 *
 * The button opens the purchase and then leaves — the API writes a pending
 * payment, returns the provider's URL, and the browser goes there. Nothing is
 * charged in this app, and no card detail is ever typed into it.
 */
export function CheckoutButtons({
  plan,
  highlight = false,
}: {
  plan: BillingPlan;
  /** The recommended plan gets the solid button; the other gets the outline. */
  highlight?: boolean;
}) {
  const [busy, setBusy] = useState<PaymentProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay(provider: PaymentProvider) {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api${API_PATHS.billing}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // One month. The API accepts up to twelve, so a longer purchase is a
        // control here rather than a change to anything behind it.
        body: JSON.stringify({ plan, provider, months: 1 }),
      });

      if (res.status === 503) {
        // The provider has no credentials configured on this deployment.
        setError(`${labelFor(provider)} is not connected yet. Try the other one.`);
        setBusy(null);
        return;
      }
      if (!res.ok) {
        setError('Could not start the payment. Please try again.');
        setBusy(null);
        return;
      }

      const { payUrl } = CheckoutResponseSchema.parse(await res.json());
      // Leaving the app, so `busy` is deliberately left set: the button stays
      // disabled for the moment before the browser navigates, which is exactly
      // the moment an impatient second click would open a second payment.
      window.location.href = payUrl;
    } catch {
      setError('Could not start the payment. Please try again.');
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2.5">
        {PROVIDERS.map((p) => (
          <Button
            key={p.id}
            variant={highlight ? 'dark' : 'secondary'}
            className="flex-1"
            disabled={busy !== null}
            onClick={() => pay(p.id)}
          >
            {busy === p.id ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening…
              </span>
            ) : (
              p.label
            )}
          </Button>
        ))}
      </div>
      <p className={`mt-2 text-xs ${error ? 'font-medium text-danger' : 'text-ink-muted'}`}>
        {error ?? 'You pay on the provider’s own page. We never see your card.'}
      </p>
    </div>
  );
}

function labelFor(provider: PaymentProvider): string {
  return PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
}
