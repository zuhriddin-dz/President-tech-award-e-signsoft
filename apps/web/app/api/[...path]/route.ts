import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

/**
 * The BFF catch-all: the browser only ever talks same-origin /api/*; this
 * route forwards to the NestJS API server-side, swapping the httpOnly Clerk
 * session cookie for a short-lived Bearer token. The API origin and tokens
 * never reach the browser.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5100';

// Only what the API needs crosses the hop — cookies and identity-shaped
// headers never ride along in either direction.
const FORWARD_REQUEST_HEADERS = ['content-type', 'accept'];
const DROP_RESPONSE_HEADERS = new Set(['set-cookie', 'transfer-encoding']);

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return Response.json({ statusCode: 401, error: 'Unauthorized' }, { status: 401 });

  const url = new URL(`/${path.join('/')}`, API_ORIGIN);
  url.search = req.nextUrl.search;

  const headers = new Headers({ authorization: `Bearer ${token}` });
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: req.body,
    // @ts-expect-error -- undici needs duplex for streamed request bodies
    duplex: 'half',
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROP_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, (await ctx.params).path);
}
