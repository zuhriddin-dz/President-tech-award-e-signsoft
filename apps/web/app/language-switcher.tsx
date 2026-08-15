'use client';

import { useState } from 'react';
import { LOCALES, LOCALE_CODE, LOCALE_COOKIE, LOCALE_NAME, type Locale } from '@/lib/i18n/locale';

/**
 * EN / UZ / RU for the landing page.
 *
 * Three visible buttons rather than a dropdown: with exactly three options a
 * menu hides the fact that the other languages exist, and a visitor who cannot
 * read the current one has to guess what the control does. The codes are
 * legible in any script, and each carries its language's own name as a title.
 *
 * The choice is written to a cookie and the SERVER component re-renders, so
 * the page is translated at the source rather than swapped in the browser —
 * no flash of English, and a shared link opens in the reader's own language.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const [pending, setPending] = useState(false);

  function choose(next: Locale) {
    if (next === current) return;
    // A year, path-wide, Lax: this is a display preference, not a credential.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setPending(true);
    // A real reload, NOT router.refresh(). refresh() re-renders the server
    // tree but deliberately PRESERVES client component state, which left the
    // hero demo holding the previous language's contract while every label
    // around it had already changed — a key on the component does not help,
    // because the instance is preserved across a refresh by design. A language
    // change is a whole-page change, so reload the whole page and no part of
    // it can be left speaking the old one.
    window.location.reload();
  }

  return (
    <div
      className="flex items-center rounded-md border border-border p-0.5"
      role="group"
      aria-label="Change language"
    >
      {LOCALES.map((code) => {
        const active = code === current;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            // Pressed state, not a link: nothing navigates, and a screen reader
            // should hear which language is currently in effect.
            aria-pressed={active}
            title={LOCALE_NAME[code]}
            disabled={pending}
            className={
              'rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ' +
              (active
                ? 'bg-brand text-brand-ink'
                : 'text-ink-muted hover:bg-surface-muted hover:text-ink')
            }
          >
            {LOCALE_CODE[code]}
          </button>
        );
      })}
    </div>
  );
}
