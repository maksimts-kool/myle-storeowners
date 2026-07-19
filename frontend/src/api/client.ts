import axios from "axios";
import type { RoomSpec } from "../utils/room";

const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBaseUrl = `${appBasePath}/api`;

export const http = axios.create({ baseURL: apiBaseUrl, withCredentials: true });

export type Role = "game_owner" | "store_owner" | "member";
export type DebugRole = "GAME_OWNER" | "STORE_OWNER" | "MEMBER";
export type StoreStatus = "OPEN" | "CLOSED" | "ELECTION";
export type VersionStatus = "PENDING" | "APPROVED" | "DECLINED" | "PUBLISHED" | "SUPERSEDED";
export type ApplicationStatus = "APPLIED" | "SELECTED" | "NOT_SELECTED" | "REMOVED" | "CANCELLED";

export interface AuthUser {
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string | null;
}

export interface MeResponse {
  authenticated: boolean;
  user?: AuthUser;
  role?: Role;
  storeCodes?: string[];
  /** Only true for a real configured game owner, even during a lower-role preview. */
  canDebug?: boolean;
  debugMode?: { role: Role; storeCode?: string } | null;
}

export interface CurrentVersion {
  versionNumber: number;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

export interface LatestSubmission {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  createdAt: string;
}

export interface StoreSummary {
  code: string;
  floor: number;
  displayName: string;
  status: StoreStatus;
  ownerDiscordId: string | null;
  ownerDisplayName: string | null;
  storeIdentifier: string | null;
  room: RoomSpec | null;
  statusLabel: string;
  currentVersion: CurrentVersion | null;
  latestSubmission: LatestSubmission | null;
  hasTemplate: boolean;
  isOwner: boolean;
  canManage: boolean;
  canDownloadCurrent: boolean;
  canViewRestrictedFiles: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VerifiedMember {
  discordId: string;
  discordName: string;
  robloxUsername: string | null;
}

export interface VersionDto {
  id: string;
  versionNumber: number;
  status: VersionStatus;
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

export interface StoreDetail extends StoreSummary {
  versions: VersionDto[];
  templates: TemplateDto[];
}

export interface PendingItem {
  id: string;
  storeCode: string;
  storeName: string;
  versionNumber: number;
  status: VersionStatus;
  fileName: string;
  fileSize: number;
  note: string | null;
  uploadedByDiscordId: string;
  createdAt: string;
}

export interface StoreInput {
  code?: string;
  floor?: number;
  displayName?: string;
  status?: StoreStatus;
  ownerDiscordId?: string | null;
  initialVersion?: number;
  creationDate?: string;
  room?: RoomSpec | null; // null clears a stored layout
}

export interface NotificationPrefs {
  submissionReceived: boolean;
  reviewNeeded: boolean;
  submissionApproved: boolean;
  submissionDeclined: boolean;
  submissionPublished: boolean;
  applicationApplied: boolean;
  applicationSelected: boolean;
  applicationNotSelected: boolean;
  applicationRemoved: boolean;
}

export interface ElectionCandidate {
  id: string;
  displayName: string;
  robloxName: string | null;
  isCurrentUser: boolean;
  voteCount?: number;
}

export interface ElectionStore {
  code: string;
  displayName: string;
  floor: number;
  candidates: ElectionCandidate[];
  myVoteApplicationId: string | null;
}

export interface MyApplication {
  id: string;
  storeCode: string;
  storeName: string;
  status: ApplicationStatus;
  createdAt: string;
}

export interface ElectionsResponse {
  elections: ElectionStore[];
  myApplication: MyApplication | null;
  canApply: boolean;
}

export interface AdminApplication {
  id: string;
  storeCode: string;
  storeName: string;
  storeStatus: StoreStatus;
  applicantDiscordId: string;
  applicantDisplayName: string;
  applicantRobloxName: string | null;
  status: ApplicationStatus;
  voteCount: number;
  createdAt: string;
}

// --- Auth ---
export const getMe = () => http.get<MeResponse>("/auth/me").then((r) => r.data);
export const logout = () => http.post("/auth/logout").then((r) => r.data);
export const loginUrl = `${apiBaseUrl}/auth/login`;

// --- Stores (owner + admin) ---
export const getStores = () => http.get<{ stores: StoreSummary[] }>("/stores").then((r) => r.data.stores);
export const getStore = (code: string) => http.get<{ store: StoreDetail }>(`/stores/${code}`).then((r) => r.data.store);

export function uploadVersion(code: string, file: File, note: string): Promise<void> {
  const form = new FormData();
  if (note.trim()) form.append("note", note.trim()); // field must precede the file
  form.append("file", file);
  return http.post(`/stores/${code}/versions`, form).then(() => undefined);
}

// --- Download URLs (same-origin links carry the session cookie) ---
export const versionDownloadUrl = (code: string, id: string) => `${apiBaseUrl}/stores/${code}/versions/${id}/download`;
export const currentDownloadUrl = (code: string) => `${apiBaseUrl}/stores/${code}/current/download`;
export const templateDownloadUrl = (code: string, id?: string) =>
  `${apiBaseUrl}/stores/${code}/template/download${id ? `?id=${id}` : ""}`;

// --- Admin ---
export const getPending = () => http.get<{ pending: PendingItem[] }>("/admin/pending").then((r) => r.data.pending);
export const getVerifiedMembers = () =>
  http.get<{ members: VerifiedMember[] }>("/admin/verified-members").then((r) => r.data.members);
export const createStore = (input: StoreInput) =>
  http.post<{ store: StoreDetail }>("/admin/stores", input).then((r) => r.data.store);
export const updateStore = (code: string, input: StoreInput) =>
  http.patch<{ store: StoreDetail }>(`/admin/stores/${code}`, input).then((r) => r.data.store);
export const deleteStore = (code: string) => http.delete(`/admin/stores/${code}`).then((r) => r.data);
export const deleteVersion = (code: string, id: string) =>
  http.delete(`/admin/stores/${code}/versions/${id}`).then((r) => r.data);

export const reviewVersion = (
  code: string,
  id: string,
  action: "approve" | "decline" | "publish",
  reviewNote?: string,
) => http.post(`/admin/stores/${code}/versions/${id}/${action}`, { reviewNote }).then((r) => r.data);

export function uploadTemplate(code: string | null, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const url = code ? `/admin/stores/${code}/template` : "/admin/templates";
  return http.post(url, form).then(() => undefined);
}
export const deleteTemplate = (id: string) => http.delete(`/admin/templates/${id}`).then((r) => r.data);

// --- Elections ---
export const getElections = () => http.get<ElectionsResponse>("/applications/elections").then((r) => r.data);
export const applyForElection = (code: string) =>
  http.post<{ application: MyApplication }>(`/applications/elections/${code}/apply`).then((r) => r.data.application);
export const cancelMyApplication = () => http.delete("/applications/mine").then((r) => r.data);
export const voteForApplication = (id: string) => http.post(`/applications/${id}/vote`).then((r) => r.data);
export const undoElectionVote = (code: string) => http.delete(`/applications/elections/${code}/vote`).then((r) => r.data);

export const getAdminApplications = () =>
  http.get<{ applications: AdminApplication[] }>("/admin/applications").then((r) => r.data.applications);
export const resolveApplication = (id: string, action: "select" | "not-selected" | "remove") =>
  http.post(`/admin/applications/${id}/${action}`).then((r) => r.data);

// --- Admin-only role preview ---
export const setDebugRole = (input: { role: DebugRole; storeCode?: string }) =>
  http.post("/admin/debug-role", input).then((r) => r.data);
export const clearDebugRole = () => http.delete("/admin/debug-role").then((r) => r.data);

// --- Settings ---
export const getNotificationPrefs = () =>
  http.get<{ notifications: NotificationPrefs }>("/settings/notifications").then((r) => r.data.notifications);
export const updateNotificationPrefs = (input: Partial<NotificationPrefs>) =>
  http.patch<{ notifications: NotificationPrefs }>("/settings/notifications", input).then((r) => r.data.notifications);
