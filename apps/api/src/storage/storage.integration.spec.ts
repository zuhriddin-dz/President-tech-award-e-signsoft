/**
 * Live R2 roundtrip as the real credentials — proves bucket, token scope,
 * tenant prefixing, and byte fidelity. Skipped when S3 points at CI dummies.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { ClsServiceManager } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { TenantContext } from '../tenant/tenant-context.js';
import { StorageService } from './storage.service.js';

const live = env.S3_ENDPOINT.includes('r2.cloudflarestorage.com');
const cls = ClsServiceManager.getClsService();
const context = new TenantContext(cls);
const storage = new StorageService(context);

async function drain(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe.skipIf(!live)('R2 storage (live)', () => {
  it('roundtrips bytes under the tenant prefix and refuses foreign keys', async () => {
    await cls.run(async () => {
      const tenant = randomUUID();
      context.enter({ userId: 'u', clerkUserId: 'c', tenantId: tenant, role: 'ADMIN' });

      const key = storage.newKey('probe');
      expect(key.startsWith(`tenants/${tenant}/probe/`)).toBe(true);

      const bytes = randomBytes(64 * 1024);
      await storage.put(key, bytes, 'application/octet-stream');
      const { stream } = await storage.getStream(key);
      expect((await drain(stream)).equals(bytes)).toBe(true);
      await storage.delete(key);

      // Another tenant's key — uniform 404 without ever hitting the bucket.
      await expect(storage.getStream(`tenants/${randomUUID()}/probe/x`)).rejects.toThrow();
    });
  }, 60_000);
});
