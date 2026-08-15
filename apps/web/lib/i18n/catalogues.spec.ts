import { describe, expect, it } from 'vitest';
import { LOCALES, LOCALE_CODE, LOCALE_NAME, messages, toLocale, type Messages } from './locale';
import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';

/**
 * The compiler already proves SHAPE — `uz: typeof en` will not build with a key
 * missing. These tests cover what types cannot see: that the copy is actually
 * translated, that the tuples stayed the right length, and above all that the
 * hero demo's tamper target survived translation.
 */

/** Every leaf in a catalogue, as dotted path → value. Arrays are leaves. */
function leaves(obj: object, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [p, leaf] of leaves(v, path)) out.set(p, leaf);
    } else {
      out.set(path, v);
    }
  }
  return out;
}

const TRANSLATIONS: [string, Messages][] = [
  ['uz', uz],
  ['ru', ru],
];

describe('landing catalogues', () => {
  const enLeaves = leaves(en);

  it('exposes exactly the three declared locales, each with a code and a name', () => {
    expect([...LOCALES]).toEqual(['en', 'uz', 'ru']);
    for (const l of LOCALES) {
      expect(messages(l), l).toBeDefined();
      expect(LOCALE_CODE[l], l).toBeTruthy();
      // Each language names itself in itself, so the switcher is legible to
      // whoever is looking for their own language.
      expect(LOCALE_NAME[l], l).toBeTruthy();
    }
  });

  it.each(TRANSLATIONS)('%s has the same keys as English', (_n, cat) => {
    expect([...leaves(cat).keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it.each(TRANSLATIONS)('%s keeps every tuple the same length as English', (_n, cat) => {
    // The card and table rows are tuples. A translator dropping the body of a
    // [title, body] pair would render an empty card rather than fail to build.
    for (const [path, value] of leaves(cat)) {
      if (!Array.isArray(value)) continue;
      expect(Array.isArray(enLeaves.get(path)), path).toBe(true);
      expect(value.length, path).toBe((enLeaves.get(path) as unknown[]).length);
      for (const [i, part] of value.entries()) {
        expect(String(part).trim(), `${path}[${i}]`).not.toBe('');
      }
    }
  });

  it.each(TRANSLATIONS)('%s leaves no string blank', (_n, cat) => {
    for (const [path, value] of leaves(cat)) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('');
    }
  });

  it.each(TRANSLATIONS)('%s is really translated, not copied from English', (_n, cat) => {
    const identical: string[] = [];
    for (const [path, value] of leaves(cat)) {
      if (typeof value !== 'string') continue;
      if (value === enLeaves.get(path)) identical.push(path);
    }
    expect(identical.length, `identical to English: ${identical.join(', ')}`).toBeLessThan(4);
  });

  it('renders the year in every footer', () => {
    for (const l of LOCALES) expect(messages(l).footer.tagline(2026)).toContain('2026');
  });
});

/**
 * The one coupling in this feature that fails SILENTLY.
 *
 * `hero-proof.tsx` builds its tampered document with
 * `contract.replace('18,400,000', '1,400,000')`. If a translation reformats
 * that figure — 18 400 000, 18.400.000, or into Cyrillic digits — the replace
 * matches nothing, the button leaves the text untouched, and the demo quietly
 * stops demonstrating anything. Nothing throws. Nothing looks broken.
 */
describe('hero demo tamper target', () => {
  const TAMPER_FROM = '18,400,000';

  it.each([...LOCALES])('%s contract contains the exact figure the button rewrites', (locale) => {
    expect(messages(locale).proof.contract).toContain(TAMPER_FROM);
  });

  it.each([...LOCALES])('%s tampering actually changes the document', (locale) => {
    const contract = messages(locale).proof.contract;
    expect(contract.replace(TAMPER_FROM, '1,400,000')).not.toBe(contract);
  });
});

describe('Russian character-count agreement', () => {
  // 1 символ / 2–4 символа / 5+ символов, with 11–14 taking the plural anyway.
  it.each([
    [1, 'символ'],
    [2, 'символа'],
    [4, 'символа'],
    [5, 'символов'],
    [11, 'символов'],
    [14, 'символов'],
    [21, 'символ'],
    [22, 'символа'],
    [59, 'символов'],
  ])('%i takes %s', (n, word) => {
    expect(ru.proof.oneEdit(n as number)).toContain(`${n} ${word}`);
  });
});

describe('Uzbek orthography', () => {
  it("spells oʻ and gʻ with U+02BB, never an ASCII or curly apostrophe", () => {
    // Uzbek Latin has two distinct modifier letters, and neither is an
    // apostrophe: U+02BB in oʻ/gʻ, and U+02BC for the glottal stop (maʼlumot).
    // Typing ' instead is the common shortcut and reads as wrong. This also
    // catches soʻm, which is the same letter and easy to leave as so'm.
    const WRONG = /[OoGg]['‘’]/;
    const offenders: string[] = [];
    for (const [path, value] of leaves(uz)) {
      for (const part of Array.isArray(value) ? value : [value]) {
        if (typeof part !== 'string') continue;
        const hit = WRONG.exec(part);
        if (hit) offenders.push(`${path}: ${JSON.stringify(hit[0])} in "${part.slice(0, 60)}"`);
      }
    }
    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('actually flags a wrong apostrophe (the check is not vacuous)', () => {
    // Guards the guard: an earlier version of the regex above had a lookahead
    // that made it match nothing, so the suite passed while checking nothing.
    const WRONG = /[OoGg]['‘’]/;
    expect(WRONG.test("O'zbekcha")).toBe(true);
    expect(WRONG.test("qog'oz")).toBe(true);
    expect(WRONG.test("so'm")).toBe(true);
    expect(WRONG.test('Oʻzbekcha')).toBe(false);
    expect(WRONG.test('qogʻoz')).toBe(false);
    expect(WRONG.test('soʻm')).toBe(false);
    // The glottal stop uses a different letter and must not be flagged.
    expect(WRONG.test('maʼlumot')).toBe(false);
  });
});

describe('toLocale', () => {
  it('passes through the known locales', () => {
    for (const l of LOCALES) expect(toLocale(l)).toBe(l);
  });

  it('falls back to English for anything else, including a tampered cookie', () => {
    for (const bad of [null, undefined, '', 'de', 'EN', 'uz-Latn', '../en', 'en; DROP TABLE']) {
      expect(toLocale(bad), String(bad)).toBe('en');
    }
  });
});
