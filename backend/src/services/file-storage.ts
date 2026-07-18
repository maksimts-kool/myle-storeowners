import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { MultipartFile } from "@fastify/multipart";
import type { Config } from "../config.js";
import { badRequest, payloadTooLarge } from "../lib/errors.js";

const ALLOWED_EXTENSIONS = new Set([".rbxl", ".rbxlx"]);

export interface SavedFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  checksum: string;
}

/** Validate that an uploaded filename has an accepted Roblox place extension. */
export function assertAllowedExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw badRequest("invalid_file_type", "Only .rbxl or .rbxlx files are accepted");
  }
  return ext;
}

function storeRoot(config: Config): string {
  return path.resolve(config.STORE_FILES_DIR);
}

export function versionFilePath(config: Config, storeCode: string, versionId: string, ext: string): string {
  return path.join(storeRoot(config), sanitizeSegment(storeCode), "versions", `${versionId}${ext}`);
}

export function templateFilePath(config: Config, storeCode: string | null, templateId: string, ext: string): string {
  const scope = storeCode ? sanitizeSegment(storeCode) : "_global";
  return path.join(storeRoot(config), scope, "templates", `${templateId}${ext}`);
}

/** Reject path traversal in codes used as directory segments. */
function sanitizeSegment(segment: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw badRequest("invalid_store_code", "Store code contains illegal characters");
  return segment;
}

/**
 * Streams a multipart file to `destPath`, enforcing the byte cap and computing
 * a SHA-256 checksum in one pass. Cleans up the partial file on failure.
 */
export async function saveMultipartFile(
  config: Config,
  file: MultipartFile,
  destPath: string,
): Promise<SavedFile> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const hash = createHash("sha256");
  let bytes = 0;

  // A pass-through that hashes and counts bytes in the same pass as the write,
  // aborting as soon as the cap is exceeded. Using a Transform (rather than a
  // separate "data" listener) avoids the flowing-mode race that can drop the
  // first chunks before the write stream is attached.
  const meter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      bytes += chunk.length;
      if (bytes > config.MAX_UPLOAD_BYTES) {
        callback(payloadTooLarge("file_too_large", `File exceeds the ${config.MAX_UPLOAD_BYTES} byte limit`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(file.file, meter, createWriteStream(destPath));
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }

  // @fastify/multipart sets truncated when its own limit trips first.
  if (file.file.truncated) {
    await rm(destPath, { force: true });
    throw payloadTooLarge("file_too_large", `File exceeds the ${config.MAX_UPLOAD_BYTES} byte limit`);
  }

  return { filePath: destPath, fileName: file.filename, fileSize: bytes, checksum: hash.digest("hex") };
}

/** Delete a single stored file, ignoring a missing file. */
export async function deleteFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

/** Recursively delete every stored file for a store (used when a store is deleted). */
export async function deleteStoreDirectory(config: Config, storeCode: string): Promise<void> {
  const dir = path.join(storeRoot(config), sanitizeSegment(storeCode));
  await rm(dir, { recursive: true, force: true });
}

/** Confirm a stored file still exists on disk before attempting to serve it. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}
