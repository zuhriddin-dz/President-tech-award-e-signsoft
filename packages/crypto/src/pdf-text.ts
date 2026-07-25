/**
 * Making arbitrary text safe to draw with pdf-lib's standard fonts.
 *
 * The standard-14 PDF fonts (Helvetica et al.) are WinAnsi-encoded, and pdf-lib
 * THROWS when asked to draw a codepoint that encoding cannot represent — any
 * non-Latin-1 character (日本語, Владимир, an emoji, a smart quote).
 *
 * On the signing path that throw is not cosmetic: it lands inside the submit
 * pipeline, which releases and re-arms the token, so a signer whose name or a
 * field value contains one such character could NEVER complete — and an
 * attacker could wedge a token permanently by sending one in a header. Every
 * string reaching a certificate is signer- or user-controlled (name, email,
 * user-agent, document name).
 *
 * A Unicode font (fontkit + a TTF) is the eventual fix so exotic names render
 * for real; THIS is the safety floor beneath it: drawText never throws.
 */

const TRANSLITERATIONS: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  '•': '-',
};

/**
 * Return `value` with every character pdf-lib's WinAnsi Helvetica can draw and
 * nothing it cannot. Passed through: printable ASCII (0x20–0x7E) and Latin-1
 * supplement (0xA0–0xFF, covering é/ñ/ü…). Control ranges are dropped (some are
 * undefined in WinAnsi and would throw); common typographic marks are
 * transliterated; tabs/newlines flatten to a space; everything else becomes '?'.
 */
export function toPdfSafeText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
    } else if (TRANSLITERATIONS[ch]) {
      out += TRANSLITERATIONS[ch];
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += ' ';
    } else {
      out += '?';
    }
  }
  return out;
}
