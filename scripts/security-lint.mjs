#!/usr/bin/env node
// security-lint — the CI gate for E-SIGNSOFT's multi-tenancy model.
//
// E-SIGNSOFT is ONE shared-schema Postgres with Row-Level Security. Tenant
// identity is set per request from the VERIFIED SESSION by exactly one
// sanctioned area (apps/api/src/tenant/) and rides in request context —
// never in client-controlled data, never as a function parameter, and the
// frontends never touch the database at all. These rules make those three
// sentences machine-enforced. Modeled on tms-platform's gate; rules adapted
// to the RLS world.
//
// Exit 0 = clean. Exit 1 = findings (printed one per line: RULE file).

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── RULE1: tenant identity must never come from client-controlled data ──────
export const RULE1_HEADER = /\bheaders(?:\.get\(|\[)\s*['"`]x-tenant/i;
export const RULE1_REQUEST_DATA =
  /\b(?:req|request|ctx)\??\.(?:query|params|body)\??\.(?:tenantId|tenant_id|tenant)\b/i;
export const RULE1_SEARCH_PARAMS = /searchParams\s*(?:\.get\()?\s*\(?\s*['"`]tenant/i;
export const RULE1_SUBDOMAIN = /\bsubdomain\b/i;

// ── RULE2: no tenantId-shaped parameter outside the sanctioned area ─────────
// Tenant identity rides in request context (CLS → RLS), never as an argument;
// a `tenantId` param is how cross-tenant bugs are born. Delimiter-bound so
// identifiers like `myTenantIdea` don't match.
export const RULE2_PARAM = /[(,{]\s*(?:readonly\s+)?tenantId\s*[?:,)}=]/;

// ── RULE3: the frontends are credential-poor — no DB access, ever ───────────
// apps/web talks to the API via its BFF proxy; apps/sign only relays /sign/*.
// Any Prisma or @docflow/db import in either app is an architecture breach.
export const RULE3_DB_IMPORT =
  /(?:from\s+|require\(\s*|import\(\s*)['"](?:@prisma\/client|@docflow\/db|[^'"]*\/generated\/(?:client|prisma))/;

// The ONLY territory allowed to name a tenant (RULE1 + RULE2 exemption): the
// future home of the RLS context setter. Nothing else earns its way in.
export const SANCTIONED_TENANT_PREFIX = 'apps/api/src/tenant/';
const RULE3_TARGET_PREFIXES = ['apps/web/', 'apps/sign/'];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'generated',
  'coverage',
  '.git',
]);
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_FILE = /\.(?:spec|test|d)\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (SOURCE_EXT.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

/** Scan a repo root; returns findings as [{ rule, file }] with /-relative paths. */
export function runSecurityLint(rootDir) {
  const findings = [];
  for (const scanRoot of ['apps', 'packages']) {
    let files;
    try {
      files = [...walk(join(rootDir, scanRoot))];
    } catch {
      continue; // scan root absent (e.g. fixture repos) — nothing to scan
    }
    for (const abs of files) {
      const rel = relative(rootDir, abs).replaceAll('\\', '/');
      const code = readFileSync(abs, 'utf8');
      const sanctioned = rel.startsWith(SANCTIONED_TENANT_PREFIX);

      if (!sanctioned) {
        if (RULE1_HEADER.test(code)) findings.push({ rule: 'RULE1_HEADER', file: rel });
        if (RULE1_REQUEST_DATA.test(code)) findings.push({ rule: 'RULE1_REQUEST_DATA', file: rel });
        if (RULE1_SEARCH_PARAMS.test(code))
          findings.push({ rule: 'RULE1_SEARCH_PARAMS', file: rel });
        if (RULE1_SUBDOMAIN.test(code)) findings.push({ rule: 'RULE1_SUBDOMAIN', file: rel });
        if (RULE2_PARAM.test(code)) findings.push({ rule: 'RULE2_TENANT_ID_PARAM', file: rel });
      }
      if (RULE3_TARGET_PREFIXES.some((p) => rel.startsWith(p)) && RULE3_DB_IMPORT.test(code)) {
        findings.push({ rule: 'RULE3_FRONTEND_DB_IMPORT', file: rel });
      }
    }
  }
  return findings;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const findings = runSecurityLint(root);
  if (findings.length > 0) {
    for (const f of findings) console.error(`${f.rule}  ${f.file}`);
    console.error(`\nsecurity-lint: ${findings.length} finding(s). See scripts/security-lint.mjs for the rules.`);
    process.exit(1);
  }
  console.log('security-lint: clean');
}
