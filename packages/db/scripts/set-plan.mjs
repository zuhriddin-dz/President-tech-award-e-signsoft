#!/usr/bin/env node
// Switches a workspace between the free trial and Pro, by hand. There is no
// payment processor yet, so this is how a customer who has paid gets back in —
// and how a trial is given again. Runs as the OWNER (DATABASE_URL), like every
// admin script here:
//
//   node scripts/set-plan.mjs list                 most recently active workspaces
//   node scripts/set-plan.mjs <who> pro
//   node scripts/set-plan.mjs <who> trial [days]   (default 7)
//
// <who> is a workspace id, a Clerk org id (org_…), a Clerk user id (user_…), or
// a member's email. Email only works for users whose login token carried one —
// many rows hold a placeholder address, so the id forms are the reliable ones.
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

// Say WHICH database before touching anything. A development and a production
// database differ only by host, and changing the wrong one looks like success.
const target = new URL(process.env.DATABASE_URL ?? 'postgresql://unset');
console.log(`database: ${target.hostname}${target.pathname}\n`);

const [who, plan, daysArg] = process.argv.slice(2);
const db = new PrismaClient();

try {
  if (who === 'list') {
    await list();
  } else {
    await setPlan();
  }
} finally {
  await db.$disconnect();
}

/** Workspaces that have members, most recently active first — to find the one you mean. */
async function list() {
  const rows = await db.$queryRaw`
    SELECT t.id, t.name, t.kind::text AS kind, t.plan::text AS plan, t.clerk_org_id,
           (SELECT count(*) FROM templates x WHERE x.tenant_id = t.id)::int AS templates,
           (SELECT count(*) FROM signature_requests s WHERE s.tenant_id = t.id)::int AS sent,
           GREATEST(
             t.created_at,
             (SELECT max(x.created_at) FROM templates x WHERE x.tenant_id = t.id),
             (SELECT max(s.sent_at) FROM signature_requests s WHERE s.tenant_id = t.id)
           ) AS last_active,
           (SELECT string_agg(u.clerk_user_id, ', ')
              FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.tenant_id = t.id) AS users
    FROM tenants t
    WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = t.id)
    ORDER BY last_active DESC
    LIMIT 15`;
  for (const r of rows) {
    console.log(
      `${r.id}  ${r.kind}/${r.plan}  "${r.name}"  last active ${r.last_active.toISOString().slice(0, 10)}` +
        `  templates ${r.templates}  sent ${r.sent}` +
        `${r.clerk_org_id ? `  ${r.clerk_org_id}` : ''}  ${r.users ?? ''}`,
    );
  }
}

async function setPlan() {
  if (!who || (plan !== 'pro' && plan !== 'trial')) {
    console.error('usage: node scripts/set-plan.mjs list');
    console.error('       node scripts/set-plan.mjs <workspace id | org_… | user_… | email> pro|trial [days]');
    process.exitCode = 1;
    return;
  }
  const days = daysArg === undefined ? 7 : Number(daysArg);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    console.error('days must be a whole number from 1 to 365');
    process.exitCode = 1;
    return;
  }

  // The owner connection has no tenant context and bypasses RLS — that is what
  // lets one command find a workspace by who is in it. Admin work only.
  const where = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who)
    ? { id: who }
    : who.startsWith('org_')
      ? { clerkOrgId: who }
      : who.startsWith('user_')
        ? {
            OR: [
              { personalUserId: who },
              { memberships: { some: { user: { clerkUserId: who } } } },
            ],
          }
        : { memberships: { some: { user: { email: { equals: who, mode: 'insensitive' } } } } };

  const tenants = await db.tenant.findMany({
    where,
    select: { id: true, name: true, kind: true, plan: true },
  });

  if (tenants.length === 0) {
    console.error(`No workspace matches "${who}". Try: node scripts/set-plan.mjs list`);
    process.exitCode = 1;
    return;
  }
  if (tenants.length > 1) {
    // One person can belong to several workspaces. Refuse to guess which one
    // was paid for: list them and ask for the id.
    console.error(`"${who}" matches ${tenants.length} workspaces — run again with the id:`);
    for (const t of tenants) console.error(`  ${t.id}  ${t.kind}/${t.plan}  "${t.name}"`);
    process.exitCode = 1;
    return;
  }

  const [tenant] = tenants;
  const updated = await db.tenant.update({
    where: { id: tenant.id },
    data:
      plan === 'pro'
        ? { plan: 'pro' }
        : { plan: 'trial', trialEndsAt: new Date(Date.now() + days * 86_400_000) },
    select: { plan: true, trialEndsAt: true },
  });

  console.log(
    updated.plan === 'pro'
      ? `"${tenant.name}" (${tenant.id}) is now Pro.`
      : `"${tenant.name}" (${tenant.id}) is on a trial ending ${updated.trialEndsAt.toISOString()}.`,
  );
}
