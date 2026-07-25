import { describe, expect, it } from 'vitest';
import { buildCertificatePdf, type CertificateInput } from './certificate.js';

const base: CertificateInput = {
  requestId: 'req_abc123',
  documentName: 'Mutual NDA.pdf',
  signerName: 'Jordan Rivera',
  signerEmail: 'jordan@example.com',
  signerUserId: null,
  senderEmail: 'sender@acme.test',
  signerIp: '203.0.113.7',
  signerUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
  sentAt: new Date('2026-07-25T10:00:00Z'),
  viewedAt: new Date('2026-07-25T10:05:00Z'),
  consentAt: new Date('2026-07-25T10:06:00Z'),
  signedAt: new Date('2026-07-25T10:07:00Z'),
  method: 'Typed signature',
  documentHash: 'a'.repeat(64),
  sealSignature: 'Zm9vYmFy'.repeat(12),
  sealKid: 'seal-1',
};

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
      signerName: '日本語の署名者 😀',
      documentName: 'Договор 📄.pdf',
      signerUserAgent: 'Владимир/5.0 «browser»',
    };
    const pdf = await buildCertificatePdf(hostile);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('does not throw on an Invalid Date — treats it as missing', async () => {
    // An Invalid Date is truthy; without the guard, fmt() -> toISOString() throws
    // RangeError on the signing path and wedges the token.
    const pdf = await buildCertificatePdf({ ...base, viewedAt: new Date('not-a-date') });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders with all-null optional fields (signed via secure link, no account)', async () => {
    const minimal: CertificateInput = {
      ...base,
      signerName: null,
      signerUserId: null,
      senderEmail: null,
      signerIp: null,
      signerUserAgent: null,
      sentAt: null,
      viewedAt: null,
      consentAt: null,
    };
    const pdf = await buildCertificatePdf(minimal);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
