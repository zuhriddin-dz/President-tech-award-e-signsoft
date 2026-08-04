/**
 * Read-only snapshot of where completed signatures actually stand.
 *
 * The completion pipeline is stamp -> hash -> seal -> certificate -> store ->
 * email. The distinction that matters is whether a row got as far as being
 * SEALED: once signed_pdf_key and document_hash exist, the evidence is safe
 * and durable, and only delivery is outstanding. A row that is completed with
 * no artifacts is a different and worse problem.
 *
 *   node scripts/completion-status.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [row] = await prisma.$queryRaw`
  SELECT
    count(*) FILTER (WHERE status = 'completed')                        AS completed,
    count(*) FILTER (WHERE status = 'completed'
                       AND signed_pdf_key IS NOT NULL)                  AS sealed,
    count(*) FILTER (WHERE status = 'completed'
                       AND certificate_key IS NOT NULL)                 AS certified,
    count(*) FILTER (WHERE status = 'completed'
                       AND completion_emailed_at IS NOT NULL)           AS delivered,
    count(*) FILTER (WHERE status = 'completed'
                       AND signed_pdf_key IS NOT NULL
                       AND completion_emailed_at IS NULL)               AS sealed_not_delivered,
    count(*) FILTER (WHERE status = 'completed'
                       AND signed_pdf_key IS NULL)                      AS not_sealed
  FROM signature_requests`;

const n = (v) => Number(v);
console.log(`
completed signatures      ${n(row.completed)}
  sealed (signed PDF)     ${n(row.sealed)}
  certificate built       ${n(row.certified)}
  delivered by email      ${n(row.delivered)}

  sealed, NOT delivered   ${n(row.sealed_not_delivered)}   <- evidence safe, email pending
  NOT sealed              ${n(row.not_sealed)}   <- no artifacts yet
`);

// Recipients that will receive a nudge the moment the domain is verified.
const [rem] = await prisma.$queryRaw`
  SELECT count(*) AS due FROM recipients rc
  JOIN signature_requests sr ON sr.id = rc.request_id
  WHERE rc.role = 'signer' AND rc.status IN ('sent','viewed')
    AND rc.signing_token_hash IS NOT NULL
    AND sr.status IN ('sent','viewed') AND sr.expires_at > now()`;
console.log(`recipients still awaiting signature: ${Number(rem.due)}`);

await prisma.$disconnect();
