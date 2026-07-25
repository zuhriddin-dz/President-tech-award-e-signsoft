import { createHash, randomBytes } from 'node:crypto';

/**
 * Signing-token primitives — the pure half of the "single-use, expiring,
 * hashed" signing link. The ATOMIC CLAIM and expiry live in the database
 * (a conditional UPDATE on the signature-request row, added when those tables
 * exist); these functions are the crypto underneath it.
 *
 * The invariants they enforce:
 * - 256 bits of CSPRNG output — no dictionary, no rainbow table, so an
 *   UNSALTED sha256 is as unguessable as the token itself.
 * - The raw token travels ONCE (into the invite link) and is never stored or
 *   logged; only the sha256 hex persists, on the request row.
 * - Verification is a keyed LOOKUP by hash, never a string compare — so there
 *   is no comparison to make constant-time.
 */

export interface MintedSigningToken {
  /** The opaque bearer value — handed to the caller once, goes only into the link. */
  token: string;
  /** sha256(token) hex — the only form ever persisted. */
  sha256: string;
}

/** Mint a fresh signing token. The raw value exists only in the return here. */
export function mintSigningToken(): MintedSigningToken {
  const token = randomBytes(32).toString('base64url');
  return { token, sha256: hashSigningToken(token) };
}

/** sha256 hex of a presented raw token — the lookup key against the stored hash. */
export function hashSigningToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** sha256 hex of PDF (or any) bytes — the document fingerprint the seal covers. */
export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
