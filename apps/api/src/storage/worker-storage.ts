import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

/**
 * Object storage for the WORKER — same private bucket, no Nest DI and no
 * request context.
 *
 * New keys are derived as SIBLINGS of an existing key rather than built from a
 * tenant id, so this layer never has to name a tenant at all: if the source
 * document lives at tenants/<id>/documents/<uuid>, its signed copy lands at
 * tenants/<id>/signed/<uuid>. Same isolation, one less thing to get wrong.
 */
let s3: S3Client | null = null;

function client(): S3Client {
  s3 ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'auto',
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}

/** `tenants/<id>/documents/<uuid>` + "signed" → `tenants/<id>/signed/<uuid>`. */
export function siblingKey(existingKey: string, kind: string): string {
  const parts = existingKey.split('/');
  if (parts.length < 3 || parts[0] !== 'tenants') {
    throw new Error(`unexpected storage key shape: ${existingKey}`);
  }
  return `${parts[0]}/${parts[1]}/${kind}/${randomUUID()}`;
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}
