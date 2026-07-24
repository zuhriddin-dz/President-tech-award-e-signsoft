# DocFlow — Document Automation & Secure E-Signature SaaS

> Working name: **DocFlow** (rename freely). One-line: *automate the document flow of every company, with legally-defensible secure signing at its core.*
>
> This is a GREENFIELD build, designed to scale, carrying forward the hard-won security lessons of `tms-platform` (whose home-built e-sign engine was independently security-audited as "better than most production codebases") — WITHOUT its trucking-specific code or its DB-per-tenant model. Decisions here were made 2026-07-22.

---

## 1. Vision & positioning

- **Category:** e-signature + document workflow automation (a DocuSign / Dropbox Sign competitor that leads with *workflow*, not just signing).
- **Wedge:** the signing itself is a solved, commoditized feature. The differentiator is **automating the whole document lifecycle** — templates, routing, approvals, reminders, integrations, and analytics — so a company's contracts/onboarding/NDAs/HR docs move themselves.
- **Phasing (owner decision):** ship the **secure e-sign core first** to get paying users on proven ground, then layer **workflow automation** as the moat.
- **Buyers:** SMB self-serve (credit-card, product-led) → mid-market/enterprise (SSO, audit, compliance, API). Design for self-serve first; leave clean seams for enterprise.

## 2. Scale target & guiding principles

- **Target:** ~10,000 daily active users in the foreseeable future, and **architected to scale horizontally well beyond** without a rewrite. 10K DAU × a handful of actions ≈ low-hundreds-of-thousands of operations/day — very manageable **if** the architecture is stateless, queue-backed, and storage/DB are managed and pooled. The point is not raw load today; it's *no scaling wall later*.
- **Principles (non-negotiable):**
  1. **Stateless services** behind a load balancer; any instance can serve any request; scale by adding instances.
  2. **Nothing heavy on the request path** — PDF sealing, email, webhooks, thumbnailing all run on an async **job queue** with retries.
  3. **All documents in object storage**, never on app disk; DB stores metadata + pointers only.
  4. **Security is a property of the architecture, not a review step** — carry §7's wins from day one.
  5. **Multi-tenant isolation is enforced in the database** (Row-Level Security), not just in application code.
  6. **Every write is idempotent** (idempotency keys) and every external call is retryable.
  7. **Observability from commit #1** — structured logs, metrics, traces, error tracking.

## 3. Product scope

### Phase A — Secure E-Signature Core (MVP; the revenue-earning slice)
- Organizations (tenants) + workspaces; **self-serve signup**; team members with **roles from day 1** (Owner / Admin / Member / Viewer — do NOT defer RBAC; it was the biggest gap in tms).
- Document upload (PDF-first); **template creation** with drag-drop field tagging (signature, initial, stamp, date, name, email, company, title, text, checkbox — the 12 field types already designed in tms).
- **Send for signature** by email; **public signing ceremony** on a separate hardened surface: land → review doc → consent (ESIGN/UETA) → adopt signature (type / draw / upload, sanitized) → finish.
- Server pipeline on submit: **stamp fields into the PDF → SHA-256 → Ed25519 seal (bound to request context) → Certificate of Completion → store** — all in a background job, idempotent.
- **Single-use, expiring, hashed** signing links; the link dies the instant signing completes; uniform 404 for every failure (no enumeration oracle).
- Signer gets their **signed copy + certificate by email**; sender gets a **dashboard** (status counters, activity feed, download signed PDF + certificate, tamper-verify).
- **Billing** (Stripe): free tier with caps → paid plans (per-seat + usage).

### Phase B — Document Workflow Automation (the moat)
- **Multi-recipient routing:** sequential and parallel signing order; per-recipient roles (signer / approver / cc).
- **Approval steps** (non-signing) and conditional branching ("if amount > X, route to legal").
- **Reusable workflows & a template library**; **bulk send** (one template → many recipients, CSV).
- **Integrations:** public REST API + **webhooks**, plus connectors (Google Drive / Dropbox / Slack / Zapier / HRIS). API is a first-class product, not an afterthought.
- **Automation triggers:** reminders/escalations, expiry policies, auto-void, scheduled sends.
- **Advanced audit & compliance:** full event log, exportable audit trail, data-residency + retention controls, SOC 2 roadmap, eIDAS/ESIGN/UETA alignment.

