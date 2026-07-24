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

  const res = await fetch(new URL(path, API_ORIGIN), {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return schema.parse(await res.json()) as z.infer<S>;
}
