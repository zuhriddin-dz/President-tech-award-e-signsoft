import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RULE1_HEADER,
  RULE2_PARAM,
  RULE3_DB_IMPORT,
  runSecurityLint,
} from './security-lint.mjs';

describe('rule regexes', () => {
  it('RULE1 catches tenant identity read from headers', () => {
    expect(RULE1_HEADER.test(`req.headers.get('x-tenant-id')`)).toBe(true);
    expect(RULE1_HEADER.test(`headers['x-tenant']`)).toBe(true);
    expect(RULE1_HEADER.test(`headers.get('accept')`)).toBe(false);
  });

  it('RULE2 catches tenantId-shaped parameters but not lookalike identifiers', () => {
    expect(RULE2_PARAM.test(`function list(tenantId: string) {}`)).toBe(true);
    expect(RULE2_PARAM.test(`create({ tenantId })`)).toBe(true);
    expect(RULE2_PARAM.test(`const myTenantIdea = 1;`)).toBe(false);
  });

  it('RULE3 catches DB imports', () => {
    expect(RULE3_DB_IMPORT.test(`import { PrismaClient } from '@prisma/client';`)).toBe(true);
    expect(RULE3_DB_IMPORT.test(`import { db } from '@docflow/db';`)).toBe(true);
    expect(RULE3_DB_IMPORT.test(`import { api } from '@docflow/contracts';`)).toBe(false);
  });
});

describe('runSecurityLint on a fixture repo', () => {
  let fixtureRoot;
  afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it('flags violations outside the sanctioned folder, allows them inside, scopes RULE3 to frontends', () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'seclint-'));
    const write = (rel, code) => {
      const abs = join(fixtureRoot, rel);
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, code);
    };

    write('apps/api/src/modules/docs/docs.service.ts', `export function list(tenantId: string) {}`);
    write('apps/api/src/tenant/rls-context.ts', `export function set(tenantId: string) {}`);
    write('apps/web/app/page.ts', `import { PrismaClient } from '@prisma/client';`);
    write('apps/api/src/prisma/client.ts', `import { PrismaClient } from '@prisma/client';`);

    const findings = runSecurityLint(fixtureRoot);
    expect(findings).toEqual([
      { rule: 'RULE2_TENANT_ID_PARAM', file: 'apps/api/src/modules/docs/docs.service.ts' },
      { rule: 'RULE3_FRONTEND_DB_IMPORT', file: 'apps/web/app/page.ts' },
    ]);
  });
});
