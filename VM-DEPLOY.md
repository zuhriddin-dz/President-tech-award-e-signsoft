# Running E-SIGNSOFT on one VM

Replaces DigitalOcean App Platform, Vercel and Upstash with a single droplet.
Postgres stays on Neon; object storage stays on Cloudflare R2; auth stays with
Clerk; email stays with Resend.

**Nothing needs migrating.** The database and the documents do not move, and
Redis holds only in-flight jobs. The cutover is "point DNS at the droplet",
not a data migration — and it is reversible by pointing DNS back.

| | Before | After |
|---|---|---|
| api + worker | App Platform | droplet |
| web + sign | Vercel | droplet |
| Redis | Upstash (**$182/mo**) | droplet, $0 |
| Postgres | Neon | Neon (unchanged) |
| Files | R2 | R2 (unchanged) |

---

## 1. The droplet

DigitalOcean → Create → Droplet:

- **Image:** Ubuntu 24.04 LTS
- **Size:** Basic → Regular → **2 vCPU / 4 GB / 80 GB — $24/mo**
- **Region:** Frankfurt (`fra1`) — lowest latency to Tashkent of DO's regions
- **Authentication:** SSH key, not password
- Enable **monitoring**; skip backups for now (nothing unique lives here — see §8)

4 GB is the honest minimum: six containers idle at roughly 1.3 GB, and the
headroom is for building the two Next apps. If builds get painful, either move
up to 8 GB (`$48`) or build elsewhere and push images — the compose file works
either way.

## 2. DNS — do this first

Caddy requests certificates on startup, and the ACME challenge fails if the
names do not already resolve to the droplet. Add three **A** records pointing
at the droplet's IPv4, at your DNS provider:

| Name | Value |
|---|---|
| `esignsoft.uz` | droplet IP |
| `www` | droplet IP |
| `sign` | droplet IP |

Leave them at a low TTL (300s) until the cutover is done, so a rollback is fast.

There is deliberately **no `api` record**. The API is not published; the two
apps reach it over the compose network. Delete any existing `api.esignsoft.uz`
record once the old App Platform deployment is gone.

Verify before continuing — a wrong record here is the most common cause of a
certificate loop:

```bash
dig +short esignsoft.uz www.esignsoft.uz sign.esignsoft.uz
```

## 3. Prepare the box

SSH in as root, then:

```bash
adduser --disabled-password --gecos "" deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Swap, so a Next build that spikes past RAM stalls instead of being OOM-killed:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Firewall — only SSH and the web ports. Redis and the API are not published by
compose, but a firewall is what makes that true even if someone later adds a
`ports:` line by accident:

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
```

Docker:

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in **as `deploy`** for the group to apply.

## 4. Configure

```bash
git clone <your repo url> esignsoft && cd esignsoft
cp .env.vm.example .env.vm && chmod 600 .env.vm
nano .env.vm
```

Fill it from the values already in the App Platform and Vercel dashboards.
Three that matter more than the rest:

- **`ESIGN_SEAL_KEYS`** — copy exactly, **no surrounding quotes**. A different
  ring cannot verify already-sealed documents, and the public verification page
  would start calling real signatures invalid.
- **`APP_DATABASE_URL`** — the `docflow_app` role, *not* `neondb_owner`. That
  role having no `BYPASSRLS` is what enforces tenant isolation.
- **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`** — baked into the browser bundle at
  build time. Changing it later needs `--build`, not a restart.

## 5. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.vm up -d --build
```

If the web or sign build fails with something like *"apps/web: not found"*, the
per-Dockerfile ignore files are not being honoured — that is a BuildKit feature
and an older Docker falls back to the root `.dockerignore`, which deliberately
excludes both apps. Either update Docker, or build those two with an explicit
BuildKit invocation:

```bash
DOCKER_BUILDKIT=1 docker build -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_... -t esignsoft-web .
```

First run takes 10–20 minutes on a 2-vCPU box: it builds three images. Watch:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.vm logs -f
```

Expect `worker up` from the worker, `Nest application successfully started`
from the API, and a certificate line from Caddy for each of the three names.

## 6. Verify before switching DNS

While the old deployment is still live, check the droplet directly:

```bash
curl -sk -H 'Host: esignsoft.uz'      https://<droplet-ip>/       -o /dev/null -w '%{http_code}\n'
curl -sk -H 'Host: sign.esignsoft.uz' https://<droplet-ip>/       -o /dev/null -w '%{http_code}\n'
```

Then, once DNS points at the droplet, the checks that actually matter:

1. **Sign in** on `esignsoft.uz` — proves Clerk's publishable key was baked in.
   A blank sign-in page means it was not; rebuild with `--build`.
2. **Send a document to yourself** — proves Neon, R2, Redis, the worker and
   Resend are all wired. The email must arrive and the link must open.
3. **Complete it, then open the Certificate of Completion.** Check the
   **IP address** line is your real address and not `172.x.x.x` or `unknown`.
   That address is evidence; if it is wrong, stop and re-read the client-IP
   note in `Caddyfile` before letting anyone else sign.
4. **Verify the signed file** on `/verify` — proves the seal ring came across
   intact.

## 7. Cut over and decommission

Only after §6 passes, and in this order:

1. **Drain Upstash first if anything is queued.** Jobs live in Redis, and the
   new box starts with an empty one. Check the Upstash console for a non-zero
   queue depth; if there is one, leave the old worker running until it clears.
2. Point DNS at the droplet (already done if you followed §6).
3. Delete the App Platform app, the two Vercel projects, and **the Upstash
   database** — that last one is the $182.
4. Remove the `api.esignsoft.uz` DNS record.

Keep `.do/app.yaml` in the repo for a week or so; it is the fastest way back if
something surfaces later.

## 8. Day-to-day

**Deploy a change:**

```bash
git pull && docker compose -f docker-compose.prod.yml --env-file .env.vm up -d --build
```

**What is worth backing up.** Almost nothing lives only on this box:

| | Where it lives | If the droplet dies |
|---|---|---|
| Signed documents, certificates | R2 | safe |
| Envelopes, tenants, audit trail | Neon | safe |
| The seal ring | `.env.vm` | **you must have a copy off the box** |
| Queued jobs | droplet Redis | lost; the reconciler re-seals anything stranded |
| TLS certificates | droplet volume | re-issued automatically |

So the backup that matters is the one you already have: the seal ring. Keep it
in a password manager, not only in `.env.vm`.

**Logs** are capped at 10 MB × 3 per service in the compose file. Without that
cap Docker's default driver fills the disk and takes everything down with it.

**Check memory** if the box feels slow:

```bash
docker stats --no-stream
```

---

## Two follow-ups worth doing separately

**Find out what the $182 actually was.** An idle BullMQ worker costs roughly
$2/mo on Upstash, not $182. Before deleting the database, look at the daily
command chart: a flat baseline is normal polling, a cliff is a reconnect storm.
`redisConnection()` sets `maxRetriesPerRequest: null` — correct for a worker,
but it retries *infinitely and fast* against a bad URL, and `REDIS_URL` was
briefly malformed during the original deploy. Worth knowing whether that was
it, because the same failure mode could bite on any per-request service.

**The Neon compute-hour burn.** The worker's reconcile loop runs every 60s
(`RECONCILE_INTERVAL_MS` in `apps/api/src/worker.ts`), and each pass queries
Postgres — which keeps a Neon instance permanently awake and is why the free
tier is exceeded. Nothing about this deployment changes that. Backing the
interval off, or skipping the sweep when the last one found nothing, would fix
it without weakening the safety net.
