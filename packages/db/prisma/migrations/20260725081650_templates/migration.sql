-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid,
    "name" TEXT NOT NULL,
    "document_id" UUID NOT NULL,
    "page_count" INTEGER NOT NULL,
    "page_sizes" JSONB NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_tenant_id_created_at_idx" ON "templates"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS — same fail-closed policy as every tenant table.
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "templates" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "templates"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
