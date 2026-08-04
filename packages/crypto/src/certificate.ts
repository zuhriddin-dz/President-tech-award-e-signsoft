import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toPdfSafeText } from './pdf-text.js';

/**
 * The Certificate of Completion — the artifact that makes a signature
 * defensible. The signed PDF shows WHAT was agreed; this shows HOW we know who
 * agreed and when: the signer's identity as we knew it, the network and browser
 * they used, every ceremony timestamp, the signed file's fingerprint, and the
 * server seal over that fingerprint.
 *
 * Evidentiary claim: not "this human was identity-proofed", but "whoever
 * controlled this mailbox opened this link, was shown this document,
 * affirmatively consented to sign electronically, and produced this signature —
 * and here is proof the file has not changed since." The timestamps are listed
 * separately, never collapsed, because each supports part of that sentence.
 */
export interface CertificateInput {
  requestId: string;
  documentName: string;
  signerName: string | null;
  signerEmail: string;
  /** Set only when the signer also had an account in this tenant. */
  signerUserId: string | null;
  senderEmail: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  consentAt: Date | null;
  signedAt: Date;
  method: string;
  /** sha256 hex of the signed PDF. */
  documentHash: string;
  /** base64 Ed25519 signature over the canonical seal string. */
  sealSignature: string;
  sealKid: string;
}

const MARGIN = 56;
const PAGE_W = 595.28; // A4 portrait, points
const PAGE_H = 841.89;

/**
 * The E-SIGNSOFT mark, as path data. Duplicated from
 * apps/web/components/brand/logo.tsx because this package cannot import from
 * an app — if the shapes change there, change them here too.
 *
 * The mark has its own FIXED three-colour identity and deliberately does not
 * follow the app's sky-blue UI palette.
 */
const LOGO_SRC_W = 360;
const LOGO_SRC_H = 330;
const LOGO_SHIELD_PATH =
  'M120 22 L240 0 L360 22 V140 C360 185 316 216 240 240 C164 216 120 185 120 140 Z';
const LOGO_DOCUMENT_PATH =
  'M22 90 H168 L240 162 V308 Q240 330 218 330 H22 Q0 330 0 308 V112 Q0 90 22 90 Z';
/** The exact intersection of shield and document, painted last. */
const LOGO_SEAM_PATH = 'M120 90 H168 L240 162 V240 C164 216 120 185 120 140 V90 Z';

const LOGO_PINK = rgb(0.831, 0.09, 0.416); // #D4176A — shield (protection)
const LOGO_NAVY = rgb(0.086, 0.126, 0.263); // #162043 — document
const LOGO_BLACK = rgb(0, 0, 0); // #000000 — seam

function fmt(d: Date | null): string {
  // An Invalid Date is truthy but d.toISOString() throws RangeError — and a
  // throw on the signing path wedges the token this whole module guards. Treat
  // it as missing, exactly like null.
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** Break a long spaceless value (hash, base64 seal, UA) across lines. */
function chunk(value: string, perLine: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += perLine) out.push(value.slice(i, i + perLine));
  return out.length > 0 ? out : ['—'];
}

export async function buildCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.039, 0.114, 0.18); // --color-ink #0a1d2e
  const muted = rgb(0.353, 0.42, 0.478); // --color-ink-muted #5a6b7a
  const rule = rgb(0.867, 0.89, 0.914); // --color-border #dde3e9

  let y = PAGE_H - MARGIN;

  const text = (
    value: string,
    opts: { size?: number; bold?: boolean; color?: typeof ink; x?: number } = {},
  ) => {
    // Sanitize at the single draw primitive so no caller can forget it and
    // throw mid-render — the failure that would wedge a token permanently.
    page.drawText(toPdfSafeText(value), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? ink,
    });
  };

  const row = (label: string, value: string) => {
    text(label, { size: 9, color: muted });
    text(value, { size: 10, x: MARGIN + 150 });
    y -= 18;
  };

  const section = (title: string) => {
    y -= 10;
    text(title, { size: 11, bold: true });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: rule,
    });
    y -= 16;
  };

  // The mark, drawn from the SAME path data as the web component — pdf-lib's
  // drawSvgPath takes raw SVG path strings and flips the Y axis itself, so
  // the shield's curves and the document's corner fold reproduce exactly
  // rather than being approximated with rectangles.
  //
  // Paint order IS the design: shield, then document over it, then the seam
  // (their exact intersection) last. See apps/web/components/brand/logo.tsx.
  const MARK_H = 26;
  const markScale = MARK_H / LOGO_SRC_H;
  // drawSvgPath places the path's own (0,0) at {x,y}; the mark's origin is
  // its top-left, so y is the mark's TOP edge.
  const markTop = y + 9;
  for (const [d, color] of [
    [LOGO_SHIELD_PATH, LOGO_PINK],
    [LOGO_DOCUMENT_PATH, LOGO_NAVY],
    [LOGO_SEAM_PATH, LOGO_BLACK],
  ] as const) {
    page.drawSvgPath(d, { x: MARGIN, y: markTop, scale: markScale, color });
  }
  text('E-SIGNSOFT', {
    size: 13,
    bold: true,
    x: MARGIN + MARK_H * (LOGO_SRC_W / LOGO_SRC_H) + 10,
  });
  y -= 32;

  text('Certificate of Completion', { size: 18, bold: true });
  y -= 22;
  text(`Reference ${input.requestId}`, { size: 9, color: muted });
  y -= 26;

  section('Document');
  row('Document', input.documentName);
  row('Sent by', input.senderEmail ?? '—');

  section('Signer');
  row('Name', input.signerName ?? '—');
  row('Email', input.signerEmail);
  // The mailbox is the identity anchor; an account is a bonus, not required.
  row('Account', input.signerUserId ?? 'No account (signed via secure link)');
  row('IP address', input.signerIp ?? '—');

  const ua = chunk(input.signerUserAgent ?? '—', 62);
  text('Browser', { size: 9, color: muted });
  ua.forEach((line, i) => {
    text(line, { size: 8, x: MARGIN + 150 });
    if (i < ua.length - 1) y -= 11;
  });
  y -= 20;

  section('Ceremony timeline');
  row('Sent', fmt(input.sentAt));
  row('First opened', fmt(input.viewedAt));
  row('Consent to sign electronically', fmt(input.consentAt));
  row('Signed', fmt(input.signedAt));
  row('Signature method', input.method);

  section('Tamper evidence');
  text('SHA-256 of the signed document', { size: 9, color: muted });
  y -= 14;
  chunk(input.documentHash, 72).forEach((line) => {
    text(line, { size: 8 });
    y -= 11;
  });
  y -= 6;
  text(`Server seal (Ed25519, key ${input.sealKid})`, { size: 9, color: muted });
  y -= 14;
  chunk(input.sealSignature, 72).forEach((line) => {
    text(line, { size: 8 });
    y -= 11;
  });

  y -= 16;
  const explanation = [
    'The hash above is the fingerprint of the signed document as it existed at completion.',
    "The seal is that fingerprint signed by this system's private key. Re-hashing the signed",
    'document and checking it against the seal proves the file has not been altered since.',
    'This certificate records an electronic signature made under ESIGN/UETA: the signer was',
    'shown the document, affirmatively agreed to sign electronically, and signed from the',
    'address and network recorded above.',
  ];
  explanation.forEach((line) => {
    text(line, { size: 8, color: muted });
    y -= 11;
  });

  return Buffer.from(await pdf.save());
}
