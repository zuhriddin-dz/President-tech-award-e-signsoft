import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { envelopeOf } from './all-exceptions.filter.js';

describe('error envelope', () => {
  it('keeps deliberate 4xx messages', () => {
    expect(envelopeOf(new NotFoundException('no such document'))).toEqual({
      statusCode: 404,
      error: 'NotFoundException',
      message: 'no such document',
    });
    expect(envelopeOf(new ForbiddenException()).statusCode).toBe(403);
  });

  it('turns ANY unexpected error into an opaque 500 — no stack, no SQL, no detail', () => {
    const dbError = new Error(
      'connect ECONNREFUSED — SELECT * FROM tenants WHERE secret_column = ...',
    );
    const envelope = envelopeOf(dbError);
    expect(envelope).toEqual({ statusCode: 500, error: 'Internal Server Error' });
    expect(JSON.stringify(envelope)).not.toMatch(/SELECT|ECONNREFUSED|stack/i);
  });
});
