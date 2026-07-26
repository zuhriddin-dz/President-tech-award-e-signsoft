import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

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

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
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

  // 2. Body ceiling. Content-Length is only a claim (chunked omits it); the
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
  headers.set('x-client-ip', clientIp(req));
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
