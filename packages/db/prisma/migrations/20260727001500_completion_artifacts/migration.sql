-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "certificate_key" TEXT,
ADD COLUMN     "document_hash" TEXT,
ADD COLUMN     "seal_kid" TEXT,
ADD COLUMN     "seal_signature" TEXT,
ADD COLUMN     "sender_email" TEXT,
ADD COLUMN     "signed_pdf_key" TEXT;

