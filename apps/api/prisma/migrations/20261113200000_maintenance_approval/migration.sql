-- AlterTable
ALTER TABLE "MaintenancePlan" ADD COLUMN     "approvalStatus" TEXT,
ADD COLUMN     "quoteId" TEXT;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