## 4. Tech stack (recommended — the owner asked me to decide)

**Recommendation: evolve the stack you already know into a scale-ready shape.** You're fluent in NestJS + Next + Prisma; greenfield doesn't mean new language, it means a cleaner architecture. Rebuilding things that already work (auth, crypto) is where greenfields die.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm + Turborepo | You know it; shared `contracts`/`crypto`/`ui` packages |
| API | **NestJS** (stateless, containerized) | You know it; scales horizontally fine; strong module/DI story |
| App frontend | **Next.js** (App Router) — marketing + dashboard | You know it; SSR + CDN |
| Public signing surface | **Separate Next.js app** (credential-poor relay) | The single best pattern from tms — the internet-facing signer app holds no DB/keys, only a narrow relay secret. Carry it over verbatim in spirit. |
| Database | **Postgres** (managed: Neon or Supabase) | Proven; **shared-schema multi-tenancy + Row-Level Security** (see §6) |
| ORM | **Prisma** (+ RLS via `SET app.tenant_id`) | You know it; wrap every tenant query in an RLS session context |
| Pooling | PgBouncer / Neon pooler | Required at scale for a stateless API |
| Cache / rate-limit / queue backend | **Redis** (managed: Upstash/Elasticache) | Sessions, limits, and BullMQ |
| Job queue / workers | **BullMQ** worker service | PDF sealing, email, webhooks, thumbnails — OFF the request path, retryable |
| Object storage | **S3-compatible** (Cloudflare R2 or AWS S3) | All document bytes; per-tenant key prefixes; stream through your API, never presigned bearer URLs to the browser |
| Auth | **Managed (Clerk or WorkOS)** for app login + org/SSO/SCIM; **home-built for the SIGNING-TOKEN model only** | Don't rebuild session/refresh/SSO — enterprise demands SAML/SCIM and it's brutal to build. But the *signing token + seal* is your crown jewel; keep it home-built. |
| Transactional email | **Resend / Postmark / SES** (platform-sent, SPF/DKIM/DMARC) | NOT per-user Gmail OAuth (that was TMS-specific). Send from your domain; let enterprises add their own later. |
| Billing | **Stripe** (subscriptions + metered usage + webhooks) | Standard |
| Signing crypto | **Ed25519 seal + SHA-256 + Certificate of Completion** (home-built) | Proven in tms; carry it |
| Infra | Docker; start on Railway/Render, grow to AWS ECS/Fargate or K8s; **Cloudflare CDN** in front | Autoscaling, stateless |
| Observability | OpenTelemetry traces + Prometheus/Grafana (or a managed APM) + **Sentry** + structured JSON logs | From day 1 |
| CI/CD | GitHub Actions; gated migrations; carry the **security-lint** grep gate | The tenant-isolation lint from tms is worth recreating |

**The one stack change that matters most vs tms:** see §6.

## 5. High-level architecture

```
                         ┌──────────────── Cloudflare CDN / WAF ───────────────┐
                         │                                                      │
   Signers (public)  ───▶│  app: sign  (Next.js, credential-poor)  ─┐          │
                         │      • signing pages only                 │ narrow   │
   Customers (auth)  ───▶│  app: web   (Next.js dashboard+marketing) │ relay    │
                         └───────────────────────────────────────────┼─────────┘
                                                                      │  x-internal / x-relay secret
                                                              ┌───────▼────────┐
                                                              │   API (NestJS) │  stateless, N replicas
                                                              │  default-deny  │
                                                              └───┬───────┬────┘
                                        RLS tenant context set    │       │  enqueue jobs
                                              ┌───────────────────▼─┐   ┌─▼──────────────┐
                                              │ Postgres (shared    │   │ Redis (cache,  │
                                              │ schema + RLS,       │   │ limits, BullMQ)│
                                              │ pooled, replicas)   │   └─┬──────────────┘
                                              └─────────────────────┘     │ consumed by
                       ┌──────────────┐                            ┌──────▼─────────────┐
                       │ Object store │◀── signed PDFs, certs ─────│ Workers (BullMQ):  │
                       │ (R2 / S3)    │                            │ stamp→hash→seal→   │
                       └──────────────┘                            │ certificate, email,│
                                                                   │ webhooks, thumbs   │
                                                                   └────────────────────┘
   External: Stripe (billing webhooks), Email provider, Auth provider (Clerk/WorkOS)
```

