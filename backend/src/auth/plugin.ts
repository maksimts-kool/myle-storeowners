import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { cookieIsSecure } from "../config.js";
import { forbidden, unauthorized } from "../lib/errors.js";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

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
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(config),
    maxAge: SESSION_TTL_SECONDS,
  };
}
