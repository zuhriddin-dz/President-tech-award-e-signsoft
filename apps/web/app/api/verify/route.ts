import type { NextRequest } from 'next/server';

/**
 * The public verification hop.
 *
 * Deliberately NOT the catch-all BFF next door: that one swaps a Clerk session
 * for a bearer token and answers 401 without one, which is exactly wrong here.
 * Verification has to work for someone who has never heard of us. A more
 * specific route wins over the catch-all, so /api/verify lands here.
 *
 * It exists at all so API_ORIGIN stays server-side and the browser keeps
 * talking same-origin — no CORS to configure, and the API's address is not
 * published to everyone who opens the page.
 */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:5100';

export async function POST(req: NextRequest): Promise<Response> {
  // Read and re-serialise rather than streaming the body through. The payload
  // is one 64-character digest; parsing it here means a malformed request is
  // rejected at our edge instead of occupying an API worker.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const upstream = await fetch(new URL('/verify', API_ORIGIN), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The API rate-limits per IP. Without this every verification in the
      // world arrives from the same Vercel address and shares one budget.
      'x-client-ip':
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        'unknown',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  // Same reason as the BFF: fetch has already decompressed the body, so
  // forwarding content-encoding would tell the browser to gunzip plain JSON.
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
