# E-SIGNSOFT

Secure electronic signature and document workflow. Upload a document, place
fields on it, and send it to one or more people. Each recipient gets a
single-use link, consents to sign electronically, and signs. Every completed
document comes back sealed — SHA-256 fingerprint, Ed25519 signature, and a
Certificate of Completion recording who signed, when, and from where.

The claim is provability, not convenience: anyone can re-verify a signed
document later and prove it has not been altered by a single byte.

## Architecture

Four runtime processes:

| Process | Stack | Role |
| --- | --- | --- |
| `api` | NestJS | Stateless HTTP. Holds the database pool and the seal ring. |
| `worker` | BullMQ | Stamps, seals, certifies and delivers. Runs the lifecycle sweeps. |
| `web` | Next.js | The product UI. |
| `sign` | Next.js | The public signing app — deliberately credential-poor. |

Shared packages: `contracts` (Zod schemas — the trust boundary both sides
parse through), `crypto` (sealing, tokens, certificate), `db` (Prisma).

### Tenant isolation

One Postgres database, one shared schema, Row-Level Security. Every tenant
table filters rows against `current_setting('app.tenant_id')`, which is set
per **transaction** so the pattern is safe on a pooled connection.

Tenant identity comes from the verified session and nowhere else. The runtime
role is `docflow_app`, which does not carry `BYPASSRLS` — so isolation holds
even if application code is wrong. `scripts/security-lint.mjs` fails the build
if any code path derives tenant identity from client input.

### The signing app holds nothing

`apps/sign` has three environment variables, no database, and no keys. It
forwards a fixed allowlist of `/sign/*` request shapes to the API using a
narrow relay credential and can do nothing else. Every failure returns a
uniform 404, so a probe cannot distinguish an expired link from a wrong one.

## Development

Requires Node 24, pnpm, and Docker (for the local Redis).

```bash
pnpm install
docker compose up -d          # Redis — Postgres is Neon, storage is R2
pnpm dev                      # api :5100 · web :3200 · sign :3300
```

```bash
pnpm build && pnpm test && pnpm lint   # lint chains the tenant-isolation gate
```

Copy each `.env.example` to `.env` (or `.env.local` for the Next apps) and
fill in the values. The API validates its entire environment at boot and
refuses to start on a bad one, naming the offending keys.

## Deployment

See [DEPLOY.md](DEPLOY.md). The API and worker run on DigitalOcean App
Platform from one image with two entrypoints; the two Next apps run on
Vercel as separate projects.
