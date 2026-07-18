import "@fastify/jwt";
import type { preHandlerHookHandler } from "fastify";

/** The signed session payload stored in the httpOnly cookie. */
export interface SessionUser {
  /** Discord user ID (the JWT subject). */
  sub: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler that verifies the session cookie; 401 when absent/invalid. */
    authenticate: preHandlerHookHandler;
    /** preHandler that requires an authenticated game-owner (admin); 403 otherwise. */
    requireAdmin: preHandlerHookHandler;
    /** Returns true when the Discord user ID is configured as a game owner. */
    isAdmin(discordId: string): boolean;
  }
}
