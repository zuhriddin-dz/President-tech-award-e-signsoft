import { describe, expect, it } from 'vitest';
import { fieldValueProblem, type TemplateField } from '@docflow/contracts';
import { toPdfSafeText } from '@docflow/crypto';
import { resolveFieldValues } from './field-values.js';

const facts = { signedAt: new Date('2026-07-27T10:30:00.000Z') };

function field(id: string, type: string, required = false, options?: string[]): TemplateField {
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
    ...(options ? { options } : {}),
  };
}

describe('resolveFieldValues', () => {
  it('IGNORES a signer-forged Date Signed — the signing moment is server truth', () => {
    const { values } = resolveFieldValues([field('d', 'date')], { d: '2020-01-01' }, facts);
    expect(values.d).toBe('2026-07-27');
  });

  it('keeps the name and email the signer typed — signer-authored since 2026-09', () => {
    const fields = [
      field('n', 'name'),
      field('f', 'first_name'),
      field('l', 'last_name'),
      field('e', 'email'),
    ];
    const typed = { n: 'Oʻktam Gʻulomov', f: 'Oʻktam', l: 'Gʻulomov', e: 'oktam@example.uz' };
    const { values, invalid } = resolveFieldValues(fields, typed, facts);
    expect(invalid).toEqual([]);
    expect(values).toEqual(typed);
  });

  it('keeps genuinely free-form input values, trimmed', () => {
    const fields = [
      field('t', 'text'),
      field('c', 'company'),
      field('k', 'checkbox'),
      field('dt', 'date_input'),
    ];
    const { values } = resolveFieldValues(
      fields,
      { t: '  my note ', c: 'Acme Ltd', k: 'true', dt: '2026-12-31' },
      facts,
    );
    expect(values).toEqual({ t: 'my note', c: 'Acme Ltd', k: 'true', dt: '2026-12-31' });
  });

  it('REFUSES a value that breaks its field rule — only reachable by bypassing the signing app', () => {
    const fields = [
      field('num', 'number'),
      field('em', 'email'),
      field('ph', 'phone'),
      field('dt', 'date_input'),
      field('nm', 'name'),
      field('tx', 'text'),
    ];
    const { values, invalid } = resolveFieldValues(
      fields,
      { num: '12abc', em: 'not-an-email', ph: '12', dt: '2026-02-30', nm: 'R2D2', tx: 'Привет' },
      facts,
    );
    expect(invalid).toEqual(['num', 'em', 'ph', 'dt', 'nm', 'tx']);
    expect(values).toEqual({});
  });

  it('refuses a choice the sender never offered', () => {
    const fields = [field('c', 'dropdown', false, ['Yes', 'No'])];
    expect(resolveFieldValues(fields, { c: 'Maybe' }, facts).invalid).toEqual(['c']);
    expect(resolveFieldValues(fields, { c: 'Yes' }, facts).values).toEqual({ c: 'Yes' });
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

  it('reports required inputs left blank — a box of spaces is blank', () => {
    const fields = [field('t', 'text', true), field('n', 'name', true), field('c', 'company', true)];
    const { missingRequired } = resolveFieldValues(fields, { t: '   ', c: 'filled' }, facts);
    expect(missingRequired).toEqual(['t', 'n']);
  });

  it('refuses an over-long value instead of quietly truncating it', () => {
    const fields = [field('t', 'text')];
    expect(resolveFieldValues(fields, { t: 'x'.repeat(501) }, facts).invalid).toEqual(['t']);
  });
});

describe('the typed-text rules against the stamper', () => {
  // The rules promise a signer that what they type is what the sealed PDF
  // shows. That only holds while every character a box accepts is one the
  // WinAnsi stamper prints as itself or transliterates — never as '?'. If
  // either side changes alone, this is where it shows.
  it.each(['text', 'name'] as const)(
    'every character a %s box accepts reaches the PDF as something other than "?"',
    (type) => {
      const leaks: string[] = [];
      for (let cp = 0x20; cp <= 0x2fff; cp++) {
        const ch = String.fromCodePoint(cp);
        // Between letters, so trimming cannot hide the character under test.
        if (ch === '?' || fieldValueProblem(type, `a${ch}a`) !== null) continue;
        if (toPdfSafeText(ch) === '?') leaks.push(`U+${cp.toString(16).toUpperCase()}`);
      }
      expect(leaks).toEqual([]);
    },
  );
});
