-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('APPLIED', 'SELECTED', 'NOT_SELECTED', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."StoreStatus" AS ENUM ('OPEN', 'CLOSED', 'ELECTION');

-- CreateEnum
CREATE TYPE "public"."VersionStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'PUBLISHED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "public"."ElectionApplicationLock" (
    "discordId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionApplicationLock_pkey" PRIMARY KEY ("discordId")
);

-- CreateTable
CREATE TABLE "public"."ElectionVote" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "voterDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationLog" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storeCode" TEXT,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "discordId" TEXT NOT NULL,
    "submissionReceived" BOOLEAN NOT NULL DEFAULT true,
    "reviewNeeded" BOOLEAN NOT NULL DEFAULT true,
    "submissionApproved" BOOLEAN NOT NULL DEFAULT true,
    "submissionDeclined" BOOLEAN NOT NULL DEFAULT true,
    "submissionPublished" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "applicationApplied" BOOLEAN NOT NULL DEFAULT true,
    "applicationNotSelected" BOOLEAN NOT NULL DEFAULT true,
    "applicationRemoved" BOOLEAN NOT NULL DEFAULT true,
    "applicationSelected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("discordId")
);

-- CreateTable
CREATE TABLE "public"."Store" (
    "code" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "public"."StoreStatus" NOT NULL DEFAULT 'OPEN',
    "ownerDiscordId" TEXT,
    "ownerDisplayName" TEXT,
    "storeIdentifier" TEXT,
    "startingVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "room" JSONB,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."StoreApplication" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "applicantDiscordId" TEXT NOT NULL,
    "applicantDisplayName" TEXT NOT NULL,
    "applicantRobloxName" TEXT,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByDiscordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreVersion" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "public"."VersionStatus" NOT NULL DEFAULT 'PENDING',
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
CREATE TABLE "public"."TemplateFile" (
    "id" TEXT NOT NULL,
    "storeCode" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "uploadedByDiscordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElectionVote_applicationId_idx" ON "public"."ElectionVote"("applicationId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVote_storeCode_voterDiscordId_key" ON "public"."ElectionVote"("storeCode" ASC, "voterDiscordId" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "public"."NotificationLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "Store_ownerDiscordId_idx" ON "public"."Store"("ownerDiscordId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreApplication_applicantDiscordId_key" ON "public"."StoreApplication"("applicantDiscordId" ASC);

-- CreateIndex
CREATE INDEX "StoreApplication_storeCode_status_createdAt_idx" ON "public"."StoreApplication"("storeCode" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "StoreVersion_storeCode_createdAt_idx" ON "public"."StoreVersion"("storeCode" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreVersion_storeCode_versionNumber_key" ON "public"."StoreVersion"("storeCode" ASC, "versionNumber" ASC);

-- CreateIndex
CREATE INDEX "TemplateFile_storeCode_createdAt_idx" ON "public"."TemplateFile"("storeCode" ASC, "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "public"."ElectionVote" ADD CONSTRAINT "ElectionVote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."StoreApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ElectionVote" ADD CONSTRAINT "ElectionVote_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "public"."Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreApplication" ADD CONSTRAINT "StoreApplication_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "public"."Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreVersion" ADD CONSTRAINT "StoreVersion_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "public"."Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TemplateFile" ADD CONSTRAINT "TemplateFile_storeCode_fkey" FOREIGN KEY ("storeCode") REFERENCES "public"."Store"("code") ON DELETE CASCADE ON UPDATE CASCADE;

