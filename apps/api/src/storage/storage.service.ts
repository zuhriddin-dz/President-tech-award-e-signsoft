import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { env } from '../config/env.js';
import { TenantContext } from '../tenant/tenant-context.js';

/**
 * All document bytes live in the PRIVATE R2 bucket and stream through this
 * API — never a presigned browser URL. Every key is prefixed with the
 * caller's tenant (from verified context, never an argument), so even a
 * confused caller cannot read or write outside its tenant's prefix.
 */
@Injectable()
export class StorageService {
  private readonly s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });

  constructor(private readonly context: TenantContext) {}

  /** Mint a fresh tenant-prefixed key. `kind` is a short path segment like "documents". */
  newKey(kind: string): string {
    const tenant = this.context.requireAuth().tenantId;
    return `tenants/${tenant}/${kind}/${randomUUID()}`;
  }

  /** Refuse any key outside the current tenant's prefix — defense in depth. */
  private assertOwnKey(key: string): void {
    const tenant = this.context.requireAuth().tenantId;
    if (!key.startsWith(`tenants/${tenant}/`)) throw new NotFoundException();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.assertOwnKey(key);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Returns a Node Readable of the object bytes (or 404, uniformly). */
  async getStream(key: string): Promise<{ stream: Readable; byteLength?: number }> {
    this.assertOwnKey(key);
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      );
      return { stream: res.Body as Readable, byteLength: res.ContentLength };
    } catch {
      // Missing object or storage hiccup — the client learns only "not found".
      throw new NotFoundException();
    }
  }

  async delete(key: string): Promise<void> {
    this.assertOwnKey(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}
