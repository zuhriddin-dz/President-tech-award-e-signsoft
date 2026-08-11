import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SealService } from '@docflow/crypto';
import { PublicVerifyResultSchema } from '@docflow/contracts';
import { VerifyService } from './verify.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

const pem = generateKeyPairSync('ed25519')
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
const seal = new SealService([{ kid: 'test-seal', privateKeyPkcs8Pem: pem, state: 'active' }]);

const REQUEST_ID = '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f';
const SIGNED_AT = new Date('2026-08-01T09:00:00.000Z');
const HASH = 'a'.repeat(64);

/** A prisma stub whose $queryRaw returns whatever rows the test wants. */
const prismaReturning = (rows: unknown[]) =>
  ({ $queryRaw: vi.fn(async () => rows) }) as unknown as PrismaService;

function sealedRow(overrides: Partial<Record<string, unknown>> = {}) {
  const { signature, kid } = seal.seal({
    requestId: REQUEST_ID,
    signedAt: SIGNED_AT,
    documentHash: HASH,
  });
  return {
    request_id: REQUEST_ID,
    completed_at: SIGNED_AT,
    seal_signature: signature,
    seal_kid: kid,
    ...overrides,
  };
}

describe('VerifyService.byHash', () => {
  it('verifies a document whose fingerprint matches a sealed row', async () => {
    const svc = new VerifyService(prismaReturning([sealedRow()]), seal);
    const result = await svc.byHash(HASH);
    expect(result.verified).toBe(true);
    expect(result.sealedAt).toBe(SIGNED_AT.toISOString());
    expect(result.sealKid).toBe('test-seal');
    // The wire shape is a contract with a page we do not control the build of.
    expect(() => PublicVerifyResultSchema.parse(result)).not.toThrow();
  });

  // A changed byte changes the fingerprint, so there is simply no row. This is
  // the tamper path, and it must not be reported any differently from a
  // document we never sealed — the holder's answer is the same.
  it('reports not-verified when nothing matches, disclosing nothing', async () => {
    const svc = new VerifyService(prismaReturning([]), seal);
    const result = await svc.byHash('b'.repeat(64));
    expect(result).toMatchObject({ verified: false, sealedAt: null, sealKid: null });
  });

  it('gives a tampered file the SAME answer as an unknown one', async () => {
    const svc = new VerifyService(prismaReturning([]), seal);
    const tampered = await svc.byHash('c'.repeat(64));
    const unknown = await svc.byHash('d'.repeat(64));
    const shape = (r: Awaited<ReturnType<typeof svc.byHash>>) => ({ ...r, checkedAt: '' });
    expect(shape(tampered)).toEqual(shape(unknown));
  });

  /**
   * The seal is bound to {requestId, signedAt, hash}, not to the bytes alone.
   * A row carrying a signature made for a DIFFERENT request must not verify —
   * this is what stops a genuine seal being lifted onto another document.
   */
  it('refuses a seal that belongs to a different request', async () => {
    const other = seal.seal({
      requestId: '11111111-2222-3333-4444-555555555555',
      signedAt: SIGNED_AT,
      documentHash: HASH,
    });
    const svc = new VerifyService(
      prismaReturning([sealedRow({ seal_signature: other.signature })]),
      seal,
    );
    expect((await svc.byHash(HASH)).verified).toBe(false);
  });

  it('refuses a seal made for a different signing time', async () => {
    const other = seal.seal({
      requestId: REQUEST_ID,
      signedAt: new Date('2026-08-02T09:00:00.000Z'),
      documentHash: HASH,
    });
    const svc = new VerifyService(
      prismaReturning([sealedRow({ seal_signature: other.signature })]),
      seal,
    );
    expect((await svc.byHash(HASH)).verified).toBe(false);
  });

  it('refuses a signature from a key that is not in the ring', async () => {
    const strangerPem = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const stranger = new SealService([
      { kid: 'not-ours', privateKeyPkcs8Pem: strangerPem, state: 'active' },
    ]);
    const forged = stranger.seal({
      requestId: REQUEST_ID,
      signedAt: SIGNED_AT,
      documentHash: HASH,
    });
    const svc = new VerifyService(
      prismaReturning([sealedRow({ seal_signature: forged.signature, seal_kid: 'not-ours' })]),
      seal,
    );
    expect((await svc.byHash(HASH)).verified).toBe(false);
  });

  // Everything this route returns is readable by anyone on the internet.
  it('never discloses anything beyond the verdict, the time and the key id', async () => {
    const svc = new VerifyService(prismaReturning([sealedRow()]), seal);
    const keys = Object.keys(await svc.byHash(HASH)).sort();
    expect(keys).toEqual(['checkedAt', 'sealKid', 'sealedAt', 'verified']);
  });
});
