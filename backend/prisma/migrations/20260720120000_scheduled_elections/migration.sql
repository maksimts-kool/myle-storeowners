-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'TALLYING', 'CLOSED', 'CANCELLED');

-- DropIndex
DROP INDEX "ElectionVote_storeCode_voterDiscordId_key";

-- DropIndex
DROP INDEX "StoreApplication_applicantDiscordId_key";

-- AlterTable
ALTER TABLE "ElectionVote" ADD COLUMN     "electionId" TEXT;

-- AlterTable
ALTER TABLE "StoreApplication" ADD COLUMN     "electionId" TEXT;

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "applicationsOpenAt" TIMESTAMP(3) NOT NULL,
    "applicationsCloseAt" TIMESTAMP(3) NOT NULL,
    "votingOpensAt" TIMESTAMP(3) NOT NULL,
    "votingClosesAt" TIMESTAMP(3) NOT NULL,
    "createdByDiscordId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedByDiscordId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionStore" (
    "electionId" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "previousStatus" "StoreStatus" NOT NULL DEFAULT 'OPEN',
    "winnerApplicationId" TEXT,

    CONSTRAINT "ElectionStore_pkey" PRIMARY KEY ("electionId","storeCode")
);

-- CreateIndex
CREATE INDEX "Election_status_applicationsOpenAt_idx" ON "Election"("status", "applicationsOpenAt");

-- CreateIndex
CREATE INDEX "ElectionStore_storeCode_idx" ON "ElectionStore"("storeCode");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVote_electionId_storeCode_voterDiscordId_key" ON "ElectionVote"("electionId", "storeCode", "voterDiscordId");

-- CreateIndex
CREATE INDEX "StoreApplication_applicantDiscordId_idx" ON "StoreApplication"("applicantDiscordId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreApplication_electionId_applicantDiscordId_key" ON "StoreApplication"("electionId", "applicantDiscordId");

-- AddForeignKey
ALTER TABLE "ElectionStore" ADD CONSTRAINT "ElectionStore_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionStore" ADD CONSTRAINT "ElectionStore_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreApplication" ADD CONSTRAINT "StoreApplication_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

