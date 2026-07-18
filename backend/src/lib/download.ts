import { createReadStream } from "node:fs";
import type { FastifyReply } from "fastify";
import { fileExists } from "../services/file-storage.js";
import { notFound } from "./errors.js";

/** Stream a file to the client as an attachment, or 404 if it is gone. */
export async function streamDownload(reply: FastifyReply, filePath: string, downloadName: string): Promise<FastifyReply> {
  if (!(await fileExists(filePath))) throw notFound("file_missing", "The stored file could not be found");
  const asciiName = downloadName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(downloadName);
  reply.header("Content-Type", "application/octet-stream");
  reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`);
  return reply.send(createReadStream(filePath));
}
