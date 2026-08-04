/**
 * The E-SIGNSOFT mark: a document with a folded top-right corner, sitting in
 * front of a rounded shield — the shield reads as the protection/security
 * layer behind the paper.
 *
 * This is a FIXED three-colour identity — pink shield, navy document, black
 * seam — chosen deliberately over the app's sky-blue UI palette. This mark
 * does NOT follow --color-brand tokens; it is its own asset with its own
 * fixed hexes, and nothing else in the product's palette changed alongside
 * it (buttons, links, focus rings all stay on the existing sky-blue tokens).
 *
 * The seam is the exact geometric intersection of the shield and the
 * document, traced by hand (SVG has no boolean path ops): it follows the
 * document's top edge and fold diagonal, then the shield's own left-taper
 * curve — lifted verbatim, reversed — back up to close. If you move either
 * shape, the seam has to be re-derived from the new geometry, not guessed.
 *
 * The same path data is duplicated in two non-React places that cannot
 * import this file. Keep them in step:
 *   - apps/web/app/icon.svg and apps/sign/app/icon.svg  (favicons — a square
 *     app-icon layout with a white plate behind these same three paths)
 *   - packages/crypto/src/certificate.ts  (drawn into the PDF via pdf-lib's
 *     drawSvgPath, using this exact path data)
 * The email header does NOT attempt this geometry — see theme.ts for why.
 */

export type MarkTone = 'brand' | 'inverse' | 'mono';

/** Source path data, in the master's native 360×330 coordinate space. */
const SHIELD_PATH =
  'M120 22 L240 0 L360 22 V140 C360 185 316 216 240 240 C164 216 120 185 120 140 Z';
const DOCUMENT_PATH =
  'M22 90 H168 L240 162 V308 Q240 330 218 330 H22 Q0 330 0 308 V112 Q0 90 22 90 Z';
const SEAM_PATH = 'M120 90 H168 L240 162 V240 C164 216 120 185 120 140 V90 Z';

const SRC_W = 360;
const SRC_H = 330;

interface ToneSpec {
  shield: string | null;
  document: string;
  seam: string | null;
}

const TONES: Record<MarkTone, ToneSpec> = {
  /** The identity, as specified — all three shapes. */
  brand: { shield: '#D4176A', document: '#162043', seam: '#000000' },
  /**
   * The dark signing bar. Black-on-navy and navy-on-navy both vanish there,
   * so this tier drops the seam and flips the document to white — the
   * shield's pink already reads fine against a dark ground and needs no
   * change.
   */
  inverse: { shield: '#D4176A', document: '#ffffff', seam: null },
  /**
   * One colour, inherited. The shield and seam are dropped here — per the
   * source design notes, the depth read does not survive a single colour, so
   * the mono form is the document shape alone, filled via currentColor.
   */
  mono: { shield: null, document: 'currentColor', seam: null },
};

export function Mark({
  size = 28,
  tone = 'brand',
  className = '',
}: {
  /** Rendered HEIGHT in px — width follows the mark's native 360:330 ratio. */
  size?: number;
  tone?: MarkTone;
  className?: string;
}) {
  const t = TONES[tone];
  const width = Math.round(size * (SRC_W / SRC_H));
  return (
    <svg
      width={width}
      height={size}
      viewBox={`0 0 ${SRC_W} ${SRC_H}`}
      className={className}
      role="img"
      aria-label="E-SIGNSOFT"
      focusable="false"
    >
      {t.shield && <path fill={t.shield} d={SHIELD_PATH} />}
      <path fill={t.document} d={DOCUMENT_PATH} />
      {t.seam && <path fill={t.seam} d={SEAM_PATH} />}
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is set in the app's own sans at bold with
 * tracking opened up for the all-caps set — no licensed font, so it renders
 * the same on a machine that has never visited us before.
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
