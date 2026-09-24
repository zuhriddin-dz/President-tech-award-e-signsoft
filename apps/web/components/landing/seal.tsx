/**
 * OUR seal — drawn, not photographed.
 *
 * A notary's rubber stamp is the one object everyone already reads as "this
 * document is final", so the landing page borrows the FORM (two rings, text
 * curved along them, a plain block in the middle) and fills it with what we
 * actually issue: the request id and the fingerprint of the sealed file. Both
 * are fields the Certificate of Completion really carries.
 *
 * No date inside the ring. A stamp that names a day invites the reader to
 * check it against the page it sits on, and the date that matters is on the
 * certificate, recorded by the server — not printed on a picture.
 *
 * Vector on purpose. An image would be a network round trip before the first
 * thing a visitor looks at, and it could not be re-coloured, re-typed or read
 * by a screen reader. This is ~2KB of markup that scales to any size.
 *
 * Drawn in a 240×240 space with the ink in `currentColor`, so a caller sets
 * the colour (the magenta from the logo) and the size in one place.
 */
export function Seal({
  requestId = '3F2F1A10',
  fingerprint = '4F9C…A12B',
  size = 200,
  className = '',
}: {
  /** Short form of the signature request id, as printed on the certificate. */
  requestId?: string;
  /** Truncated SHA-256 of the sealed file. */
  fingerprint?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={className}
      role="img"
      aria-label={`Sealed by E-SIGNSOFT, request ${requestId}, fingerprint ${fingerprint}`}
      focusable="false"
    >
      <defs>
        {/* Two arcs for the curved text. The bottom one is drawn right-to-left
            so its label sits upright instead of reading upside down. */}
        <path id="seal-arc-top" fill="none" d="M 28 120 A 92 92 0 0 1 212 120" />
        <path id="seal-arc-bottom" fill="none" d="M 26 120 A 94 94 0 0 0 214 120" />
      </defs>

      {/* The rings. The gap between them is where a real stamp collects ink. */}
      <circle cx="120" cy="120" r="115" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="120" cy="120" r="104" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="120" cy="120" r="74" fill="none" stroke="currentColor" strokeWidth="1.5" />

      <g
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize="13"
        letterSpacing="2.2"
        fontWeight="500"
      >
        <text>
          <textPath href="#seal-arc-top" startOffset="50%" textAnchor="middle">
            E-SIGNSOFT · SEALED
          </textPath>
        </text>
        <text>
          <textPath href="#seal-arc-bottom" startOffset="50%" textAnchor="middle">
            ED25519 · VERIFIABLE
          </textPath>
        </text>
      </g>

      {/* Two dots where the arcs meet, the way a stamp breaks its ring. */}
      <g fill="currentColor">
        <circle cx="16" cy="120" r="3.4" />
        <circle cx="224" cy="120" r="3.4" />
      </g>

      {/* The block in the middle: what identifies this sealed document. */}
      <g textAnchor="middle" fill="currentColor" fontFamily="var(--font-mono)">
        <text x="120" y="105" fontSize="9.5" letterSpacing="1.8" opacity="0.75">
          REQUEST NO.
        </text>
        <text x="120" y="128" fontSize="20" letterSpacing="1.5" fontWeight="500">
          {requestId}
        </text>
        <text x="120" y="149" fontSize="11" letterSpacing="0.6">
          SHA-256 {fingerprint}
        </text>
      </g>
    </svg>
  );
}
