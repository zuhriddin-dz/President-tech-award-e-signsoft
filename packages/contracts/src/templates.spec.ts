import { describe, expect, it } from 'vitest';
import {
  FieldTypeSchema,
  MeResponseSchema,
  TemplateFieldSchema,
  TemplateUpdateSchema,
} from './index.js';

describe('MeResponseSchema', () => {
  it('includes the workspace kind and rejects an unknown kind', () => {
    const good = {
      userId: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f',
      role: 'OWNER',
      tenant: {
        id: '3f2f1a10-9c3b-4b2e-9d3e-2a1b3c4d5e6f',
        name: 'Acme',
        kind: 'company',
        createdAt: '2026-08-01T09:00:00.000Z',
      },
    };
    expect(MeResponseSchema.parse(good).tenant?.kind).toBe('company');
    expect(() =>
      MeResponseSchema.parse({ ...good, tenant: { ...good.tenant, kind: 'enterprise' } }),
    ).toThrow();
  });
});

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

  // The exact list, not a count. A count catches a deletion; the list also
  // catches a RENAME — and these strings are a wire contract shared by the
  // tagging editor, the PDF stamper and the signing app, so a quiet rename
  // would strand fields that were already placed on live templates.
  it('carries exactly the field types the editor and stamper agree on', () => {
    expect(FieldTypeSchema.options).toEqual([
      'signature', 'initial', 'stamp', 'date', 'name', 'first_name',
      'last_name', 'email', 'company', 'title', 'text', 'number',
      'phone', 'address', 'checkbox', 'dropdown', 'radio',
    ]);
  });
});

describe('TemplateUpdateSchema', () => {
  it('requires at least one of name or fields', () => {
    expect(() => TemplateUpdateSchema.parse({})).toThrow();
    expect(TemplateUpdateSchema.parse({ name: 'X' }).name).toBe('X');
  });
});
