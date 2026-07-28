import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TemplateFieldsSchema,
  type TemplateField,
  type TemplateUpdate,
} from '@docflow/contracts';
import { DocumentsService } from '../documents/documents.service.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { readPdfGeometry } from './pdf-geometry.js';
import { findStarter, renderStarter, STARTER_TEMPLATES } from './starter-templates.js';

export interface TemplateWire {
  id: string;
  name: string;
  documentId: string;
  pageCount: number;
  pageSizes: { w: number; h: number }[];
  fields: TemplateField[];
  favorite: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type TemplateSummaryWire = Omit<TemplateWire, 'fields' | 'pageSizes'>;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly db: TenantDb,
    private readonly documents: DocumentsService,
  ) {}

  /** Upload a PDF and create a template over it in one step. */
  async create(name: string, bytes: Buffer): Promise<TemplateWire> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('template name is required');

    // Validate + measure the PDF before storing anything.
    let geometry;
    try {
      geometry = await readPdfGeometry(bytes);
    } catch (cause) {
      // Surface the specific reason when we have one (rotated pages, too many
      // pages) — the sender can act on it; a generic message can't be acted on.
      const reason = (cause as Error).message;
      throw new BadRequestException(
        /rotated|exceeds|no pages/.test(reason) ? reason : 'file is not a readable PDF',
      );
    }

    // Reuse the documents pipeline: magic-byte gate, sha256, R2 put, RLS row.
    const doc = await this.documents.create(trimmed, bytes, 'application/pdf');

    const row = await this.db.tx((tx) =>
      tx.template.create({
        data: {
          name: trimmed.slice(0, 200),
          documentId: doc.id,
          pageCount: geometry.pageCount,
          pageSizes: geometry.pageSizes,
          fields: [],
        },
      }),
    );
    return toWire(row);
  }

  async list(): Promise<TemplateSummaryWire[]> {
    // Favourites first, then most recently used — the order the home shelf and
    // the template picker both want, so neither has to re-sort.
    const rows = await this.db.tx((tx) =>
      tx.template.findMany({
        orderBy: [{ favorite: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    );
    return rows.map(toSummary);
  }

  /** The starter library — a catalog, not stored rows. */
  starters(): { key: string; name: string; category: string; summary: string }[] {
    return STARTER_TEMPLATES.map((s) => ({
      key: s.key,
      name: s.name,
      category: s.category,
      summary: s.summary,
    }));
  }

  /**
   * Copy a starter into this workspace: render the PDF, store it like any
   * upload, and save the fields that the same render pass placed. From here on
   * it is an ordinary template — editable, sendable, and owned by the tenant.
   */
  async createFromStarter(key: string): Promise<TemplateWire> {
    const spec = findStarter(key);
    if (!spec) throw new NotFoundException();

    const { bytes, fields } = await renderStarter(spec);
    const geometry = await readPdfGeometry(bytes);
    const doc = await this.documents.create(spec.name, bytes, 'application/pdf');

    const row = await this.db.tx((tx) =>
      tx.template.create({
        data: {
          name: spec.name,
          documentId: doc.id,
          pageCount: geometry.pageCount,
          pageSizes: geometry.pageSizes,
          // Re-validate through the contract: the generator is ours, but the
          // stored layout must satisfy the same schema as a hand-tagged one.
          fields: TemplateFieldsSchema.parse(
            fields.map((f) => ({ ...f, id: randomUUID(), recipientKey: 'signer' })),
          ),
        },
      }),
    );
    return toWire(row);
  }

  async get(id: string): Promise<TemplateWire> {
    const row = await this.db.tx((tx) => tx.template.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    return toWire(row);
  }

  async update(id: string, patch: TemplateUpdate): Promise<TemplateWire> {
    // Absent means "leave it", so build the data object field by field.
    const data: { name?: string; fields?: TemplateField[]; favorite?: boolean } = {};
    if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 200) || 'Untitled';
    if (patch.favorite !== undefined) data.favorite = patch.favorite;
    if (patch.fields !== undefined) {
      // Re-validate against the current PDF's real page count — the contract
      // guarantees shape, but not that page N exists in THIS document.
      const row = await this.db.tx((tx) => tx.template.findUnique({ where: { id } }));
      if (!row) throw new NotFoundException();
      const fields = TemplateFieldsSchema.parse(patch.fields);
      for (const f of fields) {
        if (f.page > row.pageCount) {
          throw new BadRequestException(`field on page ${f.page} but document has ${row.pageCount}`);
        }
      }
      data.fields = fields;
    }

    // updateMany (not update) so a wrong/foreign id touches zero rows under RLS
    // and returns a clean 404, never a cross-tenant leak via the error.
    const { count } = await this.db.tx((tx) =>
      tx.template.updateMany({ where: { id }, data }),
    );
    if (count === 0) throw new NotFoundException();
    return this.get(id);
  }
}

function toWire(row: {
  id: string;
  name: string;
  documentId: string;
  pageCount: number;
  pageSizes: unknown;
  fields: unknown;
  favorite: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TemplateWire {
  return {
    id: row.id,
    name: row.name,
    documentId: row.documentId,
    pageCount: row.pageCount,
    pageSizes: row.pageSizes as { w: number; h: number }[],
    fields: row.fields as TemplateField[],
    favorite: row.favorite,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: Parameters<typeof toWire>[0]): TemplateSummaryWire {
  const w = toWire(row);
  return {
    id: w.id,
    name: w.name,
    documentId: w.documentId,
    pageCount: w.pageCount,
    favorite: w.favorite,
    lastUsedAt: w.lastUsedAt,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}
