# Deploying E-SIGNSOFT

Four runtime pieces, split across two platforms:

| Piece | Where | Why there |
| --- | --- | --- |
| `apps/web` — product UI | **Vercel** | Next.js; serverless suits it |
| `apps/sign` — public signing app | **Vercel** | Next.js; separate project, separate origin |
| `apps/api` — NestJS HTTP | **DigitalOcean** App Platform | Long-lived, holds DB pool + keys |
| worker — BullMQ consumer | **DigitalOcean** App Platform | See below |

Already managed elsewhere: **Neon** (Postgres), **Cloudflare R2** (documents),
**Clerk** (identity), **Resend** (email). Only Redis has to be added.

### Why the worker cannot go on Vercel

It is a long-lived BullMQ consumer holding an open Redis connection, plus
`setInterval` sweeps for reconciliation, expiry and reminders. Serverless
functions are killed between requests, so nothing would consume the queue and
no sweep would ever fire — signatures would commit but never get sealed or
delivered. It needs a process that stays up. Same reason the API is not on
Vercel: it holds a Postgres pool and the Ed25519 seal ring.

---

## Order of operations

Do these in order. Steps 3 and 4 depend on knowing the hostnames from 2 and 5,
which is circular — resolve it by setting placeholder values first and
correcting them at step 6.

### 1. Redis

App Platform's own managed Redis (Valkey) keeps traffic inside DigitalOcean's
network. Upstash also works and has a free tier.

Either way you need a `rediss://` URL (TLS). The app's producer connection is
already configured to fail fast rather than hang if Redis is unreachable.

### 2. API + worker → DigitalOcean

The spec is committed at [`.do/app.yaml`](.do/app.yaml). Edit the two
`github.repo` fields to your repository, then:

```bash
doctl apps create --spec .do/app.yaml
```

Both services build from the same [`Dockerfile`](Dockerfile) at the repo root
— one image, two entrypoints. The worker overrides the command with
`node dist/worker.js`. That is deliberate: a version skew between API and
worker means a job written in one shape gets read in another, and building
both from one image makes that impossible.

Set every `type: SECRET` value in the App Platform UI. They are listed as
placeholders in the spec; nothing real is committed.

### 3. Database migration

App Platform does **not** run migrations for you, and the app does not
self-migrate on boot — that would let a rolling deploy run two schema versions
at once.

Run it yourself, from your machine, against the **direct** (non-pooler) Neon
host as `neondb_owner`:

```bash
cd packages/db && DATABASE_URL="<neon-direct-url>" pnpm db:deploy
```

The runtime role is `docflow_app`, which deliberately cannot alter the schema.

### 4. Web + sign → Vercel

Two **separate** Vercel projects from the same repository. Separate origins is
a security property, not a convenience: the signing app is credential-poor by
design, and sharing an origin with the product would hand it the product's
cookies.

For each project:

| Setting | `apps/web` | `apps/sign` |
| --- | --- | --- |
| Root Directory | `apps/web` | `apps/sign` |
| Framework | Next.js | Next.js |
| Build / install | from its `vercel.json` | from its `vercel.json` |

Both `vercel.json` files build from the repo root through turbo, so the
workspace packages (`@docflow/contracts`, `@docflow/crypto`) are built first.

### 5. Domains

| Host | Points at |
| --- | --- |
| `esignsoft.uz` | Vercel — `apps/web` |
| `sign.esignsoft.uz` | Vercel — `apps/sign` |
| `api.esignsoft.uz` | DigitalOcean — `api` service |

### 6. Close the loop

Now that the hostnames exist, correct the placeholders:

- DO `api`/`worker`: `SIGN_APP_URL` → `https://sign.esignsoft.uz`
- Vercel `web`: `API_ORIGIN` → `https://api.esignsoft.uz`
- Vercel `sign`: `MAIN_API_URL` → `https://api.esignsoft.uz`,
  `NEXT_PUBLIC_APP_URL` → `https://esignsoft.uz`

Redeploy all four.

---

## Environment variables

### DigitalOcean — `api` and `worker` (identical sets)

