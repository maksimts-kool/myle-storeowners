import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authCookiePath, cookieIsSecure, publicBasePath } from "../config.js";
import type { RouteDeps } from "../deps.js";
import { sessionCookieOptions, SESSION_COOKIE } from "../auth/plugin.js";
import { buildAuthorizeUrl, exchangeCode, fetchDiscordUser } from "../auth/oauth.js";
import type { SessionUser } from "../types.js";

const STATE_COOKIE = "oauth_state";

function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=128`;
}

export function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { config, db } = deps;

  app.get("/api/auth/login", async (_request, reply) => {
    const state = randomBytes(24).toString("hex");
    reply.setCookie(STATE_COOKIE, state, {
      path: authCookiePath(config),
      httpOnly: true,
      sameSite: "lax",
      secure: cookieIsSecure(config),
      maxAge: 600,
    });
    return reply.redirect(buildAuthorizeUrl(config, state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/auth/callback",
    async (request, reply) => {
      const failure = (reason: string) =>
        reply.redirect(`${config.PUBLIC_BASE_URL}/?auth_error=${encodeURIComponent(reason)}`);

      if (request.query.error) return failure(request.query.error);
      const { code, state } = request.query;
      const expectedState = request.cookies[STATE_COOKIE];
      reply.clearCookie(STATE_COOKIE, { path: authCookiePath(config) });

      if (!code || !state || !expectedState || state !== expectedState) {
        return failure("invalid_state");
      }

      try {
        const accessToken = await exchangeCode(config, code);
        const profile = await fetchDiscordUser(accessToken);
        const payload: SessionUser = {
          sub: profile.id,
          username: profile.username,
          globalName: profile.globalName,
          avatar: profile.avatar,
        };
        const token = app.jwt.sign(payload);
        reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config));
        return reply.redirect(`${config.PUBLIC_BASE_URL}/`);
      } catch (error) {
        request.log.warn({ error }, "OAuth callback failed");
        return failure("login_failed");
      }
    },
  );

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: publicBasePath(config) });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    let user: SessionUser | null = null;
    try {
      user = await request.jwtVerify();
    } catch {
      return { authenticated: false };
    }

    const isAdmin = app.isAdmin(user.sub);
    const owned = await db.store.findMany({ where: { ownerDiscordId: user.sub }, select: { code: true } });
    const role = isAdmin ? "admin" : owned.length > 0 ? "owner" : "none";

    return {
      authenticated: true,
      user: {
        discordId: user.sub,
        username: user.username,
        globalName: user.globalName,
        avatar: user.avatar,
        avatarUrl: avatarUrl(user.sub, user.avatar),
      },
      role,
      storeCodes: owned.map((s) => s.code),
    };
  });
}
