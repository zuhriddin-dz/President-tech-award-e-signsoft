import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateFolderSchema, type CreateFolder, type Folder } from '@docflow/contracts';
import { Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { SignatureRequestsService } from './signature-requests.service.js';

/**
 * Folders are filing, not permissions — a folder never widens who can see an
 * envelope; RLS decides that and nothing here changes it.
 */
@Controller('folders')
export class FoldersController {
  constructor(private readonly requests: SignatureRequestsService) {}

  @Get()
  @Policy('viewer')
  async list(): Promise<{ folders: Folder[] }> {
    return { folders: await this.requests.listFolders() };
  }

  @Post()
  @Policy('member')
  async create(
    @Body(new ZodValidationPipe(CreateFolderSchema)) body: CreateFolder,
  ): Promise<Folder> {
    return this.requests.createFolder(body.name);
  }
}
