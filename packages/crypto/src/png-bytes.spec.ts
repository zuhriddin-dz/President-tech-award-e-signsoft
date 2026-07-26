import { describe, expect, it } from 'vitest';
import { decodeSignaturePng, isPng, pngDimensions } from './png-bytes.js';

// A real 1x1 PNG.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('png guards', () => {
  it('recognizes a real PNG and its dimensions', () => {
    const bytes = Buffer.from(PNG_1x1, 'base64');
    expect(isPng(bytes)).toBe(true);
    expect(pngDimensions(bytes)).toEqual({ width: 1, height: 1 });
  });

  it('rejects non-PNG bytes', () => {
    expect(isPng(Buffer.from('not a png'))).toBe(false);
    expect(pngDimensions(Buffer.from('not a png'))).toBeNull();
  });

  it('decodeSignaturePng accepts a valid data URL and rejects everything else', () => {
    expect(decodeSignaturePng(`data:image/png;base64,${PNG_1x1}`)).toBeInstanceOf(Buffer);
    // Wrong mime, non-PNG payload, and non-data-URL all rejected.
    expect(decodeSignaturePng(`data:image/jpeg;base64,${PNG_1x1}`)).toBeNull();
    expect(decodeSignaturePng('data:image/png;base64,bm90YXBuZw==')).toBeNull();
    expect(decodeSignaturePng('http://evil/x.png')).toBeNull();
    expect(decodeSignaturePng('')).toBeNull();
  });

  it('refuses a declared decompression bomb (dimensions over the pixel cap)', () => {
    // Craft a PNG header declaring 30000x30000 — parseable header, absurd size.
    const bytes = Buffer.from(Buffer.from(PNG_1x1, 'base64')); // start from a real PNG
    bytes.writeUInt32BE(30000, 16); // width
    bytes.writeUInt32BE(30000, 20); // height
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    expect(decodeSignaturePng(dataUrl)).toBeNull();
  });
});
