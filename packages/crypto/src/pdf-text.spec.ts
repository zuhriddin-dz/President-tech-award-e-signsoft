import { describe, expect, it } from 'vitest';
import { toPdfSafeText } from './pdf-text.js';

describe('toPdfSafeText', () => {
  it('passes printable ASCII and Latin-1 accents through unchanged', () => {
    expect(toPdfSafeText('José Muñoz-Peña')).toBe('José Muñoz-Peña');
    expect(toPdfSafeText('a-z 0-9 !?@#')).toBe('a-z 0-9 !?@#');
  });

  it('transliterates common typographic marks', () => {
    expect(toPdfSafeText('‘quote’')).toBe("'quote'");
    expect(toPdfSafeText('“q”')).toBe('"q"');
    expect(toPdfSafeText('a—b…')).toBe('a-b...');
  });

  it('replaces unrepresentable characters with ? instead of throwing', () => {
    // These are exactly the inputs that make pdf-lib throw and would wedge a token.
    expect(toPdfSafeText('日本語')).toBe('???');
    expect(toPdfSafeText('Владимир')).not.toMatch(/[Ѐ-ӿ]/);
    expect(toPdfSafeText('emoji 😀 here')).toBe('emoji ? here');
  });

  it('flattens tabs/newlines to spaces and never emits control chars', () => {
    const out = toPdfSafeText('a\tb\nc\rd');
    expect(out).toBe('a b c d');
    // No codepoint below 0x20 survives.
    expect([...out].every((c) => c.codePointAt(0) >= 0x20)).toBe(true);
  });
});
