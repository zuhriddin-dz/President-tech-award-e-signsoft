import { describe, expect, it } from 'vitest';
import {
  FIELD_VALUE_RULES,
  FieldTypeSchema,
  fieldValueProblem,
  sanitizeFieldInput,
  type FieldType,
} from './index.js';

/**
 * These rules are the whole promise to a signer that what they type is what
 * the sealed document shows — and to the API that the signing app already
 * refused anything it would refuse. Both sides import them, so these tests are
 * the one place their meaning is pinned.
 */

describe('fieldValueProblem', () => {
  it.each([
    ['number', '42'],
    ['number', '-3.5'],
    ['number', '3,75'],
    ['phone', '+998 90 123 45 67'],
    ['phone', '(555) 123-4567'],
    ['email', 'jordan@example.com'],
    ['name', 'Jordan Rivera'],
    ['name', 'Oʻktam Gʻulomov'],
    ['name', "O'Neil"],
    ['name', 'Anne-Marie Dupré'],
    ['first_name', 'José'],
    ['last_name', 'Oʻktamov'],
    ['text', 'Payment due in 30 days — “net”'],
    ['address', '12 Amir Temur St, Tashkent'],
    ['company', 'AT&T (UZ) LLC'],
    ['date_input', '2026-09-19'],
    ['date_input', '2024-02-29'],
    ['checkbox', 'true'],
  ])('accepts %s %j', (type, value) => {
    expect(fieldValueProblem(type as FieldType, value)).toBeNull();
  });

  it.each([
    ['number', 'abc'],
    ['number', '4 2'],
    ['number', '1.2.3'],
    ['number', '--1'],
    ['phone', '12345'],
    ['phone', '+998+90 123'],
    ['phone', '1'.repeat(16)],
    ['phone', 'call me'],
    ['email', 'not-an-email'],
    ['email', 'a@b'],
    ['name', 'R2D2'],
    ['name', "'-."],
    ['first_name', 'Владимир'],
    ['text', 'Привет'],
    ['text', '日本語'],
    ['date_input', '2026-02-30'],
    ['date_input', '19.09.2026'],
    ['date_input', '1899-12-31'],
    ['checkbox', 'false'],
  ])('refuses %s %j, in words the signer can act on', (type, value) => {
    expect(fieldValueProblem(type as FieldType, value)).toBe(
      FIELD_VALUE_RULES[type as FieldType]!.hint,
    );
  });

  it('lets an empty or blank value through — "not filled" belongs to the required check', () => {
    expect(fieldValueProblem('number', '')).toBeNull();
    expect(fieldValueProblem('number', '   ')).toBeNull();
  });

  it('judges the trimmed value', () => {
    expect(fieldValueProblem('number', '  42  ')).toBeNull();
  });

  it('refuses a value longer than the box allows', () => {
    expect(fieldValueProblem('text', 'x'.repeat(500))).toBeNull();
    expect(fieldValueProblem('text', 'x'.repeat(501))).not.toBeNull();
  });

  it('has nothing to say about boxes the signer never types into', () => {
    expect(fieldValueProblem('signature', 'anything')).toBeNull();
    expect(fieldValueProblem('date', 'anything')).toBeNull();
  });
});

describe('FIELD_VALUE_RULES', () => {
  it('classifies every field type — a new type must be decided before it compiles', () => {
    expect(Object.keys(FIELD_VALUE_RULES).sort()).toEqual([...FieldTypeSchema.options].sort());
  });

  it('gives the boxes the signer never types into no rule', () => {
    for (const type of ['signature', 'initial', 'stamp', 'date'] as const) {
      expect(FIELD_VALUE_RULES[type]).toBeNull();
    }
  });
});

describe('sanitizeFieldInput', () => {
  it('drops letters typed into a number box', () => {
    expect(sanitizeFieldInput('number', '4a2b.5')).toBe('42.5');
  });

  it('keeps only the characters a phone number is written with', () => {
    expect(sanitizeFieldInput('phone', '+998 (90) abc 123-45')).toBe('+998 (90)  123-45');
  });

  it('drops digits and symbols from a name, but lets any script through to be explained', () => {
    expect(sanitizeFieldInput('name', 'Jordan2 R!vera')).toBe('Jordan Rvera');
    expect(sanitizeFieldInput('name', 'Владимир')).toBe('Владимир');
  });

  it('drops spaces from an email', () => {
    expect(sanitizeFieldInput('email', 'a b@c.com')).toBe('ab@c.com');
  });

  it('caps the value at the box length', () => {
    expect(sanitizeFieldInput('number', '1'.repeat(40))).toHaveLength(30);
  });

  it('leaves free text alone apart from the cap', () => {
    expect(sanitizeFieldInput('text', 'Hello, world!')).toBe('Hello, world!');
  });

  it('leaves boxes with no rule untouched', () => {
    expect(sanitizeFieldInput('signature', 'x')).toBe('x');
  });
});
