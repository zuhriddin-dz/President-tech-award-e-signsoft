/**
 * Re-align _prisma_migrations.checksum with the on-disk migration files.
 *
 * When a migration is edited AFTER it was applied (we did this once, fixing a
 * 42P13 return-type change in place), `prisma migrate dev` refuses to proceed
 * and offers only a full database reset. The files and the database schema
 * actually agree — it is the recorded hash that drifted. This re-records it.
 *
 * ONLY run this when you have verified the applied schema matches the edited
 * file. It is not a way to make failed migrations look successful.
 *
 *   node scripts/realign-migration-checksums.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const dir = join(process.cwd(), 'prisma', 'migrations');
const prisma = new PrismaClient();

const rows = await prisma.$queryRawUnsafe(
  'SELECT id, migration_name, checksum, rolled_back_at FROM _prisma_migrations ORDER BY started_at',
);

// One migration can have SEVERAL rows — a rolled-back attempt and the
// successful re-apply. Prisma checks every one of them, so a stale hash on the
// abandoned attempt is enough to demand a reset. Key by row id, not by name.
let fixed = 0;
for (const name of readdirSync(dir)) {
  if (!statSync(join(dir, name)).isDirectory()) continue;
  const sql = readFileSync(join(dir, name, 'migration.sql'));
  const hash = createHash('sha256').update(sql).digest('hex');
  const attempts = rows.filter((r) => r.migration_name === name);
  if (attempts.length === 0) {
    console.log(`skip (never applied): ${name}`);
    continue;
  }
  for (const row of attempts) {
    if (row.checksum === hash) continue;
    await prisma.$executeRawUnsafe(
      'UPDATE _prisma_migrations SET checksum = $1 WHERE id = $2',
      hash,
      row.id,
    );
    console.log(
      `realigned ${name}${row.rolled_back_at ? ' (rolled-back attempt)' : ''}\n` +
        `  was ${row.checksum}\n  now ${hash}`,
    );
    fixed++;
  }
}
console.log(fixed === 0 ? 'all checksums already match' : `${fixed} checksum(s) realigned`);
await prisma.$disconnect();
