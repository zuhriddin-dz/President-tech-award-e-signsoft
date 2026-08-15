import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, toLocale, type Locale } from './locale';

/**
 * The visitor's language, read on the server.
 *
 * Split out from ./locale.ts because that module is also imported by the
 * language switcher, which is a client component: `next/headers` in a client
 * bundle is a hard build failure. The `server-only` import makes that mistake
 * fail here, at the import, with a clear message rather than a confusing one
 * about the Pages Router.
 *
 * The cookie is the ONLY signal. Accept-Language is deliberately not consulted:
 * a laptop in Tashkent set to English would silently get the English page with
 * no hint the others exist, which is exactly the case that matters for a demo.
 * The switcher is always visible instead, and English is the honest default
 * until someone chooses otherwise.
 */
export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
