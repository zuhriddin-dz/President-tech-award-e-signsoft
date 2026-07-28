import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  StarterPickSchema,
  TemplateUpdateSchema,
  type StarterPick,
  type TemplateUpdate,
} from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  TemplatesService,
  type TemplateSummaryWire,
  type TemplateWire,
} from './templates.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// One file part, one text field (the name) — nothing else. Prevents the
// unbounded-fields memory-exhaustion vector (same lesson as the documents slice).
const UPLOAD_LIMITS = {
  fileSize: MAX_UPLOAD_BYTES,
  files: 1,
  fields: 1,
  parts: 3,
  fieldSize: 512,
  headerPairs: 32,
} as const;

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @Policy('member')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  async create(
    @Body('name') name: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<TemplateWire> {
    if (!file) throw new BadRequestException('file field is required');
    return this.templates.create(name ?? file.originalname, file.buffer);
  }

  @Get()
  @Policy('viewer')
  async list(): Promise<{ templates: TemplateSummaryWire[] }> {
    return { templates: await this.templates.list() };
  }

  /**
   * The starter library. Declared BEFORE @Get(':id') — Nest matches in
   * declaration order, and 'starters' would otherwise be parsed as a uuid.
   */
  @Get('starters')
  @Policy('viewer')
  starters(): { starters: { key: string; name: string; category: string; summary: string }[] } {
    return { starters: this.templates.starters() };
  }

  /** Copy a starter into this workspace as a real, editable template. */
  @Post('from-starter')
  @Policy('member')
  async fromStarter(
    @Body(new ZodValidationPipe(StarterPickSchema)) body: StarterPick,
  ): Promise<TemplateWire> {
    return this.templates.createFromStarter(body.key);
  }

  @Get(':id')
  @Policy('viewer')
  async get(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<TemplateWire> {
    return this.templates.get(id);
  }

  @Patch(':id')
  @Policy('member')
  async update(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Body(new ZodValidationPipe(TemplateUpdateSchema)) body: TemplateUpdate,
  ): Promise<TemplateWire> {
    return this.templates.update(id, body);
  }
}
