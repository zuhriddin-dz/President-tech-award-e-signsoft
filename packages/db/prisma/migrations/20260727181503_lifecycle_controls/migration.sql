-- AlterEnum
ALTER TYPE "signature_status" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "recipients" ADD COLUMN     "last_reminded_at" TIMESTAMP(3),
ADD COLUMN     "reminder_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "signature_requests" ADD COLUMN     "expired_notified_at" TIMESTAMP(3),
ADD COLUMN     "voided_at" TIMESTAMP(3);

