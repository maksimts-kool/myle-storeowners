import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { prisma } from "./db.js";
import { buildServer } from "./server.js";

const config = loadConfig();
await mkdir(path.resolve(config.STORE_FILES_DIR), { recursive: true });

const app = await buildServer(config, prisma);
await app.listen({ host: config.API_HOST, port: config.API_PORT });
app.log.info({ phase: "startup", host: config.API_HOST, port: config.API_PORT }, "Store owners API listening");

async function shutdown(signal: string): Promise<void> {
  app.log.info({ phase: "shutdown", signal }, "Shutdown started");
  await app.close();
  await prisma.$disconnect();
  app.log.info({ phase: "shutdown", signal }, "Shutdown completed");
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
