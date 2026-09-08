import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { allowRequest } from '@/lib/edge-rate-limit';

/**
 * The relay. The browser talks only to this; it forwards to the main API with
 * the narrow /sign/*-only credential and pipes the answer back. It implements
 * NO signing logic — token resolution, expiry, single-use, tenant routing, the
 * hash re-check, the audit write all live in the API and are not duplicated
 * here, which is the entire reason this box is safe to run: no second copy of
 * the security-critical code to drift. What it owns is the perimeter: a hard
 * allowlist of forwardable shapes, header hygiene both ways, and one uniform
 * failure answer. Lifted from tms-platform's audited relay.
 */
export const runtime = 'nodejs';

const MAIN_API_URL = process.env.MAIN_API_URL ?? 'http://localhost:5100';
const RELAY_SECRET = process.env.SIGN_RELAY_SECRET ?? '';
const MAX_SUBMIT_BYTES = 3 * 1024 * 1024;

/** The ONLY shapes forwarded, matched structurally (not by string prefix). */
const ALLOWED: { method: string; tail: string | null }[] = [
  { method: 'GET', tail: null }, // /sign/<token>
  { method: 'GET', tail: 'document' }, // /sign/<token>/document
  { method: 'GET', tail: 'status' }, // /sign/<token>/status      (post-signing)
  { method: 'GET', tail: 'signed' }, // /sign/<token>/signed      (post-signing)
  { method: 'GET', tail: 'certificate' }, // /sign/<token>/certificate (post-signing)
  { method: 'POST', tail: 'consent' }, // /sign/<token>/consent
  { method: 'POST', tail: 'submit' }, // /sign/<token>/submit
];

/** base64url of 32 bytes = 43 chars; bounded + charset-restricted. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;
const FORWARDABLE_REQUEST_HEADERS = new Set(['content-type', 'accept']);
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'set-cookie',
]);

/** One failure answer for the whole service — never an existence oracle. */
function notFound(): NextResponse {
  const res = NextResponse.json({ message: 'This signing link is not valid.' }, { status: 404 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Read a body into memory, aborting the moment it exceeds `limit`. */
async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<ArrayBuffer | null> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer as ArrayBuffer;
}

/**
 * The signer's IP for the audit trail.
 *
 * This value becomes non-repudiation evidence on the Certificate of Completion
 * and the key both rate limiters count against, so the ONLY question that
 * matters is: could the person being recorded have chosen it?
 *
 * This box is the internet-facing edge. Every header on an inbound request is
 * therefore attacker-settable unless the hosting platform sets it itself and
 * overwrites what arrived — which rules out `cf-connecting-ip` (nothing sets it
 * unless Cloudflare actually fronts this origin), `x-real-ip` (conventional,
 * not guaranteed), and the LEFTMOST entry of `x-forwarded-for` (the appendable
 * end of the chain, which is exactly where a forged hop lands).
 *
 * What is left, in order:
 *
 *   1. TRUSTED_CLIENT_IP_HEADER — an explicit opt-in for when a CDN really is
 *      in front. Naming the header is a deployment decision, not a guess, and
 *      it is the ONLY way `cf-connecting-ip` is ever read. Set it to
 *      `cf-connecting-ip` the day Cloudflare is switched on, and not before.
 *   2. x-vercel-forwarded-for — Vercel sets this and strips any inbound copy,
 *      because the whole `x-vercel-*` namespace is reserved to the platform.
 *   3. The RIGHTMOST entry of x-forwarded-for — the hop nearest us, appended by
 *      the proxy that actually accepted the connection. A client can prepend
 *      entries; it cannot append past its own.
 *   4. 'unknown' — an honest blank. A recorded address that a signer could have
 *      chosen is worse than no address at all: it looks like evidence.
 */
function clientIp(req: NextRequest): string {
  const named = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) {
    const value = req.headers.get(named);
    if (value) return firstAddress(value);
  }

  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return firstAddress(vercel);

  const chain = req.headers.get('x-forwarded-for');
  if (chain) {
    const hops = chain
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return bounded(nearest) || 'unknown';
  }

  return 'unknown';
}

/** A single address from a header that may legitimately carry one value. */
function firstAddress(value: string): string {
  return bounded(value.split(',')[0]?.trim() ?? '') || 'unknown';
}

/**
 * An address is short. Anything longer is not one, and forwarding it would let
 * a caller choose the size of a rate-limiter map key and an audit column.
 */
function bounded(value: string): string {
  return value.length > 45 ? '' : value;
}

async function relay(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const method = req.method.toUpperCase();

  // 1. Shape. path is [token] or [token, tail] — nothing else, ever.
  if (path.length < 1 || path.length > 2) return notFound();
  const [token, tail = null] = path;
  if (!token || !TOKEN_SHAPE.test(token)) return notFound();
  if (!ALLOWED.some((a) => a.method === method && a.tail === tail)) return notFound();

  // 2. Edge rate limit, BEFORE any upstream call — a flood is shed here at the
  // edge instead of costing a round-trip and a DB query on the API. Same 404,
  // never a 429 (the surface reveals nothing, not even that you're limited).
  const ip = clientIp(req);
  if (!allowRequest(ip)) return notFound();

  // 3. Body ceiling. Content-Length is only a claim (chunked omits it); the
  // real gate is the bounded read below. This is a fast reject for honest ones.
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_SUBMIT_BYTES) return notFound();

  // 3. Forward. URL REBUILT from validated pieces — inbound path never
  // concatenated onto the base, so there's nothing to escape out of.
  const upstreamPath = tail
    ? `/sign/${encodeURIComponent(token)}/${tail}`
    : `/sign/${encodeURIComponent(token)}`;

  const headers = new Headers();
  for (const [key, value] of req.headers) {
    if (FORWARDABLE_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set('x-internal-auth', RELAY_SECRET);
  headers.set('x-client-ip', ip);
  headers.set('x-request-id', randomUUID());
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);

  // 4. Bounded read — the real memory-exhaustion gate for the one public box.
  let payload: ArrayBuffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const bounded = await readBounded(req.body, MAX_SUBMIT_BYTES);
    if (!bounded) return notFound();
    payload = bounded;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${MAIN_API_URL}${upstreamPath}`, {
      method,
      headers,
      body: payload,
      redirect: 'manual',
    });
  } catch {
    // API unreachable must not look different from a bad token.
    return notFound();
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) resHeaders.set(key, value);
  });
  resHeaders.set('Cache-Control', 'no-store');
  return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const GET = relay;
export const POST = relay;
