import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toPdfSafeText } from '@docflow/crypto';
import type { TemplateField } from '@docflow/contracts';

/**
 * Draw the signer's adopted signature and field values into the source PDF.
 *
 * THE COORDINATE TRAP: our fields are NORMALIZED fractions of the page with a
 * TOP-LEFT origin (what the editor and the ceremony use), while PDF space is
 * points with a BOTTOM-LEFT origin. Getting this wrong mirrors every field
 * vertically — the silent bug that makes signatures land in the wrong place.
 * The conversion happens in exactly one place (`toPdfBox`) so it can be tested
 * directly and can't drift per field type.
 */

/** Field types the adopted signature image is stamped into. */
const IMAGE_FIELDS = new Set(['signature', 'initial', 'stamp']);

export interface StampInput {
  pdfBytes: Buffer;
  fields: TemplateField[];
  /** Values keyed by field id (auto-filled + typed by the signer). */
  fieldValues: Record<string, string>;
  /** The adopted signature PNG. */
  signaturePng: Buffer;
}

/** Normalized top-left box → PDF bottom-left box, in points. */
export function toPdfBox(
  field: Pick<TemplateField, 'x' | 'y' | 'w' | 'h'>,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = field.w * pageWidth;
  const height = field.h * pageHeight;
  const x = field.x * pageWidth;
  // y is the TOP edge measured down from the top; PDF wants the BOTTOM edge
  // measured up from the bottom.
  const y = pageHeight - field.y * pageHeight - height;
  return { x, y, width, height };
}

export async function stampPdf(input: StampInput): Promise<Buffer> {
  const pdf = await PDFDocument.load(input.pdfBytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const signature = await pdf.embedPng(input.signaturePng);
  const pages = pdf.getPages();

  for (const field of input.fields) {
    const page = pages[field.page - 1];
    if (!page) continue; // a field pointing past the document is skipped, never fatal

    // The viewer (pdf.js) lays out the page as DISPLAYED — rotation applied,
    // origin at the MediaBox corner. Two corrections are needed or fields land
    // in the wrong place on exactly the documents people scan and rotate:
    //  1. a 90/270° page displays with width/height swapped;
    //  2. a MediaBox that doesn't start at (0,0) shifts everything.
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const { width: mediaW, height: mediaH } = page.getSize();
    const quarterTurn = rotation === 90 || rotation === 270;
    const pw = quarterTurn ? mediaH : mediaW;
    const ph = quarterTurn ? mediaW : mediaH;
    const box = toPdfBox(field, pw, ph);
    // Rotated pages are out of scope for precise placement; skip rather than
    // stamp a signature somewhere wrong on a legal document.
    if (quarterTurn || rotation !== 0) continue;
    const mediaBox = page.getMediaBox();
    box.x += mediaBox.x;
    box.y += mediaBox.y;

    if (IMAGE_FIELDS.has(field.type)) {
      // Fit the signature inside the box preserving aspect ratio, centred —
      // stretching a signature to the box would distort the person's mark.
      const scale = Math.min(box.width / signature.width, box.height / signature.height);
      const drawW = signature.width * scale;
      const drawH = signature.height * scale;
      page.drawImage(signature, {
        x: box.x + (box.width - drawW) / 2,
        y: box.y + (box.height - drawH) / 2,
        width: drawW,
        height: drawH,
      });
      continue;
    }

    const raw = input.fieldValues[field.id];
    if (!raw) continue;

    if (field.type === 'checkbox') {
      if (raw === 'true') {
        page.drawText(toPdfSafeText('X'), {
          x: box.x + box.width * 0.15,
          y: box.y + box.height * 0.15,
          size: Math.max(6, box.height * 0.8),
          font,
          color: rgb(0.07, 0.09, 0.15),
        });
      }
      continue;
    }

    // Text: fit the size to the box height, then shrink if it would overflow
    // the width — a long company name must not run across the page.
    let size = Math.min(12, Math.max(6, box.height * 0.7));
    const text = toPdfSafeText(raw);
    while (size > 5 && font.widthOfTextAtSize(text, size) > box.width) size -= 0.5;
    page.drawText(text, {
      x: box.x + 1,
      // Sit the baseline slightly above the box bottom so glyphs aren't clipped.
      y: box.y + Math.max(1, (box.height - size) / 2),
      size,
      font,
      color: rgb(0.07, 0.09, 0.15),
    });
  }

  return Buffer.from(await pdf.save());
}
