import {
  BadRequestException,
  Controller,
  Get,
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

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Policy('member')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
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
    doc.stream.pipe(res);
  }
}
