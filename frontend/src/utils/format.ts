import type { StoreStatus, VersionStatus } from "../api/client";

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
  if (statusLabel.startsWith("Live")) return "violet";
  if (statusLabel.startsWith("Approved")) return "teal";
  if (statusLabel.startsWith("Waiting")) return "yellow";
  if (statusLabel.includes("declined")) return "red";
  return "blue";
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
