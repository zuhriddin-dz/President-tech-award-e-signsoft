#!/usr/bin/env node
// Sets docflow_app's password from the untracked .env — the one step the
// runtime_role migration deliberately cannot do (a password in committed SQL
// would be a leaked secret). Run once per database (and after any rotation):
//   node scripts/set-app-role-password.mjs
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const password = process.env.APP_ROLE_PASSWORD;
if (!password) {
  console.error('APP_ROLE_PASSWORD missing from packages/db/.env');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) {
  // Identifier-safe charset so the ALTER ROLE literal below cannot be escaped.
  console.error('APP_ROLE_PASSWORD must be >=24 chars of [A-Za-z0-9_-] (base64url).');
  process.exit(1);
}

const db = new PrismaClient(); // DATABASE_URL (direct, owner) — a role change is admin work
await db.$executeRawUnsafe(`ALTER ROLE docflow_app PASSWORD '${password}'`);
await db.$disconnect();
console.log('docflow_app password set.');
