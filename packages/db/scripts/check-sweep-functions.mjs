/**
 * Prove the worker's three cross-tenant sweep functions are callable the way
 * the worker actually calls them.
 *
 * These run through $queryRaw with numeric arguments, and Prisma sends a JS
 * number as int8. Postgres will not implicitly downcast int8 to the int4 the
 * functions declare, so an uncast call fails with 42883 — "function does not
 * exist" — which reads like a missing migration and is why this went
 * unnoticed: the worker logged it once a minute and carried on.
 *
 * The integration specs that would have caught it are skipIf(!live), so they
 * do not run in a normal test pass. This script needs the live database and
 * is therefore a script, not a spec.
 *
 *   node scripts/check-sweep-functions.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let failures = 0;

async function check(label, run) {
  try {
    const rows = await run();
    console.log(`ok    ${label} -> ${rows.length} row(s)`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${label}\n      ${String(error).split('\n').find((l) => l.includes('Message:')) ?? error}`);
  }
}

// Each call mirrors its production call site exactly, casts included.
await check(
  'find_stranded_completions',
  () => prisma.$queryRaw`SELECT request_id, tenant_id FROM public.find_stranded_completions(${25}::int)`,
);
await check(
  'find_expired_envelopes',
  () => prisma.$queryRaw`SELECT request_id, tenant_id FROM public.find_expired_envelopes(${50}::int)`,
);
await check(
  'find_recipients_to_remind',
  () =>
    prisma.$queryRaw`SELECT recipient_id, request_id, tenant_id
      FROM public.find_recipients_to_remind(${3}::int, ${3}::int, ${50}::int)`,
);

// The bug itself, asserted: the same call WITHOUT a cast must still fail.
// If this ever starts passing, the casts are no longer load-bearing and the
// comments explaining them are misleading.
try {
  await prisma.$queryRaw`SELECT 1 FROM public.find_expired_envelopes(${50})`;
  console.error('FAIL  uncast call unexpectedly SUCCEEDED — the ::int casts may now be redundant');
  failures += 1;
} catch {
  console.log('ok    uncast call still rejected (casts are load-bearing)');
}

await prisma.$disconnect();
console.log(failures === 0 ? '\nall sweep functions callable' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
