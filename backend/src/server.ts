import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import type { prisma as database } from "./db.js";
import { registerAuth } from "./auth/plugin.js";
import { HttpError } from "./lib/errors.js";
import { Notifier } from "./services/notifier.js";
import { RobloxIdentityService } from "./services/roblox-identity.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerStoreRoutes } from "./routes/stores.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerAdminApplicationRoutes, registerApplicationRoutes } from "./routes/applications.js";
import { registerDebugRoutes } from "./routes/debug.js";

function errorType(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function buildServer(config: Config, prisma: typeof database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: "info",
      redact: { paths: ["req.headers", "res.headers['set-cookie']"], censor: "[REDACTED]" },
    },
    bodyLimit: 1024 * 1024,
    trustProxy: config.TRUST_PROXY === "all" ? true : config.TRUST_PROXY === "loopback" ? "127.0.0.1/8" : false,
  });

  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 10 } });
  await registerAuth(app, config);

  const notifier = new Notifier(prisma, config, app.log);
  const robloxIdentity = new RobloxIdentityService(config, app.log);
  const deps = { config, db: prisma, notifier, robloxIdentity };

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch (error) {
      app.log.error({ operation: "readiness_check", errorType: errorType(error) }, "Readiness check failed");
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  registerAuthRoutes(app, deps);
  registerDebugRoutes(app, deps);
  registerStoreRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerApplicationRoutes(app, deps);
  registerAdminApplicationRoutes(app, deps);
  registerSettingsRoutes(app, deps);

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_payload", details: error.flatten() });
    }
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ error: "file_too_large", message: "The uploaded file is too large" });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? "request_error", message: err.message });
    }
    request.log.error({ operation: "request_handling", errorType: errorType(error) }, "Unhandled request error");
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}
