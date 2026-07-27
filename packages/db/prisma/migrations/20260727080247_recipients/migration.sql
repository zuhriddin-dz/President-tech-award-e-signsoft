-- CreateEnum
CREATE TYPE "recipient_role" AS ENUM ('signer', 'cc');

-- CreateEnum
CREATE TYPE "recipient_status" AS ENUM ('pending', 'sent', 'viewed', 'completed');

-- CreateEnum
CREATE TYPE "routing_mode" AS ENUM ('parallel', 'sequential');

-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "routing_mode" "routing_mode" NOT NULL DEFAULT 'parallel',
ALTER COLUMN "signing_token_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "recipients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid,
    "request_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "recipient_role" NOT NULL DEFAULT 'signer',
    "routing_order" INTEGER NOT NULL DEFAULT 1,
    "recipient_key" TEXT NOT NULL,
    "status" "recipient_status" NOT NULL DEFAULT 'pending',
    "signing_token_hash" TEXT,
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "consent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "signature_method" TEXT,
    "signature_image_key" TEXT,
    "field_values" JSONB NOT NULL DEFAULT '{}',
    "viewed_ip" TEXT,
    "viewed_user_agent" TEXT,
    "signer_ip" TEXT,
    "signer_user_agent" TEXT,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipients_signing_token_hash_key" ON "recipients"("signing_token_hash");

-- CreateIndex
CREATE INDEX "recipients_tenant_id_request_id_routing_order_idx" ON "recipients"("tenant_id", "request_id", "routing_order");

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS — same fail-closed policy as every tenant table.
ALTER TABLE "recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recipients" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "recipients"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- BACKFILL: every existing single-recipient envelope becomes one recipient
-- row, carrying its token and audit trail, so nothing in flight is orphaned
-- and old signing links keep working after the restructure.
INSERT INTO recipients (
  id, tenant_id, request_id, email, name, role, routing_order, recipient_key,
  status, signing_token_hash, sent_at, viewed_at, consent_at, completed_at,
  signature_method, signature_image_key, field_values,
  viewed_ip, viewed_user_agent, signer_ip, signer_user_agent
)
SELECT
  gen_random_uuid(), r.tenant_id, r.id, r.recipient_email, r.recipient_name,
  'signer', 1, 'signer',
  CASE r.status
    WHEN 'completed' THEN 'completed'::recipient_status
    WHEN 'viewed'    THEN 'viewed'::recipient_status
    WHEN 'voided'    THEN 'pending'::recipient_status
    ELSE 'sent'::recipient_status
  END,
  r.signing_token_hash, r.sent_at, r.viewed_at, r.consent_at, r.completed_at,
  r.signature_method, r.signature_image_key, r.field_values,
  r.viewed_ip, r.viewed_user_agent, r.signer_ip, r.signer_user_agent
FROM signature_requests r
WHERE NOT EXISTS (SELECT 1 FROM recipients x WHERE x.request_id = r.id);
