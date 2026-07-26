-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "field_values" JSONB NOT NULL DEFAULT '{}';

