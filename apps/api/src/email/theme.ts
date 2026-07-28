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

/** The standard outer wrapper: one column, constrained width, brand type. */
export function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:${EMAIL_THEME.fontStack};max-width:520px;margin:0 auto;color:${EMAIL_THEME.ink}">
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
