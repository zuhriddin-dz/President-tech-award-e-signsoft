import { pipeline } from 'node:stream/promises';
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Policy } from '../../common/policy.js';
import { DocumentsService, type DocumentWire } from './documents.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // multer enforces while reading — Content-Length is a claim

// This endpoint takes exactly one file part and no other fields. Without these
// caps multer keeps busboy's defaults (fields: Infinity, fieldSize: 1MB each),
// letting an authenticated caller OOM the shared process with thousands of
// text fields — Content-Length can't gate it (enforced while streaming).
const UPLOAD_LIMITS = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  fields: 0,
  parts: 2,
  fieldSize: 1024,
  headerPairs: 32,
} as const;

@Controller('documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Policy('member')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  async upload(@UploadedFile() file?: Express.Multer.File): Promise<DocumentWire> {
    if (!file) throw new BadRequestException('file field is required');
    return this.documents.create(file.originalname, file.buffer, file.mimetype);
  }

  @Get()
  @Policy('viewer')
  async list(): Promise<{ documents: DocumentWire[] }> {
    return { documents: await this.documents.list() };
  }

  @Get(':id/download')
  @Policy('viewer')
  async download(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.documents.download(id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Length', doc.byteSize);
    // RFC 5987 filename* carries the UTF-8 name safely; plain filename gets ASCII fallback.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
    );
    res.setHeader('Cache-Control', 'no-store');

    // pipeline (not pipe) destroys BOTH streams if either end fails: an R2
    // mid-transfer reset can no longer emit an unhandled 'error' on the source
    // and crash the whole process, and a client abort tears down the R2 socket
    // instead of leaking it from the shared connection pool. Headers are
    // already flushed, so a mid-stream failure yields a truncated body (inherent
    // to streaming) — but the process and the pool stay healthy.
    try {
      await pipeline(doc.stream, res);
    } catch (err) {
      this.logger.error(`download ${id} stream aborted: ${(err as Error).message}`);
    }
  }
}
