import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { readPdfGeometry } from './pdf-geometry.js';

async function makePdf(pages: [number, number][]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const [w, h] of pages) pdf.addPage([w, h]);
  return Buffer.from(await pdf.save());
}

describe('readPdfGeometry', () => {
  it('reports page count and per-page sizes in points', async () => {
    const bytes = await makePdf([
      [595, 842],
      [612, 792],
    ]);
    const geo = await readPdfGeometry(bytes);
    expect(geo.pageCount).toBe(2);
    expect(geo.pageSizes[0]).toEqual({ w: 595, h: 842 });
    expect(geo.pageSizes[1]).toEqual({ w: 612, h: 792 });
  });

  it('throws on non-PDF bytes', async () => {
    await expect(readPdfGeometry(Buffer.from('not a pdf'))).rejects.toThrow();
  });
});
