# The API and the worker ship as ONE image with two entrypoints — same code,
# same build, different command. That is deliberate: the worker consumes jobs
# the API enqueues, and a version skew between them means a job written in one
# shape gets read in another. One image makes that skew impossible.
#
#   docker build -t esignsoft-api .
#   docker run --env-file apps/api/.env esignsoft-api           # API
#   docker run --env-file apps/api/.env esignsoft-api node dist/worker.js
#
# Build context is the REPO ROOT, not apps/api — this is a pnpm workspace and
# the API imports @docflow/{contracts,crypto,db} by workspace link.

# ── deps ────────────────────────────────────────────────────────────────────
# Node 24 to match the engines field. Alpine keeps the image small; the
# openssl package is Prisma's runtime dependency for its query engine.
FROM node:24-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /repo

RUN corepack enable

# Copy only manifests first, so a source-only change does not re-resolve the
# whole dependency tree on every build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/sign/package.json apps/sign/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/crypto/package.json packages/crypto/
COPY packages/db/package.json packages/db/

# Filtered to the API's dependency closure — Next, React and pdf.js belong to
# the Vercel apps and have no business in this image.
RUN pnpm install --frozen-lockfile --filter @docflow/api...

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo
COPY . .

# The API's own build depends on the workspace packages being built first —
# turbo's `dependsOn: ["^build"]` handles the ordering, including the
# `prisma generate` inside @docflow/db's build.
RUN pnpm turbo run build --filter=@docflow/api...

# Strip dev dependencies by RE-INSTALLING the prod-only closure, not by
# pruning.
#
# `pnpm prune --prod` cannot be used here: run at a workspace root it
# evaluates the ROOT package.json, which carries only devDependencies, decides
# nothing is needed in production, and removes the store links every workspace
# package depends on. The build then succeeds and the container dies at boot
# with ERR_MODULE_NOT_FOUND.
#
# A filtered --prod install resolves against the same lockfile and keeps the
# workspace links (@docflow/* are real `dependencies` of the API), while
# leaving eslint, vitest and the TypeScript toolchain out of the image.
RUN CI=true pnpm install --frozen-lockfile --filter @docflow/api... --prod

# Prune rewrites node_modules, and Prisma's generated client lives inside it
# rather than in any package's source — under pnpm that is
# node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client, not the
# root .prisma path a non-pnpm layout would have. If a future dependency
# change ever sweeps it away, this fails the BUILD instead of letting the API
# boot fine and throw on its first query.
RUN find node_modules/.pnpm -type d -path '*/.prisma/client' -print -quit \
  | grep -q . || (echo "Prisma client missing after prune" && exit 1)

# Prove the runtime's imports actually RESOLVE before shipping the image.
# Compiling is not the same check: tsc resolves types through the workspace,
# while Node resolves real files through pnpm's symlink farm at run time. This
# runs from the API's own directory, exactly as the entrypoint will.
#
# Only DECLARED dependencies of apps/api are listed. @prisma/client is
# deliberately absent: it belongs to @docflow/db, and under pnpm's strict
# layout it must NOT resolve from here — importing it directly would be a
# phantom dependency. @docflow/db re-exports PrismaClient, so importing that
# exercises the real chain (api -> @docflow/db -> @prisma/client) and proves
# the generated client loads.
WORKDIR /repo/apps/api
RUN node --input-type=module -e "\
  await import('reflect-metadata'); \
  await import('@nestjs/core'); \
  await import('@docflow/db'); \
  await import('@docflow/contracts'); \
  await import('@docflow/crypto'); \
  console.log('runtime imports resolve');"
WORKDIR /repo

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /repo

ENV NODE_ENV=production
# The API binds this; App Platform and most PaaS inject their own PORT, which
# overrides it. env.ts coerces and validates the value either way.
ENV PORT=5100

# A non-root user, because a process that never needs to write to its own
# image should not be able to.
RUN addgroup -S app && adduser -S app -G app

# ONE copy of the whole built workspace, not a copy per directory.
#
# pnpm's node_modules is a symlink farm: apps/api/node_modules/reflect-metadata
# is a link into /repo/node_modules/.pnpm/reflect-metadata@…/node_modules/.
# Copying the pieces in separate COPY instructions broke those links and the
# API died at boot with ERR_MODULE_NOT_FOUND. The farm only resolves when the
# tree lands together with its layout intact.
COPY --from=build --chown=app:app /repo ./

USER app
WORKDIR /repo/apps/api

EXPOSE 5100

# Default command is the API. The worker overrides it with
# `node dist/worker.js` — see .do/app.yaml.
CMD ["node", "dist/main.js"]
