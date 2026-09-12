import type { NextRequest } from 'next/server';
import { readBounded } from '@/lib/read-bounded';

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

/**
 * The narrow credential that makes the address below worth forwarding.
 *
 * The API cannot tell our hop from any other caller — it is on a public origin
 * — so without this it must ignore `x-client-ip` and bucket every verification
 * under one address. Presenting it is what buys back per-visitor limiting.
 * Unset is safe, just coarser: the API falls back to socket-address limiting.
 */
const VERIFY_RELAY_SECRET = process.env.VERIFY_RELAY_SECRET ?? '';

/** {"documentHash":"<64 hex>"} is about 80 bytes; the rest is headroom, not an allowance. */
const MAX_VERIFY_BYTES = 1024;

function tooLarge(): Response {
  return Response.json({ error: 'Request body too large.' }, { status: 413 });
}

/**
 * The visitor's address, from a header the visitor cannot write.
 *
 * `x-vercel-forwarded-for` is set by the platform and any inbound copy is
 * stripped, because the `x-vercel-*` namespace is reserved to it. Failing that,
 * the RIGHTMOST entry of `x-forwarded-for` is the hop that actually accepted
 * the connection — a client can prepend entries to that chain but cannot append
 * past its own. The leftmost entry, which this used to read, is precisely the
 * attacker-writable end.
 */
function visitorAddress(req: NextRequest): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel.slice(0, 45);
  const hops = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const nearest = hops[hops.length - 1];
  return nearest ? nearest.slice(0, 45) : 'unknown';
}

export async function POST(req: NextRequest): Promise<Response> {
  // Read and re-serialise rather than streaming the body through. The payload
  // is one 64-character digest; parsing it here means a malformed request is
  // rejected at our edge instead of occupying an API worker.
  //
  // Bounded, because nothing else bounds it. next.config.ts lets bodies up to
  // 21MiB through middleware so PDF uploads arrive whole, and this route has no
  // session in front of it: an unbounded req.json() would parse and forward
  // that much for anyone who asked. The Content-Length check only turns honest
  // oversized requests away early; the counted read is the real gate.
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_VERIFY_BYTES) return tooLarge();
  const raw = await readBounded(req.body, MAX_VERIFY_BYTES);
  if (!raw) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return Response.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const upstream = await fetch(new URL('/verify', API_ORIGIN), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The API rate-limits per IP. Without this every verification in the
      // world arrives from the same Vercel address and shares one budget — but
      // the API only believes the header when the hop authenticates itself,
      // since on a public origin an unauthenticated one is attacker-chosen.
      'x-client-ip': visitorAddress(req),
      ...(VERIFY_RELAY_SECRET ? { 'x-internal-auth': VERIFY_RELAY_SECRET } : {}),
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
