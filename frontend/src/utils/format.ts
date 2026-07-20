import type { ElectionPhase, StoreStatus, VersionStatus } from "../api/client";

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const VERSION_COLORS: Record<VersionStatus, string> = {
  PENDING: "yellow",
  APPROVED: "teal",
  DECLINED: "red",
  PUBLISHED: "violet",
  SUPERSEDED: "gray",
};

const VERSION_LABELS: Record<VersionStatus, string> = {
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  DECLINED: "Declined",
  PUBLISHED: "Published (live)",
  SUPERSEDED: "Superseded",
};

export const versionColor = (status: VersionStatus) => VERSION_COLORS[status];
export const versionLabel = (status: VersionStatus) => VERSION_LABELS[status];

export function storeStatusColor(status: StoreStatus, statusLabel: string): string {
  if (status === "CLOSED") return "gray";
  if (status === "ELECTION") return "grape";
  if (statusLabel.startsWith("Live")) return "violet";
  if (statusLabel.startsWith("Approved")) return "teal";
  if (statusLabel.startsWith("Waiting")) return "yellow";
  if (statusLabel.includes("declined")) return "red";
  return "blue";
}

const PHASE_LABELS: Record<ElectionPhase, string> = {
  draft: "Draft",
  upcoming: "Starts soon",
  applications: "Applications open",
  review: "Applications closed",
  voting: "Voting open",
  tallying: "Results ready",
  closed: "Finished",
  cancelled: "Cancelled",
};

const PHASE_COLORS: Record<ElectionPhase, string> = {
  draft: "gray",
  upcoming: "blue",
  applications: "grape",
  review: "yellow",
  voting: "teal",
  tallying: "orange",
  closed: "gray",
  cancelled: "red",
};

export const phaseLabel = (phase: ElectionPhase) => PHASE_LABELS[phase];
export const phaseColor = (phase: ElectionPhase) => PHASE_COLORS[phase];

/** Coarse "2d 4h left" style countdown; precise enough at a one-minute refresh. */
export function timeLeft(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "any moment";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export const floorLabel = (floor: number) => (floor === 1 ? "1st floor" : floor === 2 ? "2nd floor" : `Floor ${floor}`);

/**
 * Store-style version identifier: `storename.version.dateofcreation`,
 * e.g. "A1.001.230425" — store code, 3-digit version number, YYMMDD creation date.
 */
export function versionIdentifier(code: string, versionNumber: number, createdAt: string): string {
  const d = new Date(createdAt);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${code}.${String(versionNumber).padStart(3, "0")}.${yy}${mm}${dd}`;
}
