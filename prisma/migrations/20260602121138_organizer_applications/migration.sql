-- CreateEnum
CREATE TYPE "OrganizerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrganizerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "OrganizerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerApplication_userId_key" ON "OrganizerApplication"("userId");

-- CreateIndex
CREATE INDEX "OrganizerApplication_status_createdAt_idx" ON "OrganizerApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizerApplication" ADD CONSTRAINT "OrganizerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
