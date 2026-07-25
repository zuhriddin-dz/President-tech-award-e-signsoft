-- CreateEnum
CREATE TYPE "signature_status" AS ENUM ('sent', 'viewed', 'completed', 'voided');

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid,
    "template_id" UUID,
    "document_id" UUID NOT NULL,
    "document_name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_name" TEXT,
    "signing_token_hash" TEXT NOT NULL,
    "status" "signature_status" NOT NULL DEFAULT 'sent',
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_signing_token_hash_key" ON "signature_requests"("signing_token_hash");

-- CreateIndex
CREATE INDEX "signature_requests_tenant_id_status_sent_at_idx" ON "signature_requests"("tenant_id", "status", "sent_at");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS — same fail-closed policy as every tenant table.
ALTER TABLE "signature_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "signature_requests"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
