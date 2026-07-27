import { PDFDocument } from 'pdf-lib';

export interface PdfGeometry {
  pageCount: number;
  /** Per-page size in PDF points (bottom-left origin space). */
  pageSizes: { w: number; h: number }[];
}

const MAX_PAGES = 300;

/**
 * Read page count + per-page dimensions from PDF bytes. `ignoreEncryption`
 * lets us measure a permission-protected (but not password-protected) PDF;
 * a truly malformed or huge file throws and the caller returns a 400.
 */
export async function readPdfGeometry(bytes: Buffer): Promise<PdfGeometry> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = pdf.getPages();
  if (pages.length === 0) throw new Error('PDF has no pages');
  if (pages.length > MAX_PAGES) throw new Error(`PDF exceeds ${MAX_PAGES} pages`);
  // A /Rotate page displays differently from its underlying coordinate space,
  // so a field placed in the editor would be stamped somewhere else on the
  // signed document. Refuse the document HERE — before anyone can send it —
  // rather than silently misplacing a signature on a legal file.
  for (const page of pages) {
    if (((page.getRotation().angle % 360) + 360) % 360 !== 0) {
      throw new Error('PDF contains rotated pages, which are not supported yet');
    }
  }
  return {
    pageCount: pages.length,
    pageSizes: pages.map((p) => {
      const { width, height } = p.getSize();
      return { w: width, h: height };
    }),
  };
}
