import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SealService, parseSealRing, type SealKey } from './seal.js';

// The seal is the claim "this document has not changed since it was signed."
// If it can be forged, verified against the wrong content, or fail open, the
// whole evidentiary product is worthless — so these tests attack it.

function pem(): string {
  return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}
function key(kid: string, state: 'active' | 'retiring' = 'active'): SealKey {
  return { kid, privateKeyPkcs8Pem: pem(), state };
}

const HASH = createHash('sha256').update('the signed pdf bytes').digest('hex');
const P = { requestId: 'req_1', signedAt: new Date('2026-07-25T12:00:00.000Z'), documentHash: HASH };

describe('SealService', () => {
  it('seals with the active key and verifies its own seal', () => {
    const svc = new SealService([key('seal-1')]);
    const { signature, kid } = svc.seal(P);
    expect(kid).toBe('seal-1');
    expect(svc.verify(P, signature, kid)).toBe(true);
  });

  it('REJECTS a seal checked against a different hash (the tamper case)', () => {
    const svc = new SealService([key('seal-1')]);
    const { signature, kid } = svc.seal(P);
    const altered = createHash('sha256').update('tampered pdf').digest('hex');
    expect(svc.verify({ ...P, documentHash: altered }, signature, kid)).toBe(false);
  });

  it('REJECTS a seal replayed onto a DIFFERENT request (context binding)', () => {
    const svc = new SealService([key('seal-1')]);
    const { signature, kid } = svc.seal(P);
    expect(svc.verify({ ...P, requestId: 'req_OTHER' }, signature, kid)).toBe(false);
    expect(svc.verify({ ...P, signedAt: new Date('2026-07-25T12:00:01.000Z') }, signature, kid)).toBe(
      false,
    );
  });

  it('rejects a corrupted signature', () => {
    const svc = new SealService([key('seal-1')]);
    const { signature, kid } = svc.seal(P);
    const flipped = Buffer.from(signature, 'base64');
    flipped[0] ^= 0xff;
    expect(svc.verify(P, flipped.toString('base64'), kid)).toBe(false);
  });

  it('rejects a seal made by a DIFFERENT installation (foreign key, same kid)', () => {
    const mine = new SealService([key('seal-1')]);
    const theirs = new SealService([key('seal-1')]);
    const forged = theirs.seal(P);
    expect(mine.verify(P, forged.signature, forged.kid)).toBe(false);
  });

  it('returns false — never throws — for an unknown kid or garbage input', () => {
    const svc = new SealService([key('seal-1')]);
    const { signature } = svc.seal(P);
    expect(svc.verify(P, signature, 'no-such-key')).toBe(false);
    expect(svc.verify(P, 'not base64 !!!', 'seal-1')).toBe(false);
    expect(svc.verify(P, '', 'seal-1')).toBe(false);
  });

  it('still verifies seals made by a key that has since been retired', () => {
    const oldKey = key('seal-old');
    const sealed = new SealService([oldKey]).seal(P);
    const rotated = new SealService([{ ...oldKey, state: 'retiring' }, key('seal-new')]);
    expect(rotated.seal(P).kid).toBe('seal-new'); // new seals use the new key
    expect(rotated.verify(P, sealed.signature, 'seal-old')).toBe(true); // old still verifies
  });

  it('fails closed on an ambiguous keyring', () => {
    expect(() => new SealService([key('a'), key('b')])).toThrow(/active/);
    expect(() => new SealService([key('dup'), key('dup', 'retiring')])).toThrow(/duplicate/);
    expect(() => new SealService([key('only', 'retiring')])).toThrow(/active/);
  });

  it('fails closed at boot on a non-Ed25519 key (wrong-type footgun)', () => {
    const rsaPem = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => new SealService([{ kid: 'rsa-1', privateKeyPkcs8Pem: rsaPem, state: 'active' }])).toThrow(
      /Ed25519/,
    );
  });
});

describe('parseSealRing', () => {
  it('accepts a valid ring and rejects malformed ones', () => {
    const ring = [key('a'), key('b', 'retiring')];
    expect(parseSealRing(JSON.stringify(ring))).toHaveLength(2);
    expect(() => parseSealRing(JSON.stringify([key('a'), key('b')]))).toThrow(/active/);
    expect(() => parseSealRing('[]')).toThrow();
    expect(() => parseSealRing('not json')).toThrow();
  });
});
