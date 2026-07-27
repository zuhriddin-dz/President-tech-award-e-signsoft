import { describe, expect, it } from 'vitest';
import type { TemplateField } from '@docflow/contracts';
import { resolveFieldValues } from './field-values.js';

const facts = {
  recipientName: 'Jordan Rivera',
  recipientEmail: 'jordan@example.com',
  signedAt: new Date('2026-07-27T10:30:00.000Z'),
};

function field(id: string, type: string, required = false): TemplateField {
  return {
    id,
    type: type as TemplateField['type'],
    page: 1,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.03,
    required,
    recipientKey: 'signer',
  };
}

describe('resolveFieldValues — server truth wins', () => {
  it('IGNORES a signer-forged date, name and email (the forgery attack)', () => {
    const fields = [field('d', 'date'), field('n', 'name'), field('e', 'email')];
    const forged = { d: '01 Jan 2020', n: 'Someone Else', e: 'attacker@evil.test' };

    const { values } = resolveFieldValues(fields, forged, facts);

    expect(values.d).toBe('2026-07-27'); // the real signing date
    expect(values.n).toBe('Jordan Rivera'); // the real recipient
    expect(values.e).toBe('jordan@example.com');
  });

  it('derives first/last name from the recipient, not the client', () => {
    const fields = [field('f', 'first_name'), field('l', 'last_name')];
    const { values } = resolveFieldValues(fields, { f: 'Evil', l: 'Hacker' }, facts);
    expect(values.f).toBe('Jordan');
    expect(values.l).toBe('Rivera');
  });

  it('keeps genuinely free-form input values', () => {
    const fields = [field('t', 'text'), field('c', 'company'), field('k', 'checkbox')];
    const { values } = resolveFieldValues(
      fields,
      { t: 'my note', c: 'Acme Ltd', k: 'true' },
      facts,
    );
    expect(values).toEqual({ t: 'my note', c: 'Acme Ltd', k: 'true' });
  });

  it('DROPS keys that are not in the snapshot (no smuggled fields)', () => {
    const fields = [field('t', 'text')];
    const { values } = resolveFieldValues(fields, { t: 'ok', ghost: 'not in template' }, facts);
    expect(values).toEqual({ t: 'ok' });
    expect(values.ghost).toBeUndefined();
  });

  it('never stamps text into signature-kind fields', () => {
    const fields = [field('s', 'signature'), field('i', 'initial'), field('st', 'stamp')];
    const { values } = resolveFieldValues(fields, { s: 'X', i: 'Y', st: 'Z' }, facts);
    expect(values).toEqual({});
  });

  it('reports required inputs the signer left blank', () => {
    const fields = [field('t', 'text', true), field('c', 'company', true)];
    const { missingRequired } = resolveFieldValues(fields, { t: 'filled' }, facts);
    expect(missingRequired).toEqual(['c']);
  });

  it('truncates an over-long value rather than trusting max length', () => {
    const fields = [field('t', 'text')];
    const { values } = resolveFieldValues(fields, { t: 'x'.repeat(5000) }, facts);
    expect(values.t?.length).toBe(500);
  });
});
