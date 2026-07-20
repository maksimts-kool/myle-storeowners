-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('OPEN', 'CLOSED', 'ELECTION');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SELECTED', 'NOT_SELECTED', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'TALLYING', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Store" (
    "code" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'OPEN',
    "ownerDiscordId" TEXT,
    "ownerDisplayName" TEXT,
    "storeIdentifier" TEXT,
    "startingVersion" INTEGER NOT NULL DEFAULT 0,
    "room" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("code")
);

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

-- CreateTable
CREATE TABLE "StoreApplication" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "electionId" TEXT,
    "applicantDiscordId" TEXT NOT NULL,
    "applicantDisplayName" TEXT NOT NULL,
    "applicantRobloxName" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionApplicationLock" (
    "discordId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionApplicationLock_pkey" PRIMARY KEY ("discordId")
);

-- CreateTable
CREATE TABLE "ElectionVote" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "electionId" TEXT,
    "applicationId" TEXT NOT NULL,
    "voterDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreVersion" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" TEXT,
    "uploadedByDiscordId" TEXT NOT NULL,
    "note" TEXT,
    "reviewNote" TEXT,
    "reviewedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateFile" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "uploadedByDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "discordId" TEXT NOT NULL,
    "submissionReceived" BOOLEAN NOT NULL DEFAULT true,
    "reviewNeeded" BOOLEAN NOT NULL DEFAULT true,
    "submissionApproved" BOOLEAN NOT NULL DEFAULT true,
    "submissionDeclined" BOOLEAN NOT NULL DEFAULT true,
    "submissionPublished" BOOLEAN NOT NULL DEFAULT true,
    "applicationApplied" BOOLEAN NOT NULL DEFAULT true,
    "applicationSelected" BOOLEAN NOT NULL DEFAULT true,
    "applicationNotSelected" BOOLEAN NOT NULL DEFAULT true,
    "applicationRemoved" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("discordId")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storeCode" TEXT,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Store_ownerDiscordId_idx" ON "Store"("ownerDiscordId");

-- CreateIndex
CREATE INDEX "Election_status_applicationsOpenAt_idx" ON "Election"("status", "applicationsOpenAt");

-- CreateIndex
CREATE INDEX "ElectionStore_storeCode_idx" ON "ElectionStore"("storeCode");

-- CreateIndex
CREATE INDEX "StoreApplication_applicantDiscordId_idx" ON "StoreApplication"("applicantDiscordId");

-- CreateIndex
CREATE INDEX "StoreApplication_storeCode_status_createdAt_idx" ON "StoreApplication"("storeCode", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreApplication_electionId_applicantDiscordId_key" ON "StoreApplication"("electionId", "applicantDiscordId");

-- CreateIndex
CREATE INDEX "ElectionVote_applicationId_idx" ON "ElectionVote"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVote_electionId_storeCode_voterDiscordId_key" ON "ElectionVote"("electionId", "storeCode", "voterDiscordId");

-- CreateIndex
CREATE INDEX "StoreVersion_storeCode_createdAt_idx" ON "StoreVersion"("storeCode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreVersion_storeCode_versionNumber_key" ON "StoreVersion"("storeCode", "versionNumber");

-- CreateIndex
CREATE INDEX "TemplateFile_storeCode_createdAt_idx" ON "TemplateFile"("storeCode", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ElectionStore" ADD CONSTRAINT "ElectionStore_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionStore" ADD CONSTRAINT "ElectionStore_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreApplication" ADD CONSTRAINT "StoreApplication_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreApplication" ADD CONSTRAINT "StoreApplication_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "StoreApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreVersion" ADD CONSTRAINT "StoreVersion_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateFile" ADD CONSTRAINT "TemplateFile_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