| Key | Notes |
| --- | --- |
| `APP_DATABASE_URL` | Neon **pooled** host, role `docflow_app`. **Never `neondb_owner`** — it has `BYPASSRLS` and walks through every tenant isolation policy. |
| `CLERK_SECRET_KEY` | Production instance (`sk_live_…`). |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2. Token scoped to the one bucket. |
| `REDIS_URL` | `rediss://` from step 1. |
| `ESIGN_SEAL_KEYS` | Ed25519 seal ring JSON. **Back this up off-platform** — see the warning below. |
| `RESEND_API_KEY` | |
| `EMAIL_FROM` | Must be a verified domain — see below. |
| `SIGN_APP_URL` | Base of every signing link. Wrong value = every invite dead on arrival. |
| `SIGN_RELAY_SECRET` | ≥32 bytes. Must be **identical** to the sign app's copy. |
| `ESIGN_LINK_TTL_DAYS`, `REMINDER_AFTER_DAYS`, `REMINDER_MAX` | Optional; sensible defaults in `env.ts`. |

The API refuses to boot on a bad environment — `parseEnv` validates the whole
set and throws with the offending key names (never values). A missing variable
fails the deploy loudly instead of at the first request.

### Vercel — `apps/web`

| Key | Notes |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `API_ORIGIN` | `https://api.esignsoft.uz` |

### Vercel — `apps/sign`

Three values, and that is the entire secret surface of this app. It holds no
database, no keys, no Clerk credentials — a full compromise yields the
`/sign/*` relay and nothing else.

| Key | Notes |
| --- | --- |
| `MAIN_API_URL` | `https://api.esignsoft.uz` |
| `SIGN_RELAY_SECRET` | Identical to the API's. |
| `NEXT_PUBLIC_APP_URL` | `https://esignsoft.uz`. Public by definition — only builds the post-signing "create an account" link. |

---

## Testing the image locally

The image builds and runs the same way App Platform will:

```bash
docker build -t esignsoft-api .
docker run --rm --env-file /tmp/esignsoft.env -p 5100:5100 esignsoft-api
curl -s localhost:5100/health          # {"status":"ok"}
```

Two local-only wrinkles, neither of which affects the deploy:

**`--env-file` cannot read `apps/api/.env` directly.** Docker takes everything
after the first `=` literally — surrounding quotes and trailing CR included —
where Node's `process.loadEnvFile` strips both. Generate a clean copy:

```bash
./scripts/docker-env.sh > /tmp/esignsoft.env
```

Delete it afterwards; it holds real secrets. On App Platform env values are
raw strings in the UI or the app spec, so there is no quoting layer at all.

**`localhost` inside a container is the container.** A dev Redis on the host
needs an explicit route:

```bash
docker run --rm --add-host=host.docker.internal:host-gateway \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  --env-file /tmp/esignsoft.env -p 5100:5100 esignsoft-api
```

The worker runs from the same image with the command overridden:

```bash
docker run --rm --env-file /tmp/esignsoft.env esignsoft-api node dist/worker.js
```

## Things that will bite you

**The seal ring is irreplaceable.** `ESIGN_SEAL_KEYS` signs every Certificate
of Completion. Lose it and every certificate ever issued becomes unverifiable
— the one thing the product promises stops being true, retroactively. Store a
copy somewhere that is not this platform.

**Email will not reach anyone until the domain is verified.** If `EMAIL_FROM`
is still `onboarding@resend.dev`, Resend delivers **only to your own account's
inbox**. Verify `esignsoft.uz` in Resend (SPF + DKIM DNS records), then set
`EMAIL_FROM` to an address at that domain. Until then you cannot send a real
signing invite to a real counterparty.

**Clerk needs a production instance.** The current keys are `pk_test_` /
`sk_test_`. Create a production instance, add all three hostnames to its
allowed origins, and swap the keys.

**Run migrations before the deploy goes live**, not after. A running API
against an un-migrated database fails at the first query, not at boot.

**`SIGN_RELAY_SECRET` must match exactly** across the API and the sign app. A
mismatch makes every signing link return a uniform 404 — by design, the relay
gives no hint about *why* a request failed, so this misconfiguration looks
identical to an expired link.
