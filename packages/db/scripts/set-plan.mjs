#!/usr/bin/env node
// Switches a workspace between the free trial and Pro, by hand. There is no
// payment processor yet, so this is how a customer who has paid gets back in —
// and how a trial is given again. Runs as the OWNER (DATABASE_URL), like every
// admin script here:
//
//   node scripts/set-plan.mjs <workspace id | a member's email> pro
//   node scripts/set-plan.mjs <workspace id | a member's email> trial [days]   (default 7)
//
// The change takes effect on the workspace's very next request: the API reads
// the plan fresh every time, so nothing needs restarting.
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* no .env — the variables come from the environment */
}

const [who, plan, daysArg] = process.argv.slice(2);
if (!who || (plan !== 'pro' && plan !== 'trial')) {
  console.error("usage: node scripts/set-plan.mjs <workspace id | member email> pro|trial [days]");
  process.exit(1);
}
const days = daysArg === undefined ? 7 : Number(daysArg);
if (!Number.isInteger(days) || days < 1 || days > 365) {
  console.error('days must be a whole number from 1 to 365');
  process.exit(1);
}

// The owner connection has no tenant context and bypasses RLS — that is what
// lets one command find a workspace by a member's email. Admin work only.
const db = new PrismaClient();
try {
  const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who);
  const tenants = await db.tenant.findMany({
    where: byId
      ? { id: who }
      : { memberships: { some: { user: { email: { equals: who, mode: 'insensitive' } } } } },
    select: { id: true, name: true, kind: true, plan: true, trialEndsAt: true },
  });

  if (tenants.length === 0) {
    console.error(`No workspace matches "${who}".`);
    process.exit(1);
  }
  if (tenants.length > 1) {
    // One person can belong to several workspaces. Refuse to guess which one
    // was paid for: list them and ask for the id.
    console.error(`"${who}" belongs to ${tenants.length} workspaces — run again with the id:`);
    for (const t of tenants) console.error(`  ${t.id}  ${t.kind.padEnd(8)}  ${t.plan.padEnd(5)}  ${t.name}`);
    process.exit(1);
  }

  const [tenant] = tenants;
  const data =
    plan === 'pro'
      ? { plan: 'pro' }
      : { plan: 'trial', trialEndsAt: new Date(Date.now() + days * 86_400_000) };
  const updated = await db.tenant.update({
    where: { id: tenant.id },
    data,
    select: { plan: true, trialEndsAt: true },
  });

  console.log(
    updated.plan === 'pro'
      ? `${tenant.name} (${tenant.id}) is now Pro.`
      : `${tenant.name} (${tenant.id}) is on a trial ending ${updated.trialEndsAt.toISOString()}.`,
  );
} finally {
  await db.$disconnect();
}
