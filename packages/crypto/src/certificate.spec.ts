import { describe, expect, it } from 'vitest';
import {
  buildCertificatePdf,
  type CertificateInput,
  type CertificateSigner,
} from './certificate.js';

const signer: CertificateSigner = {
  name: 'Jordan Rivera',
  email: 'jordan@example.com',
  userId: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
  viewedAt: new Date('2026-07-25T10:05:00Z'),
  consentAt: new Date('2026-07-25T10:06:00Z'),
  signedAt: new Date('2026-07-25T10:07:00Z'),
  method: 'Typed signature',
};

const base: CertificateInput = {
  requestId: 'req_abc123',
  documentName: 'Mutual NDA.pdf',
  senderEmail: 'sender@acme.test',
  signers: [signer],
  sentAt: new Date('2026-07-25T10:00:00Z'),
  signedAt: new Date('2026-07-25T10:07:00Z'),
  documentHash: 'a'.repeat(64),
  sealSignature: 'Zm9vYmFy'.repeat(12),
  sealKid: 'seal-1',
};

/** How many pages the produced PDF has, read back off the object count. */
async function pageCount(pdf: Buffer): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(pdf)).getPageCount();
}

describe('buildCertificatePdf', () => {
  it('produces a valid, non-trivial PDF', async () => {
    const pdf = await buildCertificatePdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('NEVER throws on hostile / exotic input — the token-wedge guard', async () => {
    // A CJK name, an emoji document, a Cyrillic UA: pdf-lib would throw on the
    // raw strings; toPdfSafeText at the draw primitive must keep this rendering.
    const hostile: CertificateInput = {
      ...base,
      documentName: 'Договор 📄.pdf',
      signers: [{ ...signer, name: '日本語の署名者 😀', userAgent: 'Владимир/5.0 «browser»' }],
    };
    const pdf = await buildCertificatePdf(hostile);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('does not throw on an Invalid Date — treats it as missing', async () => {
    // An Invalid Date is truthy; without the guard, fmt() -> toISOString() throws
    // RangeError on the signing path and wedges the token.
    const pdf = await buildCertificatePdf({
      ...base,
      signers: [{ ...signer, viewedAt: new Date('not-a-date') }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders with all-null optional fields (signed via secure link, no account)', async () => {
    const minimal: CertificateInput = {
      ...base,
      senderEmail: null,
      sentAt: null,
      signers: [
        { ...signer, name: null, userId: null, ip: null, userAgent: null, viewedAt: null, consentAt: null, signedAt: null },
      ],
    };
    const pdf = await buildCertificatePdf(minimal);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  // Every signer must appear. Reading the request's legacy single-signer
  // columns named only one person, so a two-party agreement produced a
  // certificate that silently omitted the other side.
  it('renders a block per signer, so a multi-party envelope names everyone', async () => {
    const two = await buildCertificatePdf({
      ...base,
      signers: [
        signer,
        {
          ...signer,
          name: 'Alex Chen',
          email: 'alex@example.com',
          ip: '198.51.100.4',
          signedAt: new Date('2026-07-26T09:00:00Z'),
        },
      ],
    });
    const one = await buildCertificatePdf(base);
    expect(two.subarray(0, 5).toString()).toBe('%PDF-');
    // A second ceremony record is real content, not a relabelling.
    expect(two.length).toBeGreaterThan(one.length);
  });

  // The tamper-evidence block is drawn LAST. Before pagination existed it was
  // the first thing pushed off the bottom of the single page — leaving a
  // certificate that looked complete while omitting the proof it exists for.
  it('paginates rather than dropping content when there are many signers', async () => {
    const many: CertificateInput = {
      ...base,
      signers: Array.from({ length: 8 }, (_, i) => ({
        ...signer,
        name: `Signer ${i + 1}`,
        email: `signer${i + 1}@example.com`,
      })),
    };
    const pdf = await buildCertificatePdf(many);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await pageCount(pdf)).toBeGreaterThan(1);
  });

  it('keeps a single-signer certificate on one page', async () => {
    expect(await pageCount(await buildCertificatePdf(base))).toBe(1);
  });
});
