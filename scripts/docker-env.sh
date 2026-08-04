#!/usr/bin/env bash
# Convert a .env file into the shape `docker run --env-file` actually accepts.
#
# WHY THIS EXISTS
# Node's process.loadEnvFile strips surrounding quotes and tolerates CRLF, so
# `pnpm dev` reads apps/api/.env fine. Docker's --env-file does neither: it
# takes everything after the first `=` literally, carriage return included.
#
# The failure is confusing rather than obvious, because it only breaks the
# variables with a FORMAT rule. `APP_DATABASE_URL="postgresql://…"` fails
# .startsWith('postgresql://') on the leading quote, while CLERK_SECRET_KEY
# passes .min(20) — quotes just pad the length. So a partial, arbitrary-looking
# subset of the environment appears invalid.
#
# This strips, in order: trailing CR, surrounding double quotes, surrounding
# single quotes. Single quotes matter for ESIGN_SEAL_KEYS, whose value is JSON
# and is therefore quoted with '…' rather than "…".
#
#   ./scripts/docker-env.sh > /tmp/esignsoft.env
#   docker run --env-file /tmp/esignsoft.env … esignsoft-api
#   rm /tmp/esignsoft.env
#
# LOCAL TESTING ONLY. DigitalOcean App Platform takes env values as raw strings
# through its UI or the app spec — there is no file to parse and no quoting
# layer, so none of this applies to the deployed services.
set -euo pipefail

SOURCE="${1:-apps/api/.env}"

if [[ ! -f "$SOURCE" ]]; then
  echo "docker-env: no such file: $SOURCE" >&2
  exit 1
fi

sed -E \
  -e 's/\r$//' \
  -e 's/^([A-Za-z0-9_]+)="(.*)"$/\1=\2/' \
  -e "s/^([A-Za-z0-9_]+)='(.*)'\$/\1=\2/" \
  "$SOURCE"
