import 'server-only';
import { auth } from '@clerk/nextjs/server';
import type { z } from 'zod';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5100';

/**
 * Server-component fetch to the API — same trust rules as the BFF route:
 * caller's own token, response parsed through the contract schema so a
 * drifted or over-sharing API response fails HERE, not in a component.
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.infer<S> | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  let res: Response;
  try {
    res = await fetch(new URL(path, API_ORIGIN), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (cause) {
    console.error(`[api] ${path} unreachable at ${API_ORIGIN}:`, cause);
    return null;
  }
  if (!res.ok) {
    // Server-side log only — the page shows a friendly state, never the status.
    console.error(`[api] ${path} -> ${res.status}`);
    return null;
  }
  return schema.parse(await res.json()) as z.infer<S>;
}

/**
 * Like apiGet, but distinguishes the "no workspace yet" state (403
 * ONBOARDING_REQUIRED) from a real failure, so a page can route to the account
 * choice instead of showing an error.
 */
export async function apiGetOrOnboarding<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<
  | { status: 'ok'; data: z.infer<S> }
  | { status: 'onboarding' }
  | { status: 'error' }
> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return { status: 'error' };

  let res: Response;
  try {
    res = await fetch(new URL(path, API_ORIGIN), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (cause) {
    console.error(`[api] ${path} unreachable at ${API_ORIGIN}:`, cause);
    return { status: 'error' };
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === 'ONBOARDING_REQUIRED') return { status: 'onboarding' };
  }
  if (!res.ok) {
    console.error(`[api] ${path} -> ${res.status}`);
    return { status: 'error' };
  }
  return { status: 'ok', data: schema.parse(await res.json()) as z.infer<S> };
}
