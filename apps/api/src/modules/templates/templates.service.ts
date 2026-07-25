import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TemplateFieldsSchema,
  type TemplateField,
  type TemplateUpdate,
} from '@docflow/contracts';
import { DocumentsService } from '../documents/documents.service.js';
import { TenantDb } from '../../tenant/tenant-db.js';
import { readPdfGeometry } from './pdf-geometry.js';

export interface TemplateWire {
  id: string;
  name: string;
  documentId: string;
  pageCount: number;
  pageSizes: { w: number; h: number }[];
  fields: TemplateField[];
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
    } catch {
      throw new BadRequestException('file is not a readable PDF');
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
    const rows = await this.db.tx((tx) =>
      tx.template.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    );
    return rows.map(toSummary);
  }

  async get(id: string): Promise<TemplateWire> {
    const row = await this.db.tx((tx) => tx.template.findUnique({ where: { id } }));
    if (!row) throw new NotFoundException();
    return toWire(row);
  }

  async update(id: string, patch: TemplateUpdate): Promise<TemplateWire> {
    // Absent means "leave it", so build the data object field by field.
    const data: { name?: string; fields?: TemplateField[] } = {};
    if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 200) || 'Untitled';
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
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}
