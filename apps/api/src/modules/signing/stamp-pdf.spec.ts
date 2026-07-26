import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { stampPdf, toPdfBox } from './stamp-pdf.js';

// A 1x1 transparent PNG — enough for embedPng.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('toPdfBox — the top-left → bottom-left flip', () => {
  it('converts a normalized top-left box to PDF points', () => {
    // A box at the very TOP of the page (y=0) must sit at the TOP in PDF
    // space, i.e. its bottom edge is pageHeight - height.
    expect(toPdfBox({ x: 0, y: 0, w: 0.5, h: 0.1 }, 600, 800)).toEqual({
      x: 0,
      y: 800 - 80,
      width: 300,
      height: 80,
    });
  });

  it('puts a box at the BOTTOM of the page at y≈0', () => {
    // y=0.9 with h=0.1 reaches the bottom edge exactly.
    const box = toPdfBox({ x: 0.25, y: 0.9, w: 0.5, h: 0.1 }, 600, 800);
    expect(box.y).toBeCloseTo(0, 6);
    expect(box.x).toBe(150);
  });

  it('is the inverse of the editor: y + h = 1 maps to the page bottom', () => {
    const h = 0.06;
    for (const y of [0, 0.25, 0.5, 0.94]) {
      const box = toPdfBox({ x: 0, y, w: 0.2, h }, 595, 842);
      // Distance from the page top to the box top is the same in both spaces.
      expect(842 - (box.y + box.height)).toBeCloseTo(y * 842, 6);
    }
  });
});

describe('stampPdf', () => {
  async function blankPdf(pages = 1): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pages; i++) pdf.addPage([595, 842]);
    return Buffer.from(await pdf.save());
  }

  it('produces a valid PDF with the signature and values stamped', async () => {
    const out = await stampPdf({
      pdfBytes: await blankPdf(),
      fields: [
        { id: 'sig', type: 'signature', page: 1, x: 0.1, y: 0.8, w: 0.2, h: 0.05, required: true, recipientKey: 'signer' },
        { id: 'nm', type: 'name', page: 1, x: 0.1, y: 0.5, w: 0.3, h: 0.03, required: false, recipientKey: 'signer' },
        { id: 'cb', type: 'checkbox', page: 1, x: 0.5, y: 0.5, w: 0.03, h: 0.02, required: false, recipientKey: 'signer' },
      ],
      fieldValues: { nm: 'Jordan Rivera', cb: 'true' },
      signaturePng: PNG,
    });
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.length).toBeGreaterThan(500);
  });

  it('skips a field pointing past the last page instead of throwing', async () => {
    const out = await stampPdf({
      pdfBytes: await blankPdf(1),
      fields: [
        { id: 'a', type: 'signature', page: 9, x: 0.1, y: 0.1, w: 0.2, h: 0.05, required: true, recipientKey: 'signer' },
      ],
      fieldValues: {},
      signaturePng: PNG,
    });
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('never throws on hostile Unicode in a value (the token-wedge guard)', async () => {
    const out = await stampPdf({
      pdfBytes: await blankPdf(),
      fields: [
        { id: 't', type: 'text', page: 1, x: 0.1, y: 0.1, w: 0.5, h: 0.03, required: false, recipientKey: 'signer' },
      ],
      fieldValues: { t: '日本語 😀 Владимир' },
      signaturePng: PNG,
    });
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
