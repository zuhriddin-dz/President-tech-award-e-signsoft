/**
 * The brand, as email clients can consume it.
 *
 * Emails cannot use the app's CSS custom properties — Outlook and Gmail strip
 * or ignore them — so every message inlines literal hex. That makes this file
 * the single place those literals live: change the brand here and every
 * invite, reminder, cancellation and signed-copy notice follows, instead of a
 * dozen templates drifting apart.
 *
 * Keep these values in step with apps/web/app/globals.css.
 */
/**
 * The logo's own fixed colours. These are NOT the app's UI palette — the mark
 * is a separate asset with a locked three-colour identity, and it does not
 * follow the sky-blue brand tokens the rest of the product uses.
 * Keep in step with apps/web/components/brand/logo.tsx.
 */
export const LOGO = {
  /** The shield behind the document — protection. */
  shield: '#D4176A',
  /** The document in front. */
  document: '#162043',
  /** The exact intersection of the two, painted last. */
  seam: '#000000',
} as const;

export const EMAIL_THEME = {
  /** Primary action colour — button backgrounds, with white text on top. */
  brand: '#0369a1',
  /** Quiet brand tint for quoted blocks and rules. */
  brandSoft: '#e8f5fd',
  /** Body copy. */
  ink: '#0b2233',
  /** Secondary copy. */
  inkMuted: '#4a5b68',
  /** Fine print. */
  inkFaint: '#6b7b87',
  /** Panel background behind a quoted note. */
  surfaceMuted: '#f5f8fa',
  fontStack: "system-ui,-apple-system,Segoe UI,Arial,sans-serif",
} as const;

/**
 * The mark, approximated with HTML boxes rather than an image.
 *
 * Email is the one surface where our SVG cannot go: Outlook's Word engine
 * ignores inline SVG, and Gmail refuses `data:` URIs in <img src>. Hosting a
 * PNG would work but ties every email we have ever sent to a URL that must
 * stay alive forever, and images are blocked by default in most clients — a
 * box always draws.
 *
 * So this is a SIMPLIFICATION, but it should still read as our mark. Two
 * things it previously got wrong:
 *
 *  - the shield was a perfect circle (13px radius on a 26px box). A circle
 *    reads as a dot, not a shield. It now tapers at the bottom, which is the
 *    silhouette people actually recognise.
 *
 *  - the two shapes were MIRRORED. In the real mark the document sits at the
 *    bottom-LEFT with the shield behind it to the top-RIGHT; the email had
 *    the shield left and the document down-right.
 *
 * Order matters and is load-bearing: the shield is emitted first so the
 * document paints over it, which is the real mark's stacking. Outlook squares
 * off every border-radius, so it degrades to two offset rectangles in the
 * right colours and the right arrangement — still legible as the same object.
 */
function emailMark(): string {
  // Elliptical radii: square-ish top, tapering bottom — a shield, not a dot.
  const shield =
    `display:inline-block;width:24px;height:24px;` +
    `border-radius:4px 4px 46% 46% / 4px 4px 62% 62%;` +
    `background:${LOGO.shield};vertical-align:middle;margin-left:9px`;
  // Pulled back left and down: bottom-left of the lockup, over the shield.
  const doc =
    `display:inline-block;width:22px;height:24px;border-radius:3px;` +
    `background:${LOGO.document};vertical-align:middle;` +
    `margin-left:-13px;margin-top:9px`;
  return `<span style="${shield}"></span><span style="${doc}"></span>`;
}

/**
 * The standard outer wrapper: brand lockup, then one constrained column.
 * The wordmark is TEXT, never an image — a recipient whose client blocks
 * images still sees who sent this.
 */
export function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:${EMAIL_THEME.fontStack};max-width:520px;margin:0 auto;color:${EMAIL_THEME.ink}">
    <div style="padding:0 0 20px">
      ${emailMark()}
      <span style="display:inline-block;margin-left:10px;font-size:16px;font-weight:700;letter-spacing:.055em;color:${EMAIL_THEME.ink};vertical-align:middle">E-SIGNSOFT</span>
    </div>
    <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
    ${bodyHtml}
  </div>`.trim();
}

/** A primary call-to-action button, sized for touch and safe in Outlook. */
export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:${EMAIL_THEME.brand};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:14px;font-weight:600;display:inline-block">${label}</a></p>`;
}

/** Body paragraph. */
export function emailParagraph(html: string): string {
  return `<p style="font-size:14px;line-height:1.5;color:${EMAIL_THEME.inkMuted}">${html}</p>`;
}

/** Fine print under the fold. */
export function emailFinePrint(html: string): string {
  return `<p style="font-size:12px;line-height:1.5;color:${EMAIL_THEME.inkFaint}">${html}</p>`;
}
