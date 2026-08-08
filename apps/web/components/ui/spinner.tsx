/**
 * The loading indicator, defined once.
 *
 * Deliberately understated: this appears on route transitions that usually
 * resolve in well under a second, and a large animated thing that flashes and
 * vanishes reads as jank rather than progress.
 *
 * `role="status"` with a visually-hidden label because a bare spinning circle
 * announces nothing to a screen reader — the user is simply left in silence
 * while the page they asked for does not arrive.
 */
export function Spinner({
  size = 20,
  label = 'Loading',
  className = '',
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="animate-spin"
      >
        {/* The full ring is the track; the arc is what reads as motion. */}
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.18" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Full-height centred loader for a route's loading.tsx. Kept separate from
 * Spinner so a page can use the bare indicator inline without inheriting a
 * screen-filling layout.
 */
export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-brand">
      <Spinner size={28} label={label} />
      <p className="text-sm text-ink-muted" aria-hidden="true">
        {label}…
      </p>
    </div>
  );
}
