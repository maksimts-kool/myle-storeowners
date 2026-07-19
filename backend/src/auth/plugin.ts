import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { cookieIsSecure, localDebugModeEnabled, publicBasePath } from "../config.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { SessionUser } from "../types.js";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type DebugRole = NonNullable<SessionUser["debugRole"]>;

/** A configured game owner may preview a lower portal role in their own session. */
export function activeDebugRole(app: FastifyInstance, request: FastifyRequest): DebugRole | null {
  if (!app.localDebugModeEnabled || !app.isAdmin(request.user.sub)) return null;
  return request.user.debugRole ?? null;
}

/** True only when the current request is acting as a game owner. */
export function isEffectiveAdmin(app: FastifyInstance, request: FastifyRequest): boolean {
  const debugRole = activeDebugRole(app, request);
  return app.isAdmin(request.user.sub) && (debugRole === null || debugRole === "GAME_OWNER");
}

/** True when the request may manage this specific store as its owner. */
export function isEffectiveStoreOwner(
  app: FastifyInstance,
  request: FastifyRequest,
  store: { code: string; ownerDiscordId: string | null },
): boolean {
  const debugRole = activeDebugRole(app, request);
  if (debugRole !== null) {
    return debugRole === "STORE_OWNER" && request.user.debugStoreCode === store.code;
  }
  return store.ownerDiscordId === request.user.sub;
}

/**
 * Registers cookie + JWT session handling and the auth guard decorators.
 * The session is a signed JWT carried in an httpOnly cookie so the API stays
 * stateless (no server-side session store).
 */
export async function registerAuth(app: FastifyInstance, config: Config): Promise<void> {
  const adminIds = new Set(config.ADMIN_DISCORD_IDS);

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.SESSION_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: `${SESSION_TTL_SECONDS}s` },
  });

  app.decorate("isAdmin", (discordId: string) => adminIds.has(discordId));
  app.decorate("localDebugModeEnabled", localDebugModeEnabled(config));

  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
  });

  app.decorate("requireAdmin", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
    if (!adminIds.has(request.user.sub)) throw forbidden("admin_only");
  });

  app.decorate("requireEffectiveAdmin", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
    if (!isEffectiveAdmin(app, request)) throw forbidden("admin_only");
  });
}

/** Options for the session cookie set after a successful OAuth login. */
export function sessionCookieOptions(config: Config): {
  path: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
} {
  return {
    path: publicBasePath(config),
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(config),
    maxAge: SESSION_TTL_SECONDS,
  };
}
