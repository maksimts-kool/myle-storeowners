import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sessionCookieOptions, SESSION_COOKIE } from "../auth/plugin.js";
import type { RouteDeps } from "../deps.js";
import { notFound } from "../lib/errors.js";
import type { SessionUser } from "../types.js";

const debugRoleSchema = z.object({
  role: z.enum(["GAME_OWNER", "STORE_OWNER", "MEMBER"]),
  storeCode: z.string().trim().min(1).max(16).optional(),
}).superRefine((input, context) => {
  if (input.role === "STORE_OWNER" && !input.storeCode) {
    context.addIssue({ code: "custom", path: ["storeCode"], message: "Choose a store to preview as its owner" });
  }
});

function sessionPayload(user: SessionUser, debugRole?: SessionUser["debugRole"], debugStoreCode?: string): SessionUser {
  return {
    sub: user.sub,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    ...(debugRole ? { debugRole } : {}),
    ...(debugStoreCode ? { debugStoreCode } : {}),
  };
}

/** Real game owners can safely preview portal roles in their own signed session. */
export function registerDebugRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { config, db } = deps;
  // Do not register these endpoints on a publicly served portal. This also
  // means a production route cannot be reached by manually calling the API.
  if (!app.localDebugModeEnabled) return;
  // This deliberately uses the real-admin guard, rather than the effective
  // guard, so a member preview can always be switched back to game owner.
  const actualAdmin = { preHandler: app.requireAdmin };

  app.post("/api/admin/debug-role", actualAdmin, async (request, reply) => {
    const input = debugRoleSchema.parse(request.body);
    let storeCode: string | undefined;
    if (input.role === "STORE_OWNER") {
      storeCode = input.storeCode!.toUpperCase();
      const store = await db.store.findUnique({ where: { code: storeCode }, select: { code: true } });
      if (!store) throw notFound("store_not_found");
    }
    const payload = sessionPayload(request.user, input.role, storeCode);
    reply.setCookie(SESSION_COOKIE, app.jwt.sign(payload), sessionCookieOptions(config));
    return { ok: true };
  });

  app.delete("/api/admin/debug-role", actualAdmin, async (request, reply) => {
    // A fresh normal session also discards any stale/debug-only store code.
    const payload = sessionPayload(request.user);
    reply.setCookie(SESSION_COOKIE, app.jwt.sign(payload), sessionCookieOptions(config));
    return { ok: true };
  });
}
