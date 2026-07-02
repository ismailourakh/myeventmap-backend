-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "includesFood" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postcode" TEXT;

-- CreateIndex
CREATE INDEX "Event_postcode_idx" ON "Event"("postcode");
