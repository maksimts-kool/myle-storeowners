import type { Store, StoreVersion, TemplateFile } from "@prisma/client";
import type { prisma as database } from "../db.js";
import type { SessionUser } from "../types.js";
import { parseRoom, type RoomSpec } from "./room.js";

type Db = typeof database;

export type StoreWithFiles = Store & { versions: StoreVersion[]; templates: TemplateFile[] };

export interface VersionDto {
  id: string;
  versionNumber: number;
  status: StoreVersion["status"];
  fileName: string;
  fileSize: number;
  checksum: string | null;
  note: string | null;
  reviewNote: string | null;
  uploadedByDiscordId: string;
  reviewedByDiscordId: string | null;
  createdAt: string;
}

export interface TemplateDto {
  id: string;
  storeCode: string | null;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export interface StoreSummaryDto {
  code: string;
  floor: number;
  displayName: string;
  status: Store["status"];
  ownerDiscordId: string | null;
  ownerDisplayName: string | null;
  storeIdentifier: string | null;
  room: RoomSpec | null;
  statusLabel: string;
  currentVersion: { versionNumber: number; fileName: string; fileSize: number; createdAt: string } | null;
  latestSubmission: { id: string; versionNumber: number; status: StoreVersion["status"]; createdAt: string } | null;
  hasTemplate: boolean;
  isOwner: boolean;
  canManage: boolean;
  canDownloadCurrent: boolean;
  canViewRestrictedFiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreDetailDto extends StoreSummaryDto {
  versions: VersionDto[];
  templates: TemplateDto[];
}

const STORE_INCLUDE = {
  versions: { orderBy: { versionNumber: "desc" } },
  templates: { orderBy: { createdAt: "desc" } },
} as const;

export async function loadStore(db: Db, code: string): Promise<StoreWithFiles | null> {
  return db.store.findUnique({ where: { code }, include: STORE_INCLUDE });
}

export async function loadStoresForUser(db: Db, user: SessionUser, isAdmin: boolean): Promise<StoreWithFiles[]> {
  return db.store.findMany({
    include: STORE_INCLUDE,
    orderBy: [{ floor: "asc" }, { code: "asc" }],
  });
}

/** Highest-numbered version currently marked PUBLISHED (the live file), if any. */
export function currentPublishedVersion(store: StoreWithFiles): StoreVersion | null {
  // versions are ordered by versionNumber desc, so the first PUBLISHED is newest.
  return store.versions.find((v) => v.status === "PUBLISHED") ?? null;
}

/** The most recent submission of any status. */
export function latestVersion(store: StoreWithFiles): StoreVersion | null {
  return store.versions[0] ?? null;
}

export function deriveStatusLabel(store: StoreWithFiles): string {
  if (store.status === "CLOSED") return "Closed";
  if (store.status === "ELECTION") return "Election in progress";
  const latest = latestVersion(store);
  if (!latest) return "No file submitted yet";
  switch (latest.status) {
    case "PENDING":
      return "Waiting for review";
    case "APPROVED":
      return "Approved — waiting to be published";
    case "DECLINED":
      return "Last submission declined";
    case "PUBLISHED":
      return "Live in game";
    case "SUPERSEDED":
      return "Current file removed";
    default:
      return "Unknown";
  }
}

export function toVersionDto(v: StoreVersion): VersionDto {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    fileName: v.fileName,
    fileSize: Number(v.fileSize),
    checksum: v.checksum,
    note: v.note,
    reviewNote: v.reviewNote,
    uploadedByDiscordId: v.uploadedByDiscordId,
    reviewedByDiscordId: v.reviewedByDiscordId,
    createdAt: v.createdAt.toISOString(),
  };
}

export function toTemplateDto(t: TemplateFile): TemplateDto {
  return {
    id: t.id,
    storeCode: t.storeCode,
    fileName: t.fileName,
    fileSize: Number(t.fileSize),
    createdAt: t.createdAt.toISOString(),
  };
}

export function toStoreSummary(
  store: StoreWithFiles,
  user: SessionUser,
  isAdmin: boolean,
  effectiveOwner = store.ownerDiscordId === user.sub,
): StoreSummaryDto {
  const current = currentPublishedVersion(store);
  const latest = latestVersion(store);
  const isOwner = effectiveOwner;
  const canViewRestrictedFiles = isAdmin || isOwner;
  return {
    code: store.code,
    floor: store.floor,
    displayName: store.displayName,
    status: store.status,
    ownerDiscordId: store.ownerDiscordId,
    ownerDisplayName: store.ownerDisplayName,
    storeIdentifier: store.storeIdentifier,
    room: parseRoom(store.room),
    statusLabel: deriveStatusLabel(store),
    currentVersion: current
      ? {
          versionNumber: current.versionNumber,
          fileName: current.fileName,
          fileSize: Number(current.fileSize),
          createdAt: current.createdAt.toISOString(),
        }
      : null,
    latestSubmission: latest
      ? { id: latest.id, versionNumber: latest.versionNumber, status: latest.status, createdAt: latest.createdAt.toISOString() }
      : null,
    hasTemplate: store.templates.length > 0,
    isOwner,
    canManage: isAdmin,
    canDownloadCurrent: canViewRestrictedFiles,
    canViewRestrictedFiles,
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
  };
}

export function toStoreDetail(
  store: StoreWithFiles,
  user: SessionUser,
  isAdmin: boolean,
  effectiveOwner = store.ownerDiscordId === user.sub,
): StoreDetailDto {
  const isOwner = effectiveOwner;
  const canViewRestrictedFiles = isAdmin || isOwner;
  // Owners see the review note on their own submissions but not admin identities.
  const versions = canViewRestrictedFiles ? store.versions.map((v) => {
    const dto = toVersionDto(v);
    if (!isAdmin) dto.reviewedByDiscordId = null;
    return dto;
  }) : [];
  return {
    ...toStoreSummary(store, user, isAdmin, isOwner),
    versions,
    templates: canViewRestrictedFiles ? store.templates.map(toTemplateDto) : [],
    isOwner,
  };
}

/**
 * Floor derived from the store code: A* → 1, B* → 2, C* → 3, … (alphabet position).
 * Codes that don't start with a letter fall back to floor 1.
 */
export function floorForCode(code: string): number {
  const first = code.trim().charAt(0).toUpperCase();
  if (first < "A" || first > "Z") return 1;
  return Math.min(first.charCodeAt(0) - 64, 10);
}

/** Version embedded in an older manually-created store identifier, if valid. */
function identifierVersion(storeIdentifier: string | null): number {
  const match = storeIdentifier?.match(/^[^.]+\.(\d{1,3})\.\d{6}$/);
  const version = match?.[1] ? Number(match[1]) : 0;
  return Number.isInteger(version) && version > 0 && version <= 999 ? version : 0;
}

/** Next per-store version number (1-based, monotonic), after any initial store identifier. */
export async function nextVersionNumber(db: Db, store: Pick<Store, "code" | "startingVersion" | "storeIdentifier">): Promise<number> {
  const top = await db.storeVersion.findFirst({
    where: { storeCode: store.code },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return Math.max(top?.versionNumber ?? 0, store.startingVersion, identifierVersion(store.storeIdentifier)) + 1;
}
