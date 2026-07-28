# DocFlow — document automation & secure e-signature SaaS

Read this before touching anything. It holds the facts that shape every edit;
folder `CLAUDE.md`s (mapped at the bottom) own the detail for their area and
**win over this file** where they disagree.

`docflow-saas-design.md` is the **vision and roadmap**, not the live map — the
code is the authority on what exists, this file on how it is built.
`tms-platform/` is a **separate live project**: read-only reference, never edit.

---

## The one fact that shapes everything: shared-schema + RLS

ONE Postgres. Every tenant table carries `tenant_id` and a Postgres
**Row-Level Security** policy. Isolation is enforced by the *database*, not by
remembering to write a `where` clause.

```sql
ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "x" FORCE  ROW LEVEL SECURITY;      -- FORCE: owners bypass plain RLS
CREATE POLICY tenant_isolation ON "x"
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

- `app.tenant_id` is set **per transaction** (`set_config(..., true)` — `is_local`,
  so it can never leak to the pooled connection's next borrower).
- No context → `NULL` → every policy false → **fail closed**.
- The `tenant_id` column defaults from that setting, so **inserts never pass a
  tenant id** — the row is stamped by the session context.
- `users` is **global identity, not tenant-scoped**. `tenants` and `memberships`
  are scoped. Tenant-facing reads reach users by joining through `memberships`.
- `APP_DATABASE_URL` must be the **runtime app role**, never `neondb_owner`
  (BYPASSRLS). FORCE is the second belt, not the first.

### Tenant identity has exactly one home

`apps/api/src/tenant/` is **the sanctioned territory** — the only folder
`security-lint` exempts. Tenant identity is derived from a verified session
there, rides in CLS, and is read through `TenantContext`.

- Every tenant-scoped query goes through **`TenantDb.tx()`**. No exceptions.
- **Never** take a `tenantId` parameter outside that folder.
- **Never** read a tenant from client data — header, query, body, subdomain.
- The signer path is sessionless: `SigningTokenResolver` hashes the presented
  token, resolves it via `resolve_signing_token` (SECURITY DEFINER, since RLS
  context doesn't exist yet), then `enterAsSigner()`. **Resolution only says
  which tenant to open** — the caller must still re-check the hash and the
  status/expiry under RLS.

---

## The bar: security > correctness > speed

When they conflict, the earlier one wins, every time. Say so out loud when you
trade one for another.

**Under all three: good code is code we can change later.** This project will
grow for years. Prefer the version that is easy to understand, lightweight, and
open on top — a later field or rule is *added* as a piece, not unpicked from the
middle. When two versions both work, ship the one that's easier to delete. Never
buy that with security or correctness.

## The non-negotiables

- **Default deny.** `PolicyGuard` is a global `APP_GUARD`; a route without
  `@Policy()` is **refused**. Policies: `public` | `session` | `sign-relay` |
  `viewer` | `member` | `admin` | `owner` (RBAC from day 1, never binary auth).
- **The frontends are credential-poor.** `apps/web` and `apps/sign` never import
  Prisma or `@docflow/db`. `web` reaches the API through its BFF
  (`app/api/[...path]`, swapping the httpOnly Clerk cookie for a short-lived
  Bearer); `sign` relays `/sign/*` only, with a narrow secret.
- **The signing surface is never an oracle.** Every failure on `apps/sign` and
  every `sign-relay` rejection is the same **uniform 404** — bad token, expired,
  rate-limited, API down. Never a 429, never a distinguishing message.
- **`packages/contracts` is the trust boundary.** Zod schemas are the one source
  of truth for both sides of the BFF. All input is validated there.
- **Secrets never land in the repo or the logs.** `.env.example` carries
  generators, never values. Never log a raw token, secret, or key; the pino
  redaction list is structural, not a habit.
- **Seal keys are separate from auth keys**, long-lived, exactly one active.
- **Nothing heavy on the request path.** Stamp → hash → seal → certificate,
  email, and webhooks are BullMQ jobs. BullMQ re-delivers, so **every processor
  must be idempotent** — guard side effects on a deterministic key.
- **ESM.** Relative imports carry the `.js` specifier (`./tenant-db.js`).
- **Env vars are added to `apps/api/src/config/env.ts` and nowhere else** — Zod,
  fail-fast at boot. No stray `process.env` reads.

---

## Shape of the system

| Package | Port | What it is |
|---|---|---|
| `apps/api` | 5100 | NestJS, stateless. Second entrypoint `worker.ts` (BullMQ), scaled independently. |
| `apps/web` | 3200 | Next.js dashboard + marketing. Clerk auth, BFF proxy. |
| `apps/sign` | 3300 | Public signing ceremony. Credential-poor relay, no datastore. |
| `packages/contracts` | — | Zod schemas + `API_PATHS`. The trust boundary. |
| `packages/crypto` | — | Ed25519 seal, signing tokens, certificate, PDF text, PNG bounds. Framework-free. |
| `packages/db` | — | Prisma + the RLS migrations. |
| `packages/config` | — | Shared tsconfig + eslint. |

Postgres (Neon, pooled) · Redis (BullMQ, rate limits) · R2/S3 (all document
bytes; DB stores pointers only) · Clerk (app auth) · Resend (email).

**Where we are:** the M1 e-sign core is largely built — templates + tagging,
send, public ceremony, stamp/seal/certificate pipeline, dashboard, verify,
lifecycle sweeps. Billing (M2) and workflow automation (M3) are not.

## Adding a tenant-scoped table

1. Model in `packages/db/prisma/schema.prisma` — `tenantId` with the
   `current_setting` default, `@@index([tenantId, ...])`, `@@map` to snake_case.
2. `pnpm --filter @docflow/db db:migrate` — then **hand-add** `ENABLE` + `FORCE`
   + the `tenant_isolation` policy to the generated SQL. Prisma does not write
   RLS. **A new tenant table without a policy is a security bug, not a style nit.**
3. `pnpm --filter @docflow/db db:generate`.
4. Cover it in `packages/db/src/rls.spec.ts`.

## Verify before you claim it's done

```bash
pnpm lint          # turbo lint + security-lint (RULE1/2/3)
pnpm test          # every package's vitest suite
pnpm --filter @docflow/db db:status   # migrated, no drift
```

`pnpm security-lint` runs the gate alone. It is **security-tier red** — never
work around a finding by renaming a variable; the rule is describing a real
architectural breach.

---

## Folder `CLAUDE.md` map

Folder docs auto-load when you work in their area and are the authority there.
**This is currently the only one.** As an area settles, write its doc and add
the row:

| File | Owns | Status |
|---|---|---|
| `/CLAUDE.md` | the core fact, the bar, the map | this file |
| `apps/api/CLAUDE.md` | boot + request pipeline, the global module set | to write |
| `apps/api/src/tenant/CLAUDE.md` | the sanctioned territory: CLS → RLS, signer resolution | to write |
| `apps/api/src/common/CLAUDE.md` | policy guard, error envelope, rate limit, validation | to write |
| `apps/api/src/modules/CLAUDE.md` | the slice pattern + how to add a domain | to write |
| `apps/sign/CLAUDE.md` | the relay perimeter + the uniform-404 rule | to write |
| `packages/db/CLAUDE.md` | schema, the RLS migration ritual | to write |
| `packages/crypto/CLAUDE.md` | seal, tokens, certificate — the audited invariants | to write |
| `packages/contracts/CLAUDE.md` | the contract as trust boundary | to write |

<!-- Keep current: update this file only when a fact here stops being true —
     a new app or package, a change to the tenancy model, the bar, or the
     non-negotiables. Detail belongs in the folder doc, not here. -->
