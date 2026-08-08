/**
 * @docflow/crypto — the e-signature crown jewels, lifted from tms-platform's
 * independently audited engine. Framework-free so both the API and the worker
 * import it. The heavy pipeline (stamp -> hash -> seal -> certificate) is
 * assembled from these primitives in the worker when the signing tables exist.
 */
export {
  SealService,
  sealKeySchema,
  sealRingSchema,
  parseSealRing,
  type SealKey,
  type SealPayload,
} from './seal.js';
export {
  mintSigningToken,
  hashSigningToken,
  sha256Hex,
  type MintedSigningToken,
} from './tokens.js';
export {
  buildCertificatePdf,
  type CertificateInput,
  type CertificateSigner,
} from './certificate.js';
export { toPdfSafeText } from './pdf-text.js';
export {
  isPng,
  pngDimensions,
  decodeSignaturePng,
  MAX_SIGNATURE_PIXELS,
  MAX_SIGNATURE_BYTES,
} from './png-bytes.js';

export const PACKAGE_NAME = '@docflow/crypto' as const;
