-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "consent_at" TIMESTAMP(3),
ADD COLUMN     "signature_image_key" TEXT,
ADD COLUMN     "signature_method" TEXT,
ADD COLUMN     "signer_ip" TEXT,
ADD COLUMN     "signer_user_agent" TEXT;

