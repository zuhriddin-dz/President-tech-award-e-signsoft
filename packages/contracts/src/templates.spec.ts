import { describe, expect, it } from 'vitest';
import { TemplateFieldSchema, TemplateUpdateSchema, FieldTypeSchema } from './index.js';

const base = {
  id: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f',
  type: 'signature',
  page: 1,
  x: 0.1,
  y: 0.1,
  w: 0.2,
  h: 0.05,
};

describe('TemplateFieldSchema', () => {
  it('accepts a valid field and applies defaults', () => {
    const f = TemplateFieldSchema.parse(base);
    expect(f.required).toBe(true);
    expect(f.recipientKey).toBe('signer');
  });

  it('rejects a field that runs past the page bounds', () => {
    expect(() => TemplateFieldSchema.parse({ ...base, x: 0.9, w: 0.2 })).toThrow();
    expect(() => TemplateFieldSchema.parse({ ...base, y: 0.99, h: 0.1 })).toThrow();
  });

  it('rejects out-of-range coordinates and unknown types', () => {
    expect(() => TemplateFieldSchema.parse({ ...base, x: -0.1 })).toThrow();
    expect(() => TemplateFieldSchema.parse({ ...base, type: 'hologram' })).toThrow();
    expect(() => TemplateFieldSchema.parse({ ...base, page: 0 })).toThrow();
  });

  it('covers all 12 field types', () => {
    expect(FieldTypeSchema.options).toHaveLength(12);
  });
});

describe('TemplateUpdateSchema', () => {
  it('requires at least one of name or fields', () => {
    expect(() => TemplateUpdateSchema.parse({})).toThrow();
    expect(TemplateUpdateSchema.parse({ name: 'X' }).name).toBe('X');
  });
});
