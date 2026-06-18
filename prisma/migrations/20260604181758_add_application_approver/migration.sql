-- AlterTable
ALTER TABLE "OrganizerApplication" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByAdminId" TEXT;

-- CreateIndex
CREATE INDEX "OrganizerApplication_approvedByAdminId_idx" ON "OrganizerApplication"("approvedByAdminId");

-- AddForeignKey
ALTER TABLE "OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
