import { describe, expect, it } from 'vitest';
import type { TemplateField } from '@docflow/contracts';
import { autoValue, blockingFields, canFinish, fieldKind, fieldProblem } from './sign-fields';

/**
 * Finish is enabled exactly when the API will accept the submit. If this side
 * let through something the server refuses, the signer would get the uniform
 * "link not valid" page instead of a signed document.
 */

function field(
  id: string,
  type: TemplateField['type'],
  required = true,
  options?: string[],
): TemplateField {
  return {
    id,
    type,
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

describe('fieldKind', () => {
  it('fills only Date Signed for the signer — names and email are typed', () => {
    expect(fieldKind(field('d', 'date'))).toBe('auto');
    for (const type of ['name', 'first_name', 'last_name', 'email', 'date_input'] as const) {
      expect(fieldKind(field('x', type))).toBe('input');
    }
    expect(fieldKind(field('s', 'signature'))).toBe('signature');
  });

  it('shows the signing day in Date Signed and nothing in any other box', () => {
    expect(autoValue(field('d', 'date'), '9/19/2026')).toBe('9/19/2026');
    expect(autoValue(field('n', 'name'), '9/19/2026')).toBe('');
    expect(autoValue(field('e', 'email'), '9/19/2026')).toBe('');
  });
});

describe('fieldProblem', () => {
  it('explains a bad value in the box', () => {
    expect(fieldProblem(field('n', 'number'), 'abc')).toMatch(/Numbers only/);
  });

  it('passes a good one', () => {
    expect(fieldProblem(field('n', 'number'), '42')).toBeNull();
    expect(fieldProblem(field('e', 'email'), 'jordan@example.com')).toBeNull();
  });

  it('says nothing about an empty box — that is the required check', () => {
    expect(fieldProblem(field('n', 'number'), '')).toBeNull();
  });

  it('refuses a choice the sender did not offer', () => {
    const dropdown = field('c', 'dropdown', true, ['Yes', 'No']);
    expect(fieldProblem(dropdown, 'Maybe')).not.toBeNull();
    expect(fieldProblem(dropdown, 'Yes')).toBeNull();
  });

  it('never judges boxes the signer does not type into', () => {
    expect(fieldProblem(field('d', 'date'), 'anything')).toBeNull();
    expect(fieldProblem(field('s', 'signature'), 'data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('canFinish', () => {
  it('waits on a required box holding only spaces — the server trims it to empty', () => {
    const fields = [field('t', 'text')];
    expect(canFinish(fields, { t: '   ' })).toBe(false);
    expect(canFinish(fields, { t: 'ok' })).toBe(true);
  });

  it('waits on a bad value even in an optional box — the server would refuse the signature', () => {
    const fields = [field('n', 'number', false)];
    expect(canFinish(fields, { n: 'abc' })).toBe(false);
    expect(canFinish(fields, { n: '' })).toBe(true);
  });

  it('never waits on Date Signed', () => {
    expect(canFinish([field('d', 'date')], {})).toBe(true);
  });

  it('waits on a required name the signer has not typed', () => {
    expect(canFinish([field('n', 'name')], {})).toBe(false);
    expect(canFinish([field('n', 'name')], { n: 'Jordan Rivera' })).toBe(true);
  });

  it('lists what blocks Finish in document order', () => {
    const fields = [field('a', 'text'), field('b', 'number', false), field('c', 'email')];
    expect(blockingFields(fields, { b: 'x1' }).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });
});
