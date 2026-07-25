import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validate a request body against a Zod schema at the boundary. A parse failure
 * is a 400 with the field paths only — never the raw values, and never a stack.
 * The parsed (and defaulted/stripped) value is what reaches the handler, so an
 * over-posted extra key cannot ride into a service.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const paths = result.error.issues
        .map((i) => i.path.join('.') || '(root)')
        .join(', ');
      throw new BadRequestException(`invalid request: ${paths}`);
    }
    return result.data;
  }
}
