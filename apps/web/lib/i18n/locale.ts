import { en } from './en';
import { ru } from './ru';
import { uz } from './uz';

/**
 * Languages for the PUBLIC LANDING PAGE only.
 *
 * Deliberately scoped: this lives in `apps/web/lib`, not in a shared workspace
 * package, because nothing else in the product is translated. The signing
 * ceremony, every email, and the Certificate of Completion stay English, and
 * keeping the catalogue local means there is no import path by which a
 * half-translated string can leak into them.
 *
 * Uzbek is the Latin script — the official orthography and what younger
 * readers scan fastest. Russian covers the older business register and much of
 * the region.
 */
export const LOCALES = ['en', 'uz', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

/** The English catalogue IS the shape; uz and ru are declared against it. */
export type Messages = typeof en;

const CATALOGUES: Record<Locale, Messages> = { en, uz, ru };

/** Short label for the switcher — the code a visitor recognises at a glance. */
export const LOCALE_CODE: Record<Locale, string> = { en: 'EN', uz: 'UZ', ru: 'RU' };

/** Each language names itself in itself, so the option is legible to whoever wants it. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  uz: 'Oʻzbekcha',
  ru: 'Русский',
};

/**
 * Where the choice is remembered. A plain cookie rather than a URL segment:
 * the landing page is one route with anchor links, and /uz#security would mean
 * rewriting every internal link and every share of the bare domain.
 */
export const LOCALE_COOKIE = 'esignsoft_locale';

/** Parse an untrusted value; anything unknown becomes English. */
export function toLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : 'en';
}

/** The catalogue for a locale. Total — normalises first, never returns undefined. */
export function messages(locale: Locale): Messages {
  return CATALOGUES[toLocale(locale)];
}

// `getLocale()` lives in ./server.ts, NOT here. This module is imported by the
// language switcher, which is a client component, and anything reaching for
// `next/headers` from a client bundle fails the build outright — so the
// server-only half is kept behind its own import path.
