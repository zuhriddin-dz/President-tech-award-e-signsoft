/**
 * Is there a REAL dependency behind this URL, right now?
 *
 * The integration suites used to gate on the shape of the connection string —
 * `APP_DATABASE_URL.includes('neon.tech')` — which answers a different question
 * than the one that matters. CI sets a placeholder URL and provisions no
 * database, so every one of those suites skipped, including the RLS proof whose
 * own header says "if any of this fails, the tenancy model is broken and
 * nothing else matters". The single most important test in the repository ran
 * nowhere, and a missing policy on a new table would have shipped green.
 *
 * A hostname is also the wrong gate for a second reason: it makes the tests
 * impossible to run against anything but production's provider — so CI could
 * not opt in even after standing a Postgres up.
 *
 * Probing the socket answers the real question and works everywhere: a Postgres
 * service container in CI, a local docker instance, or Neon. When nothing
 * answers, the suite still skips — a developer with no database gets a fast
 * green run, exactly as before.
 */
async function portOpen(host: string, port: number, timeoutMs = 1_500): Promise<boolean> {
  const { Socket } = await import('node:net');
  return new Promise((resolve) => {
    const sock = new Socket();
    const done = (result: boolean) => {
      sock.destroy();
      resolve(result);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
    sock.connect(port, host);
  });
}

/** True when something is listening where this connection string points. */
export async function urlReachable(raw: string | undefined, defaultPort: number): Promise<boolean> {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!url.hostname) return false;
  return portOpen(url.hostname, Number(url.port) || defaultPort);
}

/** The Postgres the app would actually connect to. */
export function databaseUp(databaseUrl: string | undefined): Promise<boolean> {
  return urlReachable(databaseUrl, 5432);
}

/** The Redis BullMQ would actually connect to. */
export function redisUp(redisUrl: string | undefined): Promise<boolean> {
  return urlReachable(redisUrl, 6379);
}

/**
 * Object storage. Unlike Postgres and Redis there is no local stand-in wired
 * up, so this stays a capability check on the configured endpoint: R2 is
 * reachable or the suite skips. Kept as its own function so the storage-backed
 * suites can require BOTH a database and a bucket, and say so.
 */
export function storageUp(endpoint: string): boolean {
  return endpoint.includes('r2.cloudflarestorage.com');
}
