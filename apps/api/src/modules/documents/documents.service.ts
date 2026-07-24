import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { StorageService } from '../../storage/storage.service.js';
import { TenantDb } from '../../tenant/tenant-db.js';

export interface DocumentWire {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

/** Bytes must open with %PDF- — cheap gate now; deep PDF hardening lands with the e-sign phases. */
const PDF_MAGIC = Buffer.from('%PDF-');

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: TenantDb,
    private readonly storage: StorageService,
  ) {}

  async create(name: string, bytes: Buffer, contentType: string): Promise<DocumentWire> {
    if (bytes.length === 0 || !bytes.subarray(0, 5).equals(PDF_MAGIC)) {
      throw new BadRequestException('Only PDF files are accepted');
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const storageKey = this.storage.newKey('documents');

    // Bytes land in storage first; the row commits after. A crash in between
    // leaves an orphaned object (cleaned by lifecycle rules), never a row
    // pointing at nothing.
    await this.storage.put(storageKey, bytes, 'application/pdf');

    const row = await this.db.tx((tx) =>
      tx.document.create({
        // tenant_id comes from the DB default bound to the RLS context.
        data: { name: sanitizeName(name), contentType: 'application/pdf', byteSize: bytes.length, sha256, storageKey },
      }),
    );
    void contentType; // client-claimed type is untrusted; we store the verified one
    return toWire(row);
  }

  async list(): Promise<DocumentWire[]> {
    const rows = await this.db.tx((tx) =>
      tx.document.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    );
    return rows.map(toWire);
  }

  async download(
    id: string,
  ): Promise<{ name: string; contentType: string; byteSize: number; stream: Readable }> {
    // RLS scopes the lookup; a foreign or unknown id is the same 404.
    const row = await this.db.tx((tx) => tx.document.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    const { stream } = await this.storage.getStream(row.storageKey);
    return { name: row.name, contentType: row.contentType, byteSize: row.byteSize, stream };
  }
}

/** Field-by-field, never a spread — the mapper IS the filter. */
function toWire(row: {
  id: string;
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: Date;
}): DocumentWire {
  return {
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Keep a human-readable name; strip path separators and control chars. */
function sanitizeName(name: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  const cleaned = name.replaceAll(/[\\/\u0000-\u001f]/g, '').trim();
  return (cleaned || 'document.pdf').slice(0, 200);
}
