-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "folder_id" UUID;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_used_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_tenant_id_name_idx" ON "folders"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS — folders are tenant data like everything else. Fail-closed: with no
-- app.tenant_id set the predicate is NULL and no row is visible.
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folders" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "folders"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "folders" TO docflow_app;

-- BACKFILL last_used_at: a template's "last used" is when an envelope was
-- last SENT from it, which we already know. Without this every existing
-- template would claim it had never been used.
UPDATE templates t
SET last_used_at = s.last_sent
FROM (
  SELECT template_id, MAX(sent_at) AS last_sent
  FROM signature_requests
  WHERE template_id IS NOT NULL
  GROUP BY template_id
) s
WHERE s.template_id = t.id;

-- The three most recently used templates start favourited, so the home
-- page's shelf is populated on day one instead of looking broken.
UPDATE templates SET favorite = true
WHERE id IN (
  SELECT id FROM templates WHERE last_used_at IS NOT NULL
  ORDER BY last_used_at DESC LIMIT 3
);
