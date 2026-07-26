/**
 * Server-side PNG validation for adopted signatures. The signature arrives
 * base64 from an unauthenticated signer and is about to be embedded in a
 * document this server cryptographically seals — so "the browser canvas
 * produced a clean PNG" is a statement about the honest client only. These
 * checks run on the decoded bytes, server side. Lifted from tms-platform.
 */

/** `\x89PNG\r\n\x1a\n` — the 8-byte PNG signature (RFC 2083), at offset 0. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Buffer): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
}

/**
 * A PNG's declared dimensions from its IHDR, or null if unparseable. Exists to
 * refuse a decompression bomb before any image decoder allocates ~w×h×4 bytes
 * from these numbers — a few-hundred-byte file can declare 30000×30000.
 */
export function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (!isPng(bytes) || bytes.length < 24) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

/** ~64 MB decoder ceiling — far above a real signature, far below a bomb. */
export const MAX_SIGNATURE_PIXELS = 4000 * 4000;

/** The submit cap for the whole signature payload (bytes). */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/**
 * Decode + validate an adopted-signature data URL (`data:image/png;base64,...`)
 * into safe PNG bytes, or null if anything is off — not a PNG, too big, or a
 * bomb. Never throws.
 */
export function decodeSignaturePng(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  if (!/^data:image\/png;base64$/i.test(header)) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!isPng(bytes)) return null;
  const dims = pngDimensions(bytes);
  if (!dims || dims.width * dims.height > MAX_SIGNATURE_PIXELS) return null;
  return bytes;
}
