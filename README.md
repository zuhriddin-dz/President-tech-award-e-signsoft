# DocFlow

Multi-tenant e-signature + document-workflow SaaS. **Read `docflow-saas-design.md` first** — it is the system design and the authority until folder docs exist.

Four runtime processes (landing in later phases): `api` (NestJS, stateless) · `worker` (BullMQ, heavy jobs) · `web` (Next.js dashboard) · `sign` (isolated public signing app).

One Postgres, shared schema, Row-Level Security — tenant identity comes from the verified session only. `scripts/security-lint.mjs` enforces this in CI.

```bash
pnpm install
pnpm build && pnpm test && pnpm lint   # lint includes security-lint
```