- **Two public frontends, one API, one worker pool.** The signing surface is isolated exactly like tms's `apps/sign`: it holds only a narrow relay credential and no datastore access, so compromising the internet-facing box yields the signing endpoints and nothing else.
- **Workers are separate processes** consuming the queue — scale them independently of the API.

## 6. Multi-tenancy & scale — the pivotal decision

**tms used DB-per-tenant** (a separate Postgres per customer). The audit loved its isolation, but **it does NOT scale to thousands of tenants** — connection limits, provisioning cost, migration fan-out, and warm-connection management all explode.

**DocFlow uses SHARED-SCHEMA multi-tenancy with Postgres Row-Level Security (RLS):**
- Every tenant-owned table has a `tenant_id` column; an RLS **policy** restricts every row to `current_setting('app.tenant_id')`.
- The API sets `app.tenant_id` **once per request** from the verified session (never from client input), inside a transaction, so even a buggy query cannot cross tenants — isolation is enforced by the database, not just the app.
- **Defense in depth:** app-layer tenant scoping + RLS + a CI grep gate (carry tms's `security-lint`) that forbids any query path that could take a `tenant_id` from request data.
- **Hybrid escape hatch:** offer **dedicated DB / dedicated infra** as an *enterprise tier* for customers who contractually require physical isolation — same codebase, a routing layer picks the connection. Best of both, only where it's paid for.

**Why this is right:** every large SaaS (Linear, Notion, Vercel, etc.) runs shared-schema. RLS gives you strong isolation without the operational nightmare, and the hybrid tier covers the compliance-heavy accounts.

**Scale levers, in order you'll reach for them:** stateless API autoscale → Redis for hot reads + limits → move all heavy work to workers → read replicas for dashboards/analytics → partition the largest tables (events, audit) by time → per-tenant sharding only if a whale demands it.

## 7. Security foundation — carry these, avoid those

**CARRY these wins from tms (they held up under adversarial audit):**
- Ed25519 **document seal** over a canonical `version|requestId|signedAt|sha256` string (bound to context, not just the hash).
- **Certificate of Completion** as the evidence artifact (identity, IP, user-agent, consent + signing timestamps, hash + seal).
- **Signing tokens:** 32 random bytes, stored **hashed only**, single-use (atomic claim), expiring, dead-on-completion; **uniform 404** for every failure so the surface is never an oracle.
- **Isolated public signing service** with a narrow, `/sign/*`-only credential and no datastore access.
- **Default-deny** authZ (every route declares a policy or is refused), pinned JWT verification, airtight error hygiene (no stack/SQL/secret ever reaches a client), redaction in the log serializer.
- Public-surface hardening: **bounded body sizes**, **image dimension checks** (decompression bombs), **Unicode-safe PDF text**, streaming byte caps.

**AVOID these audit findings (design them out on day 1):**
- **Never commit secrets** — secrets only in a secret manager; `.env.example` carries generators, never values. (tms W1)
- **Client IP from a trusted proxy hop**, strip inbound `x-forwarded-for` at the edge. (W4)
- **Intra-tenant RBAC from the start** — Owner/Admin/Member/Viewer; never a binary "authenticated = can do anything." (W7)
- **Session revocation that actually works** — disabling/removing a user ends their sessions immediately (re-check on refresh, or push revocation). (W6)
- **Separate long-lived keys (sealing) from short-lived keys (auth)** and boot-gate that they differ. (W10/W11)
- **Async, idempotent email/PDF** so a mail failure never rolls back a completed signature and never blocks the request. (13b lesson)
- **Tenant isolation enforced in the DB (RLS)**, plus the CI grep gate. (strengthens W-class isolation)

## 8. The e-sign engine (proven spec to re-implement)

1. **Template** = source PDF (object storage) + field layout (JSON: type, page, x, y, w, h — coordinates top-left origin; convert to PDF bottom-left when stamping — the silent-mirror trap).
2. **Signature request** = snapshot of {source doc key, field layout} at send time (template edits never change in-flight requests) + recipient email/name + status.
3. **Signing token** minted at send: random → sha256 stored on the request row; the raw token goes only into the invite email, never returned to a client, never logged.
4. **Public ceremony:** resolve token (fail-closed, uniform 404) → record first view (IP/UA/time) → consent → adopt signature (canvas-sanitized PNG) → submit.
5. **Submit pipeline (a job):** claim token (atomic, single-use) → stamp → SHA-256 → Ed25519 seal (context-bound) → Certificate of Completion → store signed PDF + cert → mark completed → email signer their copy. Release the claim on failure so the signer can retry.
6. **Consume:** sender downloads signed PDF + certificate (streamed same-origin, never a presigned bearer URL); **verify** = re-hash the stored PDF AND check the seal.

## 9. Data model sketch (shared-schema; every tenant table has tenant_id + RLS)

- `tenants` (org), `users`, `memberships` (user×tenant×role), `api_keys`, `subscriptions` (Stripe).
- `documents` (uploaded source), `templates` (+ `template_fields`), `envelopes`/`signature_requests` (the send), `recipients` (signer/approver/cc + routing order + status), `signing_tokens` (hashed), `signatures` (adopted image + method), `artifacts` (signed pdf, certificate — storage keys + hash + seal), `events`/`audit_log` (append-only, partitioned by time).
- `workflows` + `workflow_steps` (Phase B), `webhooks` + `webhook_deliveries`, `integrations`.

## 10. Compliance & legal (a signing SaaS lives or dies on this)
- **ESIGN/UETA (US)** and **eIDAS (EU)** alignment — the consent + audit trail + seal already targets this.
- Data-residency options, **retention & deletion policies** (GDPR right-to-erasure vs. the legal need to retain signed records — resolve explicitly), DPA templates.
- **SOC 2 Type II** as a roadmap goal (drives logging, access control, change management).
- Clear **terms** on what your certificate legally attests (identity anchor = "whoever controlled that mailbox + link," the standard remote-signing model).

## 11. Business model (sketch)
- **Free** (a few sends/month, watermark-free, 1 user) → **Pro** (per-seat + monthly send allowance) → **Business** (workflows, API, SSO) → **Enterprise** (dedicated infra, SLA, compliance).
- Usage-metered overages via Stripe; the API + workflow automation are the upsell into Business/Enterprise.

## 12. Build roadmap (milestones)
- **M0 — Foundations:** monorepo, CI, security-lint, auth (Clerk/WorkOS) + orgs + RBAC, Postgres + RLS + Prisma, Redis, object storage, worker skeleton, observability. *(No product yet — the spine.)*
- **M1 — E-sign core (Phase A):** templates + tagging → send → public signing → seal/certificate pipeline (as a job) → dashboard → download/verify. **First shippable product.**
- **M2 — Billing + polish:** Stripe plans, limits, self-serve onboarding, transactional email, marketing site. **First revenue.**
- **M3 — Workflow automation (Phase B):** multi-recipient routing + approvals → template library + bulk send → API + webhooks → integrations.
- **M4 — Enterprise:** SSO/SCIM, audit export, dedicated-infra tier, SOC 2 work.

## 13. Open decisions (resolve early in the new session)
1. Product name + domain.
2. Auth: managed (Clerk vs WorkOS) vs. home-built — recommend managed; confirm.
3. DB host: Neon vs Supabase vs RDS (Neon = easy branching + pooler; Supabase = batteries-included incl. auth/storage you may not need).
4. Where the marketing site lives (same Next app vs separate).
5. First integration to build in Phase B (Slack? Google Drive? bare API + Zapier?).
6. How much of the tms e-sign CODE to literally copy vs re-implement clean (the crypto/seal/token logic is worth lifting near-verbatim; the trucking bits are not).

---

*This is a living design doc. `tms-platform` remains a separate, ongoing project; DocFlow is greenfield and reuses its lessons, not its codebase.*
