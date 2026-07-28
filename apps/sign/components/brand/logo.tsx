/**
 * The E-SIGNSOFT mark: a document with a seal pressed into its corner.
 *
 * Two shapes, on purpose. The mark has to survive a 16px favicon, invert to
 * white on the dark signing bar, and be redrawn with pdf-lib primitives on the
 * Certificate of Completion — so anything with fine detail (a feather, a
 * hand-drawn stroke, a gradient) is disqualified before it starts.
 *
 * It also has to SAY something: a page, and proof on the page. That is the
 * product in one image, which is what the competitor's quill never manages.
 *
 * The same geometry is duplicated in three non-React places that cannot import
 * this file. If you change the shapes here, change them there too:
 *   - apps/web/app/icon.svg and apps/sign/app/icon.svg   (favicons)
 *   - apps/api/src/email/theme.ts                        (HTML email header)
 *   - packages/crypto/src/certificate.ts                 (drawn into the PDF)
 */

export type MarkTone = 'brand' | 'inverse' | 'mono';

const TONES: Record<MarkTone, { page: string; seal: string }> = {
  /** On white and other light surfaces. */
  brand: { page: 'var(--color-brand, #0077c8)', seal: 'var(--color-brand-deep, #06304e)' },
  /** On the dark signing bar — the page carries the light, the seal the accent. */
  inverse: { page: '#ffffff', seal: 'var(--color-brand, #0077c8)' },
  /** One colour, inherited. For places that only get a single ink. */
  mono: { page: 'currentColor', seal: 'currentColor' },
};

export function Mark({
  size = 28,
  tone = 'brand',
  className = '',
}: {
  size?: number;
  tone?: MarkTone;
  className?: string;
}) {
  const { page, seal } = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="E-SIGNSOFT"
      focusable="false"
    >
      <rect x="4" y="3" width="16" height="22" rx="2.5" fill={page} />
      {/* The seal sits ON the page, overlapping its lower-right corner — the
          document is the thing, the seal is what we add to it. In mono the two
          shapes share a colour, so a hairline gap keeps them readable. */}
      <circle
        cx="21"
        cy="22"
        r="7.5"
        fill={seal}
        stroke={tone === 'mono' ? 'var(--color-surface, #fff)' : 'none'}
        strokeWidth={tone === 'mono' ? 1.5 : 0}
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is set in the app's own sans at semibold
 * with slightly tightened tracking — no licensed font, so it renders the same
 * on a machine that has never visited us before.
 */
export function Logo({
  size = 28,
  tone = 'brand',
  showName = true,
  className = '',
}: {
  size?: number;
  tone?: MarkTone;
  showName?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark size={size} tone={tone} />
      {showName && (
        <span
          className={`font-bold ${tone === 'inverse' ? 'text-white' : 'text-ink'}`}
          style={{
            // Set in CAPS, so the two rules that govern lowercase are inverted:
            // capitals need POSITIVE tracking to stop them jamming together,
            // and they read visually larger than lowercase at the same size —
            // hence 0.58 of the mark rather than the 0.72 a mixed-case
            // wordmark would take.
            fontSize: Math.round(size * 0.58),
            letterSpacing: '0.055em',
          }}
        >
          E-SIGNSOFT
        </span>
      )}
    </span>
  );
}
